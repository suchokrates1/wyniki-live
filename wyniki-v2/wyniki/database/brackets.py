"""Database access layer submodule."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional
from werkzeug.security import generate_password_hash

from ..config import settings, logger

from .connection import db_conn
from ..services.teams import (
    DEFAULT_PLAY_FORMAT,
    PLAY_FORMAT_GROUPS_KNOCKOUT,
    PLAY_FORMAT_KNOCKOUT,
    competitor_identity_key,
    competitor_label_variants,
    is_team_display_name,
    normalize_play_format,
    same_competitor_label,
    sql_two_sided_name_match,
)

def _surname_match_token(name: Optional[str]) -> str:
    """Last-name token for legacy singles matching; empty for doubles pair labels."""
    value = (name or "").strip()
    if not value or is_team_display_name(value):
        return ""
    return value.split()[-1]


def _bracket_row_match_priority(row: sqlite3.Row, player_name: str) -> int:
    """Rank player matches: full-name exact wins over surname-only fallback."""
    if is_team_display_name(player_name):
        if same_competitor_label(player_name, row["bracket_player_name"]):
            return 2
        return 0

    normalized = _normalize_player_name(player_name)
    if not normalized:
        return 0

    first_name = (row["player_first_name"] or "").strip()
    last_name = (row["player_last_name"] or "").strip()
    exact_candidates = {
        _normalize_player_name(row["bracket_player_name"]),
        _normalize_player_name(row["player_full_name"]),
        _normalize_player_name(f"{first_name} {last_name}"),
        _normalize_player_name(last_name),
    }
    exact_candidates.discard("")
    if normalized in exact_candidates:
        return 2

    surname = _player_surname(player_name)
    surname_candidates = {
        _player_surname(row["bracket_player_name"]),
        _player_surname(row["player_full_name"]),
        _player_surname(last_name),
    }
    surname_candidates.discard("")
    if surname and surname in surname_candidates:
        return 1
    return 0

def _find_bracket_groups_for_player(cursor: sqlite3.Cursor, tournament_id: int, player_name: str) -> tuple[set[int], int]:
    """Find candidate bracket groups for a player using exact names first, surname fallback second."""
    cursor.execute(
        """
        SELECT DISTINCT bgp.group_id, bg.name,
               bgp.player_name AS bracket_player_name,
               p.name AS player_full_name,
               p.first_name AS player_first_name,
               p.last_name AS player_last_name
        FROM bracket_group_players bgp
        JOIN bracket_groups bg ON bg.id = bgp.group_id
        LEFT JOIN players p ON p.id = bgp.player_id
        WHERE bg.tournament_id = ?
        """,
        (tournament_id,),
    )

    best_priority = 0
    matched_group_ids: set[int] = set()
    for row in cursor.fetchall():
        priority = _bracket_row_match_priority(row, player_name)
        if priority <= 0:
            continue
        if priority > best_priority:
            best_priority = priority
            matched_group_ids = {int(row["group_id"])}
        elif priority == best_priority:
            matched_group_ids.add(int(row["group_id"]))

    return matched_group_ids, best_priority

def detect_bracket_context(player1_name: str, player2_name: str, tournament_id: int) -> Dict[str, Any]:
    """Detect bracket group/phase for a match based on player names.
    
    Returns dict with:
      - group_id: int or None
      - phase: 'Grupowa' | 'Pucharowa' | None
      - warning: str code or None ('different_groups' | 'no_bracket')
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            p1 = (player1_name or "").strip()
            p2 = (player2_name or "").strip()
            p1_surname = _surname_match_token(p1)
            p2_surname = _surname_match_token(p2)

            def _find_explicit_phase(table_name: str) -> Optional[str]:
                pair_clause, pair_params = sql_two_sided_name_match(p1, p2)
                cursor.execute(
                    f"""
                    SELECT phase
                    FROM {table_name}
                    WHERE tournament_id = ?
                      AND phase IS NOT NULL
                      AND TRIM(phase) != ''
                      AND phase != 'Grupowa'
                      AND {pair_clause}
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (tournament_id, *pair_params),
                )
                row = cursor.fetchone()
                if row:
                    return row["phase"]
                if not p1_surname or not p2_surname:
                    return None
                cursor.execute(
                    f"""
                    SELECT phase
                    FROM {table_name}
                    WHERE tournament_id = ?
                      AND phase IS NOT NULL
                      AND TRIM(phase) != ''
                      AND phase != 'Grupowa'
                      AND ((player1_name LIKE ? AND player2_name LIKE ?)
                        OR (player1_name LIKE ? AND player2_name LIKE ?))
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (
                        tournament_id,
                        f"%{p1_surname}",
                        f"%{p2_surname}",
                        f"%{p2_surname}",
                        f"%{p1_surname}",
                    ),
                )
                row = cursor.fetchone()
                return row["phase"] if row else None

            scheduled_phase = _find_explicit_phase("tournament_schedule")
            if scheduled_phase:
                return {"group_id": None, "phase": scheduled_phase, "warning": None}

            # Prefer explicit knockout slots over shared group membership so
            # same-group finals are not misclassified as group matches.
            knockout_phase = _find_explicit_phase("bracket_knockout")
            if knockout_phase:
                return {"group_id": None, "phase": knockout_phase, "warning": None}

            p1_gids, p1_priority = _find_bracket_groups_for_player(cursor, tournament_id, player1_name)
            p2_gids, p2_priority = _find_bracket_groups_for_player(cursor, tournament_id, player2_name)

            if not p1_gids or not p2_gids:
                return {"group_id": None, "phase": None, "warning": "no_bracket"}

            common = p1_gids & p2_gids

            if common:
                gid = min(common)
                return {"group_id": gid, "phase": "Grupowa", "warning": None}

            surname_only_ambiguous = (p1_priority == 1 and len(p1_gids) > 1) or (p2_priority == 1 and len(p2_gids) > 1)
            if surname_only_ambiguous:
                return {"group_id": None, "phase": None, "warning": "no_bracket"}

            return {"group_id": None, "phase": "Pucharowa", "warning": "different_groups"}

    except Exception as e:
        logger.error("detect_bracket_context_error", error=str(e))
        return {"group_id": None, "phase": None, "warning": None}

def _split_bracket_label(value: Optional[str]) -> tuple[str, str]:
    """Split a bracket label into category prefix and suffix.

    Uses the last em-dash so nested labels like
    ``B1 Men — Grupa A — Finał`` keep the group name in the prefix.
    """
    label = (value or "").strip()
    if not label:
        return "", ""
    if " — " not in label:
        return "", label
    prefix, suffix = label.rsplit(" — ", 1)
    return prefix.strip(), suffix.strip()

GROUP_PHASE = "Grupowa"

GROUP_REMATCH_PHASE = "Grupowa — Rewanż"

_GROUP_REMATCH_PHASE_MARKERS = (
    "rewanż",
    "rematch",
    "rückspiel",
    "revanch",
    "ritorno",
    "revancha",
    "replay",
    "dogryw",
)

def normalize_group_stage_phase(phase: Optional[str]) -> str:
    """Map localized schedule/result labels to canonical group-stage phases."""
    value = (phase or "").strip()
    if not value:
        return GROUP_PHASE
    if value in {GROUP_PHASE, GROUP_REMATCH_PHASE}:
        return value
    lowered = value.casefold()
    if lowered == GROUP_REMATCH_PHASE.casefold():
        return GROUP_REMATCH_PHASE
    if any(marker in lowered for marker in _GROUP_REMATCH_PHASE_MARKERS):
        return GROUP_REMATCH_PHASE
    return GROUP_PHASE

def is_group_stage_phase(phase: Optional[str]) -> bool:
    """Return True for regular or rematch group-stage phases."""
    value = (phase or "").strip()
    if value in {GROUP_PHASE, GROUP_REMATCH_PHASE}:
        return True
    lowered = value.casefold()
    if lowered in {GROUP_PHASE.casefold(), GROUP_REMATCH_PHASE.casefold()}:
        return True
    if lowered in {"gruppenphase", "group", "girone", "grupos", "poule"}:
        return True
    return any(marker in lowered for marker in _GROUP_REMATCH_PHASE_MARKERS)

