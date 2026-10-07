"""The organizer's API: sign-in, the invitation, and what the person may see.

Every route except sign-in and the invitation passes require_organizer first, and
anything about a series or a tournament checks it is one of that person's series.
"""
from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from ..database import accounts, series
from ..services import organizer_auth as auth

blueprint = Blueprint("organizer", __name__, url_prefix="/organizer/api")

OPEN_ENDPOINTS = {"organizer.sign_in", "organizer.invite_info", "organizer.invite_accept"}


@blueprint.before_request
def guard():
    if request.endpoint in OPEN_ENDPOINTS:
        return None
    return auth.require_organizer()


def _session(account: dict) -> dict:
    return {"token": auth.issue_organizer_token(account["id"]), "expires_in": auth.session_max_age_seconds()}


@blueprint.route("/auth", methods=["POST"])
def sign_in():
    data = request.get_json(silent=True) or {}
    email = accounts.normalize_email(data.get("email"))
    password = str(data.get("password") or "")
    if auth.login_blocked(email):
        return jsonify({"error": "Too many attempts"}), 429
    account = accounts.verify_login(email, password) if email and password else None
    if not account:
        auth.note_login_failure(email)
        return jsonify({"error": "Invalid e-mail or password"}), 403
    auth.forget_login_failures(email)
    return jsonify(_session(account))


@blueprint.route("/invite/<token>", methods=["GET"])
def invite_info(token: str):
    account_id = auth.read_invite_token(token)
    account = accounts.get_account(account_id) if account_id else None
    if not account or account["disabled"]:
        return jsonify({"error": "Invitation expired or used"}), 410
    names = [item["name"] for item in series.series_of_account(account["id"])]
    return jsonify({"email": account["email"], "name": account["name"], "series": names, "min_length": accounts.MIN_PASSWORD_LENGTH})


@blueprint.route("/invite/<token>", methods=["POST"])
def invite_accept(token: str):
    account_id = auth.read_invite_token(token)
    account = accounts.get_account(account_id) if account_id else None
    if not account or account["disabled"]:
        return jsonify({"error": "Invitation expired or used"}), 410
    password = str((request.get_json(silent=True) or {}).get("password") or "")
    if len(password) < accounts.MIN_PASSWORD_LENGTH:
        return jsonify({"error": "Password too short", "min_length": accounts.MIN_PASSWORD_LENGTH}), 400
    accounts.set_password(account["id"], password)
    return jsonify(_session(account))


@blueprint.route("/me", methods=["GET"])
def me():
    return jsonify({
        "account": {key: g.account[key] for key in ("id", "email", "name")},
        "series": [{**item, "tournaments": series.series_tournaments(item["id"])} for item in g.series],
    })


@blueprint.route("/series/<int:series_id>/tournaments", methods=["GET"])
def series_tournament_list(series_id: int):
    denied = auth.require_series(series_id)
    if denied:
        return denied
    return jsonify(series.series_tournaments(series_id))
