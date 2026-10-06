import pytest

from wyniki.database.tournament_titles import suggest_title_scope


@pytest.mark.parametrize("name, scope", [
    ("IBTA World Blind Tennis Championships 2026", "world"),
    ("Mistrzostwa Świata w Blind Tenisie", "world"),
    ("Blind Tennis Weltmeisterschaft", "world"),
    ("European Blind Tennis Championships", "continental"),
    ("Mistrzostwa Europy 2027", "continental"),
    ("III Mistrzostwa Polski w Blind Tenisie", "national"),
    ("Lietuvos aklųjų teniso čempionatas", "national"),
    ("RAKIETY ATNiS VII", "open"),
    ('Turniej Blind Tennisa "Sokole Oko"', "open"),
    ("5th Dürener Handicup 2026", "open"),
])
def test_the_scope_is_guessed_from_the_name(name, scope):
    assert suggest_title_scope(name) == scope


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "titles.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    from wyniki import database
    database.init_db()
    return database


def test_the_office_choice_beats_the_guess_and_reaches_the_bracket(db):
    from wyniki.database.tournament_titles import save_tournament_title

    tid = int(db.insert_tournament("RAKIETY ATNiS VII", "2026-09-26", "2026-09-27", city="Giebułtów", country="PL"))
    assert db.get_full_bracket(tid)["tournament"]["title_scope"] == "open"
    assert db.get_full_bracket(tid)["tournament"]["title_scope_guessed"] is True

    save_tournament_title(tid, "national", "Puchar ATNiS")
    title = db.get_full_bracket(tid)["tournament"]
    assert (title["title_scope"], title["title_override"], title["title_scope_guessed"]) == ("national", "Puchar ATNiS", False)

    save_tournament_title(tid, "galactic", "")
    assert db.get_full_bracket(tid)["tournament"]["title_scope"] == "national"
