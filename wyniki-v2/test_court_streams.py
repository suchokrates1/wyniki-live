"""Day × court stream URLs swap themselves on the live board for that day."""
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from wyniki.database.court_streams import StreamUrlError


@pytest.fixture()
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "court-streams.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    from wyniki.config import settings

    settings.database_path = str(db_path)

    from wyniki import database

    database.init_db()
    return database


def test_today_url_attaches_to_the_matching_court_only(db, monkeypatch):
    monkeypatch.setattr("wyniki.database.court_streams.today_warsaw", lambda now=None: "2026-09-26")
    tournament_id = db.insert_tournament("Streams Cup", "2026-09-26", "2026-09-27", active=True)
    court_a, court_b = db.create_tournament_courts(tournament_id, 2)

    saved = db.save_tournament_court_streams(tournament_id, {
        "links": {
            "2026-09-26": {court_a: "https://youtu.be/today-a", court_b: ""},
            "2026-09-27": {court_a: "https://youtu.be/other-a", court_b: "https://youtu.be/other-b"},
        }
    })
    assert saved["days"] == ["2026-09-26", "2026-09-27"]
    assert saved["links"]["2026-09-26"][court_a] == "https://youtu.be/today-a"
    urls = db.fetch_watch_urls_for_date()
    assert urls[court_a] == "https://youtu.be/today-a"
    assert court_b not in urls

    attached = db.attach_watch_url(court_a, {"court_name": "1"})
    assert attached["watch_url"] == "https://youtu.be/today-a"
    empty = db.attach_watch_url(court_b, {"court_name": "2"})
    assert "watch_url" not in empty


def test_saving_replaces_the_grid_and_rejects_bad_urls(db):
    tournament_id = db.insert_tournament("Streams Cup", "2026-09-26", "2026-09-27", active=True)
    court_a, = db.create_tournament_courts(tournament_id, 1)
    db.save_tournament_court_streams(tournament_id, {
        "links": {"2026-09-26": {court_a: "https://youtu.be/old"}}
    })
    with pytest.raises(StreamUrlError) as err:
        db.save_tournament_court_streams(tournament_id, {
            "links": {"2026-09-26": {court_a: "javascript:alert(1)"}}
        })
    assert err.value.cells == [{"day": "2026-09-26", "kort_id": court_a}]
    assert db.get_tournament_court_streams(tournament_id)["links"]["2026-09-26"][court_a] == "https://youtu.be/old"

    cleared = db.save_tournament_court_streams(tournament_id, {
        "links": {"2026-09-26": {court_a: "   "}, "2026-09-27": {court_a: "https://youtu.be/sun"}}
    })
    assert cleared["links"]["2026-09-26"][court_a] == ""
    assert cleared["links"]["2026-09-27"][court_a] == "https://youtu.be/sun"


def test_shared_url_applies_to_every_court_and_court_link_wins(db, monkeypatch):
    monkeypatch.setattr("wyniki.database.court_streams.today_warsaw", lambda now=None: "2026-09-26")
    tournament_id = db.insert_tournament("One Stream Cup", "2026-09-26", "2026-09-27", active=True)
    court_a, court_b = db.create_tournament_courts(tournament_id, 2)

    saved = db.save_tournament_court_streams(tournament_id, {
        "shared_all_courts": True,
        "shared": {
            "2026-09-26": "https://youtu.be/hall",
            "2026-09-27": "",
        },
        "links": {
            "2026-09-26": {court_a: "https://youtu.be/ignored"},
        },
    })
    assert saved["shared_all_courts"] is True
    assert saved["shared"]["2026-09-26"] == "https://youtu.be/hall"
    assert saved["links"]["2026-09-26"][court_a] == ""
    urls = db.fetch_watch_urls_for_date()
    assert urls[court_a] == "https://youtu.be/hall"
    assert urls[court_b] == "https://youtu.be/hall"
    assert db.attach_watch_url(court_b, {})["watch_url"] == "https://youtu.be/hall"

    db.save_tournament_court_streams(tournament_id, {
        "shared_all_courts": False,
        "links": {
            "2026-09-26": {court_a: "https://youtu.be/only-a", court_b: ""},
        },
    })
    urls = db.fetch_watch_urls_for_date()
    assert urls[court_a] == "https://youtu.be/only-a"
    assert court_b not in urls


def test_shared_url_skips_courts_marked_off(db, monkeypatch):
    monkeypatch.setattr("wyniki.database.court_streams.today_warsaw", lambda now=None: "2026-09-26")
    tournament_id = db.insert_tournament("Partial Hall", "2026-09-26", "2026-09-26", active=True)
    court_a, court_b = db.create_tournament_courts(tournament_id, 2)
    db.save_tournament_court_streams(tournament_id, {
        "shared_all_courts": True,
        "shared": {"2026-09-26": "https://youtu.be/hall"},
        "off_courts": [court_b],
    })
    urls = db.fetch_watch_urls_for_date()
    assert urls[court_a] == "https://youtu.be/hall"
    assert court_b not in urls
    assert "watch_url" not in db.attach_watch_url(court_b, {"court_name": "2"})
    assert db.get_tournament_court_streams(tournament_id)["off_courts"] == [court_b]


def test_today_warsaw_follows_europe_warsaw(monkeypatch):
    from wyniki.database import court_streams

    winter = datetime(2026, 1, 1, 23, 30, tzinfo=ZoneInfo("UTC"))
    assert court_streams.today_warsaw(winter) == "2026-01-02"
