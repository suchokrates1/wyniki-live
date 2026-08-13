"""Canonical doubles pair names and identity keys.

Storage order of partners in `display_name` is stable (last_name, first_name, id).
Matching ignores partner order: "A / B" == "B / A".
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

TEAM_NAME_SEPARATOR = " / "


def person_full_name(player: Any) -> str:
    """Return 'First Last', falling back to `name`."""
    if player is None:
        return ""
    if isinstance(player, str):
        return " ".join(player.split())
    first = str(player.get("first_name") or "").strip()
    last = str(player.get("last_name") or "").strip()
    name = str(player.get("name") or "").strip()
    if first and last:
        return f"{first} {last}"
    return last or first or name


def _person_sort_key(player: Mapping[str, Any]) -> tuple:
    full = person_full_name(player)
    last = str(player.get("last_name") or "").strip().lower()
    first = str(player.get("first_name") or "").strip().lower()
    if not last and full:
        last = full.split()[-1].lower()
    try:
        pid = int(player.get("id") or 0)
    except (TypeError, ValueError):
        pid = 0
    return (last, first, pid)


def format_team_display_name(player_a: Mapping[str, Any], player_b: Mapping[str, Any]) -> str:
    """Canonical pair label matching the umpire app: 'First Last / First Last'."""
    left, right = sorted((player_a, player_b), key=_person_sort_key)
    left_name = person_full_name(left)
    right_name = person_full_name(right)
    if not left_name or not right_name:
        raise ValueError("Both partners need a display name")
    return f"{left_name}{TEAM_NAME_SEPARATOR}{right_name}"


def split_team_display_name(value: Optional[str]) -> Optional[tuple[str, str]]:
    raw = str(value or "")
    if TEAM_NAME_SEPARATOR not in raw:
        return None
    left, right = raw.split(TEAM_NAME_SEPARATOR, 1)
    left, right = left.strip(), right.strip()
    if not left or not right:
        return None
    return left, right


def is_team_display_name(value: Optional[str]) -> bool:
    """True for canonical pair labels like 'Anna Kowalska / Ewa Nowak'."""
    return split_team_display_name(value) is not None


def pair_key_from_player_ids(player1_id: int, player2_id: int) -> str:
    left, right = int(player1_id), int(player2_id)
    if left == right:
        raise ValueError("Partners must be two different people")
    lo, hi = (left, right) if left < right else (right, left)
    return f"{lo}:{hi}"


def _as_player_id(value: Any) -> Optional[int]:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    raw = str(value).strip()
    if raw.isdigit() or (raw.startswith("-") and raw[1:].isdigit()):
        return int(raw)
    return None


def normalize_pair_key(left: Any, right: Any = None) -> str:
    """Stable identity for a pair.

    Accepts two player ids, two names, or one 'Name / Name' label.
    Partner order is ignored.
    """
    if right is None:
        split = split_team_display_name(str(left or ""))
        if not split:
            raise ValueError("Pair label must be 'Name / Name'")
        left, right = split
    left_id, right_id = _as_player_id(left), _as_player_id(right)
    if left_id is not None and right_id is not None:
        return pair_key_from_player_ids(left_id, right_id)
    left_name = " ".join(str(left or "").strip().lower().split())
    right_name = " ".join(str(right or "").strip().lower().split())
    if not left_name or not right_name:
        raise ValueError("Pair key requires two partners")
    lo, hi = (left_name, right_name) if left_name <= right_name else (right_name, left_name)
    return f"{lo}|{hi}"


def competitor_label_variants(value: Optional[str]) -> list[str]:
    """Exact stored labels that represent the same competitor, partner order ignored."""
    raw = str(value or "").strip()
    if not raw:
        return []
    split = split_team_display_name(raw)
    if not split:
        return [raw]
    left, right = split
    variants = [
        f"{left}{TEAM_NAME_SEPARATOR}{right}",
        f"{right}{TEAM_NAME_SEPARATOR}{left}",
    ]
    if raw not in variants:
        variants.append(raw)
    seen: set[str] = set()
    unique: list[str] = []
    for item in variants:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    return unique


def competitor_identity_key(value: Optional[str]) -> str:
    """Stable key for one competitor (person or pair) used in matching/deduping."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if is_team_display_name(raw):
        try:
            return normalize_pair_key(raw)
        except ValueError:
            pass
    return " ".join(raw.lower().split())


def same_competitor_label(left: Optional[str], right: Optional[str]) -> bool:
    a = str(left or "").strip()
    b = str(right or "").strip()
    if not a or not b:
        return False
    if a == b:
        return True
    return bool(competitor_identity_key(a) and competitor_identity_key(a) == competitor_identity_key(b))


def sql_two_sided_name_match(
    player1_name: str,
    player2_name: str,
    *,
    p1_column: str = "player1_name",
    p2_column: str = "player2_name",
) -> tuple[str, tuple[str, ...]]:
    """SQL fragment matching two sides, ignoring pair-partner order and side flip."""
    left = competitor_label_variants(player1_name)
    right = competitor_label_variants(player2_name)
    if not left or not right:
        return "(0)", ()
    left_ph = ",".join("?" for _ in left)
    right_ph = ",".join("?" for _ in right)
    clause = (
        f"(({p1_column} IN ({left_ph}) AND {p2_column} IN ({right_ph}))"
        f" OR ({p1_column} IN ({right_ph}) AND {p2_column} IN ({left_ph})))"
    )
    return clause, (*left, *right, *right, *left)


def ordered_player_ids(player1_id: int, player2_id: int) -> tuple[int, int]:
    key = pair_key_from_player_ids(player1_id, player2_id)
    left, right = key.split(":")
    return int(left), int(right)


PLAY_FORMAT_GROUPS_KNOCKOUT = "groups_knockout"
PLAY_FORMAT_ROUND_ROBIN = "round_robin"
PLAY_FORMAT_KNOCKOUT = "knockout"
DEFAULT_PLAY_FORMAT = PLAY_FORMAT_GROUPS_KNOCKOUT
ALLOWED_PLAY_FORMATS = frozenset({
    PLAY_FORMAT_GROUPS_KNOCKOUT,
    PLAY_FORMAT_ROUND_ROBIN,
    PLAY_FORMAT_KNOCKOUT,
})


def normalize_play_format(value: Any) -> str:
    raw = str(value or "").strip()
    return raw if raw in ALLOWED_PLAY_FORMATS else DEFAULT_PLAY_FORMAT


def coerce_is_doubles(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return int(value) != 0
    return str(value).strip().lower() in {"1", "true", "yes", "on"}
