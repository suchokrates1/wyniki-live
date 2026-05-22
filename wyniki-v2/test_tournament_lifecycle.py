import pytest
import json
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

    return create_app()


def _count_table(database, table_name: str, where_clause: str = "", params=()):
    with database.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT COUNT(*) AS count FROM {table_name} {where_clause}", params)
        return cursor.fetchone()["count"]


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
