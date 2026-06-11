from wyniki.database import _compute_knockout_slots_from_bracket


def test_four_player_single_group_creates_semifinals_final_and_third_place():
    result = _compute_knockout_slots_from_bracket([
        {
            "name": "B3/4 Mixed",
            "standings": [{"name": f"P{i}"} for i in range(1, 5)],
        }
    ])
    phases = [slot["phase"] for slot in result["knockout"]]
    assert "B3/4 Mixed — Półfinał" in phases
    assert "B3/4 Mixed — Finał" in phases
    assert "B3/4 Mixed — o 3. miejsce" in phases


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
