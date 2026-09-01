from wyniki.services.history_manager import _score_arrays_from_sets_history


def test_score_arrays_keep_super_tiebreak_points():
    score_a, score_b = _score_arrays_from_sets_history([
        {"set_number": 1, "player1_games": 4, "player2_games": 2, "is_super_tiebreak": False},
        {"set_number": 2, "player1_games": 2, "player2_games": 4, "is_super_tiebreak": False},
        {"set_number": 3, "player1_games": 10, "player2_games": 3, "is_super_tiebreak": True},
    ])
    assert score_a == [4, 2, 10]
    assert score_b == [2, 4, 3]


def test_score_arrays_expand_placeholder_super_tiebreak():
    score_a, score_b = _score_arrays_from_sets_history([
        {"set_number": 1, "player1_games": 4, "player2_games": 1, "is_super_tiebreak": False},
        {"set_number": 2, "player1_games": 2, "player2_games": 4, "is_super_tiebreak": False},
        {
            "set_number": 3,
            "player1_games": 0,
            "player2_games": 1,
            "is_super_tiebreak": True,
            "tiebreak_loser_points": 7,
        },
    ])
    assert score_a == [4, 2, 7]
    assert score_b == [1, 4, 10]
