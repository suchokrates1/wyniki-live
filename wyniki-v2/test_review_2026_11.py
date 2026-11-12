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


def test_a_dead_battery_is_stored_and_a_nonsense_level_is_ignored(app):
    from wyniki.services.court_manager import get_court_state

    court_id, _pin = _court(app)
    client = app.test_client()

    dead = client.post(
        "/api/umpire-heartbeat",
        json={"court_id": court_id, "battery_level": 0, "is_charging": False},
    )
    assert dead.status_code == 200
    assert get_court_state(court_id)["battery_level"] == 0

    nonsense = client.post(
        "/api/umpire-heartbeat",
        json={"court_id": court_id, "battery_level": "nope"},
    )
    assert nonsense.status_code == 200
    assert get_court_state(court_id)["battery_level"] == 0


@pytest.mark.parametrize("key", ["", "change-me", "dev-secret-key-change-in-production", "prod-secret-key-change-me"])
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


def test_a_super_tiebreak_to_seven_is_shown_as_played():
    from wyniki.database.bracket_standings import _build_set_detail

    played = {"set_number": 3, "player1_games": 7, "player2_games": 4,
              "tiebreak_loser_points": 4, "is_super_tiebreak": True}
    assert _build_set_detail(played) == {"g1": 7, "g2": 4, "tb": None, "stb": True}
    assert _build_set_detail({**played, "player1_games": 10, "player2_games": 12, "tiebreak_loser_points": 10}) \
        == {"g1": 10, "g2": 12, "tb": None, "stb": True}
    # rows stored the old way (games 1:0 and the loser's points) are still rebuilt
    legacy = {"set_number": 3, "player1_games": 1, "player2_games": 0, "tiebreak_loser_points": 8}
    assert _build_set_detail(legacy) == {"g1": 10, "g2": 8, "tb": None, "stb": True}


