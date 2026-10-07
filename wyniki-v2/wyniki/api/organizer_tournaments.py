"""The organizer's tournaments: create one in the series, change its settings, its
categories, courts and PINs, open its office, read its change log and overlay links.

The guard in organizer_common has already checked the series and the tournament.
What the organizer may not touch is decided here: whether the tournament is live for
the overlays' admin settings, its access key, and publishing while the admin holds a lock.
"""
from __future__ import annotations

from flask import g, jsonify, request

from ..database import fetch_courts, fetch_courts_for_tournament, fetch_tournament, series, set_tournament_active_state, upsert_court
from ..database.series_records import log_for_tournament, visibility_lock
from ..database.tournament_titles import title_fields
from ..services import organizer_auth as auth
from ..services import tournament_settings
from ..services.api_auth import issue_office_token
from ..services.office_workflow import _normalize_bool
from . import tournament_setup
from .organizer_common import guarded_blueprint

blueprint = guarded_blueprint("organizer_tournaments", "/organizer/api")

EDITABLE = ("name", "start_date", "end_date", "city", "country", "report_email", "court_count",
            "is_public", "is_simulation", "office_password", "title_scope", "title_override")


def _payload() -> dict:
    return (request.get_json(silent=True) or {}) if request.is_json else request.form.to_dict()


def _series_of_tournament(tournament_id: int) -> list[dict]:
    return [row for row in g.series if series.tournament_in_series(tournament_id, [row["id"]])]


def _office_slot(tournament_id: int) -> int | None:
    from .office import _office_slot_tournaments

    for index, row in enumerate(_office_slot_tournaments(), start=1):
        if int(row["id"]) == tournament_id:
            return index
    return None


def _overlay_links(tournament_id: int) -> list[dict]:
    from ..database import fetch_active_tournaments
    from ..services.overlay_settings import get_overlay_settings

    active = [int(row["id"]) for row in fetch_active_tournaments()]
    slot = active.index(tournament_id) + 1 if tournament_id in active else None
    links = []
    for overlay_id, overlay in (get_overlay_settings().get("overlays") or {}).items():
        if int(overlay.get("tournament_id") or 0) != tournament_id:
            continue
        links.append({
            "id": overlay_id,
            "name": overlay.get("name") or overlay_id,
            "path": f"/overlay/{slot}/{overlay_id}" if slot else "",
        })
    return links


def _detail(tournament_id: int) -> dict:
    tournament = fetch_tournament(tournament_id)
    tournament.pop("access_key", None)
    tiers = {row["id"]: row for row in _series_of_tournament(tournament_id)}
    return {
        **tournament,
        **title_fields(tournament_id, tournament["name"]),
        "visibility_lock": visibility_lock(tournament_id),
        "series": [{"id": sid, "name": row["name"], "tier": next(
            (t["tier"] for t in series.series_tournaments(sid) if t["id"] == tournament_id), "")} for sid, row in tiers.items()],
        "courts": [{"kort_id": c["kort_id"], "name": c["name"], "pin": c["pin"] or ""} for c in fetch_courts_for_tournament(tournament_id)],
        "office_slot": _office_slot(tournament_id),
        "overlays": _overlay_links(tournament_id),
        "read_only": not auth.tournament_writable(tournament_id),
    }


@blueprint.route("/series/<int:series_id>/tournaments", methods=["POST"])
def create(series_id: int):
    data = {key: value for key, value in _payload().items() if key in EDITABLE}
    data["active"] = False
    body, status = tournament_settings.create_from(data, request.files.get("logo"))
    if status == 201:
        series.attach_tournament(series_id, body["id"], str(_payload().get("tier") or ""))
        g.audit_tournament_id = body["id"]
    return jsonify(body), status


@blueprint.route("/tournaments/<int:tournament_id>", methods=["GET"])
def detail(tournament_id: int):
    return jsonify(_detail(tournament_id))


