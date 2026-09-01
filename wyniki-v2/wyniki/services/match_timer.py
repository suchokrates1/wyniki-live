"""Umpire-driven live match clock for overlay / court RAM state."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..db_models import utc_now_iso
from ..utils import parse_iso_datetime

# Reject epoch-0 / pre-2020 values that used to invent overlay clocks.
_MIN_START_MS = 1_577_836_800_000
_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000


def iso_from_epoch_ms(value: Any) -> str | None:
    if value is None or value == "":
        return None
    try:
        ms = int(value)
    except (TypeError, ValueError):
        return None
    if ms < _MIN_START_MS:
        return None
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    if ms > now_ms + _MAX_FUTURE_SKEW_MS:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def elapsed_seconds_since(iso_ts: str | None) -> int:
    if not iso_ts:
        return 0
    try:
        started = parse_iso_datetime(iso_ts)
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return max(0, int((now - started).total_seconds()))
    except Exception:
        return 0


def apply_match_start_from_payload(match: Any, data: dict | None) -> str | None:
    """Persist tablet matchStartTime onto Match.started_at when the client sends it."""
    payload = data or {}
    iso = iso_from_epoch_ms(payload.get("match_start_time_ms"))
    if iso:
        match.started_at = iso
    return getattr(match, "started_at", None)


def sync_court_match_timer_from_match(court_state: dict, match: Any) -> None:
    """Drive overlay match_time from the umpire clock, not match.created_at."""
    match_time = court_state.setdefault("match_time", {})
    match_time.setdefault("seconds", 0)
    match_time.setdefault("running", False)
    match_time.setdefault("offset_seconds", 0)
    match_time.setdefault("started_ts", None)
    match_time.setdefault("finished_ts", None)
    match_time.setdefault("resume_ts", None)
    match_time.setdefault("auto_resume", True)

    if match.status == "in_progress":
        started_ts = (
            getattr(match, "started_at", None)
            or match_time.get("started_ts")
            or match.created_at
            or utc_now_iso()
        )
        match_time["started_ts"] = started_ts
        match_time["finished_ts"] = None
        match_time["running"] = True
        match_time["offset_seconds"] = 0
        match_time["resume_ts"] = started_ts
        match_time["seconds"] = elapsed_seconds_since(started_ts)
        return

    if match.status == "not_started":
        match_time["running"] = False
        match_time["resume_ts"] = None
        if not getattr(match, "started_at", None):
            match_time["started_ts"] = None
            match_time["seconds"] = 0
            match_time["offset_seconds"] = 0
        return

    resume_ts = match_time.get("resume_ts")
    if match_time.get("running") and resume_ts:
        try:
            resumed = parse_iso_datetime(resume_ts)
            if resumed.tzinfo is None:
                resumed = resumed.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            elapsed = max(0, int((now - resumed).total_seconds()))
            total = match_time.get("offset_seconds", 0) + elapsed
            match_time["offset_seconds"] = total
            match_time["seconds"] = total
        except Exception:
            started = match_time.get("started_ts") or getattr(match, "started_at", None)
            if started:
                match_time["seconds"] = elapsed_seconds_since(started)

    match_time["running"] = False
    match_time["resume_ts"] = None
    if not match_time.get("finished_ts") and match.status == "finished":
        match_time["finished_ts"] = match.updated_at or utc_now_iso()
