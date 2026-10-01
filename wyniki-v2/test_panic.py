"""Panic message, cooldown, and the umpire endpoint. WAHA is mocked."""
from datetime import datetime, timezone

from wyniki.services import panic
from wyniki.services.api_auth import issue_admin_token


def test_compose_message_includes_court_players_and_note():
    text = panic.compose_message(
        tournament="RAKIETY",
        court_id="3",
        players="Kowalski – Nowak",
        note="brak piłek",
        when=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
    )
    assert text.startswith("[PANIC] RAKIETY · Kort 3 · Kowalski – Nowak · 2026-10-01 12:00 UTC")
    assert text.endswith("brak piłek")


def test_cooldown_blocks_the_second_call(monkeypatch):
    panic.reset_cooldowns()
    monkeypatch.setattr(panic.settings, "panic_cooldown_seconds", 60)
    panic.mark_sent("court:1", now=1000.0)
    assert panic.cooldown_remaining("court:1", now=1030.0) == 30
    assert panic.cooldown_remaining("court:1", now=1061.0) == 0


def test_dispatch_sends_once_then_cools_down(tmp_path, monkeypatch):
    db_path = tmp_path / "panic.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    settings.waha_url = "http://waha.local"
    settings.waha_api_key = "test-key"
    settings.panic_cooldown_seconds = 60

    from wyniki.database import init_db
    init_db()
    panic.reset_cooldowns()
    panic.add_recipient("Dawid", "48000000000@c.us")

    sent = []
    monkeypatch.setattr(panic, "send_text", lambda chat_id, text: sent.append((chat_id, text)) or True)

    body, status = panic.dispatch_panic(court_id="2", note="medyczny", remote_addr="10.0.0.1")
    assert status == 200
    assert body["sent"] == 1
    assert "Kort 2" in sent[0][1]
    assert "medyczny" in sent[0][1]

    again, again_status = panic.dispatch_panic(court_id="2", note="", remote_addr="10.0.0.1")
    assert again_status == 429
    assert len(sent) == 1


def test_endpoint_requires_configuration(tmp_path, monkeypatch):
    db_path = tmp_path / "panic-app.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    settings.waha_url = ""
    settings.waha_api_key = ""

    from flask import Flask
    from wyniki.database import init_db
    from wyniki.api.panic import umpire_blueprint, admin_blueprint

    init_db()
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(umpire_blueprint)
    app.register_blueprint(admin_blueprint)
    client = app.test_client()

    response = client.post("/api/umpire/panic", json={"note": "test"})
    assert response.status_code == 503

    denied = client.get("/admin/api/panic/settings")
    assert denied.status_code == 401

    token = issue_admin_token()
    listed = client.get("/admin/api/panic/settings", headers={"Authorization": f"Bearer {token}"})
    assert listed.status_code == 200
    assert listed.get_json()["recipients"] == []
