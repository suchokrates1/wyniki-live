import pytest

from wyniki.database.teams import TeamConflictError, TeamValidationError
from wyniki.services.teams import (
    DEFAULT_PLAY_FORMAT,
    format_team_display_name,
    normalize_pair_key,
    normalize_play_format,
    pair_key_from_player_ids,
)


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "teams.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def _create_tournament(db) -> int:
    tournament_id = db.insert_tournament(
        "Doubles Test",
        "2026-08-13",
        "2026-08-15",
        active=True,
        city="Test",
        country="PL",
    )
    assert tournament_id
    return int(tournament_id)


def _insert_person(db, tournament_id: int, first: str, last: str, *, category: str = "B1") -> int:
    player_id = db.insert_player(
        tournament_id,
        name=f"{first} {last}",
        first_name=first,
        last_name=last,
        category=category,
        country="PL",
        gender="K" if first.endswith("a") else "M",
    )
    assert player_id
    return int(player_id)


def test_format_team_display_name_sorts_by_last_name():
    ewa = {"id": 2, "first_name": "Ewa", "last_name": "Nowak"}
    anna = {"id": 1, "first_name": "Anna", "last_name": "Kowalska"}
    assert format_team_display_name(ewa, anna) == "Anna Kowalska / Ewa Nowak"
    assert format_team_display_name(anna, ewa) == "Anna Kowalska / Ewa Nowak"


def test_normalize_pair_key_ignores_partner_order():
    assert normalize_pair_key("Anna Kowalska / Ewa Nowak") == normalize_pair_key(
        "Ewa Nowak / Anna Kowalska"
    )
    assert normalize_pair_key("Anna Kowalska", "Ewa Nowak") == normalize_pair_key(
        "Ewa Nowak", "Anna Kowalska"
    )
    assert pair_key_from_player_ids(8, 3) == pair_key_from_player_ids(3, 8)
    assert pair_key_from_player_ids(3, 8) == "3:8"


def test_normalize_play_format_defaults():
    assert normalize_play_format(None) == DEFAULT_PLAY_FORMAT
    assert normalize_play_format("knockout") == "knockout"
    assert normalize_play_format("nope") == DEFAULT_PLAY_FORMAT


def test_confirm_and_patch_is_doubles(db):
    tournament_id = _create_tournament(db)
    categories = db.confirm_tournament_categories(
        tournament_id,
        [
            {"preset_key": "B1M", "label": "B1 Men"},
            {"label": "B1 Men Double", "is_doubles": True},
        ],
    )
    assert categories[0]["is_doubles"] is False
    assert categories[1]["is_doubles"] is True

    updated = db.update_tournament_category(categories[0]["id"], is_doubles=True)
    assert updated["is_doubles"] is True

    inserted = db.insert_tournament_category(
        tournament_id,
        label="Custom Double",
        is_doubles=True,
    )
    assert inserted["is_doubles"] is True
    assert inserted["team_count"] == 0


def test_cannot_insert_pair_in_singles_category(db):
    tournament_id = _create_tournament(db)
    singles = db.confirm_tournament_categories(tournament_id, [{"label": "B1 Men"}])[0]
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    p2 = _insert_person(db, tournament_id, "Ewa", "Nowak")
    with pytest.raises(TeamValidationError, match="singles category"):
        db.insert_tournament_team(tournament_id, singles["id"], p1, p2)


def test_pair_requires_two_different_people(db):
    tournament_id = _create_tournament(db)
    doubles = db.confirm_tournament_categories(
        tournament_id, [{"label": "B1 Double", "is_doubles": True}]
    )[0]
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    with pytest.raises(TeamValidationError, match="two different people"):
        db.insert_tournament_team(tournament_id, doubles["id"], p1, p1)


def test_unique_pair_ignores_partner_order(db):
    tournament_id = _create_tournament(db)
    doubles = db.confirm_tournament_categories(
        tournament_id, [{"label": "B1 Double", "is_doubles": True}]
    )[0]
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    p2 = _insert_person(db, tournament_id, "Ewa", "Nowak")

    team = db.insert_tournament_team(tournament_id, doubles["id"], p2, p1)
    assert team["display_name"] == "Anna Kowalska / Ewa Nowak"
    assert team["player1"]["last_name"] in {"Kowalska", "Nowak"}

    with pytest.raises(TeamConflictError, match="already exists"):
        db.insert_tournament_team(tournament_id, doubles["id"], p1, p2)

    listed = db.fetch_tournament_teams(tournament_id, category_id=doubles["id"])
    assert len(listed) == 1
    assert listed[0]["id"] == team["id"]