def is_knockout_stage_phase(phase: Optional[str]) -> bool:
    """Return True for knockout-style phases (final, semifinal, bronze, etc.)."""
    value = (phase or "").strip()
    if not value or is_group_stage_phase(value):
        return False
    return True

def expected_group_matches_count(tournament_id: int, group_id: int, player_count: int) -> int:
    with db_conn() as conn:
        return _expected_group_matches_count(conn.cursor(), tournament_id, group_id, player_count)

def count_finished_group_matches(tournament_id: int, group_id: int) -> int:
    with db_conn() as conn:
        return _count_finished_group_matches(conn.cursor(), tournament_id, group_id)

def count_group_knockout_progress(tournament_id: int, group_name: str) -> tuple[int, int]:
    """Return (expected, finished) knockout slots belonging to one group label."""
    label = str(group_name or "").strip()
    if not label:
        return 0, 0
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT phase, winner_name FROM bracket_knockout WHERE tournament_id = ?",
            (tournament_id,),
        )
        expected = 0
        finished = 0
        prefix = f"{label} — "
        for row in cursor.fetchall():
            phase = str(row["phase"] or "")
            if phase != label and not phase.startswith(prefix):
                continue
            expected += 1
            if row["winner_name"]:
                finished += 1
        return expected, finished

def _phase_kind(phase: Optional[str]) -> Optional[str]:
    """Map localized phase labels to a stable semantic kind."""
    _, suffix = _split_bracket_label(phase)
    normalized = (suffix or phase or "").strip().lower()
    if not normalized:
        return None
    if "ćwierć" in normalized or "cwierc" in normalized or "quarter" in normalized:
        return "quarterfinal"
    if "półfina" in normalized or "semif" in normalized:
        return "semifinal"
    if "3." in normalized or "3 " in normalized or "third" in normalized or "3rd" in normalized:
        return "third_place"
    if "5." in normalized or "5 " in normalized or "fifth" in normalized or "5th" in normalized:
        return "fifth_place"
    if "7." in normalized or "7 " in normalized or "seventh" in normalized or "7th" in normalized:
        return "seventh_place"
    if normalized == "pucharowa":
        return "knockout"
    if "fina" in normalized or normalized == "final":
        return "final"
    return None

def _group_sort_key(name: str) -> tuple[int, str]:
    """Sort groups so A/B stay in a stable order inside a category."""
    _, suffix = _split_bracket_label(name)
    label = (suffix or name or "").strip()
    last_token = label.split()[-1].upper() if label else ""
    if len(last_token) == 1 and last_token.isalpha():
        return (0, last_token)
    return (1, label.lower())

def _is_group_partition_name(name: str) -> bool:
    """Return True when a group label is one partition of a wider A/B category."""
    prefix, suffix = _split_bracket_label(name)
    if not prefix or not suffix:
        return False
    label = suffix.strip()
    if not label:
        return False
    last_token = label.split()[-1].upper()
    return label.casefold().startswith("grupa ") or (len(last_token) == 1 and last_token.isalpha())

def _knockout_bucket_key(group_name: str) -> tuple[str, str]:
    """Group standings into either one single-group final or a shared A/B bracket."""
    name = (group_name or "").strip()
    prefix, _ = _split_bracket_label(name)
    if _is_group_partition_name(name):
        return ("multi", prefix)
    return ("single", name)

def _group_play_format(group: Optional[Dict[str, Any]]) -> str:
    return normalize_play_format((group or {}).get("play_format"))


def _group_competitor_names(group: Dict[str, Any]) -> List[str]:
    names: List[str] = []
    for item in group.get("players") or []:
        if isinstance(item, dict):
            label = str(item.get("name") or item.get("player_name") or "").strip()
        else:
            label = str(item or "").strip()
        if label and label not in names:
            names.append(label)
    if names:
        return names
    for standing in group.get("standings") or []:
        label = str((standing or {}).get("name") or "").strip()
        if label and label not in names:
            names.append(label)
    return names


def _knockout_phase_label(prefix: str, kind: str) -> str:
    suffixes = {
        "quarterfinal": "Ćwierćfinał",
        "semifinal": "Półfinał",
        "final": "Finał",
        "third_place": "o 3. miejsce",
    }
    suffix = suffixes[kind]
    prefix = (prefix or "").strip()
    return f"{prefix} — {suffix}" if prefix else suffix


def _knockout_slot(
    prefix: str,
    kind: str,
    position: int,
    player1_name: Optional[str],
    player2_name: Optional[str],
) -> Dict[str, Any]:
    return {
        "phase": _knockout_phase_label(prefix, kind),
        "position": position,
        "player1_name": player1_name,
        "player2_name": player2_name,
    }


