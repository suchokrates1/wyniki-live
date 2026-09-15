"""Sport classes: history, the review after a tournament, one code per sex, and the profile."""
import pytest


@pytest.fixture()
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "classes.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application


def _global_id(database, player_id):
    with database.db_conn() as conn:
        return conn.execute("SELECT global_player_id FROM players WHERE id = ?", (player_id,)).fetchone()[0]


def _class(database, global_id):
    with database.db_conn() as conn:
        return conn.execute("SELECT category FROM global_players WHERE id = ?", (global_id,)).fetchone()[0]


def _tournament(database, name, start, end, entries):
    """entries: (name, class, gender, category preset) — players drawn into one group per category."""
    tournament_id = database.insert_tournament(name, start, end, active=False)
    presets = sorted({preset for *_, preset in entries})
    categories = {cat["preset_key"]: cat for cat in database.confirm_tournament_categories(tournament_id, [{"preset_key": key} for key in presets])}
    ids = {}
    groups = []
    for preset in presets:
        members = []
        for player_name, player_class, gender, entry_preset in entries:
            if entry_preset != preset:
                continue
            first, last = player_name.split(" ", 1)
            ids[player_name] = database.insert_player(tournament_id, player_name, player_class, "PL", first_name=first, last_name=last, gender=gender)
            members.append(ids[player_name])
        groups.append({"name": categories[preset]["label"], "tournament_category_id": categories[preset]["id"], "play_format": "round_robin", "players": members})
    database.save_bracket_groups(tournament_id, groups)
    return tournament_id, ids


def test_labels_and_genders_are_read_one_way():
    from wyniki.database.classifications import classes_in_label, normalize_gender

    assert classes_in_label("B2 Men") == {"B2"}
    assert classes_in_label("B3/4 Mixed") == {"B3", "B4"}
    assert classes_in_label("B3/B4 Men Doubles") == {"B3", "B4"}
    assert classes_in_label("Open") == set()
    assert [normalize_gender(value) for value in ("F", "k", "W", "m", "", "x")] == ["K", "K", "K", "M", "", ""]


def test_stored_women_codes_become_k_once(tmp_path, monkeypatch):
    db_path = tmp_path / "genders.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    from wyniki import database

    database.init_db()
    with database.db_conn() as conn:
        conn.execute("DELETE FROM app_settings WHERE key = 'migration:normalize_genders'")
        conn.executemany("INSERT INTO global_players (first_name, last_name, gender, category) VALUES (?, ?, ?, 'B2')", [("A", "One", "F"), ("B", "Two", "K"), ("C", "Three", "m"), ("D", "Four", "")])
        conn.commit()
    database.init_db()
    with database.db_conn() as conn:
        assert [row[0] for row in conn.execute("SELECT gender FROM global_players ORDER BY id")] == ["K", "K", "M", ""]


