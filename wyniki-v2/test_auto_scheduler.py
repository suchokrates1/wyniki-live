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


def _b2_round(count, start_id=1, phase="Grupowa", category="B2 Mężczyźni"):
    return [
        {
            "id": start_id + i,
            "category_name": category,
            "phase": phase,
            "player1_name": f"{category}-P{i * 2}",
            "player2_name": f"{category}-P{i * 2 + 1}",
            "sort_order": i,
        }
        for i in range(count)
    ]


def test_place_matches_leaves_what_does_not_fit_before_day_end_unplaced():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "11:00"
    # three flex courts, 60-minute slots, two hours: six matches fit
    placements = sched.place_matches(_b2_round(9), config, "2026-05-23")
    placed = [p for p in placements if p["court_id"]]
    unplaced = [p for p in placements if not p["court_id"]]
    assert len(placed) == 6
    assert len(unplaced) == 3
    assert all(p["scheduled_time"] in {"09:00", "10:00"} for p in placed)
    assert all(p["scheduled_time"] == "" for p in unplaced)


def test_place_matches_keeps_later_phase_back_when_its_category_overflows():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "10:00"
    matches = _b2_round(4) + [
        {"id": 99, "category_name": "B2 Mężczyźni", "phase": "Finał", "player1_name": "W1", "player2_name": "W2", "sort_order": 1},
    ]
    placements = sched.place_matches(matches, config, "2026-05-23")
    final = next(p for p in placements if p["match"]["id"] == 99)
    assert final["court_id"] is None


def test_place_matches_starts_courts_after_fixed_placements():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    occupied = [
        {"match": {"category_name": "B2 Mężczyźni", "player1_name": "X", "player2_name": "Y"}, "court_id": court, "scheduled_time": "09:00"}
        for court in ("c1", "c2", "c3")
    ]
    placements = sched.place_matches(_b2_round(1), config, "2026-05-23", occupied)
    assert placements[0]["scheduled_time"] == "10:00"


def test_place_matches_across_days_fills_each_day_then_leaves_the_rest():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "10:00"
    # three flex courts, one slot a day: 3 + 3 matches over two days, 1 left over
    placements = sched.place_matches_across_days(_b2_round(7), config, ["2026-05-23", "2026-05-24"])
    placed_day1 = [p for p in placements if p["court_id"] and p["day_date"] == "2026-05-23"]
    placed_day2 = [p for p in placements if p["court_id"] and p["day_date"] == "2026-05-24"]
    unplaced = [p for p in placements if not p["court_id"]]
    assert len(placed_day1) == 3
    assert len(placed_day2) == 3
    assert len(unplaced) == 1
    assert len({p["match"]["id"] for p in placements}) == 7


def test_place_matches_uses_every_non_b1_court():
    courts = [{"kort_id": f"k{i}", "display_order": i} for i in range(1, 12)]
    config = sched.build_default_config(courts)
    config["start_time"] = "09:00"
    config["end_time"] = "10:00"
    placements = sched.place_matches(_b2_round(20), config, "2026-08-25")
    used = {p["court_id"] for p in placements if p["court_id"]}
    assert len(used) == 10  # eleven courts, one of them B1
    assert config["b1_court_ids"][0] not in used


def _round_robin(category, groups, size):
    matches = []
    for g in range(groups):
        names = [f"{category}-{g}-{i}" for i in range(size)]
        for a in range(size):
            for b in range(a + 1, size):
                matches.append({
                    "id": len(matches) + 1, "category_name": category, "phase": "Grupowa",
                    "player1_name": names[a], "player2_name": names[b], "sort_order": len(matches) + 1,
                })
    return matches


def _assert_no_player_overlap(placements, config):
    windows = {}
    for placement in placements:
        if not placement["court_id"]:
            continue
        start, end = sched._placement_window(placement, config)
        for name in (placement["match"]["player1_name"], placement["match"]["player2_name"]):
            for other_start, other_end in windows.get(name, []):
                assert not (start < other_end and end > other_start), f"{name} double-booked at {placement['scheduled_time']}"
            windows.setdefault(name, []).append((start, end))


