"""Flask route registrations for the wyniki application."""
from __future__ import annotations

import hmac
import json
import os
import re
from urllib.parse import urlparse, urlunparse
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
    fetch_app_settings,
    fetch_history_entry,
    update_history_entry,
    upsert_app_settings,
    upsert_court,
)
from .state import (
    DEFAULT_HISTORY_PHASE,
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
    reset_after_match,
    refresh_courts_from_db,
    record_log_entry,
    serialize_all_states,
    serialize_court_state,
    serialize_history,
    STATE_LOCK,
    validate_command,
)
from .utils import now_iso, render_file_template, safe_copy, shorten

blueprint = Blueprint("wyniki", __name__)
admin_blueprint = Blueprint("admin", __name__, url_prefix="/admin")
admin_api_blueprint = Blueprint("admin_api", __name__, url_prefix="/api/admin")

YOUTUBE_API_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_API_KEY_SETTING = "youtube_api_key"
YOUTUBE_STREAM_ID_SETTING = "youtube_stream_id"
YOUTUBE_SETTINGS_KEYS = (YOUTUBE_API_KEY_SETTING, YOUTUBE_STREAM_ID_SETTING)

ADMIN_SESSION_KEY = "admin_authenticated"
ADMIN_DISABLED_MESSAGE = (
    "Panel administracyjny jest wyłączony. Skonfiguruj zmienną środowiskową"
    " ADMIN_PASSWORD, aby go aktywować."
)
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
HISTORY_STR_FIELDS = {"kort_id", "ended_ts", "player_a", "player_b", "category", "phase"}


def _admin_enabled() -> bool:
    return bool(settings.admin_password)


def _require_admin_enabled_json():
    if _admin_enabled():
        return None
    return (
        jsonify(
            {"ok": False, "error": "admin-disabled", "message": ADMIN_DISABLED_MESSAGE}
        ),
        503,
    )


def _is_admin_authenticated() -> bool:
    return session.get(ADMIN_SESSION_KEY) is True


def _require_admin_session_json():
    disabled_response = _require_admin_enabled_json()
    if disabled_response is not None:
        return disabled_response
    if not _is_admin_authenticated():
        return jsonify({"ok": False, "error": "not-authorized"}), 401
    return None


def _load_youtube_settings() -> Dict[str, str]:
    stored = fetch_app_settings(YOUTUBE_SETTINGS_KEYS)
    api_key = (stored.get(YOUTUBE_API_KEY_SETTING) or settings.youtube_api_key or "").strip()
    stream_id = (stored.get(YOUTUBE_STREAM_ID_SETTING) or settings.youtube_stream_id or "").strip()
    return {"api_key": api_key, "stream_id": stream_id}


def _fetch_viewers_data(
    credentials: Optional[Dict[str, str]] = None,
) -> Tuple[int, Optional[str]]:
    config = credentials or _load_youtube_settings()
    api_key = (config.get("api_key") or "").strip()
    stream_id = (config.get("stream_id") or "").strip()
    if not api_key or not stream_id:
        log.warning("YouTube API configuration missing (api_key=%s, stream_id=%s)", bool(api_key), bool(stream_id))
        return 0, "Brak skonfigurowanego klucza API lub ID transmisji."
    params = {
        "part": "liveStreamingDetails",
        "id": stream_id,
        "key": api_key,
        "fields": "items/liveStreamingDetails/concurrentViewers",
        "prettyPrint": "false",
    }
    try:
        response = requests.get(YOUTUBE_API_ENDPOINT, params=params, timeout=5)
        response.raise_for_status()
        payload = response.json()
        items = payload.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError("missing-items")
        details = items[0].get("liveStreamingDetails")
        if not isinstance(details, dict):
            raise ValueError("missing-details")
        raw_count = details.get("concurrentViewers")
        if raw_count is None:
            raise ValueError("missing-count")
        count = int(raw_count)
        return count, None
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
        log.warning("Failed to fetch viewers information: %s", exc)
        return 0, "Nie udało się pobrać liczby widzów."


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
            if field == "phase":
                sanitized[field] = text or DEFAULT_HISTORY_PHASE
            elif field == "category":
                sanitized[field] = text or None
            else:
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


