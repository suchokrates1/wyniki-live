"""Public profile corrections, and the admin list of the ones still open."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..database.profile_reports import close_report, open_reports
from ..services.profile_reports import submit_report

public_blueprint = Blueprint("profile_reports_public", __name__, url_prefix="/api/players")
admin_blueprint = Blueprint("profile_reports_admin", __name__, url_prefix="/admin/api/profile-reports")


@public_blueprint.route("/reports", methods=["POST"])
def create_report():
    body, status = submit_report(request.get_json(silent=True) or {})
    return jsonify(body), status


@admin_blueprint.route("", methods=["GET"])
def list_open():
    return jsonify(open_reports())


@admin_blueprint.route("/<int:report_id>/done", methods=["POST"])
def mark_done(report_id: int):
    if not close_report(report_id):
        return jsonify({"error": "Report not found or already done"}), 404
    return jsonify({"ok": True})
