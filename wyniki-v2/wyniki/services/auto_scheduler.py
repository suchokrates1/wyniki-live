"""Pure, DB-agnostic auto-placement of tournament matches onto courts and time slots.

B1 matches are pinned to configured B1 courts only. All other matches are load-balanced
across the remaining courts to shorten the overall day (makespan), while respecting phase
order, player rest gaps, and no overlapping appearances for the same player.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

DEFAULT_SLOT_MINUTES = 60
B1_SLOT_MINUTES = 75
DEFAULT_START_TIME = "09:30"

# Highest band gets the lowest court number in default config (court1=B4 ... court4=B1).
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


def time_to_minutes(time_str: str) -> int:
    try:
        hours, mins = (int(part) for part in str(time_str).split(":", 1))
        return hours * 60 + mins
    except (ValueError, AttributeError):
        return 9 * 60 + 30


def slot_minutes_for(band: str, config: Dict[str, Any]) -> int:
    """Return slot length in minutes for a band, honouring config overrides."""
    slot_config = config.get("slot_minutes") or {}
    if band and band in slot_config:
        return int(slot_config[band])
    if band == "B1":
        return B1_SLOT_MINUTES
    return int(slot_config.get("default", DEFAULT_SLOT_MINUTES))


def normalize_b1_court_ids(config: Dict[str, Any]) -> List[str]:
    """Return all courts designated as B1-special for this tournament."""
    raw_ids = config.get("b1_court_ids")
    if isinstance(raw_ids, list):
        ids = [str(court_id).strip() for court_id in raw_ids if str(court_id or "").strip()]
        if ids:
            return ids
    single = str(config.get("b1_court_id") or "").strip()
    return [single] if single else []


def is_b1_court(court_id: Optional[str], config: Dict[str, Any]) -> bool:
    value = str(court_id or "").strip()
    return bool(value) and value in normalize_b1_court_ids(config)


def build_default_config(courts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a sensible default config given the tournament courts."""
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
        "b1_court_ids": [b1_court_id] if b1_court_id else [],
        "category_courts": category_courts,
        "slot_minutes": {"B1": B1_SLOT_MINUTES, "default": DEFAULT_SLOT_MINUTES},
        "rest_slots": 1,
    }


def apply_b1_court(config: Dict[str, Any], b1_court_id: Optional[str]) -> Dict[str, Any]:
    """Backward-compatible helper for a single B1 court."""
    court_id = str(b1_court_id or "").strip()
    if not court_id:
        return dict(config)
    return apply_b1_courts(config, [court_id])


def apply_b1_courts(config: Dict[str, Any], b1_court_ids: Optional[List[str]]) -> Dict[str, Any]:
    """Pin B1 to the first selected court and mark all selected courts as B1-special."""
    ids = [str(court_id).strip() for court_id in (b1_court_ids or []) if str(court_id or "").strip()]
    if not ids:
        return dict(config)
    result = dict(config)
    category_courts = dict(result.get("category_courts") or {})
    primary_b1 = ids[0]
    previous_b1 = category_courts.get("B1")
    if previous_b1 and previous_b1 != primary_b1:
        for band, court_id in list(category_courts.items()):
            if court_id == primary_b1 and band != "B1":
                category_courts[band] = previous_b1
                break
    category_courts["B1"] = primary_b1
    result["category_courts"] = category_courts
    result["b1_court_id"] = primary_b1
    result["b1_court_ids"] = ids
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


def _players(match: Dict[str, Any]) -> Set[str]:
    return {
        str(match.get("player1_name") or "").strip().lower(),
        str(match.get("player2_name") or "").strip().lower(),
    } - {""}


def order_with_rest(matches: List[Dict[str, Any]], rest_slots: int = 1) -> List[Dict[str, Any]]:
    """Order matches to maximise rest between a player's matches on the same court."""
    remaining = list(matches)
    ordered: List[Dict[str, Any]] = []
    last_pos: Dict[str, int] = {}
    never = -(10 ** 6)
    position = 0
    while remaining:
        best_index = 0
        best_key = None
        for index, match in enumerate(remaining):
            players = _players(match)
            if players:
                gap = min(position - last_pos.get(player, never) for player in players)
            else:
                gap = 10 ** 6
            key = (gap, -index)
            if best_key is None or key > best_key:
                best_key = key
                best_index = index
        match = remaining.pop(best_index)
        ordered.append(match)
        for player in _players(match):
            last_pos[player] = position
        position += 1
    return ordered