def _iter_knockout_units(bracket_groups: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Split groups into independent knockout generation units based on play_format."""
    buckets: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for group in bracket_groups:
        name = str(group.get("name") or "").strip()
        if not name:
            continue
        buckets.setdefault(_knockout_bucket_key(name), []).append(group)

    units: List[Dict[str, Any]] = []
    for (bucket_kind, bucket_name), bucket_groups in buckets.items():
        ordered = sorted(bucket_groups, key=lambda group: _group_sort_key(str(group.get("name") or "")))
        groups_knockout = [group for group in ordered if _group_play_format(group) == PLAY_FORMAT_GROUPS_KNOCKOUT]
        knockout_only = [group for group in ordered if _group_play_format(group) == PLAY_FORMAT_KNOCKOUT]
        if (
            bucket_kind == "multi"
            and len(ordered) == 2
            and len(groups_knockout) == 2
        ):
            units.append({"type": "cross", "label": bucket_name, "groups": groups_knockout})
        else:
            for group in groups_knockout:
                units.append({"type": "single_table", "label": str(group.get("name") or bucket_name), "groups": [group]})
        for group in knockout_only:
            units.append({"type": "direct_pool", "label": str(group.get("name") or bucket_name), "groups": [group]})
    return units


def _build_direct_knockout_slots(label: str, names: List[str]) -> List[Dict[str, Any]]:
    """Build a 2/4/8 knockout tree from a group's member list (list order = seeding)."""
    seeds = [str(name).strip() for name in names if str(name or "").strip()]
    count = len(seeds)
    if count < 2 or count > 8:
        return []
    if count == 2:
        return [_knockout_slot(label, "final", 1, seeds[0], seeds[1])]

    if count <= 4:
        padded = seeds + [None] * (4 - count)
        slots: List[Dict[str, Any]] = []
        final_players: List[Optional[str]] = [None, None]
        for position, (left, right) in enumerate(((padded[0], padded[3]), (padded[1], padded[2])), start=1):
            if left and right:
                slots.append(_knockout_slot(label, "semifinal", position, left, right))
            else:
                final_players[position - 1] = left or right
        slots.append(_knockout_slot(label, "final", 1, final_players[0], final_players[1]))
        if count == 4:
            slots.append(_knockout_slot(label, "third_place", 1, None, None))
        return slots

    padded = seeds + [None] * (8 - count)
    qf_pairs = (
        (padded[0], padded[7], 1),
        (padded[3], padded[4], 2),
        (padded[1], padded[6], 3),
        (padded[2], padded[5], 4),
    )
    slots = []
    sf_players: List[Optional[str]] = [None, None, None, None]
    for left, right, position in qf_pairs:
        if left and right:
            slots.append(_knockout_slot(label, "quarterfinal", position, left, right))
        else:
            sf_players[position - 1] = left or right
    slots.append(_knockout_slot(label, "semifinal", 1, sf_players[0], sf_players[1]))
    slots.append(_knockout_slot(label, "semifinal", 2, sf_players[2], sf_players[3]))
    slots.append(_knockout_slot(label, "final", 1, None, None))
    if count >= 4:
        slots.append(_knockout_slot(label, "third_place", 1, None, None))
    return slots


def _slots_for_knockout_unit(
    unit: Dict[str, Any],
    *,
    complete: bool,
    player_count_by_name: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    counts = player_count_by_name or {}
    unit_type = unit.get("type")
    label = str(unit.get("label") or "")
    groups = unit.get("groups") or []
    if unit_type == "cross":
        if len(groups) < 2:
            return []
        first = groups[0].get("standings") or []
        second = groups[1].get("standings") or []
        if complete:
            if len(first) < 2 or len(second) < 2:
                return []
            return _build_knockout_slots_for_category(label, groups)
        if len(first) < 2 or len(second) < 2:
            return []
        return _build_provisional_knockout_slots_for_category(label, groups)

    if unit_type == "direct_pool":
        return _build_direct_knockout_slots(label, _group_competitor_names(groups[0] if groups else {}))

    if unit_type != "single_table" or not groups:
        return []
    group = groups[0]
    standings = group.get("standings") or []
    group_name = str(group.get("name") or label)
    player_count = counts.get(group_name) or len(standings) or len(_group_competitor_names(group))
    if player_count >= 4 or len(standings) >= 4:
        top_four = standings[:4] if len(standings) >= 4 else standings
        if complete and len(top_four) >= 4:
            return _build_four_player_group_knockout_slots(label, top_four)
        return _build_provisional_four_player_group_knockout_slots(group_name, label)
    if player_count == 3 or len(standings) == 3:
        if complete:
            return _build_single_group_final_slots(label, standings)
        return _build_provisional_single_group_final_slots(group_name, label)
    return []


def _unit_group_play_complete(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    unit: Dict[str, Any],
    group_id_by_name: Dict[str, int],
    player_count_by_name: Dict[str, int],
) -> bool:
    if unit.get("type") == "direct_pool":
        return len(_group_competitor_names((unit.get("groups") or [{}])[0])) >= 2
    return _bucket_groups_play_complete(
        cursor,
        tournament_id,
        unit.get("groups") or [],
        group_id_by_name,
        player_count_by_name,
    )

def _is_knockout_placeholder_name(name: Optional[str]) -> bool:
    """Detect generated placeholder labels that should be replaced by real players."""
    value = (name or "").strip()
    if not value:
        return True
    lowered = value.lower()
    if lowered.startswith("zwycięzca pf") or lowered.startswith("przegrany pf"):
        return True
    if lowered.startswith("winner sf") or lowered.startswith("loser sf"):
        return True
    if re.match(r"^\d+[A-Za-z]$", value):
        return True
    if re.match(r"^\d+\.\s+", value):
        return True
    return False

def _standing_placeholder(rank: int, group_name: str, category_prefix: str) -> str:
    """Stable standing placeholder, e.g. 1. B2 Mężczyźni or 1. B3 Men — Grupa A."""
    if _is_group_partition_name(group_name):
        prefix, suffix = _split_bracket_label(group_name)
        category = (category_prefix or prefix or "").strip()
        label = (suffix or "").strip()
        last_token = label.split()[-1].upper() if label else ""
        if category and len(last_token) == 1 and last_token.isalpha():
            return f"{rank}. {category} — Grupa {last_token}"
        full_name = (group_name or "").strip()
        if full_name:
            return f"{rank}. {full_name}"
    prefix = (category_prefix or group_name or "").strip()
    return f"{rank}. {prefix}"

def _is_group_play_complete(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
    player_count: int,
) -> bool:
    if player_count < 2:
        return True
    expected = _expected_group_matches_count(cursor, tournament_id, group_id, player_count)
    return _count_finished_group_matches(cursor, tournament_id, group_id) >= expected

def _bucket_groups_play_complete(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    ordered_groups: List[Dict[str, Any]],
    group_id_by_name: Dict[str, int],
    player_count_by_name: Dict[str, int],
) -> bool:
    for group in ordered_groups:
        name = str(group.get("name") or "").strip()
        group_id = group_id_by_name.get(name)
        if not group_id:
            return False
        player_count = player_count_by_name.get(name) or len(group.get("standings") or [])
        if not _is_group_play_complete(cursor, tournament_id, group_id, player_count):
            return False
    return True

def _slot_phase_matches(slot_phase: str, expected_kind: str, category_prefix: str) -> bool:
    """Check whether a stored phase belongs to the requested category/kind."""
    slot_prefix, _ = _split_bracket_label(slot_phase)
    return slot_prefix == category_prefix and _phase_kind(slot_phase) == expected_kind

def _expected_group_matches_count(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
    player_count: int,
) -> int:
    """Count scheduled group-stage matches for one bracket group."""
    cursor.execute("SELECT play_format FROM bracket_groups WHERE id = ?", (group_id,))
    row = cursor.fetchone()
    if row and normalize_play_format(row["play_format"] if "play_format" in row.keys() else None) == PLAY_FORMAT_KNOCKOUT:
        return 0
    if player_count < 2:
        return 0
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM tournament_schedule
        WHERE tournament_id = ?
          AND bracket_group_id = ?
          AND phase IN (?, ?)
        """,
        (tournament_id, group_id, GROUP_PHASE, GROUP_REMATCH_PHASE),
    )
    scheduled = int(cursor.fetchone()["count"] or 0)
    expected_rr = player_count * (player_count - 1) // 2
    if scheduled > expected_rr > 0:
        return expected_rr
    if scheduled > 0:
        return scheduled
    return expected_rr

def _group_competitor_keys(cursor: sqlite3.Cursor, group_id: int) -> set[str]:
    cursor.execute(
        "SELECT player_name FROM bracket_group_players WHERE group_id = ?",
        (group_id,),
    )
    keys: set[str] = set()
    for row in cursor.fetchall():
        key = competitor_identity_key(row["player_name"])
        if key:
            keys.add(key)
    return keys


def _both_competitors_in_group(player1_name: Any, player2_name: Any, group_keys: set[str]) -> bool:
    left = competitor_identity_key(player1_name)
    right = competitor_identity_key(player2_name)
    return bool(left and right and left in group_keys and right in group_keys)


def _count_finished_group_matches(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
) -> int:
    """Count finished group-stage results for a group, including inferred and legacy history."""
    group_keys = _group_competitor_keys(cursor, group_id)
    counted_match_ids: set[int] = set()
    cursor.execute(
        """
        SELECT id, player1_name, player2_name, bracket_group_id
        FROM matches
        WHERE tournament_id = ?
          AND status = 'finished'
          AND COALESCE(finish_reason, 'normal') != 'test'
          AND phase IN (?, ?)
        """,
        (tournament_id, GROUP_PHASE, GROUP_REMATCH_PHASE),
    )
    for row in cursor.fetchall():
        bracket_group_id = row["bracket_group_id"]
        linked = bracket_group_id not in (None, "", 0) and int(bracket_group_id) == int(group_id)
        inferred = bracket_group_id in (None, "", 0) and _both_competitors_in_group(
            row["player1_name"], row["player2_name"], group_keys
        )
        if linked or inferred:
            counted_match_ids.add(int(row["id"]))

    cursor.execute(
        """
        SELECT match_id, player_a, player_b, phase
        FROM match_history
        WHERE tournament_id = ?
          AND COALESCE(finish_reason, 'normal') != 'test'
        """,
        (tournament_id,),
    )
    history_extra = 0
    for row in cursor.fetchall():
        if not is_group_stage_phase(row["phase"]):
            continue
        match_id = row["match_id"]
        if match_id not in (None, "", 0) and int(match_id) in counted_match_ids:
            continue
        if _both_competitors_in_group(row["player_a"], row["player_b"], group_keys):
            history_extra += 1
    return len(counted_match_ids) + history_extra

def _assign_knockout_slot_player(cursor, slot: sqlite3.Row, side: int, player_name: str) -> None:
    """Write a player into the requested side if the slot is empty or placeholder-only."""
    column = "player1_name" if side == 1 else "player2_name"
    current_value = slot[column]
    if current_value and not _is_knockout_placeholder_name(current_value):
        return
    cursor.execute(f"UPDATE bracket_knockout SET {column} = ? WHERE id = ?", (player_name, slot["id"]))

def _knockout_schedule_player_names(slot: sqlite3.Row) -> tuple[str, str]:
    """Return schedule-facing player names, using stable placeholders for pending finals."""
    player1_name = (slot["player1_name"] or "").strip()
    player2_name = (slot["player2_name"] or "").strip()
    phase_kind = _phase_kind(str(slot["phase"] or ""))

    if phase_kind == "final":
        return (
            player1_name or "Zwycięzca PF 1",
            player2_name or "Zwycięzca PF 2",
        )
    if phase_kind == "third_place":
        return (
            player1_name or "Przegrany PF 1",
            player2_name or "Przegrany PF 2",
        )
    return (player1_name, player2_name)

def _build_knockout_slots_for_category(category_prefix: str, ordered_groups: List[Dict]) -> List[Dict]:
    """Generate semifinal/final/placement slots for one category."""
    group_a = ordered_groups[0]["standings"]
    group_b = ordered_groups[1]["standings"]

    semifinal_phase = f"{category_prefix} — Półfinał" if category_prefix else "Półfinał"
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    fifth_phase = f"{category_prefix} — o 5. miejsce" if category_prefix else "o 5. miejsce"
    seventh_phase = f"{category_prefix} — o 7. miejsce" if category_prefix else "o 7. miejsce"

    slots = [
        {
            "phase": semifinal_phase,
            "position": 1,
            "player1_name": group_a[0]["name"],
            "player2_name": group_b[1]["name"],
        },
        {
            "phase": semifinal_phase,
            "position": 2,
            "player1_name": group_b[0]["name"],
            "player2_name": group_a[1]["name"],
        },
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
    ]

    if len(group_a) >= 3 and len(group_b) >= 3:
        slots.append(
            {
                "phase": fifth_phase,
                "position": 1,
                "player1_name": group_a[2]["name"],
                "player2_name": group_b[2]["name"],
            }
        )
    if len(group_a) >= 4 and len(group_b) >= 4:
        slots.append(
            {
                "phase": seventh_phase,
                "position": 1,
                "player1_name": group_a[3]["name"],
                "player2_name": group_b[3]["name"],
            }
        )
    return slots

def _build_single_group_final_slots(group_name: str, standings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate a direct final for one completed 3-player group."""
    if len(standings) < 2:
        return []
    final_phase = f"{group_name} — Finał" if group_name else "Finał"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": standings[0]["name"],
            "player2_name": standings[1]["name"],
        }
    ]

