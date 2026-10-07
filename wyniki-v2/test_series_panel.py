"""Series, their people and the organizer's sign-in: the walls between series hold."""
from __future__ import annotations

import re

import pytest

PASSWORD = "dobre-haslo-123"


@pytest.fixture()
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "series.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    from wyniki import database

    database.init_db()
    from wyniki.services import organizer_auth

    organizer_auth.reset_throttle()
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def client(app):
    return app.test_client()


def _tournament(name, start="2026-07-17"):
    from wyniki import database

    return int(database.insert_tournament(name, start, start, city="Düren", country="DE"))


def _series_with_member(client, name="Takei World Tennis Tour", email="ivan@takeitour.com"):
    created = client.post("/admin/api/series", json={"name": name, "slug": "twt" if "Takei" in name else ""})
    assert created.status_code == 201
    series_id = created.get_json()["id"]
    invited = client.post(f"/admin/api/series/{series_id}/members", json={"email": email, "name": "Ivan", "role": "owner"})
    assert invited.status_code == 201
    return series_id, invited.get_json()


def _token_from(invite_url):
    return re.search(r"token=([^&]+)", invite_url).group(1)


def _sign_in(client, email="ivan@takeitour.com", password=PASSWORD):
    response = client.post("/organizer/api/auth", json={"email": email, "password": password})
    return response, (response.get_json() or {}).get("token")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_invitation_sets_a_password_once_and_then_the_person_signs_in(client):
    series_id, invited = _series_with_member(client)
    assert invited["emailed"] is False  # no SMTP in tests: the admin passes the link on
    token = _token_from(invited["invite_url"])

    info = client.get(f"/organizer/api/invite/{token}").get_json()
    assert info["email"] == "ivan@takeitour.com" and info["series"] == ["Takei World Tennis Tour"]
    assert client.post(f"/organizer/api/invite/{token}", json={"password": "short"}).status_code == 400
    accepted = client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD})
    assert accepted.status_code == 200 and accepted.get_json()["token"]
    # the link is spent
    assert client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD + "x"}).status_code == 410

    response, session = _sign_in(client, email="IVAN@takeitour.com ")
    assert response.status_code == 200
    me = client.get("/organizer/api/me", headers=_auth(session)).get_json()
    assert me["account"]["email"] == "ivan@takeitour.com"
    assert [item["slug"] for item in me["series"]] == ["twt"]
    assert me["series"][0]["role"] == "owner"


def test_a_series_shows_its_tournaments_with_their_tier_and_nothing_else(client):
    series_id, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    duren = _tournament("5th Dürener Handicup 2026")
    _tournament("Turniej spoza serii")
    client.put(f"/admin/api/series/{series_id}/tournaments/{duren}", json={"tier": "CH50"})

    _, session = _sign_in(client)
    listed = client.get(f"/organizer/api/series/{series_id}/tournaments", headers=_auth(session)).get_json()
    assert [(row["name"], row["tier"]) for row in listed] == [("5th Dürener Handicup 2026", "CH50")]


def test_another_series_is_off_limits(client):
    twt, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    other, _ = _series_with_member(client, name="Inna seria", email="ktos@example.org")

    _, session = _sign_in(client)
    assert client.get(f"/organizer/api/series/{other}/tournaments", headers=_auth(session)).status_code == 403
    assert client.get(f"/organizer/api/series/{twt}/tournaments", headers=_auth(session)).status_code == 200


def test_every_organizer_route_wants_a_session(app, client):
    from wyniki.api.organizer import OPEN_ENDPOINTS

    guarded = [rule for rule in app.url_map.iter_rules() if rule.rule.startswith("/organizer/api") and rule.endpoint not in OPEN_ENDPOINTS]
    assert guarded, "no organizer routes found"
    for rule in guarded:
        url = re.sub(r"<(?:int:)?\w+>", "1", rule.rule)
        for method in rule.methods - {"HEAD", "OPTIONS"}:
            response = client.open(url, method=method, headers=_auth("forged"))
            assert response.status_code == 401, f"{method} {rule.rule} answered {response.status_code}"


def test_switching_an_account_off_or_taking_it_off_the_series_works_at_once(client):
    series_id, invited = _series_with_member(client)
    account_id = invited["account"]["id"]
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    _, session = _sign_in(client)

    client.delete(f"/admin/api/series/{series_id}/members/{account_id}")
    assert client.get("/organizer/api/me", headers=_auth(session)).get_json()["series"] == []
    assert client.get(f"/organizer/api/series/{series_id}/tournaments", headers=_auth(session)).status_code == 403

    client.post(f"/admin/api/series/{series_id}/members", json={"email": "ivan@takeitour.com"})
    client.patch(f"/admin/api/series/{series_id}/members/{account_id}", json={"disabled": True})
    assert client.get("/organizer/api/me", headers=_auth(session)).status_code == 401
    assert _sign_in(client)[0].status_code == 403


def test_wrong_passwords_are_throttled(client):
    _, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    for _ in range(5):
        assert _sign_in(client, password="zle-haslo-000")[0].status_code == 403
    assert _sign_in(client)[0].status_code == 429


def test_an_account_without_a_password_cannot_sign_in(client):
    _series_with_member(client)
    assert _sign_in(client, password="")[0].status_code == 403
    assert _sign_in(client, password="cokolwiek-123")[0].status_code == 403


def test_series_slugs_stay_unique(client):
    first = client.post("/admin/api/series", json={"name": "Takei World Tour"}).get_json()
    second = client.post("/admin/api/series", json={"name": "Takei World Tour"}).get_json()
    assert first["slug"] == "takei-world-tour" and second["slug"] == "takei-world-tour-2"
