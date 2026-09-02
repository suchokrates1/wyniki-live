"""Director → umpire tablet command bus.

Admin/reżyserka writes the intended match state; tablets long-poll (or read
heartbeat) and apply court, names, score, and MatchConfig immediately.
"""
from __future__ import annotations

import json
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from ..config import logger
from ..db_models import Court, Match, db, utc_now_iso
from .api_auth import court_session_expires_at, issue_court_token
from .court_manager import STATE_LOCK, _empty_court_state, ensure_court_state, get_court_state
from .event_broker import emit_score_update
from .office_event_broker import emit_office_invalidation

MATCH_CONFIG_DEFAULTS = {
    "games_per_set": 4,
    "sets_to_win": 2,
    "tiebreak_points": 7,
    "super_tiebreak_points": 10,
    "no_advantage": False,
    "tiebreak_only": False,
    "stats_mode": "ADVANCED",
}

_PRESENCE_TTL_SECONDS = 15 * 60
_COMMAND_TTL_SECONDS = 5 * 60


def normalize_match_config(raw: Any) -> dict[str, Any]:
    config = dict(MATCH_CONFIG_DEFAULTS)
    if not isinstance(raw, dict):
        return config
    if raw.get("games_per_set") is not None:
        config["games_per_set"] = max(1, int(raw["games_per_set"]))
    if raw.get("sets_to_win") is not None:
        config["sets_to_win"] = max(1, int(raw["sets_to_win"]))
    if raw.get("tiebreak_points") is not None:
        config["tiebreak_points"] = max(1, int(raw["tiebreak_points"]))
    if raw.get("super_tiebreak_points") is not None:
        config["super_tiebreak_points"] = max(1, int(raw["super_tiebreak_points"]))
    if "no_advantage" in raw:
        config["no_advantage"] = bool(raw["no_advantage"])
    if "tiebreak_only" in raw:
        config["tiebreak_only"] = bool(raw["tiebreak_only"])
    stats_mode = str(raw.get("stats_mode") or config["stats_mode"]).strip().upper()
    if stats_mode in {"BASIC", "ADVANCED"}:
        config["stats_mode"] = stats_mode
    return config


def parse_stored_match_config(raw: str | None) -> dict[str, Any]:
    if not raw:
        return dict(MATCH_CONFIG_DEFAULTS)
    try:
        return normalize_match_config(json.loads(raw))
    except Exception:
        return dict(MATCH_CONFIG_DEFAULTS)


def dump_match_config(config: dict[str, Any] | None) -> str:
    return json.dumps(normalize_match_config(config))


