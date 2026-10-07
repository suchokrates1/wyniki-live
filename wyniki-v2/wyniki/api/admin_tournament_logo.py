"""Either version of a tournament's logo, set on its own. Behind the admin guard in app.py."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..database import fetch_tournament
from ..services import tournament_logo

blueprint = Blueprint("admin_tournament_logo", __name__, url_prefix="/admin/api/tournaments")


@blueprint.route("/<int:tournament_id>/logo", methods=["POST"])
def upload(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    field = tournament_logo.field_for(request.args.get("variant"))
    body, status = tournament_logo.save(tournament_id, request.files.get("logo"), field)
    return jsonify(body), status


@blueprint.route("/<int:tournament_id>/logo", methods=["DELETE"])
def remove(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    return jsonify(tournament_logo.remove(tournament_id, tournament_logo.field_for(request.args.get("variant"))))
