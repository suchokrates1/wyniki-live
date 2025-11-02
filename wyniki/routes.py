"""Flask route registrations for the wyniki application."""
from __future__ import annotations

import hmac
import json
import os
import re
from queue import Empty
from threading import Lock
from urllib.parse import urlparse, urlunparse
from typing import Any, Dict, List, Optional, Set, Tuple

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
    delete_player,
    fetch_all_history,
    fetch_app_settings,
    fetch_history_entry,
    fetch_player,
    fetch_players,
    insert_player,
    update_history_entry,
    update_player,
    upsert_app_settings,
    upsert_court,
)
from .state import (
    DEFAULT_HISTORY_PHASE,
    apply_local_command,
    available_courts,
    broadcast_kort_state,
    broadcast_snapshot,
    buckets,
    ensure_court_state,
    event_broker,
    get_kort_for_overlay,
    get_overlay_for_kort,
    get_uno_auto_disabled_reason,
    get_uno_hourly_usage_summary,
    log_state_summary,
    load_match_history,
    is_uno_requests_enabled,
    is_plugin_enabled,
    get_uno_rate_limit_info,
    is_known_kort,
    normalize_kort_id,
    persist_state_cache,
    reset_after_match,
    refresh_uno_requests_setting,
    refresh_courts_from_db,
    record_log_entry,
    set_uno_requests_enabled,
    set_plugin_enabled,
    serialize_court_state,
    serialize_history,
    serialize_public_snapshot,
    STATE_LOCK,
    validate_command,
    refresh_plugin_setting,
    update_uno_rate_limit,
    record_uno_request,
)
from .poller import sync_poller_state
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


def _serialize_player(record: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "list_name": record.get("list_name"),
        "flag_code": record.get("flag_code"),
        "flag_url": record.get("flag_url"),
    }


def _public_player_payload(record: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "flag": record.get("flag_code"),
        "flagUrl": record.get("flag_url"),
        "list": record.get("list_name"),
    }


FLAG_PLUGIN_CACHE: Dict[str, str] = {}
FLAG_PLUGIN_MTIME: Optional[float] = None
FLAG_PLUGIN_LOCK = Lock()
FLAG_CODE_PATTERN = re.compile(r"^[a-z]{2}$")


def _plugin_players_path() -> Optional[str]:
    candidate = os.path.join(DOWNLOAD_DIR, "players.json")
    return candidate if os.path.isfile(candidate) else None


def _load_plugin_flag_catalog() -> Dict[str, str]:
    global FLAG_PLUGIN_CACHE, FLAG_PLUGIN_MTIME
    path = _plugin_players_path()
    try:
        mtime = os.path.getmtime(path) if path else None
    except OSError:
        mtime = None
    with FLAG_PLUGIN_LOCK:
        if FLAG_PLUGIN_CACHE and FLAG_PLUGIN_MTIME == mtime:
            return dict(FLAG_PLUGIN_CACHE)
        mapping: Dict[str, str] = {}
        if path and mtime is not None:
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                if isinstance(payload, list):
                    for entry in payload:
                        if not isinstance(entry, dict):
                            continue
                        raw_code = entry.get("flag") or entry.get("flag_code")
                        raw_url = entry.get("flagUrl") or entry.get("flag_url")
                        if not isinstance(raw_code, str):
                            continue
                        code = raw_code.strip().lower()
                        if not code or not FLAG_CODE_PATTERN.fullmatch(code):
                            continue
                        url_text = str(raw_url or "").strip()
                        if not url_text:
                            continue
                        mapping.setdefault(code, url_text)
            except (OSError, ValueError) as exc:
                log.warning("Nie udało się odczytać listy flag z wtyczki: %s", exc)
        FLAG_PLUGIN_CACHE.clear()
        FLAG_PLUGIN_CACHE.update(mapping)
        FLAG_PLUGIN_MTIME = mtime
        return dict(mapping)


def _flag_catalog() -> Dict[str, str]:
    catalog = _load_plugin_flag_catalog()
    for record in fetch_players():
        raw_code = record.get("flag_code")
        raw_url = record.get("flag_url")
        if not isinstance(raw_code, str):
            continue
        code = raw_code.strip().lower()
        if not code or not FLAG_CODE_PATTERN.fullmatch(code):
            continue
        url_text = str(raw_url or "").strip()
        if not url_text:
            continue
        catalog.setdefault(code, url_text)
    return catalog


