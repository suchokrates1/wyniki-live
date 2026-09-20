"""Pure, DB-agnostic auto-placement of tournament matches onto courts and time slots.

B1 matches are pinned to configured B1 courts only. All other matches are load-balanced
across the remaining courts to shorten the overall day (makespan), while respecting phase
order, player rest gaps, and no overlapping appearances for the same player.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

from .teams import split_team_display_name

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


def _int_minutes_map(raw: Any) -> Dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, int] = {}
    for key, value in raw.items():
        name = str(key or "").strip()
        if not name:
            continue
        try:
            minutes = int(value)
        except (TypeError, ValueError):
            continue
        out[name] = max(15, min(180, minutes))
    return out


def slot_minutes_for(band: str, config: Dict[str, Any]) -> int:
    """Return slot length in minutes for a band, honouring config overrides."""
    slot_config = config.get("slot_minutes") or {}
    if band and band in slot_config:
        return int(slot_config[band])
    if band == "B1":
        return B1_SLOT_MINUTES
    return int(slot_config.get("default", DEFAULT_SLOT_MINUTES))


def slot_minutes_for_entry(
    entry: Optional[Dict[str, Any]],
    config: Dict[str, Any],
    court_id: str = "",
) -> int:
    """Match duration comes from the category (or its B-band), never from the court."""
    payload = dict(entry or {})
    match = payload.get("match") if isinstance(payload.get("match"), dict) else {}
    cat_slots = _int_minutes_map(config.get("category_slot_minutes"))
    cat_id = str(
        payload.get("tournament_category_id")
        or payload.get("category_id")
        or match.get("tournament_category_id")
        or ""
    ).strip()
    if cat_id and cat_id in cat_slots:
        return cat_slots[cat_id]
    label = str(payload.get("category_name") or match.get("category_name") or "").strip()
    if label:
        keyed = cat_slots.get(f"label:{label}")
        if keyed:
            return keyed
        for key, minutes in cat_slots.items():
            prefix = str(key).removeprefix("label:")
            if prefix and (label == prefix or label.startswith(f"{prefix} —")):
                return minutes
    band = normalize_band(
        payload.get("category_name")
        or payload.get("group_name")
        or payload.get("band")
        or match.get("category_name")
        or match.get("group_name")
        or ""
    )
    return slot_minutes_for(band, config)


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
        "court_ids": court_ids,
        "start_time": DEFAULT_START_TIME,
        "b1_court_id": b1_court_id,
        "b1_court_ids": [b1_court_id] if b1_court_id else [],
        "category_courts": category_courts,
        "slot_minutes": {"B1": B1_SLOT_MINUTES, "default": DEFAULT_SLOT_MINUTES},
        "category_slot_minutes": {},
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
    """Playing order of a phase: group play, then knockout rounds from the widest draw down.

    Knockout rounds rank by how many players are still in that part of the draw, so
    "1/8 finału" (16) comes before "Ćwierćfinał" and "o miejsca 5–8" (8), then semifinals
    (4), then two-player matches: other places, 3rd place, final.
    """
    text = str(phase or "").lower()
    if not text:
        return 0
    suffix = text.rsplit(" — ", 1)[-1]
    knockout_words = r"ćwierć|cwierc|quarter|półfinał|polfinal|semi|miejsc|finał|final|1/\d+"
    if "grup" in text and not re.search(knockout_words, suffix):
        return 0
    size = None
    fraction = re.search(r"1/(\d+)", suffix)
    places = re.search(r"miejsca\s+(\d+)\s*[–-]\s*(\d+)", suffix)
    if fraction:
        size = int(fraction.group(1)) * 2
    elif places:
        size = int(places.group(2)) - int(places.group(1)) + 1
    elif "ćwierć" in suffix or "cwierc" in suffix or "quarter" in suffix:
        size = 8
    elif "półfinał" in suffix or "polfinal" in suffix or "semi" in suffix:
        size = 4
    if size is not None and size > 2:
        return max(1, 6 - (size.bit_length() - 1))  # 32→1, 16→2, 8→3, 4→4
    if re.search(r"(?<!\d)3\.?\s*miejsc", suffix):
        return 7
    if re.search(r"(?<!\d)\d+\.?\s*miejsc", suffix):
        return 6
    if "finał" in suffix or "final" in suffix:
        return 8
    return 9


_PENDING_NAME = re.compile(r"^(zwycięzca|przegrany|winner|loser)\b|^\d+\.\s", re.IGNORECASE)


def _players(match: Dict[str, Any]) -> Set[str]:
    """People on court: a pair counts as both partners (they also play singles); names of
    players not known yet ("Zwycięzca: Półfinał 1") are not people and never clash."""
    people: Set[str] = set()
    for field in ("player1_name", "player2_name"):
        name = str(match.get(field) or "").strip()
        if not name or _PENDING_NAME.search(name):
            continue
        partners = split_team_display_name(name)
        for person in (partners or (name,)):
            people.add(person.strip().lower())
    return people


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
    """Non-B1 courts available for load-balanced scheduling: every tournament court that is
    not B1-special (older configs without ``court_ids`` fall back to the band mapping)."""
    b1_set = set(normalize_b1_court_ids(config))
    seen: List[str] = []
    for court_id in config.get("court_ids") or []:
        value = str(court_id or "").strip()
        if value and value not in b1_set and value not in seen:
            seen.append(value)
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
    """Duration follows the match band, not the court column."""
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
    duration = slot_minutes_for_entry(placement.get("match") or placement, config, court_id)
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


def _day_end_minutes(config: Dict[str, Any]) -> Optional[int]:
    """Latest minute a match may finish, or None when the day has no end."""
    value = str(config.get("end_time") or "").strip()
    if not re.match(r"^\d{1,2}:\d{2}$", value):
        return None
    return time_to_minutes(value)


def _category_key(match: Dict[str, Any]) -> str:
    return str(match.get("category_name") or match.get("group_name") or "").strip().casefold()


def _category_root(match: Dict[str, Any]) -> str:
    """Category without the group/phase suffix: "B4 Men — Grupa A — Finał" -> "b4 men"."""
    text = str(match.get("category_name") or match.get("group_name") or match.get("phase") or "")
    return text.split(" — ")[0].strip().casefold()


def _phase_floor(match: Dict[str, Any], scheduled: List[Dict[str, Any]], config: Dict[str, Any]) -> int:
    """Earliest minute a match may start: after every earlier-phase match of its category."""
    rank = _phase_rank(match.get("phase"))
    if rank == 0:
        return 0
    root = _category_root(match)
    floor = 0
    for placement in scheduled:
        other = placement.get("match") or {}
        if _category_root(other) != root or _phase_rank(other.get("phase")) >= rank:
            continue
        if not str(placement.get("scheduled_time") or "").strip():
            continue
        floor = max(floor, _placement_window(placement, config)[1])
    return floor


def _unplaced(match: Dict[str, Any], day_date: Optional[str]) -> Dict[str, Any]:
    return {
        "match": match,
        "court_id": None,
        "day_date": day_date,
        "scheduled_time": "",
        "band": normalize_band(match.get("category_name") or match.get("group_name")),
    }


def _occupied_until(court_id: str, occupied: List[Dict[str, Any]], config: Dict[str, Any], start_time: str) -> str:
    """Start of the first free slot on a court after fixed placements (played, live, other phase)."""
    latest = time_to_minutes(start_time)
    for placement in occupied:
        if str(placement.get("court_id") or "") != str(court_id):
            continue
        _, end = _placement_window(placement, config)
        latest = max(latest, end)
    return f"{latest // 60:02d}:{latest % 60:02d}"


def _place_in_pool(
    matches: List[Dict[str, Any]],
    courts: List[str],
    config: Dict[str, Any],
    day_date: str,
    start_time: str,
    rest_slots: int,
    occupied: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Place matches on a pool of courts, each at the earliest start its players can take.

    A player never has two overlapping matches; the rest gap is kept when a court can start
    the match just as early with it. When no court has a free slot before the day ends, the match stays unplaced and the rest of
    its category waits too, so rounds keep their order.
    """
    if not courts:
        return [_unplaced(match, day_date) for match in matches]

    ordered = _order_matches_for_scheduling(matches, rest_slots)
    fixed = list(occupied or [])
    court_next_time = {court_id: _occupied_until(court_id, fixed, config, start_time) for court_id in courts}
    scheduled: List[Dict[str, Any]] = list(fixed)
    placements: List[Dict[str, Any]] = []
    day_end = _day_end_minutes(config)
    # Without an end time a player conflict can still push a match later, but not forever.
    search_end = day_end if day_end is not None else 24 * 60
    blocked_categories: Set[str] = set()

    for match in ordered:
        band = normalize_band(match.get("category_name") or match.get("group_name"))
        # the whole category waits (later rounds and phases) once one of its matches does not fit
        category = _category_root(match)
        if category in blocked_categories:
            placements.append(_unplaced(match, day_date))
            continue
        floor = _phase_floor(match, scheduled, config)

        def earliest(rest: int) -> Optional[Tuple[int, int, str]]:
            found: Optional[Tuple[int, int, str]] = None
            for order, court_id in enumerate(courts):
                duration = slot_minutes_for_entry(match, config, court_id)
                start = time_to_minutes(court_next_time[court_id])
                while start < floor:
                    start += duration
                while start + duration <= search_end:
                    candidate = f"{start // 60:02d}:{start % 60:02d}"
                    if _slot_available_for_player(match, court_id, candidate, config, scheduled, rest):
                        if found is None or (start, order) < found[:2]:
                            found = (start, order, court_id)
                        break
                    start += duration
            return found

        # Overlap is never allowed; the rest gap is kept unless it would leave a court idle.
        best = earliest(0)
        if best is not None and rest_slots > 0:
            rested = earliest(rest_slots)
            if rested is not None and rested[0] <= best[0]:
                best = rested
        if best is None:
            blocked_categories.add(category)
            placements.append(_unplaced(match, day_date))
            continue
        start, _, court_id = best
        placement = {
            "match": match,
            "court_id": court_id,
            "day_date": day_date,
            "scheduled_time": f"{start // 60:02d}:{start % 60:02d}",
            "band": band,
        }
        placements.append(placement)
        scheduled.append(placement)
        court_next_time[court_id] = add_minutes(
            placement["scheduled_time"],
            slot_minutes_for_entry(match, config, court_id),
        )
    return placements


