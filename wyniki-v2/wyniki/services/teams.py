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