def _build_provisional_single_group_final_slots(group_name: str, category_prefix: str) -> List[Dict[str, Any]]:
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_name, category_prefix),
        }
    ]

def _build_provisional_four_player_group_knockout_slots(
    group_name: str,
    category_prefix: str,
) -> List[Dict[str, Any]]:
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_name, category_prefix),
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": _standing_placeholder(3, group_name, category_prefix),
            "player2_name": _standing_placeholder(4, group_name, category_prefix),
        },
    ]

def _build_provisional_knockout_slots_for_category(
    category_prefix: str,
    ordered_groups: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    group_a = ordered_groups[0]
    group_b = ordered_groups[1]
    group_a_name = str(group_a.get("name") or category_prefix)
    group_b_name = str(group_b.get("name") or category_prefix)
    player_count_a = len(group_a.get("standings") or [])
    player_count_b = len(group_b.get("standings") or [])

    semifinal_phase = f"{category_prefix} — Półfinał" if category_prefix else "Półfinał"
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    fifth_phase = f"{category_prefix} — o 5. miejsce" if category_prefix else "o 5. miejsce"
    seventh_phase = f"{category_prefix} — o 7. miejsce" if category_prefix else "o 7. miejsce"

    slots = [
        {
            "phase": semifinal_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_a_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_b_name, category_prefix),
        },
        {
            "phase": semifinal_phase,
            "position": 2,
            "player1_name": _standing_placeholder(1, group_b_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_a_name, category_prefix),
        },
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
    ]

    if player_count_a >= 3 and player_count_b >= 3:
        slots.append(
            {
                "phase": fifth_phase,
                "position": 1,
                "player1_name": _standing_placeholder(3, group_a_name, category_prefix),
                "player2_name": _standing_placeholder(3, group_b_name, category_prefix),
            }
        )
    if player_count_a >= 4 and player_count_b >= 4:
        slots.append(
            {
                "phase": seventh_phase,
                "position": 1,
                "player1_name": _standing_placeholder(4, group_a_name, category_prefix),
                "player2_name": _standing_placeholder(4, group_b_name, category_prefix),
            }
        )
    return slots

def _compute_provisional_knockout_slots_from_bracket(
    bracket_groups: List[Dict[str, Any]],
    *,
    tournament_id: int,
    group_id_by_name: Dict[str, int],
    player_count_by_name: Dict[str, int],
) -> Dict[str, Any]:
    """Build knockout slots with standing placeholders until group play is finished."""
    slots: List[Dict[str, Any]] = []
    units = _iter_knockout_units(bracket_groups)
    completeness: Dict[int, bool] = {}
    if tournament_id:
        with db_conn() as conn:
            cursor = conn.cursor()
            for index, unit in enumerate(units):
                completeness[index] = _unit_group_play_complete(
                    cursor,
                    tournament_id,
                    unit,
                    group_id_by_name,
                    player_count_by_name,
                )
    for index, unit in enumerate(units):
        if unit.get("type") == "cross":
            ordered_groups = unit.get("groups") or []
            if len(ordered_groups) != 2:
                continue
            first_group = ordered_groups[0].get("standings") or []
            second_group = ordered_groups[1].get("standings") or []
            if len(first_group) < 2 or len(second_group) < 2:
                continue
        slots.extend(_slots_for_knockout_unit(
            unit,
            complete=completeness.get(index, False),
            player_count_by_name=player_count_by_name,
        ))

    if not slots:
        return {"error": "Need at least one eligible category for knockout generation"}
    return {"status": "ok", "knockout": slots}

def seed_knockout_rematch_for_groups(
    tournament_id: int,
    bracket_group_ids: List[int],
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Backward-compatible alias for group-stage rematch generation."""
    return ensure_group_rematch_schedule_entries(
        tournament_id,
        bracket_group_ids,
        schedule_day=schedule_day,
    )

def _build_four_player_group_knockout_slots(group_name: str, standings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate a direct final and 3rd-place match for one 4-player group.

    Semifinals are only used when a category has two groups (A/B); a single group of
    four plays 1st vs 2nd for the title and 3rd vs 4th for bronze.
    """
    if len(standings) < 4:
        return _build_single_group_final_slots(group_name, standings)
    final_phase = f"{group_name} — Finał" if group_name else "Finał"
    third_phase = f"{group_name} — o 3. miejsce" if group_name else "o 3. miejsce"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": standings[0]["name"],
            "player2_name": standings[1]["name"],
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": standings[2]["name"],
            "player2_name": standings[3]["name"],
        },
    ]

