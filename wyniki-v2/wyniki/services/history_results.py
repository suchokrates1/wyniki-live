"""Reading one match-history row: who won it and how its sets went.

Rows come from every version of the umpire app, so the score may be a JSON string or a
list, and older rows have no per-set history; these read all of them the same way.
"""
from __future__ import annotations

import json
from typing import Any


def _scores(result) -> tuple[list, list]:
    def parse(raw):
        return (json.loads(raw) if isinstance(raw, str) else raw) or []
    return parse(result.score_a), parse(result.score_b)


def result_sets(result) -> list[dict[str, Any]]:
    """The sets of one result as player A saw them, with tie-break points where known."""
    sets = []
    if result.sets_history:
        try:
            raw = json.loads(result.sets_history) if isinstance(result.sets_history, str) else result.sets_history
            sets = [
                {
                    'g1': s.get('player1_games', 0),
                    'g2': s.get('player2_games', 0),
                    'tb': s.get('tiebreak_loser_points'),
                    'stb': bool(s.get('is_super_tiebreak', False)),
                }
                for s in raw
            ]
        except (json.JSONDecodeError, TypeError):
            sets = []
    if not sets and result.score_a and result.score_b:
        try:
            sa, sb = _scores(result)
            sets = [
                {'g1': sa[i] if i < len(sa) else 0, 'g2': sb[i] if i < len(sb) else 0, 'tb': None, 'stb': False}
                for i in range(max(len(sa), len(sb)))
            ]
        except (json.JSONDecodeError, TypeError):
            pass
    return sets


def result_winner(result) -> str | None:
    """The name that won a match-history row by sets, or None for a draw or an unreadable score.

    Sets come from the per-set history when there is one: older rows left the super tie-break
    out of score_a / score_b, so a match won 10:6 in it read as a 1:1 draw.
    """
    sets = result_sets(result)
    sets_a = sum(1 for s in sets if s['g1'] > s['g2'])
    sets_b = sum(1 for s in sets if s['g2'] > s['g1'])
    if sets_a > sets_b:
        return result.player_a
    if sets_b > sets_a:
        return result.player_b
    return None
