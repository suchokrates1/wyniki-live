"""A database that will not write is a server error, never an empty result.

The layer used to log the failure and hand back None or False, which every caller
above reads as "there is no such row". The office then sees a 404 for a match it
is looking at, or a save that quietly did nothing.
"""
import sqlite3

import pytest

from wyniki.database import categories, courts, history, players, teams, tournaments
from wyniki.database.errors import StorageError


class _Locked:
    """Stands in for db_conn() on a database that cannot be written to."""

    def __enter__(self):
        raise sqlite3.OperationalError("database is locked")

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.fixture
def locked(monkeypatch):
    def lock(module):
        monkeypatch.setattr(module, "db_conn", lambda: _Locked())

    return lock


def test_a_tournament_write_raises_instead_of_reporting_nothing_saved(locked):
    locked(tournaments)
    with pytest.raises(StorageError):
        tournaments.insert_tournament("RAKIETY", "2026-09-26", "2026-09-27")
    with pytest.raises(StorageError):
        tournaments.update_tournament(1, "Inna nazwa", "2026-09-26", "2026-09-27", True)
    with pytest.raises(StorageError):
        tournaments.delete_tournament(1)
    with pytest.raises(StorageError):
        tournaments.set_active_tournament(1)
    with pytest.raises(StorageError):
        tournaments.set_tournament_active_state(1, True)
    with pytest.raises(StorageError):
        tournaments.mark_tournament_summary_sent(1)


def test_a_player_write_raises(locked):
    locked(players)
    with pytest.raises(StorageError):
        players.insert_player(1, "Kowalski")
    with pytest.raises(StorageError):
        players.update_player(1, "Nowak", "B2", "PL")
    with pytest.raises(StorageError):
        players.delete_player(1)


def test_a_category_write_raises(locked):
    locked(categories)
    with pytest.raises(StorageError):
        categories.insert_tournament_category(1, label="B2 Mężczyźni")
    with pytest.raises(StorageError):
        categories.update_tournament_category(2, label="B2 Kobiety")
    with pytest.raises(StorageError):
        categories.delete_tournament_category(2, force=True)


def test_a_court_a_team_and_a_history_write_raise(locked):
    locked(courts)
    with pytest.raises(StorageError):
        courts.delete_court("t32-1")
    with pytest.raises(StorageError):
        courts.rename_court("t32-1", "t32-9")

    locked(teams)
    with pytest.raises(StorageError):
        teams.delete_tournament_team(2)

    locked(history)
    with pytest.raises(StorageError):
        history.delete_latest_history_entry()


def test_reads_still_come_back_empty_rather_than_blowing_up(locked):
    """A page that cannot reach the database shows nothing; it does not 500."""
    locked(tournaments)
    assert tournaments.fetch_tournaments() == []
    assert tournaments.fetch_tournament(1) is None
    assert tournaments.get_active_tournament_id() is None
    locked(players)
    assert players.fetch_players(1) == []


def test_the_api_turns_a_storage_failure_into_a_json_500(full_app_with_temp_db, monkeypatch):
    """Registered once for the whole app, so a new endpoint is covered the day it lands."""
    from wyniki.services import tournament_settings

    def locked_write(*_args, **_kwargs):
        raise StorageError("insert_tournament")

    monkeypatch.setattr(tournament_settings, "insert_tournament", locked_write)
    client = full_app_with_temp_db.test_client()
    response = client.post(
        "/admin/api/tournaments",
        data={"name": "RAKIETY", "start_date": "2026-09-26", "end_date": "2026-09-27"},
    )
    assert response.status_code == 500
    assert response.get_json()["error"] == "Save failed", "a JSON body, not Flask's HTML page"


def test_the_four_writes_that_stay_quiet_on_purpose(locked, monkeypatch):
    """Not every write should shout. These four are deliberate, and stay that way.

    * save_bracket_groups / save_bracket_knockout already answer False, and their
      endpoints turn that into a 500 with a message of their own.
    * advance_knockout runs after a match is finished; a bracket that cannot move
      must not fail the finish, so its callers log and carry on.
    * claim_send is the lock that stops a reminder going out twice. A missed
      reminder beats a crashed reminder loop.
    """
    from wyniki.database import brackets, push_subscriptions

    locked(brackets)
    assert brackets.save_bracket_groups(1, [{"name": "A", "players": []}]) is False
    assert brackets.save_bracket_knockout(1, []) is False
    assert brackets.advance_knockout(1, 1) is False

    locked(push_subscriptions)
    assert push_subscriptions.claim_send(1, "reminder:30") is False
    # This one already re-raises what the database threw, which the app turns into a 500.
    with pytest.raises(sqlite3.OperationalError):
        push_subscriptions.save_subscription("https://push.example/1", "key", "auth")
