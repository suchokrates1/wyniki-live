from wyniki.database import _compute_knockout_slots_from_bracket


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
