"""Flask route registrations for the wyniki application."""
from __future__ import annotations
import json
import os
import re
from queue import Empty
from typing import Any, Dict, List, Optional

import requests
from flask import (
    Blueprint,
    Flask,
    Response,
    abort,
    jsonify,
    request,
    session,
    send_from_directory,
    stream_with_context,
)

from .config import DOWNLOAD_DIR, STATIC_DIR, log, normalize_overlay_id, settings
from . import courts
from .database import delete_match_history_entry_by_id, update_match_history_entry
from .state import (
    STATE_LOCK,
    apply_local_command,
    broadcast_kort_state,
    buckets,
    ensure_court_state,
    event_broker,
    get_history_entry,
    log_state_summary,
    is_known_kort,
    normalize_kort_id,
    persist_state_cache,
    refresh_courts,
    refresh_history,
    record_log_entry,
    serialize_all_states,
    serialize_court_state,
    serialize_history,
    validate_command,
)
from .utils import now_iso, render_file_template, safe_copy, shorten

blueprint = Blueprint("wyniki", __name__)


ADMIN_SESSION_KEY = "wyniki_admin_authenticated"
DEFAULT_PHASE = "Grupowa"


def _admin_authenticated() -> bool:
    return bool(session.get(ADMIN_SESSION_KEY))


def _set_admin_session() -> None:
    session[ADMIN_SESSION_KEY] = True
    session.permanent = True


def _clear_admin_session() -> None:
    session.pop(ADMIN_SESSION_KEY, None)


def _admin_guard_response():
    if not _admin_authenticated():
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return None


def _courts_payload(force_reload: bool = False) -> List[Dict[str, Optional[str]]]:
    listed = courts.list_courts()
    if force_reload or not listed:
        listed = refresh_courts()
    if not listed:
        listed = courts.list_courts()
    return [{"kort": kort, "overlay": overlay} for kort, overlay in listed]


def _admin_payload() -> Dict[str, Any]:
    authenticated = _admin_authenticated()
    history_entries: List[Dict[str, Any]] = []
    if authenticated:
        history_entries = refresh_history(False)
    return {
        "authenticated": authenticated,
        "history": history_entries,
        "courts": _courts_payload(force_reload=authenticated),
        "hasPassword": bool(settings.admin_password),
        "defaultPhase": DEFAULT_PHASE,
    }


def _broadcast_snapshot() -> None:
    event_broker.broadcast(
        {
            "type": "snapshot",
            "ts": now_iso(),
            "state": serialize_all_states(),
            "history": serialize_history(),
        }
    )


def register_routes(app: Flask) -> None:
    app.register_blueprint(blueprint)


@blueprint.route("/")
def index() -> str:
    return render_file_template("index.html")


@blueprint.route("/admin")
def admin_index() -> str:
    initial = json.dumps(_admin_payload(), ensure_ascii=False)
    return render_file_template("admin.html", initial_json=initial)


@blueprint.route("/static/<path:filename>")
def static_files(filename: str):
    safe_path = os.path.normpath(filename)
    if safe_path.startswith("..") or os.path.isabs(safe_path):
        abort(404)
    return send_from_directory(STATIC_DIR, safe_path)


@blueprint.route("/download")
def download_plugin():
    if not os.path.isdir(DOWNLOAD_DIR):
        abort(404)
    archive_names = sorted(
        filename
        for filename in os.listdir(DOWNLOAD_DIR)
        if filename.lower().endswith(".zip") and os.path.isfile(os.path.join(DOWNLOAD_DIR, filename))
    )
    if not archive_names:
        abort(404)
    return send_from_directory(DOWNLOAD_DIR, archive_names[0], as_attachment=True)


@blueprint.route("/api/snapshot")
def api_snapshot():
    return jsonify(serialize_all_states())


@blueprint.route("/api/admin/session", methods=["GET", "POST", "DELETE"])
def api_admin_session():
    if request.method == "GET":
        payload = _admin_payload()
        return jsonify({"ok": True, **payload})
    if request.method == "POST":
        if not settings.admin_password:
            return jsonify({"ok": False, "error": "admin password not configured"}), 503
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            data = request.form.to_dict() if request.form else {}
        password = str((data or {}).get("password") or "")
        if password.strip() == settings.admin_password:
            _set_admin_session()
            payload = _admin_payload()
            return jsonify({"ok": True, **payload})
        _clear_admin_session()
        return jsonify({"ok": False, "error": "invalid password"}), 401
    if request.method == "DELETE":
        _clear_admin_session()
        return jsonify({"ok": True})
    abort(405)


@blueprint.route("/api/admin/history", methods=["GET"])
def api_admin_history():
    guard = _admin_guard_response()
    if guard:
        return guard
    history_entries = refresh_history(False)
    return jsonify({"ok": True, "history": history_entries})


