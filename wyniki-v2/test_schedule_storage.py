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
    with pytest.raises(StorageError):
        schedule.publish_tournament_schedule(1)
    with pytest.raises(StorageError):
        schedule.clear_schedule_day(1, "2026-10-02")
    with pytest.raises(StorageError):
        schedule.delete_unassigned_schedule_entries(1)
    with pytest.raises(StorageError):
        schedule.unlink_schedule_from_match(1)


def test_a_schedule_write_failure_is_a_server_error(monkeypatch):
    from flask import Flask

    from wyniki.api import office

    def locked(*_args, **_kwargs):
        raise StorageError("database is locked")

    monkeypatch.setattr(office, "_require_office_access", lambda *_a, **_k: ({"id": 1}, None))
    monkeypatch.setattr(office, "fetch_tournament_schedule", lambda *_a, **_k: [])
    monkeypatch.setattr(office, "update_tournament_schedule_entry", locked)
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(office.blueprint)
    client = app.test_client()

    failed = client.put("/api/office/1/schedule/9", json={"notes_public": "x"})
    assert failed.status_code == 500
    assert failed.get_json()["error"] == "Schedule save failed"

    monkeypatch.setattr(office, "update_tournament_schedule_entry", lambda *_a, **_k: None)
    missing = client.put("/api/office/1/schedule/9", json={"notes_public": "x"})
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "Schedule entry not found"


def test_a_storage_error_on_an_api_route_says_save_failed():
    from app import create_app

    app = create_app()
    app.config["TESTING"] = True

    @app.route("/api/storage-probe")
    def _probe():
        raise StorageError("probe")

    response = app.test_client().get("/api/storage-probe")
    assert response.status_code == 500
    assert response.get_json()["error"] == "Save failed"
