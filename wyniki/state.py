"""State management, event broadcasting and match logic."""
from __future__ import annotations

import json
import queue
import re
import threading
import time
from datetime import datetime, timezone, timedelta
from collections import deque
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from .config import settings, log
from .database import (
    delete_latest_history_entry,
    fetch_app_settings,
    fetch_courts,
    fetch_recent_history,
    fetch_state_cache,
    find_player_by_surname,
    insert_match_history,
    delete_state_cache_entries,
    upsert_app_settings,
    upsert_court,
    upsert_state_cache,
)
from .utils import (
    as_int,
    format_duration,
    now_iso,
    parse_iso_datetime,
    safe_copy,
    shorten,
    step_points,
    surname,
    to_bool,
)


class EventBroker:
    def __init__(self) -> None:
        self.listeners: set[queue.Queue] = set()
        self.lock = threading.Lock()

    def listen(self) -> queue.Queue:
        listener: queue.Queue = queue.Queue(maxsize=25)
        with self.lock:
            self.listeners.add(listener)
        return listener

    def discard(self, listener: queue.Queue) -> None:
        with self.lock:
            self.listeners.discard(listener)

    def broadcast(self, payload: Dict[str, Any]) -> None:
        with self.lock:
            listeners = list(self.listeners)
        for listener in listeners:
            try:
                listener.put_nowait(payload)
            except queue.Full:
                continue


event_broker = EventBroker()

POINT_SEQUENCE = ["0", "15", "30", "40", "ADV"]
STATE_LOCK = threading.Lock()
GLOBAL_LOG: Deque[Dict[str, Any]] = deque()
GLOBAL_HISTORY: Deque[Dict[str, Any]] = deque(maxlen=settings.match_history_size)

UNO_REQUESTS_LOCK = threading.Lock()
UNO_REQUESTS_ENABLED = False
UNO_AUTO_DISABLED_REASON: Optional[str] = None
PLUGIN_LOCK = threading.Lock()
PLUGIN_ENABLED = False
UNO_RATE_LIMIT_LOCK = threading.Lock()
UNO_RATE_LIMIT_INFO: Dict[str, Optional[object]] = {
    "header": None,
    "raw": None,
    "limit": None,
    "remaining": None,
    "reset": None,
    "updated": None,
}
UNO_REQUEST_METRICS_LOCK = threading.Lock()
UNO_REQUEST_METRICS: Dict[str, Any] = {
    "bucket": None,
    "total": 0,
    "success": 0,
}
UNO_REQUEST_USAGE_LOCK = threading.Lock()
UNO_REQUEST_USAGE: Dict[str, Deque[datetime]] = {}
UNO_POLLING_CONFIG_LOCK = threading.Lock()

UNO_HOURLY_LIMIT_KEY = "uno_hourly_limit"
UNO_HOURLY_THRESHOLD_KEY = "uno_hourly_threshold"
UNO_HOURLY_FACTOR_KEY = "uno_hourly_slowdown_factor"
UNO_HOURLY_SLEEP_KEY = "uno_hourly_slowdown_sleep"


def _sanitize_threshold(value: float) -> float:
    if value > 1.0:
        value = value / 100.0
    return max(0.0, min(1.0, value))


DEFAULT_UNO_POLLING_CONFIG: Dict[str, float] = {
    "limit": float(max(0, int(settings.uno_hourly_limit_per_court))),
    "threshold": _sanitize_threshold(float(settings.uno_hourly_slowdown_threshold)),
    "slowdown_factor": float(max(1, int(settings.uno_hourly_slowdown_factor))),
    "slowdown_sleep": float(max(0.0, float(settings.uno_hourly_slowdown_sleep_seconds))),
}

# Internal copy guarded by ``UNO_POLLING_CONFIG_LOCK``
UNO_POLLING_CONFIG: Dict[str, float] = dict(DEFAULT_UNO_POLLING_CONFIG)


def _get_uno_config_values() -> Dict[str, float]:
    with UNO_POLLING_CONFIG_LOCK:
        return dict(UNO_POLLING_CONFIG)


