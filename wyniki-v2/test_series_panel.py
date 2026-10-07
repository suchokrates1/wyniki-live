"""Series, their people and the organizer's sign-in: the walls between series hold."""
from __future__ import annotations

import re
import secrets

import pytest

# made up per run: no password literal sits in the repository
PASSWORD = secrets.token_urlsafe(12)


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


def _series_with_member(client, name="Takei World Tennis Tour", email="organizer@example.org"):
    created = client.post("/admin/api/series", json={"name": name, "slug": "twt" if "Takei" in name else ""})
    assert created.status_code == 201
    series_id = created.get_json()["id"]
    invited = client.post(f"/admin/api/series/{series_id}/members", json={"email": email, "name": "Jan", "role": "owner"})
    assert invited.status_code == 201
    return series_id, invited.get_json()


def _token_from(invite_url):
    return re.search(r"token=([^&]+)", invite_url).group(1)


def _sign_in(client, email="organizer@example.org", password=PASSWORD):
    response = client.post("/organizer/api/auth", json={"email": email, "password": password})
    return response, (response.get_json() or {}).get("token")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_invitation_sets_a_password_once_and_then_the_person_signs_in(client):
    series_id, invited = _series_with_member(client)
    assert invited["emailed"] is False  # no SMTP in tests: the admin passes the link on
    token = _token_from(invited["invite_url"])

    info = client.get(f"/organizer/api/invite/{token}").get_json()
    assert info["email"] == "organizer@example.org" and info["series"] == ["Takei World Tennis Tour"]
    assert client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD[:4]}).status_code == 400
    accepted = client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD})
    assert accepted.status_code == 200 and accepted.get_json()["token"]
    # the link is spent
    assert client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD + "x"}).status_code == 410

    response, session = _sign_in(client, email="ORGANIZER@example.org ")
    assert response.status_code == 200
    me = client.get("/organizer/api/me", headers=_auth(session)).get_json()
    assert me["account"]["email"] == "organizer@example.org"
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

    client.post(f"/admin/api/series/{series_id}/members", json={"email": "organizer@example.org"})
    client.patch(f"/admin/api/series/{series_id}/members/{account_id}", json={"disabled": True})
    assert client.get("/organizer/api/me", headers=_auth(session)).status_code == 401
    assert _sign_in(client)[0].status_code == 403


def test_wrong_passwords_are_throttled(client):
    _, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    for _ in range(5):
        assert _sign_in(client, password=PASSWORD + "-zle")[0].status_code == 403
    assert _sign_in(client)[0].status_code == 429


def test_an_account_without_a_password_cannot_sign_in(client):
    _series_with_member(client)
    assert _sign_in(client, password="")[0].status_code == 403
    assert _sign_in(client, password=secrets.token_urlsafe(12))[0].status_code == 403


def test_series_slugs_stay_unique(client):
    first = client.post("/admin/api/series", json={"name": "Takei World Tour"}).get_json()
    second = client.post("/admin/api/series", json={"name": "Takei World Tour"}).get_json()
    assert first["slug"] == "takei-world-tour" and second["slug"] == "takei-world-tour-2"


def test_the_invitation_mail_comes_in_the_persons_language_from_noreply(client, monkeypatch):
    sent = []
    from wyniki.services import account_invites

    monkeypatch.setattr(account_invites, "_send_email", lambda subject, body, to, **sender: sent.append((subject, body, to, sender)) or True)
    series_id = client.post("/admin/api/series", json={"name": "Takei <World> Tour"}).get_json()["id"]
    invited = client.post(f"/admin/api/series/{series_id}/members", json={"email": "jan@example.org", "name": "Jan <b>", "language": "fr"}).get_json()
    assert invited["emailed"] is True and invited["account"]["language"] == "fr"
    subject, body, to, sender = sent[0]
    assert to == ["jan@example.org"] and subject == "blindtennis.app : espace organisateurs – Takei <World> Tour"
    assert sender == {"from_name": "blindtennis.app", "from_email": "noreply@blindtennis.app", "reply_to": "contact@blindtennis.app"}
    assert 'lang="fr"' in body and "Définir le mot de passe" in body
    assert "Takei &lt;World&gt; Tour" in body and "Jan &lt;b&gt;" in body
    assert invited["invite_url"] in body and "/brand/blindtennis-logo-email.png" in body

    token = re.search(r"token=([^&]+)", invited["invite_url"]).group(1)
    assert client.get(f"/organizer/api/invite/{token}").get_json()["language"] == "fr"


