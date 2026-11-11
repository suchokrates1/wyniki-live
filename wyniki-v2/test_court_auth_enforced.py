"""The umpire API as production runs it: the grace period for clients without a court
token ended on 2026-08-08. The rest of the suite extends it to 2099 (conftest), so
without this module nothing would notice a write endpoint losing its guard."""
from datetime import datetime, UTC

import pytest

from wyniki.config import settings

ZERO = {"player1_sets": 0, "player2_sets": 0, "player1_games": 0, "player2_games": 0,
        "player1_points": 0, "player2_points": 0, "sets_history": []}


@pytest.fixture()
def production_like(full_app_with_temp_db, monkeypatch):
    from wyniki import database
    from wyniki.services.api_auth import issue_court_token

    app = full_app_with_temp_db
    monkeypatch.setattr(settings, "court_auth_grace_until", datetime(2026, 8, 8, tzinfo=UTC))
    with app.app_context():
        tournament_id = database.insert_tournament("Auth Cup", "2026-11-11", "2026-11-12", active=True)
        court_id, other_court = database.create_tournament_courts(tournament_id, 2)
    client = app.test_client()
    token = {"Authorization": f"Bearer {issue_court_token(court_id)}"}
    match_id = client.post("/api/matches", headers=token, json={
        "court_id": court_id, "player1_name": "A", "player2_name": "B",
        "client_match_uuid": "auth-1", "score": ZERO}).get_json()["id"]
    return {
        "client": client, "court_id": court_id, "match_id": match_id, "token": token,
        "other_token": {"Authorization": f"Bearer {issue_court_token(other_court)}"},
    }


def _requests(court_id, match_id):
    return {
        "create match": ("post", "/api/matches", {"court_id": court_id, "player1_name": "C", "player2_name": "D",
                                                  "client_match_uuid": "auth-2", "score": ZERO}),
        "update match": ("put", f"/api/matches/{match_id}", {"score": {**ZERO, "player1_games": 1}}),
        "finish match": ("post", f"/api/matches/{match_id}/finish", {}),
        "match event": ("post", "/api/match-events", {"court_id": court_id, "match_id": match_id,
                                                      "event_type": "point", "score": ZERO}),
        "statistics": ("post", "/api/match-statistics", {"match_id": match_id}),
        "add player": ("post", "/api/players", {"kort_id": court_id, "first_name": "Eve", "last_name": "New"}),
        "heartbeat": ("post", "/api/umpire-heartbeat", {"court_id": court_id, "battery_level": 80}),
        "ack command": ("post", "/api/umpire/commands/some-id/ack", {"court_id": court_id}),
    }


NAMES = ["create match", "update match", "finish match", "match event", "statistics",
         "add player", "heartbeat", "ack command"]


@pytest.mark.parametrize("name", NAMES)
def test_without_a_court_token_the_request_is_refused(production_like, name):
    method, path, body = _requests(production_like["court_id"], production_like["match_id"])[name]
    response = getattr(production_like["client"], method)(path, json=body)
    assert response.status_code == 401, f"{name}: {response.status_code} {response.get_data(as_text=True)[:200]}"


@pytest.mark.parametrize("name", [n for n in NAMES if n != "ack command"])
def test_a_token_for_another_court_is_refused(production_like, name):
    method, path, body = _requests(production_like["court_id"], production_like["match_id"])[name]
    response = getattr(production_like["client"], method)(path, json=body, headers=production_like["other_token"])
    assert response.status_code == 403, f"{name}: {response.status_code} {response.get_data(as_text=True)[:200]}"


def test_polling_commands_without_a_token_is_refused(production_like):
    response = production_like["client"].get(f"/api/umpire/commands?court_id={production_like['court_id']}")
    assert response.status_code == 401


def test_with_its_own_token_the_tablet_still_works(production_like):
    client, token = production_like["client"], production_like["token"]
    requests = _requests(production_like["court_id"], production_like["match_id"])
    for name in ("update match", "match event", "heartbeat"):
        method, path, body = requests[name]
        assert getattr(client, method)(path, json=body, headers=token).status_code == 200, name


def test_a_court_token_cannot_drop_a_command_meant_for_another_court(production_like):
    from wyniki.services.director_commands import director_command_broker

    director_command_broker.clear()
    command = director_command_broker.publish({
        "session_court_id": production_like["court_id"], "target_match_id": production_like["match_id"],
        "player1_name": "Renamed",
    })
    client = production_like["client"]

    foreign = client.post(f"/api/umpire/commands/{command['id']}/ack", json={}, headers=production_like["other_token"])
    assert foreign.get_json()["acked"] is False
    own = client.post(f"/api/umpire/commands/{command['id']}/ack", json={}, headers=production_like["token"])
    assert own.get_json()["acked"] is True


def test_a_court_move_is_acknowledged_with_the_new_court_session(production_like):
    from wyniki.services.director_commands import director_command_broker

    director_command_broker.clear()
    moved_to = "t999-9"
    command = director_command_broker.publish({
        "session_court_id": production_like["court_id"], "court_id": moved_to,
        "target_match_id": production_like["match_id"],
    })
    assert director_command_broker.ack(command["id"], court_id=moved_to) is True
