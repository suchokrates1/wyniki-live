"""Guards added after the November 2026 code review: PIN guessing, the panic cooldown,
battery alerts from unknown devices, the placeholder SECRET_KEY, late events for a finished match."""


import pytest

from wyniki.config import settings


@pytest.fixture()
def app(full_app_with_temp_db):
    return full_app_with_temp_db


def _court(app):
    from wyniki import database

    with app.app_context():
        tournament_id = database.insert_tournament("Guard Cup", "2026-11-11", "2026-11-12", active=True)
        court_id = database.create_tournament_courts(tournament_id, 1)[0]
        pin = next(c["pin"] for c in database.fetch_courts() if c["kort_id"] == court_id)
    return court_id, pin


def test_wrong_court_pins_are_capped_and_the_right_pin_is_refused_while_capped(app):
    court_id, pin = _court(app)
    client = app.test_client()
    wrong = "9999" if pin != "9999" else "1111"

    codes = [client.post(f"/api/courts/{court_id}/authorize", json={"pin": wrong}).status_code for _ in range(12)]

    assert codes[:10] == [403] * 10
    assert codes[10:] == [429, 429]
    capped = client.post(f"/api/courts/{court_id}/authorize", json={"pin": pin})
    assert capped.status_code == 429
    assert int(capped.headers["Retry-After"]) > 0


def test_a_few_wrong_pins_do_not_lock_the_umpire_out_and_success_clears_the_count(app):
    court_id, pin = _court(app)
    client = app.test_client()
    wrong = "9999" if pin != "9999" else "1111"

    for _ in range(9):
        assert client.post(f"/api/courts/{court_id}/authorize", json={"pin": wrong}).status_code == 403
    assert client.post(f"/api/courts/{court_id}/authorize", json={"pin": pin}).status_code == 200
    for _ in range(9):
        assert client.post(f"/api/courts/{court_id}/authorize", json={"pin": wrong}).status_code == 403
    assert client.post(f"/api/courts/{court_id}/authorize", json={"pin": pin}).status_code == 200


def test_the_cap_is_per_court(app):
    from wyniki import database

    with app.app_context():
        tournament_id = database.insert_tournament("Two Courts", "2026-11-11", "2026-11-12", active=True)
        first, second = database.create_tournament_courts(tournament_id, 2)
        pin = next(c["pin"] for c in database.fetch_courts() if c["kort_id"] == second)
    client = app.test_client()
    for _ in range(10):
        client.post(f"/api/courts/{first}/authorize", json={"pin": "9998"})
    assert client.post(f"/api/courts/{first}/authorize", json={"pin": "9998"}).status_code == 429
    assert client.post(f"/api/courts/{second}/authorize", json={"pin": pin}).status_code == 200


@pytest.fixture()
def panic_ready(app, monkeypatch):
    from wyniki.services import panic

    monkeypatch.setattr(settings, "waha_url", "http://waha.local")
    monkeypatch.setattr(settings, "waha_api_key", "test-key")
    monkeypatch.setattr(settings, "panic_cooldown_seconds", 60)
    sent = []
    monkeypatch.setattr(panic, "send_text", lambda chat_id, text: sent.append(text) or "id-1")
    panic.reset_cooldowns()
    with app.app_context():
        panic.set_panic_enabled(True)
        panic.add_recipient("Desk", "48000000000@c.us")
    yield sent
    panic.reset_cooldowns()


def test_naming_a_new_court_each_time_does_not_skip_the_panic_cooldown(app, panic_ready):
    client = app.test_client()

    codes = [
        client.post("/api/umpire/panic", json={"court_id": f"x{i}", "note": "spam"}).status_code
        for i in range(5)
    ]

    assert codes == [200, 429, 429, 429, 429]
    assert len(panic_ready) == 1


def test_two_courts_with_their_own_sessions_can_both_raise_the_alarm(app, panic_ready):
    from wyniki import database
    from wyniki.services.api_auth import issue_court_token

    with app.app_context():
        tournament_id = database.insert_tournament("Alarm Cup", "2026-11-11", "2026-11-12", active=True)
        first, second = database.create_tournament_courts(tournament_id, 2)
    client = app.test_client()

    def alarm(court_id):
        return client.post(
            "/api/umpire/panic",
            json={"note": "help"},
            headers={"Authorization": f"Bearer {issue_court_token(court_id)}"},
        ).status_code

    assert [alarm(first), alarm(second), alarm(first)] == [200, 200, 429]
    assert len(panic_ready) == 2