def test_an_unknown_language_falls_back_to_english_and_the_person_can_change_theirs(client):
    series_id, invited = _series_with_member(client)
    assert invited["account"]["language"] == "en"
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    _, session = _sign_in(client)
    assert client.put("/organizer/api/me", json={"language": "lt"}, headers=_auth(session)).get_json() == {"language": "lt"}
    assert client.get("/organizer/api/me", headers=_auth(session)).get_json()["account"]["language"] == "lt"
    assert client.put("/organizer/api/me", json={"language": "xx"}, headers=_auth(session)).get_json() == {"language": "en"}
    client.patch(f"/admin/api/series/{series_id}", json={"valid_until": "2020-01-01"})
    assert client.put("/organizer/api/me", json={"language": "de"}, headers=_auth(session)).status_code == 200, "own settings stay writable"


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def test_a_series_logo_is_set_by_its_organizer_served_and_shown_with_its_tournaments(client):
    import io

    series_id, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    duren = _tournament("5th Dürener Handicup 2026")
    client.put(f"/admin/api/series/{series_id}/tournaments/{duren}", json={"tier": "CH50"})
    _, session = _sign_in(client)

    # a script dressed as a picture stays out
    fake = client.post(f"/organizer/api/series/{series_id}/logo", headers=_auth(session),
                       data={"logo": (io.BytesIO(b"<svg onload=alert(1)>"), "logo.png")}, content_type="multipart/form-data")
    assert fake.status_code == 400

    saved = client.post(f"/organizer/api/series/{series_id}/logo", headers=_auth(session),
                        data={"logo": (io.BytesIO(PNG), "TWT logo.png")}, content_type="multipart/form-data")
    assert saved.status_code == 200
    path = saved.get_json()["logo_path"]
    assert path.startswith("/data/series-logos/twt-") and path.endswith(".png")
    assert client.get(path).data == PNG
    assert client.get("/data/series-logos/../wyniki.sqlite3").status_code == 404
    assert client.get("/data/backups/wyniki.sqlite3").status_code == 404

    me = client.get("/organizer/api/me", headers=_auth(session)).get_json()
    assert me["series"][0]["logo_path"] == path
    listed = {row["id"]: row for row in client.get("/api/tournament/list").get_json()}
    assert listed[duren]["series"] == [{"id": series_id, "name": "Takei World Tennis Tour", "slug": "twt",
                                        "website": "", "logo_path": path, "tier": "CH50"}]

    # the admin replaces it; the old file goes
    replaced = client.post(f"/admin/api/series/{series_id}/logo",
                           data={"logo": (io.BytesIO(PNG), "new.png")}, content_type="multipart/form-data")
    assert replaced.status_code == 200 and client.get(path).status_code == 404
    assert client.delete(f"/admin/api/series/{series_id}/logo").get_json() == {"logo_path": ""}


def test_another_series_logo_is_off_limits(client):
    import io

    twt, invited = _series_with_member(client)
    client.post(f"/organizer/api/invite/{_token_from(invited['invite_url'])}", json={"password": PASSWORD})
    other = client.post("/admin/api/series", json={"name": "Other Tour"}).get_json()["id"]
    _, session = _sign_in(client)
    response = client.post(f"/organizer/api/series/{other}/logo", headers=_auth(session),
                           data={"logo": (io.BytesIO(PNG), "x.png")}, content_type="multipart/form-data")
    assert response.status_code in (403, 404)