class DirectorCommandBroker:
    """In-process pending commands, woken immediately for long-poll waiters."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cv = threading.Condition(self._lock)
        self._commands: dict[str, dict[str, Any]] = {}
        self._seq = 0

    def publish(self, command: dict[str, Any]) -> dict[str, Any]:
        with self._cv:
            self._seq += 1
            stored = dict(command)
            stored["seq"] = self._seq
            stored.setdefault("id", uuid.uuid4().hex)
            stored.setdefault("issued_at", datetime.now(timezone.utc).isoformat())
            self._commands[stored["id"]] = stored
            self._cv.notify_all()
        return stored

    def pending_for(
        self,
        session_court_id: str,
        match_id: int | None,
        client_match_uuid: str | None,
    ) -> list[dict[str, Any]]:
        self.expire_stale()
        with self._lock:
            return [
                dict(command)
                for command in self._commands.values()
                if _command_targets(command, session_court_id, match_id, client_match_uuid)
            ]

    def wait_for(
        self,
        session_court_id: str,
        match_id: int | None,
        client_match_uuid: str | None,
        timeout_s: float,
    ) -> list[dict[str, Any]]:
        if timeout_s <= 0:
            return self.pending_for(session_court_id, match_id, client_match_uuid)
        deadline = time.time() + timeout_s
        with self._cv:
            while True:
                self._expire_locked()
                found = [
                    dict(command)
                    for command in self._commands.values()
                    if _command_targets(command, session_court_id, match_id, client_match_uuid)
                ]
                if found:
                    return found
                remaining = deadline - time.time()
                if remaining <= 0:
                    return []
                self._cv.wait(timeout=remaining)

    def ack(self, command_id: str) -> bool:
        command_id = str(command_id or "").strip()
        if not command_id:
            return False
        with self._lock:
            return self._commands.pop(command_id, None) is not None

    def expire_stale(self) -> None:
        with self._lock:
            self._expire_locked()

    def clear(self) -> None:
        with self._lock:
            self._commands.clear()

    def _expire_locked(self) -> None:
        now = time.time()
        stale = [
            command_id
            for command_id, command in self._commands.items()
            if now - _issued_epoch(command) > _COMMAND_TTL_SECONDS
        ]
        for command_id in stale:
            self._commands.pop(command_id, None)


class TabletPresenceStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tablets: dict[str, dict[str, Any]] = {}

    def record(
        self,
        *,
        session_court_id: str,
        match_id: int | None,
        client_match_uuid: str | None,
        player1_name: str | None = None,
        player2_name: str | None = None,
        screen: str | None = None,
        battery_level: Any = None,
        app_version: str | None = None,
        platform: str | None = None,
        device: str | None = None,
        device_model: str | None = None,
        device_manufacturer: str | None = None,
        is_charging: Any = None,
    ) -> None:
        session_court_id = str(session_court_id or "").strip()
        if not session_court_id:
            return
        key = _presence_key(session_court_id, match_id, client_match_uuid)
        with self._lock:
            existing = self._tablets.get(key) or {}
            charging = existing.get("is_charging")
            if is_charging is not None:
                charging = is_charging in (True, "true", "True", 1, "1")
            self._tablets[key] = {
                "session_court_id": session_court_id,
                "match_id": int(match_id) if match_id else existing.get("match_id"),
                "client_match_uuid": (client_match_uuid or existing.get("client_match_uuid")),
                "player1_name": player1_name or existing.get("player1_name"),
                "player2_name": player2_name or existing.get("player2_name"),
                "screen": screen or existing.get("screen"),
                "battery_level": _optional_int(battery_level, existing.get("battery_level")),
                "is_charging": charging,
                "app_version": app_version or existing.get("app_version"),
                "platform": platform or existing.get("platform"),
                "device": device or existing.get("device"),
                "device_model": device_model or existing.get("device_model"),
                "device_manufacturer": device_manufacturer or existing.get("device_manufacturer"),
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "last_seen_epoch": time.time(),
            }

    def list_for_court(self, session_court_id: str | None = None) -> list[dict[str, Any]]:
        now = time.time()
        with self._lock:
            stale = [
                key
                for key, row in self._tablets.items()
                if now - float(row.get("last_seen_epoch") or 0) > _PRESENCE_TTL_SECONDS
            ]
            for key in stale:
                self._tablets.pop(key, None)
            rows = list(self._tablets.values())
        if session_court_id:
            wanted = str(session_court_id).strip()
            rows = [row for row in rows if row.get("session_court_id") == wanted]
        return rows

    def list_visible_on_court(
        self,
        court_id: str | None,
        match_ids_on_court: set[int] | None = None,
    ) -> list[dict[str, Any]]:
        """Tablets sitting on this court, plus tablets whose match is now here."""
        rows = self.list_for_court()
        if not court_id:
            return rows
        wanted = str(court_id).strip()
        match_ids = {int(match_id) for match_id in (match_ids_on_court or set()) if match_id}
        return [
            row
            for row in rows
            if row.get("session_court_id") == wanted
            or (row.get("match_id") is not None and int(row["match_id"]) in match_ids)
        ]

    def session_court_for_match(self, match_id: int | None, client_match_uuid: str | None) -> str | None:
        rows = self.list_for_court()
        if match_id:
            for row in rows:
                if row.get("match_id") == int(match_id):
                    return row.get("session_court_id")
        uuid_text = str(client_match_uuid or "").strip()
        if uuid_text:
            for row in rows:
                if str(row.get("client_match_uuid") or "") == uuid_text:
                    return row.get("session_court_id")
        return None

    def clear(self) -> None:
        with self._lock:
            self._tablets.clear()


director_command_broker = DirectorCommandBroker()
tablet_presence = TabletPresenceStore()


def apply_director_control(match: Match, patch: dict[str, Any]) -> dict[str, Any]:
    """Apply director patch to SQLite + overlay and queue an instant tablet command."""
    from ..api.umpire_api import _apply_db_flags_to_court_state, _sync_live_score_to_court_state

    old_court_id = str(match.court_id or "").strip()
    requested_session = str(patch.get("session_court_id") or "").strip()
    # Presence wins: after a SQL/overlay-only move the panel is often opened from
    # the new court, but the tablet is still authorized on the old PIN/session.
    session_court_id = (
        tablet_presence.session_court_for_match(match.id, match.client_match_uuid)
        or requested_session
        or old_court_id
    )

    new_court_id = str(patch.get("court_id") or old_court_id).strip() or old_court_id
    db_court_changed = new_court_id != old_court_id
    tablet_court_changed = bool(session_court_id and session_court_id != new_court_id)
    court_changed = db_court_changed or tablet_court_changed

    if patch.get("player1_name"):
        match.player1_name = str(patch["player1_name"]).strip()
    if patch.get("player2_name"):
        match.player2_name = str(patch["player2_name"]).strip()

    score = patch.get("score") if isinstance(patch.get("score"), dict) else None
    if score:
        if "player1_sets" in score:
            match.player1_sets = int(score.get("player1_sets") or 0)
        if "player2_sets" in score:
            match.player2_sets = int(score.get("player2_sets") or 0)
        if "player1_games" in score:
            match.player1_games = int(score.get("player1_games") or 0)
        if "player2_games" in score:
            match.player2_games = int(score.get("player2_games") or 0)
        if "player1_points" in score:
            match.player1_points = int(score.get("player1_points") or 0)
        if "player2_points" in score:
            match.player2_points = int(score.get("player2_points") or 0)
        if "sets_history" in score:
            match.sets_history = json.dumps(score.get("sets_history") or [])

    if "match_config" in patch:
        match.match_config = dump_match_config(patch.get("match_config"))

    if db_court_changed:
        target = db.session.get(Court, new_court_id)
        if not target:
            raise ValueError(f"Court not found: {new_court_id}")
        match.court_id = new_court_id
    elif new_court_id and not db.session.get(Court, new_court_id):
        raise ValueError(f"Court not found: {new_court_id}")

    match.updated_at = utc_now_iso()
    db.session.commit()

    if db_court_changed:
        _move_schedule_court(match, new_court_id)

    score_payload = {
        "player1_sets": match.player1_sets,
        "player2_sets": match.player2_sets,
        "player1_games": match.player1_games,
        "player2_games": match.player2_games,
        "player1_points": match.player1_points,
        "player2_points": match.player2_points,
        "sets_history": json.loads(match.sets_history) if match.sets_history else [],
        "is_tiebreak": bool((score or {}).get("is_tiebreak", False)),
        "is_super_tiebreak": bool((score or {}).get("is_super_tiebreak", False)),
        "is_player1_serving": (score or {}).get("is_player1_serving"),
    }

    _paint_match_on_court(new_court_id, match, score_payload, _sync_live_score_to_court_state, _apply_db_flags_to_court_state)
    if tablet_court_changed:
        _restore_or_clear_court(session_court_id, except_match_id=match.id, _sync_live_score_to_court_state=_sync_live_score_to_court_state, _apply_db_flags_to_court_state=_apply_db_flags_to_court_state)
    if db_court_changed and old_court_id and old_court_id != new_court_id and old_court_id != session_court_id:
        _restore_or_clear_court(old_court_id, except_match_id=match.id, _sync_live_score_to_court_state=_sync_live_score_to_court_state, _apply_db_flags_to_court_state=_apply_db_flags_to_court_state)

    if match.tournament_id:
        emit_office_invalidation(match.tournament_id, ["results", "schedule", "dashboard"])

    command: dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "type": "director_control",
        "session_court_id": session_court_id,
        "target_match_id": match.id,
        "target_client_match_uuid": match.client_match_uuid,
        "match_id": match.id,
        "client_match_uuid": match.client_match_uuid,
        "court_id": match.court_id,
        "court_name": _mobile_court_name(match.court_id),
        "player1_name": match.player1_name,
        "player2_name": match.player2_name,
        "score": score_payload,
        "match_config": parse_stored_match_config(match.match_config),
    }
    # Always mint a token for the target court so a tablet still authorized
    # on the old PIN/session (Vilnius: SQL already moved the row) can switch.
    if new_court_id:
        command["court_token"] = issue_court_token(new_court_id)
        command["court_token_expires_at"] = court_session_expires_at()

    stored = director_command_broker.publish(command)
    logger.info(
        "director_control_applied",
        match_id=match.id,
        session_court=session_court_id,
        court_id=match.court_id,
        tablet_court_changed=tablet_court_changed,
        db_court_changed=db_court_changed,
        command_id=stored["id"],
    )
    return stored


def _paint_match_on_court(
    kort_id: str,
    match: Match,
    score: dict[str, Any],
    _sync_live_score_to_court_state,
    _apply_db_flags_to_court_state,
) -> None:
    if not kort_id:
        return
    court_state = ensure_court_state(kort_id)
    with STATE_LOCK:
        court_state["A"]["surname"] = match.player1_name
        court_state["B"]["surname"] = match.player2_name
        court_state["A"]["full_name"] = match.player1_name
        court_state["B"]["full_name"] = match.player2_name
        _apply_db_flags_to_court_state(
            court_state,
            match.tournament_id,
            match.player1_name,
            match.player2_name,
        )
        _sync_live_score_to_court_state(court_state, match, score)
        if score.get("is_player1_serving") is True:
            court_state["serve"] = "A"
        elif score.get("is_player1_serving") is False:
            court_state["serve"] = "B"
        court_state["match_status"]["active"] = match.status == "in_progress"
        court_state["updated"] = utc_now_iso()
    emit_score_update(kort_id, court_state)


def _restore_or_clear_court(
    kort_id: str,
    *,
    except_match_id: int,
    _sync_live_score_to_court_state,
    _apply_db_flags_to_court_state,
) -> None:
    other = (
        Match.query
        .filter_by(court_id=kort_id, status="in_progress")
        .filter(Match.id != except_match_id)
        .order_by(Match.updated_at.desc(), Match.id.desc())
        .first()
    )
    if other:
        score = {
            "player1_sets": other.player1_sets,
            "player2_sets": other.player2_sets,
            "player1_games": other.player1_games,
            "player2_games": other.player2_games,
            "player1_points": other.player1_points,
            "player2_points": other.player2_points,
            "sets_history": json.loads(other.sets_history) if other.sets_history else [],
        }
        _paint_match_on_court(kort_id, other, score, _sync_live_score_to_court_state, _apply_db_flags_to_court_state)
        return

    state = get_court_state(kort_id)
    if state is None:
        return
    with STATE_LOCK:
        identity = {
            "court_name": state.get("court_name"),
            "display_order": state.get("display_order"),
            "tournament_id": state.get("tournament_id"),
            "tournament_name": state.get("tournament_name"),
        }
        fresh = _empty_court_state()
        fresh.update(identity)
        state.clear()
        state.update(fresh)
    emit_score_update(kort_id, state)


def _move_schedule_court(match: Match, new_court_id: str) -> None:
    if not match.schedule_id:
        return
    from ..database import db_conn

    label = _court_label(new_court_id)
    with db_conn() as conn:
        conn.execute(
            """
            UPDATE tournament_schedule
            SET court_id = ?, court_label = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_court_id, label, utc_now_iso(), match.schedule_id),
        )
        conn.commit()


