"""Heartbeat and director-command delivery for the umpire tablet."""
from flask import jsonify, request

from ..config import logger
from ..db_models import utc_now_iso
from ..services.api_auth import court_id_from_bearer, require_court_access
from ..services.court_manager import STATE_LOCK, ensure_court_state, normalize_kort_id
from ..services.director_commands import director_command_broker, tablet_presence


def register(blueprint) -> None:
    from .umpire_api import _clean_client_text, _clean_int, _request_client_meta

    @blueprint.route('/umpire-heartbeat', methods=['POST'])
    def umpire_heartbeat():
        """Receive periodic heartbeat from umpire tablet (battery, online status).
    
        Sent every ~2 min regardless of match state, so we always know
        tablet battery level even during breaks between matches.
        """
        data = request.get_json() or {}
        kort_id = normalize_kort_id(data.get('court_id', ''))
        access_error = require_court_access(kort_id)
        if access_error:
            return access_error
        battery_level = data.get('battery_level')
        is_charging = data.get('is_charging')
        screen = data.get('screen', '')
        app_version = data.get('app_version', '')
        match_id = _clean_int(data.get('match_id'))
        client_match_uuid = _clean_client_text(data.get('client_match_uuid'), 80)

        logger.info(
            f"Heartbeat: court={kort_id} battery={battery_level}% "
            f"charging={is_charging} screen={screen} ver={app_version}"
        )

        # Update court state with battery info if court is assigned
        if kort_id:
            court_state = ensure_court_state(kort_id)
            with STATE_LOCK:
                if battery_level:
                    court_state["battery_level"] = int(battery_level)
                if is_charging is not None:
                    court_state["is_charging"] = is_charging in (True, "true", "True")
                court_state["last_heartbeat"] = utc_now_iso()
                court_state["app_version"] = app_version
                court_state["umpire_screen"] = screen

            heartbeat_meta = _request_client_meta(data)
            snapshot = data.get("snapshot")
            tablet_presence.record(
                session_court_id=kort_id,
                match_id=match_id,
                client_match_uuid=client_match_uuid,
                screen=screen,
                battery_level=battery_level,
                app_version=heartbeat_meta.get("app_version") or app_version,
                platform=heartbeat_meta.get("platform"),
                device=heartbeat_meta.get("device"),
                device_model=heartbeat_meta.get("device_model"),
                device_manufacturer=heartbeat_meta.get("device_manufacturer"),
                is_charging=is_charging,
                snapshot=snapshot,
            )

        # Director commands are delivered only by GET /api/umpire/commands.
        return jsonify({"status": "ok"}), 200



    @blueprint.route('/umpire/commands', methods=['GET'])
    def poll_director_commands():
        """Long-poll pending director commands for the authorized tablet session."""
        session_court_id = court_id_from_bearer() or normalize_kort_id(request.args.get("court_id"))
        access_error = require_court_access(session_court_id)
        if access_error:
            return access_error
        if not session_court_id:
            return jsonify({"error": "court_id required"}), 400

        match_id = _clean_int(request.args.get("match_id"))
        client_match_uuid = _clean_client_text(request.args.get("client_match_uuid"), 80)
        wait_ms = request.args.get("wait_ms", type=int) or 0
        wait_s = max(0.0, min(float(wait_ms) / 1000.0, 25.0))
        commands = director_command_broker.wait_for(
            session_court_id,
            match_id,
            client_match_uuid,
            wait_s,
        )
        return jsonify({"commands": commands}), 200


    @blueprint.route('/umpire/commands/<command_id>/ack', methods=['POST'])
    def ack_director_command(command_id: str):
        """Drop a director command after the tablet applied it."""
        session_court_id = court_id_from_bearer() or normalize_kort_id(
            (request.get_json(silent=True) or {}).get("court_id") or request.args.get("court_id")
        )
        access_error = require_court_access(session_court_id)
        if access_error:
            return access_error
        acked = director_command_broker.ack(command_id)
        return jsonify({"ok": True, "acked": acked}), 200
