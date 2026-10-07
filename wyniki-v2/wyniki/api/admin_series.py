"""Series and their people, as the admin sets them up. Behind the admin guard in app.py."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..database import accounts, series, series_plan
from ..database.tournaments import fetch_tournament
from ..services import series_logo
from ..services.account_invites import invite_link, send_invite

blueprint = Blueprint("admin_series", __name__, url_prefix="/admin/api/series")


def _body() -> dict:
    return request.get_json(silent=True) or {}


def _not_found():
    return jsonify({"error": "Series not found"}), 404


@blueprint.route("", methods=["GET"])
def list_all():
    return jsonify(series.list_series())


@blueprint.route("/settings", methods=["GET"])
def settings_get():
    return jsonify({"contact_email": series_plan.contact_email()})


@blueprint.route("/settings", methods=["PUT"])
def settings_put():
    address = str(_body().get("contact_email") or "").strip()
    if address and ("@" not in address or "." not in address.split("@")[-1]):
        return jsonify({"error": "A valid e-mail is required"}), 400
    return jsonify({"contact_email": series_plan.set_contact_email(address)})


@blueprint.route("", methods=["POST"])
def create():
    data = _body()
    name = str(data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    series_id = series.create_series(
        name, slug=str(data.get("slug") or ""), country=str(data.get("country") or ""),
        website=str(data.get("website") or ""), valid_until=str(data.get("valid_until") or ""),
    )
    series.update_series(series_id, {key: data[key] for key in ("max_tournaments_per_year", "max_courts") if key in data})
    return jsonify(series.get_series(series_id)), 201


@blueprint.route("/<int:series_id>", methods=["PUT", "PATCH"])
def update(series_id: int):
    if not series.get_series(series_id):
        return _not_found()
    series.update_series(series_id, _body())
    return jsonify(series.get_series(series_id))


@blueprint.route("/<int:series_id>", methods=["DELETE"])
def delete(series_id: int):
    if not series.delete_series(series_id):
        return _not_found()
    return jsonify({"success": True})


@blueprint.route("/<int:series_id>/logo", methods=["POST"])
def logo_upload(series_id: int):
    item = series.get_series(series_id)
    if not item:
        return _not_found()
    body, status = series_logo.save(series_id, item["slug"], request.files.get("logo"))
    return jsonify(body), status


@blueprint.route("/<int:series_id>/logo", methods=["DELETE"])
def logo_remove(series_id: int):
    if not series.get_series(series_id):
        return _not_found()
    return jsonify(series_logo.remove(series_id))


@blueprint.route("/<int:series_id>/members", methods=["POST"])
def add_member(series_id: int):
    item = series.get_series(series_id)
    if not item:
        return _not_found()
    data = _body()
    email = accounts.normalize_email(data.get("email"))
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "A valid e-mail is required"}), 400
    account_id = accounts.ensure_account(email, str(data.get("name") or ""), data.get("language"))
    series.add_member(series_id, account_id, str(data.get("role") or "editor"))
    return jsonify(_invite(account_id, item["name"])), 201


@blueprint.route("/<int:series_id>/members/<int:account_id>/invite", methods=["POST"])
def reinvite(series_id: int, account_id: int):
    item = series.get_series(series_id)
    if not item or not any(member["id"] == account_id for member in item["members"]):
        return _not_found()
    return jsonify(_invite(account_id, item["name"]))


def _invite(account_id: int, series_name: str) -> dict:
    account = accounts.get_account(account_id)
    link = invite_link(account_id)
    emailed = send_invite(account, series_name, link)
    return {"account": account, "invite_url": link, "emailed": emailed}


@blueprint.route("/<int:series_id>/members/<int:account_id>", methods=["PUT", "PATCH"])
def update_member(series_id: int, account_id: int):
    item = series.get_series(series_id)
    if not item or not any(member["id"] == account_id for member in item["members"]):
        return _not_found()
    data = _body()
    if "role" in data:
        series.add_member(series_id, account_id, str(data["role"]))
    if "disabled" in data:
        accounts.set_disabled(account_id, bool(data["disabled"]))
    if "language" in data:
        accounts.set_language(account_id, data["language"])
    return jsonify(series.get_series(series_id) or {})


@blueprint.route("/<int:series_id>/members/<int:account_id>", methods=["DELETE"])
def remove_member(series_id: int, account_id: int):
    if not series.remove_member(series_id, account_id):
        return _not_found()
    return jsonify({"success": True})


@blueprint.route("/<int:series_id>/tournaments/<int:tournament_id>", methods=["PUT"])
def attach(series_id: int, tournament_id: int):
    if not series.get_series(series_id):
        return _not_found()
    if not fetch_tournament(tournament_id):
        return jsonify({"error": "Tournament not found"}), 404
    data = _body()
    series.attach_tournament(series_id, tournament_id, str(data.get("tier") or ""), data.get("counts_for_ranking", True) is not False)
    return jsonify(series.get_series(series_id))


@blueprint.route("/<int:series_id>/tournaments/<int:tournament_id>", methods=["DELETE"])
def detach(series_id: int, tournament_id: int):
    if not series.detach_tournament(series_id, tournament_id):
        return _not_found()
    return jsonify({"success": True})
