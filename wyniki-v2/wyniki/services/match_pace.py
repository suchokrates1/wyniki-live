"""How much longer the match on a court is likely to run.

Estimated from pace, not from the average length of a match in the category.
Match length varies enormously (22 to 166 minutes over the matches we have
measured), but minutes per game is tight: median 3.78, quartiles 2.98 and 4.50.
So the estimate is "games still to play x minutes per game", and the games are
read off the live score and the match format rather than guessed.

The pace is recalibrated from real matches and falls back to the measured
median when there is not enough history. Only `match_statistics.match_duration_ms`
is used, because it is timed by the referee app; `match_history.duration_seconds`
is polluted by timers left running (its median for one-set matches is 8.5 hours).
"""

from __future__ import annotations

import json
import statistics
import time
from typing import Any
from collections.abc import Mapping

import structlog

from ..database import reminders as reminders_db

logger = structlog.get_logger()

# Median over the 338 measured matches as of 2026-09-30. Used until the
# recalibration below has enough samples of its own.
FALLBACK_PACE_MINUTES_PER_GAME = 3.78

# Below this many samples the median is noise, so keep the fallback.
MIN_SAMPLES_FOR_PACE = 30

# How much a close set stretches the leader's remaining distance. Tuned against
# 311 measured matches sampled at every game of the second set (1680 points):
# median absolute error 7.6 minutes, p90 about 60.
#
# The estimate runs roughly 8 minutes short on average, because it counts only
# the set being played. A minority of matches go to a decider, and covering that
# (adding half a set's worth of games) removes the bias but doubles the typical
# error, to 16 minutes. The typical case wins, and running short is the safer
# direction anyway: understate a delay and the player waits by the court,
# overstate it and they may be away from it when their match is called.
#
# This is a hint, never a promise, which is why every message says "about".
CONTESTED_STRETCH = 1.5

_PACE_CACHE: dict[str, Any] = {"value": None, "at": 0.0}
_PACE_TTL_SECONDS = 3600


def _games_in(sets_history: Any) -> int:
    if isinstance(sets_history, str):
        try:
            sets_history = json.loads(sets_history)
        except (TypeError, ValueError):
            return 0
    if not isinstance(sets_history, list):
        return 0
    return sum(
        int(s.get("player1_games") or 0) + int(s.get("player2_games") or 0)
        for s in sets_history if isinstance(s, dict)
    )


def measure_pace() -> float:
    """Median minutes per game over matches the referee app timed."""
    try:
        rows = reminders_db.measured_match_durations()
    except Exception as exc:  # noqa: BLE001 - an estimate is never worth an error
        logger.warning("match_pace_query_failed", error=str(exc))
        return FALLBACK_PACE_MINUTES_PER_GAME

    paces = []
    for duration_ms, sets_history in rows:
        games = _games_in(sets_history)
        if games <= 0:
            continue
        minutes = duration_ms / 60000
        pace = minutes / games
        # Guard against the same contamination that ruins match_history: a timer
        # left running turns a 40-minute match into an 8-hour one.
        if 0.5 <= pace <= 15:
            paces.append(pace)

    if len(paces) < MIN_SAMPLES_FOR_PACE:
        return FALLBACK_PACE_MINUTES_PER_GAME
    return float(statistics.median(paces))


def pace_minutes_per_game() -> float:
    """Cached pace; recalculated at most once an hour."""
    now = time.time()
    if _PACE_CACHE["value"] is None or now - _PACE_CACHE["at"] > _PACE_TTL_SECONDS:
        _PACE_CACHE["value"] = measure_pace()
        _PACE_CACHE["at"] = now
    return float(_PACE_CACHE["value"])


def reset_pace_cache() -> None:
    _PACE_CACHE["value"] = None
    _PACE_CACHE["at"] = 0.0


def remaining_games(live: Mapping[str, Any], config: Mapping[str, Any], sets_a: int, sets_b: int) -> float:
    """Games still to play, from the live score and the agreed format.

    A tiebreak counts as one game, which is what it is on the scoreboard, and a
    super tiebreak replaces a whole set.
    """
    games_per_set = int(config.get("games_per_set") or 6)
    sets_to_win = int(config.get("sets_to_win") or 2)

    if live.get("stb"):
        return 1.0  # a super tiebreak is the last thing that happens
    if live.get("tb"):
        return 1.0  # the tiebreak game itself, then the set is over

    g1 = int(live.get("g1") or 0)
    g2 = int(live.get("g2") or 0)
    leader, trailer = max(g1, g2), min(g1, g2)

    # To take the set the leader needs to reach games_per_set; the trailing side
    # wins some of those games too, so part of their remaining distance is added.
    # A 4:0 lead therefore reads as nearly over, 4:4 as a way to go.
    # The leader needs to reach games_per_set, and the trailing side keeps
    # winning some games along the way - the closer they are, the more. So the
    # leader's remaining distance is stretched by how close the set is, which
    # makes 3:0 nearly over and 3:3 a way to go.
    to_close = max(0.0, games_per_set - leader)
    closeness = min(1.0, trailer / max(1, games_per_set))
    rest_of_set = max(1.0, to_close * (1.0 + closeness * CONTESTED_STRETCH))

    sets_left = max(0, sets_to_win - max(int(sets_a or 0), int(sets_b or 0)) - 1)
    if sets_left <= 0:
        return rest_of_set

    # Not validated: in the matches we have measured, this branch never fires at
    # the point a delay notice goes out, so the multiplier is a plain guess.
    return rest_of_set + sets_left * games_per_set * 1.5


def remaining_minutes(live: Mapping[str, Any], config: Mapping[str, Any], sets_a: int, sets_b: int,
                      pace: float | None = None) -> int:
    """Whole minutes the current match is still likely to need."""
    per_game = float(pace if pace is not None else pace_minutes_per_game())
    return int(round(remaining_games(live, config, sets_a, sets_b) * per_game))
