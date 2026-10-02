"""A database failure while saving the schedule is not a missing row."""
import sqlite3

import pytest

from wyniki.database.errors import StorageError


class _Locked:
    def __enter__(self):
        raise sqlite3.OperationalError("database is locked")

    def __exit__(self, exc_type, exc, tb):
        return False


def test_a_locked_database_is_not_a_missing_schedule_entry(monkeypatch):
    from wyniki.database import schedule

    monkeypatch.setattr(schedule, "db_conn", lambda: _Locked())
    with pytest.raises(StorageError):
        schedule.update_tournament_schedule_entry(1, 9, {"notes_public": "x"})
    with pytest.raises(StorageError):
        schedule.delete_tournament_schedule_entry(1, 9)


def test_a_schedule_write_failure_is_a_server_error(monkeypatch):
    from flask import Flask

    from wyniki.api import admin_tournaments

    def locked(*_args, **_kwargs):
        raise StorageError("database is locked")

    monkeypatch.setattr(admin_tournaments, "_require_tournament", lambda *_a, **_k: ({"id": 1}, None))
    monkeypatch.setattr(admin_tournaments, "update_tournament_schedule_entry", locked)
    monkeypatch.setattr(admin_tournaments, "delete_tournament_schedule_entry", locked)
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(admin_tournaments.blueprint)
    client = app.test_client()

    failed = client.put("/admin/api/tournaments/1/schedule/9", json={"notes_public": "x"})
    assert failed.status_code == 500
    assert failed.get_json()["error"] == "Schedule save failed"

    monkeypatch.setattr(admin_tournaments, "update_tournament_schedule_entry", lambda *_a, **_k: None)
    missing = client.put("/admin/api/tournaments/1/schedule/9", json={"notes_public": "x"})
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "Schedule entry not found"