def _lookup_flag_url(code: Optional[str]) -> Optional[str]:
    if not code or not isinstance(code, str):
        return None
    normalized = code.strip().lower()
    if not normalized or not FLAG_CODE_PATTERN.fullmatch(normalized):
        return None
    return _flag_catalog().get(normalized)


def _serialize_flags_catalog() -> List[Dict[str, str]]:
    catalog = _flag_catalog()
    return [
        {"code": code, "url": url, "label": code.upper()}
        for code, url in sorted(catalog.items())
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


def _sanitize_player_payload(payload: Dict[str, object], *, partial: bool = False) -> Dict[str, Optional[str]]:
    if not isinstance(payload, dict):
        raise ValueError("payload")
    sanitized: Dict[str, Optional[str]] = {}
    if not partial or "name" in payload:
        value = payload.get("name")
        if not isinstance(value, str) or not value.strip():
            raise ValueError("name")
        sanitized["name"] = value.strip()
    if "list_name" in payload or not partial:
        raw_list = payload.get("list_name") if "list_name" in payload else "default"
        if raw_list is None:
            sanitized["list_name"] = "default"
        elif not isinstance(raw_list, str):
            raise ValueError("list_name")
        else:
            text = raw_list.strip()
            sanitized["list_name"] = text or "default"
    if "flag_code" in payload:
        raw_code = payload.get("flag_code")
        if raw_code is None:
            sanitized["flag_code"] = None
        elif not isinstance(raw_code, str):
            raise ValueError("flag_code")
        else:
            text = raw_code.strip().lower()
            if text and not re.fullmatch(r"[a-z]{2}", text):
                raise ValueError("flag_code")
            sanitized["flag_code"] = text or None
    if "flag_url" in payload:
        raw_url = payload.get("flag_url")
        if raw_url is None:
            sanitized["flag_url"] = None
        elif not isinstance(raw_url, str):
            raise ValueError("flag_url")
        else:
            sanitized["flag_url"] = raw_url.strip() or None
    suggested_code = sanitized.get("flag_code")
    if suggested_code:
        provided_flag_url = payload.get("flag_url") if isinstance(payload, dict) else None
        wants_suggestion = "flag_url" not in payload or provided_flag_url in (None, "")
        if wants_suggestion and not sanitized.get("flag_url"):
            suggested_url = _lookup_flag_url(suggested_code)
            if suggested_url:
                sanitized["flag_url"] = suggested_url
    return sanitized


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
    players = fetch_players() if is_authenticated else []
    return render_file_template(
        "admin.html",
        is_authenticated=is_authenticated,
        history=history,
        courts=courts,
        players=players,
        uno_requests_enabled=is_uno_requests_enabled(),
        plugin_enabled=is_plugin_enabled(),
        uno_rate_limit=get_uno_rate_limit_info(),
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
    if updated:
        load_match_history()
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
    if deleted:
        load_match_history()
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
    sync_poller_state()
    broadcast_snapshot(include_history=True)
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
    sync_poller_state()
    broadcast_snapshot(include_history=True)
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


@admin_api_blueprint.route("/players", methods=["GET"])
def admin_api_players_list():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    list_name = request.args.get("list")
    players = fetch_players(list_name)
    return jsonify({"ok": True, "players": [_serialize_player(player) for player in players]})


@admin_api_blueprint.route("/flags", methods=["GET"])
def admin_api_flags_list():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    return jsonify({"ok": True, "flags": _serialize_flags_catalog()})


@admin_api_blueprint.route("/players", methods=["POST"])
def admin_api_players_create():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400
    try:
        sanitized = _sanitize_player_payload(payload)
    except ValueError as exc:
        return (
            jsonify({"ok": False, "error": "invalid-field", "field": str(exc)}),
            400,
        )
    player_id = insert_player(
        sanitized.get("name", ""),
        sanitized.get("list_name"),
        sanitized.get("flag_code"),
        sanitized.get("flag_url"),
    )
    record = fetch_player(player_id)
    players = fetch_players()
    return jsonify(
        {
            "ok": True,
            "player": _serialize_player(record or {}),
            "players": [_serialize_player(player) for player in players],
        }
    )


@admin_api_blueprint.route("/players/import", methods=["POST"])
def admin_api_players_import():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    uploaded = request.files.get("file")
    if uploaded is None:
        return jsonify({"ok": False, "error": "missing-file"}), 400
    try:
        raw_bytes = uploaded.read() or b""
    except OSError:
        return jsonify({"ok": False, "error": "invalid-file"}), 400
    if not raw_bytes:
        return jsonify({"ok": False, "error": "empty-file"}), 400
    text = raw_bytes.decode("utf-8-sig", errors="ignore")
    imported = 0
    skipped = 0
    errors: List[int] = []
    for idx, line in enumerate(text.splitlines(), start=1):
        cleaned = line.strip()
        if not cleaned:
            continue
        parts = cleaned.split()
        if len(parts) < 3:
            skipped += 1
            errors.append(idx)
            continue
        code_candidate = parts[-1].strip().lower()
        if not FLAG_CODE_PATTERN.fullmatch(code_candidate):
            skipped += 1
            errors.append(idx)
            continue
        name = " ".join(parts[:-1]).strip()
        if not name:
            skipped += 1
            errors.append(idx)
            continue
        flag_url = _lookup_flag_url(code_candidate)
        try:
            insert_player(name, None, code_candidate, flag_url)
            imported += 1
        except Exception as exc:
            log.warning("Nie udało się zaimportować zawodnika (wiersz %s): %s", idx, exc)
            skipped += 1
            errors.append(idx)
    players = fetch_players()
    return jsonify(
        {
            "ok": True,
            "imported": imported,
            "skipped": skipped,
            "errors": errors,
            "players": [_serialize_player(player) for player in players],
        }
    )


@admin_api_blueprint.route("/players/<int:player_id>", methods=["PUT"])
def admin_api_players_update(player_id: int):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    existing = fetch_player(player_id)
    if not existing:
        return jsonify({"ok": False, "error": "not-found"}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400
    try:
        sanitized = _sanitize_player_payload(payload, partial=True)
    except ValueError as exc:
        return (
            jsonify({"ok": False, "error": "invalid-field", "field": str(exc)}),
            400,
        )
    if not sanitized:
        return jsonify({"ok": False, "error": "no-updates"}), 400
    try:
        updated = update_player(player_id, sanitized)
    except ValueError as exc:
        return (
            jsonify({"ok": False, "error": "invalid-field", "field": str(exc)}),
            400,
        )
    refreshed = fetch_player(player_id)
    return jsonify(
        {
            "ok": True,
            "updated": bool(updated),
            "player": _serialize_player(refreshed or existing),
        }
    )


@admin_api_blueprint.route("/players/<int:player_id>", methods=["DELETE"])
def admin_api_players_delete(player_id: int):
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    existing = fetch_player(player_id)
    if not existing:
        return jsonify({"ok": False, "error": "not-found"}), 404
    deleted = delete_player(player_id)
    players = fetch_players()
    return jsonify(
        {
            "ok": True,
            "deleted": bool(deleted),
            "player": _serialize_player(existing),
            "players": [_serialize_player(player) for player in players],
        }
    )


@admin_api_blueprint.route("/system", methods=["GET"])
def admin_api_system_settings():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    return jsonify(
        {
            "ok": True,
            "uno_requests_enabled": is_uno_requests_enabled(),
            "plugin_enabled": is_plugin_enabled(),
            "uno_rate_limit": get_uno_rate_limit_info(),
            "uno_auto_disabled_reason": get_uno_auto_disabled_reason(),
            "uno_hourly_usage": get_uno_hourly_usage_summary(),
        }
    )


@admin_api_blueprint.route("/system", methods=["PUT"])
def admin_api_system_update():
    auth_error = _require_admin_session_json()
    if auth_error is not None:
        return auth_error
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "invalid-payload"}), 400

    response_payload = {"ok": True}

    if "uno_requests_enabled" in payload:
        value = payload.get("uno_requests_enabled")
        enabled = bool(value) if isinstance(value, bool) else None
        if enabled is None:
            if isinstance(value, (str, int)):
                text = str(value).strip().lower()
                if text in {"1", "true", "yes", "on"}:
                    enabled = True
                elif text in {"0", "false", "no", "off"}:
                    enabled = False
        if enabled is None:
            return jsonify({"ok": False, "error": "invalid-field", "field": "uno_requests_enabled"}), 400
        set_uno_requests_enabled(enabled)
        refresh_uno_requests_setting()
        sync_poller_state()
        response_payload["uno_requests_enabled"] = is_uno_requests_enabled()

    if "plugin_enabled" in payload:
        value = payload.get("plugin_enabled")
        enabled = bool(value) if isinstance(value, bool) else None
        if enabled is None:
            if isinstance(value, (str, int)):
                text = str(value).strip().lower()
                if text in {"1", "true", "yes", "on"}:
                    enabled = True
                elif text in {"0", "false", "no", "off"}:
                    enabled = False
        if enabled is None:
            return jsonify({"ok": False, "error": "invalid-field", "field": "plugin_enabled"}), 400
        set_plugin_enabled(enabled)
        refresh_plugin_setting()
        response_payload["plugin_enabled"] = is_plugin_enabled()

    response_payload["uno_rate_limit"] = get_uno_rate_limit_info()
    response_payload["uno_auto_disabled_reason"] = get_uno_auto_disabled_reason()
    response_payload["uno_hourly_usage"] = get_uno_hourly_usage_summary()

    return jsonify(response_payload)


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


@blueprint.route("/api/players")
def api_players():
    list_name = request.args.get("list")
    all_players = fetch_players()
    normalized_list = None
    if list_name is not None:
        normalized_list = list_name.strip()
        if not normalized_list:
            normalized_list = "default"
    if normalized_list:
        filtered_players = [
            player
            for player in all_players
            if (player.get("list_name") or "default") == normalized_list
        ]
    else:
        filtered_players = all_players
    available_lists = sorted({(player.get("list_name") or "default") for player in all_players})
    payload = {
        "ok": True,
        "generated_at": now_iso(),
        "count": len(filtered_players),
        "players": [_public_player_payload(player) for player in filtered_players],
        "lists": available_lists,
    }
    if normalized_list:
        payload["list"] = normalized_list
    return jsonify(payload)


@blueprint.route("/api/snapshot")
def api_snapshot():
    return jsonify(serialize_public_snapshot())


@blueprint.route("/api/stream")
def api_stream():
    log.info("stream connection from %s", request.remote_addr)

    def event_stream():
        queue_obj = event_broker.listen()
        try:
            snapshot_payload = {
                "type": "snapshot",
                "ts": now_iso(),
                "state": serialize_public_snapshot(),
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


UNO_GET_TO_SET_MAP: Dict[str, str] = {
    "GetPointsPlayerA": "SetPointsPlayerA",
    "GetPointsPlayerB": "SetPointsPlayerB",
    "GetCurrentSetPlayerA": "SetCurrentSetPlayerA",
    "GetCurrentSetPlayerB": "SetCurrentSetPlayerB",
    "GetSet1PlayerA": "SetSet1PlayerA",
    "GetSet1PlayerB": "SetSet1PlayerB",
    "GetSet2PlayerA": "SetSet2PlayerA",
    "GetSet2PlayerB": "SetSet2PlayerB",
    "GetTieBreakPlayerA": "SetTieBreakPlayerA",
    "GetTieBreakPlayerB": "SetTieBreakPlayerB",
    "GetTieBreakVisibility": "SetTieBreakVisibility",
    "GetNamePlayerA": "SetNamePlayerA",
    "GetNamePlayerB": "SetNamePlayerB",
}


def _extract_uno_value(payload: Any) -> Any:
    current = payload
    visited: Set[int] = set()
    while True:
        if current is None:
            return None
        if isinstance(current, (str, int, float, bool)):
            return current
        obj_id = id(current)
        if obj_id in visited:
            return current
        visited.add(obj_id)
        if isinstance(current, dict):
            for key in (
                "value",
                "Value",
                "payload",
                "Payload",
                "text",
                "Text",
                "current",
                "Current",
                "currentValue",
                "current_value",
                "data",
                "Data",
                "result",
                "Result",
                "response",
                "Response",
                "returnValue",
                "return_value",
            ):
                if key in current:
                    current = current[key]
                    break
            else:
                return current
        elif isinstance(current, (list, tuple)):
            if not current:
                return None
            if len(current) == 1:
                current = current[0]
            else:
                return current
        else:
            return current


def _derive_local_uno_command(command: str, response_payload: Any) -> Optional[Tuple[str, Any]]:
    mapped = UNO_GET_TO_SET_MAP.get(command)
    if not mapped:
        return None
    derived_value = _extract_uno_value(response_payload)
    if derived_value is None:
        return None
    return mapped, derived_value


def _send_flag_update_to_uno(
    url: str,
    method: str,
    field_id: str,
    flag_url: str,
) -> Tuple[bool, Optional[int], Optional[object]]:
    if not is_uno_requests_enabled():
        log.info(
            "flag push skipped url=%s field=%s reason=uno-disabled",
            shorten(url),
            field_id,
        )
        return False, None, {"error": "uno-disabled"}
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
        update_uno_rate_limit(response.headers)
    except requests.RequestException as exc:
        record_uno_request(False, None, "SetCustomizationField")
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
    record_uno_request(success, None, "SetCustomizationField")
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

    kort_id: Optional[str] = None
    if overlay_id:
        kort_id = get_kort_for_overlay(overlay_id)
    if not kort_id:
        kort_raw = payload.get("kort")
        if kort_raw is not None:
            kort_id = normalize_kort_id(kort_raw) or str(kort_raw)
    if not kort_id and overlay_id:
        kort_id = overlay_id
    if not kort_id:
        return jsonify({"ok": False, "error": "unknown kort"}), 400
    kort_id = normalize_kort_id(kort_id) or str(kort_id)

    body = payload.get("unoBody")
    if not isinstance(body, dict):
        body = {}
    # prefer structured body but accept top-level command/value
    command = body.get("command") or payload.get("command")
    value = body.get("value")
    extras = {k: v for k, v in body.items() if k not in {"command", "value"}}

    ts = payload.get("mirroredAt") or now_iso()

    # Log and skip applying any state changes coming from browser plugins.
    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        entry = record_log_entry(
            state,
            kort_id,
            "mirror",
            command or "unknown",
            safe_copy(value),
            {"skipped": "plugin-mirror-disabled", "overlay": overlay_id} if overlay_id else {"skipped": "plugin-mirror-disabled"},
            ts,
        )
        response_state = serialize_court_state(state)
        persist_state_cache(kort_id, state)

    log.info("mirror skipped kort=%s overlay=%s command=%s", kort_id, overlay_id, command)

    return jsonify({"ok": True, "kort": kort_id, "overlay": overlay_id, "command": command, "ts": ts, "state": response_state, "log": entry})


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

    overlay_hint = extras_dict.pop("overlay", None)
    extras_dict.pop("kort", None)

    raw_uno_url = extras_dict.pop("unoUrl", None)
    if raw_uno_url is None:
        raw_uno_url = extras_dict.pop("uno_url", None)
    raw_uno_method = extras_dict.pop("unoMethod", None)
    if raw_uno_method is None:
        raw_uno_method = extras_dict.pop("uno_method", None)
    extras_dict.pop("unoToken", None)
    extras_dict.pop("uno_token", None)
    extras_dict.pop("unoApp", None)
    extras_dict.pop("uno_app", None)
    extras_dict.pop("reflectedAt", None)
    extras_dict.pop("mirroredAt", None)

    extras = extras_dict or None
    extras_copy = safe_copy(extras)

    overlay_normalized = normalize_overlay_id(overlay_hint) if overlay_hint else None
    normalized_uno_url = _normalize_uno_api_url(raw_uno_url)
    uno_method = _normalize_uno_method(raw_uno_method)

    log_extras = safe_copy(extras)
    if isinstance(log_extras, dict):
        log_extras = dict(log_extras)
    elif log_extras is None:
        log_extras = None
    else:
        log_extras = {"value": log_extras}

    if overlay_normalized:
        if log_extras is None:
            log_extras = {"overlay": overlay_normalized}
        else:
            log_extras.setdefault("overlay", overlay_normalized)

    flag_push_plans: List[Dict[str, str]] = []
    if command in {"SetNamePlayerA", "SetNamePlayerB"} and isinstance(extras, dict):
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
                if not target_url and overlay_normalized:
                    target_url = f"{settings.overlay_base}/{overlay_normalized}/api"
                if target_url:
                    field_id = "Player A Flag" if command.endswith("A") else "Player B Flag"
                    flag_push_plans.append(
                        {
                            "url": target_url,
                            "method": uno_method,
                            "field": field_id,
                            "value": flag_value,
                        }
                    )
                    if isinstance(log_extras, dict):
                        log_extras.setdefault("flag_url", flag_value)
                else:
                    log.info(
                        "reflect flag push skipped kort=%s command=%s reason=no-endpoint",
                        kort_id,
                        command,
                    )

    if isinstance(log_extras, dict) and not log_extras:
        log_extras = None

    ts = now_iso()
    plugin_enabled = is_plugin_enabled()

    if not plugin_enabled:
        extras_with_skip = {**(log_extras or {}), "skipped": "plugin-reflect-disabled"}
        with STATE_LOCK:
            state = ensure_court_state(kort_id)
            entry = record_log_entry(state, kort_id, "reflect", command, value, extras_with_skip, ts)
            response_state = serialize_court_state(state)
            persist_state_cache(kort_id, state)

        log.info("reflect skipped kort=%s command=%s", kort_id, command)
        return jsonify({"ok": True, "changed": False, "state": response_state, "log": entry})

    extras_for_log = dict(log_extras) if isinstance(log_extras, dict) else {}
    changed = False
    flag_updates_copy: Optional[Dict[str, Dict[str, Optional[str]]]] = None

    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        try:
            changed, flag_updates = apply_local_command(state, command, value, extras, kort_id)
            flag_updates_copy = safe_copy(flag_updates) if flag_updates else None
        except Exception as exc:  # noqa: BLE001
            log.warning("reflect apply failed kort=%s command=%s error=%s", kort_id, command, exc)
            flag_updates = None
        if flag_updates_copy:
            extras_for_log.setdefault("flag_updates", flag_updates_copy)
        entry = record_log_entry(
            state,
            kort_id,
            "reflect",
            command,
            value,
            extras_for_log or None,
            ts,
        )
        state["updated"] = ts
        persist_state_cache(kort_id, state)
        response_state = serialize_court_state(state)
        log_state_summary(kort_id, state, "reflect state")

    # Attempt to keep track of UNO customization flags when available.
    target_url = normalized_uno_url or _api_endpoint(kort_id)
    if not target_url and overlay_normalized:
        target_url = f"{settings.overlay_base}/{overlay_normalized}/api"

    if flag_updates_copy and target_url:
        for side, updates in flag_updates_copy.items():
            if not isinstance(updates, dict):
                continue
            flag_url_candidate = updates.get("flag_url")
            if not flag_url_candidate:
                continue
            field_id = "Player A Flag" if side == "A" else "Player B Flag"
            already_planned = any(plan.get("field") == field_id for plan in flag_push_plans)
            if not already_planned:
                flag_push_plans.append(
                    {
                        "url": target_url,
                        "method": uno_method,
                        "field": field_id,
                        "value": flag_url_candidate,
                    }
                )

    flag_push_results: List[Dict[str, Any]] = []
    for plan in flag_push_plans:
        ok, status_code, payload = _send_flag_update_to_uno(
            plan["url"],
            plan["method"],
            plan["field"],
            plan["value"],
        )
        flag_push_results.append(
            {
                "ok": ok,
                "status": status_code,
                "field": plan["field"],
                "url": shorten(plan["url"]),
                "response": shorten(payload),
            }
        )

    broadcast_kort_state(kort_id, "reflect", command, value, extras_copy, ts)

    if flag_push_results:
        entry_extras = entry.get("extras") or {}
        entry_extras = dict(entry_extras)
        entry_extras.setdefault("flag_push", flag_push_results)
        entry["extras"] = entry_extras

    log.info("reflect applied kort=%s command=%s changed=%s flag_pushes=%s", kort_id, command, changed, len(flag_push_results))
    return jsonify(
        {
            "ok": True,
            "changed": bool(changed),
            "state": response_state,
            "log": entry,
            "flag_push": flag_push_results or None,
        }
    )


@blueprint.route("/api/uno/exec/<kort_id>", methods=["POST"])
def api_uno_exec(kort_id: str):
    normalized_id = normalize_kort_id(kort_id)
    if normalized_id:
        kort_id = normalized_id
    if not is_known_kort(kort_id):
        return jsonify({"error": "unknown kort"}), 404
    if not is_uno_requests_enabled():
        log.info("uno kort=%s command=%s skipped reason=disabled", kort_id, request.json.get("command") if request.is_json else None)
        return (
            jsonify(
                {
                    "error": "uno-disabled",
                    "message": "Wysyłanie zapytań do UNO jest obecnie wyłączone.",
                }
            ),
            503,
        )

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid payload"}), 400

    command = payload.get("command")
    if not isinstance(command, str) or not command.strip():
        return jsonify({"error": "command required"}), 400

    bucket = buckets.get(kort_id)
    if bucket and not bucket.take():
        log.warning("uno kort=%s command=%s skipped reason=rate-limited", kort_id, command)
        return jsonify({"error": "rate limited"}), 429

    endpoint = _api_endpoint(kort_id)
    if not endpoint:
        log.warning("uno kort=%s command=%s skipped reason=overlay-missing", kort_id, command)
        return jsonify({"error": "overlay-missing"}), 400

    ts = now_iso()
    request_value = payload.get("value")
    extras_dict = {k: v for k, v in payload.items() if k not in {"command", "value"}}
    extras = extras_dict or None
    payload_copy = safe_copy(payload)
    extras_copy = safe_copy(extras)

    status_code: Optional[int] = None
    response_payload: Any = None
    error_message: Optional[str] = None

    try:
        log.debug("uno kort=%s command=%s sending to %s", kort_id, command, shorten(endpoint))
        response = requests.put(
            endpoint,
            headers=settings.auth_header,
            json=payload,
            timeout=5,
        )
        update_uno_rate_limit(response.headers)
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

    local_command = command
    local_value = request_value
    derived_from_response = False
    if success and request_value is None:
        mapped = _derive_local_uno_command(command, response_payload)
        if mapped:
            derived_from_response = True
            local_command, local_value = mapped

    value_copy = safe_copy(local_value)

    auto_disable_reason = record_uno_request(success, kort_id, command)

    broadcast_extras = extras_copy if isinstance(extras_copy, dict) else extras_copy
    if isinstance(broadcast_extras, dict) and command != local_command:
        broadcast_extras = dict(broadcast_extras)
        broadcast_extras.setdefault("uno_original_command", command)

    log_extras: Optional[Dict[str, Any]]
    if extras_copy is None:
        log_extras = {
            "uno_status": status_code,
            "uno_response": safe_response,
        }
    else:
        log_extras = dict(extras_copy)
        log_extras["uno_status"] = status_code
        log_extras["uno_response"] = safe_response
    if command != local_command:
        if log_extras is None:
            log_extras = {"uno_original_command": command}
        else:
            log_extras.setdefault("uno_original_command", command)
    if derived_from_response:
        if log_extras is None:
            log_extras = {"uno_value_source": "response"}
        else:
            log_extras.setdefault("uno_value_source", "response")
    if error_message:
        if log_extras is None:
            log_extras = {"uno_error": error_message}
        else:
            log_extras["uno_error"] = error_message
    if auto_disable_reason:
        if log_extras is None:
            log_extras = {"uno_auto_disabled": auto_disable_reason}
        else:
            log_extras.setdefault("uno_auto_disabled", auto_disable_reason)

    with STATE_LOCK:
        state = ensure_court_state(kort_id)
        if success:
            try:
                apply_local_command(state, local_command, local_value, extras, kort_id)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "failed to apply local command mirror kort=%s command=%s error=%s",
                    kort_id,
                    local_command,
                    exc,
                )
        uno_state = state["uno"]
        uno_state["last_remote_command"] = command
        uno_state["last_command"] = local_command
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
            local_command,
            value_copy,
            log_extras or None,
            ts,
        )
        response_state = serialize_court_state(state)

        log_state_summary(kort_id, state, "uno state")

    broadcast_kort_state(
        kort_id,
        "uno",
        local_command,
        value_copy,
        broadcast_extras,
        ts,
        status_code,
    )
    if auto_disable_reason:
        log.warning("UNO auto-disabled kort=%s reason=%s", kort_id, auto_disable_reason)
        sync_poller_state()

    if success:
        if local_command != command:
            log.info(
                "uno kort=%s remote=%s applied=%s status=%s",
                kort_id,
                command,
                local_command,
                status_code,
            )
        else:
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
