"""Tournaments from before the office path: formats confirmed as played, drawn players numbered."""
import json

import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "upgrade.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def _tournament(db, name, *, active, knockout=True):
    tournament_id = db.insert_tournament(name, "2026-08-01", "2026-08-02", active=active)
    b2, b3 = db.confirm_tournament_categories(tournament_id, [{"preset_key": "B2M"}, {"preset_key": "B3M"}])
    groups = []
    for letter in "AB":
        ids = [db.insert_player(tournament_id, f"{name}{letter}{n}", "B2", "PL", gender="M") for n in range(3)]
        groups.append({"name": f"{b2['label']} — Grupa {letter}", "tournament_category_id": b2["id"], "play_format": "groups_knockout", "players": ids})
    b3_ids = [db.insert_player(tournament_id, f"{name}C{n}", "B3", "PL", gender="M") for n in range(4)]
    groups.append({"name": b3["label"], "tournament_category_id": b3["id"], "play_format": "round_robin", "players": b3_ids})
    db.save_bracket_groups(tournament_id, groups)
    if knockout:
        # what the automatic format put in the database before the office path existed
        db.seed_provisional_knockout_from_groups(tournament_id)
    return tournament_id, b2, b3


def _state(db, tournament_id):
    return (
        json.dumps(db.fetch_bracket_groups(tournament_id), sort_keys=True, default=str),
        json.dumps(db.fetch_bracket_knockout(tournament_id), sort_keys=True, default=str),
        json.dumps(db.fetch_tournament_schedule(tournament_id), sort_keys=True, default=str),
    )


def test_old_tournament_is_confirmed_as_played_without_touching_its_draw(db):
    from wyniki.database.tournament_upgrade import upgrade_existing_tournaments

    old_id, b2, b3 = _tournament(db, "Old", active=False)
    new_id, _, _ = _tournament(db, "New", active=True)
    before = _state(db, old_id)
    new_before = (_state(db, new_id), db.fetch_start_numbers(new_id))

    result = upgrade_existing_tournaments()

    assert result["status"] == "ok"
    assert _state(db, old_id) == before
    overview = {item["category_id"]: item for item in db.knockout_format_overview(old_id)}
    assert overview[b2["id"]]["config"] == {**overview[b2["id"]]["config"], "format": "cross", "confirmed": True}
    assert overview[b3["id"]]["config"]["format"] == "none" and overview[b3["id"]]["config"]["confirmed"]
    numbers = db.fetch_start_numbers(old_id)
    assert sorted(numbers[str(b2["id"])]["player"].values()) == [1, 2, 3, 4, 5, 6]
    assert sorted(numbers[str(b3["id"])]["player"].values()) == [1, 2, 3, 4]

    # a tournament being set up now is left to the office
    assert (_state(db, new_id), db.fetch_start_numbers(new_id)) == new_before
    assert not any(item["config"]["confirmed"] for item in db.knockout_format_overview(new_id))

    assert upgrade_existing_tournaments() == {"status": "already_done"}


def test_an_existing_app_settings_flag_is_adopted_without_rewriting(db):
    from wyniki.database.tournament_upgrade import MIGRATION_KEY, upgrade_existing_tournaments

    old_id, b2, _ = _tournament(db, "Flagged", active=False)
    before = _state(db, old_id)
    with db.db_conn() as conn:
        conn.execute("INSERT INTO app_settings (key, value) VALUES (?, '{}')", (MIGRATION_KEY,))
        conn.commit()

    assert upgrade_existing_tournaments() == {"status": "already_done"}
    assert _state(db, old_id) == before
    item = next(item for item in db.knockout_format_overview(old_id) if item["category_id"] == b2["id"])
    assert not item["config"]["confirmed"]

    with db.db_conn() as conn:
        row = conn.execute(
            "SELECT detail FROM schema_migrations WHERE name = 'upgrade_existing_tournaments'"
        ).fetchone()
    assert row["detail"] == "adopted from app_settings"
    assert upgrade_existing_tournaments() == {"status": "already_done"}


def test_groups_that_disagree_with_one_format_are_left_for_the_office(db):
    from wyniki.database.tournament_upgrade import upgrade_tournament

    tournament_id, b2, _ = _tournament(db, "Mixed", active=False)
    groups = db.fetch_bracket_groups(tournament_id)
    payload = []
    for index, group in enumerate(groups):
        in_b2 = group.get("tournament_category_id") == b2["id"]
        payload.append({
            "name": group["name"],
            "tournament_category_id": group.get("tournament_category_id"),
            "play_format": ("knockout" if index == 0 else "groups_knockout") if in_b2 else group.get("play_format"),
            "players": [row["player_id"] for row in group.get("players") or []],
        })
    db.save_bracket_groups(tournament_id, payload)

    result = upgrade_tournament(tournament_id)

    assert b2["label"] in result["skipped"]
    item = next(item for item in db.knockout_format_overview(tournament_id) if item["category_id"] == b2["id"])
    assert not item["config"]["confirmed"]


def test_a_draw_made_outside_the_formats_is_kept_as_imported(db):
    from wyniki.database.tournament_upgrade import upgrade_tournament

    tournament_id, b2, b3 = _tournament(db, "Imported", active=False, knockout=False)
    with db.db_conn() as conn:
        conn.executemany(
            "INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name, winner_name) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (tournament_id, f"{b2['label']} — 01 Runda 1", 1, "ImportedA0", "ImportedB1", "ImportedA0"),
                (tournament_id, f"{b2['label']} — Finał", 1, "ImportedA0", "ImportedB0", "ImportedB0"),
            ],
        )
        conn.commit()
    before = _state(db, tournament_id)

    result = upgrade_tournament(tournament_id)

    assert result["imported"] == [b2["label"]]
    assert _state(db, tournament_id) == before
    item = next(item for item in db.knockout_format_overview(tournament_id) if item["category_id"] == b2["id"])
    assert item["imported"] and item["locked"] and item["config"]["confirmed"]
    assert item["preview"]["matches"] == 2
    # the office cannot turn it into a generated draw, nor clear the mark with a draft
    assert db.save_knockout_format(tournament_id, b2["id"], {"format": "cross", "confirmed": True, "imported": False}) == {"error": "locked"}
    draft = db.knockout_format_overview(tournament_id, drafts={str(b2["id"]): {"format": "cross", "imported": False}})
    assert next(entry for entry in draft if entry["category_id"] == b2["id"])["imported"]
    assert _state(db, tournament_id) == before
