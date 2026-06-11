"""Unit tests for the pure auto-placement scheduler (no DB, no Flask)."""
from wyniki.services import auto_scheduler as sched


def _courts():
    return [
        {"kort_id": "c1", "display_order": 1},
        {"kort_id": "c2", "display_order": 2},
        {"kort_id": "c3", "display_order": 3},
        {"kort_id": "c4", "display_order": 4},
    ]


def test_normalize_band():
    assert sched.normalize_band("B1 Mężczyźni") == "B1"
    assert sched.normalize_band("B4 Kobiety — Finał") == "B4"
    assert sched.normalize_band("b2 mezczyzni") == "B2"
    assert sched.normalize_band("Kategoria do ustalenia") == ""
    assert sched.normalize_band(None) == ""


def test_add_minutes():
    assert sched.add_minutes("09:30", 60) == "10:30"
    assert sched.add_minutes("09:30", 75) == "10:45"
    assert sched.add_minutes("23:30", 60) == "23:59"  # clamped
    assert sched.add_minutes("garbage", 60) == "10:30"  # falls back to 09:30


def test_build_default_config_b1_on_last_court():
    config = sched.build_default_config(_courts())
    assert config["category_courts"] == {"B4": "c1", "B3": "c2", "B2": "c3", "B1": "c4"}
    assert config["b1_court_id"] == "c4"
    assert config["slot_minutes"]["B1"] == 75
    assert config["slot_minutes"]["default"] == 60


def test_slot_minutes_for():
    config = sched.build_default_config(_courts())
    assert sched.slot_minutes_for("B1", config) == 75
    assert sched.slot_minutes_for("B2", config) == 60
    assert sched.slot_minutes_for("", config) == 60


def test_apply_b1_court_swaps_bands():
    config = sched.build_default_config(_courts())  # B1->c4, B2->c3
    moved = sched.apply_b1_court(config, "c3")
    assert moved["category_courts"]["B1"] == "c3"
    # band that was on c3 (B2) takes B1's old court c4
    assert moved["category_courts"]["B2"] == "c4"
    assert moved["b1_court_id"] == "c3"
    assert moved["b1_court_ids"] == ["c3"]


def test_apply_b1_courts_supports_multiple_special_courts():
    config = sched.build_default_config(_courts())
    moved = sched.apply_b1_courts(config, ["c3", "c4"])
    assert moved["b1_court_ids"] == ["c3", "c4"]
    assert moved["category_courts"]["B1"] == "c3"