def _ordered_flex_court_ids(config: Dict[str, Any]) -> List[str]:
    """Non-B1 courts available for load-balanced scheduling."""
    b1_set = set(normalize_b1_court_ids(config))
    seen: List[str] = []
    for court_id in (config.get("category_courts") or {}).values():
        value = str(court_id or "").strip()
        if value and value not in b1_set and value not in seen:
            seen.append(value)
    return seen


def _b1_court_for_match(
    match: Dict[str, Any],
    config: Dict[str, Any],
    *,
    b1_counter: Optional[List[int]] = None,
) -> Optional[str]:
    b1_courts = normalize_b1_court_ids(config)
    if not b1_courts:
        return None
    if len(b1_courts) == 1:
        return b1_courts[0]
    index = (b1_counter[0] if b1_counter else 0) % len(b1_courts)
    if b1_counter is not None:
        b1_counter[0] += 1
    return b1_courts[index]


def _slot_minutes_for_court(court_id: str, config: Dict[str, Any], band: str = "") -> int:
    if is_b1_court(court_id, config):
        return slot_minutes_for("B1", config)
    return slot_minutes_for(band, config)


def _rest_gap_minutes(config: Dict[str, Any], rest_slots: int) -> int:
    return max(0, rest_slots) * slot_minutes_for("", config)


def _placement_window(placement: Dict[str, Any], config: Dict[str, Any]) -> Tuple[int, int]:
    start = time_to_minutes(str(placement.get("scheduled_time") or DEFAULT_START_TIME))
    band = normalize_band(
        placement.get("match", {}).get("category_name")
        or placement.get("match", {}).get("group_name")
        or placement.get("category_name")
        or placement.get("group_name")
    )
    court_id = str(placement.get("court_id") or "")
    duration = _slot_minutes_for_court(court_id, config, band)
    return start, start + duration


def _slot_available_for_player(
    match: Dict[str, Any],
    court_id: str,
    start_time: str,
    config: Dict[str, Any],
    scheduled: List[Dict[str, Any]],
    rest_slots: int,
) -> bool:
    band = normalize_band(match.get("category_name") or match.get("group_name"))
    start, end = _placement_window(
        {"scheduled_time": start_time, "court_id": court_id, "match": match},
        config,
    )
    rest_gap = _rest_gap_minutes(config, rest_slots)
    players = _players(match)
    for placement in scheduled:
        other_players = _players(placement["match"])
        if not players & other_players:
            continue
        other_start, other_end = _placement_window(placement, config)
        if start < other_end and end > other_start:
            return False
        if other_end <= start and (start - other_end) < rest_gap:
            return False
        if end <= other_start and (other_start - end) < rest_gap:
            return False
    return True


def _order_matches_for_scheduling(matches: List[Dict[str, Any]], rest_slots: int) -> List[Dict[str, Any]]:
    buckets: Dict[int, List[Dict[str, Any]]] = {}
    for match in matches:
        buckets.setdefault(_phase_rank(match.get("phase")), []).append(match)
    ordered: List[Dict[str, Any]] = []
    for rank in sorted(buckets):
        phase_matches = sorted(
            buckets[rank],
            key=lambda m: (int(m.get("sort_order") or 0), int(m.get("id") or 0)),
        )
        ordered.extend(order_with_rest(phase_matches, rest_slots=rest_slots))
    return ordered


def _place_on_court(
    court_matches: List[Dict[str, Any]],
    court_id: str,
    config: Dict[str, Any],
    day_date: str,
    start_time: str,
    rest_slots: int,
) -> List[Dict[str, Any]]:
    ordered = _order_matches_for_scheduling(court_matches, rest_slots)
    placements: List[Dict[str, Any]] = []
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
        cursor = add_minutes(cursor, _slot_minutes_for_court(court_id, config, band))
    return placements


