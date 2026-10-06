import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent / "scripts" / "copy_tournament.py"


def _load_copier():
    spec = importlib.util.spec_from_file_location("copy_tournament", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Copier


def _fresh_db(path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(path))
    from wyniki.config import settings

    settings.database_path = str(path)
    from wyniki import database

    database.init_db()
    return database


@pytest.fixture()
def source(tmp_path, monkeypatch):
    db = _fresh_db(tmp_path / "source.sqlite3", monkeypatch)
    db.insert_tournament("Filler", "2026-01-01", "2026-01-02", city="X", country="PL")
    db.insert_tournament("Filler 2", "2026-02-01", "2026-02-02", city="X", country="PL")
    tid = int(db.insert_tournament("Wilno", "2026-08-25", "2026-08-29", city="Vilnius", country="LT"))
    jani = db.insert_player(tid, name="Jani Kallunki", first_name="Jani", last_name="Kallunki", category="B1", country="FI", gender="M")
    naqi = db.insert_player(tid, name="Naqi Rizvi", first_name="Naqi", last_name="Rizvi", category="B1", country="GB", gender="M")
    with db.db_conn() as conn:
        conn.execute("INSERT INTO courts (kort_id, pin, name, tournament_id, display_order) VALUES (?, '1234', 'Kort 1', ?, 1)",
                     (f"t{tid}-1", tid))
        group = conn.execute("INSERT INTO bracket_groups (tournament_id, name, order_num) VALUES (?, 'B1 Men — Grupa A', 1)", (tid,)).lastrowid
        conn.executemany("INSERT INTO bracket_group_players (group_id, player_id, player_name) VALUES (?, ?, ?)",
                         [(group, jani, "Jani Kallunki"), (group, naqi, "Naqi Rizvi")])
        conn.execute("INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name) VALUES (?, 'B1 Men — Finał', 1, 'Naqi Rizvi', 'Jani Kallunki')", (tid,))
        match = conn.execute(
            "INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id, bracket_group_id, phase, player1_sets, player2_sets, sets_history, created_at, updated_at) "
            "VALUES (?, 'Jani Kallunki', 'Naqi Rizvi', 'finished', ?, ?, 'Grupowa', 2, 0, ?, '2026-08-25T10:00:00Z', '2026-08-25T10:30:00Z')",
            (f"t{tid}-1", tid, group, json.dumps([{"set_number": 1, "player1_games": 4, "player2_games": 1}, {"set_number": 2, "player1_games": 4, "player2_games": 2}])),
        ).lastrowid
        conn.execute("INSERT INTO match_history (kort_id, ended_ts, duration_seconds, player_a, player_b, score_a, score_b, tournament_id, match_id, phase) "
                     "VALUES (?, '2026-08-25T10:30:00Z', 1800, 'Jani Kallunki', 'Naqi Rizvi', '[4, 4]', '[1, 2]', ?, ?, 'Grupowa')", (f"t{tid}-1", tid, match))
        conn.commit()
    return tmp_path / "source.sqlite3", tid


def test_a_tournament_lands_in_another_database_whole_and_renumbered(source, tmp_path, monkeypatch):
    source_path, tid = source
    target_db = _fresh_db(tmp_path / "target.sqlite3", monkeypatch)
    target_db.insert_tournament("Already here", "2026-09-21", "2026-09-22", city="Y", country="PL")

    copier = _load_copier()(sqlite3.connect(source_path), sqlite3.connect(tmp_path / "target.sqlite3"), tid)
    with copier.dst:
        copier.run("Wilno (kopia)")
    new = copier.new_tid
    assert new != tid

    bracket = target_db.get_full_bracket(new)
    assert bracket["tournament"]["name"] == "Wilno (kopia)"
    assert [g["name"] for g in bracket["groups"]] == ["B1 Men — Grupa A"]
    assert [row["name"] for row in bracket["groups"][0]["standings"]] == ["Jani Kallunki", "Naqi Rizvi"]
    assert set(bracket["players"]) == {"Jani Kallunki", "Naqi Rizvi"}
    assert bracket["players"]["Jani Kallunki"]["country"] == "FI"
    assert list(bracket["knockout"]) == ["B1 Men — Finał"]

    with target_db.db_conn() as conn:
        court = conn.execute("SELECT kort_id FROM courts WHERE tournament_id = ?", (new,)).fetchone()
        history = conn.execute("SELECT kort_id, match_id FROM match_history WHERE tournament_id = ?", (new,)).fetchone()
        match = conn.execute("SELECT id, court_id FROM matches WHERE tournament_id = ?", (new,)).fetchone()
        active = conn.execute("SELECT active FROM tournaments WHERE id = ?", (new,)).fetchone()[0]
    # court ids and every pointer to them follow the new tournament id
    assert court["kort_id"] == f"t{new}-1"
    assert history["kort_id"] == f"t{new}-1" and history["match_id"] == match["id"]
    assert match["court_id"] == f"t{new}-1"
    assert active == 0