def _court_label(kort_id: str) -> str:
    court = db.session.get(Court, kort_id)
    if court and court.name:
        return str(court.name)
    match = re.fullmatch(r"t\d+-(\d+)", str(kort_id), flags=re.IGNORECASE)
    return match.group(1) if match else str(kort_id)


def _mobile_court_name(kort_id: str) -> str:
    label = _court_label(kort_id)
    if str(label).isdigit():
        return f"Kort {label}"
    return str(label)


def _command_targets(
    command: dict[str, Any],
    session_court_id: str,
    match_id: int | None,
    client_match_uuid: str | None,
) -> bool:
    target_match_id = command.get("target_match_id")
    target_uuid = str(command.get("target_client_match_uuid") or "")
    if match_id and target_match_id and int(target_match_id) == int(match_id):
        return True
    uuid_text = str(client_match_uuid or "").strip()
    if uuid_text and target_uuid and uuid_text == target_uuid:
        return True
    if str(command.get("session_court_id") or "") != str(session_court_id or ""):
        return False
    return False


def _presence_key(session_court_id: str, match_id: int | None, client_match_uuid: str | None) -> str:
    if match_id:
        return f"{session_court_id}:m:{match_id}"
    if client_match_uuid:
        return f"{session_court_id}:u:{client_match_uuid}"
    return f"{session_court_id}:idle"


def _issued_epoch(command: dict[str, Any]) -> float:
    raw = command.get("issued_at")
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return parsed.timestamp()
    except Exception:
        return time.time()


def _optional_int(value: Any, fallback: Any = None) -> int | None:
    if value in (None, ""):
        return fallback if fallback is None else int(fallback)
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback
