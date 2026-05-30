"""Pure, DB-agnostic auto-placement of tournament matches onto courts and time slots.

Modelled on the real III Mistrzostwa Polski layout (tournament_id=25):
- one court per category band (B1..B4),
- B1 uses a longer slot (it is the "special" court, prepared differently),
- matches placed sequentially from a start time, one per slot,
- a player never plays two back-to-back slots on their court (rest constraint).

All functions here are pure (no DB, no Flask) so they are easy to unit-test.
"""
from __future__ import annotations

import re
from collections import deque
from typing import Any, Dict, List, Optional

DEFAULT_SLOT_MINUTES = 60
B1_SLOT_MINUTES = 75
DEFAULT_START_TIME = "09:30"

# Highest band gets the lowest court (matches III MP: court1=B4 ... court4=B1).
_BAND_COURT_ORDER = ["B4", "B3", "B2", "B1"]


def normalize_band(category_name: Optional[str]) -> str:
    """Extract the B-band (B1..B4) from a category/group label."""
    match = re.search(r"B\s*([1-4])", str(category_name or "").upper())
    return f"B{match.group(1)}" if match else ""


def add_minutes(time_str: str, minutes: int) -> str:
    """Add minutes to a HH:MM string, returning HH:MM (clamped to 23:59)."""
    try:
        hours, mins = (int(part) for part in str(time_str).split(":", 1))
    except (ValueError, AttributeError):
        hours, mins = 9, 30
    total = hours * 60 + mins + int(minutes)
    total = max(0, min(total, 23 * 60 + 59))
    return f"{total // 60:02d}:{total % 60:02d}"


def slot_minutes_for(band: str, config: Dict[str, Any]) -> int:
    """Return slot length in minutes for a band, honouring config overrides."""
    slot_config = config.get("slot_minutes") or {}
    if band and band in slot_config:
        return int(slot_config[band])
    if band == "B1":
        return B1_SLOT_MINUTES
    return int(slot_config.get("default", DEFAULT_SLOT_MINUTES))


