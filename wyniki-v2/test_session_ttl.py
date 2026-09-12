"""Office and administrator sessions last long enough for a tournament week."""
from test_tournament_lifecycle import full_app_with_temp_db  # noqa: F401 (fixture)


def test_office_and_admin_session_lengths():
    from wyniki.config import settings
    from wyniki.services import api_auth

    assert settings.office_session_ttl_hours == 168
    assert settings.admin_session_ttl_hours == 72
    assert api_auth.office_session_max_age_seconds() == 168 * 3600


def test_office_token_older_than_a_day_is_still_accepted(full_app_with_temp_db, monkeypatch):
    from werkzeug.security import generate_password_hash
    from wyniki import database
    from wyniki.services import api_auth
    import itsdangerous.timed as timed

    database.insert_tournament(
        "Session Cup", "2026-07-18", "2026-07-19", active=True,
        office_password_hash=generate_password_hash("long"),
    )
    client = full_app_with_temp_db.test_client()
    real_time = timed.time.time
    monkeypatch.setattr(timed.time, "time", lambda: real_time() - 2 * 24 * 3600)
    token = client.post("/api/office/1/auth", json={"password": "long"}).get_json()["token"]
    monkeypatch.setattr(timed.time, "time", real_time)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/office/1/dashboard", headers=headers).status_code == 200
