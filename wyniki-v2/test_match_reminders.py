"""Reminders before a match and the delay warning.

The estimator is a hint, not a promise: against 311 measured matches its median
absolute error is about 12 minutes and its p90 around 50. What is tested here
is that it behaves sensibly and monotonically, that the delay threshold means
what the product decision says, and above all that nothing is ever sent twice.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

CONFIG = {"games_per_set": 4, "sets_to_win": 2}


@pytest.fixture()
def push_app(tmp_path, monkeypatch):
    db_path = tmp_path / "reminders.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    settings.vapid_public_key = "test-public"
    settings.vapid_private_key = "test-private"

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    yield app.test_client()

    settings.vapid_public_key = ""
    settings.vapid_private_key = ""


# --------------------------------------------------------------------------
# The estimator
# --------------------------------------------------------------------------

def test_a_commanding_lead_reads_as_nearly_over():
    from wyniki.services.match_pace import remaining_games

    # The user's own example: 4:0 in a set to 4 is almost done; 3:3 is not.
    lead = remaining_games({"g1": 3, "g2": 0}, CONFIG, 1, 0)
    level = remaining_games({"g1": 3, "g2": 3}, CONFIG, 1, 0)
    assert lead < level


def test_a_tiebreak_is_one_game_away_from_done():
    from wyniki.services.match_pace import remaining_games

    assert remaining_games({"tb": True, "g1": 3, "g2": 3}, CONFIG, 1, 0) == 1.0
    assert remaining_games({"stb": True}, CONFIG, 1, 1) == 1.0


def test_a_match_with_a_whole_set_still_to_come_is_longer():
    from wyniki.services.match_pace import remaining_games

    one_set_left = remaining_games({"g1": 0, "g2": 0}, CONFIG, 1, 0)
    two_sets_left = remaining_games({"g1": 0, "g2": 0}, CONFIG, 0, 0)
    assert two_sets_left > one_set_left


def test_estimates_never_go_backwards_as_the_set_progresses():
    from wyniki.services.match_pace import remaining_games

    estimates = [remaining_games({"g1": g, "g2": 0}, CONFIG, 1, 0) for g in range(4)]
    assert estimates == sorted(estimates, reverse=True), estimates


def test_the_pace_falls_back_when_there_is_no_history(push_app):
    from wyniki.services import match_pace

    match_pace.reset_pace_cache()
    # An empty database has nothing to calibrate from, so the measured median
    # from the matches we already timed is used instead of a number from noise.
    assert match_pace.pace_minutes_per_game() == match_pace.FALLBACK_PACE_MINUTES_PER_GAME


def test_a_running_timer_cannot_poison_the_pace(push_app, monkeypatch):
    from wyniki.services import match_pace

    # match_history is full of 8-hour "matches" from timers left running; the
    # same contamination must not reach this calibration.
    rows = [(40 * 60000, '[{"player1_games": 4, "player2_games": 2}]')] * 40
    rows += [(8 * 3600 * 1000, '[{"player1_games": 4, "player2_games": 0}]')] * 5

    monkeypatch.setattr(match_pace.reminders_db, "measured_match_durations", lambda: rows)
    match_pace.reset_pace_cache()
    pace = match_pace.measure_pace()

    assert 5 < pace < 8, f"40 min over 6 games is about 6.7 min/game, got {pace}"


# --------------------------------------------------------------------------
# The pass
# --------------------------------------------------------------------------

def _fixture_row(database, tournament_id, when: datetime, court="t1-1"):
    database.upsert_tournament_schedule_entries(tournament_id, [{
        "day_date": when.strftime("%Y-%m-%d"), "scheduled_time": when.strftime("%H:%M"),
        "court_id": court, "court_label": "1",
        "player1_name": "Jan Kowalski", "player2_name": "Adam Nowak",
        "phase": "Grupowa", "status": "planned",
    }])
    return database.fetch_tournament_schedule(tournament_id)[0]


def _subscribe(client, endpoint, preferences, lead=30):
    payload = {
        "endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"},
        "players": ["Jan Kowalski"], "preferences": dict(preferences, reminder_minutes=lead),
    }
    assert client.post("/api/push/subscribe", json=payload).status_code == 200


def test_a_reminder_goes_out_once_and_only_once(push_app, monkeypatch):
    from wyniki import database
    from wyniki.services import match_reminders, web_push

    tournament_id = database.insert_tournament("Reminder Cup", "2026-10-03", "2026-10-04", active=True)
    now = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    _fixture_row(database, tournament_id, now + timedelta(minutes=20))
    _subscribe(push_app, "https://push.example/a", {"notify_reminder": True}, lead=30)

    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)
    first = match_reminders.run_pass(now=now)
    second = match_reminders.run_pass(now=now)

    assert first["reminders"] == 1
    assert second["reminders"] == 0, "a second pass must not remind anyone again"


def test_everyone_is_reminded_at_their_own_lead_time(push_app, monkeypatch):
    from wyniki import database
    from wyniki.services import match_reminders, web_push

    tournament_id = database.insert_tournament("Lead Cup", "2026-10-03", "2026-10-04", active=True)
    now = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    _fixture_row(database, tournament_id, now + timedelta(minutes=40))
    _subscribe(push_app, "https://push.example/early", {"notify_reminder": True}, lead=60)
    _subscribe(push_app, "https://push.example/late", {"notify_reminder": True}, lead=15)

    reached = []
    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: reached.append(sub["endpoint"]) or 201)

    # 40 minutes out: the one who asked for 60 hears about it, the one who asked
    # for 15 does not.
    match_reminders.run_pass(now=now)
    assert reached == ["https://push.example/early"]

    reached.clear()
    match_reminders.run_pass(now=now + timedelta(minutes=30))
    assert reached == ["https://push.example/late"]


def test_a_free_court_produces_no_delay_warning(push_app, monkeypatch):
    from wyniki import database
    from wyniki.services import match_reminders, web_push

    tournament_id = database.insert_tournament("Free Cup", "2026-10-03", "2026-10-04", active=True)
    now = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    _fixture_row(database, tournament_id, now + timedelta(minutes=20))
    _subscribe(push_app, "https://push.example/d", {"notify_delay": True})

    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)
    assert match_reminders.run_pass(now=now)["delays"] == 0


def test_a_small_hold_up_is_not_worth_a_notification(push_app, monkeypatch):
    from wyniki.services import match_reminders

    # The court needs 25 more minutes and the match is 20 minutes away: five
    # minutes late is inside the estimate's own noise.
    monkeypatch.setattr(match_reminders, "court_busy_for", lambda court: 25)
    assert _run_delay_case(push_app, monkeypatch, minutes_away=20)["delays"] == 0


def test_a_real_hold_up_warns_the_players(push_app, monkeypatch):
    from wyniki.services import match_reminders

    # 50 minutes of match left against a start 20 minutes away is half an hour late.
    monkeypatch.setattr(match_reminders, "court_busy_for", lambda court: 50)
    assert _run_delay_case(push_app, monkeypatch, minutes_away=20)["delays"] == 1


def _run_delay_case(client, monkeypatch, minutes_away: int):
    from wyniki import database
    from wyniki.services import match_reminders, web_push

    tournament_id = database.insert_tournament("Delay Cup", "2026-10-03", "2026-10-04", active=True)
    now = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    _fixture_row(database, tournament_id, now + timedelta(minutes=minutes_away))
    _subscribe(client, "https://push.example/delay", {"notify_delay": True, "notify_reminder": False})

    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)
    return match_reminders.run_pass(now=now)


def test_a_send_that_reached_nobody_can_be_retried(push_app, monkeypatch):
    from wyniki import database
    from wyniki.services import match_reminders, web_push

    tournament_id = database.insert_tournament("Retry Cup", "2026-10-03", "2026-10-04", active=True)
    now = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)
    _fixture_row(database, tournament_id, now + timedelta(minutes=20))
    _subscribe(push_app, "https://push.example/r", {"notify_reminder": True})

    # Every push fails, so the claim must be given back rather than burning the
    # one chance this fixture had.
    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: None)
    assert match_reminders.run_pass(now=now)["reminders"] == 0

    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)
    assert match_reminders.run_pass(now=now)["reminders"] == 1


def test_the_pass_does_nothing_at_all_while_push_is_unconfigured(push_app, monkeypatch):
    from wyniki.config import settings
    from wyniki.services import match_reminders

    settings.vapid_private_key = ""
    assert match_reminders.run_pass() == {"reminders": 0, "delays": 0}


def test_the_loop_never_starts_under_pytest():
    from wyniki.services import reminder_loop

    # PYTEST_CURRENT_TEST is set while this runs, which is exactly the guard.
    assert reminder_loop.should_start() is False