def build_default_config(courts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a sensible default config given the tournament courts.

    Courts are ordered by display_order; bands B4..B1 are assigned in order so that
    B1 lands on the last (highest display_order) court, like in III MP.
    """
    ordered = sorted(
        courts or [],
        key=lambda court: (int(court.get("display_order") or 0), str(court.get("kort_id") or "")),
    )
    court_ids = [str(court.get("kort_id")) for court in ordered if court.get("kort_id")]
    category_courts: Dict[str, str] = {}
    for index, band in enumerate(_BAND_COURT_ORDER):
        if index < len(court_ids):
            category_courts[band] = court_ids[index]
    b1_court_id = category_courts.get("B1") or (court_ids[-1] if court_ids else "")
    return {
        "start_time": DEFAULT_START_TIME,
        "b1_court_id": b1_court_id,
        "category_courts": category_courts,
        "slot_minutes": {"B1": B1_SLOT_MINUTES, "default": DEFAULT_SLOT_MINUTES},
        "rest_slots": 1,
    }


def apply_b1_court(config: Dict[str, Any], b1_court_id: Optional[str]) -> Dict[str, Any]:
    """Return a config copy where B1 is pinned to b1_court_id and other bands shuffle around it."""
    if not b1_court_id:
        return dict(config)
    result = dict(config)
    category_courts = dict(result.get("category_courts") or {})
    previous_b1 = category_courts.get("B1")
    if previous_b1 and previous_b1 != b1_court_id:
        # Whatever band currently sits on the requested court swaps with B1's old court.
        for band, court_id in list(category_courts.items()):
            if court_id == b1_court_id and band != "B1":
                category_courts[band] = previous_b1
                break
    category_courts["B1"] = b1_court_id
    result["category_courts"] = category_courts
    result["b1_court_id"] = b1_court_id
    return result


def _phase_rank(phase: Optional[str]) -> int:
    text = str(phase or "").lower()
    if not text or "grup" in text:
        return 0
    if "ćwierć" in text or "cwierc" in text or "quarter" in text:
        return 1
    if "półfinał" in text or "polfinal" in text or "semi" in text:
        return 2
    if re.search(r"o\s*[57]\.?\s*miejsc", text):
        return 3
    if re.search(r"o\s*3\.?\s*miejsc", text):
        return 4
    if "finał" in text or "final" in text:
        return 5
    return 6


def _players(match: Dict[str, Any]) -> set:
    return {
        str(match.get("player1_name") or "").strip().lower(),
        str(match.get("player2_name") or "").strip().lower(),
    } - {""}


def order_with_rest(matches: List[Dict[str, Any]], rest_slots: int = 1) -> List[Dict[str, Any]]:
    """Order matches so that no player appears within `rest_slots` consecutive slots.

    Preserves the incoming order as a base (group round-robin pairing / phase rank) and
    greedily picks the next match that does not clash with recently scheduled players.
    Falls back to the next match when no conflict-free choice exists.
    """
    remaining = list(matches)
    ordered: List[Dict[str, Any]] = []
    recent: deque = deque(maxlen=max(1, int(rest_slots)))
    while remaining:
        recent_players: set = set()
        for player_set in recent:
            recent_players |= player_set
        chosen_index = next(
            (i for i, match in enumerate(remaining) if not (_players(match) & recent_players)),
            None,
        )
        if chosen_index is None:
            chosen_index = 0
        match = remaining.pop(chosen_index)
        ordered.append(match)
        recent.append(_players(match))
    return ordered


def _court_for_match(match: Dict[str, Any], config: Dict[str, Any]) -> Optional[str]:
    band = normalize_band(match.get("category_name") or match.get("group_name"))
    category_courts = config.get("category_courts") or {}
    if band and band in category_courts:
        return category_courts[band]
    # Keep an already-assigned court if the band is unknown/unmapped.
    return str(match.get("court_id")) if match.get("court_id") else None


def place_matches(
    matches: List[Dict[str, Any]],
    config: Dict[str, Any],
    day_date: str,
) -> List[Dict[str, Any]]:
    """Produce time/court placements for the given matches on a single day.

    Returns a list of dicts: {match, court_id, day_date, scheduled_time, band}.
    Matches without a resolvable court are returned with court_id=None and no time
    (they need manual placement on the board).
    """
    start_time = str(config.get("start_time") or DEFAULT_START_TIME)
    rest_slots = int(config.get("rest_slots") or 1)

    by_court: Dict[str, List[Dict[str, Any]]] = {}
    unplaced: List[Dict[str, Any]] = []
    for match in matches:
        court_id = _court_for_match(match, config)
        if not court_id:
            unplaced.append(match)
            continue
        by_court.setdefault(court_id, []).append(match)

    placements: List[Dict[str, Any]] = []
    for court_id, court_matches in by_court.items():
        court_matches.sort(
            key=lambda m: (
                _phase_rank(m.get("phase")),
                int(m.get("sort_order") or 0),
                int(m.get("id") or 0),
            )
        )
        ordered = order_with_rest(court_matches, rest_slots=rest_slots)
        cursor = start_time
        for match in ordered:
            band = normalize_band(match.get("category_name") or match.get("group_name"))
            placements.append(
                {
                    "match": match,
                    "court_id": court_id,
                    "day_date": day_date,
                    "scheduled_time": cursor,
                    "band": band,
                }
            )
            cursor = add_minutes(cursor, slot_minutes_for(band, config))

    for match in unplaced:
        placements.append(
            {
                "match": match,
                "court_id": None,
                "day_date": day_date,
                "scheduled_time": "",
                "band": normalize_band(match.get("category_name") or match.get("group_name")),
            }
        )
    return placements


def recompute_court_times(
    ordered_entries: List[Dict[str, Any]],
    config: Dict[str, Any],
    start_time: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Recompute sequential times for one court after a drag/reorder.

    `ordered_entries` is the desired order on that court. Returns the same entries with
    updated `scheduled_time`. The first entry keeps its own time (or `start_time`/config
    start), the rest cascade by slot length.
    """
    if not ordered_entries:
        return []
    cursor = (
        start_time
        or str(ordered_entries[0].get("scheduled_time") or "").strip()
        or str(config.get("start_time") or DEFAULT_START_TIME)
    )
    result: List[Dict[str, Any]] = []
    for entry in ordered_entries:
        band = normalize_band(entry.get("category_name") or entry.get("group_name"))
        updated = dict(entry)
        updated["scheduled_time"] = cursor
        result.append(updated)
        cursor = add_minutes(cursor, slot_minutes_for(band, config))
    return result
