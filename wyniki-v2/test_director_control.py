import pytest

from wyniki.services.director_commands import director_command_broker, tablet_presence


@pytest.fixture()
def director_app(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-director.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.db_models import db
    from wyniki.api import admin, courts
    from wyniki.api.umpire_api import blueprint as umpire_blueprint

    database.init_db()

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()
    app.register_blueprint(admin.blueprint)
    app.register_blueprint(courts.blueprint)
    app.register_blueprint(umpire_blueprint)
    return app


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


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


def _create_match(client, court_id, p1, p2, uuid, score=None):
    response = client.post(
        "/api/matches",
        json={
            "court_id": court_id,
            "player1_name": p1,
            "player2_name": p2,
            "status": "in_progress",
            "client_match_uuid": uuid,
            "score": score or _score(),
            "match_config": {"games_per_set": 4, "sets_to_win": 2},
        },
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    return response.get_json()


def test_director_moves_second_tablet_off_shared_court(director_app):
    director_command_broker.clear()
    tablet_presence.clear()

    from wyniki import database

    tournament_id = database.insert_tournament("Director Cup", "2026-08-28", "2026-08-29", active=True)
    courts = database.create_tournament_courts(tournament_id, 2)
    court_a, court_b = courts[0], courts[1]
    client = director_app.test_client()

    justyna = _create_match(
        client,
        court_a,
        "Justyna Stopierzyńska",
        "Courtney Webeck",
        "uuid-justyna",
        _score(player1_games=4, player2_games=5, player2_sets=1),
    )
    gonzalez = _create_match(
        client,
        court_a,
        "Jessica González",
        "Daniela Schmidt",
        "uuid-gonzalez",
        _score(player2_games=3),
    )

    tablet_presence.record(
        session_court_id=court_a,
        match_id=gonzalez["id"],
        client_match_uuid="uuid-gonzalez",
        player1_name="Jessica González",
        player2_name="Daniela Schmidt",
    )
    tablet_presence.record(
        session_court_id=court_a,
        match_id=justyna["id"],
        client_match_uuid="uuid-justyna",
        player1_name="Justyna Stopierzyńska",
        player2_name="Courtney Webeck",
    )

    control = client.post(
        f"/admin/api/matches/{gonzalez['id']}/control",
        json={
            "court_id": court_b,
            "player1_name": "Jessica González",
            "player2_name": "Daniela Schmidt",
            "score": _score(player2_games=3),
            "match_config": {"games_per_set": 4, "sets_to_win": 2, "no_advantage": True},
        },
    )
    assert control.status_code == 200, control.get_data(as_text=True)
    command = control.get_json()["command"]
    assert command["court_id"] == court_b
    assert command["session_court_id"] == court_a
    assert command["court_token"]
    assert command["match_config"]["no_advantage"] is True

    gonzalez_poll = client.get(
        f"/api/umpire/commands?court_id={court_a}&match_id={gonzalez['id']}&client_match_uuid=uuid-gonzalez&wait_ms=0"
    )
    assert gonzalez_poll.status_code == 200
    gonzalez_commands = gonzalez_poll.get_json()["commands"]
    assert len(gonzalez_commands) == 1
    assert gonzalez_commands[0]["court_id"] == court_b

    justyna_poll = client.get(
        f"/api/umpire/commands?court_id={court_a}&match_id={justyna['id']}&client_match_uuid=uuid-justyna&wait_ms=0"
    )
    assert justyna_poll.get_json()["commands"] == []

    moved = client.get(f"/api/matches/{gonzalez['id']}").get_json()
    assert moved["court_id"] == court_b
    assert moved["match_config"]["no_advantage"] is True

    from wyniki.services.court_manager import get_court_state

    overlay_a = get_court_state(court_a) or {}
    overlay_b = get_court_state(court_b) or {}
    assert (overlay_a.get("A") or {}).get("surname") == "Justyna Stopierzyńska"
    assert (overlay_b.get("A") or {}).get("surname") == "Jessica González"

    from wyniki.services.api_auth import issue_court_token

    token_a = issue_court_token(court_a)
    forbidden = client.put(
        f"/api/matches/{gonzalez['id']}",
        json={"status": "in_progress", "score": _score(player2_games=4)},
        headers=_auth_headers(token_a),
    )
    assert forbidden.status_code == 403

    allowed = client.put(
        f"/api/matches/{gonzalez['id']}",
        json={"status": "in_progress", "score": _score(player2_games=4)},
        headers=_auth_headers(command["court_token"]),
    )
    assert allowed.status_code == 200, allowed.get_data(as_text=True)
    assert allowed.get_json()["score"]["player2_games"] == 4

    ack = client.post(
        f"/api/umpire/commands/{command['id']}/ack",
        json={"court_id": court_a},
    )
    assert ack.status_code == 200
    assert ack.get_json()["acked"] is True
    empty = client.get(
        f"/api/umpire/commands?court_id={court_a}&match_id={gonzalez['id']}&wait_ms=0"
    )
    assert empty.get_json()["commands"] == []


def test_director_renames_and_rewrites_score(director_app):
    director_command_broker.clear()
    tablet_presence.clear()
    from wyniki import database

    tournament_id = database.insert_tournament("Rename Cup", "2026-08-28", "2026-08-29", active=True)
    court_id = database.create_tournament_courts(tournament_id, 1)[0]
    client = director_app.test_client()
    match = _create_match(client, court_id, "Emil Stopierzyński", "Courtney Webeck", "uuid-rename")

    control = client.post(
        f"/admin/api/matches/{match['id']}/control",
        json={
            "player1_name": "Justyna Stopierzyńska",
            "score": _score(player1_sets=0, player2_sets=1, player1_games=0, player2_games=4),
        },
    )
    assert control.status_code == 200, control.get_data(as_text=True)
    body = control.get_json()
    assert body["match"]["player1_name"] == "Justyna Stopierzyńska"
    assert body["match"]["score"]["player2_sets"] == 1
    command = body["command"]
    assert command["player1_name"] == "Justyna Stopierzyńska"
    assert command["score"]["player2_games"] == 4


def test_director_command_wakes_waiting_poll(director_app):
    director_command_broker.clear()
    tablet_presence.clear()
    from wyniki import database
    import threading
    import time

    tournament_id = database.insert_tournament("Wait Cup", "2026-08-28", "2026-08-29", active=True)
    court_id = database.create_tournament_courts(tournament_id, 1)[0]
    client = director_app.test_client()
    match = _create_match(client, court_id, "A Player", "B Player", "uuid-wait")
    tablet_presence.record(
        session_court_id=court_id,
        match_id=match["id"],
        client_match_uuid="uuid-wait",
        player1_name="A Player",
        player2_name="B Player",
    )

    result = {}

    def poll():
        started = time.time()
        response = client.get(
            f"/api/umpire/commands?court_id={court_id}&match_id={match['id']}&client_match_uuid=uuid-wait&wait_ms=8000"
        )
        result["elapsed"] = time.time() - started
        result["status"] = response.status_code
        result["commands"] = response.get_json()["commands"]

    waiter = threading.Thread(target=poll)
    waiter.start()
    time.sleep(0.2)
    control = client.post(
        f"/admin/api/matches/{match['id']}/control",
        json={"player1_name": "Renamed A"},
    )
    assert control.status_code == 200, control.get_data(as_text=True)
    waiter.join(timeout=5)
    assert not waiter.is_alive()
    assert result["status"] == 200
    assert result["elapsed"] < 2.5
    assert result["commands"][0]["player1_name"] == "Renamed A"

    heartbeat = client.post(
        "/api/umpire-heartbeat",
        json={
            "court_id": court_id,
            "match_id": str(match["id"]),
            "client_match_uuid": "uuid-wait",
            "battery_level": "80",
            "screen": "Match:BASIC_SCORING",
        },
    )
    assert heartbeat.status_code == 200
    assert heartbeat.get_json()["commands"][0]["player1_name"] == "Renamed A"

    tablets = client.get(f"/admin/api/director/tablets?court_id={court_id}").get_json()
    assert any(row.get("match_id") == match["id"] for row in tablets["tablets"])


def test_director_pushes_token_when_sql_already_moved(director_app):
    director_command_broker.clear()
    tablet_presence.clear()
    from wyniki import database
    from wyniki.services.court_manager import get_court_state

    tournament_id = database.insert_tournament("Vilnius Replay", "2026-08-28", "2026-08-29", active=True)
    court_a, court_b = database.create_tournament_courts(tournament_id, 2)
    client = director_app.test_client()

    justyna = _create_match(
        client,
        court_a,
        "Justyna Stopierzyńska",
        "Courtney Webeck",
        "uuid-justyna-sql",
        _score(player2_sets=1, player2_games=4),
    )
    gonzalez = _create_match(
        client,
        court_b,
        "Jessica González",
        "Daniela Schmidt",
        "uuid-gonzalez-sql",
        _score(player2_games=3),
    )
    tablet_presence.record(
        session_court_id=court_a,
        match_id=gonzalez["id"],
        client_match_uuid="uuid-gonzalez-sql",
        player1_name="Jessica González",
        player2_name="Daniela Schmidt",
    )

    control = client.post(
        f"/admin/api/matches/{gonzalez['id']}/control",
        json={
            "session_court_id": court_a,
            "court_id": court_b,
            "player1_name": "Jessica González",
            "player2_name": "Daniela Schmidt",
            "score": _score(player2_games=3),
        },
    )
    assert control.status_code == 200, control.get_data(as_text=True)
    command = control.get_json()["command"]
    assert command["session_court_id"] == court_a
    assert command["court_id"] == court_b
    assert command["court_token"]

    gonzalez_poll = client.get(
        f"/api/umpire/commands?court_id={court_a}&match_id={gonzalez['id']}&client_match_uuid=uuid-gonzalez-sql&wait_ms=0"
    )
    assert len(gonzalez_poll.get_json()["commands"]) == 1

    justyna_poll = client.get(
        f"/api/umpire/commands?court_id={court_a}&match_id={justyna['id']}&client_match_uuid=uuid-justyna-sql&wait_ms=0"
    )
    assert justyna_poll.get_json()["commands"] == []

    overlay_a = get_court_state(court_a) or {}
    assert (overlay_a.get("A") or {}).get("surname") == "Justyna Stopierzyńska"


def test_stale_court_events_do_not_overwrite_overlay(director_app):
    director_command_broker.clear()
    tablet_presence.clear()
    from wyniki import database
    from wyniki.services.court_manager import get_court_state

    tournament_id = database.insert_tournament("Stale Events", "2026-08-28", "2026-08-29", active=True)
    court_a, court_b = database.create_tournament_courts(tournament_id, 2)
    client = director_app.test_client()
    justyna = _create_match(
        client, court_a, "Justyna Stopierzyńska", "Courtney Webeck", "uuid-justyna-ev"
    )
    gonzalez = _create_match(
        client, court_a, "Jessica González", "Daniela Schmidt", "uuid-gonzalez-ev"
    )
    tablet_presence.record(
        session_court_id=court_a,
        match_id=gonzalez["id"],
        client_match_uuid="uuid-gonzalez-ev",
        player1_name="Jessica González",
        player2_name="Daniela Schmidt",
    )
    moved = client.post(
        f"/admin/api/matches/{gonzalez['id']}/control",
        json={"session_court_id": court_a, "court_id": court_b},
    )
    assert moved.status_code == 200, moved.get_data(as_text=True)

    leaked = client.post(
        "/api/match-events",
        json={
            "event_type": "POINT",
            "court_id": court_a,
            "match_id": gonzalez["id"],
            "client_match_uuid": "uuid-gonzalez-ev",
            "player1": {"name": "Jessica González", "full_name": "Jessica González"},
            "player2": {"name": "Daniela Schmidt", "full_name": "Daniela Schmidt"},
            "score": _score(player2_games=4),
        },
    )
    assert leaked.status_code == 200, leaked.get_data(as_text=True)
    body = leaked.get_json()
    assert body.get("stale_court") is True
    assert body.get("expected_court_id") == court_b

    overlay_a = get_court_state(court_a) or {}
    assert (overlay_a.get("A") or {}).get("surname") == "Justyna Stopierzyńska"
    assert justyna["id"]

