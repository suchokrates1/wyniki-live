"""Regression: late office group results must count in standings (Schäfer–Bouwens class)."""
from __future__ import annotations

import json
from datetime import date, timedelta

import pytest


@pytest.fixture()
def standings_db(tmp_path, monkeypatch):
    db_path = tmp_path / "standings.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def _seed_tournament_with_group(database, *, end_date: str):
    start = (date.fromisoformat(end_date) - timedelta(days=2)).isoformat()
    tid = database.insert_tournament(
        name="Late Results Regression",
        start_date=start,
        end_date=end_date,
        active=True,
        city="Test",
        country="PL",
        is_public=False,
    )
    assert tid is not None
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bracket_groups (tournament_id, name, order_num) VALUES (?, ?, ?)",
            (tid, "B3", 1),
        )
        group_id = cursor.lastrowid
        for name in ("Schäfer", "Bouwens", "Other A", "Other B"):
            cursor.execute(
                "INSERT INTO bracket_group_players (group_id, player_name) VALUES (?, ?)",
                (group_id, name),
            )
        conn.commit()
    return tid


def _sets_history(p1_games: int, p2_games: int) -> str:
    return json.dumps([
        {"player1_games": p1_games, "player2_games": p2_games},
        {"player1_games": p1_games, "player2_games": p2_games},
    ])


def _insert_finished_group_match(
    database,
    *,
    tournament_id: int,
    player1: str,
    player2: str,
    winner: str,
    created_at: str,
    sets_p1: int = 2,
    sets_p2: int = 0,
):
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (
                court_id, tournament_id, status, phase, player1_name, player2_name,
                player1_sets, player2_sets, winner_name, sets_history,
                finish_reason, created_at
            ) VALUES (?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?, 'normal', ?)
            """,
            (
                f"office-{tournament_id}",
                tournament_id,
                database.GROUP_PHASE,
                player1,
                player2,
                sets_p1,
                sets_p2,
                winner,
                _sets_history(4 if sets_p1 > sets_p2 else 0, 0 if sets_p1 > sets_p2 else 4),
                created_at,
            ),
        )
        match_id = cursor.lastrowid
        conn.commit()
    return match_id


def test_late_office_rematch_included_in_group_standings(standings_db):
    """Match created after tournament end_date must still appear when tournament_id is set."""
    end_date = "2026-05-10"
    tid = _seed_tournament_with_group(standings_db, end_date=end_date)

    _insert_finished_group_match(
        standings_db,
        tournament_id=tid,
        player1="Schäfer",
        player2="Bouwens",
        winner="Schäfer",
        created_at="2026-05-09T12:00:00",
    )
    late_id = _insert_finished_group_match(
        standings_db,
        tournament_id=tid,
        player1="Schäfer",
        player2="Bouwens",
        winner="Bouwens",
        created_at="2026-05-12T18:30:00",  # after end_date
        sets_p1=0,
        sets_p2=2,
    )

    bracket = standings_db.get_full_bracket(tid)
    group = next(g for g in bracket["groups"] if g["name"] == "B3")
    match_ids = {m.get("match_id") for m in group["matches"]}
    assert late_id in match_ids

    standings_by_name = {row["name"]: row for row in group["standings"]}
    # Two finished H2H results: 1–1 in matches → both have a win
    assert standings_by_name["Bouwens"]["wins"] >= 1
    assert standings_by_name["Schäfer"]["wins"] >= 1


def test_find_group_matches_skips_date_filter_when_tournament_scoped(standings_db):
    end_date = "2026-05-10"
    tid = _seed_tournament_with_group(standings_db, end_date=end_date)
    late_id = _insert_finished_group_match(
        standings_db,
        tournament_id=tid,
        player1="Schäfer",
        player2="Bouwens",
        winner="Bouwens",
        created_at="2026-06-01T10:00:00",
    )

    with standings_db.db_conn() as conn:
        cursor = conn.cursor()
        matches = standings_db._find_group_matches(
            cursor,
            ["Schäfer", "Bouwens", "Other A", "Other B"],
            "2026-05-08",
            end_date,
            tid,
        )
    assert any(m["id"] == late_id for m in matches)


def test_find_group_matches_still_date_filters_legacy_unscoped_rows(standings_db):
    """Without tournament_id, date window still applies (legacy behaviour)."""
    end_date = "2026-05-10"
    tid = _seed_tournament_with_group(standings_db, end_date=end_date)
    # Insert as tournament-linked then clear tournament_id to simulate legacy row
    late_id = _insert_finished_group_match(
        standings_db,
        tournament_id=tid,
        player1="Schäfer",
        player2="Bouwens",
        winner="Bouwens",
        created_at="2026-06-01T10:00:00",
    )
    with standings_db.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE matches SET tournament_id = NULL WHERE id = ?", (late_id,))
        conn.commit()
        matches = standings_db._find_group_matches(
            cursor,
            ["Schäfer", "Bouwens", "Other A", "Other B"],
            "2026-05-08",
            end_date,
            None,
        )
    assert not any(m["id"] == late_id for m in matches)