@blueprint.route("/tournaments/<int:tournament_id>", methods=["PUT"])
def update(tournament_id: int):
    existing = fetch_tournament(tournament_id)
    data = {
        "name": existing["name"], "start_date": existing["start_date"], "end_date": existing["end_date"],
        "city": existing.get("city") or "", "country": existing.get("country") or "",
        "report_email": existing.get("report_email") or "", "is_public": existing.get("is_public"),
        "is_simulation": existing.get("is_simulation"), "stats_enabled": existing.get("stats_enabled"),
        **{key: value for key, value in _payload().items() if key in EDITABLE},
        # not the organizer's to change here
        "active": existing.get("active"),
        "access_key": existing.get("access_key") or "",
    }
    if visibility_lock(tournament_id) == "private":
        data["is_public"] = False
    if "is_simulation" in _payload() and not _normalize_bool(data["is_simulation"]):
        data["stats_enabled"] = True
    body, status = tournament_settings.update_from(tournament_id, data, request.files.get("logo"))
    return jsonify(body if status != 200 else {**body, "tournament": _detail(tournament_id)}), status


@blueprint.route("/tournaments/<int:tournament_id>/active", methods=["PUT"])
def set_active(tournament_id: int):
    """The day of the tournament: live for the umpires' app and the office, or not."""
    active = _normalize_bool((request.get_json(silent=True) or {}).get("active", False))
    set_tournament_active_state(tournament_id, active)
    from ..services.court_manager import refresh_courts_from_db

    refresh_courts_from_db(fetch_courts(active_only=True))
    return jsonify({"active": active, "tournament": _detail(tournament_id)})


@blueprint.route("/tournaments/<int:tournament_id>/courts/<kort_id>/pin", methods=["PUT"])
def court_pin(tournament_id: int, kort_id: str):
    court = next((c for c in fetch_courts_for_tournament(tournament_id) if c["kort_id"] == kort_id), None)
    if not court:
        return jsonify({"error": "Court not found"}), 404
    pin = str((request.get_json(silent=True) or {}).get("pin") or "").strip()
    if len(pin) != 4 or not pin.isdigit():
        return jsonify({"error": "PIN must be 4 digits"}), 400
    upsert_court(kort_id, pin, name=court["name"])
    return jsonify({"kort_id": kort_id, "pin": pin})


@blueprint.route("/tournaments/<int:tournament_id>/office-session", methods=["POST"])
def office_session(tournament_id: int):
    """Into the office without its password: the organizer already proved who they are."""
    slot = _office_slot(tournament_id)
    if not slot:
        return jsonify({"error": "Office not open for this tournament"}), 409
    return jsonify({"slot": slot, "tournament_id": tournament_id, "token": issue_office_token(slot, tournament_id)})


@blueprint.route("/tournaments/<int:tournament_id>/log", methods=["GET"])
def change_log(tournament_id: int):
    return jsonify(log_for_tournament(tournament_id))


# ----- categories: the same rules as the admin's -----

@blueprint.route("/tournaments/<int:tournament_id>/categories", methods=["GET"])
def categories(tournament_id: int):
    body, status = tournament_setup.list_categories(tournament_id)
    return jsonify(body), status


@blueprint.route("/tournaments/<int:tournament_id>/categories/confirm", methods=["POST"])
def categories_confirm(tournament_id: int):
    body, status = tournament_setup.confirm_categories(tournament_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route("/tournaments/<int:tournament_id>/categories", methods=["POST"])
def category_create(tournament_id: int):
    body, status = tournament_setup.create_category(tournament_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route("/tournaments/<int:tournament_id>/categories/<int:category_id>", methods=["PUT", "PATCH"])
def category_update(tournament_id: int, category_id: int):
    body, status = tournament_setup.update_category(tournament_id, category_id, request.get_json(silent=True) or {})
    return jsonify(body), status


@blueprint.route("/tournaments/<int:tournament_id>/categories/<int:category_id>", methods=["DELETE"])
def category_delete(tournament_id: int, category_id: int):
    body, status = tournament_setup.delete_category(tournament_id, category_id)
    return jsonify(body), status