def _compute_knockout_slots_from_bracket(bracket_groups: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build the expected knockout slots for every eligible category in one tournament."""
    slots: List[Dict[str, Any]] = []
    player_count_by_name = {
        str(group.get("name") or ""): len(group.get("standings") or []) or len(_group_competitor_names(group))
        for group in bracket_groups
    }
    for unit in _iter_knockout_units(bracket_groups):
        if unit.get("type") == "cross":
            ordered_groups = unit.get("groups") or []
            if len(ordered_groups) != 2:
                continue
            first_group = ordered_groups[0].get("standings") or []
            second_group = ordered_groups[1].get("standings") or []
            if len(first_group) < 2 or len(second_group) < 2:
                return {"error": f"Category needs at least 2 players per group: {unit.get('label')}"}
        slots.extend(_slots_for_knockout_unit(
            unit,
            complete=True,
            player_count_by_name=player_count_by_name,
        ))

    if not slots:
        return {"error": "Need at least one eligible category for knockout generation"}
    return {"status": "ok", "knockout": slots}

def seed_provisional_knockout_from_groups(
    tournament_id: int,
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Build or refresh knockout slots with standing placeholders until group play ends."""
    db_groups = fetch_bracket_groups(tournament_id)
    if not db_groups:
        return {"status": "skipped", "reason": "no_groups"}

    group_id_by_name = {str(group.get("name") or ""): int(group["id"]) for group in db_groups if group.get("id")}
    player_count_by_name = {
        str(group.get("name") or ""): len(group.get("players") or [])
        for group in db_groups
    }

    bracket = get_full_bracket(tournament_id)
    if bracket.get("error"):
        return {"status": "error", "error": bracket["error"]}

    generated = _compute_provisional_knockout_slots_from_bracket(
        _annotate_groups_with_stored_format(bracket.get("groups", []), db_groups),
        tournament_id=tournament_id,
        group_id_by_name=group_id_by_name,
        player_count_by_name=player_count_by_name,
    )
    if generated.get("error"):
        return {"status": "error", **generated}

    slots = generated.get("knockout", [])
    if not slots:
        return {"status": "skipped", "reason": "no_eligible_categories"}

    return _merge_bracket_knockout_slots(
        tournament_id,
        slots,
        schedule_day=schedule_day,
        replace_unfinished_players=True,
    )

def _merge_bracket_knockout_slots(
    tournament_id: int,
    slots: List[Dict[str, Any]],
    *,
    schedule_day: Optional[str] = None,
    replace_unfinished_players: bool = False,
) -> Dict[str, Any]:
    """Insert missing knockout slots and fill placeholder players without overwriting real results."""
    inserted = 0
    updated = 0
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for slot in slots:
                phase = str(slot.get("phase") or "").strip()
                position = int(slot.get("position") or 1)
                if not phase:
                    continue

                cursor.execute(
                    """
                    SELECT id, player1_name, player2_name, winner_name, score_summary
                    FROM bracket_knockout
                    WHERE tournament_id = ? AND phase = ? AND position = ?
                    LIMIT 1
                    """,
                    (tournament_id, phase, position),
                )
                existing = cursor.fetchone()
                if not existing:
                    cursor.execute(
                        """
                        INSERT INTO bracket_knockout (
                            tournament_id, phase, position, player1_name, player2_name, winner_name, score_summary
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            tournament_id,
                            phase,
                            position,
                            slot.get("player1_name"),
                            slot.get("player2_name"),
                            slot.get("winner_name"),
                            slot.get("score_summary"),
                        ),
                    )
                    inserted += 1
                    continue

                assignments: List[str] = []
                values: List[Any] = []
                for field in ("player1_name", "player2_name"):
                    new_value = slot.get(field)
                    current_value = existing[field]
                    can_replace = (
                        replace_unfinished_players
                        and not existing["winner_name"]
                        and new_value is not None
                    )
                    if new_value and (
                        can_replace
                        or not current_value
                        or _is_knockout_placeholder_name(current_value)
                    ):
                        assignments.append(f"{field} = ?")
                        values.append(new_value)
                if slot.get("winner_name") and not existing["winner_name"]:
                    assignments.append("winner_name = ?")
                    values.append(slot.get("winner_name"))
                if slot.get("score_summary") and not existing["score_summary"]:
                    assignments.append("score_summary = ?")
                    values.append(slot.get("score_summary"))
                if assignments:
                    cursor.execute(
                        f"UPDATE bracket_knockout SET {', '.join(assignments)} WHERE id = ?",
                        (*values, existing["id"]),
                    )
                    updated += 1
            conn.commit()
        ensure_knockout_schedule_entries(tournament_id, schedule_day=schedule_day)
        return {"status": "ok", "inserted": inserted, "updated": updated, "knockout": slots}
    except Exception as e:
        logger.error("merge_bracket_knockout_error", error=str(e), tournament_id=tournament_id)
        return {"error": str(e)}

def _annotate_groups_with_stored_format(
    bracket_groups: List[Dict[str, Any]],
    stored_groups: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    by_name = {str(group.get("name") or ""): group for group in stored_groups}
    annotated: List[Dict[str, Any]] = []
    for group in bracket_groups:
        stored = by_name.get(str(group.get("name") or "")) or {}
        merged = dict(group)
        merged["play_format"] = stored.get("play_format") or group.get("play_format")
        if stored.get("id") is not None:
            merged["id"] = stored["id"]
        if stored.get("players") and not merged.get("players"):
            merged["players"] = stored["players"]
        annotated.append(merged)
    return annotated


def maybe_generate_knockout_from_completed_groups(tournament_id: int) -> Dict[str, Any]:
    """Generate knockout for every ready group/pair; do not wait for the whole tournament."""
    groups = fetch_bracket_groups(tournament_id)
    if not groups:
        return {"status": "skipped", "reason": "no_groups"}

    bracket = get_full_bracket(tournament_id)
    if bracket.get("error"):
        return {"status": "error", "error": bracket["error"]}
    groups_data = _annotate_groups_with_stored_format(bracket.get("groups") or [], groups)
    group_id_by_name = {str(group.get("name") or ""): int(group["id"]) for group in groups if group.get("id")}
    player_count_by_name = {
        str(group.get("name") or ""): len(group.get("players") or [])
        for group in groups
    }

    ready_slots: List[Dict[str, Any]] = []
    pending_units = 0
    eligible_units = 0
    with db_conn() as conn:
        cursor = conn.cursor()
        for unit in _iter_knockout_units(groups_data):
            eligible_units += 1
            if not _unit_group_play_complete(
                cursor,
                tournament_id,
                unit,
                group_id_by_name,
                player_count_by_name,
            ):
                pending_units += 1
                continue
            ready_slots.extend(_slots_for_knockout_unit(
                unit,
                complete=True,
                player_count_by_name=player_count_by_name,
            ))

    if not eligible_units:
        return {"status": "skipped", "reason": "no_eligible_categories"}
    if not ready_slots:
        return {
            "status": "pending",
            "reason": "group_stage_incomplete",
            "pending_units": pending_units,
        }

    merged = _merge_bracket_knockout_slots(tournament_id, ready_slots)
    if merged.get("error"):
        return merged
    if not merged.get("inserted") and not merged.get("updated"):
        if pending_units:
            return {
                "status": "pending",
                "reason": "group_stage_incomplete",
                "pending_units": pending_units,
            }
        return {"status": "skipped", "reason": "knockout_already_configured"}
    return merged

def advance_knockout(match_id: int, tournament_id: int) -> bool:
    """After a knockout match finishes, find the matching slot, persist the result,
    and auto-advance winners to the next round (SF→Final/3rd place)."""
    try:
        from ..db_models import Match as MatchModel
        from ..db_models import db
        match = db.session.get(MatchModel, match_id)
        if not match or match.status != "finished":
            return False

        p1 = match.player1_name
        p2 = match.player2_name
        winner = match.winner_name or (p1 if match.player1_sets > match.player2_sets else p2)

        sets_history = json.loads(match.sets_history) if match.sets_history else []
        score_parts = []
        for s in sets_history:
            g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
            if g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None:
                continue
            score_parts.append(f"{g1}:{g2}")
        score_summary = " ".join(score_parts)

        with db_conn() as conn:
            cursor = conn.cursor()
            # Find the knockout slot matching these two players
            cursor.execute("""
                SELECT id, phase, position FROM bracket_knockout
                WHERE tournament_id = ?
                  AND ((player1_name = ? AND player2_name = ?)
                    OR (player1_name = ? AND player2_name = ?))
                  AND winner_name IS NULL
            """, (tournament_id, p1, p2, p2, p1))
            slot = cursor.fetchone()
            if not slot:
                return False

            # Update the slot with winner and score
            cursor.execute("""
                UPDATE bracket_knockout
                SET winner_name = ?, score_summary = ?, finish_reason = ?, result_note = ?
                WHERE id = ?
            """, (winner, score_summary, match.finish_reason or 'normal', match.result_note, slot["id"]))

            loser = p2 if winner == p1 else p1
            kind = _phase_kind(slot["phase"])
            if kind == "semifinal":
                _advance_to_next_round(cursor, tournament_id, slot["phase"], slot["position"], winner, loser)
            elif kind == "quarterfinal":
                _advance_quarterfinal(cursor, tournament_id, slot["phase"], slot["position"], winner)

            conn.commit()
            ensure_knockout_schedule_entries(tournament_id)
            logger.info("knockout_advanced", match_id=match_id, winner=winner, phase=slot["phase"])
            return True

    except Exception as e:
        logger.error("advance_knockout_error", error=str(e), match_id=match_id)
        return False

def _advance_to_next_round(cursor, tournament_id: int, semifinal_phase: str, sf_position: int, winner: str, loser: str) -> None:
    """Fill in final/3rd-place slots based on semifinal results."""
    category_prefix, _ = _split_bracket_label(semifinal_phase)
    cursor.execute(
        "SELECT id, phase, position, player1_name, player2_name FROM bracket_knockout WHERE tournament_id = ?",
        (tournament_id,),
    )
    slots = cursor.fetchall()
    final_slot = next(
        (slot for slot in slots if _slot_phase_matches(slot["phase"], "final", category_prefix)),
        None,
    )
    third_slot = next(
        (slot for slot in slots if _slot_phase_matches(slot["phase"], "third_place", category_prefix)),
        None,
    )
    target_side = 1 if int(sf_position) == 1 else 2
    if final_slot:
        _assign_knockout_slot_player(cursor, final_slot, target_side, winner)
    if third_slot:
        _assign_knockout_slot_player(cursor, third_slot, target_side, loser)


def _advance_quarterfinal(cursor, tournament_id: int, quarter_phase: str, qf_position: int, winner: str) -> None:
    """Feed a quarterfinal winner into the matching semifinal side."""
    category_prefix, _ = _split_bracket_label(quarter_phase)
    cursor.execute(
        "SELECT id, phase, position, player1_name, player2_name FROM bracket_knockout WHERE tournament_id = ?",
        (tournament_id,),
    )
    slots = cursor.fetchall()
    semis = [
        slot for slot in slots
        if _slot_phase_matches(slot["phase"], "semifinal", category_prefix)
    ]
    semis.sort(key=lambda slot: int(slot["position"] or 0))
    if not semis:
        return
    position = int(qf_position or 1)
    sf_index = 0 if position <= 2 else 1
    side = 1 if position % 2 == 1 else 2
    if sf_index >= len(semis):
        return
    _assign_knockout_slot_player(cursor, semis[sf_index], side, winner)

def _iter_group_competitors(group: Dict) -> List[Dict[str, Optional[int]]]:
    """Normalize group payload into person vs team competitor rows."""
    entries: List[Dict[str, Optional[int]]] = []
    seen: set[tuple] = set()

    def _add(player_id: Optional[int], team_id: Optional[int]) -> None:
        key = (player_id, team_id)
        if key in seen:
            return
        seen.add(key)
        entries.append({"player_id": player_id, "team_id": team_id})

    for item in group.get("players") or []:
        if isinstance(item, dict):
            raw_team = item.get("team_id")
            raw_player = item.get("player_id") if item.get("player_id") is not None else item.get("id")
            if raw_team:
                _add(None, int(raw_team))
            elif raw_player:
                _add(int(raw_player), None)
            continue
        if item:
            _add(int(item), None)
    for item in group.get("teams") or []:
        if isinstance(item, dict):
            raw_team = item.get("team_id") if item.get("team_id") is not None else item.get("id")
            if raw_team:
                _add(None, int(raw_team))
            continue
        if item:
            _add(None, int(item))
    return entries


def save_bracket_groups(tournament_id: int, groups: List[Dict]) -> bool:
    """Replace all bracket groups for a tournament.
    groups: [{"name": "A", "players": [player_id, ...], "teams": [team_id, ...]}, ...]
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Delete existing groups (cascade deletes players)
            cursor.execute(
                "DELETE FROM bracket_group_players WHERE group_id IN "
                "(SELECT id FROM bracket_groups WHERE tournament_id = ?)",
                (tournament_id,)
            )
            cursor.execute("DELETE FROM bracket_groups WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM tournament_schedule WHERE tournament_id = ? AND source_type IN ('group', 'group_rematch')", (tournament_id,))

            # Build player_id -> full name lookup
            cursor.execute(
                "SELECT id, last_name, name FROM players WHERE tournament_id = ?",
                (tournament_id,)
            )
            name_map = {}
            for row in cursor.fetchall():
                full = (row["name"] or "").strip()
                name_map[row["id"]] = full if full else (row["last_name"] or "").strip()

            cursor.execute(
                "SELECT id, display_name FROM tournament_teams WHERE tournament_id = ?",
                (tournament_id,),
            )
            team_map = {int(row["id"]): str(row["display_name"] or "") for row in cursor.fetchall()}

            for idx, g in enumerate(groups):
                category_id = g.get("tournament_category_id")
                play_format = normalize_play_format(g.get("play_format"))
                cursor.execute(
                    """
                    INSERT INTO bracket_groups (
                        tournament_id, name, order_num, tournament_category_id, play_format
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (tournament_id, g["name"], idx, category_id, play_format),
                )
                gid = cursor.lastrowid
                for competitor in _iter_group_competitors(g):
                    team_id = competitor.get("team_id")
                    player_id = competitor.get("player_id")
                    if team_id:
                        pname = team_map.get(int(team_id), "")
                        if not pname:
                            continue
                        cursor.execute(
                            """
                            INSERT INTO bracket_group_players (group_id, player_id, player_name, team_id)
                            VALUES (?, NULL, ?, ?)
                            """,
                            (gid, pname, int(team_id)),
                        )
                        continue
                    if not player_id:
                        continue
                    pname = name_map.get(player_id, "")
                    if pname:
                        cursor.execute(
                            """
                            INSERT INTO bracket_group_players (group_id, player_id, player_name, team_id)
                            VALUES (?, ?, ?, NULL)
                            """,
                            (gid, player_id, pname),
                        )
            conn.commit()
            logger.info("bracket_groups_saved", tournament_id=tournament_id, count=len(groups))
        ensure_group_schedule_entries(tournament_id)
        maybe_generate_knockout_from_completed_groups(tournament_id)
        return True
    except Exception as e:
        logger.error("save_bracket_groups_error", error=str(e))
        return False

def fetch_bracket_groups(tournament_id: int) -> List[Dict]:
    """Get all bracket groups with players for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, name, order_num, tournament_category_id, play_format
                FROM bracket_groups
                WHERE tournament_id = ?
                ORDER BY order_num
                """,
                (tournament_id,),
            )
            groups = []
            for g in cursor.fetchall():
                cursor.execute(
                    "SELECT player_id, player_name, team_id FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],),
                )
                players = [
                    {
                        "player_id": r["player_id"],
                        "name": r["player_name"],
                        "team_id": r["team_id"],
                    }
                    for r in cursor.fetchall()
                ]
                play_format = g["play_format"] if "play_format" in g.keys() else DEFAULT_PLAY_FORMAT
                groups.append({
                    "id": g["id"],
                    "name": g["name"],
                    "tournament_category_id": g["tournament_category_id"],
                    "play_format": normalize_play_format(play_format),
                    "players": players,
                })
            return groups
    except Exception as e:
        logger.error("fetch_bracket_groups_error", error=str(e))
        return []

def _find_group_matches(cursor, player_names: List[str], start_date: str, end_date: str, tournament_id: Optional[int] = None) -> List[Dict]:
    """Find finished matches between a set of players within a date range.
    
    Uses exact name matching plus surname-based fallback to handle mixed storage,
    where some rows use full names and others only surnames. Doubles labels also
    match when partner order inside a pair is reversed.
    """
    if len(player_names) < 2:
        return []
    lookup_names: List[str] = []
    seen_lookup: set[str] = set()
    for name in player_names:
        for variant in competitor_label_variants(name) or [str(name or "").strip()]:
            if not variant or variant in seen_lookup:
                continue
            seen_lookup.add(variant)
            lookup_names.append(variant)
    if len(lookup_names) < 2:
        return []
    placeholders = ",".join("?" for _ in lookup_names)
    end_ts = end_date + "T23:59:59"
    tournament_clause = "AND tournament_id = ?" if tournament_id is not None else ""
    tournament_params = [tournament_id] if tournament_id is not None else []
    phase_clause = "AND phase IN (?, ?)"
    phase_params = (GROUP_PHASE, GROUP_REMATCH_PHASE)
    # When a tournament_id is known, date filtering is wrong for late office corrections:
    # results entered after end_date would vanish from standings. Keep the date window
    # only for legacy rows without a tournament link.
    date_clause = "" if tournament_id is not None else "AND created_at >= ? AND created_at <= ?"
    date_params: list[Any] = [] if tournament_id is not None else [start_date, end_ts]
    # Try exact match first
    cursor.execute(f"""
         SELECT id, player1_name, player2_name, player1_sets, player2_sets,
             sets_history, created_at, winner_name, finish_reason, result_note
        FROM matches
        WHERE status = 'finished'
           AND COALESCE(finish_reason, 'normal') != 'test'
          {tournament_clause}
          {phase_clause}
          AND player1_name IN ({placeholders})
          AND player2_name IN ({placeholders})
          {date_clause}
        ORDER BY created_at
    """, (*tournament_params, *phase_params, *lookup_names, *lookup_names, *date_params))
    exact_results = [dict(row) for row in cursor.fetchall()]
    if any(is_team_display_name(name) for name in player_names):
        exact_results.sort(key=lambda row: row.get("created_at") or "")
        return exact_results

    # Fallback: surname-based matching (bracket stores "Kowalski" but match has "Jan Kowalski")
    # Build a map of surname -> bracket_name for renaming results
    surnames = []
    for name in player_names:
        parts = name.strip().split()
        surname = parts[-1] if parts else name
        surnames.append(surname)

    like_conditions = []
    like_params = []
    for surname in surnames:
        like_conditions.append("player1_name LIKE ?")
        like_params.append(f"%{surname}")
    p1_cond = " OR ".join(like_conditions)

    like_conditions2 = []
    like_params2 = []
    for surname in surnames:
        like_conditions2.append("player2_name LIKE ?")
        like_params2.append(f"%{surname}")
    p2_cond = " OR ".join(like_conditions2)

    cursor.execute(f"""
         SELECT id, player1_name, player2_name, player1_sets, player2_sets,
             sets_history, created_at, winner_name, finish_reason, result_note
        FROM matches
        WHERE status = 'finished'
                  AND COALESCE(finish_reason, 'normal') != 'test'
                    {tournament_clause}
                    {phase_clause}
          AND ({p1_cond})
          AND ({p2_cond})
          {date_clause}
        ORDER BY created_at
        """, (*tournament_params, *phase_params, *like_params, *like_params2, *date_params))
    raw_results = cursor.fetchall()
    if not exact_results and not raw_results:
        return []

    # Build surname -> bracket_name lookup
    surname_to_bracket = {}
    for name in player_names:
        parts = name.strip().split()
        surname = parts[-1].lower() if parts else name.lower()
        surname_to_bracket[surname] = name

    # Remap match player names to bracket names
    seen_pairs = {
        tuple(sorted((row["player1_name"], row["player2_name"])))
        for row in exact_results
        if row.get("player1_name") and row.get("player2_name")
    }
    remapped = []
    for row in raw_results:
        r = dict(row)
        p1_surname = r["player1_name"].strip().split()[-1].lower() if r["player1_name"] else ""
        p2_surname = r["player2_name"].strip().split()[-1].lower() if r["player2_name"] else ""
        bracket_p1 = surname_to_bracket.get(p1_surname)
        bracket_p2 = surname_to_bracket.get(p2_surname)
        if bracket_p1 and bracket_p2 and bracket_p1 != bracket_p2:
            pair_key = tuple(sorted((bracket_p1, bracket_p2)))
            if pair_key in seen_pairs:
                continue
            r["player1_name"] = bracket_p1
            r["player2_name"] = bracket_p2
            remapped.append(r)
            seen_pairs.add(pair_key)

    merged = list(exact_results)
    seen_ids = {int(row["id"]) for row in exact_results if row.get("id") is not None}
    for row in remapped:
        row_id = row.get("id")
        if row_id is not None and int(row_id) in seen_ids:
            continue
        merged.append(row)
        if row_id is not None:
            seen_ids.add(int(row_id))

    merged.sort(key=lambda row: row.get("created_at") or "")
    return merged

def _is_stb(s: dict) -> bool:
    """Detect super tiebreak set (set 3+ with low games and TB points)."""
    if s.get("is_super_tiebreak", False):
        return True
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return (s.get("set_number", 0) >= 3 and max(g1, g2) <= 1
            and s.get("tiebreak_loser_points") is not None)

def _is_empty_set(s: dict) -> bool:
    """Skip junk 0:0 sets (app initialised set 3 but match ended in 2)."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None

def _build_set_detail(s: dict, flipped: bool = False) -> dict:
    """Build per-set scoreboard data. For STB, use actual TB points."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    tb = s.get("tiebreak_loser_points")
    stb = _is_stb(s)
    if stb and tb is not None:
        # STB: convert games 0/1 → actual tiebreak points
        # Winner gets max(10, tb+2), loser gets tb
        winner_pts = max(10, tb + 2)
        if g1 > g2:  # player1 won STB
            g1, g2 = winner_pts, tb
        else:
            g1, g2 = tb, winner_pts
        tb = None  # no separate TB display needed
    if flipped:
        g1, g2 = g2, g1
    return {"g1": g1, "g2": g2, "tb": tb, "stb": stb}


def _winner_from_set_details(sets_detail, p1: str, p2: str, fallback=None):
    """Winner from displayed set games so highlight matches the scoreboard."""
    if not sets_detail:
        return fallback
    wins1 = sum(1 for s in sets_detail if (s.get("g1") or 0) > (s.get("g2") or 0))
    wins2 = sum(1 for s in sets_detail if (s.get("g2") or 0) > (s.get("g1") or 0))
    if wins1 > wins2:
        return p1
    if wins2 > wins1:
        return p2
    return fallback

def _format_set_score(s: dict, flipped: bool = False) -> str:
    """Format a single set score string."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    if flipped:
        g1, g2 = g2, g1
    tb = s.get("tiebreak_loser_points")
    if _is_stb(s):
        return f"STB {g1}:{g2}" if tb is None else f"STB [{g1}:{g2}({tb})]"
    if tb is not None:
        return f"{g1}:{g2}({tb})"
    return f"{g1}:{g2}"

def _compute_standings(player_names: List[str], matches) -> tuple:
    """Compute standings from a list of matches. Returns (standings, match_results)."""
    stats = {name: {"wins": 0, "losses": 0, "sets_won": 0, "sets_lost": 0,
                     "games_won": 0, "games_lost": 0, "played": 0}
             for name in player_names}

    match_results = []
    for m in matches:
        p1, p2 = m["player1_name"], m["player2_name"]
        s1, s2 = m["player1_sets"], m["player2_sets"]
        sh = json.loads(m["sets_history"]) if m["sets_history"] else []
        sh = [s for s in sh if not _is_empty_set(s)]

        if p1 not in stats or p2 not in stats:
            continue

        # Build per-set score arrays first so W/L follow the displayed games.
        sets_detail = [_build_set_detail(s) for s in sh]
        winner = m.get("winner_name") if isinstance(m, dict) else None
        winner = _winner_from_set_details(sets_detail, p1, p2, winner)
        if winner not in (p1, p2):
            if s1 > s2:
                winner = p1
            elif s2 > s1:
                winner = p2

        stats[p1]["played"] += 1
        stats[p2]["played"] += 1

        if winner == p1:
            stats[p1]["wins"] += 1
            stats[p2]["losses"] += 1
        elif winner == p2:
            stats[p2]["wins"] += 1
            stats[p1]["losses"] += 1

        stats[p1]["sets_won"] += s1
        stats[p1]["sets_lost"] += s2
        stats[p2]["sets_won"] += s2
        stats[p2]["sets_lost"] += s1

        for s in sh:
            if not _is_stb(s):
                stats[p1]["games_won"] += s.get("player1_games", 0)
                stats[p1]["games_lost"] += s.get("player2_games", 0)
                stats[p2]["games_won"] += s.get("player2_games", 0)
                stats[p2]["games_lost"] += s.get("player1_games", 0)

        # Build score string
        score_parts = []
        for s in sh:
            score_parts.append(_format_set_score(s))

        match_results.append({
            "match_id": m["id"],
            "player_a": p1,
            "player_b": p2,
            "score": "  ".join(score_parts),
            "sets": sets_detail,
            "winner": winner,
            "sets_a": s1,
            "sets_b": s2,
            "finish_reason": m.get("finish_reason") if isinstance(m, dict) else None,
            "result_note": m.get("result_note") if isinstance(m, dict) else None,
        })

    # Sort: wins desc, set_diff desc, game_diff desc
    standings = []
    for name, s in stats.items():
        standings.append({
            "name": name,
            **s,
            "set_diff": s["sets_won"] - s["sets_lost"],
            "game_diff": s["games_won"] - s["games_lost"],
        })
    standings.sort(key=lambda x: (x["wins"], x["set_diff"], x["game_diff"]), reverse=True)
    return standings, match_results

def save_bracket_knockout(tournament_id: int, slots: List[Dict]) -> bool:
    """Save knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM bracket_knockout WHERE tournament_id = ?", (tournament_id,))
            for slot in slots:
                cursor.execute(
                    "INSERT INTO bracket_knockout (tournament_id, phase, position, "
                    "player1_name, player2_name, winner_name, score_summary, finish_reason, result_note) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (tournament_id, slot["phase"], slot.get("position", 1),
                     slot.get("player1_name"), slot.get("player2_name"),
                     slot.get("winner_name"), slot.get("score_summary"),
                     slot.get("finish_reason", "normal"), slot.get("result_note"))
                )
            conn.commit()
            logger.info("bracket_knockout_saved", tournament_id=tournament_id, count=len(slots))
            return True
    except Exception as e:
        logger.error("save_bracket_knockout_error", error=str(e))
        return False

def fetch_bracket_knockout(tournament_id: int) -> List[Dict]:
    """Get knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, phase, position, player1_name, player2_name, winner_name, score_summary, finish_reason, result_note "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_bracket_knockout_error", error=str(e))
        return []

def _detect_knockout_result(
    cursor,
    p1: str,
    p2: str,
    start_date: str,
    end_date: str,
    tournament_id: Optional[int] = None,
    phase: Optional[str] = None,
) -> Optional[Dict]:
    """Try to find a finished match between two specific players."""
    if not p1 or not p2:
        return None

    end_ts = end_date + "T23:59:59"
    tournament_clause = "AND tournament_id = ?" if tournament_id is not None else ""
    tournament_params = [tournament_id] if tournament_id is not None else []
    allow_surname_fallback = bool(_surname_match_token(p1) and _surname_match_token(p2))
    surname1 = _surname_match_token(p1) or p1
    surname2 = _surname_match_token(p2) or p2

    def _fetch_finished_match(match_phase: Optional[str]) -> Optional[sqlite3.Row]:
        phase_clause = "AND phase = ?" if match_phase else ""
        phase_params = [match_phase] if match_phase else []
        pair_clause, pair_params = sql_two_sided_name_match(p1, p2)
        cursor.execute(f"""
                        SELECT player1_name, player2_name, player1_sets, player2_sets, sets_history,
                                     winner_name, finish_reason, result_note
            FROM matches
            WHERE status = 'finished'
                            AND COALESCE(finish_reason, 'normal') != 'test'
              {tournament_clause}
              {phase_clause}
              AND {pair_clause}
              AND created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (*tournament_params, *phase_params, *pair_params, start_date, end_ts))
        row = cursor.fetchone()
        if row or not allow_surname_fallback:
            return row
        cursor.execute(f"""
                        SELECT player1_name, player2_name, player1_sets, player2_sets, sets_history,
                                     winner_name, finish_reason, result_note
            FROM matches
            WHERE status = 'finished'
                            AND COALESCE(finish_reason, 'normal') != 'test'
              {tournament_clause}
              {phase_clause}
              AND ((player1_name LIKE ? AND player2_name LIKE ?)
                OR (player1_name LIKE ? AND player2_name LIKE ?))
              AND created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (*tournament_params, *phase_params, f"%{surname1}", f"%{surname2}", f"%{surname2}", f"%{surname1}", start_date, end_ts))
        return cursor.fetchone()

    row = _fetch_finished_match(phase)
    if not row and phase and phase != "Pucharowa":
        row = _fetch_finished_match("Pucharowa")
    if not row and not phase:
        row = _fetch_finished_match(None)

    if not row:
        return None

    if same_competitor_label(row["player1_name"], p1):
        flipped = False
    elif same_competitor_label(row["player1_name"], p2):
        flipped = True
    elif allow_surname_fallback:
        p1_surname = _surname_match_token(p1).lower()
        match_p1_surname = _surname_match_token(row["player1_name"]).lower()
        flipped = bool(p1_surname) and match_p1_surname != p1_surname
    else:
        flipped = False

    sh = json.loads(row["sets_history"]) if row["sets_history"] else []
    sh = [s for s in sh if not _is_empty_set(s)]
    score_parts = [_format_set_score(s, flipped) for s in sh]
    sets_detail = [_build_set_detail(s, flipped) for s in sh]

    match_winner = row["winner_name"] or (row["player1_name"] if row["player1_sets"] > row["player2_sets"] else row["player2_name"])
    if same_competitor_label(match_winner, p1):
        mapped_winner = p1
    elif same_competitor_label(match_winner, p2):
        mapped_winner = p2
    elif allow_surname_fallback:
        winner_surname = _surname_match_token(match_winner).lower()
        if winner_surname and winner_surname == _surname_match_token(p1).lower():
            mapped_winner = p1
        elif winner_surname and winner_surname == _surname_match_token(p2).lower():
            mapped_winner = p2
        else:
            mapped_winner = match_winner
    else:
        mapped_winner = match_winner
    winner = _winner_from_set_details(sets_detail, p1, p2, mapped_winner)
    return {
        "winner": winner,
        "score": "  ".join(score_parts),
        "sets": sets_detail,
        "finish_reason": row["finish_reason"],
        "result_note": row["result_note"],
    }

def get_full_bracket(tournament_id: int) -> Dict:
    """Get complete bracket data for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()

            # Tournament info
            cursor.execute("SELECT name, start_date, end_date FROM tournaments WHERE id = ?", (tournament_id,))
            t = cursor.fetchone()
            if not t:
                return {"error": "Tournament not found"}

            start_date = t["start_date"]
            end_date = t["end_date"]

            # Groups + standings
            cursor.execute(
                "SELECT id, name, play_format FROM bracket_groups WHERE tournament_id = ? ORDER BY order_num",
                (tournament_id,)
            )
            group_rows = cursor.fetchall()

            groups_data = []
            for g in group_rows:
                cursor.execute(
                    "SELECT player_name FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],)
                )
                player_names = [r["player_name"] for r in cursor.fetchall()]
                matches = _find_group_matches(cursor, player_names, start_date, end_date, tournament_id)
                standings, match_results = _compute_standings(player_names, matches)
                play_format = g["play_format"] if "play_format" in g.keys() else DEFAULT_PLAY_FORMAT
                groups_data.append({
                    "id": g["id"],
                    "name": g["name"],
                    "play_format": normalize_play_format(play_format),
                    "players": [{"name": name} for name in player_names],
                    "standings": standings,
                    "matches": match_results,
                })

            # Knockout
            cursor.execute(
                "SELECT phase, position, player1_name, player2_name, winner_name, score_summary, finish_reason, result_note "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            knockout_rows = cursor.fetchall()

            knockout = {}
            for r in knockout_rows:
                phase = r["phase"]
                slot = {
                    "position": r["position"],
                    "player1": r["player1_name"],
                    "player2": r["player2_name"],
                    "winner": r["winner_name"],
                    "score": r["score_summary"],
                    "finish_reason": r["finish_reason"],
                    "result_note": r["result_note"],
                    "sets": None,
                }
                # Auto-detect result from match data (always, to populate sets)
                if slot["player1"] and slot["player2"]:
                    result = _detect_knockout_result(
                        cursor, slot["player1"], slot["player2"], start_date, end_date, tournament_id, phase
                    )
                    if result:
                        slot["winner"] = result["winner"]
                        slot["score"] = result["score"]
                        slot["finish_reason"] = result.get("finish_reason")
                        slot["result_note"] = result.get("result_note")
                        slot["sets"] = result.get("sets")

                knockout.setdefault(phase, []).append(slot)

            return {
                "tournament": {
                    "id": tournament_id,
                    "name": t["name"],
                },
                "groups": groups_data,
                "knockout": knockout,
            }
    except Exception as e:
        logger.error("get_full_bracket_error", error=str(e))
        return {"error": str(e)}

def generate_knockout_from_standings(tournament_id: int) -> Dict:
    """Auto-generate knockout bracket from completed group standings."""
    try:
        bracket = get_full_bracket(tournament_id)
        generated = _compute_knockout_slots_from_bracket(bracket.get("groups", []))
        if generated.get("error"):
            return generated
        slots = generated.get("knockout", [])

        save_bracket_knockout(tournament_id, slots)
        ensure_knockout_schedule_entries(tournament_id)
        return {"status": "ok", "knockout": slots}
    except Exception as e:
        logger.error("generate_knockout_error", error=str(e))
        return {"error": str(e)}
