"""The SMTP password is stored encrypted, never sent to the browser, and kept when the form leaves it empty."""
from __future__ import annotations

import secrets

SECRET = "app-" + secrets.token_urlsafe(9)


def _stored(key="smtp_password"):
    from wyniki.database import fetch_app_settings

    return fetch_app_settings([key]).get(key) or ""


def test_the_password_is_sealed_hidden_from_the_form_and_kept_when_left_empty(full_app_with_temp_db):
    from wyniki.services.email_reports import get_email_settings

    client = full_app_with_temp_db.test_client()
    form = {"smtp_host": "smtp.example.org", "smtp_port": 587, "smtp_username": "u@example.org",
            "smtp_from_email": "noreply@example.org", "smtp_from_name": "blindtennis.app", "smtp_use_tls": True}
    client.put("/admin/api/settings/email", json={**form, "smtp_password": SECRET})
    assert _stored().startswith("enc:v1:") and SECRET not in _stored()

    shown = client.get("/admin/api/settings/email").get_json()
    assert shown["smtp_password"] == "" and shown["smtp_password_set"] is True
    assert get_email_settings()["smtp_password"] == SECRET  # the sender still reads it

    client.put("/admin/api/settings/email", json={**form, "smtp_password": ""})
    assert get_email_settings()["smtp_password"] == SECRET
    client.put("/admin/api/settings/email", json={**form, "smtp_password_clear": True})
    assert client.get("/admin/api/settings/email").get_json()["smtp_password_set"] is False


def test_a_password_stored_before_encryption_is_sealed_when_first_read(full_app_with_temp_db):
    from wyniki.database import upsert_app_settings
    from wyniki.services.email_reports import get_email_settings

    upsert_app_settings({"smtp_password": SECRET})
    assert get_email_settings()["smtp_password"] == SECRET
    assert _stored().startswith("enc:v1:")


def test_another_servers_key_does_not_open_it(full_app_with_temp_db, monkeypatch):
    from wyniki.config import settings
    from wyniki.services import secret_box

    sealed = secret_box.seal(SECRET)
    monkeypatch.setattr(settings, "secret_key", "another-server-" + secrets.token_hex(8))
    assert secret_box.open_sealed(sealed) == ""
