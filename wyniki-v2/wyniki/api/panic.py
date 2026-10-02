"""Umpire panic button and the admin list of WhatsApp recipients."""
from flask import Blueprint, jsonify, request

from ..services.api_auth import court_id_from_bearer, require_admin_access
from ..services.panic import (
    add_recipient,
    delete_recipient,
    dispatch_panic,
    list_recipients,
    panic_enabled,
    read_thread,
    send_follow_up,
    set_panic_enabled,
    update_recipient,
)

umpire_blueprint = Blueprint("panic_umpire", __name__)
admin_blueprint = Blueprint("panic_admin", __name__, url_prefix="/admin/api/panic")


def _note() -> str:
    payload = request.get_json(silent=True) or {}
    return str(payload.get("note") or "")


def _client() -> dict[str, str]:
    headers = {
        "platform": "X-TennisReferee-Platform",
        "device": "X-TennisReferee-Device",
        "device_model": "X-TennisReferee-Model",
        "device_manufacturer": "X-TennisReferee-Manufacturer",
        "android_id": "X-TennisReferee-Android-Id",
    }
    meta: dict[str, str] = {}
    for key, header in headers.items():
        value = str(request.headers.get(header) or "").strip()
        if value:
            meta[key] = value[:160]
    return meta


def _court_id() -> str:
    bound = court_id_from_bearer()
    if bound:
        return bound
    payload = request.get_json(silent=True) or {}
    return str(payload.get("court_id") or "").strip()


@umpire_blueprint.route("/api/umpire/panic", methods=["POST"])
def post_panic():
    body, status = dispatch_panic(
        court_id=_court_id(),
        note=_note(),
        remote_addr=request.headers.get("CF-Connecting-IP") or request.remote_addr or "",
        client=_client(),
    )
    response = jsonify(body)
    if status == 429:
        response.headers["Retry-After"] = str(body.get("retry_after") or 60)
    return response, status


@umpire_blueprint.route("/api/umpire/panic/<token>", methods=["GET"])
def get_panic_thread(token: str):
    body = read_thread(token)
    if body is None:
        return jsonify({"error": "Thread not found"}), 404
    return jsonify(body)


@umpire_blueprint.route("/api/umpire/panic/<token>", methods=["POST"])
def post_panic_follow_up(token: str):
    body, status = send_follow_up(token, _note())
    return jsonify(body), status


@admin_blueprint.route("/settings", methods=["GET"])
def get_settings():
    denied = require_admin_access()
    if denied:
        return denied
    return jsonify({"enabled": panic_enabled(), "recipients": list_recipients()})


@admin_blueprint.route("/settings", methods=["PUT"])
def put_settings():
    denied = require_admin_access()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    if "enabled" in payload:
        set_panic_enabled(bool(payload.get("enabled")))
    return jsonify({"enabled": panic_enabled()})


@admin_blueprint.route("/recipients", methods=["POST"])
def post_recipient():
    denied = require_admin_access()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    try:
        created = add_recipient(str(payload.get("name") or ""), str(payload.get("chat_id") or ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(created), 201


@admin_blueprint.route("/recipients/<int:recipient_id>", methods=["PUT"])
def put_recipient(recipient_id: int):
    denied = require_admin_access()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    try:
        updated = update_recipient(
            recipient_id,
            name=payload.get("name"),
            chat_id=payload.get("chat_id"),
            enabled=payload.get("enabled") if "enabled" in payload else None,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if updated is None:
        return jsonify({"error": "Recipient not found"}), 404
    return jsonify(updated)


@admin_blueprint.route("/recipients/<int:recipient_id>", methods=["DELETE"])
def remove_recipient(recipient_id: int):
    denied = require_admin_access()
    if denied:
        return denied
    if not delete_recipient(recipient_id):
        return jsonify({"error": "Recipient not found"}), 404
    return jsonify({"ok": True})