def test_a_doubles_final_advances_when_the_tablet_names_the_partners_the_other_way_round(app):
    from wyniki import database
    from wyniki.database.connection import db_conn

    court_id, _pin = _court(app)
    with app.app_context():
        tournament_id = database.get_tournament_id_for_court(court_id)
        with db_conn() as conn:
            conn.execute(
                "INSERT INTO bracket_knockout (tournament_id, phase, position, player1_name, player2_name) VALUES (?,?,?,?,?)",
                (tournament_id, "Debel — Finał", 1, "Nowak Jan / Kowal Adam", "Lis Ewa / Mak Ola"),
            )
            conn.execute(
                """INSERT INTO matches (court_id, player1_name, player2_name, status, tournament_id, phase,
                   player1_sets, player2_sets, sets_history, winner_name, finish_reason, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (court_id, "Kowal Adam / Nowak Jan", "Lis Ewa / Mak Ola", "finished", tournament_id, "Debel — Finał",
                 2, 0, '[{"player1_games":4,"player2_games":0},{"player1_games":4,"player2_games":1}]',
                 "Kowal Adam / Nowak Jan", "normal", "2026-11-11T10:00:00", "2026-11-11T10:30:00"),
            )
            match_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.commit()

        assert database.advance_knockout(match_id, tournament_id) is True
        with db_conn() as conn:
            slot = conn.execute(
                "SELECT winner_name, score_summary FROM bracket_knockout WHERE tournament_id = ? AND phase = ?",
                (tournament_id, "Debel — Finał"),
            ).fetchone()
    # the winner is written the way the draw spells the pair
    assert slot["winner_name"] == "Nowak Jan / Kowal Adam"
    assert slot["score_summary"] == "4:0 4:1"


def test_an_office_result_time_must_be_a_real_timestamp():
    from wyniki.services.office_workflow import OfficeWorkflowError, _recorded_at

    assert _recorded_at({}, "2026-11-12T00:00:00+00:00") == "2026-11-12T00:00:00+00:00"
    assert _recorded_at({"ended_at": ""}, "now") == "now"
    assert _recorded_at({"ended_at": "2026-11-11T18:00:00+00:00"}, "now") == "2026-11-11T18:00:00+00:00"
    assert _recorded_at({"ended_at": "2026-11-11T18:00:00Z"}, "now") == "2026-11-11T18:00:00+00:00"
    for broken in ("yesterday", "2026-13-40", 1_700_000_000, {"at": "now"}):
        with pytest.raises(OfficeWorkflowError):
            _recorded_at({"ended_at": broken}, "now")


def test_an_office_result_with_an_unreadable_set_is_refused_not_shortened():
    from wyniki.services.office_workflow import _normalize_office_sets

    good = [{"player1_games": 4, "player2_games": 1}, {"player1_games": "4", "player2_games": "2"}]
    sets, s1, s2 = _normalize_office_sets({"sets": [*good, {"player1_games": "", "player2_games": None}]}, "A", "B")
    assert (len(sets), s1, s2) == (2, 2, 0)  # the empty third row of the form is not a set

    for broken in (
        [good[0], {"player1_games": "x", "player2_games": 4}, good[1]],
        [good[0], {"player1_games": "", "player2_games": 4}],
        [good[0], {"player1_games": "", "player2_games": ""}, good[1]],
        [good[0], "4:2"],
    ):
        with pytest.raises(ValueError):
            _normalize_office_sets({"sets": broken}, "A", "B")


def test_malformed_umpire_requests_get_400(app):
    from wyniki.services.api_auth import issue_court_token

    court_id, _pin = _court(app)
    client = app.test_client()
    headers = {"Authorization": f"Bearer {issue_court_token(court_id)}"}
    zero = {"player1_sets": 0, "player2_sets": 0, "player1_games": 0, "player2_games": 0,
            "player1_points": 0, "player2_points": 0, "sets_history": []}
    match_id = client.post("/api/matches", headers=headers, json={
        "court_id": court_id, "player1_name": "A", "player2_name": "B",
        "client_match_uuid": "bad-input", "score": zero}).get_json()["id"]

    assert client.put(f"/api/matches/{match_id}", headers=headers, data="", content_type="application/json").status_code == 400
    assert client.put(f"/api/matches/{match_id}", headers=headers, data="{not json", content_type="application/json").status_code == 400
    assert client.put(f"/api/matches/{match_id}", headers=headers, json={"score": "4:0"}).status_code == 400
    assert client.post("/api/match-events", headers=headers, data="", content_type="application/json").status_code == 400
    assert client.post("/api/match-events", headers=headers,
                       json={"court_id": court_id, "score": {"player1_points": "abc"}}).status_code == 400
    assert client.post("/api/match-events", headers=headers,
                       json={"court_id": court_id, "score": [1, 2]}).status_code == 400
    assert client.post("/api/match-statistics", headers=headers, data="", content_type="application/json").status_code == 400


def test_a_500_never_quotes_the_exception(app):
    @app.route("/api/_boom")
    def boom():
        raise RuntimeError("no such table: secret_things at /srv/app/data.sqlite3")

    app.config["PROPAGATE_EXCEPTIONS"] = False
    response = app.test_client().get("/api/_boom")
    assert response.status_code == 500
    assert response.get_json() == {"error": "Internal error"}


def test_match_finished_emails_run_on_a_background_thread_with_an_intact_snapshot(app, monkeypatch):
    import threading
    from wyniki import database
    from wyniki.services import email_reports, umpire_match_finalize
    from wyniki.services.api_auth import issue_court_token

    with app.app_context():
        tournament_id = database.insert_tournament(
            "Async Mail Cup", "2026-11-11", "2026-11-12", active=True, report_email="biuro@example.com"
        )
        court_id = database.create_tournament_courts(tournament_id, 1)[0]

    captured = []
    done = threading.Event()
    request_thread = threading.get_ident()

    def fake_send_report(match_obj, state_snapshot, tournament):
        captured.append({
            "thread": threading.get_ident(),
            "player1": match_obj.player1_name,
            "set1_a": state_snapshot["A"]["set1"],
            "report_email": (tournament or {}).get("report_email"),
        })
        done.set()
        return True

    monkeypatch.setattr(email_reports, "send_match_report", fake_send_report)
    monkeypatch.setattr(email_reports, "maybe_send_tournament_summary", lambda tid: False)
    # Prevent 5s clear-overlay Timer from waiting in production-mode branch during test
    monkeypatch.setattr(umpire_match_finalize.threading, "Timer", lambda _delay, fn: threading.Thread(target=fn, daemon=True))

    headers = {"Authorization": f"Bearer {issue_court_token(court_id)}"}
    client = app.test_client()
    created = client.post("/api/matches", headers=headers, json={
        "court_id": court_id,
        "player1_name": "Ada",
        "player2_name": "Bea",
        "client_match_uuid": "mail-bg-1",
        "score": {"player1_sets": 0, "player2_sets": 0, "sets_history": []},
    }).get_json()

    app.config["TESTING"] = False
    try:
        resp = client.put(f"/api/matches/{created['id']}", headers=headers, json={
            "status": "finished",
            "score": {
                "player1_sets": 2,
                "player2_sets": 0,
                "sets_history": [{"player1_games": 4, "player2_games": 1}, {"player1_games": 4, "player2_games": 2}],
            },
        })
        assert resp.status_code == 200
        assert done.wait(timeout=5.0), "background email thread did not run"
    finally:
        app.config["TESTING"] = True

    assert len(captured) == 1
    assert captured[0]["thread"] != request_thread
    assert captured[0]["player1"] == "Ada"
    assert captured[0]["set1_a"] == 4
    assert captured[0]["report_email"] == "biuro@example.com"


def test_office_refusal_includes_stable_error_code(app):
    from werkzeug.security import generate_password_hash
    from wyniki import database

    with app.app_context():
        database.insert_tournament(
            "Office Code Cup", "2026-11-11", "2026-11-12",
            active=True, office_password_hash=generate_password_hash("secret123"),
        )
    client = app.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "secret123"}).get_json()
    headers = {"Authorization": f"Bearer {auth['token']}"}

    resp = client.post("/api/office/1/group-matches", headers=headers, json={})
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["code"] == "group_players_required"
    assert "error" in body


def test_office_reads_do_not_write_and_dashboard_connection_count_stays_constant(app, monkeypatch):
    from werkzeug.security import generate_password_hash
    from wyniki import database
    from wyniki.database import connection as conn_mod
    from wyniki.services.office_workflow import _build_office_dashboard

    with app.app_context():
        tid = database.insert_tournament(
            "Constant Conn Cup", "2026-11-11", "2026-11-12",
            active=True, office_password_hash=generate_password_hash("secret123"),
        )
        pids = [
            database.insert_player(tid, f"Player {i}", "B1", "PL", first_name="Player", last_name=str(i))
            for i in range(1, 13)
        ]
        database.save_bracket_groups(tid, [{"name": "B1 — Grupa A", "players": pids[:2]}])

    real_db_conn = conn_mod.db_conn
    opens = []

    from contextlib import contextmanager

    @contextmanager
    def counting_conn():
        opens.append(1)
        with real_db_conn() as c:
            yield c

    # Patch db_conn in modules invoked by _build_office_dashboard
    from wyniki.database import brackets as brackets_mod, courts as courts_mod, court_streams as streams_mod
    from wyniki.database import schedule as sched_mod, tournaments as tourn_mod

    for mod in (brackets_mod, courts_mod, streams_mod, sched_mod, tourn_mod):
        if hasattr(mod, "db_conn"):
            monkeypatch.setattr(mod, "db_conn", counting_conn)

    with app.app_context():
        opens.clear()
        _build_office_dashboard(tid)
        conns_one_group = len(opens)

        database.save_bracket_groups(
            tid,
            [{"name": f"B1 — Grupa {chr(65 + g)}", "players": pids[g * 2 : g * 2 + 2]} for g in range(6)],
        )
        opens.clear()
        dash = _build_office_dashboard(tid)
        conns_six_groups = len(opens)

    assert conns_six_groups == conns_one_group, f"expected O(1) connections, got {conns_one_group} vs {conns_six_groups}"
    assert dash["progress"]["expected_matches"] == 6

    client = app.test_client()
    token = client.post("/api/office/1/auth", json={"password": "secret123"}).get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify GET routes do not write schedule rows when the schedule table was cleared behind the scenes
    with real_db_conn() as conn:
        conn.execute("DELETE FROM tournament_schedule WHERE tournament_id = ?", (tid,))
        conn.commit()
    assert client.get("/api/office/1/dashboard", headers=headers).status_code == 200
    assert client.get("/api/office/1/schedule", headers=headers).status_code == 200
    assert client.get("/api/office/1/planning", headers=headers).status_code == 200
    assert database.fetch_tournament_schedule(tid) == []
