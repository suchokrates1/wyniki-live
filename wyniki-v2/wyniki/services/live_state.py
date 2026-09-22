"""The last live point state of a match, kept on the match row.

Tablets send every point as a match event, but the result fields only change on a
game-end PUT, and the overlay lives in memory. After a crash or restart the overlay is
rebuilt from the database, so each point also writes this small record: points, games,
set count, tiebreak flags and server. It is never used for results.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from ..db_models import utc_now_iso


def _sets_played(sets_history: Any) -> Optional[int]:
    if sets_history is None:
        return None
    if isinstance(sets_history, str):
        try:
            sets_history = json.loads(sets_history)
        except (TypeError, ValueError):
            return None
    return len(sets_history) if isinstance(sets_history, list) else None


def _regular_sets(sets_history: Any) -> int:
    if isinstance(sets_history, str):
        try:
            sets_history = json.loads(sets_history)
        except (TypeError, ValueError):
            return 0
    if not isinstance(sets_history, list):
        return 0
    return sum(1 for item in sets_history if isinstance(item, dict) and not item.get("is_super_tiebreak"))


def store_live_state(match: Any, score: dict | None, serve: Any = None) -> None:
    """Record the tablet's current point state on the match (caller commits)."""
    score = score or {}
    try:
        games_a = int(score.get("player1_games") or 0)
        games_b = int(score.get("player2_games") or 0)
        # match events carry the flags; game-end PUTs from both apps do not, so they are inferred
        in_tiebreak = bool(score["is_tiebreak"]) if "is_tiebreak" in score else set_tiebreak_due(match, games_a, games_b)
        if "is_super_tiebreak" in score:
            in_super = bool(score["is_super_tiebreak"])
        else:
            in_super = _regular_sets(score.get("sets_history")) >= 2
        state = {
            "p1": int(score.get("player1_points") or 0),
            "p2": int(score.get("player2_points") or 0),
            "g1": games_a,
            "g2": games_b,
            "sets": _sets_played(score.get("sets_history")),
            "tb": in_tiebreak and not in_super,
            "stb": in_super,
            "serve": serve if serve in ("A", "B") else None,
            "at": utc_now_iso(),
        }
    except (TypeError, ValueError):
        return
    match.live_state = json.dumps(state)


def read_live_state(match: Any) -> Optional[dict]:
    """The stored point state when it still describes the match's current game.

    A score changed elsewhere (office correction, director command) leaves games or the
    set count different; then the record is stale and the match fields win.
    """
    raw = getattr(match, "live_state", None)
    if not raw:
        return None
    try:
        state = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(state, dict):
        return None
    if int(state.get("g1", -1)) != int(match.player1_games or 0) or int(state.get("g2", -1)) != int(match.player2_games or 0):
        return None
    sets_now = _sets_played(match.sets_history) or 0
    if state.get("sets") is not None and int(state["sets"]) != sets_now:
        return None
    return state


def set_tiebreak_due(match: Any, games_a: int, games_b: int) -> bool:
    """Level at the set's game count (4:4 with four-game sets) means a set tiebreak."""
    config = {}
    raw = getattr(match, "match_config", None)
    if raw:
        try:
            config = json.loads(raw) if isinstance(raw, str) else dict(raw)
        except (TypeError, ValueError):
            config = {}
    if config.get("tiebreak_only"):
        return True
    games_per_set = int(config.get("games_per_set") or 4)
    return games_a == games_b and games_a >= games_per_set
