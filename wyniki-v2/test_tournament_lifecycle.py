import pytest


@pytest.fixture()
def app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.api import admin

    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                court_id TEXT NOT NULL,
                player1_name TEXT NOT NULL,
                player2_name TEXT NOT NULL,
                status TEXT DEFAULT 'in_progress',
                tournament_id INTEGER,
                bracket_group_id INTEGER,
                phase TEXT,
                player1_sets INTEGER DEFAULT 0,
                player2_sets INTEGER DEFAULT 0,
                sets_history TEXT
            )
            """
        )
        conn.commit()

    database.init_db()
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS match_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL UNIQUE,
                match_duration_ms INTEGER DEFAULT 0,
                winner TEXT,
                stats_mode TEXT
            )
            """
        )
        conn.commit()

    app = Flask(__name__)
    app.register_blueprint(admin.blueprint)
    return app


def _count_table(database, table_name: str, where_clause: str = "", params=()):
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS count FROM {table_name} {where_clause}", params)
        return cursor.fetchone()["count"]


def test_admin_courts_show_active_tournaments_only(app_with_temp_db):
    from wyniki import database

    active_id = database.insert_tournament("Active Cup", "2026-04-26", "2026-04-27", active=True)
    inactive_id = database.insert_tournament("Inactive Cup", "2026-04-26", "2026-04-27", active=False)
    database.create_tournament_courts(active_id, 1)
    database.create_tournament_courts(inactive_id, 3)

    response = app_with_temp_db.test_client().get("/admin/api/courts")

    assert response.status_code == 200
    courts = response.get_json()
    assert len(courts) == 1
    assert courts[0]["tournament_id"] == active_id


def test_delete_tournament_removes_owned_data(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Delete Me", "2026-04-26", "2026-04-27", active=False)
    database.create_tournament_courts(tournament_id, 2)
    player_id = database.insert_player(
        tournament_id,
        "Test Player",
        "E2E",
        "PL",
        first_name="Test",
        last_name="Player",
    )

    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (f"t{tournament_id}-1", "Test Player", "Other Player", "finished", tournament_id),
        )
        match_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO match_statistics (match_id, winner, match_duration_ms, stats_mode)
            VALUES (?, ?, ?, ?)
            """,
            (match_id, "Test Player", 120000, "basic"),
        )
        cursor.execute(
            """
            INSERT INTO match_history (kort_id, ended_ts, duration_seconds, player_a, player_b, match_id, tournament_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (f"t{tournament_id}-1", "2026-04-26T00:00:00Z", 120, "Test Player", "Other Player", match_id, tournament_id),
        )
        cursor.execute(
            "INSERT INTO bracket_groups (tournament_id, name, order_num) VALUES (?, ?, ?)",
            (tournament_id, "A", 1),
        )
        group_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO bracket_group_players (group_id, player_id, player_name) VALUES (?, ?, ?)",
            (group_id, player_id, "Test Player"),
        )
        cursor.execute(
            """
            INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name)
            VALUES (?, ?, ?, ?, ?)
            """,
            (tournament_id, "final", 1, "Test Player", "Other Player"),
        )
        conn.commit()

    assert database.delete_tournament(tournament_id) is True
    assert _count_table(database, "tournaments", "WHERE id = ?", (tournament_id,)) == 0
    assert _count_table(database, "players", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "courts", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "matches", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "match_statistics", "WHERE match_id = ?", (match_id,)) == 0
    assert _count_table(database, "match_history", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "bracket_groups", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "bracket_group_players", "WHERE group_id = ?", (group_id,)) == 0
    assert _count_table(database, "bracket_knockout", "WHERE tournament_id = ?", (tournament_id,)) == 0