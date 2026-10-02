"""The small pieces nothing else tests: the helpers, /health, and the admin login."""

import secrets
from datetime import timezone

import pytest
from flask import Flask

from wyniki.api import admin_auth, health
from wyniki.config import settings
from wyniki.utils import format_duration, json_no_cache, parse_iso_datetime


# Made up on the spot: a literal here reads as a credential to secret scanners.
PASSWORD = "pw-" + secrets.token_urlsafe(12)


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(health.blueprint)
    app.register_blueprint(admin_auth.blueprint)
    app.config["TESTING"] = True
    return app.test_client()


def test_a_match_length_is_shown_as_hours_and_minutes():
    assert format_duration(0) == "00:00"
    assert format_duration(59) == "00:00", "seconds below a minute do not show"
    assert format_duration(90) == "00:01"
    assert format_duration(3600) == "01:00"
    assert format_duration(7 * 3600 + 45 * 60 + 59) == "07:45"


def test_the_android_timestamp_with_a_z_is_understood():
    moment = parse_iso_datetime("2026-09-26T09:15:00Z")
    assert moment.tzinfo is not None and moment.utcoffset().total_seconds() == 0
    assert parse_iso_datetime("2026-09-26T11:15:00+02:00").astimezone(timezone.utc).hour == 9
    with pytest.raises(ValueError):
        parse_iso_datetime("wczoraj")


def test_a_no_cache_answer_says_so_in_every_header_a_proxy_reads():
    app = Flask(__name__)
    with app.test_request_context():
        response = json_no_cache({"a": 1})
        assert response.status_code == 200
        assert response.get_json() == {"a": 1}
        assert "no-store" in response.headers["Cache-Control"]
        assert response.headers["Pragma"] == "no-cache"
        assert response.headers["Expires"] == "0"
        assert json_no_cache({"error": "nie ma"}, 404).status_code == 404


def test_health_answers_what_the_monitoring_checks_after_every_deploy(client):
    body = client.get("/health").get_json()
    assert body["status"] == "healthy"
    assert body["version"] == "2.0.0"
    assert body["components"] == {"database": "ok", "poller": "ok"}
    assert "environment" in body


def test_the_admin_login_hands_out_a_token_for_the_right_password(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    body = client.post("/admin/api/auth", json={"password": PASSWORD}).get_json()
    assert body["token"]
    assert body["expires_in"] == settings.admin_session_ttl_hours * 3600


def test_a_wrong_or_missing_password_gets_nothing(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    assert client.post("/admin/api/auth", json={"password": PASSWORD + " "}).status_code == 403
    assert client.post("/admin/api/auth", json={"password": ""}).status_code == 403
    assert client.post("/admin/api/auth", json={}).status_code == 403
    assert client.post("/admin/api/auth").status_code == 403, "no body is not a login"


def test_without_a_password_in_the_configuration_the_admin_api_is_closed(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_password", "")
    response = client.post("/admin/api/auth", json={"password": "cokolwiek"})
    assert response.status_code == 503, "a deployment with no password must not let anyone in"
    assert "token" not in response.get_json()
