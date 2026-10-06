import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "bracket-players.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def test_bracket_names_resolve_to_player_ids_and_country(db):
    tournament_id = int(db.insert_tournament("Wilno", "2026-08-25", "2026-08-29", active=True, city="Vilnius", country="LT"))
    jani = db.insert_player(tournament_id, name="Jani Kallunki", first_name="Jani", last_name="Kallunki", category="B1", country="fi", gender="M")
    db.insert_player(tournament_id, name="Naqi Rizvi", first_name="Naqi", last_name="Rizvi", category="B1", country="GB", gender="M")

    bracket = db.get_full_bracket(tournament_id)

    entry = bracket["players"]["Jani Kallunki"]
    assert entry["player_id"] == jani
    assert entry["country"] == "FI"
    assert "global_player_id" in entry
    assert set(bracket["players"]) == {"Jani Kallunki", "Naqi Rizvi"}


def test_bracket_directory_is_scoped_to_its_tournament(db):
    first = int(db.insert_tournament("A", "2026-05-23", "2026-05-24", city="Leszno", country="PL"))
    second = int(db.insert_tournament("B", "2026-08-25", "2026-08-29", city="Vilnius", country="LT"))
    db.insert_player(first, name="Rafał Sudoł", first_name="Rafał", last_name="Sudoł", category="B1", country="PL", gender="M")

    assert db.get_full_bracket(second)["players"] == {}
