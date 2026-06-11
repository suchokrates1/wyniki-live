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
    assert semis[0]["player1_name"] == "1A"
    assert semis[0]["player2_name"] == "2B"


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