def _place_load_balanced(
    matches: List[Dict[str, Any]],
    flex_courts: List[str],
    config: Dict[str, Any],
    day_date: str,
    start_time: str,
    rest_slots: int,
) -> List[Dict[str, Any]]:
    if not flex_courts:
        return [
            {
                "match": match,
                "court_id": None,
                "day_date": day_date,
                "scheduled_time": "",
                "band": normalize_band(match.get("category_name") or match.get("group_name")),
            }
            for match in matches
        ]

    ordered = _order_matches_for_scheduling(matches, rest_slots)
    court_next_time = {court_id: start_time for court_id in flex_courts}
    scheduled: List[Dict[str, Any]] = []
    placements: List[Dict[str, Any]] = []

    for match in ordered:
        band = normalize_band(match.get("category_name") or match.get("group_name"))
        candidates = sorted(flex_courts, key=lambda court_id: time_to_minutes(court_next_time[court_id]))
        chosen_court = None
        chosen_start = None
        for court_id in candidates:
            proposed_start = court_next_time[court_id]
            if _slot_available_for_player(match, court_id, proposed_start, config, scheduled, rest_slots):
                chosen_court = court_id
                chosen_start = proposed_start
                break
        if not chosen_court:
            chosen_court = candidates[0]
            chosen_start = court_next_time[chosen_court]

        placement = {
            "match": match,
            "court_id": chosen_court,
            "day_date": day_date,
            "scheduled_time": chosen_start,
            "band": band,
        }
        placements.append(placement)
        scheduled.append(placement)
        court_next_time[chosen_court] = add_minutes(
            chosen_start,
            _slot_minutes_for_court(chosen_court, config, band),
        )

    return placements


def place_matches(
    matches: List[Dict[str, Any]],
    config: Dict[str, Any],
    day_date: str,
) -> List[Dict[str, Any]]:
    """Produce time/court placements for the given matches on a single day."""
    start_time = str(config.get("start_time") or DEFAULT_START_TIME)
    rest_slots = int(config.get("rest_slots") or 1)
    b1_courts = normalize_b1_court_ids(config)
    flex_courts = _ordered_flex_court_ids(config)

    b1_matches: List[Dict[str, Any]] = []
    flex_matches: List[Dict[str, Any]] = []
    unplaced: List[Dict[str, Any]] = []

    for match in matches:
        band = normalize_band(match.get("category_name") or match.get("group_name"))
        if band == "B1" and b1_courts:
            b1_matches.append(match)
        elif flex_courts:
            flex_matches.append(match)
        elif str(match.get("court_id") or "").strip():
            flex_matches.append(match)
        else:
            unplaced.append(match)

    placements: List[Dict[str, Any]] = []

    if b1_matches:
        by_b1_court: Dict[str, List[Dict[str, Any]]] = {}
        b1_counter = [0]
        for match in b1_matches:
            court_id = _b1_court_for_match(match, config, b1_counter=b1_counter)
            if not court_id:
                unplaced.append(match)
                continue
            by_b1_court.setdefault(court_id, []).append(match)
        for court_id, court_matches in by_b1_court.items():
            placements.extend(_place_on_court(court_matches, court_id, config, day_date, start_time, rest_slots))

    placements.extend(_place_load_balanced(flex_matches, flex_courts, config, day_date, start_time, rest_slots))

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
    """Recompute sequential times for one court after a drag/reorder."""
    if not ordered_entries:
        return []
    cursor = (
        start_time
        or str(ordered_entries[0].get("scheduled_time") or "").strip()
        or str(config.get("start_time") or DEFAULT_START_TIME)
    )
    result: List[Dict[str, Any]] = []
    court_id = str(ordered_entries[0].get("court_id") or "").strip()
    for entry in ordered_entries:
        band = normalize_band(entry.get("category_name") or entry.get("group_name"))
        updated = dict(entry)
        updated["scheduled_time"] = cursor
        result.append(updated)
        cursor = add_minutes(cursor, _slot_minutes_for_court(court_id, config, band))
    return result


# Backward-compatible alias used by tests and older imports.
def _court_for_match(
    match: Dict[str, Any],
    config: Dict[str, Any],
    *,
    b1_counter: Optional[List[int]] = None,
) -> Optional[str]:
    band = normalize_band(match.get("category_name") or match.get("group_name"))
    if band == "B1":
        return _b1_court_for_match(match, config, b1_counter=b1_counter)
    flex_courts = _ordered_flex_court_ids(config)
    return flex_courts[0] if flex_courts else str(match.get("court_id") or "") or None
