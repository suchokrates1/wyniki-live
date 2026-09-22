"""Both connection paths open SQLite the same way.

Without WAL a reader blocks the writer, and without busy_timeout the loser of that race
gets "database is locked" instead of waiting — during a tournament that is a lost result.
"""
from __future__ import annotations

from test_tournament_lifecycle import full_app_with_temp_db  # noqa: F401 (fixture)
from wyniki.database.connection import SQLITE_BUSY_TIMEOUT_SECONDS

EXPECTED_BUSY_MS = int(SQLITE_BUSY_TIMEOUT_SECONDS * 1000)


def test_raw_connection_uses_wal_and_waits_for_the_writer(tmp_path, monkeypatch):
    from wyniki.config import settings
    from wyniki.database import db_conn

    monkeypatch.setattr(settings, "database_path", str(tmp_path / "pragmas.sqlite3"))
    with db_conn() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == EXPECTED_BUSY_MS
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_sqlalchemy_connection_matches_the_raw_one(full_app_with_temp_db):
    from wyniki.db_models import db

    with full_app_with_temp_db.app_context():
        assert db.session.execute(db.text("PRAGMA journal_mode")).scalar() == "wal"
        assert db.session.execute(db.text("PRAGMA busy_timeout")).scalar() == EXPECTED_BUSY_MS
        assert db.session.execute(db.text("PRAGMA foreign_keys")).scalar() == 1


def test_a_second_connection_can_read_while_one_writes(tmp_path, monkeypatch):
    from wyniki.config import settings
    from wyniki.database import db_conn

    monkeypatch.setattr(settings, "database_path", str(tmp_path / "parallel.sqlite3"))
    with db_conn() as writer:
        writer.execute("CREATE TABLE note (id INTEGER PRIMARY KEY, text TEXT)")
        writer.execute("INSERT INTO note (text) VALUES ('before')")
        writer.commit()
        writer.execute("INSERT INTO note (text) VALUES ('uncommitted')")
        with db_conn() as reader:
            # WAL: the reader sees the committed row and is not blocked by the open write.
            assert reader.execute("SELECT COUNT(*) FROM note").fetchone()[0] == 1
        writer.commit()
