"""Group standings from finished match rows."""
import json
from typing import List

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

        # Official winner_name is source of truth (tennis.lt). Set games are only a fallback.
        sets_detail = [_build_set_detail(s) for s in sh]
        try:
            stored_winner = m["winner_name"]
        except Exception:
            stored_winner = None
        winner = stored_winner if stored_winner in (p1, p2) else _winner_from_set_details(sets_detail, p1, p2, stored_winner)
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
