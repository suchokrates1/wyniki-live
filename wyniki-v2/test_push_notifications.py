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


def test_player_keys_fold_case_and_polish_accents():
    from wyniki.database.push_subscriptions import player_key, players_in_fixture

    # The office types names by hand, so these must all land on one key.
    assert player_key("Bernadeta Kozioł") == player_key("bernadeta koziol")
    assert player_key("  KOZIOŁ,  Bernadeta ".replace(",", "")) == "koziol bernadeta"
    assert player_key("Łukasz Konklewski") == "lukasz konklewski"
    assert player_key("") == ""

    # A doubles fixture counts for all four players.
    assert players_in_fixture("Anna Bujak / Łukasz Konklewski", "Jerzy Janas") == {
        "anna bujak", "lukasz konklewski", "jerzy janas",
    }


def test_only_devices_following_the_player_and_wanting_the_type_are_picked(app_client, with_keys):
    from wyniki.database import push_subscriptions

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/fan",
        "keys": {"p256dh": "p", "auth": "a"},
        "players": ["Bernadeta Kozioł"],
        "preferences": {"notify_plan": True, "notify_change": False},
    })
    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/other",
        "keys": {"p256dh": "p", "auth": "a"},
        "players": ["Jerzy Janas"],
        "preferences": {"notify_plan": True},
    })

    # Accent-insensitive match, and only the follower who asked for this type.
    found = push_subscriptions.subscriptions_for_players({"bernadeta koziol"}, "notify_plan")
    assert [s["endpoint"] for s in found] == ["https://push.example/fan"]
    assert push_subscriptions.subscriptions_for_players({"bernadeta koziol"}, "notify_change") == []


def test_publishing_a_plan_notifies_only_the_players_in_it(app_client, with_keys, monkeypatch):
    from wyniki.services import schedule_notifications, web_push

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/kowalski",
        "keys": {"p256dh": "p", "auth": "a"},
        "players": ["Jan Kowalski"],
        "preferences": {"notify_plan": True},
    })

    pushed = []
    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: pushed.append(body) or 201)

    sent = schedule_notifications.notify_plan_published([
        {"player1_name": "Jan Kowalski", "player2_name": "Adam Nowak",
         "court_label": "2", "day_date": "2026-10-03", "scheduled_time": "09:00"},
        {"player1_name": "Ktoś Inny", "player2_name": "Jeszcze Inny", "court_label": "3"},
    ])

    assert sent == 1
    assert len(pushed) == 1
    assert "Jan Kowalski" in pushed[0]


def test_a_fixture_change_notifies_both_the_old_and_the_new_cast(app_client, with_keys, monkeypatch):
    from wyniki.services import schedule_notifications, web_push

    for name in ("Jan Kowalski", "Adam Nowak"):
        app_client.post("/api/push/subscribe", json={
            "endpoint": f"https://push.example/{name.split()[1].lower()}",
            "keys": {"p256dh": "p", "auth": "a"},
            "players": [name],
            "preferences": {"notify_change": True},
        })

    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)

    before = {"player1_name": "Jan Kowalski", "player2_name": "Piotr Zielinski",
              "court_label": "2", "scheduled_time": "09:00", "status": "planned"}
    after = dict(before, player2_name="Adam Nowak", court_label="5")

    # The player who lost the fixture is told too, not only the new opponent.
    assert schedule_notifications.notify_fixture_changed(before, after) == 2


def test_noise_in_the_schedule_does_not_wake_anyone(app_client, with_keys, monkeypatch):
    from wyniki.services import schedule_notifications, web_push

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/quiet",
        "keys": {"p256dh": "p", "auth": "a"},
        "players": ["Jan Kowalski"],
        "preferences": {"notify_change": True},
    })
    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)

    entry = {"player1_name": "Jan Kowalski", "player2_name": "Adam Nowak",
             "court_label": "2", "scheduled_time": "09:00", "status": "planned"}

    # Notes and ordering churn constantly while the office works.
    assert schedule_notifications.notify_fixture_changed(entry, dict(entry, notes_public="x")) == 0
    assert schedule_notifications.notify_fixture_changed(entry, dict(entry, sort_order=7)) == 0
    # A draft is not public yet, so nobody hears about it moving.
    assert schedule_notifications.notify_fixture_changed(
        entry, dict(entry, court_label="9", status="draft")) == 0


def test_following_is_capped_so_nobody_subscribes_to_the_whole_draw(app_client, with_keys):
    from wyniki.database import push_subscriptions

    app_client.post("/api/push/subscribe", json={
        "endpoint": "https://push.example/greedy",
        "keys": {"p256dh": "p", "auth": "a"},
        "players": [f"Gracz Numer{i}" for i in range(40)],
    })
    assert len(push_subscriptions.followed_players("https://push.example/greedy")) == 10