def test_place_matches_distributes_b1_across_selected_courts():
    config = sched.apply_b1_courts(sched.build_default_config(_courts()), ["c3", "c4"])
    matches = [
        {"id": 1, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "A", "player2_name": "B", "sort_order": 1},
        {"id": 2, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "C", "player2_name": "D", "sort_order": 2},
        {"id": 3, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "E", "player2_name": "F", "sort_order": 3},
        {"id": 4, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "G", "player2_name": "H", "sort_order": 4},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    courts = {p["match"]["id"]: p["court_id"] for p in placements}
    assert courts[1] == "c3"
    assert courts[2] == "c4"
    assert courts[3] == "c3"
    assert courts[4] == "c4"


def test_place_matches_assigns_courts_and_cascading_times():
    config = sched.build_default_config(_courts())
    matches = [
        {"id": 1, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "A", "player2_name": "B", "sort_order": 1},
        {"id": 2, "category_name": "B1 Mężczyźni", "phase": "Grupowa", "player1_name": "C", "player2_name": "D", "sort_order": 2},
        {"id": 3, "category_name": "B2 Mężczyźni", "phase": "Grupowa", "player1_name": "E", "player2_name": "F", "sort_order": 1},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    by_id = {p["match"]["id"]: p for p in placements}
    # B1 matches go to c4 with 75-min slots
    assert by_id[1]["court_id"] == "c4"
    assert by_id[1]["scheduled_time"] == "09:30"
    assert by_id[2]["court_id"] == "c4"
    assert by_id[2]["scheduled_time"] == "10:45"  # +75
    # B2 match is load-balanced onto the first non-B1 court (c1)
    assert by_id[3]["court_id"] == "c1"
    assert by_id[3]["scheduled_time"] == "09:30"


def test_place_matches_respects_rest_no_back_to_back():
    config = sched.build_default_config(_courts())
    # Player X is in matches 1 and 2 (same court band). They must not be adjacent.
    matches = [
        {"id": 1, "category_name": "B2", "phase": "Grupowa", "player1_name": "X", "player2_name": "A", "sort_order": 1},
        {"id": 2, "category_name": "B2", "phase": "Grupowa", "player1_name": "X", "player2_name": "B", "sort_order": 2},
        {"id": 3, "category_name": "B2", "phase": "Grupowa", "player1_name": "C", "player2_name": "D", "sort_order": 3},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    order = [p["match"]["id"] for p in sorted(placements, key=lambda p: p["scheduled_time"])]
    pos = {mid: i for i, mid in enumerate(order)}
    assert abs(pos[1] - pos[2]) >= 2  # X's two matches separated by at least one slot


def test_place_matches_unmapped_band_uses_flex_court():
    config = sched.build_default_config(_courts())
    matches = [
        {"id": 9, "category_name": "Senior open", "phase": "Grupowa", "player1_name": "A", "player2_name": "B"},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    assert placements[0]["court_id"] == "c1"
    assert placements[0]["scheduled_time"] == "09:30"


def test_phase_rank_orders_group_before_final():
    config = sched.build_default_config(_courts())
    matches = [
        {"id": 1, "category_name": "B3", "phase": "B3 Mężczyźni — Finał", "player1_name": "A", "player2_name": "B", "sort_order": 5},
        {"id": 2, "category_name": "B3", "phase": "Grupowa", "player1_name": "C", "player2_name": "D", "sort_order": 1},
        {"id": 3, "category_name": "B3", "phase": "B3 Mężczyźni — Półfinał", "player1_name": "E", "player2_name": "F", "sort_order": 3},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    order = [p["match"]["id"] for p in sorted(placements, key=lambda p: p["scheduled_time"])]
    assert order == [2, 3, 1]  # group, semfinal, final


def test_recompute_court_times_cascade():
    config = sched.build_default_config(_courts())
    entries = [
        {"id": 1, "category_name": "B1", "scheduled_time": "10:00"},
        {"id": 2, "category_name": "B1", "scheduled_time": "08:00"},
        {"id": 3, "category_name": "B1", "scheduled_time": "07:00"},
    ]
    result = sched.recompute_court_times(entries, config)
    assert [e["scheduled_time"] for e in result] == ["10:00", "11:15", "12:30"]  # +75 each


def test_place_matches_load_balances_non_b1_across_flex_courts():
    config = sched.build_default_config(_courts())
    matches = [
        {
            "id": index,
            "category_name": "B2 Mężczyźni",
            "phase": "Grupowa",
            "player1_name": f"P{index}A",
            "player2_name": f"P{index}B",
            "sort_order": index,
        }
        for index in range(1, 7)
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    counts = {"c1": 0, "c2": 0, "c3": 0}
    for placement in placements:
        court_id = placement["court_id"]
        if court_id in counts:
            counts[court_id] += 1
    assert counts == {"c1": 2, "c2": 2, "c3": 2}


def test_recompute_court_times_with_explicit_start():
    config = sched.build_default_config(_courts())
    entries = [
        {"id": 1, "category_name": "B2", "scheduled_time": "10:00"},
        {"id": 2, "category_name": "B2", "scheduled_time": "11:00"},
    ]
    result = sched.recompute_court_times(entries, config, start_time="09:00")
    assert [e["scheduled_time"] for e in result] == ["09:00", "10:00"]  # +60
