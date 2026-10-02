"""Entering a player: how a name is split, and when the entry joins the shared base."""

import pytest

from wyniki.db_models import GlobalPlayer, Player, Tournament, db
from wyniki.services.player_registry import (
    create_tournament_player,
    find_or_create_global_player,
    player_payload,
    split_player_name,
    tournament_links_global_players,
)


@pytest.fixture()
def session(full_app_with_temp_db):
    """A live session on a throwaway database, rolled back after the test."""
    with full_app_with_temp_db.app_context():
        from wyniki.database import init_db

        init_db()
        yield db.session
        db.session.rollback()


def _tournament(session, **kwargs):
    tournament = Tournament(
        name=kwargs.pop("name", "RAKIETY"),
        start_date=kwargs.pop("start_date", "2026-09-26"),
        end_date=kwargs.pop("end_date", "2026-09-27"),
        **kwargs,
    )
    session.add(tournament)
    session.flush()
    return tournament


def test_a_full_name_is_split_on_the_last_space():
    assert split_player_name(name="Mateusz Ciborowski") == ("Mateusz Ciborowski", "Mateusz", "Ciborowski")
    assert split_player_name(name="Indrė Zuzevičiūtė Praškevičienė")[1:] == (
        "Indrė Zuzevičiūtė",
        "Praškevičienė",
    ), "two given names stay with the first name, the surname is the last word"
    assert split_player_name(name="Madonna") == ("Madonna", "", "Madonna"), "one word is a surname"
    assert split_player_name() == ("", "", "")


def test_the_two_name_fields_win_and_the_full_name_is_rebuilt_from_them():
    assert split_player_name(name="cokolwiek", first_name=" Anna ", last_name=" Nowak ") == (
        "cokolwiek",
        "Anna",
        "Nowak",
    ), "a name that was given is not overwritten"
    assert split_player_name(first_name="Anna", last_name="Nowak") == ("Anna Nowak", "Anna", "Nowak")


def test_a_request_payload_is_normalized_whichever_field_it_used():
    assert player_payload({"surname": " Nowak "}) == {
        "name": "Nowak", "first_name": "", "last_name": "Nowak",
        "gender": "", "category": "", "country": "",
    }
    payload = player_payload({"name": "Anna Nowak", "country_code": " PL ", "category": " B2 ", "gender": "K"})
    assert payload["first_name"] == "Anna" and payload["last_name"] == "Nowak"
    assert payload["country"] == "PL" and payload["category"] == "B2" and payload["gender"] == "K"
    assert player_payload({"name": "X", "country": "LT", "country_code": "PL"})["country"] == "LT"


def test_the_same_person_is_found_again_whatever_the_spacing_and_case(session):
    first = find_or_create_global_player(session, "Mateusz", "Ciborowski", category="B2", country="PL")
    again = find_or_create_global_player(session, " mateusz ", "CIBOROWSKI ")
    assert again is not None and again.id == first.id, "no second row for the same person"
    assert session.query(GlobalPlayer).count() == 1


def test_a_known_person_has_the_gaps_in_their_record_filled_but_nothing_overwritten(session):
    player = find_or_create_global_player(session, "Anna", "Nowak", category="B2", country="", gender="")
    find_or_create_global_player(session, "Anna", "Nowak", category="B4", country="PL", gender="K")
    assert player.category == "B2", "a class that is already set is not changed from the side"
    assert player.country == "PL" and player.gender == "K", "what was missing is filled in"


def test_someone_without_any_name_is_not_entered_into_the_base(session):
    assert find_or_create_global_player(session, "  ", "") is None
    assert session.query(GlobalPlayer).count() == 0


def test_an_entry_is_linked_to_the_shared_base(session):
    tournament = _tournament(session)
    player = create_tournament_player(
        session, tournament.id, name="Dajana Zgrzebska", category="B4", country="PL", gender="K"
    )
    session.flush()
    assert player.global_player_id is not None
    assert player.first_name == "Dajana" and player.last_name == "Zgrzebska"
    assert session.get(GlobalPlayer, player.global_player_id).last_name == "Zgrzebska"


def test_a_simulation_keeps_its_players_to_itself(session):
    """App Review Access is a fake tournament; its players must not pollute the base."""
    simulation = _tournament(session, name="App Review Access", is_simulation=1)
    player = create_tournament_player(session, simulation.id, name="Robot Testowy")
    session.flush()
    assert tournament_links_global_players(session, simulation.id) is False
    assert player.global_player_id is None
    assert session.query(GlobalPlayer).count() == 0


def test_an_unknown_tournament_is_treated_as_a_real_one(session):
    assert tournament_links_global_players(session, 99999) is True


def test_an_entry_takes_what_it_is_missing_from_the_base(session):
    tournament = _tournament(session)
    known = find_or_create_global_player(session, "Anna", "Nowak", category="B2", country="PL", gender="K")
    session.flush()
    player = create_tournament_player(
        session, tournament.id, first_name="Anna", last_name="Nowak", global_player=known
    )
    session.flush()
    assert (player.category, player.country, player.gender) == ("B2", "PL", "K")
    assert player.name == "Anna Nowak"

    different = create_tournament_player(
        session, tournament.id, first_name="Anna", last_name="Nowak", category="B4", global_player=known
    )
    session.flush()
    assert different.category == "B4", "what the entry says wins over the base"
    assert session.query(Player).filter_by(tournament_id=tournament.id).count() == 2