@blueprint.route("/viewers", methods=["GET"])
@blueprint.route("/vievers", methods=["GET"])
def viewers() -> Response:
    """Return the concurrent viewers count for the configured livestream."""
    count, _ = _fetch_viewers_data()
    return Response(str(count), mimetype="text/plain")


@admin_blueprint.route("/", methods=["GET"])
def admin_index() -> str:
    admin_enabled = _admin_enabled()
    is_authenticated = admin_enabled and _is_admin_authenticated()
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
        admin_enabled=admin_enabled,
        admin_disabled_message=ADMIN_DISABLED_MESSAGE,
    )


@admin_blueprint.route("/login", methods=["POST"])
def admin_login():
    disabled_response = _require_admin_enabled_json()
    if disabled_response is not None:
        return disabled_response
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


@admin_api_blueprint.route("/youtube", methods=["GET"])
def admin_api_youtube_get():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    config = _load_youtube_settings()
    viewers, viewers_error = _fetch_viewers_data(config)
    return jsonify(
        {
            "ok": True,
            "api_key": config["api_key"],
            "stream_id": config["stream_id"],
            "viewers": viewers,
            "viewers_error": viewers_error,
        }
    )


@admin_api_blueprint.route("/youtube", methods=["PUT"])
def admin_api_youtube_update():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400
    updates: Dict[str, Optional[str]] = {}
    if "api_key" in payload:
        value = payload.get("api_key")
        if value is not None and not isinstance(value, str):
            return jsonify({"ok": False, "error": "invalid-field", "field": "api_key"}), 400
        updates[YOUTUBE_API_KEY_SETTING] = (str(value).strip() if isinstance(value, str) else None)
    if "stream_id" in payload:
        value = payload.get("stream_id")
        if value is not None and not isinstance(value, str):
            return jsonify({"ok": False, "error": "invalid-field", "field": "stream_id"}), 400
        updates[YOUTUBE_STREAM_ID_SETTING] = (
            str(value).strip() if isinstance(value, str) else None
        )
    if not updates:
        return jsonify({"ok": False, "error": "no-updates"}), 400
    upsert_app_settings(updates)
    config = _load_youtube_settings()
    viewers, viewers_error = _fetch_viewers_data(config)
    return jsonify(
        {
            "ok": True,
            "api_key": config["api_key"],
            "stream_id": config["stream_id"],
            "viewers": viewers,
            "viewers_error": viewers_error,
        }
    )


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


