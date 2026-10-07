"""Who changed what in the admin: every successful change under the admin guard goes to the
change log the organizer panel already keeps, under the administrator's own account."""
from __future__ import annotations

from flask import Blueprint, Flask, g, jsonify, request

from ..database import accounts
from ..database.series_records import record, recent_changes

blueprint = Blueprint("admin_log", __name__, url_prefix="/admin/api")
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
TOURNAMENT_ARGS = ("tournament_id", "tid")


def _payload() -> dict:
    if request.is_json:
        body = request.get_json(silent=True)
        return body if isinstance(body, dict) else {"items": body}
    return request.form.to_dict()


def install(app: Flask) -> None:
    @app.after_request
    def log_admin_change(response):
        account_id = g.get("admin_account_id")
        if account_id is None or request.method not in MUTATING or response.status_code >= 400:
            return response
        args = dict(request.view_args or {})
        tournament_id = next((args.pop(key) for key in TOURNAMENT_ARGS if key in args), None)
        account = accounts.get_account(account_id) or {"id": account_id, "email": ""}
        detail = {"method": request.method, "path": request.path, **args, **_payload()}
        record(account, f"admin.{request.endpoint or 'unknown'}", tournament_id, detail)
        return response


@blueprint.route("/audit", methods=["GET"])
def change_log():
    limit = max(1, min(request.args.get("limit", default=200, type=int), 500))
    return jsonify(recent_changes(limit))
