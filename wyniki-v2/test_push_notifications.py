"""Public Web Push: subscriptions, validation, and the off-by-default switch.

The whole feature hinges on the VAPID keys being configured. Without them the
endpoints must refuse politely rather than half-work, and nothing may reach the
umpire's match-create path.
"""
from __future__ import annotations

import pytest


@pytest.fixture()
def app_client(tmp_path, monkeypatch):
    db_path = tmp_path / "push.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings

    settings.database_path = str(db_path)
    settings.vapid_public_key = ""
    settings.vapid_private_key = ""

    from app import create_app

    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture()
def with_keys():
    from wyniki.config import settings

    settings.vapid_public_key = "test-public-key"
    settings.vapid_private_key = "test-private-key"
    yield
    settings.vapid_public_key = ""
    settings.vapid_private_key = ""


def test_key_endpoint_reports_push_off_when_unconfigured(app_client):
    response = app_client.get("/api/push/key")
    assert response.status_code == 200
    assert response.get_json() == {"enabled": False, "public_key": ""}


def test_subscribing_is_refused_while_push_is_unconfigured(app_client):
    response = app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/abc",
        "keys": {"p256dh": "p", "auth": "a"},
    })
    assert response.status_code == 503


def test_key_endpoint_hands_out_the_public_key(app_client, with_keys):
    body = app_client.get("/api/push/key").get_json()
    assert body == {"enabled": True, "public_key": "test-public-key"}


@pytest.mark.parametrize("payload", [
    {},
    {"endpoint": "http://push.example/abc", "keys": {"p256dh": "p", "auth": "a"}},  # not https
    {"endpoint": "https://push.example/abc"},  # no keys
    {"endpoint": "https://push.example/abc", "keys": {"p256dh": "p"}},  # no auth
    {"endpoint": "https://" + "x" * 2000, "keys": {"p256dh": "p", "auth": "a"}},  # absurd length
])
def test_malformed_subscriptions_are_rejected(app_client, with_keys, payload):
    assert app_client.post("/api/push/subscribe", json=payload).status_code == 400


def test_a_subscription_is_stored_once_per_endpoint(app_client, with_keys):
    from wyniki.database import push_subscriptions

    payload = {
        "endpoint": "https://push.example/abc",
        "keys": {"p256dh": "p256", "auth": "auth"},
        "court_id": "t32-1",
    }
    assert app_client.post("/api/push/subscribe", json=payload).status_code == 200
    # The same browser subscribing again must update, not duplicate.
    payload["court_id"] = "t32-2"
    assert app_client.post("/api/push/subscribe", json=payload).status_code == 200

    assert push_subscriptions.count_subscriptions() == 1
    assert [s["endpoint"] for s in push_subscriptions.subscriptions_for_court("t32-2")] == [
        "https://push.example/abc"
    ]
    assert push_subscriptions.subscriptions_for_court("t32-1") == []


def test_a_subscription_without_a_court_hears_about_every_court(app_client, with_keys):
    from wyniki.database import push_subscriptions

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/all",
        "keys": {"p256dh": "p", "auth": "a"},
    })

    for court in ("t32-1", "t32-9", "anything"):
        assert [s["endpoint"] for s in push_subscriptions.subscriptions_for_court(court)] == [
            "https://push.example/all"
        ]


def test_unsubscribing_removes_the_row(app_client, with_keys):
    from wyniki.database import push_subscriptions

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/gone",
        "keys": {"p256dh": "p", "auth": "a"},
    })
    body = app_client.post("/api/push/unsubscribe", json={"endpoint": "https://push.example/gone"}).get_json()

    assert body["removed"] is True
    assert push_subscriptions.count_subscriptions() == 0


def test_notify_does_nothing_and_raises_nothing_while_push_is_off(app_client):
    from wyniki.services import web_push

    assert web_push.is_enabled() is False
    assert web_push.notify_match_started("t32-1", "1", "A", "B") == 0


def test_a_dead_endpoint_is_pruned_and_a_live_one_is_kept(app_client, with_keys, monkeypatch):
    from wyniki.database import push_subscriptions
    from wyniki.services import web_push

    for name in ("live", "dead"):
        app_client.post("/api/push/subscribe", json={
            "endpoint": f"https://push.example/{name}",
            "keys": {"p256dh": "p", "auth": "a"},
        })

    def fake_send(subscription, payload):
        return 410 if subscription["endpoint"].endswith("dead") else 201

    monkeypatch.setattr(web_push, "_send_one", fake_send)
    sent = web_push.notify_match_started("t32-1", "1", "Kowalski", "Nowak")

    assert sent == 1
    remaining = [s["endpoint"] for s in push_subscriptions.subscriptions_for_court("t32-1")]
    assert remaining == ["https://push.example/live"]


def test_a_failing_push_service_never_breaks_the_caller(app_client, with_keys, monkeypatch):
    from wyniki.services import web_push

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/x",
        "keys": {"p256dh": "p", "auth": "a"},
    })

    def explode(subscription, payload):
        raise RuntimeError("push service on fire")

    monkeypatch.setattr(web_push, "_send_one", explode)
    with pytest.raises(RuntimeError):
        web_push._send_one({}, "")
    # notify_match_started swallows what _send_one raises, because it runs inside
    # the umpire's match-create request.
    monkeypatch.setattr(web_push, "_send_one", lambda *_: None)
    assert web_push.notify_match_started("t32-1", "1", "A", "B") == 0
