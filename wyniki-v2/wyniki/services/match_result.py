"""Who won a finished match, read from its score rather than a separately stored name."""
from __future__ import annotations

import json
from typing import Any, Optional

# A finish the score cannot explain: the stored winner is the only record of it.
_WINNER_WITHOUT_SCORE = {"walkover", "retirement"}
# Longest plausible blind tennis match; anything above is a clock that kept running.
MAX_MATCH_SECONDS = 4 * 3600


def _parse_sets(sets_history: Any) -> list:
    if not sets_history:
        return []
    if isinstance(sets_history, str):
        try:
            sets_history = json.loads(sets_history)
        except (TypeError, ValueError):
            return []
    return [s for s in sets_history if isinstance(s, dict)] if isinstance(sets_history, list) else []


def _team_key(name: Any) -> Optional[frozenset]:
    """Doubles pairs compare regardless of partner order ("A / B" == "B / A")."""
    text = str(name or "").strip()
    if not text:
        return None
    return frozenset(part.strip().casefold() for part in text.split(" / ") if part.strip())


def same_competitor(a: Any, b: Any) -> bool:
    key_a, key_b = _team_key(a), _team_key(b)
    return key_a is not None and key_a == key_b


def winner_from_score(player1: Any, player2: Any, sets_history: Any = None,
                      player1_sets: Any = None, player2_sets: Any = None) -> Optional[str]:
    """Sets won decide the winner; the set counters are the fallback when no set detail exists."""
    wins1 = wins2 = 0
    for item in _parse_sets(sets_history):
        if item.get("unfinished"):
            continue
        g1 = int(item.get("player1_games") or 0)
        g2 = int(item.get("player2_games") or 0)
        if g1 > g2:
            wins1 += 1
        elif g2 > g1:
            wins2 += 1
    if wins1 == wins2:
        wins1 = int(player1_sets or 0)
        wins2 = int(player2_sets or 0)
    if wins1 > wins2:
        return player1 or None
    if wins2 > wins1:
        return player2 or None
    return None


def resolve_match_winner(*, player1: Any, player2: Any, stored_winner: Any = None,
                         finish_reason: Any = None, sets_history: Any = None,
                         player1_sets: Any = None, player2_sets: Any = None) -> Optional[str]:
    """The winner as the match row names them.

    Walkovers and retirements keep the recorded winner. Every other finish takes the
    winner from the score, so an empty or contradicting stored name cannot leak out.
    """
    stored = str(stored_winner or "").strip() or None
    canonical = next((p for p in (player1, player2) if stored and same_competitor(p, stored)), stored)
    if str(finish_reason or "").strip().lower() in _WINNER_WITHOUT_SCORE:
        return canonical
    return winner_from_score(player1, player2, sets_history, player1_sets, player2_sets) or canonical


def plausible_duration(seconds: Any) -> Optional[int]:
    try:
        value = int(seconds or 0)
    except (TypeError, ValueError):
        return None
    return value if 0 < value <= MAX_MATCH_SECONDS else None
