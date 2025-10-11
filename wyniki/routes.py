"""Flask route registrations for the wyniki application."""
from __future__ import annotations

import hmac
import json
import os
import re
from queue import Empty
from typing import Any, Dict, List, Optional, Tuple

import requests
from flask import (
    Blueprint,
    Flask,
    Response,
    abort,
    jsonify,
    request,
    send_from_directory,
    session,
    stream_with_context,
)

from .config import DOWNLOAD_DIR, STATIC_DIR, log, normalize_overlay_id, settings
from .database import (
    delete_court,
    delete_history_entry,
    fetch_all_history,
    fetch_history_entry,
    update_history_entry,
    upsert_court,
)
from .state import (
    apply_local_command,
    available_courts,
    broadcast_kort_state,
    buckets,
    ensure_court_state,
    event_broker,
    get_kort_for_overlay,
    get_overlay_for_kort,
    log_state_summary,
    is_known_kort,
    normalize_kort_id,
    persist_state_cache,
    refresh_courts_from_db,
    record_log_entry,
    serialize_all_states,
    serialize_court_state,
    serialize_history,
    validate_command,
)
from .utils import now_iso, render_file_template, safe_copy, shorten

blueprint = Blueprint("wyniki", __name__)
admin_blueprint = Blueprint("admin", __name__, url_prefix="/admin")
admin_api_blueprint = Blueprint("admin_api", __name__, url_prefix="/api/admin")

ADMIN_SESSION_KEY = "admin_authenticated"
HISTORY_INT_FIELDS = {
    "duration_seconds",
    "set1_a",
    "set1_b",
    "set2_a",
    "set2_b",
    "tie_a",
    "tie_b",
    "set1_tb_a",
    "set1_tb_b",
    "set2_tb_a",
    "set2_tb_b",
}
HISTORY_STR_FIELDS = {"kort_id", "ended_ts", "player_a", "player_b"}


def _admin_enabled() -> bool:
    return bool(settings.admin_password)


def _is_admin_authenticated() -> bool:
    return session.get(ADMIN_SESSION_KEY) is True


def _require_admin_session_json():
    if not _admin_enabled():
        return jsonify({"ok": False, "error": "admin-disabled"}), 404
    if not _is_admin_authenticated():
        return jsonify({"ok": False, "error": "not-authorized"}), 401
    return None


def _sanitize_history_payload(payload: Dict[str, object]) -> Dict[str, object]:
    sanitized: Dict[str, object] = {}
    for field in HISTORY_STR_FIELDS:
        if field in payload:
            raw_value = payload.get(field)
            if raw_value is None:
                if field in {"kort_id", "ended_ts"}:
                    raise ValueError(field)
                sanitized[field] = None
                continue
            text = str(raw_value).strip()
            if field in {"kort_id", "ended_ts"} and not text:
                raise ValueError(field)
            sanitized[field] = text
    for field in HISTORY_INT_FIELDS:
        if field in payload:
            raw_value = payload.get(field)
            if raw_value is None or raw_value == "":
                sanitized[field] = None
                continue
            try:
                sanitized[field] = int(raw_value)
            except (TypeError, ValueError):
                raise ValueError(field) from None
    return sanitized


def _serialize_courts() -> List[Dict[str, Optional[str]]]:
    return [
        {"kort_id": kort_id, "overlay_id": overlay_id}
        for kort_id, overlay_id in available_courts()
    ]


def _sanitize_court_payload(payload: Dict[str, object]) -> Tuple[str, Optional[str]]:
    raw_kort = payload.get("kort_id") or payload.get("kort")
    kort_id = normalize_kort_id(raw_kort) if raw_kort is not None else None
    if not kort_id:
        raise ValueError("kort_id")
    overlay_raw = payload.get("overlay_id") or payload.get("overlay")
    if overlay_raw is None:
        return kort_id, None
    overlay_text = str(overlay_raw).strip()
    if not overlay_text:
        return kort_id, None
    normalized_overlay = normalize_overlay_id(overlay_text) or overlay_text
    return kort_id, normalized_overlay


def register_routes(app: Flask) -> None:
    app.register_blueprint(blueprint)
    app.register_blueprint(admin_blueprint)
    app.register_blueprint(admin_api_blueprint)


@admin_blueprint.route("/", methods=["GET"])
def admin_index() -> str:
    if not _admin_enabled():
        abort(404)
    is_authenticated = _is_admin_authenticated()
    history = fetch_all_history(settings.match_history_size) if is_authenticated else []
    courts = (
        [{"kort_id": kort_id, "overlay_id": overlay_id} for kort_id, overlay_id in available_courts()]
        if is_authenticated
        else []
    )
    return render_file_template(
        "admin.html",
        is_authenticated=is_authenticated,
        history=history,
        courts=courts,
        int_fields=sorted(HISTORY_INT_FIELDS),
    )


