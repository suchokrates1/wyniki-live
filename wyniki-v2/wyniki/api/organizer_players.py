"""The organizer's players: a tournament's entries, and the shared player base.

The base is shared by every tournament on the site, so an organizer sees only what it
takes to recognise a person (no date of birth, no notes, no photo) and may correct any
player, a class after a medical for instance. A change to someone who also played
outside the person's series goes to the admin's review queue, with the old values kept.
"""
from __future__ import annotations

from flask import g, jsonify, request

from ..database import entries_of_global_player, fetch_players, get_row, search_global_players, series, tournament_counts_for_players
from ..database.series_records import queue_player_review
from ..db_models import GlobalPlayer
from ..services import tournament_entries
from .organizer_common import guarded_blueprint

blueprint = guarded_blueprint("organizer_players", "/organizer/api")

PUBLIC_FIELDS = ("id", "first_name", "last_name", "gender", "country", "category")
EDITABLE = ("first_name", "last_name", "gender", "country", "category", "birth_date",
            "classification_date", "classification_status", "classification_note")


def _json() -> dict:
    return request.get_json(silent=True) or {}


def _answer(result):
    body, status = result
    return jsonify(body), status


# ----- entries -----

@blueprint.route("/tournaments/<int:tournament_id>/players", methods=["GET"])
def entries(tournament_id: int):
    return jsonify(fetch_players(tournament_id))


@blueprint.route("/tournaments/<int:tournament_id>/players", methods=["POST"])
def entry_add(tournament_id: int):
    return _answer(tournament_entries.add_entry(tournament_id, _json()))


@blueprint.route("/tournaments/<int:tournament_id>/players/<int:player_id>", methods=["PUT"])
def entry_update(tournament_id: int, player_id: int):
    return _answer(tournament_entries.update_entry(tournament_id, player_id, _json()))


@blueprint.route("/tournaments/<int:tournament_id>/players/<int:player_id>", methods=["DELETE"])
def entry_delete(tournament_id: int, player_id: int):
    return _answer(tournament_entries.delete_entry(tournament_id, player_id))


@blueprint.route("/tournaments/<int:tournament_id>/players/parse-import", methods=["POST"])
def entry_parse_import(tournament_id: int):
    return _answer(tournament_entries.parse_import(tournament_id, _json()))


@blueprint.route("/tournaments/<int:tournament_id>/players/bulk", methods=["POST"])
def entry_bulk(tournament_id: int):
    return _answer(tournament_entries.bulk_import(tournament_id, _json()))


@blueprint.route("/tournaments/<int:tournament_id>/players/add-global", methods=["POST"])
def entry_add_global(tournament_id: int):
    return _answer(tournament_entries.add_global_entry(tournament_id, _json()))


# ----- the shared base -----

def _public(gp: GlobalPlayer, counts: dict[int, int] | None = None) -> dict:
    data = gp.to_dict()
    row = {key: data.get(key) or "" for key in PUBLIC_FIELDS}
    row["id"] = gp.id
    if counts is not None:
        row["tournaments_count"] = counts.get(gp.id, 0)
    return row


@blueprint.route("/players", methods=["GET"])
def search():
    text = request.args.get("q", "").strip()
    if len(text) < 2:
        return jsonify([])
    found = search_global_players(text)[:30]
    counts = tournament_counts_for_players([gp.id for gp in found])
    return jsonify([_public(gp, counts) for gp in found])


@blueprint.route("/players", methods=["POST"])
def create():
    body, status = tournament_entries.create_global_player({key: value for key, value in _json().items() if key in EDITABLE})
    return jsonify({key: body.get(key) for key in (*PUBLIC_FIELDS, "error") if key in body}), status


def _plays_only_in_my_series(gp_id: int) -> bool:
    mine = {row["id"] for item in g.series for row in series.series_tournaments(item["id"])}
    return all(entry.tournament_id in mine for entry in entries_of_global_player(gp_id))


@blueprint.route("/players/<int:gp_id>", methods=["PUT"])
def update(gp_id: int):
    gp = get_row(GlobalPlayer, gp_id)
    if not gp:
        return jsonify({"error": "Player not found"}), 404
    before = tournament_entries.player_snapshot(gp)
    outside = not _plays_only_in_my_series(gp_id)
    body, status = tournament_entries.update_global_player(gp_id, {key: value for key, value in _json().items() if key in EDITABLE})
    if status != 200:
        return jsonify(body), status
    after = tournament_entries.player_snapshot(get_row(GlobalPlayer, gp_id))
    if outside:
        queue_player_review(gp_id, g.account, before, after)
    return jsonify({**{key: body.get(key) or "" for key in PUBLIC_FIELDS}, "id": gp_id, "queued_for_review": outside})
