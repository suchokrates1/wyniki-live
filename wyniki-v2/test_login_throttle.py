"""Wrong passwords at the admin's and the office's sign-in are capped per client, door by door."""
from __future__ import annotations

import secrets

PASSWORD = "pw-" + secrets.token_urlsafe(12)


def test_five_wrong_admin_passwords_close_the_door_to_that_client_only(full_app_with_temp_db, monkeypatch):
    from wyniki.config import settings

    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    client = full_app_with_temp_db.test_client()
    here = {"CF-Connecting-IP": "203.0.113.5"}
    elsewhere = {"CF-Connecting-IP": "198.51.100.7"}
    assert [client.post("/admin/api/auth", json={"password": "zle"}, headers=here).status_code for _ in range(5)] == [403] * 5
    # even the right password waits now, from this client; another client signs in
    assert client.post("/admin/api/auth", json={"password": PASSWORD}, headers=here).status_code == 429
    assert client.post("/admin/api/auth", json={"password": PASSWORD}, headers=elsewhere).status_code == 200


def test_a_right_admin_password_wipes_the_count(full_app_with_temp_db, monkeypatch):
    from wyniki.config import settings

    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    client = full_app_with_temp_db.test_client()
    for _ in range(4):
        client.post("/admin/api/auth", json={"password": "zle"})
    assert client.post("/admin/api/auth", json={"password": PASSWORD}).status_code == 200
    assert [client.post("/admin/api/auth", json={"password": "zle"}).status_code for _ in range(5)] == [403] * 5


def test_the_office_door_has_its_own_count(full_app_with_temp_db, monkeypatch):
    from werkzeug.security import generate_password_hash

    from wyniki import database
    from wyniki.config import settings

    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    database.insert_tournament("Throttle Cup", "2026-07-18", "2026-07-19", active=True,
                               office_password_hash=generate_password_hash("biuro"))
    client = full_app_with_temp_db.test_client()
    assert [client.post("/api/office/1/auth", json={"password": "zle"}).status_code for _ in range(5)] == [403] * 5
    assert client.post("/api/office/1/auth", json={"password": "biuro"}).status_code == 429
    assert client.post("/admin/api/auth", json={"password": PASSWORD}).status_code == 200
