"""Overlay presets: what is loaded, what is kept in the database, and what the stats toggle touches."""

import json

import pytest

from wyniki.services import overlay_settings
from wyniki.services.overlay_settings import (
    _DB_KEY,
    _normalize_stats_mode,
    _resolve_stats_court_id,
    delete_overlay,
    get_overlay_settings,
    set_overlay_stats_visibility,
    update_overlay_settings,
)


@pytest.fixture
def store(monkeypatch):
    """A fresh cache over an in-memory app_settings row."""
    rows = {}
    monkeypatch.setattr(overlay_settings, "fetch_app_settings", lambda keys: {k: rows[k] for k in keys if k in rows})
    monkeypatch.setattr(overlay_settings, "upsert_app_settings", rows.update)
    monkeypatch.setattr(overlay_settings, "_overlay_settings", {})
    monkeypatch.setattr(overlay_settings, "_loaded_from_db", False)
    return rows


def _saved(store):
    return json.loads(store[_DB_KEY])


def test_an_empty_database_gets_the_default_presets_written_once(store):
    settings = get_overlay_settings()
    assert set(settings["overlays"]) == {"1", "2", "3", "4", "all"}
    assert settings["overlays"]["all"]["name"] == "Wszystkie korty"
    assert len(settings["overlays"]["all"]["elements"]) == 4, "the all-courts preset shows every court"
    assert _saved(store)["overlays"].keys() == settings["overlays"].keys(), "defaults survive a restart"


def test_what_the_caller_gets_back_is_a_copy_it_cannot_corrupt(store):
    settings = get_overlay_settings()
    settings["overlays"]["1"]["name"] = "zepsute"
    settings["tournament_name"] = "zepsute"
    assert get_overlay_settings()["overlays"]["1"]["name"] != "zepsute"
    assert get_overlay_settings()["tournament_name"] == ""


def test_an_update_touches_only_what_it_names(store):
    get_overlay_settings()
    before = get_overlay_settings()["overlays"]["2"]

    updated = update_overlay_settings({
        "tournament_name": "RAKIETY ATNiS VII",
        "overlays": {"1": {"name": "Kort 1 — moje", "elements": []}, "3": "to nie jest overlay"},
        "czego_tu_nie_ma": "pomijane",
    })

    assert updated["tournament_name"] == "RAKIETY ATNiS VII"
    assert updated["overlays"]["1"]["name"] == "Kort 1 — moje"
    assert updated["overlays"]["2"] == before, "an overlay nobody mentioned stays as it was"
    assert updated["overlays"]["3"] != "to nie jest overlay", "garbage in place of an overlay is ignored"
    assert "czego_tu_nie_ma" not in updated
    assert _saved(store)["tournament_name"] == "RAKIETY ATNiS VII"


def test_the_logo_can_be_set_and_cleared(store):
    assert update_overlay_settings({"tournament_logo": "data:image/png;base64,AAA"})["tournament_logo"].startswith("data:")
    assert update_overlay_settings({"tournament_logo": None})["tournament_logo"] is None
    assert _saved(store)["tournament_logo"] is None


def test_turning_stats_on_adds_the_panel_to_the_four_court_presets_only(store):
    result = set_overlay_stats_visibility(True, "advanced")
    assert result["active"] is True
    assert result["overlay_ids"] == ["1", "2", "3", "4"], "the all-courts preset has no stats panel"
    assert result["mode"] == "advanced"

    overlays = get_overlay_settings()["overlays"]
    for overlay_id in ("1", "2", "3", "4"):
        stats = [el for el in overlays[overlay_id]["elements"] if el["type"] == "stats"]
        assert len(stats) == 1
        assert stats[0]["visible"] is True
        assert stats[0]["stats_mode"] == "advanced"
    assert not [el for el in overlays["all"]["elements"] if el["type"] == "stats"]


def test_turning_stats_off_hides_the_panel_without_throwing_it_away(store):
    set_overlay_stats_visibility(True, "simple")
    set_overlay_stats_visibility(False)
    stats = [el for el in get_overlay_settings()["overlays"]["1"]["elements"] if el["type"] == "stats"]
    assert len(stats) == 1, "the panel stays, so its position is not lost"
    assert stats[0]["visible"] is False
    assert stats[0]["stats_mode"] == "simple", "no mode given means the old one stands"


def test_only_the_two_real_stats_modes_are_accepted():
    assert _normalize_stats_mode("SIMPLE ") == "simple"
    assert _normalize_stats_mode("advanced") == "advanced"
    assert _normalize_stats_mode("cokolwiek") is None
    assert _normalize_stats_mode(None) is None


def test_the_stats_panel_follows_the_court_the_preset_is_about():
    overlay = {"elements": [
        {"type": "court", "court_id": "9", "zone": "top"},
        {"type": "court", "court_id": "2", "zone": "free"},
    ]}
    assert _resolve_stats_court_id("2", overlay) == "2", "the preset's own court wins"
    assert _resolve_stats_court_id("7", overlay) == "2", "otherwise the first court that is not the top bar"
    assert _resolve_stats_court_id("7", {"elements": [{"type": "court", "court_id": "9", "zone": "top"}]}) == "9"
    assert _resolve_stats_court_id("3", {}) == "3", "with nothing to go on, the preset id"


def test_a_preset_can_be_deleted_and_the_deletion_is_kept(store):
    get_overlay_settings()
    assert delete_overlay("all") is True
    assert delete_overlay("all") is False, "deleting it twice is not an error"
    assert "all" not in get_overlay_settings()["overlays"]
    assert "all" not in _saved(store)["overlays"]


def test_saved_settings_are_read_back_instead_of_the_defaults(store):
    store[_DB_KEY] = json.dumps({
        "tournament_name": "Zapisany",
        "canvas_layout_migrated": overlay_settings._CANVAS_LAYOUT_VERSION,
        "overlays": {"1": {"name": "Mój kort", "elements": []}},
    })
    settings = get_overlay_settings()
    assert settings["tournament_name"] == "Zapisany"
    assert list(settings["overlays"]) == ["1"], "defaults do not come back over what the user saved"


def test_an_unreadable_row_falls_back_to_the_defaults_instead_of_breaking_the_overlay(store):
    store[_DB_KEY] = "{to nie jest JSON"
    settings = get_overlay_settings()
    assert set(settings["overlays"]) == {"1", "2", "3", "4", "all"}


def test_presets_saved_before_the_canvas_layout_are_brought_up_to_it(store):
    store[_DB_KEY] = json.dumps({
        "tournament_name": "Stary",
        "overlays": {"1": {"name": "Kort 1", "elements": [], "auto_hide": False}},
    })
    overlays = get_overlay_settings()["overlays"]
    assert overlays["1"]["elements"], "the old, empty preset gets the canvas layout"
    assert overlays["1"]["auto_hide"] is True
    assert overlays["1"]["name"] == "Kort 1", "the name the user gave it stays"
    assert set(overlays) >= {"1", "2", "3", "4"}, "the presets that were missing are created"
    assert _saved(store)["canvas_layout_migrated"] == overlay_settings._CANVAS_LAYOUT_VERSION
