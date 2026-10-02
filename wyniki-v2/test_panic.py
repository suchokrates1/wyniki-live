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
    assert text.startswith("Sędzia na korcie 3 potrzebuje pomocy. Kowalski – Nowak.")
    assert "RAKIETY" in text
    assert text.endswith("Notatka: brak piłek")


def test_a_missing_court_names_the_tablet():
    text = panic.compose_message(
        tournament="",
        court_id="",
        players="",
        note="",
        tablet=panic.tablet_label({
            "device": "OnePlus OPD2480",
            "device_model": "OPD2480",
            "platform": "android",
        }),
    )
    assert text == "Sędzia na OnePlus OPD2480 potrzebuje pomocy."
    assert "?" not in text


def test_a_missing_court_without_a_known_tablet_stays_plain():
    text = panic.compose_message(tournament="", court_id="", players="", note="odvkrk", tablet="")
    assert text == "Sędzia potrzebuje pomocy. Notatka: odvkrk"


def test_a_model_that_already_starts_with_the_brand_is_not_repeated():
    text = panic.compose_message(
        tournament="",
        court_id="",
        players="",
        note="dzmyta",
        tablet=panic.tablet_label({
            "device": "OnePlus OnePlus8Pro",
            "device_manufacturer": "OnePlus",
            "device_model": "OnePlus8Pro",
        }),
    )
    assert text == "Sędzia na OnePlus8Pro potrzebuje pomocy. Notatka: dzmyta"


def test_a_help_request_includes_the_android_id(tmp_path, monkeypatch):
    db_path = tmp_path / "panic-id.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    settings.waha_url = "http://waha.local"
    settings.waha_api_key = "test-key"
    from wyniki.database import init_db
    init_db()
    panic.reset_cooldowns()
    panic.add_recipient("Dawid", "48000000000@c.us")
    sent = []
    monkeypatch.setattr(panic, "send_text", lambda chat_id, text: sent.append(text) or True)
    body, status = panic.dispatch_panic(
        court_id="",
        note="",
        remote_addr="10.0.0.8",
        client={
            "device": "Teclast P50Ai_ROW",
            "device_manufacturer": "Teclast",
            "device_model": "P50Ai_ROW",
            "android_id": "9774d56d682e549c",
            "platform": "android",
        },
    )
    assert status == 200
    assert body["sent"] == 1
    assert sent[0].startswith("Sędzia na Teclast P50Ai_ROW potrzebuje pomocy. Id: 9774d56d682e549c.")
    from wyniki.database.connection import db_conn
    with db_conn() as conn:
        row = conn.execute("SELECT model FROM umpire_devices WHERE android_id = ?", ("9774d56d682e549c",)).fetchone()
    assert row["model"] == "P50Ai_ROW"


def test_a_teclast_without_a_court_is_still_named():
    text = panic.compose_message(
        tournament="",
        court_id="",
        players="",
        note="",
        tablet=panic.tablet_label({"device": "Teclast P50Ai_ROW", "platform": "android"}),
    )
    assert text == "Sędzia na Teclast P50Ai_ROW potrzebuje pomocy."


def test_the_message_uses_the_court_number_the_umpire_sees(monkeypatch):
    monkeypatch.setattr(panic, "get_court_state", lambda _court_id: {"court_name": "Kort 3", "A": {}, "B": {}})
    assert panic.court_context("t32-3")["court_id"] == "3"


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
    assert "Sędzia na korcie 2 potrzebuje pomocy." in sent[0][1]
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


def test_a_known_sticker_names_the_tablet_instead_of_the_model():
    text = panic.compose_message(
        tournament="",
        court_id="",
        players="",
        note="",
        tablet="Teclast P50Ai_ROW",
        android_id="deace65c4fba06cd",
        sticker="3",
    )
    assert text.startswith("Sędzia na tablecie 3 potrzebuje pomocy.")
    assert "Teclast" not in text


def test_a_desk_reply_to_the_whatsapp_shows_up_in_the_thread(tmp_path, monkeypatch):
    db_path = tmp_path / "panic-chat.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    settings.waha_url = "http://waha.local"
    settings.waha_api_key = "test-key"
    from wyniki.database import init_db
    init_db()
    panic.reset_cooldowns()
    panic.add_recipient("Dawid", "48000000000@c.us")
    monkeypatch.setattr(panic, "send_text", lambda chat_id, text: "true_chat_OUT")
    monkeypatch.setattr(panic, "recent_messages", lambda chat_id: [{
        "id": "true_chat_IN",
        "fromMe": False,
        "body": "Już idę",
        "timestamp": 1_790_000_000,
        "_data": {"parentMsgId": "OUT"},
    }])
    body, status = panic.dispatch_panic(
        court_id="",
        note="brak piłek",
        remote_addr="10.0.0.4",
        client={"android_id": "abc123", "device_model": "P50Ai_ROW", "device_manufacturer": "Teclast", "device": "Teclast P50Ai_ROW"},
    )
    assert status == 200
    token = body["thread_token"]
    viewed = panic.read_thread(token)
    assert viewed["messages"][0]["text"] == "brak piłek"
    assert viewed["messages"][1] == {"direction": "desk", "text": "Już idę"}