@blueprint.route("/api/admin/history/<int:entry_id>", methods=["PUT", "DELETE"])
def api_admin_history_entry(entry_id: int):
    guard = _admin_guard_response()
    if guard:
        return guard
    if request.method == "DELETE":
        deleted = delete_match_history_entry_by_id(entry_id)
        if not deleted:
            return jsonify({"ok": False, "error": "not found"}), 404
        history_entries = refresh_history(True)
        return jsonify({"ok": True, "deleted": entry_id, "history": history_entries})

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid payload"}), 400
    updates: Dict[str, Optional[str]] = {}
    for field in ("player_a", "player_b", "category", "phase"):
        if field in payload:
            value = payload.get(field)
            if value is None:
                updates[field] = None
            else:
                updates[field] = str(value).strip()
    if "phase" in updates:
        phase_value = updates["phase"] or DEFAULT_PHASE
        if not phase_value:
            phase_value = DEFAULT_PHASE
        updates["phase"] = phase_value
    if "category" in updates and updates["category"] == "":
        updates["category"] = None
    if "player_a" in updates and updates["player_a"] == "":
        updates["player_a"] = None
    if "player_b" in updates and updates["player_b"] == "":
        updates["player_b"] = None
    if not updates:
        return jsonify({"ok": False, "error": "no changes provided"}), 400
    updated = update_match_history_entry(entry_id, updates)
    if not updated:
        return jsonify({"ok": False, "error": "not found"}), 404
    history_entries = refresh_history(True)
    entry = next((item for item in history_entries if item.get("id") == entry_id), None)
    if entry is None:
        entry = get_history_entry(entry_id)
    return jsonify({"ok": True, "entry": entry, "history": history_entries})


@blueprint.route("/api/admin/courts", methods=["GET", "POST"])
def api_admin_courts():
    guard = _admin_guard_response()
    if guard:
        return guard
    if request.method == "GET":
        return jsonify({"ok": True, "courts": _courts_payload()})

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid payload"}), 400
    kort_id = payload.get("kort") or payload.get("kort_id")
    overlay_id = payload.get("overlay") or payload.get("overlay_id")
    if overlay_id is None or not str(overlay_id).strip():
        return jsonify({"ok": False, "error": "overlay required"}), 400
    if kort_id is None or not str(kort_id).strip():
        return jsonify({"ok": False, "error": "kort required"}), 400
    try:
        courts.upsert_court(str(kort_id), str(overlay_id))
    except ValueError as exc:  # includes normalization failures
        return jsonify({"ok": False, "error": str(exc)}), 400
    refresh_courts()
    _broadcast_snapshot()
    return jsonify({"ok": True, "courts": _courts_payload(True)})


@blueprint.route("/api/admin/courts/<kort_id>", methods=["PUT", "DELETE"])
def api_admin_court_entry(kort_id: str):
    guard = _admin_guard_response()
    if guard:
        return guard
    normalized = normalize_kort_id(kort_id)
    if not normalized:
        return jsonify({"ok": False, "error": "invalid kort"}), 400
    if request.method == "DELETE":
        if not courts.delete_court(normalized):
            return jsonify({"ok": False, "error": "not found"}), 404
        refresh_courts()
        _broadcast_snapshot()
        return jsonify({"ok": True, "courts": _courts_payload(True)})

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid payload"}), 400
    overlay_id = payload.get("overlay") or payload.get("overlay_id")
    if overlay_id is None or not str(overlay_id).strip():
        return jsonify({"ok": False, "error": "overlay required"}), 400
    try:
        courts.upsert_court(normalized, str(overlay_id))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    refresh_courts()
    _broadcast_snapshot()
    return jsonify({"ok": True, "courts": _courts_payload(True)})


@blueprint.route("/api/stream")
def api_stream():
    log.info("stream connection from %s", request.remote_addr)

    def event_stream():
        queue_obj = event_broker.listen()
        try:
            snapshot_payload = {
                "type": "snapshot",
                "ts": now_iso(),
                "state": serialize_all_states(),
                "history": serialize_history(),
            }
            yield f"data: {json.dumps(snapshot_payload, ensure_ascii=False)}\n\n"
            while True:
                try:
                    payload = queue_obj.get(timeout=20)
                except Empty:
                    yield "event: ping\ndata: {}\n\n"
                    continue
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            event_broker.discard(queue_obj)

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(stream_with_context(event_stream()), headers=headers)


def _overlay_id_from_url(uno_url: Optional[str]) -> Optional[str]:
    if not uno_url:
        return None
    try:
        match = re.search(r"/controlapps/([^/]+)/api", str(uno_url))
        if match:
            return match.group(1)
    except re.error:
        return None
    return None


