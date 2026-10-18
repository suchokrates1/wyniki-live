"""A tournament's rule for players level on wins in a group table."""
import json

from wyniki.database.bracket_standings import _compute_standings
from wyniki.database.table_order import table_order


def _match(p1, p2, games):
    """A finished match from its set games, e.g. [(4, 2), (2, 4), (4, 1)]."""
    s1 = sum(1 for a, b in games if a > b)
    s2 = sum(1 for a, b in games if b > a)
    return {
        "id": hash((p1, p2)) % 10_000,
        "player1_name": p1,
        "player2_name": p2,
        "player1_sets": s1,
        "player2_sets": s2,
        "sets_history": json.dumps([
            {"set_number": n, "player1_games": a, "player2_games": b} for n, (a, b) in enumerate(games, 1)
        ]),
        "winner_name": p1 if s1 > s2 else p2,
    }


# A and B both win twice; A beat B, but B has the better set difference (+3 against 0).
TWO_LEVEL = [
    _match("A", "B", [(4, 2), (2, 4), (4, 1)]),
    _match("A", "D", [(4, 1), (1, 4), (4, 0)]),
    _match("C", "A", [(4, 2), (4, 2)]),
    _match("B", "C", [(4, 0), (4, 0)]),
    _match("B", "D", [(4, 0), (4, 0)]),
    _match("D", "C", [(4, 3), (4, 3)]),
]


def _order(matches, rule):
    standings, _ = _compute_standings(["A", "B", "C", "D"], matches, rule)
    return [row["name"] for row in standings]


def test_the_default_rule_is_wins_then_sets_then_games():
    assert _order(TWO_LEVEL, "wins_sets_games")[:2] == ["B", "A"]


def test_head_to_head_puts_the_winner_of_their_match_first():
    assert _order(TWO_LEVEL, "wins_h2h_sets_games")[:2] == ["A", "B"]
    assert _order(TWO_LEVEL, "itf")[:2] == ["A", "B"]


def test_itf_splits_three_level_players_by_share_of_sets():
    # A beat B, B beat C, C beat A: one win each among them. Sets: A 3/5, C 3/6, B 2/5.
    cycle = [
        _match("A", "B", [(4, 1), (4, 1)]),
        _match("B", "C", [(4, 2), (2, 4), (4, 2)]),
        _match("C", "A", [(4, 2), (2, 4), (4, 2)]),
    ]
    standings, _ = _compute_standings(["A", "B", "C"], cycle, "itf")
    assert [row["name"] for row in standings] == ["A", "C", "B"]


def test_an_unknown_rule_is_the_default():
    assert table_order("ITF") == "itf"
    assert table_order("") == "wins_sets_games"
    assert table_order("random") == "wins_sets_games"
    assert _order(TWO_LEVEL, "random") == _order(TWO_LEVEL, "wins_sets_games")


def test_the_rule_is_stored_with_the_tournament(tmp_path, monkeypatch):
    db_path = tmp_path / "order.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    from wyniki.config import settings
    monkeypatch.setattr(settings, "database_path", str(db_path))
    from wyniki.database import fetch_tournament, init_db, insert_tournament
    from wyniki.database.table_order import set_tournament_table_order, tournament_table_order

    init_db()
    tid = insert_tournament("T", "2026-10-01", "2026-10-02")
    assert tournament_table_order(tid) == "wins_sets_games"
    assert set_tournament_table_order(tid, "itf") == "itf"
    assert fetch_tournament(tid)["table_order"] == "itf"