def test_a_heartbeat_without_a_court_session_lists_the_device_but_sends_no_battery_alert(app, monkeypatch):
    from wyniki.api import umpire_presence
    from wyniki.database.umpire_devices import list_umpire_devices, update_umpire_device
    from wyniki.services.api_auth import issue_court_token

    court_id, _pin = _court(app)
    alerts = []
    monkeypatch.setattr(umpire_presence, "notify_low_battery", alerts.append)
    client = app.test_client()
    headers = {"X-TennisReferee-Android-Id": "stranger-1"}

    client.post("/api/umpire-heartbeat", json={"battery_level": 50, "is_charging": False}, headers=headers)
    with app.app_context():
        update_umpire_device("stranger-1", battery_alert_percent=20)
    response = client.post("/api/umpire-heartbeat", json={"battery_level": 3, "is_charging": False}, headers=headers)

    assert response.status_code == 200
    assert "stranger-1" in [row["android_id"] for row in list_umpire_devices()]
    assert alerts == []

    signed = {**headers, "Authorization": f"Bearer {issue_court_token(court_id)}"}
    client.post(
        "/api/umpire-heartbeat",
        json={"court_id": court_id, "battery_level": 3, "is_charging": False},
        headers=signed,
    )
    assert len(alerts) == 1


@pytest.mark.parametrize("key", ["", "dev-secret-key-change-in-production", "prod-secret-key-change-me"])
def test_production_refuses_to_start_with_a_key_from_the_repository(monkeypatch, key):
    import app as app_module

    monkeypatch.setattr(settings, "flask_env", "production")
    monkeypatch.setattr(settings, "secret_key", key)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        app_module.refuse_placeholder_secret_key()


def test_a_real_key_or_a_development_run_starts(monkeypatch):
    import app as app_module

    monkeypatch.setattr(settings, "flask_env", "production")
    monkeypatch.setattr(settings, "secret_key", "a-long-random-value")
    app_module.refuse_placeholder_secret_key()
    monkeypatch.setattr(settings, "flask_env", "development")
    monkeypatch.setattr(settings, "secret_key", "dev-secret-key-change-in-production")
    app_module.refuse_placeholder_secret_key()


def test_an_event_for_a_finished_match_does_not_repaint_the_court(app):
    from wyniki.services.api_auth import issue_court_token
    from wyniki.services.court_manager import get_court_state

    court_id, _pin = _court(app)
    client = app.test_client()
    headers = {"Authorization": f"Bearer {issue_court_token(court_id)}"}
    zero = {"player1_sets": 0, "player2_sets": 0, "player1_games": 0, "player2_games": 0,
            "player1_points": 0, "player2_points": 0, "sets_history": []}
    final = {**zero, "player1_sets": 2,
             "sets_history": [{"player1_games": 4, "player2_games": 0}, {"player1_games": 4, "player2_games": 1}]}
    match_id = client.post("/api/matches", headers=headers, json={
        "court_id": court_id, "player1_name": "Jan Malicki", "player2_name": "Ana Dutra",
        "client_match_uuid": "late-end", "score": zero,
        "match_config": {"games_per_set": 4, "sets_to_win": 2}}).get_json()["id"]
    client.put(f"/api/matches/{match_id}", headers=headers, json={"score": final, "status": "finished"})
    assert client.post(f"/api/matches/{match_id}/finish", headers=headers, json={}).status_code == 200
    before = get_court_state(court_id)
    names_before = (before["A"].get("surname"), before["A"].get("full_name"), before["match_status"]["active"])

    late = client.post("/api/match-events", headers=headers, json={
        "event_type": "match_end", "court_id": court_id, "match_id": match_id,
        "player1": {"name": "Malicki", "full_name": "LATE NAME"}, "player2": {"name": "Dutra"},
        "score": {**final, "match_finished": True}})

    assert late.status_code == 200
    assert late.get_json()["match_finished"] is True
    after = get_court_state(court_id)
    assert (after["A"].get("surname"), after["A"].get("full_name"), after["match_status"]["active"]) == names_before
    assert after["A"].get("full_name") != "LATE NAME"
