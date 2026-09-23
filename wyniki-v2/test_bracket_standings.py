import json

from wyniki.database.bracket_standings import _compute_standings, _is_empty_set, _is_stb


def _match(winner, sets):
    return {
        "id": 1,
        "player1_name": "A",
        "player2_name": "B",
        "player1_sets": 1 if winner == "A" else 0,
        "player2_sets": 1 if winner == "B" else 0,
        "sets_history": json.dumps(sets),
        "winner_name": winner,
    }


def test_standings_rank_the_winner_first_and_skip_an_empty_set():
    sets = [
        {"set_number": 1, "player1_games": 4, "player2_games": 1},
        {"set_number": 2, "player1_games": 0, "player2_games": 0},
    ]
    assert _is_empty_set(sets[1])
    standings, results = _compute_standings(["A", "B"], [_match("A", sets)])
    assert [row["name"] for row in standings] == ["A", "B"]
    assert standings[0]["wins"] == 1
    assert standings[0]["games_won"] == 4
    assert results[0]["score"] == "4:1"


def test_super_tiebreak_games_do_not_enter_the_game_diff():
    sets = [{
        "set_number": 3,
        "player1_games": 1,
        "player2_games": 0,
        "tiebreak_loser_points": 8,
        "is_super_tiebreak": True,
    }]
    assert _is_stb(sets[0])
    standings, _results = _compute_standings(["A", "B"], [_match("A", sets)])
    assert standings[0]["games_won"] == 0
    assert standings[0]["wins"] == 1