def test_save_group_stores_team_id_and_display_name(db):
    tournament_id = _create_tournament(db)
    doubles = db.confirm_tournament_categories(
        tournament_id, [{"label": "B1 Double", "is_doubles": True}]
    )[0]
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    p2 = _insert_person(db, tournament_id, "Ewa", "Nowak")
    p3 = _insert_person(db, tournament_id, "Piotr", "Wiśniewski")
    p4 = _insert_person(db, tournament_id, "Jan", "Lewandowski")
    team_a = db.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
    team_b = db.insert_tournament_team(tournament_id, doubles["id"], p3, p4)

    assert db.save_bracket_groups(
        tournament_id,
        [{
            "name": "B1 Double — Grupa A",
            "tournament_category_id": doubles["id"],
            "play_format": "round_robin",
            "teams": [team_a["id"], team_b["id"]],
        }],
    )

    groups = db.fetch_bracket_groups(tournament_id)
    assert len(groups) == 1
    assert groups[0]["play_format"] == "round_robin"
    names = {row["name"] for row in groups[0]["players"]}
    assert team_a["display_name"] in names
    assert team_b["display_name"] in names
    assert all(row["team_id"] for row in groups[0]["players"])
    assert all(row["player_id"] is None for row in groups[0]["players"])

    with pytest.raises(TeamConflictError, match="assigned to a group"):
        db.delete_tournament_team(team_a["id"])


def test_save_group_singles_has_no_team_id_and_default_play_format(db):
    tournament_id = _create_tournament(db)
    singles = db.confirm_tournament_categories(tournament_id, [{"label": "B1 Men"}])[0]
    p1 = _insert_person(db, tournament_id, "Jan", "Kowalski")
    p2 = _insert_person(db, tournament_id, "Adam", "Nowak")

    assert db.save_bracket_groups(
        tournament_id,
        [{
            "name": "B1 Men — Grupa A",
            "tournament_category_id": singles["id"],
            "players": [p1, p2],
        }],
    )
    groups = db.fetch_bracket_groups(tournament_id)
    assert groups[0]["play_format"] == DEFAULT_PLAY_FORMAT
    assert all(row["team_id"] is None for row in groups[0]["players"])
    assert {row["player_id"] for row in groups[0]["players"]} == {p1, p2}


def test_schema_has_doubles_columns(db):
    with db.db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(tournament_categories)")
        assert "is_doubles" in {row[1] for row in cursor.fetchall()}
        cursor.execute("PRAGMA table_info(bracket_groups)")
        assert "play_format" in {row[1] for row in cursor.fetchall()}
        cursor.execute("PRAGMA table_info(bracket_group_players)")
        assert "team_id" in {row[1] for row in cursor.fetchall()}
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_teams'")
        assert cursor.fetchone() is not None
    db.init_db()


def test_resaving_singles_preserves_doubles_teams_and_play_format(db):
    tournament_id = _create_tournament(db)
    singles, doubles = db.confirm_tournament_categories(
        tournament_id,
        [
            {"label": "B1 Men"},
            {"label": "B1 Double", "is_doubles": True},
        ],
    )
    s1 = _insert_person(db, tournament_id, "Jan", "Kowalski")
    s2 = _insert_person(db, tournament_id, "Adam", "Nowak")
    p1 = _insert_person(db, tournament_id, "Anna", "Kowalska")
    p2 = _insert_person(db, tournament_id, "Ewa", "Nowak")
    p3 = _insert_person(db, tournament_id, "Piotr", "Wiśniewski")
    p4 = _insert_person(db, tournament_id, "Jan", "Lewandowski")
    team_a = db.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
    team_b = db.insert_tournament_team(tournament_id, doubles["id"], p3, p4)

    assert db.save_bracket_groups(
        tournament_id,
        [
            {
                "name": "B1 Men",
                "tournament_category_id": singles["id"],
                "play_format": "groups_knockout",
                "players": [s1, s2],
            },
            {
                "name": "B1 Double",
                "tournament_category_id": doubles["id"],
                "play_format": "round_robin",
                "teams": [team_a["id"], team_b["id"]],
            },
        ],
    )

    stored = db.fetch_bracket_groups(tournament_id)
    doubles_group = next(group for group in stored if group["name"] == "B1 Double")
    assert db.save_bracket_groups(
        tournament_id,
        [
            {
                "name": doubles_group["name"],
                "tournament_category_id": doubles["id"],
                "play_format": doubles_group["play_format"],
                "teams": [row["team_id"] for row in doubles_group["players"]],
            },
            {
                "name": "B1 Men",
                "tournament_category_id": singles["id"],
                "play_format": "knockout",
                "players": [s1, s2],
            },
        ],
    )

    groups = {group["name"]: group for group in db.fetch_bracket_groups(tournament_id)}
    assert groups["B1 Double"]["play_format"] == "round_robin"
    assert {row["team_id"] for row in groups["B1 Double"]["players"]} == {team_a["id"], team_b["id"]}
    assert groups["B1 Men"]["play_format"] == "knockout"
    assert {row["player_id"] for row in groups["B1 Men"]["players"]} == {s1, s2}


def test_new_group_defaults_to_groups_knockout(db):
    tournament_id = _create_tournament(db)
    singles = db.confirm_tournament_categories(tournament_id, [{"label": "B1 Men"}])[0]
    p1 = _insert_person(db, tournament_id, "Jan", "Kowalski")
    assert db.save_bracket_groups(
        tournament_id,
        [{"name": "B1 Men", "tournament_category_id": singles["id"], "players": [p1]}],
    )
    groups = db.fetch_bracket_groups(tournament_id)
    assert groups[0]["play_format"] == DEFAULT_PLAY_FORMAT
