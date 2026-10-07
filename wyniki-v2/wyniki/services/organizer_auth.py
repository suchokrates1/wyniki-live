"""Sessions for the people who run a series.

Salts (next to those in api_auth.py, never mixed):
- organizer-access: a signed-in account. Only the account id is in it; which series the
  person may touch is read on every request, so taking someone off a series works at once.
- account-invite: the link that lets a person set their password. It names a piece of the
  current password hash, so setting a password spends the link.

Unlike the admin guard, this one stays on under TESTING: the tests prove the walls.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import date

from flask import g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from ..config import settings
from ..database import accounts, series

INVITE_MAX_AGE_SECONDS = 72 * 3600
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES = 5

_failures: dict[str, deque] = defaultdict(deque)


def _serializer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt=salt)


def session_max_age_seconds() -> int:
    return int(settings.admin_session_ttl_hours) * 3600


def issue_organizer_token(account_id: int) -> str:
    return _serializer("organizer-access").dumps({"aid": int(account_id)})


def issue_invite_token(account_id: int) -> str:
    return _serializer("account-invite").dumps({"aid": int(account_id), "pw": accounts.password_fingerprint(account_id) or ""})


def read_invite_token(token: str) -> int | None:
    """The account an invitation is for, or None when it expired, was spent or is forged."""
    try:
        payload = _serializer("account-invite").loads(token, max_age=INVITE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    account_id = int(payload.get("aid") or 0)
    if accounts.password_fingerprint(account_id) != payload.get("pw"):
        return None
    return account_id


# ----- throttling sign-in attempts (per address and per client) -----

def _client() -> str:
    return request.headers.get("CF-Connecting-IP") or request.remote_addr or "?"


def _recent(key: str) -> deque:
    stamps = _failures[key]
    cutoff = time.monotonic() - LOGIN_WINDOW_SECONDS
    while stamps and stamps[0] < cutoff:
        stamps.popleft()
    return stamps


def login_blocked(email: str) -> bool:
    return any(len(_recent(key)) >= LOGIN_MAX_FAILURES for key in (f"e:{email}", f"c:{_client()}"))


def note_login_failure(email: str) -> None:
    now = time.monotonic()
    for key in (f"e:{email}", f"c:{_client()}"):
        _recent(key).append(now)


def forget_login_failures(email: str) -> None:
    _failures.pop(f"e:{email}", None)


def reset_throttle() -> None:
    _failures.clear()


# ----- the guard -----

def _bearer() -> str:
    header = request.headers.get("Authorization", "")
    return header[7:].strip() if header.startswith("Bearer ") else ""


def require_organizer():
    """Before every organizer request: a live account, kept in g.account with its series."""
    token = _bearer()
    if not token:
        return jsonify({"error": "Organizer authorization required"}), 401
    try:
        payload = _serializer("organizer-access").loads(token, max_age=session_max_age_seconds())
    except SignatureExpired:
        return jsonify({"error": "Organizer session expired"}), 401
    except BadSignature:
        return jsonify({"error": "Invalid organizer session"}), 401
    account = accounts.get_account(int(payload.get("aid") or 0))
    if not account or account["disabled"]:
        return jsonify({"error": "Invalid organizer session"}), 401
    g.account = account
    g.series = series.series_of_account(account["id"])
    return None


def series_ids() -> list[int]:
    return [item["id"] for item in getattr(g, "series", [])]


def require_series(series_id: int):
    """403 unless the signed-in person is on this series."""
    if int(series_id) not in series_ids():
        return jsonify({"error": "Not your series"}), 403
    return None


def require_series_tournament(tournament_id: int):
    """403 unless the tournament belongs to one of the person's series."""
    if not series.tournament_in_series(int(tournament_id), series_ids()):
        return jsonify({"error": "Not a tournament of your series"}), 403
    return None


# ----- the subscription: past its date a series is read only -----

def series_expired(item: dict) -> bool:
    until = (item or {}).get("valid_until") or ""
    return bool(until) and until < date.today().isoformat()


def tournament_writable(tournament_id: int) -> bool:
    """True while one of the person's series that ranks this tournament is paid up."""
    return any(
        not series_expired(item) and series.tournament_in_series(int(tournament_id), [item["id"]])
        for item in getattr(g, "series", [])
    )


def require_paid_up(series_id: int | None = None, tournament_id: int | None = None):
    if tournament_id is not None:
        ok = tournament_writable(tournament_id)
    elif series_id is not None:
        ok = not series_expired(next((item for item in g.series if item["id"] == int(series_id)), {}))
    else:
        ok = any(not series_expired(item) for item in getattr(g, "series", []))
    return None if ok else (jsonify({"error": "Subscription expired"}), 403)