def _api_endpoint(kort_id: str) -> Optional[str]:
    overlay_id = courts.get_overlay_for_kort(kort_id)
    if not overlay_id:
        return None
    return f"{settings.overlay_base}/{overlay_id}/api"


@blueprint.route("/healthz")
def api_healthz():
    return jsonify({"ok": True, "ts": now_iso()}), 200


@blueprint.route("/api/mirror", methods=["POST"])
def api_mirror():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid payload"}), 400

    uno_url = payload.get("unoUrl") or payload.get("uno_url")
    overlay_id = _overlay_id_from_url(uno_url) or normalize_overlay_id(
        payload.get("overlay") or payload.get("app") or payload.get("appId")
    )
    if overlay_id:
        overlay_id = normalize_overlay_id(overlay_id)

    kort_id = None
    if overlay_id:
        kort_id = courts.overlay_id_to_kort_map().get(overlay_id)
    if not kort_id:
        kort_id = payload.get("kort")
    if not kort_id and overlay_id:
        kort_id = overlay_id
    if not kort_id:
        return jsonify({"ok": False, "error": "unknown kort"}), 400
    kort_id = str(kort_id)

    body = payload.get("unoBody")
    if not isinstance(body, dict):
        body = {}
    extras = {k: v for k, v in body.items() if k not in {"command", "value"}} or None
    command = body.get("command") or payload.get("command")
    if not command:
        return jsonify({"ok": False, "error": "command required"}), 400

    uno_method = (payload.get("unoMethod") or "").upper()
    uno_value = body.get("value") if isinstance(body, dict) else payload.get("value")
    value = uno_value
    log.info(
        "mirror command=%s overlay=%s kort=%s method=%s value=%s extras=%s raw=%s",
        command,
        overlay_id,
        kort_id,
        uno_method,
        shorten(value),
        shorten(extras),
        shorten(body),
    )

    if body is None and isinstance(payload.get("unoBodyRaw"), str):
        try:
            body = json.loads(payload["unoBodyRaw"])
        except (TypeError, ValueError, json.JSONDecodeError):  # type: ignore[attr-defined]
            body = None

    body = body if isinstance(body, dict) else {}
    command = body.get("command") or payload.get("command")
    value = body.get("value")
    extras = {k: v for k, v in body.items() if k not in {"command", "value"}}

    ts = payload.get("mirroredAt") or now_iso()
    status_code = payload.get("unoStatus")
    ok_flag = payload.get("unoOk")
    response_payload = payload.get("unoResponse")

    extras_for_log: Dict[str, Any] = {
        "uno_status": status_code,
        "uno_ok": ok_flag,
        "uno_method": payload.get("unoMethod"),
        "uno_url": uno_url,
    }
    if extras:
        extras_for_log["payload_extras"] = safe_copy(extras)
    if overlay_id:
        extras_for_log["overlay_id"] = overlay_id

    extras_for_log = {k: v for k, v in extras_for_log.items() if v is not None}
    broadcast_extras = safe_copy(extras) if extras else None

    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        changed = False
        if command:
            try:
                changed = apply_local_command(state, command, value, extras or None, kort_id)
            except Exception as exc:  # noqa: BLE001
                log.warning("mirror apply failed kort=%s command=%s error=%s", kort_id, command, exc)
        if changed and command:
            state["local"]["commands"][command] = {
                "value": safe_copy(value),
                "extras": safe_copy(extras) if extras else None,
                "ts": ts,
            }
            state["local"]["updated"] = ts
        elif changed:
            state["local"]["updated"] = ts
        uno_state = state["uno"]
        uno_state["last_command"] = command
        uno_state["last_value"] = safe_copy(value)
        uno_state["last_payload"] = safe_copy(body)
        uno_state["last_status"] = status_code
        uno_state["last_response"] = safe_copy(response_payload)
        uno_state["updated"] = ts
        state["updated"] = ts
        entry = record_log_entry(
            state,
            kort_id,
            "mirror",
            command or "unknown",
            safe_copy(value),
            extras_for_log or None,
            ts,
        )
        response_state = serialize_court_state(state)
        persist_state_cache(kort_id, state)

        log_state_summary(kort_id, state, "mirror state")

    broadcast_kort_state(
        kort_id,
        "mirror",
        command or "unknown",
        safe_copy(value),
        broadcast_extras,
        ts,
        status_code,
    )

    log.info("mirror kort=%s overlay=%s command=%s status=%s", kort_id, overlay_id, command, status_code)

    return jsonify(
        {
            "ok": True,
            "kort": kort_id,
            "overlay": overlay_id,
            "command": command,
            "ts": ts,
            "state": response_state,
            "log": entry,
        }
    )


