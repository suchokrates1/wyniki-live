"""Tablet inventory and the one-shot low-battery WhatsApp."""
from wyniki.database.umpire_devices import remember_umpire_device, set_device_sticker, update_umpire_device
from wyniki.services.api_auth import issue_admin_token
from wyniki.services.device_alerts import consider_low_battery


def _db(tmp_path, monkeypatch):
    db_path = tmp_path / "devices.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    settings.database_path = str(db_path)
    from wyniki.database import init_db
    init_db()


def test_a_low_battery_warning_is_sent_once_until_the_tablet_recovers(tmp_path, monkeypatch):
    _db(tmp_path, monkeypatch)
    remember_umpire_device(
        android_id="deace65c4fba06cd",
        manufacturer="Teclast",
        model="P50Ai_ROW",
        device="Teclast P50Ai_ROW",
        platform="android",
        battery_level=40,
        is_charging=False,
    )
    set_device_sticker("deace65c4fba06cd", "3")
    update_umpire_device("deace65c4fba06cd", battery_alert_percent=20)
    assert consider_low_battery("deace65c4fba06cd") is None

    remember_umpire_device(android_id="deace65c4fba06cd", battery_level=15, is_charging=False)
    assert consider_low_battery("deace65c4fba06cd") == "Tablet 3 ma 15% baterii."
    assert consider_low_battery("deace65c4fba06cd") is None

    remember_umpire_device(android_id="deace65c4fba06cd", battery_level=15, is_charging=True)
    assert consider_low_battery("deace65c4fba06cd") is None
    remember_umpire_device(android_id="deace65c4fba06cd", battery_level=12, is_charging=False)
    assert consider_low_battery("deace65c4fba06cd") == "Tablet 3 ma 12% baterii."


def test_admin_can_name_a_tablet_and_set_its_battery_threshold(tmp_path, monkeypatch):
    _db(tmp_path, monkeypatch)
    remember_umpire_device(android_id="abc", model="P50Ai_ROW", manufacturer="Teclast", device="Teclast P50Ai_ROW")
    from flask import Flask
    from wyniki.api.devices import blueprint

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(blueprint)
    client = app.test_client()
    assert client.get("/admin/api/devices").status_code == 401
    token = issue_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    saved = client.put(
        "/admin/api/devices/abc",
        headers=headers,
        json={"name": "3", "battery_alert_percent": 15},
    )
    assert saved.status_code == 200
    body = saved.get_json()
    assert body["name"] == "3"
    assert body["battery_alert_percent"] == 15
    assert body["model"] == "Teclast P50Ai_ROW"
    listed = client.get("/admin/api/devices", headers=headers)
    assert listed.get_json()["devices"][0]["android_id"] == "abc"