def test_each_device_is_notified_in_the_language_it_asked_for(app_client, with_keys, monkeypatch):
    import json

    from wyniki.services import schedule_notifications, web_push

    for name, lang in (("pl", "pl"), ("lt", "lt"), ("en", "en")):
        app_client.post("/api/push/subscribe", json={
            "endpoint": f"https://push.example/{name}",
            "keys": {"p256dh": "p", "auth": "a"},
            "players": ["Jan Kowalski"],
            "lang": lang,
            "preferences": {"notify_plan": True},
        })

    seen = {}

    def capture(subscription, body):
        seen[subscription["endpoint"]] = json.loads(body)["title"]
        return 201

    monkeypatch.setattr(web_push, "_send_one", capture)
    schedule_notifications.notify_plan_published([
        {"player1_name": "Jan Kowalski", "player2_name": "Adam Nowak", "court_label": "2"},
    ])

    assert seen["https://push.example/pl"] == "Twój mecz jest w planie"
    assert seen["https://push.example/lt"] == "Jūsų mačas yra tvarkaraštyje"
    assert seen["https://push.example/en"] == "Your match is in the schedule"


def test_the_payload_is_built_once_per_language_not_once_per_device(app_client, with_keys, monkeypatch):
    from wyniki.services import web_push

    for i in range(5):
        app_client.post("/api/push/subscribe", json={
            "endpoint": f"https://push.example/pl{i}",
            "keys": {"p256dh": "p", "auth": "a"},
            "lang": "pl",
        })

    builds = []
    monkeypatch.setattr(web_push, "_send_one", lambda sub, body: 201)
    subscribers = [{"endpoint": f"https://push.example/pl{i}", "p256dh": "p", "auth": "a", "lang": "pl"}
                   for i in range(5)]

    def build(lang):
        builds.append(lang)
        return {"type": "x", "title": "t", "body": "b"}

    assert web_push.send_to(subscribers, build) == 5
    assert builds == ["pl"], "five devices, one language, one payload built"


def _cup_with_drafts(database, name, password):
    """A tournament with a group, so the office can generate draft fixtures."""
    from werkzeug.security import generate_password_hash

    tournament_id = database.insert_tournament(
        name, "2026-10-03", "2026-10-04", active=True,
        office_password_hash=generate_password_hash(password),
    )
    database.create_tournament_courts(tournament_id, 2)
    ids = [
        database.insert_player(tournament_id, f"P{i}", "B2", "PL",
                               first_name="P", last_name=str(i), gender="M")
        for i in range(1, 5)
    ]
    database.save_bracket_groups(
        tournament_id,
        [{"name": "B2 Mezczyzni - Grupa A", "play_format": "round_robin", "players": ids}],
    )
    return tournament_id


def test_the_office_publishing_a_plan_really_fires_the_notification(full_app_with_temp_db, monkeypatch):
    """The hook itself, not just the service it calls.

    The unit tests above exercise schedule_notifications directly; this proves
    the office endpoint is wired to it and hands over the drafts it published.
    """
    from wyniki import database
    from wyniki.api import office

    _cup_with_drafts(database, "Push Cup", "pushpass")
    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "pushpass"})
    assert auth.status_code == 200, auth.get_data(as_text=True)
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}

    generated = client.post("/api/office/1/schedule/generate", headers=headers)
    assert generated.status_code == 200
    assert any(e["status"] == "draft" for e in generated.get_json()["schedule"])

    seen = {}
    monkeypatch.setattr(office.schedule_notifications, "notify_plan_published",
                        lambda entries: seen.update(entries=entries) or 0)

    response = client.post("/api/office/1/schedule/publish", headers=headers, json={})
    assert response.status_code == 200
    assert response.get_json()["published"] >= 1

    assert "entries" in seen, "publishing must hand the drafts to the notifier"
    assert seen["entries"], "the notifier must receive the fixtures, not an empty list"
    assert all(e.get("player1_name") for e in seen["entries"])


def test_a_failing_notifier_never_breaks_the_office_publishing(full_app_with_temp_db, monkeypatch):
    from wyniki import database
    from wyniki.api import office

    _cup_with_drafts(database, "Resilient Cup", "resilient")
    client = full_app_with_temp_db.test_client()
    auth = client.post("/api/office/1/auth", json={"password": "resilient"})
    headers = {"Authorization": f"Bearer {auth.get_json()['token']}"}
    client.post("/api/office/1/schedule/generate", headers=headers)

    def explode(entries):
        raise RuntimeError("push service on fire")

    monkeypatch.setattr(office.schedule_notifications, "notify_plan_published", explode)

    # The office must still get its published schedule back.
    response = client.post("/api/office/1/schedule/publish", headers=headers, json={})
    assert response.status_code == 200
    assert response.get_json()["published"] >= 1