@blueprint.route("/api/local/reflect/<kort_id>", methods=["POST"])
def api_local_reflect(kort_id: str):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    command = payload.get("command")
    if not validate_command(command):
        return jsonify({"error": "invalid command"}), 400

    value = payload.get("value")
    if value is None and "payload" in payload:
        value = payload.get("payload")
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    extras_copy = safe_copy(extras)
    ts = now_iso()

    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        changed = apply_local_command(state, command, value, extras, kort_id)
        state["local"]["commands"][command] = {
            "value": value,
            "extras": extras_copy,
            "ts": ts,
        }
        state["local"]["updated"] = ts
        state["updated"] = ts
        entry = record_log_entry(state, kort_id, "reflect", command, value, extras_copy, ts)
        response_state = serialize_court_state(state)
        persist_state_cache(kort_id, state)

        log_state_summary(kort_id, state, "reflect state")

    broadcast_kort_state(
        kort_id,
        "reflect",
        command,
        value,
        extras_copy if isinstance(extras_copy, dict) else extras_copy,
        ts,
        None,
    )

    return jsonify({"ok": True, "changed": changed, "state": response_state, "log": entry})


@blueprint.route("/api/uno/exec/<kort_id>", methods=["POST"])
def api_uno_exec(kort_id: str):
    normalized = normalize_kort_id(kort_id)
    if not normalized or not is_known_kort(normalized):
        return jsonify({"error": "unknown kort"}), 404
    kort_id = normalized

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    command = payload.get("command")
    if not isinstance(command, str) or not command.strip():
        return jsonify({"error": "command required"}), 400

    bucket = buckets.get(kort_id)
    if bucket and not bucket.take():
        return jsonify({"error": "rate limited"}), 429

    endpoint = _api_endpoint(kort_id)
    if not endpoint:
        return jsonify({"error": "overlay-missing"}), 400

    ts = now_iso()
    value = payload.get("value")
    value_copy = safe_copy(value)
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    payload_copy = safe_copy(payload)
    extras_copy = safe_copy(extras)

    status_code: Optional[int] = None
    response_payload: Any = None
    error_message: Optional[str] = None

    try:
        response = requests.put(
            endpoint,
            headers=settings.auth_header,
            json=payload,
            timeout=5,
        )
        status_code = response.status_code
        content_type = response.headers.get("Content-Type", "")
        if content_type and "json" in content_type.lower():
            try:
                response_payload = response.json()
            except ValueError:
                response_payload = response.text
        else:
            response_payload = response.text
    except requests.RequestException as exc:
        error_message = str(exc)
        response_payload = {"error": error_message}
        log.error("uno kort=%s command=%s request failed: %s", kort_id, command, exc)

    success = status_code is not None and 200 <= status_code < 300

    safe_response = safe_copy(response_payload)
    broadcast_extras = extras_copy if isinstance(extras_copy, dict) else extras_copy
    if extras_copy is None:
        log_extras: Optional[Dict[str, Any]] = {
            "uno_status": status_code,
            "uno_response": safe_response,
        }
    else:
        log_extras = dict(extras_copy)
        log_extras["uno_status"] = status_code
        log_extras["uno_response"] = safe_response
    if error_message:
        if log_extras is None:
            log_extras = {"uno_error": error_message}
        else:
            log_extras["uno_error"] = error_message

    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        if success:
            try:
                apply_local_command(state, command, value, extras, kort_id)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "failed to apply local command mirror kort=%s command=%s error=%s",
                    kort_id,
                    command,
                    exc,
                )
        uno_state = state["uno"]
        uno_state["last_command"] = command
        uno_state["last_value"] = value_copy
        uno_state["last_payload"] = payload_copy
        uno_state["last_status"] = status_code
        uno_state["last_response"] = safe_response
        uno_state["updated"] = ts
        state["updated"] = ts
        entry = record_log_entry(
            state,
            kort_id,
            "uno",
            command,
            value_copy,
            log_extras or None,
            ts,
        )
        response_state = serialize_court_state(state)

        log_state_summary(kort_id, state, "uno state")

    broadcast_kort_state(
        kort_id,
        "uno",
        command,
        value_copy,
        broadcast_extras,
        ts,
        status_code,
    )

    if success:
        log.info("uno kort=%s command=%s status=%s", kort_id, command, status_code)
        return jsonify(
            {
                "ok": True,
                "ts": ts,
                "status": status_code,
                "response": response_payload,
                "state": response_state,
                "log": entry,
            }
        )

    error_text = error_message or (
        f"remote returned status {status_code}" if status_code is not None else "request failed"
    )
    http_status = status_code if status_code and status_code >= 400 else 502
    return (
        jsonify(
            {
                "ok": False,
                "ts": ts,
                "status": status_code,
                "error": error_text,
                "response": response_payload,
                "state": response_state,
                "log": entry,
            }
        ),
        http_status,
    )
