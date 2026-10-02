"""Admin inventory of umpire tablets."""
from flask import Blueprint, jsonify, request

from ..database.umpire_devices import update_umpire_device
from ..services.api_auth import require_admin_access
from ..services.device_alerts import battery_percent, device_rows

blueprint = Blueprint("umpire_devices_admin", __name__, url_prefix="/admin/api/devices")


@blueprint.route("", methods=["GET"])
def list_devices():
    denied = require_admin_access()
    if denied:
        return denied
    return jsonify({"devices": device_rows()})


@blueprint.route("/<android_id>", methods=["PUT"])
def put_device(android_id: str):
    denied = require_admin_access()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    name = payload.get("name") if "name" in payload else None
    clear_alert = False
    alert = None
    if "battery_alert_percent" in payload:
        raw = payload.get("battery_alert_percent")
        if raw in ("", None):
            clear_alert = True
        else:
            alert = battery_percent(raw)
            if alert is None or alert < 1 or alert > 99:
                return jsonify({"error": "Próg baterii musi być od 1 do 99."}), 400
    if not update_umpire_device(android_id, name=name, battery_alert_percent=alert, clear_alert=clear_alert):
        return jsonify({"error": "Nie ma takiego tabletu."}), 404
    current = next((row for row in device_rows() if row["android_id"] == android_id), None)
    return jsonify(current or {"ok": True})
