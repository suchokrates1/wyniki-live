"""Bricks a tournament still needs: its court numbers, known names, odd scores.

The closed shelf already holds the ordinary points and sets. This adds what
that shelf cannot know ahead of time. A missing file is generated; a file
that is already there is left alone.
"""
from __future__ import annotations

import json
from collections.abc import Sequence
from itertools import combinations

from .court_lector import chunk_path, warm_shelf
from .lector_lines import _set_sentence, court_sentence

_SKIPPED = ("zwycięz", "zwyciez", "przegran", "tbd", "tba", "bye")


def clean_name(value: object) -> str:
    text = " ".join(str(value or "").split())
    if len(text) < 3 or text == "-":
        return ""
    folded = text.casefold()
    if any(folded.startswith(prefix) for prefix in _SKIPPED):
        return ""
    return text


def name_lines(pairs: list[tuple[str, str]]) -> list[str]:
    lines = []
    seen: set[tuple[str, str]] = set()
    for left, right in pairs:
        a, b = clean_name(left), clean_name(right)
        if not a or not b or a == b:
            continue
        key = (a, b)
        if key in seen:
            continue
        seen.add(key)
        lines.append(f"{a}, serwuje, kontra {b}.")
        lines.append(f"{b}, serwuje, kontra {a}.")
    return lines


def edge_lines(
    sets: list[tuple[int, int, int]],
    ties: list[tuple[int, int, bool]],
) -> list[str]:
    """Scores the ordinary shelf does not contain: games past 7, tie-breaks past 10."""
    lines = []
    for number, left, right in sets:
        if left <= 7 and right <= 7:
            continue
        spoken = _set_sentence(number, left, right, active=False)
        if spoken:
            lines.append(spoken)
    for left, right, super_break in ties:
        if left <= 10 and right <= 10:
            continue
        from .lector_lines import _pair

        pair = _pair(left, right)
        if pair is None:
            continue
        label = "Super tie-break" if super_break else "Tie-break"
        lines.append(f"{label}, {pair}.")
    return lines


def _winner_points(loser: int) -> int | None:
    if loser < 0:
        return None
    return 7 if loser <= 5 else loser + 2


def history_lines(history: object) -> list[str]:
    """Set and tie-break bricks implied by stored history. A super tie-break's games are its points."""
    if not isinstance(history, list):
        return []
    sets: list[tuple[int, int, int]] = []
    ties: list[tuple[int, int, bool]] = []
    for index, entry in enumerate(history, start=1):
        if not isinstance(entry, dict):
            continue
        try:
            left = int(entry.get("player1_games") or 0)
            right = int(entry.get("player2_games") or 0)
            number = int(entry.get("set_number") or index)
        except (TypeError, ValueError):
            continue
        if entry.get("is_super_tiebreak"):
            ties.append((left, right, True))
            continue
        sets.append((number, left, right))
        raw = entry.get("tiebreak_loser_points")
        if raw is None:
            continue
        try:
            loser = int(raw)
        except (TypeError, ValueError):
            continue
        winner = _winner_points(loser)
        if winner is None:
            continue
        if left > right:
            ties.append((winner, loser, False))
        elif right > left:
            ties.append((loser, winner, False))
    return edge_lines(sets, ties)


def bricks_for(
    *,
    courts: Sequence[object],
    pairs: list[tuple[str, str]],
    sets: list[tuple[int, int, int]] | None = None,
    ties: list[tuple[int, int, bool]] | None = None,
) -> list[str]:
    lines: list[str] = []
    for court in courts:
        spoken = court_sentence(court)
        if spoken:
            lines.append(spoken)
    lines.extend(name_lines(pairs))
    lines.extend(edge_lines(sets or [], ties or []))
    return list(dict.fromkeys(lines))


def lines_for_tournament(tournament_id: int) -> list[str]:
    from ..database.courts import fetch_courts_for_tournament
    from ..database.lector_rows import group_player_names, match_pairs, match_set_histories

    courts = [row.get("name") for row in fetch_courts_for_tournament(tournament_id)]
    pairs: list[tuple[str, str]] = []
    for names in group_player_names(tournament_id).values():
        pairs.extend(combinations(names, 2))
    pairs.extend(match_pairs(tournament_id))
    lines = bricks_for(courts=courts, pairs=pairs)
    for raw in match_set_histories(tournament_id):
        try:
            history = json.loads(raw) if raw else []
        except (TypeError, ValueError):
            continue
        lines.extend(history_lines(history))
    return list(dict.fromkeys(lines))


def fill_missing(
    tournament_id: int,
    *,
    speaker=None,
    limit: int | None = None,
    character_budget: int | None = None,
) -> dict:
    """Generate bricks this tournament does not have yet. Existing files are skipped."""
    from ..config import settings

    if speaker is None and not settings.elevenlabs_api_key:
        return {"created": 0, "skipped": 0, "spent": 0, "left": 0}
    pending = []
    for sentence in lines_for_tournament(tournament_id):
        path = chunk_path(sentence, None, None, shared=True)
        if path.is_file() and path.stat().st_size > 0:
            continue
        pending.append(sentence)
        if limit is not None and len(pending) >= limit:
            break
    return warm_shelf(pending, speaker=speaker, character_budget=character_budget)


def fill_next() -> dict:
    """One missing brick for an active tournament. Stops while the live reserve is all that's left."""
    from ..database.tournaments import fetch_active_tournaments

    budget = _character_budget()
    if not budget:
        return {"created": 0, "skipped": 0, "spent": 0, "left": 0}
    for tournament in fetch_active_tournaments():
        result = fill_missing(int(tournament["id"]), limit=1, character_budget=budget)
        if result["created"] or result["left"]:
            return result
    return {"created": 0, "skipped": 0, "spent": 0, "left": 0}


def _character_budget() -> int | None:
    """Leave 8000 characters for live announcements. None when the quota cannot be read."""
    import urllib.request

    from ..config import settings

    if not settings.elevenlabs_api_key:
        return 0
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/user/subscription",
        headers={"xi-api-key": settings.elevenlabs_api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.load(response)
    except (OSError, ValueError):
        return 0
    remaining = int(data.get("character_limit") or 0) - int(data.get("character_count") or 0)
    return max(0, remaining - 8000)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate missing lector bricks for a tournament.")
    parser.add_argument("--tournament", type=int, action="append", default=[])
    parser.add_argument("--limit", type=int, default=0, help="Stop after this many new bricks. 0 means all.")
    args = parser.parse_args()
    from ..database.tournaments import fetch_active_tournaments

    ids = args.tournament or [int(row["id"]) for row in fetch_active_tournaments()]
    budget = _character_budget()
    limit = args.limit or None
    for tournament_id in ids:
        result = fill_missing(tournament_id, limit=limit, character_budget=budget)
        print({"tournament": tournament_id, **result}, flush=True)
        if budget is not None:
            budget = max(0, budget - int(result["spent"]))


if __name__ == "__main__":
    main()
