"""The owner alert reaches the SOS recipients who are switched on. WAHA is mocked."""
from wyniki.services import owner_alert, panic


def _database(tmp_path, monkeypatch, waha: bool = True):
    db_path = tmp_path / "alert.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    monkeypatch.setattr(settings, "database_path", str(db_path))
    monkeypatch.setattr(settings, "waha_url", "http://waha.local" if waha else "")
    monkeypatch.setattr(settings, "waha_api_key", "test-key" if waha else "")
    from wyniki.database import init_db
    init_db()


def test_the_alert_goes_to_enabled_recipients_only(tmp_path, monkeypatch):
    _database(tmp_path, monkeypatch)
    panic.add_recipient("Dawid", "48000000000@c.us")
    off = panic.add_recipient("Ktoś", "48111111111@c.us")
    panic.update_recipient(off["id"], enabled=False)
    sent = []
    monkeypatch.setattr(owner_alert, "send_text", lambda chat_id, text: sent.append((chat_id, text)) or "id")

    assert owner_alert.send_owner_alert("  Kamera 4: plik nie rośnie od 3 min ") == 1
    assert sent == [("48000000000@c.us", "Kamera 4: plik nie rośnie od 3 min")]


def test_nothing_is_sent_without_waha_or_text(tmp_path, monkeypatch):
    _database(tmp_path, monkeypatch, waha=False)
    panic.add_recipient("Dawid", "48000000000@c.us")
    monkeypatch.setattr(owner_alert, "send_text", lambda chat_id, text: (_ for _ in ()).throw(AssertionError("sent")))

    assert owner_alert.send_owner_alert("Kamera 1") == 0
    assert owner_alert.main([]) == 2
