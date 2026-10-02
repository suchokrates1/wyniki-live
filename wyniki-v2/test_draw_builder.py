"""The knockout draws: who faces whom, where byes go, and where a result travels next."""

from wyniki.services.draw_builder import (
    build_cross_draw,
    build_direct_draw,
    build_group_draws,
    build_table_final,
    direct_draw_lines,
    group_draw_lines,
    place_entrants,
    places_flags,
    seed_lines,
    swap_lines,
)


def _groups(*rankings):
    return [{"name": chr(ord("A") + index), "ranking": list(names)} for index, names in enumerate(rankings)]


def _phases(slots):
    return {slot["phase"] for slot in slots}


def _slot(slots, phase_ending, position=1):
    return next(s for s in slots if s["phase"].endswith(phase_ending) and s["position"] == position)


def test_seed_order_keeps_the_top_two_apart_until_the_final():
    assert seed_lines(2) == [1, 2]
    assert seed_lines(4) == [1, 4, 2, 3]
    assert seed_lines(8) == [1, 8, 4, 5, 2, 7, 3, 6]
    # Seeds 1 and 2 sit in opposite halves of every size.
    for size in (4, 8, 16):
        lines = seed_lines(size)
        assert (lines.index(1) < size // 2) != (lines.index(2) < size // 2)


def test_byes_go_to_the_top_seeds_and_group_mates_are_pulled_apart():
    # Three groups, two qualifiers each: six entrants on eight lines, so two byes.
    lines = place_entrants([[("A", "a1"), ("B", "b1"), ("C", "c1")], [("A", "a2"), ("B", "b2"), ("C", "c2")]])
    assert len(lines) == 8
    assert lines.count(None) == 2
    # The two seeds that meet latest are the ones left without a first-round opponent.
    byes = [index for index, entrant in enumerate(lines) if entrant is None]
    assert sorted(lines[index ^ 1][1] for index in byes) == ["a1", "b1"]
    # Nobody opens against a player from their own group.
    for index, entrant in enumerate(lines):
        rival = lines[index ^ 1]
        if entrant and rival:
            assert entrant[0] != rival[0], lines


def test_a_group_draw_plays_out_every_place_and_names_the_rounds():
    slots = build_group_draws("B2 Mężczyźni", _groups(["a1", "a2", "a3"], ["b1", "b2", "b3"], ["c1", "c2", "c3"]))
    phases = _phases(slots)
    assert "B2 Mężczyźni — Finał" in phases
    assert "B2 Mężczyźni — o 3. miejsce" in phases
    assert "B2 Mężczyźni — Pocieszenie Finał" in phases, "the rest of each group plays its own draw"
    # Six entrants, two byes: the main draw opens with two quarterfinals, not four.
    main = [slot for slot in slots if "Pocieszenie" not in slot["phase"]]
    assert len([slot for slot in main if slot["phase"].endswith("Ćwierćfinał")]) == 2
    assert len([slot for slot in main if slot["phase"].endswith("Półfinał")]) == 2
    assert "B2 Mężczyźni — o 5. miejsce" in phases, "the quarterfinal losers still play"


def test_a_bye_hands_the_player_straight_to_the_next_round():
    # Three names on four lines: the top seed has a bye and waits in the final.
    slots = build_direct_draw("B1 Kobiety", ["pierwsza", "druga", "trzecia"], places="none")
    assert len(slots) == 2
    semi = _slot(slots, "Półfinał")
    final = _slot(slots, "Finał")
    assert {semi["player1_name"], semi["player2_name"]} == {"druga", "trzecia"}
    assert final["player1_name"] == "pierwsza", "no empty match against a bye"
    assert final["player2_name"].startswith("Zwycięzca:")
    assert semi["winner_to"] == (final["phase"], 1, 2)


def test_the_loser_of_a_semifinal_walks_into_the_third_place_match():
    slots = build_direct_draw("B2 Mężczyźni", ["a", "b", "c", "d"], places="third")
    first, second = [slot for slot in slots if slot["phase"].endswith("Półfinał")]
    third = _slot(slots, "o 3. miejsce")
    assert first["loser_to"] == (third["phase"], 1, 1)
    assert second["loser_to"] == (third["phase"], 1, 2)
    assert third["player1_name"].startswith("Przegrany:")


def test_places_decide_how_much_of_the_draw_is_played():
    assert places_flags("all") == (True, True)
    assert places_flags("third") == (False, True)
    assert places_flags("none") == (False, False)
    assert places_flags("cokolwiek") == (True, True), "an unknown value plays everything out"

    names = ["a", "b", "c", "d"]
    assert not [slot for slot in build_direct_draw("X", names, places="none") if "miejsce" in slot["phase"]]
    assert len(build_direct_draw("X", names, places="third")) == 4
    assert len(build_direct_draw("X", names, places="all")) == 4


def test_a_draw_too_small_to_play_comes_back_empty():
    assert direct_draw_lines(["sama"]) == []
    assert direct_draw_lines([" ", ""]) == []
    assert build_direct_draw("X", ["sama"]) == []
    assert build_cross_draw("X", _groups(["a1", "a2"])) == [], "two groups are needed"
    assert build_cross_draw("X", _groups(["a1"], ["b1"])) == [], "each group needs a runner-up"
    assert build_table_final("X", ["sam"]) == []


def test_manual_swaps_move_first_round_lines_and_ignore_nonsense():
    assert swap_lines(["a", "b", "c", "d"], [[0, 3]]) == ["d", "b", "c", "a"]
    assert swap_lines(["a", "b"], [[0, 0], [0, 9], ["x", 1], None]) == ["a", "b"]
    # Seeding puts a-d and b-c together; swapping lines 1 and 2 makes it a-b and d-c.
    assert direct_draw_lines(["a", "b", "c", "d"]) == ["a", "d", "b", "c"]
    swapped = build_direct_draw("X", ["a", "b", "c", "d"], swaps=[[1, 2]])
    opening = sorted((slot["player1_name"], slot["player2_name"]) for slot in swapped if slot["phase"].endswith("Półfinał"))
    assert opening == [("a", "b"), ("d", "c")]


def test_two_groups_cross_in_the_semifinals():
    groups = _groups(["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"])
    slots = build_cross_draw("B3 Mężczyźni", groups, places="all")
    semis = sorted(
        (slot["player1_name"], slot["player2_name"])
        for slot in slots
        if slot["phase"].endswith("Półfinał")
    )
    assert semis == [("a1", "b2"), ("b1", "a2")]
    # With every place played out, the thirds and the fourths meet too.
    assert _slot(slots, "o 5. miejsce")["player1_name"] == "a3"
    assert _slot(slots, "o 7. miejsce")["player2_name"] == "b4"


def test_one_group_ends_with_a_final_and_a_third_place_match():
    assert [slot["phase"] for slot in build_table_final("B4 Kobiety", ["a", "b", "c"])] == ["B4 Kobiety — Finał"]
    slots = build_table_final("B4 Kobiety", ["a", "b", "c", "d"])
    assert [slot["player1_name"] for slot in slots] == ["a", "c"]
    assert build_table_final("B4 Kobiety", ["a", "b", "c", "d"], places="none")[0]["phase"].endswith("Finał")


def test_group_lines_hold_the_qualifiers_and_the_consolation_takes_the_rest():
    groups = _groups(["a1", "a2", "a3"], ["b1", "b2", "b3"], ["c1", "c2", "c3"])
    lines = group_draw_lines(groups, qualifiers=2)
    assert sorted(entrant[1] for entrant in lines["main"] if entrant) == ["a1", "a2", "b1", "b2", "c1", "c2"]
    assert sorted(entrant[1] for entrant in lines["consolation"] if entrant) == ["a3", "b3", "c3"]
    assert group_draw_lines(groups, qualifiers=2, consolation=False)["consolation"] is None
    # One qualifier each: three players, so the consolation takes everyone else.
    single = group_draw_lines(groups, qualifiers=1)
    assert sorted(entrant[1] for entrant in single["main"] if entrant) == ["a1", "b1", "c1"]
    assert len([entrant for entrant in single["consolation"] if entrant]) == 6
