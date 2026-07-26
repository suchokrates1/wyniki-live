"""Signed sessions and rollout guards for court, administrator, and office APIs.

Salt conventions (never mix):
- court-session
- admin-access
- office-access

HTTP status convention:
- 401: missing / expired / invalid signature
- 403: valid token but wrong binding (court/slot/tournament) or wrong password
"""
from __future__ import annotations

from hmac import compare_digest
from datetime import datetime, timedelta, timezone

from flask import jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from ..config import logger, settings

OFFICE_STREAM_COOKIE_PREFIX = "office_stream_"
_OFFICE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24


def _serializer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt=salt)


def issue_court_token(kort_id: str) -> str:
    return _serializer("court-session").dumps({"kort_id": str(kort_id)})


def issue_admin_token() -> str:
    return _serializer("admin-access").dumps({"role": "admin"})


def issue_office_token(slot: int, tournament_id: int) -> str:
    return _serializer("office-access").dumps(
        {"slot": int(slot), "tournament_id": int(tournament_id)}
    )


def office_stream_cookie_name(slot: int) -> str:
    return f"{OFFICE_STREAM_COOKIE_PREFIX}{int(slot)}"


def court_session_expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=settings.court_session_ttl_hours)).isoformat()


def _bearer_token() -> str:
    header = (request.headers.get("Authorization") or "").strip()
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


def _office_token_from_request(slot: int) -> str:
    bearer = _bearer_token()
    if bearer:
        return bearer
    return (
        request.headers.get("X-Office-Token")
        or request.cookies.get(office_stream_cookie_name(slot))
        or request.args.get("token")
        or ""
    ).strip()


def _in_court_grace_period() -> bool:
    return datetime.now(timezone.utc) < settings.court_auth_grace_until


def require_court_access(kort_id: str | None):
    """Validate a token bound to the selected court or allow legacy clients temporarily."""
    normalized = str(kort_id or "").strip()
    token = _bearer_token()
    if token:
        try:
            payload = _serializer("court-session").loads(
                token, max_age=settings.court_session_ttl_hours * 60 * 60
            )
        except SignatureExpired:
            return jsonify({"error": "Court session expired"}), 401
        except BadSignature:
            return jsonify({"error": "Invalid court session"}), 401
        if str(payload.get("kort_id") or "") != normalized:
            return jsonify({"error": "Court session does not match this court"}), 403
        return None
    if _in_court_grace_period():
        logger.warning(
            "legacy_unauthed_umpire_request",
            endpoint=request.endpoint,
            method=request.method,
            kort_id=normalized,
            app_code=request.headers.get("X-TennisReferee-App-Code"),
            client_ip=request.headers.get("CF-Connecting-IP") or request.remote_addr,
        )
        return None
    return jsonify({"error": "Court authorization required"}), 401


def admin_login_response():
    if not settings.admin_password:
        return jsonify({"error": "Admin API is not configured"}), 503
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    # ADMIN_PASSWORD is deployed as a plaintext environment secret.
    if not password or not compare_digest(password, settings.admin_password):
        return jsonify({"error": "Invalid administrator password"}), 403
    return jsonify({"token": issue_admin_token(), "expires_in": settings.admin_session_ttl_hours * 3600})


def require_admin_access() -> tuple | None:
    token = _bearer_token()
    if not token:
        return jsonify({"error": "Administrator authorization required"}), 401
    try:
        payload = _serializer("admin-access").loads(
            token, max_age=settings.admin_session_ttl_hours * 60 * 60
        )
    except SignatureExpired:
        return jsonify({"error": "Administrator session expired"}), 401
    except BadSignature:
        return jsonify({"error": "Invalid administrator session"}), 401
    if payload.get("role") != "admin":
        return jsonify({"error": "Invalid administrator session"}), 401
    return None


def require_office_access(slot: int, tournament_id: int) -> tuple | None:
    """Validate an office token bound to slot + tournament_id."""
    token = _office_token_from_request(slot)
    if not token:
        return jsonify({"error": "Office authorization required"}), 401
    try:
        payload = _serializer("office-access").loads(
            token, max_age=_OFFICE_SESSION_MAX_AGE_SECONDS
        )
    except SignatureExpired:
        return jsonify({"error": "Office session expired"}), 401
    except BadSignature:
        return jsonify({"error": "Invalid office session"}), 401
    if int(payload.get("slot") or 0) != int(slot) or int(payload.get("tournament_id") or 0) != int(
        tournament_id
    ):
        return jsonify({"error": "Office session no longer matches active tournament"}), 403
    return None