@admin_blueprint.route("/login", methods=["POST"])
def admin_login():
    if not _admin_enabled():
        abort(404)
    payload = request.get_json(silent=True)
    password: Optional[str] = None
    if isinstance(payload, dict):
        value = payload.get("password")
        if value is not None:
            password = str(value)
    if password is None:
        password = request.form.get("password")
    if password is None:
        password = request.args.get("password")
    password = password.strip() if isinstance(password, str) else None
    if not password:
        return jsonify({"ok": False, "error": "password-required"}), 400
    if not hmac.compare_digest(password, settings.admin_password):
        return jsonify({"ok": False, "error": "invalid-password"}), 401
    session[ADMIN_SESSION_KEY] = True
    return jsonify({"ok": True})


@admin_api_blueprint.route("/history", methods=["GET"])
def admin_api_history():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    limit_value = request.args.get("limit")
    limit = None
    if limit_value is not None:
        try:
            limit = max(1, int(limit_value))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "invalid-limit"}), 400
    history = fetch_all_history(limit or settings.match_history_size)
    return jsonify({"ok": True, "history": history})


@admin_api_blueprint.route("/history/<int:entry_id>", methods=["PUT"])
def admin_api_history_update(entry_id: int):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400
    existing = fetch_history_entry(entry_id)
    if not existing:
        return jsonify({"ok": False, "error": "not-found"}), 404
    try:
        sanitized = _sanitize_history_payload(payload)
    except ValueError as exc:
        return (
            jsonify({"ok": False, "error": "invalid-field", "field": str(exc)}),
            400,
        )
    if not sanitized:
        return jsonify({"ok": False, "error": "no-updates"}), 400
    updated = update_history_entry(entry_id, sanitized)
    refreshed = fetch_history_entry(entry_id)
    return jsonify({"ok": True, "updated": updated, "entry": refreshed})


@admin_api_blueprint.route("/history/<int:entry_id>", methods=["DELETE"])
def admin_api_history_delete(entry_id: int):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    existing = fetch_history_entry(entry_id)
    if not existing:
        return jsonify({"ok": False, "error": "not-found"}), 404
    deleted = delete_history_entry(entry_id)
    return jsonify({"ok": True, "deleted": deleted, "entry": existing})


@admin_api_blueprint.route("/courts", methods=["GET"])
def admin_api_courts_list():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    return jsonify({"ok": True, "courts": _serialize_courts()})


@admin_api_blueprint.route("/courts", methods=["POST"])
def admin_api_courts_create():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400
    try:
        kort_id, overlay_id = _sanitize_court_payload(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": "invalid-field", "field": str(exc)}), 400
    existed_before = is_known_kort(kort_id)
    upsert_court(kort_id, overlay_id)
    refresh_courts_from_db()
    court_record = {"kort_id": kort_id, "overlay_id": get_overlay_for_kort(kort_id)}
    return jsonify(
        {
            "ok": True,
            "created": not existed_before,
            "court": court_record,
            "courts": _serialize_courts(),
        }
    )


@admin_api_blueprint.route("/courts/<kort_id>", methods=["DELETE"])
def admin_api_courts_delete(kort_id: str):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    normalized_id = normalize_kort_id(kort_id)
    if not normalized_id:
        return jsonify({"ok": False, "error": "invalid-field", "field": "kort_id"}), 400
    existing_overlay = get_overlay_for_kort(normalized_id)
    deleted = delete_court(normalized_id)
    if not deleted:
        return jsonify({"ok": False, "error": "not-found"}), 404
    refresh_courts_from_db()
    return jsonify(
        {
            "ok": True,
            "deleted": True,
            "court": {"kort_id": normalized_id, "overlay_id": existing_overlay},
            "courts": _serialize_courts(),
        }
    )


@blueprint.route("/")
def index() -> str:
    return render_file_template("index.html")


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
    overlay_id = get_overlay_for_kort(kort_id)
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

    kort_id: Optional[str] = None
    if overlay_id:
        kort_id = get_kort_for_overlay(overlay_id)
    if not kort_id:
        kort_id_raw = payload.get("kort")
        if kort_id_raw is not None:
            kort_id = normalize_kort_id(kort_id_raw) or str(kort_id_raw)
    if not kort_id and overlay_id:
        kort_id = overlay_id
    if not kort_id:
        return jsonify({"ok": False, "error": "unknown kort"}), 400
    kort_id = normalize_kort_id(kort_id) or str(kort_id)

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
    normalized_id = normalize_kort_id(kort_id)
    if normalized_id:
        kort_id = normalized_id
    if not is_known_kort(kort_id):
        return jsonify({"error": "unknown kort"}), 404

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
