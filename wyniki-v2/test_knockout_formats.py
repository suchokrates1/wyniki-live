"""The "Drabinki" office step: a knockout format per category, previewed and applied."""
import pytest
from werkzeug.security import generate_password_hash


@pytest.fixture()
def full_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-formats.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app


def _cup(database):
    with database.db_conn() as conn:
        conn.execute("UPDATE tournaments SET active = 0, is_simulation = 0")
        conn.commit()
    tournament_id = database.insert_tournament(
        "Formats Cup", "2026-08-01", "2026-08-03", active=True,
        office_password_hash=generate_password_hash("formats"),
    )
    database.create_tournament_courts(tournament_id, 4)
    categories = database.confirm_tournament_categories(tournament_id, [
        {"preset_key": "B2K"},
        {"label": "B1 M Debel", "hint_bands": ["B1"], "is_doubles": True},
    ])
    b2 = next(cat for cat in categories if not cat.get("is_doubles"))
    doubles = next(cat for cat in categories if cat.get("is_doubles"))
    groups = []
    for letter in "ABCD":
        ids = [
            database.insert_player(tournament_id, f"F{letter}{rank}", "B2", "PL", first_name="F", last_name=f"{letter}{rank}", gender="K")
            for rank in (1, 2, 3)
        ]
        groups.append({"name": f"{b2['label']} — Grupa {letter}", "tournament_category_id": b2["id"], "play_format": "groups_knockout", "players": ids})
    men = [database.insert_player(tournament_id, f"M{i}", "B1", "PL", first_name="M", last_name=str(i), gender="M") for i in range(10)]
    teams = [database.insert_tournament_team(tournament_id, doubles["id"], men[i * 2], men[i * 2 + 1])["id"] for i in range(5)]
    groups.append({"name": doubles["label"], "tournament_category_id": doubles["id"], "play_format": "knockout", "teams": teams})
    database.save_bracket_groups(tournament_id, groups)
    return tournament_id, b2, doubles


def _headers(client):
    token = client.post("/api/office/1/auth", json={"password": "formats"}).get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _finish_groups(client, headers):
    planning = client.get("/api/office/1/planning", headers=headers).get_json()
    for entry in planning["schedule"]:
        if entry.get("source_type") != "group":
            continue
        a, b = entry["player1_name"], entry["player2_name"]
        a_wins = a[-1] < b[-1]
        response = client.post("/api/office/1/group-matches", headers=headers, json={
            "group_id": entry["bracket_group_id"], "schedule_id": entry["id"], "player1_name": a, "player2_name": b, "phase": "Grupowa",
            "sets": [{"player1_games": 4 if a_wins else 1, "player2_games": 1 if a_wins else 4}, {"player1_games": 4 if a_wins else 2, "player2_games": 2 if a_wins else 4}],
        })
        assert response.status_code == 201, response.get_json()


def _category_slots(database, tournament_id, prefix):
    return [row for row in database.fetch_bracket_knockout(tournament_id) if str(row["phase"]).startswith(f"{prefix} — ")]


def test_default_formats_preview_what_is_generated(full_app_with_temp_db):
    from wyniki import database

    tournament_id, b2, doubles = _cup(database)
    client = full_app_with_temp_db.test_client()
    headers = _headers(client)
    overview = {item["category_id"]: item for item in client.get("/api/office/1/knockout-formats", headers=headers).get_json()["categories"]}

    women = overview[b2["id"]]
    assert women["allowed_formats"] == ["main", "none"] and women["config"]["format"] == "main"
    main_lines = next(draw for draw in women["preview"]["draws"] if draw["key"] == "main")["lines"]
    assert [line["label"] for line in main_lines] == ["A1", "B2", "D1", "C2", "B1", "A2", "C1", "D2"]
    assert women["preview"]["main_matches"] == 12 and women["preview"]["consolation_matches"] == 4
    pairs = overview[doubles["id"]]
    assert pairs["allowed_formats"] == ["direct", "none"] and pairs["preview"]["matches"] == 5

    _finish_groups(client, headers)
    assert len(_category_slots(database, tournament_id, b2["label"])) == women["preview"]["matches"]
    assert len(_category_slots(database, tournament_id, doubles["label"])) == pairs["preview"]["matches"]


def test_chosen_format_swaps_and_lock(full_app_with_temp_db):
    from wyniki import database

    tournament_id, b2, doubles = _cup(database)
    client = full_app_with_temp_db.test_client()
    headers = _headers(client)

    config = {"format": "main", "qualifiers": 2, "places": "third", "consolation": False, "swaps": {"main": [[1, 3]]}, "confirmed": True}
    preview = client.post("/api/office/1/knockout-formats/preview", headers=headers, json={"category_id": b2["id"], "config": config}).get_json()["category"]
    assert [line["label"] for line in preview["preview"]["draws"][0]["lines"]][:4] == ["A1", "C2", "D1", "B2"]
    assert preview["preview"]["matches"] == 8

    saved = client.put(f"/api/office/1/knockout-formats/{b2['id']}", headers=headers, json={"config": config})
    assert saved.status_code == 200 and saved.get_json()["rebuilt"] is True
    no_doubles = client.put(f"/api/office/1/knockout-formats/{doubles['id']}", headers=headers, json={"config": {"format": "none", "confirmed": True}})
    assert no_doubles.status_code == 200
    assert _category_slots(database, tournament_id, doubles["label"]) == []

    _finish_groups(client, headers)
    slots = _category_slots(database, tournament_id, b2["label"])
    assert len(slots) == 8
    quarters = sorted((row for row in slots if row["phase"].endswith("Ćwierćfinał")), key=lambda row: row["position"])
    assert (quarters[0]["player1_name"], quarters[0]["player2_name"]) == ("FA1", "FC2")
    assert not any("Pocieszenie" in row["phase"] or "miejsca" in row["phase"] for row in slots)

    dashboard = client.get("/api/office/1/dashboard", headers=headers).get_json()
    quarter = next(row for row in dashboard["progress"]["knockout"]["matches"] if row["phase"].endswith("Ćwierćfinał") and row["position"] == 1)
    played = client.post("/api/office/1/knockout-matches", headers=headers, json={
        "schedule_id": quarter["schedule_id"], "sets": [{"player1_games": 4, "player2_games": 1}, {"player1_games": 4, "player2_games": 2}],
    })
    assert played.status_code == 201, played.get_json()
    locked = client.put(f"/api/office/1/knockout-formats/{b2['id']}", headers=headers, json={"config": {**config, "places": "all"}})
    assert locked.status_code == 409 and locked.get_json()["error"] == "locked"
    same = client.put(f"/api/office/1/knockout-formats/{b2['id']}", headers=headers, json={"config": config})
    assert same.status_code == 200 and same.get_json()["rebuilt"] is False

    confirmed = client.post("/api/office/1/knockout-formats/confirm-all", headers=headers).get_json()["categories"]
    assert all(item["config"]["confirmed"] for item in confirmed)
