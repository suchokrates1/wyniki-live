"""Start numbers: 1, 2, 3… inside each category, never renumbered by a draw or a deletion."""
import pytest


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "start-numbers.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def test_players_are_numbered_per_category_and_keep_their_numbers(db):
    tournament_id = db.insert_tournament("Numbers Cup", "2026-08-01", "2026-08-02", active=True)
    women, men = db.confirm_tournament_categories(tournament_id, [{"preset_key": "B2K"}, {"preset_key": "B2M"}])
    women_ids = [db.insert_player(tournament_id, f"W{n}", "B2", "PL", gender="K") for n in range(1, 13)]
    men_ids = [db.insert_player(tournament_id, f"M{n}", "B2", "PL", gender="M") for n in range(1, 5)]

    numbers = db.assign_start_numbers(tournament_id, women["id"], "player", reversed(women_ids))
    numbers = db.assign_start_numbers(tournament_id, men["id"], "player", men_ids)
    assert numbers[str(women["id"])]["player"] == {str(pid): n for n, pid in enumerate(women_ids, start=1)}
    assert numbers[str(men["id"])]["player"] == {str(pid): n for n, pid in enumerate(men_ids, start=1)}

    # seeded 1, 5 and 10, the rest drawn: nobody is renumbered, asking again changes nothing
    db.save_bracket_groups(tournament_id, [
        {"name": "B2 K — Grupa A", "tournament_category_id": women["id"], "players": [women_ids[0], women_ids[3], women_ids[6], women_ids[11]]},
        {"name": "B2 K — Grupa B", "tournament_category_id": women["id"], "players": [women_ids[4], women_ids[1], women_ids[7]]},
        {"name": "B2 K — Grupa C", "tournament_category_id": women["id"], "players": [women_ids[9], women_ids[2], women_ids[8], women_ids[5], women_ids[10]]},
    ])
    again = db.assign_start_numbers(tournament_id, women["id"], "player", women_ids)
    assert again == numbers

    # a removed player's number is not given again
    db.save_bracket_groups(tournament_id, [])
    assert db.delete_player(women_ids[11], tournament_id)
    late = db.insert_player(tournament_id, "Late", "B2", "PL", gender="K")
    numbers = db.assign_start_numbers(tournament_id, women["id"], "player", [*women_ids[:11], late])
    assert str(women_ids[11]) not in numbers[str(women["id"])]["player"]
    assert numbers[str(women["id"])]["player"][str(women_ids[10])] == 11
    assert numbers[str(women["id"])]["player"][str(late)] == 13

    with pytest.raises(LookupError):
        other = db.insert_tournament("Other Cup", "2026-08-01", "2026-08-02", active=False)
        db.assign_start_numbers(other, women["id"], "player", women_ids)


def test_pairs_are_numbered_inside_their_doubles_category(db):
    tournament_id = db.insert_tournament("Pairs Cup", "2026-08-01", "2026-08-02", active=True)
    first, second = db.confirm_tournament_categories(tournament_id, [
        {"label": "B1 Double", "is_doubles": True},
        {"label": "B2 Double", "is_doubles": True},
    ])
    people = [db.insert_player(tournament_id, f"P{n}", "B1", "PL") for n in range(10)]
    a = db.insert_tournament_team(tournament_id, first["id"], people[0], people[1])
    b = db.insert_tournament_team(tournament_id, first["id"], people[2], people[3])
    c = db.insert_tournament_team(tournament_id, second["id"], people[4], people[5])
    numbers = db.fetch_start_numbers(tournament_id)
    assert numbers[str(first["id"])]["team"] == {str(a["id"]): 1, str(b["id"]): 2}
    assert numbers[str(second["id"])]["team"] == {str(c["id"]): 1}

    assert db.delete_tournament_team(b["id"])
    d = db.insert_tournament_team(tournament_id, first["id"], people[6], people[7])
    assert db.fetch_start_numbers(tournament_id)[str(first["id"])]["team"] == {str(a["id"]): 1, str(d["id"]): 3}
