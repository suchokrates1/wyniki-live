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


def _row(match_id, p1, p2, s1, s2, sets, winner, reason="normal"):
    import json as _json
    return {"id": match_id, "player1_name": p1, "player2_name": p2, "player1_sets": s1, "player2_sets": s2,
            "sets_history": _json.dumps([{"player1_games": a, "player2_games": b} for a, b in sets]),
            "winner_name": winner, "finish_reason": reason}


def _by_name(table):
    return {row["name"]: row for row in table}


def test_a_walkover_is_a_win_but_adds_no_sets_and_no_games():
    """ATP Rulebook ch. IV: a walkover does not count towards the percentage of sets or games."""
    from wyniki.database.bracket_standings import _compute_standings

    table, _ = _compute_standings(["A", "B"], [_row(1, "A", "B", 2, 0, [(4, 0), (4, 0)], "A", "walkover")])
    a, b = _by_name(table)["A"], _by_name(table)["B"]

    assert (a["wins"], a["played"], b["losses"], b["played"]) == (1, 1, 1, 1)
    assert (a["sets_won"], a["sets_lost"], a["games_won"], a["games_lost"]) == (0, 0, 0, 0)
    assert (b["sets_won"], b["sets_lost"], b["games_won"], b["games_lost"]) == (0, 0, 0, 0)


def test_a_retirement_counts_as_a_straight_set_result_and_its_games_do_not_count():
    """ATP Rulebook ch. IV: so that nobody gains by retiring once a set is won."""
    from wyniki.database.bracket_standings import _compute_standings

    # B won the first set 4:1, then retired at 0:2 in the second
    retired = _row(1, "A", "B", 0, 1, [(1, 4), (2, 0)], "A", "retirement")
    table, _ = _compute_standings(["A", "B"], [retired])
    a, b = _by_name(table)["A"], _by_name(table)["B"]

    assert (a["wins"], b["wins"]) == (1, 0)
    assert (a["sets_won"], a["sets_lost"], b["sets_won"], b["sets_lost"]) == (2, 0, 0, 2)
    assert (a["games_won"], a["games_lost"], b["games_won"], b["games_lost"]) == (0, 0, 0, 0)


def test_a_walkover_no_longer_decides_a_tie_on_games():
    from wyniki.database.bracket_standings import _compute_standings

    matches = [
        _row(1, "A", "B", 2, 0, [(4, 2), (4, 2)], "A"),             # A beats B, +4 games
        _row(2, "B", "C", 2, 0, [(4, 3), (4, 3)], "B"),             # B beats C, +2 games
        _row(3, "C", "A", 2, 0, [(4, 0), (4, 0)], "C", "walkover"),  # C gets a walkover over A
    ]
    table, _ = _compute_standings(["A", "B", "C"], matches)

    # one win each; the walkover's 8:0 used to put C first on games
    assert [row["name"] for row in table][0] == "A"
    assert _by_name(table)["C"]["game_diff"] == -2
