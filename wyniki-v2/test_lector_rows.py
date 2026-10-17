"""What the court lector reads from a tournament: group players, every pairing and stored sets."""
import sqlite3


def _database(tmp_path, monkeypatch):
    db_path = tmp_path / "lector.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    monkeypatch.setattr(settings, "database_path", str(db_path))
    from wyniki.database import init_db
    init_db()
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO tournaments (id, name, start_date, end_date) VALUES (1, 'T', '2026-10-01', '2026-10-02')")
    conn.execute("INSERT INTO tournaments (id, name, start_date, end_date) VALUES (2, 'Other', '2026-10-01', '2026-10-02')")
    conn.execute("INSERT INTO bracket_groups (id, tournament_id, name) VALUES (10, 1, 'A')")
    conn.execute("INSERT INTO bracket_groups (id, tournament_id, name) VALUES (20, 2, 'A')")
    conn.executemany("INSERT INTO bracket_group_players (group_id, player_name) VALUES (?, ?)",
                     [(10, "Anna"), (10, "Ewa"), (20, "Elsewhere")])
    conn.execute("INSERT INTO tournament_schedule (tournament_id, day_date, player1_name, player2_name) VALUES (1, '2026-10-01', 'Anna', 'Ewa')")
    conn.execute("INSERT INTO matches (court_id, tournament_id, player1_name, player2_name, sets_history) VALUES ('1', 1, 'Anna', 'Ola', '[[6, 4]]')")
    conn.execute("INSERT INTO bracket_knockout (tournament_id, phase, player1_name, player2_name) VALUES (1, 'Finał', 'Anna', NULL)")
    conn.commit()
    conn.close()


def test_the_lector_reads_only_its_tournament(tmp_path, monkeypatch):
    _database(tmp_path, monkeypatch)
    from wyniki.database.lector_rows import group_player_names, match_pairs, match_set_histories

    assert group_player_names(1) == {10: ["Anna", "Ewa"]}
    assert sorted(match_pairs(1)) == [("Anna", ""), ("Anna", "Ewa"), ("Anna", "Ola")]
    assert match_set_histories(1) == ["[[6, 4]]"]
    assert match_pairs(3) == []