@admin_api_blueprint.route("/courts/<kort_id>/reset", methods=["POST"])
def admin_api_courts_reset(kort_id: str):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    normalized_id = normalize_kort_id(kort_id)
    if not normalized_id:
        return jsonify({"ok": False, "error": "invalid-field", "field": "kort_id"}), 400
    ts = now_iso()
    extras = {"initiator": "admin", "action": "manual-reset"}
    with STATE_LOCK:
        state = ensure_court_state(normalized_id)
        reset_after_match(state)
        state["updated"] = ts
        entry = record_log_entry(
            state,
            normalized_id,
            "admin",
            "ResetCourtState",
            None,
            extras,
            ts,
        )
        persist_state_cache(normalized_id, state)
        response_state = serialize_court_state(state)
        log_state_summary(normalized_id, state, "admin reset")
    broadcast_kort_state(normalized_id, "admin", "ResetCourtState", None, extras, ts)
    message = f"Kort {normalized_id} został wyzerowany."
    return jsonify(
        {
            "ok": True,
            "kort_id": normalized_id,
            "state": response_state,
            "log": entry,
            "message": message,
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
    allowed_extensions = {".zip", ".crx"}
    archive_names = sorted(
        filename
        for filename in os.listdir(DOWNLOAD_DIR)
        if os.path.splitext(filename)[1].lower() in allowed_extensions
        and os.path.isfile(os.path.join(DOWNLOAD_DIR, filename))
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


def _normalize_uno_api_url(raw_url: Optional[str]) -> Optional[str]:
    if not raw_url:
        return None
    text = str(raw_url)
    try:
        parsed = urlparse(text)
    except ValueError:
        normalized = re.sub(r"/api/info(?=$|[/?#])", "/api", text, flags=re.IGNORECASE)
        normalized = re.sub(r"/info(?=$|[/?#])", "/api", normalized, flags=re.IGNORECASE)
        return normalized
    path = re.sub(r"/api/info/?$", "/api", parsed.path, flags=re.IGNORECASE)
    path = re.sub(r"/info/?$", "/api", path, flags=re.IGNORECASE)
    normalized = parsed._replace(path=path)
    return urlunparse(normalized)


def _normalize_uno_method(raw_method: Optional[str]) -> str:
    method = str(raw_method or "").strip().upper()
    if method in {"PUT", "POST"}:
        return method
    return "PUT"


def _send_flag_update_to_uno(
    url: str,
    method: str,
    field_id: str,
    flag_url: str,
) -> Tuple[bool, Optional[int], Optional[object]]:
    payload = {
        "command": "SetCustomizationField",
        "fieldId": field_id,
        "value": str(flag_url),
    }
    try:
        response = requests.request(
            method,
            url,
            headers=settings.auth_header,
            json=payload,
            timeout=5,
        )
    except requests.RequestException as exc:
        log.warning(
            "mirror flag push failed url=%s field=%s error=%s",
            shorten(url),
            field_id,
            exc,
        )
        return False, None, str(exc)

    status_code = response.status_code
    response_payload: Optional[object]
    content_type = response.headers.get("Content-Type", "")
    if "json" in content_type.lower():
        try:
            response_payload = response.json()
        except ValueError:
            response_payload = response.text
    else:
        response_payload = response.text

    success = 200 <= status_code < 300
    if success:
        log.info(
            "mirror flag push ok url=%s field=%s status=%s",
            shorten(url),
            field_id,
            status_code,
        )
    else:
        log.warning(
            "mirror flag push failed url=%s field=%s status=%s payload=%s",
            shorten(url),
            field_id,
            status_code,
            shorten(response_payload),
        )

    return success, status_code, response_payload


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

    normalized_uno_url = _normalize_uno_api_url(uno_url)
    uno_method = _normalize_uno_method(payload.get("unoMethod") or payload.get("uno_method"))
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
        "uno_method": uno_method,
        "uno_url": normalized_uno_url or uno_url,
    }
    if extras:
        extras_for_log["payload_extras"] = safe_copy(extras)
    if overlay_id:
        extras_for_log["overlay_id"] = overlay_id

    extras_for_log = {k: v for k, v in extras_for_log.items() if v is not None}
    broadcast_extras = safe_copy(extras) if extras else None

    flag_push_plan: Optional[Dict[str, str]] = None
    if command in {"SetNamePlayerA", "SetNamePlayerB"} and extras:
        raw_flag_url = (
            extras.get("flagUrl")
            or extras.get("flag_url")
            or extras.get("flagUrlA")
            or extras.get("flagUrlB")
        )
        if raw_flag_url:
            flag_value = str(raw_flag_url).strip()
            if flag_value:
                target_url = normalized_uno_url or _api_endpoint(kort_id)
                if target_url:
                    field_id = "Player A Flag" if command.endswith("A") else "Player B Flag"
                    flag_push_plan = {
                        "url": target_url,
                        "method": uno_method,
                        "field": field_id,
                        "value": flag_value,
                    }
                    extras_for_log["flag_url"] = flag_value
                else:
                    log.info(
                        "mirror flag push skipped kort=%s command=%s reason=no-endpoint",
                        kort_id,
                        command,
                    )

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

    if flag_push_plan:
        _send_flag_update_to_uno(
            flag_push_plan["url"],
            flag_push_plan["method"],
            flag_push_plan["field"],
            flag_push_plan["value"],
        )

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