def place_matches(
    matches: List[Dict[str, Any]],
    config: Dict[str, Any],
    day_date: str,
    occupied: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Produce time/court placements for the given matches on a single day.

    ``config["end_time"]`` (HH:MM, optional) is the latest a match may finish; matches that
    do not fit come back with ``court_id=None``. ``occupied`` lists placements that stay put
    (played, live or outside the planned phase): courts start after them and players keep
    their rest gap.
    """
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
        placements.extend(_place_in_pool(b1_matches, b1_courts, config, day_date, start_time, rest_slots, occupied))

    if flex_courts:
        placements.extend(_place_in_pool(flex_matches, flex_courts, config, day_date, start_time, rest_slots, occupied))
    else:
        unplaced.extend(flex_matches)

    for match in unplaced:
        placements.append(_unplaced(match, day_date))
    return placements


def place_matches_across_days(
    matches: List[Dict[str, Any]],
    config: Dict[str, Any],
    days: List[str],
    occupied_by_day: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """Fill day after day from start to end time; what does not fit on the last day stays unplaced."""
    remaining = list(matches)
    placements: List[Dict[str, Any]] = []
    occupied_by_day = occupied_by_day or {}
    # A later phase waits for the last day on which its category still plays an earlier phase.
    last_day_by_phase: Dict[Tuple[str, int], int] = {}
    for index, day in enumerate(days):
        for placement in occupied_by_day.get(day) or []:
            other = placement.get("match") or {}
            key = (_category_root(other), _phase_rank(other.get("phase")))
            last_day_by_phase[key] = max(last_day_by_phase.get(key, -1), index)

    def waits(match: Dict[str, Any], index: int) -> bool:
        root = _category_root(match)
        rank = _phase_rank(match.get("phase"))
        return any(r < rank and last > index for (c, r), last in last_day_by_phase.items() if c == root)

    for index, day in enumerate(days):
        if not remaining:
            break
        ready = [match for match in remaining if not waits(match, index)]
        if not ready:
            continue
        day_placements = place_matches(ready, config, day, occupied_by_day.get(day))
        placed_ids = set()
        for placement in day_placements:
            if placement.get("court_id") and placement.get("scheduled_time"):
                placements.append(placement)
                placed_ids.add(id(placement["match"]))
        remaining = [match for match in remaining if id(match) not in placed_ids]
    placements.extend(_unplaced(match, None) for match in remaining)
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
        updated = dict(entry)
        updated["scheduled_time"] = cursor
        result.append(updated)
        cursor = add_minutes(cursor, slot_minutes_for_entry(entry, config, court_id))
    return result


def reflow_court_entries(
    ordered_entries: List[Dict[str, Any]],
    config: Dict[str, Any],
    *,
    locked_fn=None,
) -> List[Dict[str, Any]]:
    """Pack unlocked matches back-to-back using category durations; locked rows keep their start."""
    if not ordered_entries:
        return []
    is_locked = locked_fn or (lambda _entry: False)
    court_id = str(ordered_entries[0].get("court_id") or "").strip()
    locked_spans: List[Tuple[int, int]] = []
    for entry in ordered_entries:
        start_raw = str(entry.get("scheduled_time") or "").strip()
        if not is_locked(entry) or not start_raw:
            continue
        start = time_to_minutes(start_raw)
        locked_spans.append((start, start + slot_minutes_for_entry(entry, config, court_id)))

    result: List[Dict[str, Any]] = []
    cursor: Optional[int] = None
    for entry in ordered_entries:
        duration = slot_minutes_for_entry(entry, config, court_id)
        updated = dict(entry)
        if is_locked(entry):
            start_raw = str(entry.get("scheduled_time") or "").strip()
            updated["scheduled_time"] = start_raw
            if start_raw:
                end = time_to_minutes(start_raw) + duration
                cursor = end if cursor is None else max(cursor, end)
            result.append(updated)
            continue
        start = cursor if cursor is not None else time_to_minutes(
            str(entry.get("scheduled_time") or "").strip() or str(config.get("start_time") or DEFAULT_START_TIME)
        )
        moved = True
        while moved:
            moved = False
            for locked_start, locked_end in locked_spans:
                if start < locked_end and (start + duration) > locked_start:
                    start = locked_end
                    moved = True
        updated["scheduled_time"] = f"{start // 60:02d}:{start % 60:02d}"
        result.append(updated)
        cursor = start + duration
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
