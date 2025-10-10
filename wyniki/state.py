"""State management, event broadcasting and match logic."""
from __future__ import annotations

import json
import queue
import re
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from .config import settings, log
from .database import (
    delete_latest_history_entry,
    fetch_recent_history,
    fetch_state_cache,
    insert_match_history,
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

if settings.overlay_ids:
    INITIAL_COURTS = sorted(settings.overlay_ids.keys(), key=lambda value: int(value))
else:
    INITIAL_COURTS = [str(index) for index in range(1, 5)]

snapshots: Dict[str, Dict[str, Any]] = {kort: None for kort in INITIAL_COURTS}  # type: ignore[assignment]
GLOBAL_LOG: Deque[Dict[str, Any]] = deque(maxlen=max(100, settings.state_log_size * max(1, len(snapshots) or 1)))
GLOBAL_HISTORY: Deque[Dict[str, Any]] = deque(maxlen=settings.match_history_size)


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


buckets = {kort: TokenBucket(settings.rpm_per_court, settings.burst) for kort in settings.overlay_ids.keys()}


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
        "tie": {"visible": None, "A": 0, "B": 0},
        "history": [],
        "local": {"commands": {}, "updated": None},
        "uno": {
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


for kort in list(snapshots.keys()):
    snapshots[kort] = _empty_court_state()


def available_courts() -> List[Tuple[str, Optional[str]]]:
    if settings.overlay_ids:
        return [(kort, settings.overlay_ids[kort]) for kort in sorted(settings.overlay_ids.keys(), key=lambda value: int(value))]
    return [(kort, None) for kort in sorted(snapshots.keys(), key=lambda value: int(value))]


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
    if settings.overlay_ids:
        return kort_id in settings.overlay_ids
    return kort_id in snapshots


def ensure_court_state(kort_id: str) -> Dict[str, Any]:
    state = snapshots.get(kort_id)
    if state is None:
        state = _empty_court_state()
        snapshots[kort_id] = state
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
        "local": {
            "updated": state["local"].get("updated"),
            "commands": {cmd: dict(info) for cmd, info in state["local"].get("commands", {}).items()},
        },
        "uno": dict(state["uno"]),
        "log": list(state["log"]),
        "updated": state["updated"],
    }


def serialize_all_states() -> Dict[str, Any]:
    with STATE_LOCK:
        return {kort: serialize_court_state(state) for kort, state in snapshots.items()}


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
    local_in = cached.get("local")
    if isinstance(local_in, dict):
        state["local"]["updated"] = local_in.get("updated")
        if isinstance(local_in.get("commands"), dict):
            state["local"]["commands"] = local_in["commands"]
    uno_in = cached.get("uno")
    if isinstance(uno_in, dict):
        state["uno"].update(uno_in)


def load_state_cache() -> None:
    for row in fetch_state_cache() or []:
        try:
            payload = json.loads(row["state"])
        except (TypeError, ValueError, json.JSONDecodeError):  # type: ignore[attr-defined]
            continue
        hydrate_state_from_cache(row["kort_id"], payload)


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
    state["tie"]["A"] = 0
    state["tie"]["B"] = 0
    state["A"]["points"] = "0"
    state["B"]["points"] = "0"


def reset_regular_points(state: Dict[str, Any]) -> None:
    state["A"]["points"] = "0"
    state["B"]["points"] = "0"


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


def build_match_history_entry(kort_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    match_time, _ = ensure_match_struct(state)
    ended_at = match_time.get("finished_ts") or now_iso()
    duration_seconds = int(match_time.get("seconds") or 0)
    tie_state = state.get("tie") if isinstance(state.get("tie"), dict) else {"A": 0, "B": 0}
    tie_a = tie_state.get("A") or 0
    tie_b = tie_state.get("B") or 0
    return {
        "kort": kort_id,
        "ended_at": ended_at,
        "duration_seconds": duration_seconds,
        "duration_text": format_duration(duration_seconds),
        "players": {
            "A": {"full_name": state["A"].get("full_name"), "surname": state["A"].get("surname")},
            "B": {"full_name": state["B"].get("full_name"), "surname": state["B"].get("surname")},
        },
        "sets": {
            "set1": {"A": state["A"].get("set1") or 0, "B": state["B"].get("set1") or 0},
            "set2": {"A": state["A"].get("set2") or 0, "B": state["B"].get("set2") or 0},
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
        }
    )
    GLOBAL_HISTORY.appendleft(entry)
    while len(GLOBAL_HISTORY) > settings.match_history_size:
        GLOBAL_HISTORY.pop()


def load_match_history() -> None:
    GLOBAL_HISTORY.clear()
    for row in fetch_recent_history(settings.match_history_size) or []:
        entry = {
            "kort": row["kort_id"],
            "ended_at": row["ended_ts"],
            "duration_seconds": row["duration_seconds"],
            "duration_text": format_duration(row["duration_seconds"]),
            "players": {
                "A": {"surname": row["player_a"], "full_name": row["player_a"]},
                "B": {"surname": row["player_b"], "full_name": row["player_b"]},
            },
            "sets": {
                "set1": {"A": row["set1_a"], "B": row["set1_b"]},
                "set2": {"A": row["set2_a"], "B": row["set2_b"]},
                "tie": {"A": row["tie_a"], "B": row["tie_b"], "played": bool(row["tie_a"] or row["tie_b"])},
            },
        }
        GLOBAL_HISTORY.append(entry)


load_match_history()


def reset_after_match(state: Dict[str, Any]) -> None:
    match_time, status = ensure_match_struct(state)
    for side in ("A", "B"):
        side_state = state[side]
        side_state["full_name"] = None
        side_state["surname"] = "-"
        side_state["flag_url"] = None
        side_state["flag_code"] = None
        side_state["points"] = "0"
        side_state["set1"] = 0
        side_state["set2"] = 0
        side_state["set3"] = 0
        side_state["current_games"] = 0
    state["tie"]["A"] = 0
    state["tie"]["B"] = 0
    state["tie"]["visible"] = False
    state["current_set"] = 1
    match_time["seconds"] = 0
    match_time["running"] = False
    match_time["started_ts"] = None
    match_time["finished_ts"] = None
    status["active"] = False


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

    if wins["A"] == 1 and wins["B"] == 1:
        tie_state = state.get("tie") if isinstance(state.get("tie"), dict) else {"A": 0, "B": 0}
        tie_a = as_int(tie_state.get("A"), 0)
        tie_b = as_int(tie_state.get("B"), 0)
        if (tie_a >= 10 or tie_b >= 10) and abs(tie_a - tie_b) >= 2:
            _complete_match()


def handle_match_flow(kort_id: Optional[str], state: Dict[str, Any]) -> None:
    ensure_match_struct(state)
    maybe_start_match(state)
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
) -> bool:
    log.debug("apply command=%s value=%s extras=%s", command, shorten(value), shorten(extras))
    changed = False
    if command == "SetNamePlayerA":
        full = str(value or "").strip() or None
        state["A"]["full_name"] = full
        state["A"]["surname"] = surname(full)
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                state["A"]["flag_url"] = flag_url or None
            if flag_code is not None:
                state["A"]["flag_code"] = (str(flag_code).lower() or None)
        changed = True
    elif command == "SetNamePlayerB":
        full = str(value or "").strip() or None
        state["B"]["full_name"] = full
        state["B"]["surname"] = surname(full)
        if extras:
            flag_url = extras.get("flagUrl") or extras.get("flag_url")
            flag_code = extras.get("flag") or extras.get("flagCode") or extras.get("flag_code")
            if flag_url is not None:
                state["B"]["flag_url"] = flag_url or None
            if flag_code is not None:
                state["B"]["flag_code"] = (str(flag_code).lower() or None)
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
                    state["tie"][side] = as_int(value, 0)
                    changed = True
                elif command == "IncreaseTieBreakPlayerA":
                    state["tie"]["A"] = max(0, state["tie"].get("A", 0) + 1)
                    changed = True
                elif command == "IncreaseTieBreakPlayerB":
                    state["tie"]["B"] = max(0, state["tie"].get("B", 0) + 1)
                    changed = True
                elif command == "DecreaseTieBreakPlayerA":
                    state["tie"]["A"] = max(0, state["tie"].get("A", 0) - 1)
                    changed = True
                elif command == "DecreaseTieBreakPlayerB":
                    state["tie"]["B"] = max(0, state["tie"].get("B", 0) - 1)
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
    return changed


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
        "state": serialize_court_state(ensure_court_state(kort_id)),
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
    removed_entry = {
        "kort": removed["kort"],
        "ended_at": removed["ended_at"],
        "duration_seconds": removed["duration_seconds"],
        "duration_text": format_duration(removed["duration_seconds"]),
        "players": {
            "A": {"surname": removed["player_a"], "full_name": removed["player_a"]},
            "B": {"surname": removed["player_b"], "full_name": removed["player_b"]},
        },
        "sets": {
            "set1": {"A": removed["set1_a"], "B": removed["set1_b"]},
            "set2": {"A": removed["set2_a"], "B": removed["set2_b"]},
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
    "broadcast_kort_state",
    "buckets",
    "delete_latest_history",
    "ensure_court_state",
    "event_broker",
    "finalize_match_if_needed",
    "handle_match_flow",
    "is_known_kort",
    "load_match_history",
    "load_state_cache",
    "log_state_summary",
    "normalize_kort_id",
    "persist_state_cache",
    "record_log_entry",
    "serialize_all_states",
    "serialize_court_state",
    "serialize_history",
    "snapshots",
    "state_snapshot_for_broadcast",
    "validate_command",
]
