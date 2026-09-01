from datetime import datetime, timezone

import pytest

from wyniki.services.court_manager import get_court_state


@pytest.fixture()
def umpire_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-server-finish.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)
    settings.court_auth_grace_until = datetime(2026, 12, 31, tzinfo=timezone.utc)

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


def _score(**overrides):
    payload = {
        "player1_sets": 0,
        "player2_sets": 0,
        "player1_games": 0,
        "player2_games": 0,
        "player1_points": 0,
        "player2_points": 0,
        "sets_history": [],
    }
    payload.update(overrides)
    return payload


def _create_match(client, court_id, config=None):
    body = {
        "court_id": court_id,
        "player1_name": "Malicki",
        "player2_name": "Dutra",
        "status": "in_progress",
        "client_match_uuid": "finish-uuid-1",
        "score": _score(),
        "match_config": config or {"games_per_set": 4, "sets_to_win": 2},
    }
    created = client.post("/api/matches", json=body)
    assert created.status_code == 201
    return created.get_json()


def test_create_persists_match_config(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Finish Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    match = _create_match(client, f"t{tournament_id}-1", {"games_per_set": 4, "sets_to_win": 2, "no_advantage": True})

    assert match["match_config"]["games_per_set"] == 4
    assert match["match_config"]["sets_to_win"] == 2
    assert match["match_config"]["no_advantage"] is True
    assert match["status"] == "in_progress"


def test_put_winning_score_auto_finishes_like_post_finish(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Malicki Cup", "2026-08-28", "2026-08-28", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    court_id = f"t{tournament_id}-1"
    match = _create_match(client, court_id)

    mid = client.put(
        f"/api/matches/{match['id']}",
        json={
            "status": "in_progress",
            "score": _score(player1_sets=1, player2_sets=0, sets_history=[
                {"set_number": 1, "player1_games": 4, "player2_games": 2},
            ]),
            "match_config": {"games_per_set": 4, "sets_to_win": 2},
        },
    )
    assert mid.status_code == 200
    assert mid.get_json()["status"] == "in_progress"

    done = client.put(
        f"/api/matches/{match['id']}",
        json={
            "status": "in_progress",
            "score": _score(
                player1_sets=2,
                player2_sets=0,
                sets_history=[
                    {"set_number": 1, "player1_games": 4, "player2_games": 2},
                    {"set_number": 2, "player1_games": 4, "player2_games": 2},
                ],
            ),
            "match_config": {"games_per_set": 4, "sets_to_win": 2},
        },
    )
    assert done.status_code == 200
    body = done.get_json()
    assert body["status"] == "finished"
    assert body["finish_reason"] == "normal"
    assert body["winner_name"] == "Malicki"

    court = get_court_state(court_id)
    assert court["match_status"]["active"] is False

    again = client.post(f"/api/matches/{match['id']}/finish", json={"finish_reason": "normal"})
    assert again.status_code == 200
    assert again.get_json()["winner_name"] == "Malicki"
    assert again.get_json()["status"] == "finished"


def test_put_does_not_finish_when_sets_to_win_not_reached(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Long Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    match = _create_match(client, f"t{tournament_id}-1", {"games_per_set": 6, "sets_to_win": 3})

    done = client.put(
        f"/api/matches/{match['id']}",
        json={
            "status": "finished",
            "score": _score(player1_sets=2, player2_sets=0),
            "match_config": {"games_per_set": 6, "sets_to_win": 3},
        },
    )
    assert done.status_code == 200
    assert done.get_json()["status"] == "in_progress"


def test_create_without_explicit_config_still_stores_defaults(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Default Config Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    created = client.post(
        "/api/matches",
        json={
            "court_id": f"t{tournament_id}-1",
            "player1_name": "A",
            "player2_name": "B",
            "status": "in_progress",
            "score": _score(),
        },
    )
    assert created.status_code == 201
    config = created.get_json()["match_config"]
    assert config["sets_to_win"] == 2
    assert config["games_per_set"] == 4