def _parse_int_setting(value: Any, default: int, *, minimum: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default
    if parsed < minimum:
        return minimum
    return parsed


def _parse_float_setting(value: Any, default: float, *, minimum: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip().replace(",", ".")
    if not text:
        return default
    try:
        parsed = float(text)
    except ValueError:
        return default
    if parsed < minimum:
        return minimum
    return parsed


def _load_uno_hourly_config_from_db() -> Dict[str, float]:
    stored = fetch_app_settings(
        [
            UNO_HOURLY_LIMIT_KEY,
            UNO_HOURLY_THRESHOLD_KEY,
            UNO_HOURLY_FACTOR_KEY,
            UNO_HOURLY_SLEEP_KEY,
        ]
    )
    current = _get_uno_config_values()
    limit_default = int(current.get("limit", DEFAULT_UNO_POLLING_CONFIG["limit"]))
    factor_default = int(current.get("slowdown_factor", DEFAULT_UNO_POLLING_CONFIG["slowdown_factor"]))
    sleep_default = float(current.get("slowdown_sleep", DEFAULT_UNO_POLLING_CONFIG["slowdown_sleep"]))
    threshold_default = float(current.get("threshold", DEFAULT_UNO_POLLING_CONFIG["threshold"]))

    limit_value = _parse_int_setting(stored.get(UNO_HOURLY_LIMIT_KEY), limit_default, minimum=0)
    threshold_value = _sanitize_threshold(
        _parse_float_setting(stored.get(UNO_HOURLY_THRESHOLD_KEY), threshold_default)
    )
    factor_value = _parse_int_setting(
        stored.get(UNO_HOURLY_FACTOR_KEY), factor_default, minimum=1
    )
    sleep_value = _parse_float_setting(
        stored.get(UNO_HOURLY_SLEEP_KEY), sleep_default, minimum=0.0
    )

    return {
        "limit": float(limit_value),
        "threshold": threshold_value,
        "slowdown_factor": float(factor_value),
        "slowdown_sleep": float(sleep_value),
    }


def refresh_uno_hourly_config() -> Dict[str, Any]:
    loaded = _load_uno_hourly_config_from_db()
    with UNO_POLLING_CONFIG_LOCK:
        UNO_POLLING_CONFIG.update(loaded)
        current = dict(UNO_POLLING_CONFIG)
    return get_uno_hourly_config()


def get_uno_hourly_config() -> Dict[str, Any]:
    values = _get_uno_config_values()
    config = {
        "limit": int(values.get("limit", 0)),
        "threshold": float(values.get("threshold", 0.0)),
        "slowdown_factor": int(values.get("slowdown_factor", 1)),
        "slowdown_sleep": float(values.get("slowdown_sleep", 0.0)),
    }
    config["threshold_percent"] = round(config["threshold"] * 100.0, 2)
    return config


def update_uno_hourly_config(
    *,
    limit: Optional[int] = None,
    threshold: Optional[float] = None,
    slowdown_factor: Optional[int] = None,
    slowdown_sleep: Optional[float] = None,
) -> Dict[str, Any]:
    current = get_uno_hourly_config()
    new_config = dict(current)

    if limit is not None:
        if limit < 0:
            raise ValueError("limit must be >= 0")
        new_config["limit"] = int(limit)
    if threshold is not None:
        new_config["threshold"] = _sanitize_threshold(float(threshold))
    else:
        new_config["threshold"] = float(new_config["threshold"])
    if slowdown_factor is not None:
        if slowdown_factor < 1:
            raise ValueError("slowdown_factor must be >= 1")
        new_config["slowdown_factor"] = int(slowdown_factor)
    if slowdown_sleep is not None:
        if slowdown_sleep < 0:
            raise ValueError("slowdown_sleep must be >= 0")
        new_config["slowdown_sleep"] = float(slowdown_sleep)

    # Ensure derived field is consistent
    new_config["threshold_percent"] = round(new_config["threshold"] * 100.0, 2)

    with UNO_POLLING_CONFIG_LOCK:
        UNO_POLLING_CONFIG.update(
            {
                "limit": float(new_config["limit"]),
                "threshold": float(new_config["threshold"]),
                "slowdown_factor": float(new_config["slowdown_factor"]),
                "slowdown_sleep": float(new_config["slowdown_sleep"]),
            }
        )

    upsert_app_settings(
        {
            UNO_HOURLY_LIMIT_KEY: str(new_config["limit"]),
            UNO_HOURLY_THRESHOLD_KEY: f"{new_config['threshold']:.4f}",
            UNO_HOURLY_FACTOR_KEY: str(new_config["slowdown_factor"]),
            UNO_HOURLY_SLEEP_KEY: f"{new_config['slowdown_sleep']:.2f}",
        }
    )
    log.info(
        "UNO polling config updated limit=%s threshold=%.3f factor=%s sleep=%.2f",
        new_config["limit"],
        new_config["threshold"],
        new_config["slowdown_factor"],
        new_config["slowdown_sleep"],
    )
    return get_uno_hourly_config()


def _prune_usage(queue: Deque[datetime], cutoff: datetime) -> None:
    while queue and queue[0] < cutoff:
        queue.popleft()


def _record_hourly_usage(kort_id: str, timestamp: datetime) -> int:
    if not kort_id:
        return 0
    cutoff = timestamp - timedelta(hours=1)
    with UNO_REQUEST_USAGE_LOCK:
        queue = UNO_REQUEST_USAGE.setdefault(kort_id, deque())
        queue.append(timestamp)
        _prune_usage(queue, cutoff)
        return len(queue)


def get_uno_hourly_status(kort_id: str) -> Dict[str, Any]:
    timestamp = datetime.now(timezone.utc)
    cutoff = timestamp - timedelta(hours=1)
    with UNO_REQUEST_USAGE_LOCK:
        queue = UNO_REQUEST_USAGE.setdefault(kort_id, deque())
        _prune_usage(queue, cutoff)
        count = len(queue)
    config_values = _get_uno_config_values()
    limit = int(config_values.get("limit", DEFAULT_UNO_POLLING_CONFIG["limit"]))
    threshold = float(config_values.get("threshold", DEFAULT_UNO_POLLING_CONFIG["threshold"]))
    slowdown_factor = max(1, int(config_values.get("slowdown_factor", DEFAULT_UNO_POLLING_CONFIG["slowdown_factor"])) )
    slowdown_sleep = max(0.0, float(config_values.get("slowdown_sleep", DEFAULT_UNO_POLLING_CONFIG["slowdown_sleep"])) )
    if not is_uno_requests_enabled():
        return {
            "kort_id": kort_id,
            "count": count,
            "limit": limit,
            "remaining": limit - count if limit > 0 else None,
            "ratio": 0.0 if limit <= 0 else min(1.0, count / float(limit)),
            "threshold": threshold,
            "mode": "disabled",
            "slowdown_factor": slowdown_factor,
            "slowdown_sleep": slowdown_sleep,
        }
    if limit <= 0:
        return {
            "kort_id": kort_id,
            "count": count,
            "limit": limit,
            "remaining": None,
            "ratio": 0.0,
            "threshold": threshold,
            "mode": "unlimited",
            "slowdown_factor": slowdown_factor,
            "slowdown_sleep": slowdown_sleep,
        }
    ratio = count / float(limit)
    remaining = max(0, limit - count)
    if ratio >= 1.0:
        mode = "limit"
    elif ratio >= threshold:
        mode = "slowdown"
    else:
        mode = "normal"
    return {
        "kort_id": kort_id,
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "ratio": ratio,
        "threshold": threshold,
        "mode": mode,
        "slowdown_factor": slowdown_factor,
        "slowdown_sleep": slowdown_sleep,
    }


def get_uno_hourly_usage_summary() -> Dict[str, Dict[str, Any]]:
    summary: Dict[str, Dict[str, Any]] = {}
    for kort_id, _ in available_courts():
        summary[kort_id] = get_uno_hourly_status(kort_id)
    return summary
CANDIDATE_RATE_LIMIT_HEADERS = (
    "rate-limit-daily",
    "ratelimit-limit",
    "x-ratelimit-limit",
    "x-ratelimit-daily",
    "x-ratelimit-daily-limit",
    "x-uno-daily-limit",
    "x-daily-limit",
    "x-singular-ratelimit-daily-calls",
    "x-singular-ratelimit-daily",
    "x-singular-ratelimit-daily-limit",
)

DEFAULT_HISTORY_PHASE = "Grupowa"


def _load_uno_requests_setting() -> bool:
    stored = fetch_app_settings(["uno_requests_enabled"]).get("uno_requests_enabled")
    parsed = to_bool(stored)
    return bool(parsed) if parsed is not None else False


def _load_plugin_setting() -> bool:
    stored = fetch_app_settings(["plugin_enabled"]).get("plugin_enabled")
    parsed = to_bool(stored)
    return bool(parsed) if parsed is not None else False


def is_uno_requests_enabled() -> bool:
    with UNO_REQUESTS_LOCK:
        return UNO_REQUESTS_ENABLED


def get_uno_auto_disabled_reason() -> Optional[str]:
    with UNO_REQUESTS_LOCK:
        return UNO_AUTO_DISABLED_REASON


def is_plugin_enabled() -> bool:
    with PLUGIN_LOCK:
        return PLUGIN_ENABLED


def set_uno_requests_enabled(enabled: bool, reason: Optional[str] = None) -> None:
    normalized = bool(enabled)
    with UNO_REQUESTS_LOCK:
        global UNO_REQUESTS_ENABLED, UNO_AUTO_DISABLED_REASON
        UNO_REQUESTS_ENABLED = normalized
        if normalized:
            UNO_AUTO_DISABLED_REASON = None
        else:
            UNO_AUTO_DISABLED_REASON = reason
    upsert_app_settings({"uno_requests_enabled": "1" if normalized else "0"})
    if normalized:
        log.info("UNO requests enabled")
    elif reason:
        log.warning("UNO requests disabled reason=%s", reason)
    else:
        log.info("UNO requests disabled")


def set_plugin_enabled(enabled: bool) -> None:
    normalized = bool(enabled)
    with PLUGIN_LOCK:
        global PLUGIN_ENABLED
        PLUGIN_ENABLED = normalized
    upsert_app_settings({"plugin_enabled": "1" if normalized else "0"})
    log.info("Plugin messages %s", "enabled" if normalized else "disabled")


def refresh_uno_requests_setting() -> bool:
    new_value = _load_uno_requests_setting()
    with UNO_REQUESTS_LOCK:
        global UNO_REQUESTS_ENABLED, UNO_AUTO_DISABLED_REASON
        UNO_REQUESTS_ENABLED = new_value
        if new_value:
            UNO_AUTO_DISABLED_REASON = None
    return new_value


def refresh_plugin_setting() -> bool:
    new_value = _load_plugin_setting()
    with PLUGIN_LOCK:
        global PLUGIN_ENABLED
        PLUGIN_ENABLED = new_value
    return new_value


def update_uno_rate_limit(headers: Optional[Dict[str, str]]) -> None:
    if not headers:
        return
    normalized = {str(key).strip().lower(): str(value).strip() for key, value in headers.items() if key}
    header_key: Optional[str] = None
    for candidate in CANDIDATE_RATE_LIMIT_HEADERS:
        if candidate in normalized:
            header_key = candidate
            break
    if header_key is None:
        for key in normalized:
            if "limit" in key and "day" in key:
                header_key = key
                break
    if header_key is None:
        return
    raw_value = normalized.get(header_key)
    limit_value: Optional[int] = None
    remaining_value: Optional[int] = None
    reset_value: Optional[int] = None
    if raw_value:
        text = raw_value.strip()
        parsed: Optional[Dict[str, object]] = None
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
            except (ValueError, json.JSONDecodeError):  # type: ignore[attr-defined]
                parsed = None
        if isinstance(parsed, dict):
            raw_limit = parsed.get("limit")
            raw_remaining = parsed.get("remaining")
            raw_reset = parsed.get("reset")
            try:
                if raw_limit is not None:
                    limit_value = int(raw_limit)
            except (TypeError, ValueError):
                limit_value = None
            try:
                if raw_remaining is not None:
                    remaining_value = int(raw_remaining)
            except (TypeError, ValueError):
                remaining_value = None
            try:
                if raw_reset is not None:
                    reset_value = int(raw_reset)
            except (TypeError, ValueError):
                reset_value = None
        else:
            match_limit = re.search(r"\d+", text)
            if match_limit:
                try:
                    limit_value = int(match_limit.group())
                except ValueError:
                    limit_value = None
    with UNO_RATE_LIMIT_LOCK:
        UNO_RATE_LIMIT_INFO.update(
            {
                "header": header_key,
                "raw": raw_value,
                "limit": limit_value,
                "remaining": remaining_value,
                "reset": reset_value,
                "updated": now_iso(),
            }
        )


def _log_uno_request_summary(bucket: datetime, success: int, total: int) -> None:
    readable = bucket.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
    log.info("Zapytania do UNO %s: %s/%s", readable, success, total)


def record_uno_request(success: bool, kort_id: Optional[str] = None, command: Optional[str] = None) -> Optional[str]:
    now = datetime.now(timezone.utc)
    bucket = now.replace(second=0, microsecond=0)
    with UNO_REQUEST_METRICS_LOCK:
        current_bucket: Optional[datetime] = UNO_REQUEST_METRICS.get("bucket")
        if current_bucket is None:
            UNO_REQUEST_METRICS["bucket"] = bucket
            current_bucket = bucket
        elif bucket != current_bucket:
            total = int(UNO_REQUEST_METRICS.get("total") or 0)
            success_count = int(UNO_REQUEST_METRICS.get("success") or 0)
            if total:
                _log_uno_request_summary(current_bucket, success_count, total)
            UNO_REQUEST_METRICS["bucket"] = bucket
            UNO_REQUEST_METRICS["total"] = 0
            UNO_REQUEST_METRICS["success"] = 0
            current_bucket = bucket
        UNO_REQUEST_METRICS["total"] = int(UNO_REQUEST_METRICS.get("total") or 0) + 1
        if success:
            UNO_REQUEST_METRICS["success"] = int(UNO_REQUEST_METRICS.get("success") or 0) + 1
    auto_reason: Optional[str] = None
    if kort_id:
        count = _record_hourly_usage(kort_id, now)
        config_values = _get_uno_config_values()
        limit = int(config_values.get("limit", DEFAULT_UNO_POLLING_CONFIG["limit"]))
        if limit > 0 and count >= limit and is_uno_requests_enabled():
            auto_reason = (
                f"kort {kort_id} reached UNO hourly limit ({count}/{limit})"
            )
            set_uno_requests_enabled(False, auto_reason)
    return auto_reason


def get_uno_rate_limit_info() -> Dict[str, Optional[object]]:
    with UNO_RATE_LIMIT_LOCK:
        return dict(UNO_RATE_LIMIT_INFO)


class TokenBucket:
    def __init__(self, rpm: int, burst: int) -> None:
        self.capacity = max(1, burst)
        self.tokens = float(self.capacity)
        self.refill_per_sec = float(rpm) / 60.0
        self.lock = threading.Lock()
        self.last = time.monotonic()

    def take(self, count: int = 1) -> bool:
        with self.lock:
            now = time.monotonic()
            elapsed = now - self.last
            self.last = now
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
            if self.tokens >= count:
                self.tokens -= count
                return True
            return False


def _empty_player_state() -> Dict[str, Any]:
    return {
        "full_name": None,
        "surname": "-",
        "points": "0",
        "set1": 0,
        "set2": 0,
        "set3": 0,
        "current_games": 0,
        "flag_url": None,
        "flag_code": None,
        "flag_lookup_surname": None,
    }


def _empty_court_state() -> Dict[str, Any]:
    return {
        "overlay_visible": None,
        "mode": None,
        "serve": None,
        "current_set": 1,
        "match_time": {"seconds": 0, "running": False, "started_ts": None, "finished_ts": None},
        "match_status": {"active": False, "last_completed": None},
        "A": _empty_player_state(),
        "B": _empty_player_state(),
        "tie": {"visible": None, "A": 0, "B": 0, "locked": False},
        "history": [],
        "history_meta": {"category": None, "phase": DEFAULT_HISTORY_PHASE},
        "local": {"commands": {}, "updated": None},
        "uno": {
            "last_remote_command": None,
            "last_command": None,
            "last_value": None,
            "last_payload": None,
            "last_status": None,
            "last_response": None,
            "updated": None,
        },
        "log": deque(maxlen=settings.state_log_size),
        "updated": None,
    }


COURT_OVERLAYS: Dict[str, Optional[str]] = {}
OVERLAY_TO_KORT: Dict[str, str] = {}
snapshots: Dict[str, Dict[str, Any]] = {}
INITIAL_COURTS: List[str] = []
buckets: Dict[str, TokenBucket] = {}


def _kort_sort_key(value: str) -> Tuple[int, str]:
    try:
        return (0, int(value))
    except (TypeError, ValueError):
        return (1, str(value))


def _sorted_court_ids(values: Iterable[str]) -> List[str]:
    return sorted({str(value) for value in values}, key=_kort_sort_key)


def _courts_list_to_mapping(rows: Iterable[Dict[str, Optional[str]]]) -> Dict[str, Optional[str]]:
    mapping: Dict[str, Optional[str]] = {}
    for row in rows:
        kort_id = str(row.get("kort_id", "")).strip()
        if not kort_id:
            continue
        overlay_value = row.get("overlay_id")
        mapping[kort_id] = overlay_value or None
    return mapping


def _seed_courts_from_environment() -> Dict[str, Optional[str]]:
    seeded = False
    for kort_id, overlay_id in sorted(settings.overlay_ids.items(), key=lambda item: _kort_sort_key(item[0])):
        upsert_court(kort_id, overlay_id)
        seeded = True
    if not seeded:
        for idx in range(1, 5):
            upsert_court(str(idx), None)
        seeded = True
    if seeded:
        return _courts_list_to_mapping(fetch_courts())
    return {}


def _load_courts_with_seed(seed_if_empty: bool) -> Dict[str, Optional[str]]:
    mapping = _courts_list_to_mapping(fetch_courts())
    if mapping or not seed_if_empty:
        return mapping
    return _seed_courts_from_environment()


def _update_settings_overlay_cache(mapping: Dict[str, Optional[str]]) -> None:
    sanitized = {kort_id: overlay_id for kort_id, overlay_id in mapping.items() if overlay_id}
    object.__setattr__(settings, "overlay_ids", sanitized)
    object.__setattr__(settings, "overlay_id_to_kort", {overlay_id: kort_id for kort_id, overlay_id in sanitized.items()})


def _resize_global_log() -> None:
    global GLOBAL_LOG
    desired_maxlen = max(100, settings.state_log_size * max(1, len(snapshots) or 1))
    if GLOBAL_LOG.maxlen == desired_maxlen:
        return
    GLOBAL_LOG = deque(list(GLOBAL_LOG)[-desired_maxlen:], maxlen=desired_maxlen)


def _apply_court_configuration(mapping: Dict[str, Optional[str]]) -> None:
    global COURT_OVERLAYS, OVERLAY_TO_KORT, INITIAL_COURTS, buckets
    sorted_ids = _sorted_court_ids(mapping.keys())
    new_snapshots: Dict[str, Dict[str, Any]] = {}
    for kort_id in sorted_ids:
        state = snapshots.get(kort_id)
        if state is None:
            state = _empty_court_state()
        new_snapshots[kort_id] = state
    snapshots.clear()
    snapshots.update(new_snapshots)

    COURT_OVERLAYS = {kort_id: mapping.get(kort_id) for kort_id in sorted_ids}
    OVERLAY_TO_KORT = {
        overlay_id: kort_id for kort_id, overlay_id in COURT_OVERLAYS.items() if overlay_id
    }
    INITIAL_COURTS = list(sorted_ids)

    updated_buckets: Dict[str, TokenBucket] = {}
    for kort_id in INITIAL_COURTS:
        bucket = buckets.get(kort_id)
        if bucket is None:
            bucket = TokenBucket(settings.rpm_per_court, settings.burst)
        updated_buckets[kort_id] = bucket
    buckets.clear()
    buckets.update(updated_buckets)

    _update_settings_overlay_cache(COURT_OVERLAYS)
    _resize_global_log()


def _clean_history_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _extract_custom_field_value(value: Any, extras: Optional[Dict[str, Any]]) -> Any:
    if isinstance(value, dict) and "value" in value:
        return value.get("value")
    if isinstance(extras, dict):
        for key in ("value", "text", "label"):
            if extras.get(key) not in (None, ""):
                return extras.get(key)
    return value


def ensure_history_meta(state: Dict[str, Any]) -> Dict[str, Any]:
    meta = state.setdefault("history_meta", {})
    if "category" in meta:
        meta["category"] = _clean_history_text(meta.get("category"))
    else:
        meta["category"] = None
    phase_value = meta.get("phase")
    if phase_value is None:
        meta["phase"] = DEFAULT_HISTORY_PHASE
    else:
        cleaned_phase = str(phase_value).strip()
        meta["phase"] = cleaned_phase or DEFAULT_HISTORY_PHASE
    return meta


def refresh_courts_from_db(seed_if_empty: bool = False) -> Dict[str, Optional[str]]:
    mapping = _load_courts_with_seed(seed_if_empty)
    with STATE_LOCK:
        _apply_court_configuration(mapping)
        return dict(COURT_OVERLAYS)


def get_overlay_for_kort(kort_id: str) -> Optional[str]:
    return COURT_OVERLAYS.get(kort_id)


def get_kort_for_overlay(overlay_id: Optional[str]) -> Optional[str]:
    if not overlay_id:
        return None
    return OVERLAY_TO_KORT.get(str(overlay_id))


def courts_map() -> Dict[str, Optional[str]]:
    with STATE_LOCK:
        return dict(COURT_OVERLAYS)


refresh_courts_from_db(seed_if_empty=True)


def available_courts() -> List[Tuple[str, Optional[str]]]:
    with STATE_LOCK:
        return [(kort_id, COURT_OVERLAYS.get(kort_id)) for kort_id in INITIAL_COURTS]


def normalize_kort_id(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.isdigit():
        try:
            return str(int(text))
        except ValueError:
            pass
    normalized = text.lstrip("0")
    return normalized or text


def is_known_kort(kort_id: str) -> bool:
    if not kort_id:
        return False
    return kort_id in snapshots


def ensure_court_state(kort_id: str) -> Dict[str, Any]:
    state = snapshots.get(kort_id)
    if state is None:
        state = _empty_court_state()
        snapshots[kort_id] = state
    ensure_history_meta(state)
    return state


def serialize_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "overlay_visible": state["overlay_visible"],
        "mode": state["mode"],
        "serve": state["serve"],
        "current_set": state["current_set"],
        "match_time": dict(state["match_time"]),
        "match_status": dict(state["match_status"]),
        "A": dict(state["A"]),
        "B": dict(state["B"]),
        "tie": dict(state["tie"]),
        "history_meta": dict(ensure_history_meta(state)),
        "local": {
            "updated": state["local"].get("updated"),
            "commands": {cmd: dict(info) for cmd, info in state["local"].get("commands", {}).items()},
        },
        "uno": dict(state["uno"]),
        "log": list(state["log"]),
        "updated": state["updated"],
    }


def serialize_public_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "overlay_visible": state.get("overlay_visible"),
        "mode": state.get("mode"),
        "serve": state.get("serve"),
        "current_set": state.get("current_set"),
        "match_time": safe_copy(state.get("match_time")),
        "match_status": safe_copy(state.get("match_status")),
        "A": safe_copy(state.get("A")),
        "B": safe_copy(state.get("B")),
        "tie": safe_copy(state.get("tie")),
        "history_meta": safe_copy(ensure_history_meta(state)),
        "updated": state.get("updated"),
    }


def serialize_all_states() -> Dict[str, Any]:
    with STATE_LOCK:
        return {kort: serialize_court_state(state) for kort, state in snapshots.items()}


def serialize_public_snapshot() -> Dict[str, Any]:
    with STATE_LOCK:
        return {kort: serialize_public_court_state(state) for kort, state in snapshots.items()}


def broadcast_snapshot(include_history: bool = False) -> None:
    payload: Dict[str, Any] = {
        "type": "snapshot",
        "ts": now_iso(),
        "state": serialize_public_snapshot(),
    }
    if include_history:
        payload["history"] = serialize_history()
    event_broker.broadcast(payload)


def serialize_history_locked() -> List[Dict[str, Any]]:
    return [json.loads(json.dumps(entry)) for entry in list(GLOBAL_HISTORY)]


def serialize_history() -> List[Dict[str, Any]]:
    with STATE_LOCK:
        return serialize_history_locked()


def _state_for_cache(state: Dict[str, Any]) -> Dict[str, Any]:
    payload = serialize_court_state(state)
    payload["log"] = []
    return payload


def persist_state_cache(kort_id: str, state: Dict[str, Any]) -> None:
    payload = _state_for_cache(state)
    ts = payload.get("updated") or now_iso()
    try:
        encoded = json.loads(json.dumps(payload))
    except TypeError:
        encoded = json.loads(json.dumps(payload, default=str))
    log.info("persist cache kort=%s ts=%s", kort_id, ts)
    upsert_state_cache(kort_id, ts, encoded)


def hydrate_state_from_cache(kort_id: str, cached: Dict[str, Any]) -> None:
    state = ensure_court_state(kort_id)
    log.info("hydrate cache kort=%s", kort_id)
    fields = ("overlay_visible", "mode", "serve", "current_set", "updated")
    for key in fields:
        if key in cached:
            state[key] = cached[key]
    mt_in = cached.get("match_time")
    if isinstance(mt_in, dict):
        match_time, _ = ensure_match_struct(state)
        match_time.update(mt_in)
    status_in = cached.get("match_status")
    if isinstance(status_in, dict):
        _, status = ensure_match_struct(state)
        status.update(status_in)
    for side in ("A", "B"):
        side_in = cached.get(side)
        if isinstance(side_in, dict):
            state[side].update(side_in)
    tie_in = cached.get("tie")
    if isinstance(tie_in, dict):
        state["tie"].update(tie_in)
    history_in = cached.get("history")
    if isinstance(history_in, list):
        state["history"] = history_in[:]
    meta_in = cached.get("history_meta")
    meta = ensure_history_meta(state)
    if isinstance(meta_in, dict):
        if "category" in meta_in:
            meta["category"] = _clean_history_text(meta_in.get("category"))
        if "phase" in meta_in:
            meta["phase"] = _clean_history_text(meta_in.get("phase")) or DEFAULT_HISTORY_PHASE
    local_in = cached.get("local")
    if isinstance(local_in, dict):
        state["local"]["updated"] = local_in.get("updated")
        if isinstance(local_in.get("commands"), dict):
            state["local"]["commands"] = local_in["commands"]
    uno_in = cached.get("uno")
    if isinstance(uno_in, dict):
        state["uno"].update(uno_in)


def load_state_cache() -> None:
    known_courts = set(INITIAL_COURTS)
    stale_entries: List[str] = []
    for row in fetch_state_cache() or []:
        raw_kort = row["kort_id"]
        normalized_kort = normalize_kort_id(raw_kort) or (str(raw_kort).strip() if raw_kort is not None else None)
        if not normalized_kort or normalized_kort not in known_courts:
            stale_entries.append(str(raw_kort))
            continue
        try:
            payload = json.loads(row["state"])
        except (TypeError, ValueError, json.JSONDecodeError):  # type: ignore[attr-defined]
            continue
        hydrate_state_from_cache(normalized_kort, payload)
    if stale_entries:
        removed = delete_state_cache_entries(stale_entries)
        log.info("removed %s stale court cache entries: %s", removed, ",".join(sorted(set(stale_entries))))


def serialize_log_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    return json.loads(json.dumps(entry))


def record_log_entry(
    state: Dict[str, Any],
    kort_id: str,
    source: str,
    command: str,
    value: Any,
    extras: Optional[Dict[str, Any]],
    ts: str,
) -> Dict[str, Any]:
    log_entry: Dict[str, Any] = {
        "ts": ts,
        "source": source,
        "kort": kort_id,
        "command": command,
        "value": safe_copy(value),
        "extras": safe_copy(extras) if extras else None,
    }
    state.setdefault("log", deque(maxlen=settings.state_log_size)).append(log_entry)
    GLOBAL_LOG.append(log_entry)
    return log_entry


ALLOWED_COMMAND_PREFIXES = [
    "set",
    "increase",
    "decrease",
    "show",
    "hide",
    "toggle",
    "reset",
    "play",
    "pause",
]


def validate_command(command: Optional[str]) -> bool:
    if not isinstance(command, str):
        return False
    stripped = command.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    return any(lower.startswith(prefix) for prefix in ALLOWED_COMMAND_PREFIXES)


def ensure_match_struct(state: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    match_time = state.setdefault("match_time", {"seconds": 0, "running": False, "started_ts": None, "finished_ts": None})
    match_time.setdefault("started_ts", None)
    match_time.setdefault("finished_ts", None)
    match_time.setdefault("seconds", 0)
    match_time.setdefault("running", False)
    status = state.setdefault("match_status", {"active": False, "last_completed": None})
    status.setdefault("active", False)
    status.setdefault("last_completed", None)
    if "history" not in state or not isinstance(state["history"], list):
        state["history"] = []
    return match_time, status


load_state_cache()


def maybe_start_match(state: Dict[str, Any]) -> None:
    match_time, status = ensure_match_struct(state)
    if status.get("active") and match_time.get("running"):
        return
    if match_time.get("started_ts"):
        return
    set1_started = (state["A"].get("set1") or 0) > 0 or (state["B"].get("set1") or 0) > 0
    current_games_started = (
        (state["A"].get("current_games") or 0) > 0 or (state["B"].get("current_games") or 0) > 0
    ) and (state.get("current_set") in (None, 0, 1))
    if set1_started or current_games_started:
        iso = now_iso()
        match_time["started_ts"] = iso
        match_time["finished_ts"] = None
        match_time["seconds"] = 0
        match_time["running"] = True
        status["active"] = True


def update_match_timer(state: Dict[str, Any]) -> None:
    match_time, _ = ensure_match_struct(state)
    if not match_time.get("running"):
        return
    start = parse_iso_datetime(match_time.get("started_ts"))
    if start is None:
        iso = now_iso()
        match_time["started_ts"] = iso
        start = parse_iso_datetime(iso)
        if start is None:
            return
    now = now_iso()
    now_dt = parse_iso_datetime(now)
    if now_dt is None:
        return
    seconds = max(0, int((now_dt - start).total_seconds()))
    match_time["seconds"] = seconds
    match_time["finished_ts"] = now


def stop_match_timer(state: Dict[str, Any]) -> None:
    match_time, _ = ensure_match_struct(state)
    update_match_timer(state)
    match_time["running"] = False
    if not match_time.get("finished_ts"):
        match_time["finished_ts"] = now_iso()


def reset_tie_and_points(state: Dict[str, Any]) -> None:
    state.setdefault("tie", {})
    state["tie"]["A"] = 0
    state["tie"]["B"] = 0
    state["tie"]["locked"] = False
    state["A"]["points"] = "0"
    state["B"]["points"] = "0"


def reset_regular_points(state: Dict[str, Any]) -> None:
    state["A"]["points"] = "0"
    state["B"]["points"] = "0"


def lock_tie_updates(state: Dict[str, Any]) -> None:
    tie = state.get("tie")
    if isinstance(tie, dict):
        tie["locked"] = True


def tie_update_allowed(state: Dict[str, Any], new_value: int) -> bool:
    tie = state.get("tie")
    if not isinstance(tie, dict):
        return True
    if not tie.get("locked"):
        return True
    return new_value == 0


def count_short_set_wins(state: Dict[str, Any]) -> Dict[str, int]:
    wins = {"A": 0, "B": 0}
    for idx in (1, 2):
        key = f"set{idx}"
        try:
            games_a = int(state["A"].get(key) or 0)
        except (TypeError, ValueError):
            games_a = 0
        try:
            games_b = int(state["B"].get(key) or 0)
        except (TypeError, ValueError):
            games_b = 0
        winner = short_set_winner(games_a, games_b)
        if winner:
            wins[winner] += 1
    return wins


def short_set_winner(games_a: int, games_b: int) -> Optional[str]:
    if games_a == 4 and games_b <= 3:
        return "A"
    if games_b == 4 and games_a <= 3:
        return "B"
    return None


def maybe_update_current_set_indicator(state: Dict[str, Any]) -> Dict[str, int]:
    wins = count_short_set_wins(state)
    current = state.get("current_set") or 0
    if wins["A"] == 1 and wins["B"] == 1:
        if current != 3:
            state["current_set"] = 3
    elif wins["A"] >= 2 or wins["B"] >= 2:
        if current and current > 2:
            state["current_set"] = 2
    return wins


def _has_started_points(value: Any) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    if not text:
        return False
    return text not in {"0", "-"}


def _has_player_name(side_state: Dict[str, Any]) -> bool:
    full = side_state.get("full_name")
    if isinstance(full, str) and full.strip():
        return True
    surname_value = side_state.get("surname")
    return isinstance(surname_value, str) and surname_value.strip() not in {"", "-"}


def _normalized_surname(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    return text.lower()


def _maybe_lookup_flag_for_side(
    state: Dict[str, Any],
    side: str,
    *,
    prefer_existing_flag: bool = False,
) -> Optional[Dict[str, Optional[str]]]:
    side_state = state.get(side)
    if not isinstance(side_state, dict):
        return None

    current_surname = side_state.get("surname")
    normalized = _normalized_surname(current_surname)
    previous_lookup = side_state.get("flag_lookup_surname")

    existing_flag_url = side_state.get("flag_url")
    existing_flag_code = side_state.get("flag_code")

    updates: Dict[str, Optional[str]] = {}

    if normalized is None:
        if previous_lookup is not None:
            side_state["flag_lookup_surname"] = None
        if prefer_existing_flag:
            return None
        if existing_flag_url is not None:
            side_state["flag_url"] = None
            updates["flag_url"] = None
        if existing_flag_code is not None:
            side_state["flag_code"] = None
            updates["flag_code"] = None
        return updates or None

    if isinstance(previous_lookup, str) and previous_lookup == normalized:
        return None

    side_state["flag_lookup_surname"] = normalized

    player = find_player_by_surname(current_surname)
    if not player:
        if prefer_existing_flag:
            return None
        if existing_flag_url is not None:
            side_state["flag_url"] = None
            updates["flag_url"] = None
        if existing_flag_code is not None:
            side_state["flag_code"] = None
            updates["flag_code"] = None
        return updates or None

    new_flag_url_raw = player.get("flag_url")
    new_flag_url = str(new_flag_url_raw).strip() if new_flag_url_raw else None
    new_flag_code_raw = player.get("flag_code")
    new_flag_code = str(new_flag_code_raw).strip().lower() if new_flag_code_raw else None

    if new_flag_url and new_flag_url != existing_flag_url:
        side_state["flag_url"] = new_flag_url
        updates["flag_url"] = new_flag_url
    elif not new_flag_url and not prefer_existing_flag and existing_flag_url is not None:
        side_state["flag_url"] = None
        updates["flag_url"] = None

    if new_flag_code and new_flag_code != existing_flag_code:
        side_state["flag_code"] = new_flag_code
        updates["flag_code"] = new_flag_code
    elif not new_flag_code and not prefer_existing_flag and existing_flag_code is not None:
        side_state["flag_code"] = None
        updates["flag_code"] = None

    return updates or None


def maybe_activate_initial_set(state: Dict[str, Any]) -> None:
    current = state.get("current_set")
    if isinstance(current, int) and current > 0:
        return
    games_started = False
    for side in ("A", "B"):
        if as_int(state[side].get("set1"), 0) > 0 or as_int(state[side].get("current_games"), 0) > 0:
            games_started = True
            break
    if games_started:
        state["current_set"] = 1
        return
    tie_state = state.get("tie") if isinstance(state.get("tie"), dict) else {"visible": False, "A": 0, "B": 0}
    if to_bool(tie_state.get("visible")) and (
        as_int(tie_state.get("A"), 0) > 0 or as_int(tie_state.get("B"), 0) > 0
    ):
        state["current_set"] = 1
        return
    if all(_has_player_name(state[side]) for side in ("A", "B")) and any(
        _has_started_points(state[side].get("points")) for side in ("A", "B")
    ):
        state["current_set"] = 1


def _extract_short_set_tiebreaks(state: Dict[str, Any]) -> Dict[str, Dict[str, int]]:
    set_ties: Dict[str, Dict[str, int]] = {}
    log_entries = list(state.get("log") or [])
    if not log_entries:
        return set_ties

    set_scores: Dict[str, Dict[str, int]] = {
        "set1": {"A": 0, "B": 0},
        "set2": {"A": 0, "B": 0},
        "set3": {"A": 0, "B": 0},
    }
    current_tie = {"A": 0, "B": 0}
    last_nonzero_tie: Optional[Dict[str, int]] = None

    for entry in log_entries:
        command = entry.get("command")
        if not isinstance(command, str):
            continue

        tie_set_match = re.fullmatch(r"SetTieBreakPlayer([AB])", command)
        if tie_set_match:
            side = tie_set_match.group(1)
            current_value = current_tie.get(side, 0)
            updated = max(0, as_int(entry.get("value"), current_value))
            current_tie[side] = updated
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue

        if command == "IncreaseTieBreakPlayerA":
            current_tie["A"] = max(0, current_tie["A"] + 1)
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue
        if command == "IncreaseTieBreakPlayerB":
            current_tie["B"] = max(0, current_tie["B"] + 1)
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue
        if command == "DecreaseTieBreakPlayerA":
            current_tie["A"] = max(0, current_tie["A"] - 1)
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue
        if command == "DecreaseTieBreakPlayerB":
            current_tie["B"] = max(0, current_tie["B"] - 1)
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue

        if command in {"ResetTieBreak", "HideTieBreak"}:
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            current_tie = {"A": 0, "B": 0}
            continue

        if command == "SetTieBreakVisibility":
            visible = to_bool(entry.get("value"))
            if visible is False and (current_tie["A"] or current_tie["B"]):
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            if visible is False:
                current_tie = {"A": 0, "B": 0}
            continue

        if command == "ToggleTieBreak":
            if current_tie["A"] or current_tie["B"]:
                last_nonzero_tie = {"A": current_tie["A"], "B": current_tie["B"]}
            continue

        set_match = re.fullmatch(r"SetSet([123])Player([AB])", command)
        if set_match:
            set_idx = set_match.group(1)
            side = set_match.group(2)
            key = f"set{set_idx}"
            prev_value = set_scores[key][side]
            new_value = as_int(entry.get("value"), prev_value)
            set_scores[key][side] = new_value
            opponent_side = "B" if side == "A" else "A"
            opponent_score = set_scores[key][opponent_side]
            if new_value >= 4 and new_value - opponent_score >= 1:
                tie_values = None
                if current_tie["A"] or current_tie["B"]:
                    tie_values = {"A": current_tie["A"], "B": current_tie["B"]}
                elif last_nonzero_tie and (last_nonzero_tie.get("A") or last_nonzero_tie.get("B")):
                    tie_values = {
                        "A": last_nonzero_tie.get("A", 0),
                        "B": last_nonzero_tie.get("B", 0),
                    }
                if tie_values:
                    set_ties[key] = tie_values
                current_tie = {"A": 0, "B": 0}
                last_nonzero_tie = None
            continue

    return set_ties


def build_match_history_entry(kort_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    match_time, _ = ensure_match_struct(state)
    meta = ensure_history_meta(state)
    ended_at = match_time.get("finished_ts") or now_iso()
    duration_seconds = int(match_time.get("seconds") or 0)
    tie_state = state.get("tie") if isinstance(state.get("tie"), dict) else {"A": 0, "B": 0}
    tie_a = tie_state.get("A") or 0
    tie_b = tie_state.get("B") or 0
    set_tiebreaks = _extract_short_set_tiebreaks(state)

    def _build_set_payload(index: int) -> Dict[str, Any]:
        key = f"set{index}"
        data = {
            "A": state["A"].get(key) or 0,
            "B": state["B"].get(key) or 0,
        }
        tie_scores = set_tiebreaks.get(key)
        if tie_scores:
            data["tb"] = {
                "A": tie_scores.get("A", 0),
                "B": tie_scores.get("B", 0),
                "played": True,
            }
        else:
            data["tb"] = {"A": 0, "B": 0, "played": False}
        return data

    return {
        "kort": kort_id,
        "ended_at": ended_at,
        "duration_seconds": duration_seconds,
        "duration_text": format_duration(duration_seconds),
        "category": meta.get("category"),
        "phase": meta.get("phase") or DEFAULT_HISTORY_PHASE,
        "players": {
            "A": {"full_name": state["A"].get("full_name"), "surname": state["A"].get("surname")},
            "B": {"full_name": state["B"].get("full_name"), "surname": state["B"].get("surname")},
        },
        "sets": {
            "set1": _build_set_payload(1),
            "set2": _build_set_payload(2),
            "tie": {"A": tie_a, "B": tie_b, "played": bool(tie_a or tie_b)},
        },
    }


def persist_match_history_entry(entry: Dict[str, Any]) -> None:
    insert_match_history(
        {
            "kort": entry.get("kort"),
            "ended_at": entry.get("ended_at"),
            "duration_seconds": entry.get("duration_seconds", 0),
            "player_a": entry.get("players", {}).get("A", {}).get("surname"),
            "player_b": entry.get("players", {}).get("B", {}).get("surname"),
            "set1_a": entry.get("sets", {}).get("set1", {}).get("A", 0),
            "set1_b": entry.get("sets", {}).get("set1", {}).get("B", 0),
            "set2_a": entry.get("sets", {}).get("set2", {}).get("A", 0),
            "set2_b": entry.get("sets", {}).get("set2", {}).get("B", 0),
            "tie_a": entry.get("sets", {}).get("tie", {}).get("A", 0),
            "tie_b": entry.get("sets", {}).get("tie", {}).get("B", 0),
            "set1_tb_a": entry.get("sets", {}).get("set1", {}).get("tb", {}).get("A", 0),
            "set1_tb_b": entry.get("sets", {}).get("set1", {}).get("tb", {}).get("B", 0),
            "set2_tb_a": entry.get("sets", {}).get("set2", {}).get("tb", {}).get("A", 0),
            "set2_tb_b": entry.get("sets", {}).get("set2", {}).get("tb", {}).get("B", 0),
            "category": entry.get("category"),
            "phase": entry.get("phase") or DEFAULT_HISTORY_PHASE,
        }
    )
    GLOBAL_HISTORY.appendleft(entry)
    while len(GLOBAL_HISTORY) > settings.match_history_size:
        GLOBAL_HISTORY.pop()


def load_match_history() -> None:
    with STATE_LOCK:
        GLOBAL_HISTORY.clear()
        for row in fetch_recent_history(settings.match_history_size) or []:
            category = _clean_history_text(row["category"])
            phase = _clean_history_text(row["phase"]) or DEFAULT_HISTORY_PHASE
            entry = {
                "kort": row["kort_id"],
                "ended_at": row["ended_ts"],
                "duration_seconds": row["duration_seconds"],
                "duration_text": format_duration(row["duration_seconds"]),
                "category": category,
                "phase": phase,
                "players": {
                    "A": {"surname": row["player_a"], "full_name": row["player_a"]},
                    "B": {"surname": row["player_b"], "full_name": row["player_b"]},
                },
                "sets": {
                    "set1": {
                        "A": row["set1_a"],
                        "B": row["set1_b"],
                        "tb": {
                            "A": row["set1_tb_a"],
                            "B": row["set1_tb_b"],
                            "played": bool(row["set1_tb_a"] or row["set1_tb_b"]),
                        },
                    },
                    "set2": {
                        "A": row["set2_a"],
                        "B": row["set2_b"],
                        "tb": {
                            "A": row["set2_tb_a"],
                            "B": row["set2_tb_b"],
                            "played": bool(row["set2_tb_a"] or row["set2_tb_b"]),
                        },
                    },
                    "tie": {
                        "A": row["tie_a"],
                        "B": row["tie_b"],
                        "played": bool(row["tie_a"] or row["tie_b"]),
                    },
                },
            }
            GLOBAL_HISTORY.append(entry)


load_match_history()
refresh_uno_requests_setting()
refresh_plugin_setting()
refresh_uno_hourly_config()


def reset_after_match(state: Dict[str, Any]) -> None:
    match_time, status = ensure_match_struct(state)
    for side in ("A", "B"):
        side_state = state[side]
        side_state["full_name"] = None
        side_state["surname"] = "-"
        side_state["flag_url"] = None
        side_state["flag_code"] = None
        side_state["flag_lookup_surname"] = None
        side_state["points"] = "0"
        side_state["set1"] = 0
        side_state["set2"] = 0
        side_state["set3"] = 0
        side_state["current_games"] = 0
    reset_tie_and_points(state)
    state["tie"]["visible"] = False
    lock_tie_updates(state)
    state["current_set"] = None
    match_time["seconds"] = 0
    match_time["running"] = False
    match_time["started_ts"] = None
    match_time["finished_ts"] = None
    status["active"] = False
    meta = ensure_history_meta(state)
    meta["category"] = None
    meta["phase"] = DEFAULT_HISTORY_PHASE


def finalize_match_if_needed(kort_id: str, state: Dict[str, Any], wins: Optional[Dict[str, int]] = None) -> None:
    match_time, status = ensure_match_struct(state)
    if not status.get("active"):
        return
    if wins is None:
        wins = count_short_set_wins(state)

    def _complete_match() -> None:
        stop_match_timer(state)
        entry = build_match_history_entry(kort_id, state)
        persist_match_history_entry(entry)
        status["active"] = False
        status["last_completed"] = entry["ended_at"]
        log.info(
            "match completed kort=%s players=%s duration=%s",
            kort_id,
            {
                "A": entry["players"]["A"]["surname"],
                "B": entry["players"]["B"]["surname"],
                "set1": entry["sets"]["set1"],
                "set2": entry["sets"]["set2"],
                "tie": entry["sets"].get("tie"),
            },
            entry["duration_text"],
        )
        reset_after_match(state)

    if wins["A"] >= 2 or wins["B"] >= 2:
        _complete_match()
        return

    tie_state = state.get("tie") if isinstance(state.get("tie"), dict) else {"A": 0, "B": 0}
    tie_a = as_int(tie_state.get("A"), 0)
    tie_b = as_int(tie_state.get("B"), 0)
    if (tie_a >= 10 or tie_b >= 10) and abs(tie_a - tie_b) >= 2:
        _complete_match()
        return

    if wins["A"] == 1 and wins["B"] == 1:
        if (tie_a >= 7 or tie_b >= 7) and abs(tie_a - tie_b) >= 2:
            _complete_match()


def handle_match_flow(kort_id: Optional[str], state: Dict[str, Any]) -> None:
    ensure_match_struct(state)
    maybe_start_match(state)
    maybe_activate_initial_set(state)
    update_match_timer(state)
    wins = maybe_update_current_set_indicator(state)
    if kort_id is not None:
        finalize_match_if_needed(kort_id, state, wins)


def apply_local_command(
    state: Dict[str, Any],
    command: str,
    value: Any,
    extras: Optional[Dict[str, Any]],
    kort_id: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Dict[str, Optional[str]]]]]:
    log.debug("apply command=%s value=%s extras=%s", command, shorten(value), shorten(extras))
    changed = False
    flag_updates: Dict[str, Dict[str, Optional[str]]] = {}
    if command == "SetNamePlayerA":
        full = str(value or "").strip() or None
        state["A"]["full_name"] = full
        state["A"]["surname"] = surname(full)
        prefer_existing_flag = False
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                trimmed_url = str(flag_url).strip()
                state["A"]["flag_url"] = trimmed_url or None
                prefer_existing_flag = bool(trimmed_url)
            if flag_code is not None:
                code_text = str(flag_code).strip().lower()
                state["A"]["flag_code"] = code_text or None
        lookup = _maybe_lookup_flag_for_side(state, "A", prefer_existing_flag=prefer_existing_flag)
        if lookup:
            flag_updates["A"] = lookup
        changed = True
    elif command == "SetNamePlayerB":
        full = str(value or "").strip() or None
        state["B"]["full_name"] = full
        state["B"]["surname"] = surname(full)
        prefer_existing_flag = False
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                trimmed_url = str(flag_url).strip()
                state["B"]["flag_url"] = trimmed_url or None
                prefer_existing_flag = bool(trimmed_url)
            if flag_code is not None:
                code_text = str(flag_code).strip().lower()
                state["B"]["flag_code"] = code_text or None
        lookup = _maybe_lookup_flag_for_side(state, "B", prefer_existing_flag=prefer_existing_flag)
        if lookup:
            flag_updates["B"] = lookup
        changed = True
    elif command == "SetPointsPlayerA":
        state["A"]["points"] = str(value if value is not None else "-")
        changed = True
    elif command == "SetPointsPlayerB":
        state["B"]["points"] = str(value if value is not None else "-")
        changed = True
    elif command == "IncreasePointsPlayerA":
        state["A"]["points"] = step_points(state["A"]["points"], +1, POINT_SEQUENCE)
        changed = True
    elif command == "IncreasePointsPlayerB":
        state["B"]["points"] = step_points(state["B"]["points"], +1, POINT_SEQUENCE)
        changed = True
    elif command == "DecreasePointsPlayerA":
        state["A"]["points"] = step_points(state["A"]["points"], -1, POINT_SEQUENCE)
        changed = True
    elif command == "DecreasePointsPlayerB":
        state["B"]["points"] = step_points(state["B"]["points"], -1, POINT_SEQUENCE)
        changed = True
    elif command == "ResetPoints":
        state["A"]["points"] = "0"
        state["B"]["points"] = "0"
        changed = True
    else:
        set_match = re.fullmatch(r"SetSet([123])Player([AB])", command)
        if set_match:
            idx = set_match.group(1)
            side = set_match.group(2)
            key = f"set{idx}"
            prev_games = int(state[side].get(key) or 0)
            new_games = as_int(value, prev_games)
            if new_games != prev_games:
                state[side][key] = new_games
                reset_regular_points(state)
                changed = True
        else:
            cur_match = re.fullmatch(r"SetCurrentSetPlayer([AB])", command)
            if cur_match:
                side = cur_match.group(1)
                prev_games = int(state[side].get("current_games") or 0)
                new_games = as_int(value, prev_games)
                if new_games != prev_games:
                    state[side]["current_games"] = new_games
                    reset_regular_points(state)
                    changed = True
            elif command == "IncreaseCurrentSetPlayerA":
                state["A"]["current_games"] = max(0, state["A"].get("current_games", 0) + 1)
                reset_regular_points(state)
                changed = True
            elif command == "IncreaseCurrentSetPlayerB":
                state["B"]["current_games"] = max(0, state["B"].get("current_games", 0) + 1)
                reset_regular_points(state)
                changed = True
            elif command == "DecreaseCurrentSetPlayerA":
                state["A"]["current_games"] = max(0, state["A"].get("current_games", 0) - 1)
                reset_regular_points(state)
                changed = True
            elif command == "DecreaseCurrentSetPlayerB":
                state["B"]["current_games"] = max(0, state["B"].get("current_games", 0) - 1)
                reset_regular_points(state)
                changed = True
            elif command == "SetCurrentSet":
                prev_set = state.get("current_set")
                new_set = as_int(value, prev_set or 0) or None
                if new_set != prev_set:
                    state["current_set"] = new_set
                    reset_regular_points(state)
                    changed = True
            elif command == "SetSet":
                prev_set = state.get("current_set")
                new_set = as_int(value, prev_set or 0) or None
                if new_set != prev_set:
                    state["current_set"] = new_set
                    reset_regular_points(state)
                    changed = True
            elif command == "IncreaseSet":
                state["current_set"] = (state.get("current_set") or 0) + 1
                changed = True
            elif command == "DecreaseSet":
                current = state.get("current_set") or 0
                current = max(0, current - 1)
                state["current_set"] = current or None
                changed = True
            else:
                tie_match = re.fullmatch(r"SetTieBreakPlayer([AB])", command)
                if tie_match:
                    side = tie_match.group(1)
                    new_value = as_int(value, 0)
                    if tie_update_allowed(state, new_value):
                        state["tie"][side] = new_value
                        changed = True
                elif command == "IncreaseTieBreakPlayerA":
                    next_value = max(0, state["tie"].get("A", 0) + 1)
                    if tie_update_allowed(state, next_value):
                        state["tie"]["A"] = next_value
                        changed = True
                elif command == "IncreaseTieBreakPlayerB":
                    next_value = max(0, state["tie"].get("B", 0) + 1)
                    if tie_update_allowed(state, next_value):
                        state["tie"]["B"] = next_value
                        changed = True
                elif command == "DecreaseTieBreakPlayerA":
                    next_value = max(0, state["tie"].get("A", 0) - 1)
                    if tie_update_allowed(state, next_value):
                        state["tie"]["A"] = next_value
                        changed = True
                elif command == "DecreaseTieBreakPlayerB":
                    next_value = max(0, state["tie"].get("B", 0) - 1)
                    if tie_update_allowed(state, next_value):
                        state["tie"]["B"] = next_value
                        changed = True
                elif command == "ResetTieBreak":
                    reset_tie_and_points(state)
                    changed = True
                elif command == "SetTieBreakVisibility":
                    state["tie"]["visible"] = to_bool(value)
                    reset_tie_and_points(state)
                    changed = True
                elif command == "ShowTieBreak":
                    state["tie"]["visible"] = True
                    reset_tie_and_points(state)
                    changed = True
                elif command == "HideTieBreak":
                    current = state["tie"].get("visible")
                    state["tie"]["visible"] = False if current is not None else None
                    reset_tie_and_points(state)
                    changed = True
                elif command == "ToggleTieBreak":
                    current = state["tie"].get("visible")
                    state["tie"]["visible"] = not current if current is not None else True
                    reset_tie_and_points(state)
                    changed = True
                elif command == "SetServe":
                    if value is None:
                        state["serve"] = None
                    else:
                        val = str(value).strip().upper()
                        state["serve"] = val if val in ("A", "B") else None
                    changed = True
                elif command == "SetMode":
                    state["mode"] = str(value) if value is not None else None
                    changed = True
                elif command == "ShowOverlay":
                    state["overlay_visible"] = True
                    changed = True
                elif command == "HideOverlay":
                    state["overlay_visible"] = False
                    changed = True
                elif command == "ToggleOverlay":
                    current = state.get("overlay_visible")
                    state["overlay_visible"] = not current if current is not None else True
                    changed = True
                elif command == "SetOverlayVisibility":
                    state["overlay_visible"] = to_bool(value)
                    changed = True
                elif command == "SetMatchTime":
                    state["match_time"]["seconds"] = max(0, as_int(value, 0))
                    changed = True
                elif command == "ResetMatchTime":
                    state["match_time"]["seconds"] = 0
                    state["match_time"]["running"] = False
                    changed = True
                elif command == "PlayMatchTime":
                    state["match_time"]["running"] = True
                    changed = True
                elif command == "PauseMatchTime":
                    state["match_time"]["running"] = False
                    changed = True
                elif command in {"SetMatchCategory", "SetCategory"}:
                    meta = ensure_history_meta(state)
                    meta["category"] = _clean_history_text(value)
                    changed = True
                elif command in {"SetMatchPhase", "SetPhase"}:
                    meta = ensure_history_meta(state)
                    meta["phase"] = _clean_history_text(value) or DEFAULT_HISTORY_PHASE
                    changed = True
                elif command == "SetCustomizationField":
                    field_id = None
                    if extras and isinstance(extras, dict):
                        field_id = extras.get("fieldId") or extras.get("field_id")
                    if not field_id and isinstance(value, dict):
                        field_id = value.get("fieldId") or value.get("field_id")
                    if not field_id and extras and isinstance(extras, dict):
                        field_id = extras.get("field")
                    if field_id:
                        fid = str(field_id).lower()
                        if fid in {"player a flag", "player a image", "player_a_flag", "player_a_image"}:
                            url = None
                            if isinstance(value, dict):
                                url = value.get("value")
                            if url is None and extras and isinstance(extras, dict):
                                url = extras.get("value")
                            state["A"]["flag_url"] = url or None
                            changed = True
                        elif fid in {"player b flag", "player b image", "player_b_flag", "player_b_image"}:
                            url = None
                            if isinstance(value, dict):
                                url = value.get("value")
                            if url is None and extras and isinstance(extras, dict):
                                url = extras.get("value")
                            state["B"]["flag_url"] = url or None
                            changed = True
                        elif fid in {"category", "match_category", "kategoria"}:
                            meta = ensure_history_meta(state)
                            meta["category"] = _clean_history_text(
                                _extract_custom_field_value(value, extras)
                            )
                            changed = True
                        elif fid in {"phase", "match_phase", "faza", "stage"}:
                            meta = ensure_history_meta(state)
                            meta["phase"] = (
                                _clean_history_text(_extract_custom_field_value(value, extras))
                                or DEFAULT_HISTORY_PHASE
                            )
                            changed = True
                        else:
                            log.info(
                                "SetCustomizationField ignored field=%s value=%s extras=%s",
                                field_id,
                                shorten(value),
                                shorten(extras),
                            )
                    else:
                        log.info(
                            "SetCustomizationField missing fieldId value=%s extras=%s",
                            shorten(value),
                            shorten(extras),
                        )
                else:
                    log.info("unhandled command=%s value=%s extras=%s", command, shorten(value), shorten(extras))

    handle_match_flow(kort_id, state)
    return changed, flag_updates or None


def state_snapshot_for_broadcast(
    kort_id: str,
    source: str,
    command: str,
    value: Any,
    extras: Optional[Dict[str, Any]],
    ts: str,
    status_code: Optional[int],
) -> Dict[str, Any]:
    return {
        "type": "kort-update",
        "kort": kort_id,
        "source": source,
        "command": command,
        "value": safe_copy(value),
        "extras": safe_copy(extras) if extras else None,
        "ts": ts,
        "status": status_code,
        "state": serialize_public_court_state(ensure_court_state(kort_id)),
        "history": serialize_history(),
    }


def broadcast_kort_state(
    kort_id: str,
    source: str,
    command: str,
    value: Any,
    extras: Optional[Dict[str, Any]],
    ts: str,
    status_code: Optional[int] = None,
) -> None:
    payload = state_snapshot_for_broadcast(kort_id, source, command, value, extras, ts, status_code)
    event_broker.broadcast(payload)


def register_history_entry(entry: Dict[str, Any]) -> None:
    GLOBAL_HISTORY.appendleft(entry)
    while len(GLOBAL_HISTORY) > settings.match_history_size:
        GLOBAL_HISTORY.pop()


def log_state_summary(kort_id: str, state: Dict[str, Any], context: str) -> None:
    a_state = state["A"]
    b_state = state["B"]
    log.info(
        "%s kort=%s A=%s flag=%s pts=%s sets=(%s,%s) B=%s flag=%s pts=%s sets=(%s,%s) current_set=%s",
        context,
        kort_id,
        shorten(a_state.get("full_name") or a_state.get("surname")),
        shorten(a_state.get("flag_url") or a_state.get("flag_code")),
        a_state.get("points"),
        a_state.get("set1"),
        a_state.get("set2"),
        shorten(b_state.get("full_name") or b_state.get("surname")),
        shorten(b_state.get("flag_url") or b_state.get("flag_code")),
        b_state.get("points"),
        b_state.get("set1"),
        b_state.get("set2"),
        state.get("current_set"),
    )


def delete_latest_history(kort_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    removed = delete_latest_history_entry(kort_id)
    if removed is None:
        return None
    for index, entry in enumerate(list(GLOBAL_HISTORY)):
        if entry.get("kort") == removed["kort"] and entry.get("ended_at") == removed["ended_at"]:
            del GLOBAL_HISTORY[index]
            break
    category = _clean_history_text(removed.get("category"))
    phase = _clean_history_text(removed.get("phase")) or DEFAULT_HISTORY_PHASE
    removed_entry = {
        "kort": removed["kort"],
        "ended_at": removed["ended_at"],
        "duration_seconds": removed["duration_seconds"],
        "duration_text": format_duration(removed["duration_seconds"]),
        "category": category,
        "phase": phase,
        "players": {
            "A": {"surname": removed["player_a"], "full_name": removed["player_a"]},
            "B": {"surname": removed["player_b"], "full_name": removed["player_b"]},
        },
        "sets": {
            "set1": {
                "A": removed["set1_a"],
                "B": removed["set1_b"],
                "tb": {
                    "A": removed.get("set1_tb_a", 0),
                    "B": removed.get("set1_tb_b", 0),
                    "played": bool(removed.get("set1_tb_a", 0) or removed.get("set1_tb_b", 0)),
                },
            },
            "set2": {
                "A": removed["set2_a"],
                "B": removed["set2_b"],
                "tb": {
                    "A": removed.get("set2_tb_a", 0),
                    "B": removed.get("set2_tb_b", 0),
                    "played": bool(removed.get("set2_tb_a", 0) or removed.get("set2_tb_b", 0)),
                },
            },
            "tie": {
                "A": removed["tie_a"],
                "B": removed["tie_b"],
                "played": bool(removed["tie_a"] or removed["tie_b"]),
            },
        },
    }
    return removed_entry


__all__ = [
    "ALLOWED_COMMAND_PREFIXES",
    "GLOBAL_HISTORY",
    "GLOBAL_LOG",
    "INITIAL_COURTS",
    "POINT_SEQUENCE",
    "STATE_LOCK",
    "apply_local_command",
    "available_courts",
    "broadcast_snapshot",
    "broadcast_kort_state",
    "buckets",
    "courts_map",
    "delete_latest_history",
    "DEFAULT_HISTORY_PHASE",
    "ensure_court_state",
    "event_broker",
    "finalize_match_if_needed",
    "handle_match_flow",
    "get_uno_auto_disabled_reason",
    "get_uno_hourly_config",
    "get_uno_hourly_status",
    "get_uno_hourly_usage_summary",
    "is_uno_requests_enabled",
    "is_known_kort",
    "load_match_history",
    "load_state_cache",
    "log_state_summary",
    "normalize_kort_id",
    "persist_state_cache",
    "refresh_uno_requests_setting",
    "refresh_uno_hourly_config",
    "refresh_courts_from_db",
    "record_log_entry",
    "record_uno_request",
    "update_uno_hourly_config",
    "set_uno_requests_enabled",
    "get_kort_for_overlay",
    "get_overlay_for_kort",
    "serialize_all_states",
    "serialize_court_state",
    "serialize_history",
    "serialize_public_court_state",
    "serialize_public_snapshot",
    "snapshots",
    "state_snapshot_for_broadcast",
    "validate_command",
]
