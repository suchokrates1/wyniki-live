"""Winners come from the score, history pages, and match times survive a runaway overlay clock."""
from datetime import datetime, timezone

import pytest

from wyniki.services.match_result import resolve_match_winner, same_competitor

SETS_P2 = [
    {"set_number": 1, "player1_games": 4, "player2_games": 2},
    {"set_number": 2, "player1_games": 1, "player2_games": 4},
    {"set_number": 3, "player1_games": 7, "player2_games": 10, "is_super_tiebreak": True},
]


def test_score_beats_a_contradicting_stored_winner():
    assert resolve_match_winner(player1="Skarżyński", player2="Balčikonis", stored_winner="Skarżyński",
                                finish_reason="normal", sets_history=SETS_P2) == "Balčikonis"


def test_empty_stored_winner_is_filled_from_the_set_counters():
    assert resolve_match_winner(player1="Kokot", player2="Nowak", stored_winner="",
                                finish_reason="normal", player1_sets=0, player2_sets=2) == "Nowak"


def test_doubles_partner_order_is_the_same_team():
    assert same_competitor("Ethan Cook / Oliver Fanshawe", "Oliver Fanshawe / Ethan Cook")
    assert resolve_match_winner(player1="Oliver Fanshawe / Ethan Cook", player2="Grace Hobbs / Caroline Lane",
                                stored_winner="Ethan Cook / Oliver Fanshawe", finish_reason="normal",
                                sets_history=[{"player1_games": 4, "player2_games": 1},
                                              {"player1_games": 4, "player2_games": 3}]) == "Oliver Fanshawe / Ethan Cook"


@pytest.mark.parametrize("reason", ["walkover", "retirement"])
def test_walkover_and_retirement_keep_the_recorded_winner(reason):
    unfinished = [{"player1_games": 3, "player2_games": 1, "unfinished": True}]
    assert resolve_match_winner(player1="A", player2="B", stored_winner="B", finish_reason=reason,
                                sets_history=unfinished, player1_sets=2, player2_sets=0) == "B"


def test_no_score_and_no_stored_winner_is_no_winner():
    assert resolve_match_winner(player1="A", player2="B", finish_reason="normal", sets_history=[]) is None


def test_history_timing_prefers_the_umpire_clock_and_drops_a_runaway_one():
    from wyniki.database.history import _history_timing

    ended = "2026-08-27T16:13:55+00:00"
    created = "2026-08-27T15:34:52+00:00"
    duration, start = _history_timing(122009, 2961, None, created, ended)
    assert duration == 2961
    assert start.startswith("2026-08-27T15:24:34")

    duration, start = _history_timing(115902, None, None, created, ended)
    assert duration == 0 and start == created

    # an end time rewritten days later must not invent a start after the match was created
    duration, start = _history_timing(115778, 3206, None, created, "2026-08-29T09:08:02+00:00")
    assert duration == 3206 and start == created

    duration, start = _history_timing(0, None, "2026-09-26T10:00:00+00:00", created, "2026-09-26T11:03:00+00:00")
    assert duration == 3780 and start == "2026-09-26T10:00:00+00:00"


def test_schedule_result_names_the_winner_from_the_score():
    from wyniki.database.schedule import _schedule_match_result
    import json

    row = {"match_id": 712, "match_status": "finished", "match_winner_name": "Skarżyński / Balwierz",
           "match_finish_reason": "normal", "match_sets_history": json.dumps(SETS_P2),
           "match_player1_name": "Skarżyński / Balwierz", "match_player2_name": "Balčikonis / Damskis",
           "match_player1_sets": 1, "match_player2_sets": 2}
    assert _schedule_match_result(row)["winner_name"] == "Balčikonis / Damskis"

    row.update(match_winner_name="", match_sets_history=None, match_player1_sets=2, match_player2_sets=0)
    assert _schedule_match_result(row)["winner_name"] == "Skarżyński / Balwierz"


@pytest.fixture()
def full_app(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-results.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    settings.court_auth_grace_until = datetime(2026, 12, 31, tzinfo=timezone.utc)
    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app


def test_history_pages_with_limit_and_offset(full_app):
    from wyniki import database

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0")
        conn.commit()
    tid = database.insert_tournament("Paging Cup", "2026-09-26", "2026-09-27", active=True)
    for i in range(7):
        database.insert_match_history({
            "kort_id": f"t{tid}-1", "ended_ts": f"2026-09-26T1{i}:00:00Z", "duration_seconds": 1500,
            "player_a": f"Player {i}", "player_b": "Opponent", "score_a": [4, 4], "score_b": [1, 2],
            "category": "B1", "phase": "Grupowa", "tournament_id": tid,
        })
    client = full_app.test_client()

    first = [m["player_a"] for m in client.get("/api/history?limit=3").get_json()]
    second = [m["player_a"] for m in client.get("/api/history?limit=3&offset=3").get_json()]
    last = [m["player_a"] for m in client.get("/api/history?limit=3&offset=6").get_json()]
    assert first == ["Player 6", "Player 5", "Player 4"]
    assert second == ["Player 3", "Player 2", "Player 1"]
    assert last == ["Player 0"]
    assert len(client.get("/api/history").get_json()) == 7
    assert len(client.get("/api/history?limit=0&offset=-4").get_json()) == 1

    paged = client.get(f"/api/tournament/{tid}/history?limit=2&offset=5").get_json()
    assert [m["player_a"] for m in paged] == ["Player 1", "Player 0"]


def test_finish_takes_the_winner_from_the_score_not_the_client(full_app):
    from wyniki import database

    tid = database.insert_tournament("Winner Cup", "2026-09-26", "2026-09-27", active=True)
    database.create_tournament_courts(tid, 1)
    court_id = f"t{tid}-1"
    client = full_app.test_client()
    created = client.post("/api/matches", json={
        "court_id": court_id, "player1_name": "Malicki", "player2_name": "Dutra", "status": "in_progress",
        "client_match_uuid": "winner-uuid-1", "match_config": {"games_per_set": 4, "sets_to_win": 2},
        "score": {"player1_sets": 0, "player2_sets": 0, "player1_games": 0, "player2_games": 0,
                  "player1_points": 0, "player2_points": 0, "sets_history": []},
    })
    assert created.status_code == 201, created.get_json()
    match_id = created.get_json()["id"]
    client.put(f"/api/matches/{match_id}", json={
        "status": "in_progress", "match_config": {"games_per_set": 4, "sets_to_win": 3},
        "score": {"player1_sets": 0, "player2_sets": 2, "player1_games": 0, "player2_games": 0,
                  "player1_points": 0, "player2_points": 0, "sets_history": [
                      {"set_number": 1, "player1_games": 2, "player2_games": 4},
                      {"set_number": 2, "player1_games": 3, "player2_games": 4, "tiebreak_loser_points": 5}]},
    })
    done = client.post(f"/api/matches/{match_id}/finish", json={"finish_reason": "normal", "winner_name": "Malicki"})
    assert done.status_code == 200, done.get_json()
    assert done.get_json()["winner_name"] == "Dutra"
