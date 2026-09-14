"""Schedule notes are the office's own: new matches start without one."""
import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "schedule-notes.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def test_generated_matches_have_no_note_and_old_automatic_notes_are_cleared(db):
    tournament_id = db.insert_tournament("Notes Cup", "2026-08-01", "2026-08-02", active=True)
    ids = [db.insert_player(tournament_id, f"N{n}", "B2", "PL") for n in range(4)]
    db.save_bracket_groups(tournament_id, [{"name": "B2 — Grupa A", "players": ids}])
    rows = [row for row in db.fetch_tournament_schedule(tournament_id) if row["source_type"] == "group"]
    assert len(rows) == 6 and all(not (row.get("notes_public") or "") for row in rows)

    typed = "Kort kryty"
    with db.db_conn() as conn:
        conn.execute("UPDATE tournament_schedule SET notes_public = ? WHERE id = ?", (db.DEFAULT_GROUP_SCHEDULE_NOTE_PL, rows[0]["id"]))
        conn.execute("UPDATE tournament_schedule SET notes_public = ? WHERE id = ?", (typed, rows[1]["id"]))
        from wyniki.database.schedule import clear_default_schedule_notes

        assert clear_default_schedule_notes(conn.cursor()) == 1
        conn.commit()
    notes = {row["id"]: row.get("notes_public") or "" for row in db.fetch_tournament_schedule(tournament_id)}
    assert notes[rows[0]["id"]] == "" and notes[rows[1]["id"]] == typed
