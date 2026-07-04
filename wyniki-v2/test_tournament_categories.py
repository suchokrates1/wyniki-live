import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "categories.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def _create_tournament(db) -> int:
    tournament_id = db.insert_tournament(
        "Category Test",
        "2026-07-17",
        "2026-07-19",
        active=True,
        city="Test",
        country="DE",
    )
    assert tournament_id
    return int(tournament_id)


def test_confirm_tournament_categories(db):
    tournament_id = _create_tournament(db)
    categories = db.confirm_tournament_categories(
        tournament_id,
        [
            {"preset_key": "B1M", "label": "B1 Men"},
            {"label": "B2 Mixed", "hint_bands": ["B2"]},
        ],
    )
    assert len(categories) == 2
    assert categories[0]["label"] == "B1 Men"
    assert categories[1]["label"] == "B2 Mixed"
    assert db.fetch_tournament_categories(tournament_id)[0]["preset_key"] == "B1M"


def test_confirm_rejects_duplicate_without_replace(db):
    tournament_id = _create_tournament(db)
    db.confirm_tournament_categories(tournament_id, [{"label": "B1 Men"}])
    with pytest.raises(ValueError, match="already confirmed"):
        db.confirm_tournament_categories(tournament_id, [{"label": "B2 Mixed"}])


def test_update_category_propagates_rename(db):
    tournament_id = _create_tournament(db)
    categories = db.confirm_tournament_categories(tournament_id, [{"label": "B2 Mixed"}])
    category_id = categories[0]["id"]

    player_a = db.insert_player(
        tournament_id,
        name="Test Player",
        first_name="Test",
        last_name="Player",
        category="B2",
        country="DE",
        gender="M",
    )
    player_b = db.insert_player(
        tournament_id,
        name="Other Player",
        first_name="Other",
        last_name="Player",
        category="B2",
        country="DE",
        gender="K",
    )
    db.save_bracket_groups(
        tournament_id,
        [{"name": "B2 Mixed", "tournament_category_id": category_id, "players": [player_a, player_b]}],
    )
    db.upsert_tournament_schedule_entries(
        tournament_id,
        [{
            "category_name": "B2 Mixed",
            "group_name": "B2 Mixed",
            "phase": "B2 Mixed — group",
            "source_type": "group",
            "player1_name": "Test Player",
            "player2_name": "Other Player",
        }],
    )

    updated = db.update_tournament_category(category_id, label="B2 Mixed Renamed")
    assert updated["label"] == "B2 Mixed Renamed"

    groups = db.fetch_bracket_groups(tournament_id)
    assert groups[0]["name"] == "B2 Mixed Renamed"

    schedule = db.fetch_tournament_schedule(tournament_id)
    assert schedule[0]["category_name"] == "B2 Mixed Renamed"
    assert schedule[0]["group_name"] == "B2 Mixed Renamed"


def test_delete_category_soft_when_in_use(db):
    tournament_id = _create_tournament(db)
    categories = db.confirm_tournament_categories(tournament_id, [{"label": "B1 Men"}])
    category_id = categories[0]["id"]
    player_id = db.insert_player(
        tournament_id,
        name="A B",
        first_name="A",
        last_name="B",
        category="B1",
        country="DE",
        gender="M",
    )
    db.save_bracket_groups(
        tournament_id,
        [{"name": "B1 Men", "tournament_category_id": category_id, "players": [player_id]}],
    )

    assert db.delete_tournament_category(category_id) is True
    row = db.fetch_tournament_category(category_id)
    assert row["is_active"] is False


def test_migrate_from_legacy_groups(db):
    tournament_id = _create_tournament(db)
    player_id = db.insert_player(
        tournament_id,
        name="X Y",
        first_name="X",
        last_name="Y",
        category="B2",
        country="DE",
        gender="K",
    )
    db.save_bracket_groups(tournament_id, [{"name": "B2 Mixed", "players": [player_id]}])
    db.set_mixed_categories(tournament_id, ["B2"])

    migrated = db.migrate_tournament_categories_from_legacy(tournament_id)
    assert len(migrated) == 1
    assert migrated[0]["label"] == "B2 Mixed"

    groups = db.fetch_bracket_groups(tournament_id)
    assert groups[0]["tournament_category_id"] == migrated[0]["id"]
