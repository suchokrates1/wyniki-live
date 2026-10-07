"""Administrator accounts: sign-in with e-mail and password, the password set from a mailed
link, and the list of administrators in System.

/auth, /forgot and /invite/<token> are open (app.py lets them through); the rest sits
behind the admin guard, which keeps the signed-in account in g.admin_account_id.
"""
from __future__ import annotations

from hmac import compare_digest

from flask import Blueprint, g, jsonify, request

from ..config import settings
from ..database import accounts, admins
from ..services import login_throttle
from ..services.admin_mails import send_admin_mail
from ..services.api_auth import issue_admin_token
from ..services.organizer_auth import read_invite_token

blueprint = Blueprint("admin_accounts", __name__, url_prefix="/admin/api")
OPEN_PATHS = ("/admin/api/auth", "/admin/api/forgot")
OPEN_PREFIX = "/admin/api/invite/"


def _session(account_id: int | None) -> dict:
    return {"token": issue_admin_token(account_id), "expires_in": settings.admin_session_ttl_hours * 3600}


@blueprint.route("/auth", methods=["POST"])
def sign_in():
    refused = login_throttle.refusal("admin")
    if refused:
        return refused
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    if not admins.active_admins_with_password():
        # until the first administrator has a password, the shared one still opens the door
        if not settings.admin_password:
            return jsonify({"error": "Admin API is not configured"}), 503
        if password and compare_digest(password, settings.admin_password):
            login_throttle.forget("admin")
            return jsonify(_session(None))
    else:
        account = accounts.verify_login(str(payload.get("email") or ""), password) if password else None
        if account and admins.is_active_admin(account["id"]):
            login_throttle.forget("admin")
            return jsonify(_session(account["id"]))
    login_throttle.note_failure("admin")
    return jsonify({"error": "Invalid e-mail or password"}), 403


@blueprint.route("/forgot", methods=["POST"])
def forgot():
    """A new-password link to the address if it is an administrator's; the answer never says."""
    refused = login_throttle.refusal("admin-forgot")
    if refused:
        return refused
    login_throttle.note_failure("admin-forgot")
    account = accounts.get_account_by_email(str((request.get_json(silent=True) or {}).get("email") or ""))
    if account and admins.is_active_admin(account["id"]):
        send_admin_mail("reset", account)
    return jsonify({"sent": True})


def _invited(token: str):
    account_id = read_invite_token(token)
    account = accounts.get_account(account_id) if account_id else None
    return account if account and admins.is_active_admin(account["id"]) else None


@blueprint.route("/invite/<token>", methods=["GET"])
def invite_info(token: str):
    account = _invited(token)
    if not account:
        return jsonify({"error": "Invitation expired or used"}), 410
    return jsonify({"email": account["email"], "name": account["name"], "min_length": accounts.MIN_PASSWORD_LENGTH})


@blueprint.route("/invite/<token>", methods=["POST"])
def invite_accept(token: str):
    account = _invited(token)
    if not account:
        return jsonify({"error": "Invitation expired or used"}), 410
    password = str((request.get_json(silent=True) or {}).get("password") or "")
    if len(password) < accounts.MIN_PASSWORD_LENGTH:
        return jsonify({"error": "Password too short", "min_length": accounts.MIN_PASSWORD_LENGTH}), 400
    accounts.set_password(account["id"], password)
    return jsonify(_session(account["id"]))


# ----- the list, behind the guard -----

def _me() -> int | None:
    return g.get("admin_account_id")


@blueprint.route("/admins", methods=["GET"])
def list_all():
    return jsonify({"admins": admins.list_admins(), "me": _me(),
                    "shared_password": not admins.active_admins_with_password()})


@blueprint.route("/admins", methods=["POST"])
def add():
    data = request.get_json(silent=True) or {}
    email = accounts.normalize_email(data.get("email"))
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "A valid e-mail is required"}), 400
    account_id = accounts.ensure_account(email, str(data.get("name") or ""))
    admins.set_admin(account_id, True)
    return jsonify(_invite(account_id)), 201


@blueprint.route("/admins/<int:account_id>/invite", methods=["POST"])
def reinvite(account_id: int):
    if not admins.is_active_admin(account_id):
        return jsonify({"error": "Administrator not found"}), 404
    return jsonify(_invite(account_id))


def _invite(account_id: int) -> dict:
    account = accounts.get_account(account_id)
    mailed, link = send_admin_mail("invite", account)
    return {"account": account, "invite_url": link, "emailed": mailed}


@blueprint.route("/admins/<int:account_id>", methods=["DELETE"])
def remove(account_id: int):
    """Takes the admin role away (the account stays for its series). Never your own, never the last."""
    if account_id == _me():
        return jsonify({"error": "Not your own account"}), 409
    others = [row for row in admins.list_admins() if row["id"] != account_id and row["has_password"] and not row["disabled"]]
    if not others:
        return jsonify({"error": "The last administrator stays"}), 409
    if not admins.set_admin(account_id, False):
        return jsonify({"error": "Administrator not found"}), 404
    return jsonify({"success": True})
