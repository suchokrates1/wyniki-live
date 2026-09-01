from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from wyniki.services.court_manager import _empty_court_state, ensure_court_state
from wyniki.services.match_timer import (
    apply_match_start_from_payload,
    iso_from_epoch_ms,
    sync_court_match_timer_from_match,
)


@pytest.fixture()
def umpire_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-match-timer.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.db_models import db
    from wyniki.api.umpire_api import blueprint as umpire_blueprint

    database.init_db()

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    app.register_blueprint(umpire_blueprint)
    return app


def test_iso_from_epoch_ms_rejects_invented_zero():
    assert iso_from_epoch_ms(0) is None
    assert iso_from_epoch_ms(None) is None
    assert iso_from_epoch_ms("nope") is None


def test_iso_from_epoch_ms_accepts_tablet_clock():
    started = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)
    iso = iso_from_epoch_ms(int(started.timestamp() * 1000))
    parsed = datetime.fromisoformat(iso)
    assert parsed == started


def test_sync_uses_umpire_started_at_not_created_at():
    court = _empty_court_state()
    match = SimpleNamespace(
        status="in_progress",
        created_at="2026-08-28T10:00:00+00:00",
        started_at="2026-08-28T12:15:00+00:00",
        updated_at=None,
    )
    sync_court_match_timer_from_match(court, match)
    assert court["match_time"]["started_ts"] == "2026-08-28T12:15:00+00:00"
    assert court["match_time"]["resume_ts"] == "2026-08-28T12:15:00+00:00"
    assert court["match_time"]["running"] is True
    assert court["match_time"]["offset_seconds"] == 0


def test_not_started_does_not_invent_overlay_clock():
    court = _empty_court_state()
    match = SimpleNamespace(
        status="not_started",
        created_at="2026-08-28T10:00:00+00:00",
        started_at=None,
        updated_at=None,
    )
    sync_court_match_timer_from_match(court, match)
    assert court["match_time"]["running"] is False
    assert court["match_time"]["started_ts"] is None
    assert court["match_time"]["seconds"] == 0


def test_apply_match_start_from_payload_persists_started_at():
    started = datetime.now(timezone.utc) - timedelta(minutes=12)
    match = SimpleNamespace(started_at=None)
    apply_match_start_from_payload(match, {"match_start_time_ms": int(started.timestamp() * 1000)})
    parsed = datetime.fromisoformat(match.started_at)
    assert abs((parsed - started).total_seconds()) < 1


def test_create_match_drives_overlay_timer_from_tablet_start(umpire_app_with_temp_db):
    from wyniki import database

    started = datetime.now(timezone.utc) - timedelta(minutes=63)
    start_ms = int(started.timestamp() * 1000)

    with umpire_app_with_temp_db.app_context():
        tournament_id = database.insert_tournament("Timer Cup", "2026-08-28", "2026-08-30", active=True)
        database.create_tournament_courts(tournament_id, 1)
        court_id = f"t{tournament_id}-1"

        response = umpire_app_with_temp_db.test_client().post(
            "/api/matches",
            json={
                "court_id": court_id,
                "player1_name": "González",
                "player2_name": "Schmidt",
                "status": "in_progress",
                "match_start_time_ms": start_ms,
                "score": {
                    "player1_sets": 0,
                    "player2_sets": 0,
                    "player1_games": 0,
                    "player2_games": 0,
                    "player1_points": 0,
                    "player2_points": 0,
                    "sets_history": [],
                },
            },
        )
        assert response.status_code == 201
        body = response.get_json()
        persisted = datetime.fromisoformat(body["started_at"])
        if persisted.tzinfo is None:
            persisted = persisted.replace(tzinfo=timezone.utc)
        created = datetime.fromisoformat(body["created_at"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        assert abs((persisted - started).total_seconds()) < 2
        assert (created - persisted).total_seconds() > 50 * 60

        court = ensure_court_state(court_id)
        assert court["match_time"]["started_ts"] == body["started_at"]
        assert court["match_time"]["running"] is True
        assert court["match_time"]["seconds"] >= 60 * 60
