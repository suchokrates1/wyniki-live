"""Decide whether a live score already satisfies the stored MatchConfig."""
from __future__ import annotations

from typing import Any

from .director_commands import normalize_match_config, parse_stored_match_config


def match_score_satisfies_format(match: Any, raw_config: dict | None = None) -> bool:
    """True when one side has reached sets_to_win (best-of / first-to)."""
    config = (
        normalize_match_config(raw_config)
        if raw_config is not None
        else parse_stored_match_config(getattr(match, "match_config", None))
    )
    needed = int(config.get("sets_to_win") or 2)
    player1_sets = int(getattr(match, "player1_sets", 0) or 0)
    player2_sets = int(getattr(match, "player2_sets", 0) or 0)
    return max(player1_sets, player2_sets) >= needed and player1_sets != player2_sets
