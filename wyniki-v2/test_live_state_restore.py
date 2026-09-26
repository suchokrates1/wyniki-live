"""After a crash or restart the live court comes back at the last point, tiebreaks included."""
from datetime import datetime, timezone

import pytest


@pytest.fixture()
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-live-state.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    settings.court_auth_grace_until = datetime(2026, 12, 31, tzinfo=timezone.utc)
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application


def _score(g1, g2, p1=0, p2=0, sets=(), **flags):
    return {
        "player1_sets": sum(1 for a, b in sets if a > b), "player2_sets": sum(1 for a, b in sets if b > a),
        "player1_games": g1, "player2_games": g2, "player1_points": p1, "player2_points": p2,
        "sets_history": [{"set_number": i + 1, "player1_games": a, "player2_games": b} for i, (a, b) in enumerate(sets)],
        **flags,
    }


def _start(client, court_id, games_per_set=4, tiebreak_at_games=None):
    config = {"games_per_set": games_per_set, "sets_to_win": 2}
    if tiebreak_at_games is not None:
        config["tiebreak_at_games"] = tiebreak_at_games
    created = client.post("/api/matches", json={
        "court_id": court_id, "player1_name": "Stypa", "player2_name": "Gawrych", "status": "in_progress",
        "client_match_uuid": f"live-{court_id}", "match_config": config, "score": _score(0, 0),
    })
    assert created.status_code == 201, created.get_json()
    return created.get_json()["id"], config


def _put(client, match_id, config, score, serve="A"):
    response = client.put(f"/api/matches/{match_id}", json={"status": "in_progress", "match_config": config, "score": score, "serve": serve})
    assert response.status_code == 200, response.get_json()


def _point(client, court_id, match_id, score, serve):
    response = client.post("/api/match-events", json={
        "court_id": court_id, "match_id": match_id, "event_type": "point",
        "player1": {"name": "Stypa", "is_serving": serve == "A"}, "player2": {"name": "Gawrych", "is_serving": serve == "B"},
        "score": score, "timestamp": 0,
    })
    assert response.status_code == 200, response.get_json()


def _crash_and_restore(app, court_id):
    """The process dies: memory is gone, the database stays."""
    from wyniki import database
    from wyniki.init_state import rehydrate_live_courts
    from wyniki.services.court_manager import COURTS, STATE_LOCK, refresh_courts_from_db

    with STATE_LOCK:
        COURTS.clear()
    refresh_courts_from_db(database.fetch_courts(active_only=True))
    with app.app_context():
        rehydrate_live_courts()
    return COURTS[court_id]


def _court(app):
    from wyniki import database

    tid = database.insert_tournament("Crash Cup", "2026-09-26", "2026-09-27", active=True)
    database.create_tournament_courts(tid, 1)
    return f"t{tid}-1"


def test_a_set_tiebreak_comes_back_at_its_point_and_server(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id)
    _put(client, match_id, config, _score(4, 4))  # game-end PUT: apps send no tiebreak flag
    _point(client, court_id, match_id, _score(4, 4, 5, 4, is_tiebreak=True, is_super_tiebreak=False), "B")

    court = _crash_and_restore(app, court_id)
    assert court["tie"]["visible"] is True
    assert (court["tie"]["A"], court["tie"]["B"]) == (5, 4)
    assert court["serve"] == "B"
    assert court["match_status"]["active"] is True


def test_points_inside_a_game_survive_not_just_the_last_game(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id)
    _put(client, match_id, config, _score(2, 2))
    _point(client, court_id, match_id, _score(2, 2, 2, 3, is_tiebreak=False, is_super_tiebreak=False), "A")

    court = _crash_and_restore(app, court_id)
    assert (court["A"]["points"], court["B"]["points"]) == ("30", "40")
    assert court["tie"]["visible"] is False


def test_a_tiebreak_reached_by_a_put_alone_is_inferred_from_the_format(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id)
    _put(client, match_id, config, _score(4, 4))

    court = _crash_and_restore(app, court_id)
    assert court["tie"]["visible"] is True


def test_a_format_with_the_tiebreak_at_three_all_is_inferred_from_a_put(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id, tiebreak_at_games=3)
    _put(client, match_id, config, _score(3, 3))

    court = _crash_and_restore(app, court_id)
    assert court["tie"]["visible"] is True


def test_six_game_sets_are_not_in_a_tiebreak_at_four_all(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id, games_per_set=6)
    _put(client, match_id, config, _score(4, 4, 1, 2))

    court = _crash_and_restore(app, court_id)
    assert court["tie"]["visible"] is False
    assert (court["A"]["points"], court["B"]["points"]) == ("15", "30")


def test_a_match_tiebreak_comes_back(app):
    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id)
    sets = [(4, 2), (1, 4)]
    _put(client, match_id, config, _score(0, 0, sets=sets))
    _point(client, court_id, match_id, _score(0, 0, 6, 5, sets=sets, is_tiebreak=False, is_super_tiebreak=True), "A")

    court = _crash_and_restore(app, court_id)
    assert court["super_tiebreak_active"] is True
    assert (court["tie"]["A"], court["tie"]["B"]) == (6, 5)


def test_a_score_changed_elsewhere_outranks_a_stale_point_state(app):
    from wyniki.db_models import Match, db

    client = app.test_client()
    court_id = _court(app)
    match_id, config = _start(client, court_id)
    _put(client, match_id, config, _score(4, 4))
    _point(client, court_id, match_id, _score(4, 4, 5, 4, is_tiebreak=True, is_super_tiebreak=False), "B")
    with app.app_context():  # the office corrects the games; the tablet's point record no longer fits
        match = db.session.get(Match, match_id)
        match.player1_games, match.player2_games, match.player1_points, match.player2_points = 3, 2, 1, 0
        db.session.commit()

    court = _crash_and_restore(app, court_id)
    assert court["tie"]["visible"] is False
    assert (court["A"]["points"], court["B"]["points"]) == ("15", "0")
