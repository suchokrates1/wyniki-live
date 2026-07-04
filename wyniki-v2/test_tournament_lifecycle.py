import pytest
import json
from datetime import datetime, timedelta, timezone
from werkzeug.security import check_password_hash, generate_password_hash


@pytest.fixture()
def app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.api import admin
    from wyniki.api.admin_tournaments import blueprint as tournaments_blueprint

    database.init_db()

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(admin.blueprint)
    app.register_blueprint(tournaments_blueprint)
    return app


@pytest.fixture()
def full_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-full.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture()
def umpire_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-umpire.sqlite3"
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


def _count_table(database, table_name: str, where_clause: str = "", params=()):
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS count FROM {table_name} {where_clause}", params)
        return cursor.fetchone()["count"]


def test_create_match_stores_mobile_client_audit(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Audit Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)

    response = umpire_app_with_temp_db.test_client().post(
        "/api/matches",
        json={
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Audit Player A",
            "player2_name": "Audit Player B",
            "status": "in_progress",
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
        headers={
            "X-Forwarded-For": "203.0.113.42, 10.0.0.1",
            "User-Agent": "TennisRefereeAndroid/5",
            "X-TennisReferee-Platform": "android",
            "X-TennisReferee-App-Version": "1.2.3",
            "X-TennisReferee-Device": "Samsung SM-X200",
            "X-TennisReferee-Country": "pl",
            "X-TennisReferee-Locale": "pl-PL",
        },
    )

    assert response.status_code == 201
    match_id = response.get_json()["id"]
    with database.db_conn() as conn:
        row = conn.execute(
            """
            SELECT client_info, client_ip, client_country, client_user_agent
            FROM matches
            WHERE id = ?
            """,
            (match_id,),
        ).fetchone()

    client_info = json.loads(row["client_info"])
    assert row["client_ip"] == "203.0.113.42"
    assert row["client_country"] == "PL"
    assert row["client_user_agent"] == "TennisRefereeAndroid/5"
    assert client_info["app"]["platform"] == "android"
    assert client_info["app"]["app_version"] == "1.2.3"
    assert client_info["app"]["device"] == "Samsung SM-X200"


def test_create_match_sets_flags_from_tournament_players(umpire_app_with_temp_db):
    from wyniki import database
    from wyniki.services.court_manager import get_court_state

    tournament_id = database.insert_tournament("Flag Cup", "2026-06-10", "2026-06-11", active=True)
    database.create_tournament_courts(tournament_id, 1)
    database.insert_player(tournament_id, "Jan Kowalski", "B1", "PL", first_name="Jan", last_name="Kowalski", gender="M")
    database.insert_player(tournament_id, "Hans Mueller", "B1", "DE", first_name="Hans", last_name="Mueller", gender="M")

    client = umpire_app_with_temp_db.test_client()
    response = client.post(
        "/api/matches",
        json={
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Jan Kowalski",
            "player2_name": "Hans Mueller",
            "status": "in_progress",
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
    state = get_court_state(f"t{tournament_id}-1")
    assert state["A"]["flag_code"] == "PL"
    assert state["B"]["flag_code"] == "DE"
    assert "pl.png" in (state["A"]["flag_url"] or "")
    assert "de.png" in (state["B"]["flag_url"] or "")


def test_mobile_create_match_is_idempotent_by_client_uuid(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("UUID Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    payload = {
        "client_match_uuid": "uuid-match-1",
        "court_id": f"t{tournament_id}-1",
        "player1_name": "UUID Player A",
        "player2_name": "UUID Player B",
        "status": "in_progress",
        "score": {"sets_history": []},
    }

    first = client.post("/api/matches", json=payload)
    second = client.post("/api/matches", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["id"] == first.get_json()["id"]
    assert _count_table(database, "matches") == 1


def test_mobile_finish_test_match_skips_history_statistics_and_schedule(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Test Finish Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    player1_id = database.insert_player(tournament_id, "Test Player One", "B1", "PL", first_name="Test", last_name="Player One")
    player2_id = database.insert_player(tournament_id, "Test Player Two", "B1", "PL", first_name="Test", last_name="Player Two")
    database.save_bracket_groups(tournament_id, [{"name": "B1 — Grupa A", "players": [player1_id, player2_id]}])
    database.ensure_group_schedule_entries(tournament_id)
    client = umpire_app_with_temp_db.test_client()

    created = client.post("/api/matches", json={
        "client_match_uuid": "test-finish-uuid",
        "court_id": f"t{tournament_id}-1",
        "player1_name": "Test Player One",
        "player2_name": "Test Player Two",
        "status": "in_progress",
        "score": {"sets_history": []},
    })
    assert created.status_code == 201
    match_id = created.get_json()["id"]
    assert any(entry["match_id"] == match_id and entry["status"] == "in_progress" for entry in database.fetch_tournament_schedule(tournament_id))

    finished = client.post(f"/api/matches/{match_id}/finish", json={"finish_reason": "test"})
    stats = client.post("/api/match-statistics", json={"match_id": match_id})

    assert finished.status_code == 200
    assert finished.get_json()["finish_reason"] == "test"
    assert stats.status_code == 200
    assert database.fetch_match_history(tournament_id=tournament_id) == []
    assert _count_table(database, "match_statistics") == 0
    schedule = database.fetch_tournament_schedule(tournament_id)
    assert all(entry["match_id"] is None for entry in schedule)
    assert any(entry["status"] == "planned" for entry in schedule)


def test_mobile_finish_retirement_upserts_history_with_last_score(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Retirement Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    client = umpire_app_with_temp_db.test_client()
    created = client.post("/api/matches", json={
        "court_id": f"t{tournament_id}-1",
        "player1_name": "Healthy Player",
        "player2_name": "Injured Player",
        "status": "in_progress",
        "score": {
            "player1_sets": 1,
            "player2_sets": 0,
            "player1_games": 2,
            "player2_games": 1,
            "sets_history": [{"set_number": 1, "player1_games": 4, "player2_games": 2}],
        },
    })
    match_id = created.get_json()["id"]

    first_finish = client.post(
        f"/api/matches/{match_id}/finish",
        json={"finish_reason": "retirement", "injured_player_name": "Injured Player"},
    )
    second_finish = client.post(
        f"/api/matches/{match_id}/finish",
        json={"finish_reason": "retirement", "injured_player_name": "Injured Player"},
    )

    assert first_finish.status_code == 200
    assert second_finish.status_code == 200
    history = database.fetch_match_history(tournament_id=tournament_id)
    assert len(history) == 1
    assert history[0]["finish_reason"] == "retirement"
    assert history[0]["winner_name"] == "Healthy Player"
    assert history[0]["injured_player_name"] == "Injured Player"
    assert history[0]["sets_history"][-1]["unfinished"] is True
    assert history[0]["score_a"] == [4, 2]
    assert history[0]["score_b"] == [2, 1]


def test_mobile_finish_walkover_records_four_zero_history(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Walkover Cup", "2026-05-25", "2026-05-26", active=True)
    database.create_tournament_courts(tournament_id, 1)
    player1_id = database.insert_player(tournament_id, "Walk Player One", "B1", "PL", first_name="Walk", last_name="Player One")
    player2_id = database.insert_player(tournament_id, "Walk Player Two", "B1", "PL", first_name="Walk", last_name="Player Two")
    database.save_bracket_groups(tournament_id, [{"name": "B1 — Grupa A", "players": [player1_id, player2_id]}])
    database.ensure_group_schedule_entries(tournament_id)
    client = umpire_app_with_temp_db.test_client()
    created = client.post("/api/matches", json={
        "court_id": f"t{tournament_id}-1",
        "player1_name": "Walk Player One",
        "player2_name": "Walk Player Two",
        "status": "in_progress",
        "score": {"sets_history": []},
    })
    match_id = created.get_json()["id"]

    finished = client.post(
        f"/api/matches/{match_id}/finish",
        json={"finish_reason": "walkover", "winner_name": "Walk Player Two"},
    )

    assert finished.status_code == 200
    payload = finished.get_json()
    assert payload["finish_reason"] == "walkover"
    assert payload["winner_name"] == "Walk Player Two"
    assert payload["score"]["sets_history"] == [
        {"set_number": 1, "player1_games": 0, "player2_games": 4},
        {"set_number": 2, "player1_games": 0, "player2_games": 4},
    ]
    history = database.fetch_match_history(tournament_id=tournament_id)
    assert len(history) == 1
    assert history[0]["finish_reason"] == "walkover"
    assert history[0]["winner_name"] == "Walk Player Two"
    assert history[0]["score_a"] == [0, 0]
    assert history[0]["score_b"] == [4, 4]
    assert any(entry["match_id"] == match_id and entry["status"] == "completed" for entry in database.fetch_tournament_schedule(tournament_id))


def test_link_schedule_to_match_does_not_overwrite_different_match(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Schedule Guard Cup", "2026-05-25", "2026-05-26", active=True)
    player1_id = database.insert_player(tournament_id, "Guard Player One", "B1", "PL", first_name="Guard", last_name="Player One")
    player2_id = database.insert_player(tournament_id, "Guard Player Two", "B1", "PL", first_name="Guard", last_name="Player Two")
    database.save_bracket_groups(tournament_id, [{"name": "B1 — Grupa A", "players": [player1_id, player2_id]}])
    group_id = database.fetch_bracket_groups(tournament_id)[0]["id"]
    database.ensure_group_schedule_entries(tournament_id)

    first_link = database.link_schedule_to_match(
        tournament_id,
        101,
        player1_name="Guard Player One",
        player2_name="Guard Player Two",
        phase="Grupowa",
        bracket_group_id=group_id,
    )
    second_link = database.link_schedule_to_match(
        tournament_id,
        202,
        player1_name="Guard Player Two",
        player2_name="Guard Player One",
        phase="Grupowa",
        bracket_group_id=group_id,
    )

    assert first_link["match_id"] == 101
    assert second_link is None
    schedule = database.fetch_tournament_schedule(tournament_id)
    assert len(schedule) == 1
    assert schedule[0]["match_id"] == 101


def test_link_schedule_to_match_uses_explicit_schedule_id_before_name_heuristic(umpire_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Explicit Schedule Cup", "2026-05-29", "2026-05-29", active=True)
    database.upsert_tournament_schedule_entries(tournament_id, [
        {
            "day_date": "2026-05-29",
            "scheduled_time": "10:00",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Explicit Player One",
            "player2_name": "Explicit Player Two",
            "status": "planned",
            "sort_order": 1,
        },
        {
            "day_date": "2026-05-29",
            "scheduled_time": "11:00",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Explicit Player One",
            "player2_name": "Explicit Player Two",
            "status": "planned",
            "sort_order": 2,
        },
    ])
    schedule = database.fetch_tournament_schedule(tournament_id)
    explicit_schedule_id = schedule[1]["id"]

    linked = database.link_schedule_to_match(
        tournament_id,
        303,
        schedule_id=explicit_schedule_id,
        player1_name="Explicit Player One",
        player2_name="Explicit Player Two",
        status="in_progress",
    )

    assert linked["id"] == explicit_schedule_id
    refreshed = database.fetch_tournament_schedule(tournament_id)
    assert refreshed[0]["match_id"] is None
    assert refreshed[1]["match_id"] == 303
    assert refreshed[1]["status"] == "in_progress"


def test_mobile_suggested_match_uses_selected_court_and_nearest_time(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    tournament_id = database.insert_tournament("Suggestion Cup", "2026-05-29", "2026-05-29", active=True)
    database.insert_court(f"t{tournament_id}-1", pin="1111", tournament_id=tournament_id, name="Kort 1", display_order=1)
    database.insert_court(f"t{tournament_id}-2", pin="2222", tournament_id=tournament_id, name="Kort 2", display_order=2)
    for first_name, last_name in [
        ("Early", "One"),
        ("Early", "Two"),
        ("Nearest", "One"),
        ("Nearest", "Two"),
        ("OtherCourt", "One"),
        ("OtherCourt", "Two"),
    ]:
        database.insert_player(
            tournament_id,
            f"{first_name} {last_name}",
            "B1",
            "PL",
            first_name=first_name,
            last_name=last_name,
        )
    database.upsert_tournament_schedule_entries(tournament_id, [
        {
            "day_date": "2026-05-29",
            "scheduled_time": "09:00",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Early One",
            "player2_name": "Early Two",
            "status": "planned",
        },
        {
            "day_date": "2026-05-29",
            "scheduled_time": "10:30",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Nearest One",
            "player2_name": "Nearest Two",
            "status": "planned",
        },
        {
            "day_date": "2026-05-29",
            "scheduled_time": "10:25",
            "court_id": f"t{tournament_id}-2",
            "player1_name": "OtherCourt One",
            "player2_name": "OtherCourt Two",
            "status": "planned",
        },
    ])

    response = app.test_client().get(
        f"/api/courts/t{tournament_id}-1/suggested-match",
        query_string={"tournament_id": tournament_id, "at": "2026-05-29T10:20:00+00:00"},
    )

    assert response.status_code == 200
    suggestion = response.get_json()["suggestion"]
    assert suggestion["court_id"] == f"t{tournament_id}-1"
    assert suggestion["scheduled_time"] == "10:30"
    assert suggestion["player1_name"] == "Nearest One"
    assert suggestion["player2_name"] == "Nearest Two"
    assert suggestion["player1"]["full_name"] == "Nearest One"
    assert suggestion["player2"]["full_name"] == "Nearest Two"


def test_mobile_create_match_links_explicit_schedule_id(umpire_app_with_temp_db):
    from wyniki import database

    app = umpire_app_with_temp_db
    tournament_id = database.insert_tournament("Mobile Explicit Schedule Cup", "2026-05-29", "2026-05-29", active=True)
    database.insert_court(f"t{tournament_id}-1", pin="1111", tournament_id=tournament_id, name="Kort 1", display_order=1)
    database.upsert_tournament_schedule_entries(tournament_id, [
        {
            "day_date": "2026-05-29",
            "scheduled_time": "09:00",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Mobile Player One",
            "player2_name": "Mobile Player Two",
            "status": "planned",
            "sort_order": 1,
        },
        {
            "day_date": "2026-05-29",
            "scheduled_time": "10:30",
            "court_id": f"t{tournament_id}-1",
            "player1_name": "Mobile Player One",
            "player2_name": "Mobile Player Two",
            "status": "planned",
            "sort_order": 2,
        },
    ])
    schedule = database.fetch_tournament_schedule(tournament_id)
    schedule_id = schedule[1]["id"]

    response = app.test_client().post("/api/matches", json={
        "court_id": f"t{tournament_id}-1",
        "schedule_id": schedule_id,
        "client_match_uuid": "mobile-schedule-uuid",
        "player1_name": "Mobile Player One",
        "player2_name": "Mobile Player Two",
        "status": "in_progress",
        "score": {"sets_history": []},
    })

    assert response.status_code == 201
    created = response.get_json()
    assert created["schedule_id"] == schedule_id
    refreshed = database.fetch_tournament_schedule(tournament_id)
    assert refreshed[0]["match_id"] is None
    assert refreshed[1]["match_id"] == created["id"]
    assert refreshed[1]["status"] == "in_progress"


def test_admin_courts_show_active_tournaments_only(app_with_temp_db):
    from wyniki import database

    active_id = database.insert_tournament("Active Cup", "2026-04-26", "2026-04-27", active=True)
    inactive_id = database.insert_tournament("Inactive Cup", "2026-04-26", "2026-04-27", active=False)
    database.create_tournament_courts(active_id, 1)
    database.create_tournament_courts(inactive_id, 3)

    response = app_with_temp_db.test_client().get("/admin/api/courts")

    assert response.status_code == 200
    courts = response.get_json()
    assert len(courts) == 1
    assert courts[0]["tournament_id"] == active_id


def test_delete_tournament_removes_owned_data(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Delete Me", "2026-04-26", "2026-04-27", active=False)
    database.create_tournament_courts(tournament_id, 2)
    player_id = database.insert_player(
        tournament_id,
        "Test Player",
        "E2E",
        "PL",
        first_name="Test",
        last_name="Player",
    )

    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (f"t{tournament_id}-1", "Test Player", "Other Player", "finished", tournament_id),
        )
        match_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO match_statistics (match_id, winner, match_duration_ms, stats_mode)
            VALUES (?, ?, ?, ?)
            """,
            (match_id, "Test Player", 120000, "basic"),
        )
        cursor.execute(
            """
            INSERT INTO match_history (kort_id, ended_ts, duration_seconds, player_a, player_b, match_id, tournament_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (f"t{tournament_id}-1", "2026-04-26T00:00:00Z", 120, "Test Player", "Other Player", match_id, tournament_id),
        )
        cursor.execute(
            "INSERT INTO bracket_groups (tournament_id, name, order_num) VALUES (?, ?, ?)",
            (tournament_id, "A", 1),
        )
        group_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO bracket_group_players (group_id, player_id, player_name) VALUES (?, ?, ?)",
            (group_id, player_id, "Test Player"),
        )
        cursor.execute(
            """
            INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name)
            VALUES (?, ?, ?, ?, ?)
            """,
            (tournament_id, "final", 1, "Test Player", "Other Player"),
        )
        conn.commit()

    database.upsert_tournament_schedule_entries(
        tournament_id,
        [
            {
                "day_date": "2026-04-26",
                "scheduled_time": "10:00",
                "court_id": f"t{tournament_id}-1",
                "category_name": "E2E",
                "phase": "Grupowa",
                "player1_name": "Test Player",
                "player2_name": "Other Player",
                "status": "planned",
            }
        ],
    )

    assert database.delete_tournament(tournament_id) is True
    assert _count_table(database, "tournament_schedule", "WHERE tournament_id = ?", (tournament_id,)) == 0
    assert _count_table(database, "bracket_groups", "WHERE tournament_id = ?", (tournament_id,)) == 0


def test_public_schedule_respects_access_key_and_sorts_entries(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Private Schedule Cup",
        "2026-05-10",
        "2026-05-11",
        active=True,
        is_public=False,
        access_key="schedule-key",
    )
    database.create_tournament_courts(tournament_id, 2)
    database.upsert_tournament_schedule_entries(
        tournament_id,
        [
            {
                "day_date": "2026-05-10",
                "scheduled_time": "11:00",
                "court_id": f"t{tournament_id}-2",
                "category_name": "B1 Kobiety",
                "phase": "Grupowa",
                "player1_name": "Anna A",
                "player2_name": "Anna B",
                "status": "planned",
            },
            {
                "day_date": "2026-05-10",
                "scheduled_time": "09:00",
                "court_id": f"t{tournament_id}-1",
                "category_name": "B1 Kobiety",
                "phase": "Grupowa",
                "player1_name": "Anna C",
                "player2_name": "Anna D",
                "status": "planned",
            },
            {
                "day_date": "2026-05-10",
                "scheduled_time": "08:30",
                "court_id": f"t{tournament_id}-1",
                "category_name": "B1 Kobiety",
                "phase": "Grupowa",
                "player1_name": "Draft A",
                "player2_name": "Draft B",
                "status": "draft",
            },
        ],
    )

    client = full_app_with_temp_db.test_client()
    assert client.get(f"/api/tournament/{tournament_id}/schedule").status_code == 404

    response = client.get(f"/api/tournament/{tournament_id}/schedule?access_key=schedule-key")

    assert response.status_code == 200
    payload = response.get_json()
    matches = payload["days"][0]["categories"][0]["matches"]
    assert [match["scheduled_time"] for match in matches] == ["09:00", "11:00"]
    assert {match["status"] for match in matches} == {"planned"}


def test_admin_planning_groups_endpoint_regenerates_group_schedule(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Planning Groups Cup", "2026-05-10", "2026-05-11", active=True)
    player_ids = [
        database.insert_player(tournament_id, "Alpha One", "B1", "PL", first_name="Alpha", last_name="One", gender="M"),
        database.insert_player(tournament_id, "Alpha Two", "B1", "PL", first_name="Alpha", last_name="Two", gender="M"),
        database.insert_player(tournament_id, "Beta One", "B1", "PL", first_name="Beta", last_name="One", gender="M"),
        database.insert_player(tournament_id, "Beta Two", "B1", "PL", first_name="Beta", last_name="Two", gender="M"),
    ]

    response = full_app_with_temp_db.test_client().put(
        f"/admin/api/tournaments/{tournament_id}/bracket/groups",
        json={
            "groups": [
                {"name": "B1 Mężczyźni — Grupa A", "players": player_ids[:2]},
                {"name": "B1 Mężczyźni — Grupa B", "players": player_ids[2:]},
            ]
        },
    )

    assert response.status_code == 200
    groups = database.fetch_bracket_groups(tournament_id)
    assert [group["name"] for group in groups] == ["B1 Mężczyźni — Grupa A", "B1 Mężczyźni — Grupa B"]
    schedule = database.fetch_tournament_schedule(tournament_id)
    group_entries = [entry for entry in schedule if entry["source_type"] == "group"]
    assert len(group_entries) == 2
    assert {entry["group_name"] for entry in group_entries} == {"B1 Mężczyźni — Grupa A", "B1 Mężczyźni — Grupa B"}


def test_player_import_preview_groups_players_by_start_category(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Import Preview Cup", "2026-04-26", "2026-04-27", active=True)

    response = app_with_temp_db.test_client().post(
        f"/admin/api/tournaments/{tournament_id}/players/parse-import",
        json={
            "text": "Jan Kowalski B1M PL\nAnna Nowak B1 K\nMaria Test kobiety B2 DE\nPiotr Example B3 men"
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["count"] == 4
    assert {player["gender"] for player in payload["players"]} == {"K", "M"}
    assert {item["start_group"]: item["count"] for item in payload["summary"]} == {
        "B1K": 1,
        "B1M": 1,
        "B2K": 1,
        "B3M": 1,
    }


def test_bulk_import_players_normalizes_gender_category_and_country(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Import Bulk Cup", "2026-04-26", "2026-04-27", active=True)
    client = app_with_temp_db.test_client()

    response = client.post(
        f"/admin/api/tournaments/{tournament_id}/players/bulk",
        json={
            "players": [
                {
                    "first_name": "Anna",
                    "last_name": "Nowak",
                    "category": "b1",
                    "gender": "kobiety",
                    "country": "pl",
                },
                {
                    "first_name": "Piotr",
                    "last_name": "Kowalski",
                    "category": "B2",
                    "gender": "men",
                    "country": "de",
                },
            ]
        },
    )

    assert response.status_code == 200
    players = database.fetch_players(tournament_id)
    assert [(player["last_name"], player["category"], player["gender"], player["country"]) for player in players] == [
        ("Kowalski", "B2", "M", "DE"),
        ("Nowak", "B1", "K", "PL"),
    ]


def test_player_import_preview_supports_sectioned_start_list(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Import Sections Cup", "2026-05-22", "2026-05-24", active=True)

    text = """Ðzien dobry
Podaję listę startową Mistrzostw Polski w Blind Tenisie 22-24.05.2026
22.05 po klasyfikacji ok. 19:00 odbędzie się losowanie w kategoriach, gdzie jest zapisanych więcej niż 5 zawodników.
Ostateczny termin odwołań mija 15.05.2026 bez konsekwencji zwrotu kosztów.

B1 Kobiet
Justyna\tSzafranek
Magdalena Kokot-Rybińska
Monika\tDubiel

B1 Mężczyzn
Łukasz  Chmielewski
Rafał Sudoł
Sławomir\tTolak – Ciszewski

B2 Kobiet
Małgorzata Ignasiak
Katarzyna Pietruszyńska
Justyna Stopierzyńska

B2 Mężczyzn
Mateusz\tCiborowski
Marian\tWywiórski
Michał\tOrchowski
Mariusz\tKowalski
Łukasz\tKonklewski
Emil\tStopierzynski
Tomasz\tGawrych
Jarosław\tStopierzyński

B3 Kobiet
Kamilla  Malak
Aleksandra  Karakula
Małgorzata  Olkiewicz

B3 Mężczyzna
Damian\tHortecki
Michal\tStypa
Jakub\tMaciejewski
Piotr\tKopyciński
Tomasz\tBłoński
Marcin\tBłoński

B4 Kobiet
Oliwia\tMarciniak
Kinga\tPrzewoźna
Katarzyna\tAntczak

B4 Mężczyzna
Mateusz\tBalwierz
Zbigniew Haftka
Jarosław\tSkarżyński
Kamil\tSzulc
Miłosz\tOpoka
Michał\tStanisławski"""

    response = app_with_temp_db.test_client().post(
        f"/admin/api/tournaments/{tournament_id}/players/parse-import",
        json={"text": text},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["count"] == 35
    assert payload["needs_attention_count"] == 0
    assert {item["start_group"]: item["count"] for item in payload["summary"]} == {
        "B1K": 3,
        "B1M": 3,
        "B2K": 3,
        "B2M": 8,
        "B3K": 3,
        "B3M": 6,
        "B4K": 3,
        "B4M": 6,
    }


def test_player_import_preview_groups_b34_as_mixed_only_for_configured_tournament(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Import B34 Mixed Cup", "2026-06-10", "2026-06-12", active=True)
    database.confirm_tournament_categories(
        tournament_id,
        [{"label": "B3/4 Mixed", "hint_bands": ["B3", "B4"]}],
    )

    text = """B3/4 Mixed
Anna Kowalska
Piotr Nowak

Jan Kowalski B34M PL
Maria Test B34 K DE"""

    response = app_with_temp_db.test_client().post(
        f"/admin/api/tournaments/{tournament_id}/players/parse-import",
        json={"text": text},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["count"] == 4
    assert len(payload["tournament_categories"]) == 1
    assert {item["start_group"]: item["count"] for item in payload["summary"]} == {"B34": 4}


def test_player_import_preview_splits_b34_by_gender_without_mixed_config(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Import B34 Split Cup", "2026-06-10", "2026-06-12", active=True)

    response = app_with_temp_db.test_client().post(
        f"/admin/api/tournaments/{tournament_id}/players/parse-import",
        json={"text": "Jan Kowalski B34M PL\nMaria Test B34 K DE"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert {item["start_group"]: item["count"] for item in payload["summary"]} == {
        "B34K": 1,
        "B34M": 1,
    }


def test_player_import_preview_uses_ai_to_fill_missing_country(app_with_temp_db, monkeypatch):
    from wyniki import database
    from wyniki.api import admin_tournaments

    tournament_id = database.insert_tournament("Import AI Cup", "2026-05-22", "2026-05-24", active=True)

    monkeypatch.setattr(admin_tournaments.settings, 'import_players_ai_api_key', 'test-key')
    monkeypatch.setattr(admin_tournaments.settings, 'import_players_ai_model', 'gemini-2.5-flash')
    monkeypatch.setattr(admin_tournaments.settings, 'import_players_ai_timeout_seconds', 5)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "players": [
                                                {
                                                    "line_number": 1,
                                                    "first_name": "Jan",
                                                    "last_name": "Kowalski",
                                                    "category": "B1",
                                                    "gender": "M",
                                                    "country": "PL",
                                                    "notes": "Likely Polish player",
                                                },
                                                {
                                                    "line_number": 2,
                                                    "first_name": "Anna",
                                                    "last_name": "Nowak",
                                                    "category": "B1",
                                                    "gender": "K",
                                                    "country": "PL",
                                                    "notes": "Likely Polish player",
                                                },
                                            ]
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            }

    def fake_post(url, json=None, timeout=None):
        assert 'gemini-2.5-flash:generateContent' in url
        assert json['generationConfig']['responseMimeType'] == 'application/json'
        assert timeout == 5
        return FakeResponse()

    monkeypatch.setattr(admin_tournaments.requests, 'post', fake_post)

    response = app_with_temp_db.test_client().post(
        f"/admin/api/tournaments/{tournament_id}/players/parse-import",
        json={"text": "Jan Kowalski B1M\nAnna Nowak B1K"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['count'] == 2
    assert [player['country'] for player in payload['players']] == ['PL', 'PL']
    assert all(player['ai_assisted'] is True for player in payload['players'])
    assert all(player['warnings'] == [] for player in payload['players'])


def test_admin_create_simulation_sets_default_office_password(app_with_temp_db):
    from wyniki import database

    response = app_with_temp_db.test_client().post(
        "/admin/api/tournaments",
        json={
            "name": "Symulacja Office",
            "start_date": "2026-05-01",
            "end_date": "2026-05-02",
            "active": False,
            "court_count": 0,
            "is_simulation": True,
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    tournament = database.fetch_tournament(int(payload["id"]))
    assert tournament is not None
    assert tournament["has_office_password"] == 1

    with database.db_conn() as conn:
        row = conn.execute(
            "SELECT office_password_hash FROM tournaments WHERE id = ?",
            (int(payload["id"]),),
        ).fetchone()
    assert row is not None
    assert check_password_hash(row["office_password_hash"], "test")


def test_office_slot_auth_returns_token_and_dashboard(full_app_with_temp_db):
    from wyniki import database

    newer_id = database.insert_tournament(
        "Office New",
        "2026-06-10",
        "2026-06-12",
        active=True,
        office_password_hash=generate_password_hash("sekret"),
    )
    database.insert_tournament(
        "Office Old",
        "2026-05-10",
        "2026-05-12",
        active=True,
        office_password_hash=generate_password_hash("inne"),
    )

    client = full_app_with_temp_db.test_client()
    auth_response = client.post("/api/office/1/auth", json={"password": "sekret"})

    assert auth_response.status_code == 200
    auth_payload = auth_response.get_json()
    assert auth_payload["slot"] == 1
    assert auth_payload["tournament"]["id"] == newer_id
    assert auth_payload["token"]

    dashboard_response = client.get(
        "/api/office/1/dashboard",
        headers={"Authorization": f"Bearer {auth_payload['token']}"},
    )
    assert dashboard_response.status_code == 200
    dashboard_payload = dashboard_response.get_json()
    assert dashboard_payload["tournament"]["id"] == newer_id


def test_office_planning_configures_groups_and_schedule(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Office Planning Cup",
        "2026-06-10",
        "2026-06-12",
        active=True,
        office_password_hash=generate_password_hash("sekret"),
    )
    database.create_tournament_courts(tournament_id, 1)
    player_ids = [
        database.insert_player(tournament_id, "Alpha One", "B1", "PL", first_name="Alpha", last_name="One", gender="M"),
        database.insert_player(tournament_id, "Alpha Two", "B1", "PL", first_name="Alpha", last_name="Two", gender="M"),
        database.insert_player(tournament_id, "Beta One", "B1", "PL", first_name="Beta", last_name="One", gender="M"),
        database.insert_player(tournament_id, "Beta Two", "B1", "PL", first_name="Beta", last_name="Two", gender="M"),
    ]

    client = full_app_with_temp_db.test_client()
    assert client.get("/api/office/1/planning").status_code == 401

    auth_response = client.post("/api/office/1/auth", json={"password": "sekret"})
    assert auth_response.status_code == 200
    headers = {"Authorization": f"Bearer {auth_response.get_json()['token']}"}

    planning_response = client.get("/api/office/1/planning", headers=headers)
    assert planning_response.status_code == 200
    assert len(planning_response.get_json()["players"]) == 4

    groups_response = client.put(
        "/api/office/1/planning/groups",
        headers=headers,
        json={
            "groups": [
                {"name": "B1 Mężczyźni — Grupa A", "players": player_ids[:2]},
                {"name": "B1 Mężczyźni — Grupa B", "players": player_ids[2:]},
            ]
        },
    )
    assert groups_response.status_code == 200
    assert [group["name"] for group in groups_response.get_json()["groups"]] == [
        "B1 Mężczyźni — Grupa A",
        "B1 Mężczyźni — Grupa B",
    ]
    group_entries = [entry for entry in database.fetch_tournament_schedule(tournament_id) if entry["source_type"] == "group"]
    assert len(group_entries) == 2

    manual_response = client.post(
        "/api/office/1/schedule",
        headers=headers,
        json={
            "day_date": "2026-06-10",
            "scheduled_time": "18:00",
            "court_id": f"t{tournament_id}-1",
            "category_name": "B1 Mężczyźni",
            "phase": "Dogrywka",
            "player1_name": "Alpha One",
            "player2_name": "Beta One",
            "status": "planned",
        },
    )
    assert manual_response.status_code == 200
    manual_entry = next(entry for entry in manual_response.get_json()["schedule"] if entry["source_type"] == "manual")
    assert manual_entry["scheduled_time"] == "18:00"

    delete_response = client.delete(f"/api/office/1/schedule/{manual_entry['id']}", headers=headers)
    assert delete_response.status_code == 200
    assert all(entry["id"] != manual_entry["id"] for entry in delete_response.get_json()["schedule"])


def test_office_slot_meta_includes_simulation_after_active_tournaments(full_app_with_temp_db):
    from wyniki import database

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0, is_simulation = 0")
        conn.commit()

    active_id = database.insert_tournament(
        "Office Active",
        "2026-06-10",
        "2026-06-12",
        active=True,
        office_password_hash=generate_password_hash("aktywny"),
    )
    simulation_id = database.insert_tournament(
        "Symulacja 3 MP — etap 2",
        "2026-06-10",
        "2026-06-12",
        active=False,
        is_simulation=True,
        office_password_hash=generate_password_hash("test"),
    )

    client = full_app_with_temp_db.test_client()
    active_meta = client.get("/api/office/1/meta")
    simulation_meta = client.get("/api/office/2/meta")

    assert active_meta.status_code == 200
    assert active_meta.get_json()["tournament"]["id"] == active_id
    assert active_meta.get_json()["tournament"]["active"] is True
    assert active_meta.get_json()["tournament"]["is_simulation"] is False

    assert simulation_meta.status_code == 200
    simulation_payload = simulation_meta.get_json()
    assert simulation_payload["tournament"]["id"] == simulation_id
    assert simulation_payload["tournament"]["active"] is False
    assert simulation_payload["tournament"]["is_simulation"] is True

    auth_response = client.post("/api/office/2/auth", json={"password": "test"})
    assert auth_response.status_code == 200
    assert auth_response.get_json()["tournament"]["id"] == simulation_id


def test_init_db_backfills_missing_simulation_office_password(app_with_temp_db):
    from wyniki import database

    simulation_id = database.insert_tournament(
        "Legacy Sim",
        "2026-07-01",
        "2026-07-02",
        active=False,
        is_simulation=False,
        office_password_hash='',
    )
    assert simulation_id is not None

    with database.db_conn() as conn:
        conn.execute(
            "UPDATE tournaments SET is_simulation = 1, office_password_hash = '' WHERE id = ?",
            (simulation_id,),
        )
        conn.commit()

    database.init_db()

    with database.db_conn() as conn:
        row = conn.execute(
            "SELECT office_password_hash FROM tournaments WHERE id = ?",
            (simulation_id,),
        ).fetchone()
    assert row is not None
    assert check_password_hash(row["office_password_hash"], "test")


def test_tournament_players_are_linked_to_global_players(app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Players Cup", "2026-04-26", "2026-04-27", active=True)

    first_player_id = database.insert_player(
        tournament_id,
        "Ada Nowak",
        "B1",
        "PL",
        first_name="Ada",
        last_name="Nowak",
        gender="F",
    )
    inserted_count = database.bulk_insert_players(
        tournament_id,
        [
            {"first_name": "Ada", "last_name": "Nowak", "category": "B1", "country": "PL", "gender": "F"},
            {"name": "Jan Kowalski", "category": "B2", "country": "PL", "gender": "M"},
        ],
    )

    assert first_player_id is not None
    assert inserted_count == 2
    assert _count_table(database, "global_players") == 2

    players = database.fetch_players(tournament_id)
    assert len(players) == 3
    assert all(player["global_player_id"] for player in players)

    ada_global_ids = {player["global_player_id"] for player in players if player["last_name"] == "Nowak"}
    assert len(ada_global_ids) == 1


def test_simulation_tournament_players_are_not_linked_to_global_players(app_with_temp_db):
    from wyniki import database

    before = _count_table(database, "global_players")
    tournament_id = database.insert_tournament(
        "Simulation Players Cup",
        "2026-04-26",
        "2026-04-27",
        active=True,
        is_simulation=True,
    )
    inserted_count = database.bulk_insert_players(
        tournament_id,
        [
            {"first_name": "Test", "last_name": "Alpha", "category": "B1", "country": "PL", "gender": "M"},
            {"first_name": "Test", "last_name": "Beta", "category": "B2", "country": "PL", "gender": "K"},
        ],
    )

    assert inserted_count == 2
    assert _count_table(database, "global_players") == before

    players = database.fetch_players(tournament_id)
    assert len(players) == 2
    assert all(player["global_player_id"] is None for player in players)


def test_admin_player_routes_require_active_tournament(app_with_temp_db):
    from wyniki import database

    inactive_id = database.insert_tournament("Inactive Players", "2026-04-26", "2026-04-27", active=False)

    response = app_with_temp_db.test_client().get(f"/admin/api/tournaments/{inactive_id}/players")

    assert response.status_code == 409
    assert response.get_json()["error"] == "Tournament is inactive"


def test_admin_player_update_is_scoped_to_tournament(app_with_temp_db):
    from wyniki import database

    first_tournament = database.insert_tournament("First Cup", "2026-04-26", "2026-04-27", active=True)
    second_tournament = database.insert_tournament("Second Cup", "2026-04-26", "2026-04-27", active=True)
    player_id = database.insert_player(
        second_tournament,
        "Scoped Player",
        "B1",
        "PL",
        first_name="Scoped",
        last_name="Player",
    )

    response = app_with_temp_db.test_client().put(
        f"/admin/api/tournaments/{first_tournament}/players/{player_id}",
        json={"first_name": "Wrong", "last_name": "Tournament", "category": "B2", "country": "DE"},
    )

    assert response.status_code == 404
    unchanged = database.fetch_players(second_tournament)[0]
    assert unchanged["first_name"] == "Scoped"
    assert unchanged["country"] == "PL"


def test_mobile_created_player_is_linked_to_global_player(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Mobile Cup", "2026-04-26", "2026-04-27", active=True)
    database.upsert_court("mobile-1", pin="1234", name="1", tournament_id=tournament_id, display_order=1)

    response = full_app_with_temp_db.test_client().post(
        "/api/players",
        json={
            "kort_id": "mobile-1",
            "pin": "1234",
            "first_name": "Mobile",
            "last_name": "Player",
            "category": "B1",
            "country_code": "PL",
        },
    )

    assert response.status_code == 201
    players = database.fetch_players(tournament_id)
    assert len(players) == 1
    assert players[0]["global_player_id"] is not None
    assert _count_table(database, "global_players") == 1


def test_public_tournament_list_includes_inactive_tournaments_with_player_counts(full_app_with_temp_db):
    from wyniki import database

    active_id = database.insert_tournament("Active Public Cup", "2026-04-26", "2026-04-27", active=True)
    inactive_id = database.insert_tournament("Inactive Public Cup", "2026-03-26", "2026-03-27", active=False)
    database.insert_player(active_id, "Active Player", first_name="Active", last_name="Player", country="PL")
    database.insert_player(inactive_id, "Inactive Player", first_name="Inactive", last_name="Player", country="PL")

    response = full_app_with_temp_db.test_client().get("/api/tournament/list")

    assert response.status_code == 200
    tournaments = response.get_json()
    counts = {tournament["name"]: tournament["player_count"] for tournament in tournaments}
    assert counts["Active Public Cup"] == 1
    assert counts["Inactive Public Cup"] == 1


def test_private_simulation_is_hidden_from_public_tournament_endpoints(full_app_with_temp_db):
    from wyniki import database

    public_id = database.insert_tournament("Public Cup", "2026-04-26", "2026-04-27", active=True)
    private_id = database.insert_tournament(
        "Private Simulation",
        "2026-04-26",
        "2026-04-27",
        active=True,
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key="secret-key",
    )
    stage_id = database.insert_tournament(
        "Private Simulation — etap 2",
        "2026-04-26",
        "2026-04-27",
        active=False,
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key="secret-key",
    )
    database.insert_player(public_id, "Public Player", first_name="Public", last_name="Player", country="PL")
    database.insert_player(private_id, "Private Player", first_name="Private", last_name="Player", country="PL")
    database.insert_match_history({
        "kort_id": "private-1",
        "ended_ts": "2026-04-26T12:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Private Player",
        "player_b": "Private Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": private_id,
    })

    client = full_app_with_temp_db.test_client()
    list_response = client.get("/api/tournament/list")
    active_response = client.get("/api/tournaments/active")
    active_players_response = client.get("/api/players/active")
    hidden_bracket_response = client.get(f"/api/tournament/{private_id}/bracket")
    keyed_bracket_response = client.get(f"/api/tournament/{private_id}/bracket?access_key=secret-key")
    staged_bracket_response = client.get(f"/api/tournament/{private_id}/bracket?access_key=secret-key&etap=2")
    hidden_history_response = client.get(f"/api/tournament/{private_id}/history")
    keyed_history_response = client.get(f"/api/tournament/{private_id}/history?key=secret-key")

    assert list_response.status_code == 200
    public_names = {t["name"] for t in list_response.get_json()}
    active_names = {t["name"] for t in active_response.get_json()}
    assert "Public Cup" in public_names
    assert "Private Simulation" not in public_names
    assert "Public Cup" in active_names
    assert "Private Simulation" not in active_names
    assert {p["name"] for p in active_players_response.get_json()} == {"Public Player"}
    assert hidden_bracket_response.status_code == 404
    assert keyed_bracket_response.status_code == 200
    assert keyed_bracket_response.get_json()["tournament"]["name"] == "Private Simulation"
    assert staged_bracket_response.status_code == 200
    assert staged_bracket_response.get_json()["tournament"]["id"] == stage_id
    assert staged_bracket_response.get_json()["tournament"]["name"] == "Private Simulation — etap 2"
    assert hidden_history_response.status_code == 404
    assert keyed_history_response.status_code == 200
    assert keyed_history_response.get_json()[0]["player_a"] == "Private Player"


def test_public_history_defaults_to_active_public_tournament(full_app_with_temp_db):
    from wyniki import database

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0")
        conn.commit()

    inactive_id = database.insert_tournament("Inactive Public Cup", "2026-04-26", "2026-04-27", active=False)
    private_id = database.insert_tournament(
        "Private Simulation",
        "2026-04-26",
        "2026-04-27",
        active=True,
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key="secret-key",
    )
    active_id = database.insert_tournament("Active Public Cup", "2026-04-26", "2026-04-27", active=True)
    database.insert_match_history({
        "kort_id": "inactive-1",
        "ended_ts": "2026-04-26T10:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Inactive Player",
        "player_b": "Inactive Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": inactive_id,
    })
    database.insert_match_history({
        "kort_id": "private-1",
        "ended_ts": "2026-04-26T11:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Private Player",
        "player_b": "Private Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": private_id,
    })
    database.insert_match_history({
        "kort_id": "active-1",
        "ended_ts": "2026-04-26T12:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Active Player",
        "player_b": "Active Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": active_id,
    })

    client = full_app_with_temp_db.test_client()
    default_response = client.get("/api/history")
    inactive_response = client.get(f"/api/history?tournament_id={inactive_id}")
    private_response = client.get(f"/api/history?tournament_id={private_id}")

    assert default_response.status_code == 200
    assert [match["player_a"] for match in default_response.get_json()] == ["Active Player"]

    assert inactive_response.status_code == 200
    assert [match["player_a"] for match in inactive_response.get_json()] == ["Inactive Player"]

    assert private_response.status_code == 200
    assert private_response.get_json() == []


def test_rehydrate_live_courts_skips_stale_in_progress_matches(full_app_with_temp_db):
    from wyniki import database
    from wyniki.init_state import rehydrate_live_courts
    from wyniki.services.court_manager import COURTS, STATE_LOCK, refresh_courts_from_db

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0")
        conn.commit()

    tournament_id = database.insert_tournament("Fresh Live Cup", "2026-05-25", "2026-05-25", active=True)
    database.create_tournament_courts(tournament_id, 2)
    now = datetime.now(timezone.utc)
    stale_time = (now - timedelta(days=2)).isoformat()
    fresh_time = now.isoformat()

    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id, created_at, updated_at)
            VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
            """,
            (f"t{tournament_id}-1", "Stale A", "Stale B", tournament_id, stale_time, stale_time),
        )
        cursor.execute(
            """
            INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id, created_at, updated_at)
            VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
            """,
            (f"t{tournament_id}-2", "Fresh A", "Fresh B", tournament_id, fresh_time, fresh_time),
        )
        conn.commit()

    with STATE_LOCK:
        COURTS.clear()
    refresh_courts_from_db(database.fetch_courts(active_only=True), seed_if_empty=False)

    with full_app_with_temp_db.app_context():
        restored = rehydrate_live_courts()

    assert restored == 1
    assert COURTS[f"t{tournament_id}-1"]["match_status"]["active"] is False
    assert COURTS[f"t{tournament_id}-2"]["match_status"]["active"] is True
    assert COURTS[f"t{tournament_id}-2"]["A"]["surname"] == "Fresh A"


def test_stats_disabled_tournament_does_not_count_in_public_player_stats(full_app_with_temp_db):
    from wyniki import database

    public_id = database.insert_tournament("Stats Cup", "2026-04-26", "2026-04-27", active=True)
    simulation_id = database.insert_tournament(
        "Stats Simulation",
        "2026-04-26",
        "2026-04-27",
        active=False,
        is_public=False,
        stats_enabled=False,
        is_simulation=True,
        access_key="stats-key",
    )
    public_player_id = database.insert_player(
        public_id,
        "Ada Nowak",
        "B1",
        "PL",
        first_name="Ada",
        last_name="Nowak",
        gender="F",
    )
    database.insert_player(
        simulation_id,
        "Ada Nowak",
        "B1",
        "PL",
        first_name="Ada",
        last_name="Nowak",
        gender="F",
    )
    database.insert_match_history({
        "kort_id": "public-1",
        "ended_ts": "2026-04-26T10:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Ada Nowak",
        "player_b": "Public Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": public_id,
    })
    database.insert_match_history({
        "kort_id": "sim-1",
        "ended_ts": "2026-04-26T11:00:00Z",
        "duration_seconds": 1200,
        "player_a": "Ada Nowak",
        "player_b": "Simulation Opponent",
        "score_a": [4, 4],
        "score_b": [1, 2],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": simulation_id,
    })

    public_player = next(p for p in database.fetch_players(public_id) if p["id"] == public_player_id)
    client = full_app_with_temp_db.test_client()

    players_response = client.get("/api/players/all")
    profile_response = client.get(f"/api/players/{public_player['global_player_id']}/profile?global=1")
    admin_global_response = client.get(f"/admin/api/global-players/{public_player['global_player_id']}")

    assert players_response.status_code == 200
    players = players_response.get_json()
    ada = next(player for player in players if player["name"] == "Ada Nowak")
    assert ada["matches_played"] == 1
    assert ada["wins"] == 1

    assert profile_response.status_code == 200
    profile = profile_response.get_json()
    assert profile["career"]["tournaments"] == 1
    assert profile["career"]["matches"] == 1
    assert [t["tournament_name"] for t in profile["tournaments"]] == ["Stats Cup"]

    assert admin_global_response.status_code == 200
    assert admin_global_response.get_json()["tournaments_count"] == 1


def test_group_completion_auto_generates_category_knockout_and_prefixed_semifinals_advance(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Auto Bracket Cup", "2026-04-26", "2026-04-27", active=True)

    players_by_group = {
        "B1 Kobiety — Grupa A": [
            database.insert_player(tournament_id, "Anna A1", "B1 Kobiety", "PL", first_name="Anna", last_name="A1"),
            database.insert_player(tournament_id, "Anna A2", "B1 Kobiety", "PL", first_name="Anna", last_name="A2"),
        ],
        "B1 Kobiety — Grupa B": [
            database.insert_player(tournament_id, "Anna B1", "B1 Kobiety", "PL", first_name="Anna", last_name="B1"),
            database.insert_player(tournament_id, "Anna B2", "B1 Kobiety", "PL", first_name="Anna", last_name="B2"),
        ],
        "B2 Mężczyźni — Grupa A": [
            database.insert_player(tournament_id, "Bartek A1", "B2 Mężczyźni", "PL", first_name="Bartek", last_name="A1"),
            database.insert_player(tournament_id, "Bartek A2", "B2 Mężczyźni", "PL", first_name="Bartek", last_name="A2"),
        ],
        "B2 Mężczyźni — Grupa B": [
            database.insert_player(tournament_id, "Bartek B1", "B2 Mężczyźni", "PL", first_name="Bartek", last_name="B1"),
            database.insert_player(tournament_id, "Bartek B2", "B2 Mężczyźni", "PL", first_name="Bartek", last_name="B2"),
        ],
    }
    database.save_bracket_groups(
        tournament_id,
        [{"name": group_name, "players": player_ids} for group_name, player_ids in players_by_group.items()],
    )
    group_ids = {group["name"]: group["id"] for group in database.fetch_bracket_groups(tournament_id)}

    with database.db_conn() as conn:
        cursor = conn.cursor()

        def insert_finished_match(player1: str, player2: str, phase: str, player1_sets: int, player2_sets: int, created_at: str, group_name: str | None = None) -> int:
            if player1_sets > player2_sets:
                set1 = {"set_number": 1, "player1_games": 4, "player2_games": 1}
                set2 = {"set_number": 2, "player1_games": 4, "player2_games": 2}
            else:
                set1 = {"set_number": 1, "player1_games": 1, "player2_games": 4}
                set2 = {"set_number": 2, "player1_games": 2, "player2_games": 4}
            cursor.execute(
                """
                INSERT INTO matches (
                    court_id, player1_name, player2_name, status, tournament_id, bracket_group_id, phase,
                    player1_sets, player2_sets, sets_history, created_at, updated_at
                ) VALUES (?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"t{tournament_id}-1",
                    player1,
                    player2,
                    tournament_id,
                    group_ids.get(group_name),
                    phase,
                    player1_sets,
                    player2_sets,
                    json.dumps([set1, set2]),
                    created_at,
                    created_at,
                ),
            )
            return cursor.lastrowid

        insert_finished_match("Anna A1", "Anna A2", "Grupowa", 2, 0, "2026-04-26T09:00:00", "B1 Kobiety — Grupa A")
        insert_finished_match("Anna B1", "Anna B2", "Grupowa", 0, 2, "2026-04-26T10:00:00", "B1 Kobiety — Grupa B")
        insert_finished_match("Bartek A1", "Bartek A2", "Grupowa", 2, 0, "2026-04-26T11:00:00", "B2 Mężczyźni — Grupa A")
        conn.commit()

    pending = database.maybe_generate_knockout_from_completed_groups(tournament_id)
    assert pending["status"] == "pending"
    assert database.fetch_bracket_knockout(tournament_id) == []

    with database.db_conn() as conn:
        cursor = conn.cursor()
        insert_finished_match("Bartek B1", "Bartek B2", "Grupowa", 2, 0, "2026-04-26T12:00:00", "B2 Mężczyźni — Grupa B")
        conn.commit()

    generated = database.maybe_generate_knockout_from_completed_groups(tournament_id)
    assert generated["status"] == "ok"

    knockout_slots = database.fetch_bracket_knockout(tournament_id)
    assert len(knockout_slots) == 8
    b1_semis = [slot for slot in knockout_slots if slot["phase"] == "B1 Kobiety — Półfinał"]
    b2_semis = [slot for slot in knockout_slots if slot["phase"] == "B2 Mężczyźni — Półfinał"]
    assert {(slot["player1_name"], slot["player2_name"]) for slot in b1_semis} == {
        ("Anna A1", "Anna B1"),
        ("Anna B2", "Anna A2"),
    }
    assert {(slot["player1_name"], slot["player2_name"]) for slot in b2_semis} == {
        ("Bartek A1", "Bartek B2"),
        ("Bartek B1", "Bartek A2"),
    }

    with database.db_conn() as conn:
        cursor = conn.cursor()
        semifinal_slot = next(slot for slot in knockout_slots if slot["phase"] == "B1 Kobiety — Półfinał" and slot["position"] == 1)
        cursor.execute(
            """
            UPDATE bracket_knockout
            SET player1_name = ?, player2_name = ?
            WHERE tournament_id = ? AND phase = ? AND position = 1
            """,
            ("Zwycięzca PF1", "Zwycięzca PF2", tournament_id, "B1 Kobiety — Finał"),
        )
        cursor.execute(
            """
            UPDATE bracket_knockout
            SET player1_name = ?, player2_name = ?
            WHERE tournament_id = ? AND phase = ? AND position = 1
            """,
            ("Przegrany PF1", "Przegrany PF2", tournament_id, "B1 Kobiety — o 3. miejsce"),
        )
        match_id = insert_finished_match(
            semifinal_slot["player1_name"],
            semifinal_slot["player2_name"],
            "Pucharowa",
            2,
            0,
            "2026-04-26T13:00:00",
        )
        conn.commit()

    with full_app_with_temp_db.app_context():
        assert database.advance_knockout(match_id, tournament_id) is True

    refreshed_slots = database.fetch_bracket_knockout(tournament_id)
    b1_sf1 = next(slot for slot in refreshed_slots if slot["phase"] == "B1 Kobiety — Półfinał" and slot["position"] == 1)
    b1_final = next(slot for slot in refreshed_slots if slot["phase"] == "B1 Kobiety — Finał")
    b1_third = next(slot for slot in refreshed_slots if slot["phase"] == "B1 Kobiety — o 3. miejsce")
    assert b1_sf1["winner_name"] == "Anna A1"
    assert b1_final["player1_name"] == "Anna A1"
    assert b1_third["player1_name"] == "Anna B1"


def test_schedule_office_and_knockout_flow_reaches_winners(full_app_with_temp_db):
    from wyniki import database

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0, is_simulation = 0")
        conn.commit()

    tournament_id = database.insert_tournament(
        "Schedule Flow Cup",
        "2026-05-10",
        "2026-05-11",
        active=True,
        office_password_hash=generate_password_hash("plan"),
    )
    courts = database.create_tournament_courts(tournament_id, 2)
    players = {
        "Alpha One": database.insert_player(tournament_id, "Alpha One", "B1", "PL", first_name="Alpha", last_name="One"),
        "Alpha Two": database.insert_player(tournament_id, "Alpha Two", "B1", "PL", first_name="Alpha", last_name="Two"),
        "Beta One": database.insert_player(tournament_id, "Beta One", "B1", "PL", first_name="Beta", last_name="One"),
        "Beta Two": database.insert_player(tournament_id, "Beta Two", "B1", "PL", first_name="Beta", last_name="Two"),
    }
    assert database.save_bracket_groups(
        tournament_id,
        [
            {"name": "B1 — Grupa A", "players": [players["Alpha One"], players["Alpha Two"]]},
            {"name": "B1 — Grupa B", "players": [players["Beta One"], players["Beta Two"]]},
        ],
    ) is True

    initial_schedule = database.fetch_tournament_schedule(tournament_id)
    group_entries = [entry for entry in initial_schedule if entry["source_type"] == "group"]
    assert len(group_entries) == 2
    assert {entry["status"] for entry in group_entries} == {"draft"}

    client = full_app_with_temp_db.test_client()
    auth_response = client.post("/api/office/1/auth", json={"password": "plan"})
    assert auth_response.status_code == 200
    token = auth_response.get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    first_entry = group_entries[0]
    schedule_update = client.patch(
        f"/api/office/1/schedule/{first_entry['id']}",
        headers=headers,
        json={
            "day_date": "2026-05-10",
            "scheduled_time": "09:30",
            "court_id": courts[0],
            "status": "planned",
            "notes_public": "Godzina orientacyjna",
        },
    )
    assert schedule_update.status_code == 200
    assert schedule_update.get_json()["schedule_entry"]["court_id"] == courts[0]

    public_schedule = client.get(f"/api/tournament/{tournament_id}/schedule")
    assert public_schedule.status_code == 200
    public_days = public_schedule.get_json()["days"]
    assert len(public_days) == 1
    public_matches = public_days[0]["categories"][0]["matches"]
    assert len(public_matches) == 1
    assert public_matches[0]["status"] == "planned"

    groups = database.fetch_bracket_groups(tournament_id)
    group_ids = {group["name"]: group["id"] for group in groups}

    def add_office_group_result(group_name: str, player1: str, player2: str):
        return client.post(
            "/api/office/1/group-matches",
            headers=headers,
            json={
                "group_id": group_ids[group_name],
                "player1_name": player1,
                "player2_name": player2,
                "sets": [
                    {"player1_games": 4, "player2_games": 1},
                    {"player1_games": 4, "player2_games": 2},
                ],
            },
        )

    first_group_result = add_office_group_result("B1 — Grupa A", "Alpha One", "Alpha Two")
    assert first_group_result.status_code == 201
    assert first_group_result.get_json()["knockout_generation"]["status"] == "pending"

    second_group_result = add_office_group_result("B1 — Grupa B", "Beta One", "Beta Two")
    assert second_group_result.status_code == 201
    assert second_group_result.get_json()["knockout_generation"]["status"] == "ok"

    schedule_after_groups = database.fetch_tournament_schedule(tournament_id)
    assert len([entry for entry in schedule_after_groups if entry["source_type"] == "group" and entry["status"] == "completed"]) == 2
    semifinal_entries = [entry for entry in schedule_after_groups if entry["source_type"] == "knockout" and "Półfinał" in entry["phase"]]
    assert len(semifinal_entries) == 2

    semifinal_update = client.patch(
        f"/api/office/1/schedule/{semifinal_entries[0]['id']}",
        headers=headers,
        json={"day_date": "2026-05-10", "scheduled_time": "12:00", "court_id": courts[1], "status": "planned"},
    )
    assert semifinal_update.status_code == 200

    from wyniki.db_models import Match, db

    def create_finished_knockout_match(player1: str, player2: str, player1_wins: bool, stamp: str) -> int:
        if player1_wins:
            player1_sets, player2_sets = 2, 0
            sets_history = [
                {"set_number": 1, "player1_games": 4, "player2_games": 1},
                {"set_number": 2, "player1_games": 4, "player2_games": 2},
            ]
        else:
            player1_sets, player2_sets = 0, 2
            sets_history = [
                {"set_number": 1, "player1_games": 1, "player2_games": 4},
                {"set_number": 2, "player1_games": 2, "player2_games": 4},
            ]
        match = Match(
            court_id=courts[0],
            player1_name=player1,
            player2_name=player2,
            status="finished",
            tournament_id=tournament_id,
            phase="Pucharowa",
            player1_sets=player1_sets,
            player2_sets=player2_sets,
            sets_history=json.dumps(sets_history),
            created_at=stamp,
            updated_at=stamp,
        )
        db.session.add(match)
        db.session.commit()
        return match.id

    with full_app_with_temp_db.app_context():
        assert database.advance_knockout(
            create_finished_knockout_match("Alpha One", "Beta Two", True, "2026-05-10T12:00:00"),
            tournament_id,
        ) is True
        assert database.advance_knockout(
            create_finished_knockout_match("Beta One", "Alpha Two", True, "2026-05-10T13:00:00"),
            tournament_id,
        ) is True

    schedule_after_semis = database.fetch_tournament_schedule(tournament_id)
    final_entry = next(entry for entry in schedule_after_semis if entry["source_type"] == "knockout" and entry["phase"] == "B1 — Finał")
    third_entry = next(entry for entry in schedule_after_semis if entry["source_type"] == "knockout" and entry["phase"] == "B1 — o 3. miejsce")
    assert (final_entry["player1_name"], final_entry["player2_name"]) == ("Alpha One", "Beta One")
    assert (third_entry["player1_name"], third_entry["player2_name"]) == ("Beta Two", "Alpha Two")

    client.patch(
        f"/api/office/1/schedule/{final_entry['id']}",
        headers=headers,
        json={"day_date": "2026-05-10", "scheduled_time": "15:00", "court_id": courts[0], "status": "planned"},
    )
    client.patch(
        f"/api/office/1/schedule/{third_entry['id']}",
        headers=headers,
        json={"day_date": "2026-05-10", "scheduled_time": "14:30", "court_id": courts[1], "status": "planned"},
    )

    with full_app_with_temp_db.app_context():
        assert database.advance_knockout(
            create_finished_knockout_match("Alpha One", "Beta One", True, "2026-05-10T15:00:00"),
            tournament_id,
        ) is True
        assert database.advance_knockout(
            create_finished_knockout_match("Beta Two", "Alpha Two", True, "2026-05-10T14:30:00"),
            tournament_id,
        ) is True

    final_slots = database.fetch_bracket_knockout(tournament_id)
    final_slot = next(slot for slot in final_slots if slot["phase"] == "B1 — Finał")
    third_slot = next(slot for slot in final_slots if slot["phase"] == "B1 — o 3. miejsce")
    assert final_slot["winner_name"] == "Alpha One"
    assert third_slot["winner_name"] == "Beta Two"

    office_dashboard = client.get("/api/office/1/dashboard", headers=headers)
    assert office_dashboard.status_code == 200
    office_schedule = office_dashboard.get_json()["schedule"]
    assert any(entry["phase"] == "B1 — Finał" and entry["status"] == "completed" for entry in office_schedule)
    assert any(entry["phase"] == "B1 — o 3. miejsce" and entry["status"] == "completed" for entry in office_schedule)


def test_office_dashboard_exposes_and_closes_generated_knockout_slot(full_app_with_temp_db):
    from wyniki import database

    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0, is_simulation = 0")
        conn.commit()

    tournament_id = database.insert_tournament(
        "Office Knockout Cup",
        "2026-05-12",
        "2026-05-12",
        active=True,
        office_password_hash=generate_password_hash("office"),
    )
    court_id = database.create_tournament_courts(tournament_id, 1)[0]
    assert database.save_bracket_knockout(
        tournament_id,
        [
            {
                "phase": "B1 — Półfinał",
                "position": 1,
                "player1_name": "Alpha One",
                "player2_name": "Beta Two",
            }
        ],
    ) is True
    database.ensure_knockout_schedule_entries(tournament_id)

    client = full_app_with_temp_db.test_client()
    auth_response = client.post("/api/office/1/auth", json={"password": "office"})
    assert auth_response.status_code == 200
    headers = {"Authorization": f"Bearer {auth_response.get_json()['token']}"}

    dashboard_response = client.get("/api/office/1/dashboard", headers=headers)
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.get_json()
    knockout_progress = dashboard["progress"]["knockout"]
    assert knockout_progress["expected_matches"] == 1
    assert knockout_progress["finished_matches"] == 0
    assert knockout_progress["remaining_matches"] == 1
    slot = knockout_progress["matches"][0]
    assert slot["phase"] == "B1 — Półfinał"
    assert slot["source_type"] == "knockout"
    assert slot["schedule_id"]
    assert slot["match_id"] is None

    result_response = client.post(
        "/api/office/1/knockout-matches",
        headers=headers,
        json={
            "schedule_id": slot["schedule_id"],
            "court_id": court_id,
            "sets": [
                {"player1_games": 4, "player2_games": 1},
                {"player1_games": 4, "player2_games": 2},
            ],
        },
    )
    assert result_response.status_code == 201
    result_payload = result_response.get_json()
    assert result_payload["match"]["phase"] == "B1 — Półfinał"
    assert result_payload["match"]["winner_name"] == "Alpha One"
    updated_knockout = result_payload["dashboard"]["progress"]["knockout"]
    assert updated_knockout["finished_matches"] == 1
    assert updated_knockout["remaining_matches"] == 0
    assert updated_knockout["matches"][0]["status"] == "completed"
    assert updated_knockout["matches"][0]["winner_name"] == "Alpha One"

    schedule = database.fetch_tournament_schedule(tournament_id)
    linked_entry = next(entry for entry in schedule if int(entry["id"]) == int(slot["schedule_id"]))
    assert linked_entry["status"] == "completed"
    assert linked_entry["match_id"] == result_payload["match"]["match_id"]
    bracket_slot = database.fetch_bracket_knockout(tournament_id)[0]
    assert bracket_slot["winner_name"] == "Alpha One"


def test_tournament_office_dashboard_adds_walkover_and_edits_result(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Office Cup", "2026-04-26", "2026-04-27", active=True)
    player1_id = database.insert_player(
        tournament_id,
        "Office Player One",
        "B1",
        "PL",
        first_name="Office",
        last_name="Player One",
    )
    player2_id = database.insert_player(
        tournament_id,
        "Office Player Two",
        "B1",
        "PL",
        first_name="Office",
        last_name="Player Two",
    )
    database.save_bracket_groups(
        tournament_id,
        [{"name": "B1 — Grupa A", "players": [player1_id, player2_id]}],
    )
    group_id = database.fetch_bracket_groups(tournament_id)[0]["id"]
    client = full_app_with_temp_db.test_client()

    initial = client.get(f"/admin/api/tournaments/{tournament_id}/office")
    assert initial.status_code == 200
    assert initial.get_json()["progress"]["expected_matches"] == 1
    assert initial.get_json()["progress"]["finished_matches"] == 0

    created = client.post(
        f"/admin/api/tournaments/{tournament_id}/office/group-matches",
        json={
            "group_id": group_id,
            "player1_name": "Office Player One",
            "player2_name": "Office Player Two",
            "walkover": True,
            "winner_name": "Office Player Two",
        },
    )
    assert created.status_code == 201
    created_payload = created.get_json()
    assert created_payload["dashboard"]["progress"]["finished_matches"] == 1
    assert created_payload["dashboard"]["progress"]["complete"] is True
    match_id = created_payload["match"]["id"]
    assert created_payload["match"]["score_text"] == "0:4  0:4"

    duplicate = client.post(
        f"/admin/api/tournaments/{tournament_id}/office/group-matches",
        json={
            "group_id": group_id,
            "player1_name": "Office Player Two",
            "player2_name": "Office Player One",
            "sets": [
                {"player1_games": 4, "player2_games": 0},
                {"player1_games": 4, "player2_games": 0},
            ],
        },
    )
    assert duplicate.status_code == 409

    edited = client.put(
        f"/admin/api/tournaments/{tournament_id}/office/matches/{match_id}",
        json={
            "sets": [
                {"player1_games": 4, "player2_games": 1},
                {"player1_games": 4, "player2_games": 2},
            ],
        },
    )
    assert edited.status_code == 200
    edited_payload = edited.get_json()
    assert edited_payload["match"]["winner_name"] == "Office Player One"
    assert edited_payload["match"]["score_text"] == "4:1  4:2"

    history = database.fetch_match_history(limit=10, tournament_id=tournament_id)
    assert len(history) == 1
    assert history[0]["match_id"] == match_id
    assert history[0]["score_a"] == [4, 4]
    assert history[0]["score_b"] == [1, 2]


def test_tournament_office_dashboard_uses_legacy_match_history_when_matches_are_missing(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Legacy Office Cup", "2026-04-26", "2026-04-27", active=True)
    player1_id = database.insert_player(
        tournament_id,
        "Legacy Player One",
        "B1",
        "PL",
        first_name="Legacy",
        last_name="Player One",
    )
    player2_id = database.insert_player(
        tournament_id,
        "Legacy Player Two",
        "B1",
        "PL",
        first_name="Legacy",
        last_name="Player Two",
    )
    player3_id = database.insert_player(
        tournament_id,
        "Legacy Player Three",
        "B1",
        "PL",
        first_name="Legacy",
        last_name="Player Three",
    )
    database.save_bracket_groups(
        tournament_id,
        [{"name": "B1 — Grupa A", "players": [player1_id, player2_id, player3_id]}],
    )
    database.insert_match_history({
        "kort_id": "legacy-1",
        "ended_ts": "2026-04-26T10:00:00Z",
        "duration_seconds": 1800,
        "player_a": "Legacy Player One",
        "player_b": "Legacy Player Two",
        "score_a": [4, 4],
        "score_b": [2, 1],
        "category": "B1",
        "phase": "Grupowa",
        "tournament_id": tournament_id,
    })

    client = full_app_with_temp_db.test_client()
    dashboard = client.get(f"/admin/api/tournaments/{tournament_id}/office")

    assert dashboard.status_code == 200
    payload = dashboard.get_json()
    assert payload["progress"]["expected_matches"] == 3
    assert payload["progress"]["finished_matches"] == 1
    assert payload["progress"]["remaining_matches"] == 2
    assert payload["matches"][0]["source"] == "history"
    assert payload["matches"][0]["group_name"] == "B1 — Grupa A"
    assert payload["matches"][0]["score_text"] == "4:2  4:1"

    history_id = payload["matches"][0]["id"]
    edited = client.put(
        f"/admin/api/tournaments/{tournament_id}/office/matches/{history_id}",
        json={
            "source": "history",
            "sets": [
                {"player1_games": 4, "player2_games": 0},
                {"player1_games": 4, "player2_games": 3},
            ],
        },
    )

    assert edited.status_code == 200
    edited_payload = edited.get_json()
    assert edited_payload["match"]["source"] == "history"
    assert edited_payload["match"]["score_text"] == "4:0  4:3"


def test_tournament_office_dashboard_infers_group_for_matches_without_bracket_group_id(full_app_with_temp_db):
    from wyniki import database
    from wyniki.db_models import Match, db

    tournament_id = database.insert_tournament("Simulation Office Cup", "2026-04-26", "2026-04-27", active=False)
    player1_id = database.insert_player(tournament_id, "Sim Player One", "B1", "PL", first_name="Sim", last_name="One")
    player2_id = database.insert_player(tournament_id, "Sim Player Two", "B1", "PL", first_name="Sim", last_name="Two")
    player3_id = database.insert_player(tournament_id, "Sim Player Three", "B1", "PL", first_name="Sim", last_name="Three")
    database.save_bracket_groups(
        tournament_id,
        [{"name": "B1 — Grupa A", "players": [player1_id, player2_id, player3_id]}],
    )

    with full_app_with_temp_db.app_context():
        match = Match(
            court_id="SIM-1",
            player1_name="Sim Player One",
            player2_name="Sim Player Two",
            status='finished',
            tournament_id=tournament_id,
            bracket_group_id=None,
            phase='Grupowa',
            player1_sets=2,
            player2_sets=0,
            sets_history=json.dumps([
                {"set_number": 1, "player1_games": 4, "player2_games": 2},
                {"set_number": 2, "player1_games": 4, "player2_games": 1},
            ]),
            created_at='2026-04-26T10:00:00Z',
            updated_at='2026-04-26T10:00:00Z',
        )
        db.session.add(match)
        db.session.commit()

    client = full_app_with_temp_db.test_client()
    dashboard = client.get(f"/admin/api/tournaments/{tournament_id}/office")

    assert dashboard.status_code == 200
    payload = dashboard.get_json()
    assert payload["progress"]["expected_matches"] == 3
    assert payload["progress"]["finished_matches"] == 1
    assert payload["matches"][0]["source"] == "match"
    assert payload["matches"][0]["group_name"] == "B1 — Grupa A"
    assert payload["matches"][0]["bracket_group_id"] is not None


def test_office_autoschedule_generate_apply_and_move(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Autoschedule Cup",
        "2026-06-10",
        "2026-06-12",
        active=True,
        office_password_hash=generate_password_hash("auto"),
    )
    database.create_tournament_courts(tournament_id, 2)
    # B1 (court should become the longer-slot court) and B2 players.
    b1 = [
        database.insert_player(tournament_id, "B1 One", "B1", "PL", first_name="B1", last_name="One", gender="M"),
        database.insert_player(tournament_id, "B1 Two", "B1", "PL", first_name="B1", last_name="Two", gender="M"),
        database.insert_player(tournament_id, "B1 Three", "B1", "PL", first_name="B1", last_name="Three", gender="M"),
    ]
    b2 = [
        database.insert_player(tournament_id, "B2 One", "B2", "PL", first_name="B2", last_name="One", gender="M"),
        database.insert_player(tournament_id, "B2 Two", "B2", "PL", first_name="B2", last_name="Two", gender="M"),
    ]

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "auto"})
    assert auth.status_code == 200
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    database.save_bracket_groups(
        tournament_id,
        [
            {"name": "B1 Mężczyźni — Grupa A", "players": b1},
            {"name": "B2 Mężczyźni — Grupa A", "players": b2},
        ],
    )

    # Config endpoint: two courts, B1 mapped to the last court with a 75-min slot.
    config_resp = client.get("/api/office/1/autoschedule/config", headers=headers)
    assert config_resp.status_code == 200
    config_payload = config_resp.get_json()
    assert len(config_payload["courts"]) == 2
    assert config_payload["config"]["slot_minutes"]["B1"] == 75
    assert set(config_payload["bands"]) == {"B1", "B2"}

    courts = [court["kort_id"] for court in config_payload["courts"]]

    # Generate proposal.
    gen = client.post(
        "/api/office/1/autoschedule/generate",
        headers=headers,
        json={"start_time": "09:30", "b1_court_id": courts[-1], "day_date": "2026-06-10"},
    )
    assert gen.status_code == 200
    proposal = gen.get_json()
    placements = proposal["placements"]
    assert placements, "expected placements"
    # B1 entries should land on the chosen B1 court with 75-min cascade.
    b1_placements = sorted(
        [p for p in placements if (p["band"] == "B1" and p["scheduled_time"])],
        key=lambda p: p["scheduled_time"],
    )
    assert len(b1_placements) == 3  # round robin of 3 players = 3 matches
    assert all(p["court_id"] == courts[-1] for p in b1_placements)
    assert b1_placements[0]["scheduled_time"] == "09:30"
    assert b1_placements[1]["scheduled_time"] == "10:45"  # +75

    # Apply the proposal.
    applied = client.post(
        "/api/office/1/autoschedule/apply",
        headers=headers,
        json={"placements": placements},
    )
    assert applied.status_code == 200
    schedule = applied.get_json()["schedule"]
    b1_entries = sorted(
        [e for e in schedule if e["scheduled_time"] and "B1" in (e["category_name"] or "")],
        key=lambda e: e["scheduled_time"],
    )
    assert b1_entries[0]["scheduled_time"] == "09:30"
    assert b1_entries[0]["status"] == "planned"

    # Move the first B1 entry later and check the court re-cascades.
    target = b1_entries[0]
    moved = client.post(
        "/api/office/1/autoschedule/move",
        headers=headers,
        json={"schedule_id": target["id"], "court_id": courts[-1], "scheduled_time": "11:00"},
    )
    assert moved.status_code == 200
    moved_schedule = moved.get_json()["schedule"]
    # The moved match is pinned at its drop time; the match after it cascades by one slot.
    moved_entry = next(e for e in moved_schedule if e["id"] == target["id"])
    assert moved_entry["scheduled_time"] == "11:00"
    later_b1 = sorted(
        e["scheduled_time"]
        for e in moved_schedule
        if e["scheduled_time"] and "B1" in (e["category_name"] or "") and e["scheduled_time"] > "11:00"
    )
    assert later_b1 and later_b1[0] == "12:15"  # +75 cascade after the moved match


def test_office_schedule_publish_promotes_draft_entries(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Publish Cup",
        "2026-06-10",
        "2026-06-11",
        active=True,
        office_password_hash=generate_password_hash("pub"),
    )
    database.create_tournament_courts(tournament_id, 1)
    players = [
        database.insert_player(tournament_id, "P One", "B1", "PL", first_name="P", last_name="One", gender="M"),
        database.insert_player(tournament_id, "P Two", "B1", "PL", first_name="P", last_name="Two", gender="M"),
        database.insert_player(tournament_id, "P Three", "B1", "PL", first_name="P", last_name="Three", gender="M"),
    ]

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "pub"})
    assert auth.status_code == 200
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    database.save_bracket_groups(tournament_id, [{"name": "B1 Mężczyźni — Grupa A", "players": players}])

    generated = client.post("/api/office/1/schedule/generate", headers=headers)
    assert generated.status_code == 200
    draft_schedule = generated.get_json()["schedule"]
    assert draft_schedule, "expected generated draft entries"
    assert any(entry["status"] == "draft" for entry in draft_schedule)

    published = client.post("/api/office/1/schedule/publish", headers=headers, json={})
    assert published.status_code == 200
    payload = published.get_json()
    assert payload["published"] >= 1
    assert all(entry["status"] != "draft" for entry in payload["schedule"])
    assert all(entry["status"] == "planned" for entry in payload["schedule"])


def test_office_autoschedule_knockout_phase_with_placeholders(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Knockout Auto Cup",
        "2026-06-10",
        "2026-06-12",
        active=True,
        office_password_hash=generate_password_hash("ko"),
    )
    database.create_tournament_courts(tournament_id, 2)
    for idx in range(4):
        database.insert_player(tournament_id, f"B1 P{idx}", "B1", "PL", first_name="B1", last_name=f"P{idx}", gender="M")

    # Semifinal with real players (placed), final left empty (placeholder, still placed).
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name) VALUES (?, ?, ?, ?, ?)",
            (tournament_id, "B1 Mężczyźni — Półfinał", 1, "B1 P0", "B1 P1"),
        )
        cursor.execute(
            "INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name) VALUES (?, ?, ?, ?, ?)",
            (tournament_id, "B1 Mężczyźni — Finał", 1, "", ""),
        )
        conn.commit()

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "ko"})
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    courts = [c["kort_id"] for c in database.fetch_courts_for_tournament(tournament_id)]
    gen = client.post(
        "/api/office/1/autoschedule/generate",
        headers=headers,
        json={"start_time": "09:00", "b1_court_id": courts[-1], "day_date": "2026-06-12", "phases": ["knockout"]},
    )
    assert gen.status_code == 200
    placements = [p for p in gen.get_json()["placements"] if p["scheduled_time"]]
    # Only knockout entries (no group entries exist anyway), all on the B1 court on day 2.
    assert placements and all(p["court_id"] == courts[-1] for p in placements)
    assert all(p["day_date"] == "2026-06-12" for p in placements)
    phases = {p["phase"] for p in placements}
    assert any("Półfinał" in ph for ph in phases)
    assert any("Finał" in ph for ph in phases)
    # The final carries placeholder players because its pair is not resolved yet.
    final = next(p for p in placements if "Finał" in (p["phase"] or ""))
    assert "Zwycięzca PF" in (final["player1_name"] or "")
    assert "Zwycięzca PF" in (final["player2_name"] or "")


def test_office_autoschedule_knockout_seeds_from_groups_before_group_play(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Provisional Knockout Cup",
        "2026-06-10",
        "2026-06-11",
        active=True,
        office_password_hash=generate_password_hash("seed"),
    )
    database.create_tournament_courts(tournament_id, 2)
    players = [
        database.insert_player(tournament_id, f"B1 P{idx}", "B1", "PL", first_name="B1", last_name=f"P{idx}", gender="M")
        for idx in range(4)
    ]
    database.save_bracket_groups(
        tournament_id,
        [{"name": "B1 Mężczyźni", "players": players}],
    )

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "seed"})
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}
    courts = [c["kort_id"] for c in database.fetch_courts_for_tournament(tournament_id)]

    gen = client.post(
        "/api/office/1/autoschedule/generate",
        headers=headers,
        json={"start_time": "10:00", "b1_court_id": courts[-1], "day_date": "2026-06-11", "phases": ["knockout"]},
    )
    assert gen.status_code == 200
    placements = [p for p in gen.get_json()["placements"] if p["scheduled_time"]]
    assert len(placements) == 2
    assert all(p["day_date"] == "2026-06-11" for p in placements)
    phases = {p["phase"] for p in placements}
    assert any("Finał" in ph for ph in phases)
    assert any("3. miejsce" in ph for ph in phases)

    knockout_rows = database.fetch_bracket_knockout(tournament_id)
    assert len(knockout_rows) == 2
    assert knockout_rows[0]["player1_name"] == "1. B1 Mężczyźni"
    assert knockout_rows[0]["player2_name"] == "2. B1 Mężczyźni"


def test_office_generate_rematch_for_selected_group(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Rematch Cup",
        "2026-07-17",
        "2026-07-19",
        active=True,
        office_password_hash=generate_password_hash("rm"),
    )
    players = [
        database.insert_player(tournament_id, "A One", "B34", "DE", first_name="A", last_name="One"),
        database.insert_player(tournament_id, "B Two", "B34", "DE", first_name="B", last_name="Two"),
        database.insert_player(tournament_id, "C Three", "B34", "DE", first_name="C", last_name="Three"),
    ]
    database.save_bracket_groups(tournament_id, [{"name": "B3/4 Mixed", "players": players}])
    groups = database.fetch_bracket_groups(tournament_id)
    group_id = groups[0]["id"]

    database.ensure_group_schedule_entries(tournament_id)
    base_schedule = [entry for entry in database.fetch_tournament_schedule(tournament_id) if entry["phase"] == database.GROUP_PHASE]
    assert len(base_schedule) == 3

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "rm"})
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    response = client.post(
        "/api/office/1/schedule/generate-rematch",
        headers=headers,
        json={"group_ids": [group_id], "day_date": "2026-07-19"},
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["result"]["inserted"] == 3

    rematch_schedule = [
        entry for entry in database.fetch_tournament_schedule(tournament_id)
        if entry["phase"] == database.GROUP_REMATCH_PHASE
    ]
    assert len(rematch_schedule) == 3
    assert {(entry["player1_name"], entry["player2_name"]) for entry in rematch_schedule} == {
        ("A One", "B Two"),
        ("A One", "C Three"),
        ("B Two", "C Three"),
    }

    duplicate = client.post(
        "/api/office/1/schedule/generate-rematch",
        headers=headers,
        json={"group_ids": [group_id]},
    )
    assert duplicate.status_code == 200
    assert duplicate.get_json()["result"]["inserted"] == 0


def test_provisional_knockout_for_five_player_group(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament("Five Group", "2026-07-17", "2026-07-19", active=True)
    players = [
        database.insert_player(tournament_id, f"P{i}", "B2", "DE", first_name="P", last_name=str(i))
        for i in range(1, 6)
    ]
    database.save_bracket_groups(tournament_id, [{"name": "B2 Mixed", "players": players}])

    generated = database.seed_provisional_knockout_from_groups(tournament_id)
    assert generated["status"] == "ok"
    phases = {slot["phase"] for slot in generated["knockout"]}
    assert "B2 Mixed — Finał" in phases
    assert "B2 Mixed — o 3. miejsce" in phases


def test_office_create_player(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Office Players",
        "2026-07-17",
        "2026-07-19",
        active=True,
        office_password_hash=generate_password_hash("pl"),
    )
    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "pl"})
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    response = client.post(
        "/api/office/1/players",
        headers=headers,
        json={"first_name": "Lars", "last_name": "Stetten", "category": "B1", "country": "DE"},
    )
    assert response.status_code == 201
    players = database.fetch_players(tournament_id)
    assert any(player["last_name"] == "Stetten" for player in players)


def test_office_unassign_delete_unassigned_and_regenerate_schedule(full_app_with_temp_db):
    from wyniki import database

    tournament_id = database.insert_tournament(
        "Unassign Cup",
        "2026-07-18",
        "2026-07-19",
        active=True,
        office_password_hash=generate_password_hash("unassign"),
    )
    courts = database.create_tournament_courts(tournament_id, 2)
    players = [
        database.insert_player(tournament_id, "A One", "B1", "PL", first_name="A", last_name="One", gender="M"),
        database.insert_player(tournament_id, "A Two", "B1", "PL", first_name="A", last_name="Two", gender="M"),
        database.insert_player(tournament_id, "A Three", "B1", "PL", first_name="A", last_name="Three", gender="M"),
    ]

    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "unassign"})
    assert auth.status_code == 200
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    database.save_bracket_groups(tournament_id, [{"name": "B1 Mężczyźni — Grupa A", "players": players}])
    generated = client.post("/api/office/1/schedule/generate", headers=headers)
    assert generated.status_code == 200
    schedule = generated.get_json()["schedule"]
    assert len(schedule) == 3

    target = schedule[0]
    moved = client.post(
        "/api/office/1/autoschedule/move",
        headers=headers,
        json={
            "schedule_id": target["id"],
            "court_id": courts[0],
            "scheduled_time": "09:30",
            "day_date": "2026-07-18",
        },
    )
    assert moved.status_code == 200
    moved_entry = next(e for e in moved.get_json()["schedule"] if e["id"] == target["id"])
    assert moved_entry["court_id"] == courts[0]

    unassigned = client.post(
        "/api/office/1/autoschedule/unassign",
        headers=headers,
        json={"schedule_id": target["id"], "day_date": "2026-07-18"},
    )
    assert unassigned.status_code == 200
    back = next(e for e in unassigned.get_json()["schedule"] if e["id"] == target["id"])
    assert not back.get("court_id")
    assert not back.get("scheduled_time")

    deleted = client.delete("/api/office/1/schedule/unassigned?day_date=2026-07-18", headers=headers)
    assert deleted.status_code == 200
    assert deleted.get_json()["deleted"] >= 3

    regenerated = client.post("/api/office/1/schedule/generate", headers=headers)
    assert regenerated.status_code == 200
    assert len(regenerated.get_json()["schedule"]) == 3

