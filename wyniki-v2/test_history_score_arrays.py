from wyniki.services.history_manager import _build_history_entry, _score_arrays_from_sets_history


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


def test_history_entry_uses_match_names_when_court_already_shows_next_pair(monkeypatch):
    """Finish may land after the next match has overwritten court overlay names."""
    class _Match:
        player1_name = "Dajana Zgrzebska"
        player2_name = "Katarzyna Antczak"
        phase = "Grupowa"
        winner_name = "Katarzyna Antczak"
        injured_player_name = None
        result_note = None
        finish_reason = "normal"
        sets_history = (
            '[{"set_number":1,"player1_games":2,"player2_games":4},'
            '{"set_number":2,"player1_games":4,"player2_games":1},'
            '{"set_number":3,"player1_games":7,"player2_games":10,"is_super_tiebreak":true}]'
        )

    class _Session:
        @staticmethod
        def get(_model, match_id):
            assert match_id == 781
            return _Match()

    monkeypatch.setattr("wyniki.db_models.db.session", _Session())

    entry = _build_history_entry(
        "t32-3",
        {
            "A": {"full_name": "Eryk Ozimek", "set1": 0, "set2": 0, "set3": 0},
            "B": {"full_name": "Michał Stypa", "set1": 0, "set2": 0, "set3": 0},
            "match_time": {"seconds": 3600},
            "history_meta": {
                "match_id": 781,
                "phase": "Grupowa",
                "winner_name": "Katarzyna Antczak",
                "finish_reason": "normal",
                "category": "B3-B4 Kobiety",
            },
        },
    )

    assert entry["player_a"] == "Dajana Zgrzebska"
    assert entry["player_b"] == "Katarzyna Antczak"
    assert entry["winner_name"] == "Katarzyna Antczak"
    assert entry["score_a"] == [2, 4, 7]
    assert entry["score_b"] == [4, 1, 10]
