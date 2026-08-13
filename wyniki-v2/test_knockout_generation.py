from wyniki.database import (
    _compute_knockout_slots_from_bracket,
    _compute_provisional_knockout_slots_from_bracket,
)


def test_four_player_single_group_creates_final_and_third_place_only():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B3/4 Mixed",
            "standings": [{"name": f"P{i}"} for i in range(1, 5)],
        }
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert "B3/4 Mixed — Półfinał" not in phases
    assert result["knockout"] == [
        {
            "phase": "B3/4 Mixed — Finał",
            "position": 1,
            "player1_name": "P1",
            "player2_name": "P2",
        },
        {
            "phase": "B3/4 Mixed — o 3. miejsce",
            "position": 1,
            "player1_name": "P3",
            "player2_name": "P4",
        },
    ]


def test_three_player_single_group_keeps_direct_final():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B2 Kobiety",
            "standings": [{"name": f"P{i}"} for i in range(1, 4)],
        }
    ])
    assert result["knockout"] == [
        {
            "phase": "B2 Kobiety — Finał",
            "position": 1,
            "player1_name": "P1",
            "player2_name": "P2",
        }
    ]


def test_provisional_single_group_uses_standing_placeholders():
    result = _compute_provisional_knockout_slots_from_bracket(
        [
            {
                "name": "B2 Mężczyźni",
                "standings": [{"name": f"P{i}"} for i in range(1, 5)],
            }
        ],
        tournament_id=0,
        group_id_by_name={"B2 Mężczyźni": 1},
        player_count_by_name={"B2 Mężczyźni": 4},
    )
    assert result["knockout"] == [
        {
            "phase": "B2 Mężczyźni — Finał",
            "position": 1,
            "player1_name": "1. B2 Mężczyźni",
            "player2_name": "2. B2 Mężczyźni",
        },
        {
            "phase": "B2 Mężczyźni — o 3. miejsce",
            "position": 1,
            "player1_name": "3. B2 Mężczyźni",
            "player2_name": "4. B2 Mężczyźni",
        },
    ]


def test_provisional_two_groups_use_group_letter_placeholders():
    result = _compute_provisional_knockout_slots_from_bracket(
        [
            {
                "name": "B1 Mężczyźni — Grupa A",
                "standings": [{"name": "A1"}, {"name": "A2"}],
            },
            {
                "name": "B1 Mężczyźni — Grupa B",
                "standings": [{"name": "B1"}, {"name": "B2"}],
            },
        ],
        tournament_id=0,
        group_id_by_name={
            "B1 Mężczyźni — Grupa A": 1,
            "B1 Mężczyźni — Grupa B": 2,
        },
        player_count_by_name={
            "B1 Mężczyźni — Grupa A": 2,
            "B1 Mężczyźni — Grupa B": 2,
        },
    )
    semis = [slot for slot in result["knockout"] if "Półfinał" in slot["phase"]]
    assert semis[0]["player1_name"] == "1. B1 Mężczyźni — Grupa A"
    assert semis[0]["player2_name"] == "2. B1 Mężczyźni — Grupa B"


def test_two_groups_per_category_create_semifinals():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B1 Mężczyźni — Grupa A",
            "standings": [{"name": "A1"}, {"name": "A2"}],
        },
        {
            "name": "B1 Mężczyźni — Grupa B",
            "standings": [{"name": "B1"}, {"name": "B2"}],
        },
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert phases.count("B1 Mężczyźni — Półfinał") == 2
    assert "B1 Mężczyźni — Finał" in phases
    assert "B1 Mężczyźni — o 3. miejsce" in phases


def test_round_robin_group_does_not_create_knockout():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B4 Mixed",
            "play_format": "round_robin",
            "standings": [{"name": f"P{i}"} for i in range(1, 5)],
        }
    ])
    assert result.get("error")
    assert "knockout" not in result


def test_mixed_round_robin_and_groups_knockout_only_builds_ready_cup():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B4 Mixed",
            "play_format": "round_robin",
            "standings": [{"name": f"R{i}"} for i in range(1, 4)],
        },
        {
            "name": "B1 Mężczyźni — Grupa A",
            "play_format": "groups_knockout",
            "standings": [{"name": "A1"}, {"name": "A2"}],
        },
        {
            "name": "B1 Mężczyźni — Grupa B",
            "play_format": "groups_knockout",
            "standings": [{"name": "B1"}, {"name": "B2"}],
        },
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert all(not phase.startswith("B4 Mixed") for phase in phases)
    assert phases.count("B1 Mężczyźni — Półfinał") == 2
    assert {(slot["player1_name"], slot["player2_name"]) for slot in result["knockout"] if slot["phase"] == "B1 Mężczyźni — Półfinał"} == {
        ("A1", "B2"),
        ("B1", "A2"),
    }


def test_mixed_bucket_does_not_cross_when_one_group_is_not_groups_knockout():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B1 Mężczyźni — Grupa A",
            "play_format": "groups_knockout",
            "standings": [{"name": f"A{i}"} for i in range(1, 5)],
        },
        {
            "name": "B1 Mężczyźni — Grupa B",
            "play_format": "round_robin",
            "standings": [{"name": f"B{i}"} for i in range(1, 5)],
        },
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert "B1 Mężczyźni — Półfinał" not in phases
    assert "B1 Mężczyźni — Grupa A — Finał" in phases
    assert "B1 Mężczyźni — Grupa A — o 3. miejsce" in phases
    assert all("Grupa B" not in phase for phase in phases)


def test_knockout_only_four_players_use_semifinals_not_direct_final():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B2 Kobiety",
            "play_format": "knockout",
            "players": [{"name": f"P{i}"} for i in range(1, 5)],
        }
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert phases.count("B2 Kobiety — Półfinał") == 2
    assert "B2 Kobiety — Finał" in phases
    assert "B2 Kobiety — o 3. miejsce" in phases
    semis = [slot for slot in result["knockout"] if slot["phase"] == "B2 Kobiety — Półfinał"]
    assert {(slot["position"], slot["player1_name"], slot["player2_name"]) for slot in semis} == {
        (1, "P1", "P4"),
        (2, "P2", "P3"),
    }


def test_two_knockout_only_groups_keep_separate_finals():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B1 Men — Grupa A",
            "play_format": "knockout",
            "players": [{"name": "A1"}, {"name": "A2"}],
        },
        {
            "name": "B1 Men — Grupa B",
            "play_format": "knockout",
            "players": [{"name": "B1"}, {"name": "B2"}],
        },
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert "B1 Men — Półfinał" not in phases
    assert "B1 Men — Grupa A — Finał" in phases
    assert "B1 Men — Grupa B — Finał" in phases
    finals = {slot["phase"]: (slot["player1_name"], slot["player2_name"]) for slot in result["knockout"]}
    assert finals["B1 Men — Grupa A — Finał"] == ("A1", "A2")
    assert finals["B1 Men — Grupa B — Finał"] == ("B1", "B2")
