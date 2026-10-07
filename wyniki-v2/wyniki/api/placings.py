"""Final results of a tournament played outside blindtennis.app: the organizer (and the admin)
set each entered player's band; the public page reads them in place of a bracket."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..database import fetch_tournament
from ..database import final_placings as fp
from ..utils import json_no_cache
from .organizer_common import guarded_blueprint

organizer_blueprint = guarded_blueprint("organizer_placings", "/organizer/api")
admin_blueprint = Blueprint("admin_placings", __name__, url_prefix="/admin/api/tournaments")
public_blueprint = Blueprint("public_placings", __name__, url_prefix="/api/tournament")


def _state(tournament_id: int) -> dict:
    return {"external": fp.is_external(tournament_id), "bands": list(fp.BANDS), "placings": fp.placings(tournament_id)}


def _save(tournament_id: int):
    body = request.get_json(silent=True) or {}
    if "external" in body:
        fp.set_external(tournament_id, bool(body["external"]))
    if isinstance(body.get("placings"), list):
        fp.save(tournament_id, body["placings"])
    return jsonify(_state(tournament_id))


@organizer_blueprint.route("/tournaments/<int:tournament_id>/placings", methods=["GET"])
def placings_get(tournament_id: int):
    return jsonify(_state(tournament_id))


@organizer_blueprint.route("/tournaments/<int:tournament_id>/placings", methods=["PUT"])
def placings_save(tournament_id: int):
    return _save(tournament_id)


@admin_blueprint.route("/<int:tournament_id>/placings", methods=["GET", "PUT"])
def admin_placings(tournament_id: int):
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    return _save(tournament_id) if request.method == "PUT" else jsonify(_state(tournament_id))


@public_blueprint.route("/<int:tournament_id>/placings", methods=["GET"])
def public_placings(tournament_id: int):
    """Only set bands, and only of a tournament the public may see; no ids beyond the profile's."""
    from .brackets import _public_tournament_or_404

    tournament, error = _public_tournament_or_404(tournament_id)
    if error:
        return error
    rows = [
        {key: row[key] for key in ("global_player_id", "name", "category", "country", "band")}
        for row in fp.placings(tournament["id"]) if row["band"]
    ]
    return json_no_cache({"external": fp.is_external(tournament["id"]), "placings": rows})
