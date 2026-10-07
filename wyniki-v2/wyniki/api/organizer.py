"""The organizer's API: sign-in, the invitation, and what the person may see.

Every route except sign-in and the invitation passes require_organizer first, and
anything about a series or a tournament checks it is one of that person's series.
"""
from __future__ import annotations

from flask import g, jsonify, request

from ..database import accounts, series
from ..database.series_plan import contact_email
from ..services import organizer_auth as auth
from ..services import series_logo
from .organizer_common import guarded_blueprint

OPEN_ENDPOINTS = frozenset({"organizer.sign_in", "organizer.invite_info", "organizer.invite_accept", "organizer.contact"})
blueprint = guarded_blueprint("organizer", "/organizer/api", open_endpoints=OPEN_ENDPOINTS,
                              unpaid_writes=frozenset({"organizer.me_update"}))


def _session(account: dict) -> dict:
    return {"token": auth.issue_organizer_token(account["id"]), "expires_in": auth.session_max_age_seconds()}


@blueprint.route("/contact", methods=["GET"])
def contact():
    """Where organizers write; the sign-in page names it before anyone is signed in."""
    return jsonify({"contact_email": contact_email()})


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
    return jsonify({"email": account["email"], "name": account["name"], "language": account["language"],
                    "series": names, "min_length": accounts.MIN_PASSWORD_LENGTH})


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
        "contact_email": contact_email(),
        "account": {key: g.account[key] for key in ("id", "email", "name", "language")},
        "series": [{**item, "tournaments": series.series_tournaments(item["id"])} for item in g.series],
    })


@blueprint.route("/me", methods=["PUT", "PATCH"])
def me_update():
    """The person's own language: the panel's and that of every mail they get."""
    language = accounts.set_language(g.account["id"], (request.get_json(silent=True) or {}).get("language"))
    return jsonify({"language": language})


@blueprint.route("/series/<int:series_id>/tournaments", methods=["GET"])
def series_tournament_list(series_id: int):
    return jsonify(series.series_tournaments(series_id))


@blueprint.route("/series/<int:series_id>/logo", methods=["POST"])
def series_logo_upload(series_id: int):
    """The series' logo, shown in this panel and next to its tournaments on the public page."""
    item = series.get_series(series_id)
    field = series_logo.field_for(request.args.get("variant"))
    body, status = series_logo.save(series_id, item["slug"], request.files.get("logo"), field)
    return jsonify(body), status


@blueprint.route("/series/<int:series_id>/logo", methods=["DELETE"])
def series_logo_remove(series_id: int):
    return jsonify(series_logo.remove(series_id, series_logo.field_for(request.args.get("variant"))))
