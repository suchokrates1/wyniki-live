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


def test_bulk_notes_follow_filters_and_modes(db):
    tournament_id = db.insert_tournament("Bulk Notes Cup", "2026-08-01", "2026-08-02", active=True)
    court_a, court_b = db.create_tournament_courts(tournament_id, 2)
    women = [db.insert_player(tournament_id, f"W{n}", "B2", "PL") for n in range(3)]
    men = [db.insert_player(tournament_id, f"M{n}", "B1", "PL") for n in range(3)]
    db.save_bracket_groups(tournament_id, [
        {"name": "B2 Kobiety — Grupa A", "players": women},
        {"name": "B1 Mężczyźni", "players": men},
    ])
    rows = db.fetch_tournament_schedule(tournament_id)
    women_rows = [row for row in rows if str(row["group_name"]).startswith("B2 Kobiety")]
    men_rows = [row for row in rows if str(row["group_name"]).startswith("B1")]
    with db.db_conn() as conn:
        for index, row in enumerate(women_rows):
            conn.execute("UPDATE tournament_schedule SET court_id = ?, day_date = '2026-08-01', scheduled_time = ? WHERE id = ?", (court_a, f"0{9 + index}:00", row["id"]))
        for index, row in enumerate(men_rows):
            conn.execute("UPDATE tournament_schedule SET court_id = ?, day_date = '2026-08-02', scheduled_time = ? WHERE id = ?", (court_b, f"{10 + index}:00", row["id"]))
        conn.execute("UPDATE tournament_schedule SET notes_public = 'Własna' WHERE id = ?", (women_rows[0]["id"],))
        conn.commit()

    preview = db.apply_schedule_notes(tournament_id, {"court_ids": [court_a]}, text="Kort kryty")
    assert preview["count"] == 3 and preview["with_notes"] == 1 and preview["updated"] == 0
    assert all(not (row.get("notes_public") or "").startswith("Kort") for row in db.fetch_tournament_schedule(tournament_id))

    applied = db.apply_schedule_notes(tournament_id, {"categories": ["B2 Kobiety"]}, text="Kort kryty", mode="append", apply=True)
    assert applied["updated"] == 3
    notes = {row["id"]: row.get("notes_public") for row in db.fetch_tournament_schedule(tournament_id)}
    assert notes[women_rows[0]["id"]] == "Własna · Kort kryty" and notes[women_rows[1]["id"]] == "Kort kryty"
    assert all(not notes[row["id"]] for row in men_rows)

    # appending the same text again does not repeat it
    assert db.apply_schedule_notes(tournament_id, {"categories": ["B2 Kobiety"]}, text="Kort kryty", mode="append", apply=True)["updated"] == 0

    day_two = db.apply_schedule_notes(tournament_id, {"day_date": "2026-08-02", "phase": "group"}, text="Start 10:00", apply=True)
    assert day_two["count"] == 3 and day_two["updated"] == 3
    with db.db_conn() as conn:
        conn.execute("UPDATE tournament_schedule SET status = 'completed' WHERE id = ?", (men_rows[0]["id"],))
        conn.commit()
    cleared = db.apply_schedule_notes(tournament_id, {"day_date": "2026-08-02"}, mode="clear", apply=True)
    assert cleared["count"] == 2 and cleared["updated"] == 2
    assert {row["id"]: row.get("notes_public") for row in db.fetch_tournament_schedule(tournament_id)}[men_rows[0]["id"]] == "Start 10:00"
    assert db.apply_schedule_notes(tournament_id, {}, text="", mode="replace") == {"error": "empty_note"}
