import pytest


@pytest.fixture()
def umpire_app_with_temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "wyniki-doubles-display.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from flask import Flask
    from wyniki import database
    from wyniki.db_models import db
    from wyniki.api.umpire_api import blueprint as umpire_blueprint

    database.init_db()

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    app.register_blueprint(umpire_blueprint)
    return app


def _insert_person(db, tournament_id: int, first: str, last: str, country: str) -> int:
    player_id = db.insert_player(
        tournament_id,
        name=f"{first} {last}",
        first_name=first,
        last_name=last,
        category="B1",
        country=country,
        gender="K" if first.endswith("a") else "M",
    )
    assert player_id
    return int(player_id)


def test_overlay_keeps_team_label_when_point_has_one_name():
    from wyniki.api.events import _resolve_live_player_name

    existing = {
        "full_name": "Anna Kowalska / Ewa Nowak",
        "surname": "Anna Kowalska / Ewa Nowak",
    }
    assert _resolve_live_player_name(existing, {"name": "Anna Kowalska"}) == "Anna Kowalska / Ewa Nowak"
    assert _resolve_live_player_name(existing, {"name": "C / D"}) == "C / D"
    assert _resolve_live_player_name({"full_name": "Jan Kowalski"}, {"name": "Hans Mueller"}) == "Hans Mueller"


def test_rehydrate_does_not_collapse_pair_label_to_a_person():
    from wyniki.init_state import _resolve_live_player_name

    class _Match:
        tournament_id = 1

    assert _resolve_live_player_name(_Match(), "Anna Kowalska / Ewa Nowak") == "Anna Kowalska / Ewa Nowak"


def test_flag_fields_from_pair_members():
    from wyniki.api.umpire_api import _flag_fields_from_person_payload

    code, url, partner_code, partner_url = _flag_fields_from_person_payload(
        {"country_code": "PL", "partner": {"country_code": "DE"}}
    )
    assert code == "PL"
    assert partner_code == "DE"
    assert "pl.png" in (url or "")
    assert "de.png" in (partner_url or "")

    code, url, partner_code, partner_url = _flag_fields_from_person_payload(
        {"country_code": "PL", "partner": {"country_code": "PL"}}
    )
    assert code == "PL"
    assert partner_code is None
    assert partner_url is None


def test_create_match_sets_both_partner_flags(umpire_app_with_temp_db):
    from wyniki import database
    from wyniki.api.umpire_api import _apply_db_flags_to_court_state
    from wyniki.services.court_manager import ensure_court_state

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id = database.insert_tournament(
            "Flags Doubles Cup", "2026-08-13", "2026-08-15", active=True, city="Test", country="PL"
        )
        doubles = database.confirm_tournament_categories(
            tournament_id, [{"label": "B1 Double", "is_doubles": True}]
        )[0]
        p1 = _insert_person(database, tournament_id, "Anna", "Kowalska", "PL")
        p2 = _insert_person(database, tournament_id, "Ewa", "Nowak", "DE")
        p3 = _insert_person(database, tournament_id, "Jan", "Lewandowski", "PL")
        p4 = _insert_person(database, tournament_id, "Piotr", "Wiśniewski", "PL")
        team_a = database.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
        team_b = database.insert_tournament_team(tournament_id, doubles["id"], p3, p4)
        court_state = ensure_court_state(f"t{tournament_id}-1")
        _apply_db_flags_to_court_state(
            court_state,
            tournament_id,
            team_a["display_name"],
            team_b["display_name"],
        )

    assert court_state["A"]["flag_code"] == "PL"
    assert court_state["A"]["flag_code_partner"] == "DE"
    assert "pl.png" in (court_state["A"]["flag_url"] or "")
    assert "de.png" in (court_state["A"]["flag_url_partner"] or "")
    assert court_state["B"]["flag_code"] == "PL"
    assert court_state["B"]["flag_code_partner"] is None


def test_point_event_keeps_team_label_and_partner_flags(umpire_app_with_temp_db):
    from wyniki import database
    from wyniki.api.events import _apply_event_player_identity
    from wyniki.api.umpire_api import _apply_db_flags_to_court_state
    from wyniki.services.court_manager import ensure_court_state

    app = umpire_app_with_temp_db
    with app.app_context():
        tournament_id = database.insert_tournament(
            "Overlay Doubles Cup", "2026-08-13", "2026-08-15", active=True
        )
        doubles = database.confirm_tournament_categories(
            tournament_id, [{"label": "B1 Double", "is_doubles": True}]
        )[0]
        p1 = _insert_person(database, tournament_id, "Anna", "Kowalska", "PL")
        p2 = _insert_person(database, tournament_id, "Ewa", "Nowak", "DE")
        p3 = _insert_person(database, tournament_id, "Jan", "Lewandowski", "CZ")
        p4 = _insert_person(database, tournament_id, "Piotr", "Wiśniewski", "SK")
        team_a = database.insert_tournament_team(tournament_id, doubles["id"], p1, p2)
        team_b = database.insert_tournament_team(tournament_id, doubles["id"], p3, p4)
        court_state = ensure_court_state(f"t{tournament_id}-1")
        court_state["A"]["surname"] = team_a["display_name"]
        court_state["A"]["full_name"] = team_a["display_name"]
        court_state["B"]["surname"] = team_b["display_name"]
        court_state["B"]["full_name"] = team_b["display_name"]
        _apply_db_flags_to_court_state(
            court_state,
            tournament_id,
            team_a["display_name"],
            team_b["display_name"],
        )
        _apply_event_player_identity(
            court_state["A"],
            {"name": "Anna Kowalska", "flag_code": "PL", "flag_url": "https://flagcdn.com/w80/pl.png"},
        )
        _apply_event_player_identity(
            court_state["B"],
            {"name": "Jan Lewandowski", "flag_code": "CZ"},
        )

    assert court_state["A"]["full_name"] == team_a["display_name"]
    assert court_state["B"]["full_name"] == team_b["display_name"]
    assert court_state["A"]["flag_code"] == "PL"
    assert court_state["A"]["flag_code_partner"] == "DE"
    assert court_state["B"]["flag_code"] == "CZ"
    assert court_state["B"]["flag_code_partner"] == "SK"