def test_review_after_a_tournament_reclassifies_or_remembers_playing_up(app):
    from wyniki import database

    tournament_id, ids = _tournament(database, "Vilnius Cup", "2026-08-25", "2026-08-29", [
        ("Adam Down", "B3", "M", "B2M"),     # a B3 in B2: cannot play lower, needs a new class
        ("Bob Stay", "B2", "M", "B2M"),
        ("Cora Up", "B2", "K", "B3K"),       # a B2 woman in B3: may be playing up
        ("Dana Mixed", "B4", "K", "B3K"),
    ])
    client = app.test_client()
    review = client.get(f"/admin/api/global-players/tournaments/{tournament_id}/classification-review").get_json()
    by_name = {item["last_name"]: item for item in review["items"]}
    assert set(by_name) == {"Down", "Up", "Mixed"}
    assert by_name["Down"]["hint"] == "reclassification_required" and by_name["Down"]["suggested_class"] == "B2"
    assert by_name["Up"]["hint"] == "maybe_playing_up"
    assert review["pending"] == 3

    adam, cora, dana = (_global_id(database, ids[name]) for name in ("Adam Down", "Cora Up", "Dana Mixed"))
    response = client.post(f"/admin/api/global-players/tournaments/{tournament_id}/classification-review", json={"decisions": [
        {"global_player_id": adam, "decision": "reclassify"},
        {"global_player_id": cora, "decision": "play_up"},
        {"global_player_id": dana, "decision": "reclassify", "classification": "B3"},
    ]})
    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert result["review"]["pending"] == 0
    assert _class(database, adam) == "B2" and _class(database, cora) == "B2" and _class(database, dana) == "B3"
    with database.db_conn() as conn:
        assert conn.execute("SELECT category FROM players WHERE id = ?", (ids["Adam Down"],)).fetchone()[0] == "B2"

    history = client.get(f"/admin/api/global-players/{adam}/classifications").get_json()["history"]
    assert [(row["classification"], row["source"]) for row in history] == [("B3", "initial"), ("B2", "tournament")]
    assert history[1]["effective_date"] == "2026-08-29" and history[1]["tournament_name"] == "Vilnius Cup"

    # a decision is taken once
    again = client.post(f"/admin/api/global-players/tournaments/{tournament_id}/classification-review", json={"decisions": [{"global_player_id": cora, "decision": "reclassify"}]})
    assert again.status_code == 422 and again.get_json()["errors"][0]["error"] == "already_decided"


def test_an_older_tournament_does_not_override_a_newer_class(app):
    from wyniki import database
    from wyniki.database.classifications import record_classification_change

    newer_id, ids = _tournament(database, "Newer Open", "2026-08-01", "2026-08-02", [("Zed Player", "B4", "M", "B3M")])
    gid = _global_id(database, ids["Zed Player"])
    record_classification_change(gid, "B3", source="tournament", tournament_id=newer_id)
    older_id, _ = _tournament(database, "Older Open", "2026-04-01", "2026-04-02", [])
    record_classification_change(gid, "B4", source="tournament", tournament_id=older_id)
    assert _class(database, gid) == "B3"


def test_a_manual_class_change_is_kept_in_the_history(app):
    from wyniki import database

    client = app.test_client()
    created = client.post("/admin/api/global-players", json={"first_name": "Eva", "last_name": "Manual", "gender": "F", "category": "B1"}).get_json()
    assert created["gender"] == "K"
    updated = client.put(f"/admin/api/global-players/{created['id']}", json={"category": "B2", "classification_date": "2026-09-01", "classification_status": "provisional"})
    assert updated.status_code == 200 and updated.get_json()["category"] == "B2"
    history = client.get(f"/admin/api/global-players/{created['id']}/classifications").get_json()["history"]
    assert [(row["classification"], row["source"], row["status"]) for row in history] == [("B1", "initial", "confirmed"), ("B2", "manual", "provisional")]


def test_the_profile_shows_classes_and_the_category_of_each_tournament(app):
    from wyniki import database
    from wyniki.database.classifications import record_classification_change

    tournament_id, ids = _tournament(database, "Profile Cup", "2026-08-25", "2026-08-29", [("Ina Profile", "B3", "K", "B2K"), ("Ola Other", "B2", "K", "B2K")])
    gid = _global_id(database, ids["Ina Profile"])
    record_classification_change(gid, "B2", source="tournament", tournament_id=tournament_id)

    profile = app.test_client().get(f"/api/players/{gid}/profile?global=1").get_json()
    assert profile["player"]["category"] == "B2"
    assert [(row["classification"], row["previous_classification"]) for row in profile["classification_history"]] == [("B3", ""), ("B2", "B3")]
    assert profile["classification_history"][1]["tournament_name"] == "Profile Cup"
    entry = next(t for t in profile["tournaments"] if t["tournament_id"] == tournament_id)
    assert entry["category_label"] and entry["category_classes"] == ["B2"] and entry["player_class"] == "B2"
    assert profile["career"]["medals_by_category"] == []
