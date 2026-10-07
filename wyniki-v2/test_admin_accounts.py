"""Administrators sign in with their own e-mail and password, set from a mailed link.
The shared ADMIN_PASSWORD opens the door only until the first of them has a password."""
from __future__ import annotations

import re
import secrets

import pytest

SHARED = "pw-" + secrets.token_urlsafe(12)
OWN = "own-" + secrets.token_urlsafe(12)


@pytest.fixture()
def guarded(full_app_with_temp_db, monkeypatch):
    """The whole app with the admin guard on (tests usually switch it off), and mails caught."""
    from wyniki.config import settings
    from wyniki.services import admin_mails

    monkeypatch.setattr(settings, "admin_password", SHARED)
    sent = []
    monkeypatch.setattr(admin_mails, "_send_email", lambda subject, body, to, **sender: sent.append((subject, body, to)) or True)
    full_app_with_temp_db.config["TESTING"] = False
    return full_app_with_temp_db.test_client(), sent


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _token(link):
    return re.search(r"token=([^&\"]+)", link).group(1)


def test_from_the_shared_password_to_personal_accounts(guarded):
    client, sent = guarded
    # no administrator yet: the shared password, whatever the address
    legacy = client.post("/admin/api/auth", json={"email": "", "password": SHARED}).get_json()["token"]
    assert client.get("/admin/api/admins", headers=_bearer(legacy)).get_json()["shared_password"] is True
    assert client.get("/admin/api/admins").status_code == 401

    added = client.post("/admin/api/admins", headers=_bearer(legacy), json={"email": "Dawid@Example.org", "name": "Dawid"})
    assert added.status_code == 201 and added.get_json()["emailed"] is True
    subject, body, to = sent[-1]
    assert to == ["dawid@example.org"] and subject == "blindtennis.app: konto administratora"
    token = _token(added.get_json()["invite_url"])
    assert "/admin/invite?token=" in body

    assert client.get(f"/admin/api/invite/{token}").get_json()["email"] == "dawid@example.org"
    assert client.post(f"/admin/api/invite/{token}", json={"password": "short"}).status_code == 400
    session = client.post(f"/admin/api/invite/{token}", json={"password": OWN}).get_json()["token"]
    assert client.post(f"/admin/api/invite/{token}", json={"password": OWN + "x"}).status_code == 410

    # the shared password and its sessions are over; the account signs in
    assert client.post("/admin/api/auth", json={"email": "", "password": SHARED}).status_code == 403
    assert client.get("/admin/api/admins", headers=_bearer(legacy)).status_code == 401
    assert client.post("/admin/api/auth", json={"email": "dawid@example.org", "password": OWN + "x"}).status_code == 403
    signed = client.post("/admin/api/auth", json={"email": "DAWID@example.org ", "password": OWN})
    assert signed.status_code == 200
    listed = client.get("/admin/api/admins", headers=_bearer(signed.get_json()["token"])).get_json()
    assert listed["shared_password"] is False and [row["email"] for row in listed["admins"]] == ["dawid@example.org"]
    assert listed["me"] == listed["admins"][0]["id"]
    assert client.get("/admin/api/series", headers=_bearer(session)).status_code == 200


def test_a_second_administrator_never_the_last_and_never_yourself(guarded):
    client, sent = guarded
    legacy = client.post("/admin/api/auth", json={"password": SHARED}).get_json()["token"]
    first = client.post("/admin/api/admins", headers=_bearer(legacy), json={"email": "a@example.org"}).get_json()
    me = client.post(f"/admin/api/invite/{_token(first['invite_url'])}", json={"password": OWN}).get_json()["token"]
    second = client.post("/admin/api/admins", headers=_bearer(me), json={"email": "b@example.org"}).get_json()
    other_id = second["account"]["id"]

    assert client.delete(f"/admin/api/admins/{first['account']['id']}", headers=_bearer(me)).status_code == 409
    # b has no password yet: taking a away would leave nobody who can sign in
    assert client.post("/admin/api/admins", headers=_bearer(me), json={"email": "nie-adres"}).status_code == 400
    assert client.delete(f"/admin/api/admins/{other_id}", headers=_bearer(me)).get_json() == {"success": True}
    assert client.get(f"/admin/api/invite/{_token(second['invite_url'])}").status_code == 410


def test_a_forgotten_admin_password_and_an_organizer_who_is_not_an_admin(guarded):
    client, sent = guarded
    legacy = client.post("/admin/api/auth", json={"password": SHARED}).get_json()["token"]
    admin = client.post("/admin/api/admins", headers=_bearer(legacy), json={"email": "a@example.org"}).get_json()
    client.post(f"/admin/api/invite/{_token(admin['invite_url'])}", json={"password": OWN})
    from wyniki.database import accounts

    organizer = accounts.ensure_account("org@example.org")
    accounts.set_password(organizer, OWN)
    sent.clear()

    for email in ("org@example.org", "nobody@example.org"):
        assert client.post("/admin/api/forgot", json={"email": email}).get_json() == {"sent": True}
    assert sent == []
    assert client.post("/admin/api/auth", json={"email": "org@example.org", "password": OWN}).status_code == 403

    client.post("/admin/api/forgot", json={"email": "a@example.org"})
    subject, body, _ = sent[-1]
    assert subject == "blindtennis.app: nowe hasło administratora"
    session = client.post(f"/admin/api/invite/{_token(body)}", json={"password": OWN + "-2"}).get_json()["token"]
    assert client.get("/admin/api/admins", headers=_bearer(session)).status_code == 200

    # switched off, the session stops at once
    accounts.set_disabled(admin["account"]["id"], True)
    assert client.get("/admin/api/admins", headers=_bearer(session)).status_code == 401


def test_every_admin_change_names_the_administrator_and_hides_passwords(guarded):
    client, sent = guarded
    legacy = client.post("/admin/api/auth", json={"password": SHARED}).get_json()["token"]
    admin = client.post("/admin/api/admins", headers=_bearer(legacy), json={"email": "a@example.org"}).get_json()
    me = _bearer(client.post(f"/admin/api/invite/{_token(admin['invite_url'])}", json={"password": OWN}).get_json()["token"])

    from wyniki import database

    tid = int(database.insert_tournament("Log Cup", "2026-07-18", "2026-07-19"))
    series_id = client.post("/admin/api/series", headers=me, json={"name": "Log Tour"}).get_json()["id"]
    client.put(f"/admin/api/series/{series_id}/tournaments/{tid}", headers=me, json={"tier": "250"})
    client.put("/admin/api/settings/email", headers=me, json={"smtp_host": "smtp.example.org", "smtp_password": OWN})
    client.get("/admin/api/series", headers=me)  # reading is not a change

    log = client.get("/admin/api/audit", headers=me).get_json()
    assert all(row["account_email"] == "a@example.org" for row in log)
    actions = [row["action"] for row in log]
    assert actions[:3] == ["admin.admin.update_email_settings", "admin.admin_series.attach", "admin.admin_series.create"]
    attach = log[1]
    assert attach["tournament_id"] == tid and attach["tournament_name"] == "Log Cup" and attach["detail"]["tier"] == "250"
    assert log[0]["detail"]["smtp_password"] == "•••" and OWN not in str(log)
    assert client.get("/admin/api/audit").status_code == 401
