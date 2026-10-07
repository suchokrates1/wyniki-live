"""The organizer at work: tournaments of the series, courts, office, players, the log,
the admin's lock and review queue, and a lapsed subscription."""
from __future__ import annotations

import re
import secrets

import pytest

PASSWORD = secrets.token_urlsafe(12)


@pytest.fixture()
def app(tmp_path, monkeypatch):
    db_path = tmp_path / "organizer.sqlite3"
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


@pytest.fixture()
def twt(client):
    """A series with one signed-in organizer; returns (series_id, headers)."""
    series_id = client.post("/admin/api/series", json={"name": "Takei World Tennis Tour", "slug": "twt"}).get_json()["id"]
    invited = client.post(f"/admin/api/series/{series_id}/members", json={"email": "organizer@example.org", "role": "owner"}).get_json()
    token = re.search(r"token=([^&]+)", invited["invite_url"]).group(1)
    session = client.post(f"/organizer/api/invite/{token}", json={"password": PASSWORD}).get_json()["token"]
    return series_id, {"Authorization": f"Bearer {session}"}


def _new(client, twt, **extra):
    series_id, headers = twt
    payload = {"name": "6th Dürener Handicup 2027", "start_date": "2027-07-16", "end_date": "2027-07-18",
               "city": "Düren", "country": "de", "court_count": 2, "tier": "CH50", **extra}
    response = client.post(f"/organizer/api/series/{series_id}/tournaments", json=payload, headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["id"]


def _other_tournament(name="Turniej spoza serii"):
    from wyniki import database

    return int(database.insert_tournament(name, "2027-05-01", "2027-05-02", city="Leszno", country="PL"))


def test_a_new_tournament_lands_in_the_series_with_its_tier_courts_and_a_log_line(client, twt):
    _, headers = twt
    tid = _new(client, twt, active=True, office_password=secrets.token_urlsafe(9))
    detail = client.get(f"/organizer/api/tournaments/{tid}", headers=headers).get_json()
    assert detail["active"] == 0, "the organizer does not switch a tournament live by creating it"
    assert detail["country"] == "DE" and detail["has_office_password"] == 1
    assert [c["kort_id"] for c in detail["courts"]] == [f"t{tid}-1", f"t{tid}-2"]
    assert detail["series"][0]["tier"] == "CH50"
    assert "access_key" not in detail
    log = client.get(f"/organizer/api/tournaments/{tid}/log", headers=headers).get_json()
    assert log[0]["action"] == "create" and log[0]["account_email"] == "organizer@example.org"
    assert log[0]["detail"]["office_password"] == "•••"


def test_settings_change_but_live_state_and_access_key_stay_the_admins(client, twt):
    from wyniki import database

    _, headers = twt
    tid = _new(client, twt)
    response = client.put(f"/organizer/api/tournaments/{tid}", json={"city": "Aachen", "court_count": 3, "active": True, "access_key": "x"}, headers=headers)
    assert response.status_code == 200
    row = database.fetch_tournament(tid)
    assert row["city"] == "Aachen" and row["court_count"] == 3
    assert row["active"] == 0 and row["access_key"] == ""
    assert row["name"] == "6th Dürener Handicup 2027", "fields not sent keep their values"


def test_the_admins_lock_keeps_a_tournament_off_the_website(client, twt):
    from wyniki import database
    from wyniki.database.series_records import set_visibility_lock

    _, headers = twt
    tid = _new(client, twt, is_public=True)
    set_visibility_lock(tid, "private")
    assert database.fetch_tournament(tid)["is_public"] == 0
    client.put(f"/organizer/api/tournaments/{tid}", json={"is_public": True}, headers=headers)
    assert database.fetch_tournament(tid)["is_public"] == 0
    assert client.get(f"/organizer/api/tournaments/{tid}", headers=headers).get_json()["visibility_lock"] == "private"
    listed = {row["id"]: row for row in client.get("/admin/api/tournaments").get_json()}
    assert listed[tid]["visibility_lock"] == "private"

    set_visibility_lock(tid, "")
    client.put(f"/organizer/api/tournaments/{tid}", json={"is_public": True}, headers=headers)
    assert database.fetch_tournament(tid)["is_public"] == 1


def test_court_pins_change_and_courts_keep_their_names(client, twt):
    _, headers = twt
    tid = _new(client, twt)
    kort = f"t{tid}-1"
    assert client.put(f"/organizer/api/tournaments/{tid}/courts/{kort}/pin", json={"pin": "12a4"}, headers=headers).status_code == 400
    assert client.put(f"/organizer/api/tournaments/{tid}/courts/{kort}/pin", json={"pin": "4821"}, headers=headers).status_code == 200
    courts = client.get(f"/organizer/api/tournaments/{tid}", headers=headers).get_json()["courts"]
    assert courts[0] == {"kort_id": kort, "name": "1", "pin": "4821"}
    other = _other_tournament()
    from wyniki import database

    database.create_tournament_courts(other, 1)
    assert client.put(f"/organizer/api/tournaments/{tid}/courts/t{other}-1/pin", json={"pin": "1111"}, headers=headers).status_code == 404


def test_the_office_opens_without_its_password_once_the_tournament_is_live(client, twt):
    _, headers = twt
    tid = _new(client, twt)
    assert client.post(f"/organizer/api/tournaments/{tid}/office-session", headers=headers).status_code == 409
    assert client.put(f"/organizer/api/tournaments/{tid}/active", json={"active": True}, headers=headers).get_json()["active"] is True
    opened = client.post(f"/organizer/api/tournaments/{tid}/office-session", headers=headers).get_json()
    dashboard = client.get(f"/api/office/{opened['slot']}/dashboard", headers={"Authorization": f"Bearer {opened['token']}"})
    assert dashboard.status_code == 200


def test_entries_go_into_a_tournament_that_is_not_live_yet(client, twt):
    _, headers = twt
    tid = _new(client, twt)
    added = client.post(f"/organizer/api/tournaments/{tid}/players", json={"first_name": "Anna", "last_name": "Testowa", "category": "B2", "country": "PL"}, headers=headers)
    assert added.status_code == 201
    created = client.post("/organizer/api/players", json={"first_name": "Jan", "last_name": "Przykładowy", "country": "DE", "category": "B1", "birth_date": "1990-01-01"}, headers=headers).get_json()
    assert "birth_date" not in created
    assert client.post(f"/organizer/api/tournaments/{tid}/players/add-global", json={"global_player_id": created["id"]}, headers=headers).status_code == 201
    names = [row["name"] for row in client.get(f"/organizer/api/tournaments/{tid}/players", headers=headers).get_json()]
    assert sorted(names) == ["Anna Testowa", "Jan Przykładowy"]
    found = client.get("/organizer/api/players?q=Przyk", headers=headers).get_json()
    assert found[0]["last_name"] == "Przykładowy" and "birth_date" not in found[0] and "notes" not in found[0]


def test_editing_someone_who_also_plays_elsewhere_waits_for_the_admin(client, twt):
    _, headers = twt
    tid = _new(client, twt)
    elsewhere = _other_tournament()
    gp = client.post("/admin/api/global-players", json={"first_name": "Ewa", "last_name": "Wspólna", "category": "B3"}).get_json()
    client.put(f"/admin/api/tournaments/{elsewhere}/active", json={"active": True})
    client.post(f"/admin/api/global-players/tournaments/{elsewhere}/add-global", json={"global_player_id": gp["id"]})
    client.post(f"/organizer/api/tournaments/{tid}/players/add-global", json={"global_player_id": gp["id"]}, headers=headers)

    changed = client.put(f"/organizer/api/players/{gp['id']}", json={"category": "B2"}, headers=headers).get_json()
    assert changed["category"] == "B2" and changed["queued_for_review"] is True
    reviews = client.get("/admin/api/player-reviews").get_json()
    assert [(r["before"], r["after"], r["account_email"]) for r in reviews] == [({"category": "B3"}, {"category": "B2"}, "organizer@example.org")]

    assert client.post(f"/admin/api/player-reviews/{reviews[0]['id']}/revert").status_code == 200
    assert client.get(f"/admin/api/global-players/{gp['id']}").get_json()["category"] == "B3"
    assert client.get("/admin/api/player-reviews").get_json() == []


def test_someone_who_plays_only_in_the_series_is_changed_without_review(client, twt):
    _, headers = twt
    tid = _new(client, twt)
    gp = client.post("/organizer/api/players", json={"first_name": "Ola", "last_name": "Seryjna", "category": "B4"}, headers=headers).get_json()
    client.post(f"/organizer/api/tournaments/{tid}/players/add-global", json={"global_player_id": gp["id"]}, headers=headers)
    assert client.put(f"/organizer/api/players/{gp['id']}", json={"category": "B3"}, headers=headers).get_json()["queued_for_review"] is False
    assert client.get("/admin/api/player-reviews").get_json() == []


def test_a_tournament_outside_the_series_is_off_limits_on_every_route(client, twt):
    _, headers = twt
    other = _other_tournament()
    for method, url in [
        ("GET", f"/organizer/api/tournaments/{other}"), ("PUT", f"/organizer/api/tournaments/{other}"),
        ("GET", f"/organizer/api/tournaments/{other}/players"), ("POST", f"/organizer/api/tournaments/{other}/players"),
        ("GET", f"/organizer/api/tournaments/{other}/categories"), ("POST", f"/organizer/api/tournaments/{other}/office-session"),
        ("PUT", f"/organizer/api/tournaments/{other}/active"), ("GET", f"/organizer/api/tournaments/{other}/log"),
    ]:
        assert client.open(url, method=method, json={}, headers=headers).status_code == 403, f"{method} {url}"


def test_a_lapsed_subscription_leaves_the_panel_read_only(client, twt):
    series_id, headers = twt
    tid = _new(client, twt)
    client.patch(f"/admin/api/series/{series_id}", json={"valid_until": "2020-01-01"})
    assert client.get(f"/organizer/api/tournaments/{tid}", headers=headers).get_json()["read_only"] is True
    assert client.put(f"/organizer/api/tournaments/{tid}", json={"city": "X"}, headers=headers).status_code == 403
    assert client.post(f"/organizer/api/tournaments/{tid}/players", json={"name": "A B"}, headers=headers).status_code == 403
    assert client.post(f"/organizer/api/series/{series_id}/tournaments", json={"name": "N", "start_date": "2027-01-01", "end_date": "2027-01-01"}, headers=headers).status_code == 403
    assert client.post("/organizer/api/players", json={"last_name": "Nowy"}, headers=headers).status_code == 403


def test_the_admins_pin_change_keeps_the_court_name_too(client, twt):
    from wyniki import database

    tid = _new(client, twt)
    client.put(f"/admin/api/courts/t{tid}-2/pin", json={"pin": "9090"})
    court = database.fetch_courts_for_tournament(tid)[1]
    assert (court["name"], court["pin"]) == ("2", "9090"), "it used to rename court 2 to its id"


def test_a_category_of_another_tournament_stays_untouched(client, twt):
    from wyniki import database

    _, headers = twt
    tid = _new(client, twt)
    other = _other_tournament()
    theirs = client.post(f"/admin/api/tournaments/{other}/categories", json={"label": "B1 Men"}).get_json()["category"]
    response = client.put(f"/organizer/api/tournaments/{tid}/categories/{theirs['id']}", json={"label": "przejęte"}, headers=headers)
    assert response.status_code == 404
    assert database.fetch_tournament_category(theirs["id"])["label"] == "B1 Men"

    mine = client.post(f"/organizer/api/tournaments/{tid}/categories", json={"label": "B2 Mixed"}, headers=headers)
    assert mine.status_code == 201
    assert client.patch(f"/organizer/api/tournaments/{tid}/categories/{mine.get_json()['category']['id']}", json={"label": "B2 Women"}, headers=headers).status_code == 200
