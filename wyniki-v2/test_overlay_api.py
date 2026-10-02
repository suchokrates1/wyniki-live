"""The overlay endpoints OBS and the StreamDeck call: what each one answers, and when it refuses."""

import pytest
from flask import Flask

from wyniki.api import overlay_api


@pytest.fixture
def client(monkeypatch):
    """The blueprint alone, over a stubbed settings service."""
    state = {"settings": {"tournament_logo": None, "tournament_name": "", "overlays": {"1": {"name": "Kort 1"}}},
             "calls": []}

    def update(new):
        state["calls"].append(("update", new))
        state["settings"].update({k: v for k, v in new.items() if k in ("tournament_logo", "tournament_name")})
        return dict(state["settings"])

    def toggle(active, mode=None):
        state["calls"].append(("stats", active, mode))
        return {"active": bool(active), "overlay_ids": ["1", "2", "3", "4"], "mode": mode, "settings": {}}

    monkeypatch.setattr(overlay_api, "get_overlay_settings", lambda: dict(state["settings"]))
    monkeypatch.setattr(overlay_api, "update_overlay_settings", update)
    monkeypatch.setattr(overlay_api, "delete_overlay", lambda oid: oid in state["settings"]["overlays"])
    monkeypatch.setattr(overlay_api, "set_overlay_stats_visibility", toggle)

    app = Flask(__name__)
    app.register_blueprint(overlay_api.blueprint)
    app.config["TESTING"] = True
    test_client = app.test_client()
    test_client.state = state
    return test_client


def test_the_overlay_reads_its_settings_and_is_told_not_to_cache_them(client):
    response = client.get("/api/overlay/settings")
    assert response.status_code == 200
    assert response.get_json()["overlays"]["1"]["name"] == "Kort 1"
    assert "no-store" in response.headers.get("Cache-Control", ""), "OBS must not serve a stale layout"


def test_a_broken_settings_store_answers_500_rather_than_a_blank_overlay(client, monkeypatch):
    def explode():
        raise RuntimeError("baza padła")

    monkeypatch.setattr(overlay_api, "get_overlay_settings", explode)
    response = client.get("/api/overlay/settings")
    assert response.status_code == 500
    assert "baza padła" in response.get_json()["error"]


def test_saving_settings_passes_the_body_through_and_refuses_an_empty_one(client):
    response = client.put("/api/overlay/settings", json={"tournament_name": "RAKIETY"})
    assert response.status_code == 200
    assert response.get_json()["tournament_name"] == "RAKIETY"
    assert ("update", {"tournament_name": "RAKIETY"}) in client.state["calls"]

    assert client.put("/api/overlay/settings", json={}).status_code == 400


def test_deleting_a_preset_that_is_not_there_is_a_404(client):
    assert client.delete("/api/overlay/overlays/1").get_json() == {"ok": True}
    response = client.delete("/api/overlay/overlays/nie-ma")
    assert response.status_code == 404
    assert response.get_json()["error"] == "Overlay not found"


def test_the_logo_goes_in_as_a_data_url_and_comes_out_again(client):
    response = client.post("/api/overlay/logo", json={"logo": "data:image/png;base64,AAA"})
    assert response.status_code == 200
    assert response.get_json()["tournament_logo"] == "data:image/png;base64,AAA"

    assert client.post("/api/overlay/logo", json={}).status_code == 400
    assert client.post("/api/overlay/logo", json={"logo": 123}).status_code == 400, "a logo is a string, not a number"

    assert client.delete("/api/overlay/logo").get_json() == {"ok": True}
    assert ("update", {"tournament_logo": None}) in client.state["calls"]


def test_the_streamdeck_can_toggle_stats_with_a_plain_url(client):
    response = client.get("/api/overlay/stats/on")
    assert response.get_json() == {"ok": True, "active": True, "overlay_ids": ["1", "2", "3", "4"], "mode": None}
    assert client.get("/api/overlay/stats/off").get_json()["active"] is False

    response = client.get("/api/overlay/stats/on?mode=advanced")
    assert response.get_json()["mode"] == "advanced", "the mode may ride in the query string"


def test_a_toggle_without_a_clear_instruction_is_refused(client):
    assert client.get("/api/overlay/stats/czasem").status_code == 400
    assert client.post("/api/overlay/stats", json={}).status_code == 400
    assert client.post("/api/overlay/stats").status_code == 400, "no body at all is not a toggle"


def test_a_json_toggle_carries_the_flag_and_the_mode(client):
    response = client.post("/api/overlay/stats", json={"active": True, "mode": "simple"})
    assert response.get_json()["active"] is True
    assert ("stats", True, "simple") in client.state["calls"]
    assert client.post("/api/overlay/stats", json={"active": 0}).get_json()["active"] is False
