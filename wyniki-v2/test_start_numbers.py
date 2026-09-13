"""Start numbers: given once per tournament, never renumbered by a draw or a deletion."""
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


def _numbers(db, tournament_id):
    return {row["name"]: row["start_number"] for row in db.fetch_players(tournament_id)}


def test_start_numbers_stay_through_draw_and_deletion(db):
    first = db.insert_tournament("Numbers Cup", "2026-08-01", "2026-08-02", active=True)
    other = db.insert_tournament("Other Cup", "2026-08-01", "2026-08-02", active=False)
    ids = [db.insert_player(first, f"Player {n}", "B2", "PL", first_name="Player", last_name=str(n)) for n in range(1, 13)]
    db.insert_player(other, "Elsewhere", "B2", "PL")
    assert _numbers(db, first) == {f"Player {n}": n for n in range(1, 13)}
    assert _numbers(db, other) == {"Elsewhere": 1}

    # seeded 1, 5 and 10 into groups, the rest drawn: nobody's number changes
    db.save_bracket_groups(first, [
        {"name": "B2 — Grupa A", "players": [ids[0], ids[3], ids[6], ids[11]]},
        {"name": "B2 — Grupa B", "players": [ids[4], ids[1], ids[7]]},
        {"name": "B2 — Grupa C", "players": [ids[9], ids[2], ids[8], ids[5], ids[10]]},
    ])
    assert _numbers(db, first) == {f"Player {n}": n for n in range(1, 13)}

    # a removed player leaves a gap; a new one gets the next number
    db.save_bracket_groups(first, [{"name": "B2 — Grupa A", "players": ids[:6]}])
    assert db.delete_player(ids[11], first)
    db.insert_player(first, "Late Entry", "B2", "PL")
    numbers = _numbers(db, first)
    assert "Player 12" not in numbers
    assert numbers["Player 11"] == 11 and numbers["Late Entry"] == 13

    from wyniki.database.players import bulk_insert_players

    assert bulk_insert_players(first, [{"name": "Bulk One"}, {"name": "Bulk Two"}]) == 2
    numbers = _numbers(db, first)
    assert numbers["Bulk One"] == 14 and numbers["Bulk Two"] == 15


def test_pairs_get_their_own_start_numbers(db):
    tournament_id = db.insert_tournament("Pairs Cup", "2026-08-01", "2026-08-02", active=True)
    doubles = db.confirm_tournament_categories(tournament_id, [{"label": "B1 Double", "is_doubles": True}])[0]
    people = [db.insert_player(tournament_id, f"P{n}", "B1", "PL") for n in range(6)]
    teams = [db.insert_tournament_team(tournament_id, doubles["id"], people[n * 2], people[n * 2 + 1]) for n in range(3)]
    assert [team["start_number"] for team in teams] == [1, 2, 3]