def test_b1_courts_never_double_book_a_player():
    courts = [{"kort_id": f"k{i}", "display_order": i} for i in range(1, 12)]
    config = sched.apply_b1_courts(sched.build_default_config(courts), ["k9", "k10", "k11"])
    config["start_time"] = "09:00"
    config["end_time"] = "18:00"
    placements = sched.place_matches(_round_robin("B1 Men", 6, 3), config, "2026-08-25")
    _assert_no_player_overlap(placements, config)
    assert all(p["court_id"] in {"k9", "k10", "k11"} for p in placements if p["court_id"])


def test_flex_courts_push_a_match_later_instead_of_double_booking():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "18:00"
    placements = sched.place_matches(_round_robin("B3 Men", 3, 4), config, "2026-08-25")
    _assert_no_player_overlap(placements, config)
    assert all(p["court_id"] for p in placements)


def test_phase_rank_knockout_of_single_group_is_not_group_phase():
    assert sched._phase_rank("B4 Men — Grupa A — Finał") == 8
    assert sched._phase_rank("B4 Men — Grupa A — o 3. miejsce") == 7
    assert sched._phase_rank("Grupowa") == 0
    assert sched._phase_rank("Grupowa — Rewanż") == 0


def test_knockout_waits_for_the_end_of_its_group_phase():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "18:00"
    group_on_day2 = {"match": {"id": 1, "category_name": "B4 Men", "phase": "Grupowa", "player1_name": "X", "player2_name": "Y"},
                     "court_id": "c1", "scheduled_time": "14:00"}
    final = {"id": 9, "category_name": "B4 Men — Grupa A", "phase": "B4 Men — Grupa A — Finał", "player1_name": "P", "player2_name": "Q"}
    other = {"id": 8, "category_name": "B3 Men — Grupa A", "phase": "B3 Men — Grupa A — Finał", "player1_name": "R", "player2_name": "S"}
    placements = sched.place_matches_across_days(
        [final, other], config, ["2026-08-24", "2026-08-25"], {"2026-08-25": [group_on_day2]},
    )
    by_id = {p["match"]["id"]: p for p in placements}
    assert by_id[9]["day_date"] == "2026-08-25"
    assert by_id[9]["scheduled_time"] >= "15:00"
    assert by_id[8]["day_date"] == "2026-08-24"


def test_phase_rank_orders_vilnius_draw_rounds():
    order = [
        "B1 Men — 1/8 finału", "B1 Men — Ćwierćfinał", "B1 Men — Półfinał",
        "B1 Men — o 13. miejsce", "B1 Men — o 3. miejsce", "B1 Men — Finał",
    ]
    ranks = [sched._phase_rank(phase) for phase in order]
    assert ranks == sorted(ranks) and len(set(ranks)) == len(ranks)
    assert sched._phase_rank("B1 Men — o miejsca 9–16") == sched._phase_rank("B1 Men — Ćwierćfinał")
    assert sched._phase_rank("B1 Men — o miejsca 5–8") == sched._phase_rank("B1 Men — Półfinał")


def test_a_pair_blocks_both_partners_and_pending_names_never_clash():
    config = sched.build_default_config(_courts())
    config["start_time"] = "09:00"
    config["end_time"] = "18:00"
    matches = [
        {"id": 1, "category_name": "B2 Men", "phase": "Grupowa", "player1_name": "Jan Kos", "player2_name": "Ola Wit", "sort_order": 1},
        {"id": 2, "category_name": "B2 Men Doubles", "phase": "B2 Men Doubles — Ćwierćfinał", "player1_name": "Jan Kos / Piotr Lis", "player2_name": "Ada Nowak / Ewa Sosna", "sort_order": 2},
        {"id": 3, "category_name": "B3 Men", "phase": "B3 Men — Finał", "player1_name": "Zwycięzca: Półfinał 1", "player2_name": "Zwycięzca: Półfinał 2", "sort_order": 3},
        {"id": 4, "category_name": "B2 Women", "phase": "B2 Women — Finał", "player1_name": "Zwycięzca: Półfinał 1", "player2_name": "Zwycięzca: Półfinał 2", "sort_order": 4},
    ]
    assert sched._players(matches[1]) == {"jan kos", "piotr lis", "ada nowak", "ewa sosna"}
    assert sched._players(matches[2]) == set()
    placements = {p["match"]["id"]: p for p in sched.place_matches(matches, config, "2026-08-25")}
    assert placements[1]["scheduled_time"] != placements[2]["scheduled_time"]
    assert placements[3]["scheduled_time"] == placements[4]["scheduled_time"] == "09:00"
