"""Reads behind match reminders and the delay estimate.

Kept here rather than in the services that use them so raw SQL stays inside the
database layer, which `test_database_layering` enforces.
"""

from __future__ import annotations

from typing import Any

from .connection import db_conn


def published_fixtures_with_times() -> list[dict[str, Any]]:
    """Published fixtures that have a day and a time and have not started.

    `match_id IS NULL` is what "has not started yet" means here: the umpire's
    app fills it in the moment the match is created on the court.
    """
    with db_conn() as conn:
        rows = conn.execute("""
            SELECT id, tournament_id, day_date, scheduled_time, court_id, court_label,
                   player1_name, player2_name
            FROM tournament_schedule
            WHERE status = 'planned'
              AND IFNULL(scheduled_time, '') <> ''
              AND IFNULL(day_date, '') <> ''
              AND match_id IS NULL
        """).fetchall()
    return [
        {
            "id": r[0], "tournament_id": r[1], "day_date": r[2], "scheduled_time": r[3],
            "court_id": r[4], "court_label": r[5], "player1_name": r[6], "player2_name": r[7],
        }
        for r in rows
    ]


def live_match_on_court(court_id: str) -> dict[str, Any] | None:
    """The match currently occupying a court, with what the estimate needs."""
    if not court_id:
        return None
    with db_conn() as conn:
        row = conn.execute("""
            SELECT live_state, match_config, player1_sets, player2_sets
            FROM matches
            WHERE court_id = ? AND status = 'in_progress'
            ORDER BY id DESC LIMIT 1
        """, (court_id,)).fetchone()
    if not row:
        return None
    return {
        "live_state": row[0], "match_config": row[1],
        "player1_sets": row[2] or 0, "player2_sets": row[3] or 0,
    }


def measured_match_durations() -> list[tuple[int, str]]:
    """(duration in ms, sets history) for matches the referee app timed.

    Only `match_statistics` is read: `match_history.duration_seconds` is
    polluted by timers left running, with a median of 8.5 hours for one-set
    matches, so it would wreck any pace calculation.
    """
    with db_conn() as conn:
        rows = conn.execute("""
            SELECT s.match_duration_ms, m.sets_history
            FROM match_statistics s JOIN matches m ON m.id = s.match_id
            WHERE IFNULL(s.match_duration_ms, 0) > 0
        """).fetchall()
    return [(int(r[0] or 0), r[1]) for r in rows]
