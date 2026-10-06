from types import SimpleNamespace

from wyniki.services.history_results import result_winner
from wyniki.services.player_profile import _knockout_finish


def _row(sets, score_a, score_b):
    return SimpleNamespace(player_a="Rafał Sudoł", player_b="Sławomir Tolak-Ciszewski",
                           sets_history=sets, score_a=score_a, score_b=score_b)


def test_a_super_tiebreak_left_out_of_the_score_arrays_still_decides_the_match():
    # Leszno 2026: score_a / score_b kept two sets, the super tie-break lives only in the set history
    row = _row(
        [
            {"player1_games": 5, "player2_games": 3},
            {"player1_games": 2, "player2_games": 4},
            {"player1_games": 10, "player2_games": 6, "is_super_tiebreak": True},
        ],
        [5, 2],
        [3, 4],
    )
    assert result_winner(row) == "Rafał Sudoł"


def test_without_a_set_history_the_score_arrays_decide():
    assert result_winner(_row(None, [4, 4], [1, 2])) == "Rafał Sudoł"
    assert result_winner(_row(None, [4, 1], [1, 4])) is None


class _Subject:
    def __init__(self, name):
        self.name = name

    def named_in(self, text):
        return self.name in (text or "")

    def is_named(self, text):
        return self.name == text


def _slot(p1, p2, winner):
    return {"player1": p1, "player2": p2, "winner": winner}


def test_a_consolation_final_is_not_a_medal():
    bracket = {"knockout": {
        "B1 Men — Consolation Finał": [_slot("Luca Parravano", "Rafał Sudoł", "Luca Parravano")],
        "B1 Men — 07 Consolation Półfinał": [_slot("Rafał Sudoł", "Sławomir Tolak-Ciszewski", "Rafał Sudoł")],
    }}
    assert _knockout_finish(bracket, _Subject("Rafał Sudoł")) == (None, None)


def test_placement_draws_do_not_count_as_the_main_semifinal():
    bracket = {"knockout": {
        "B1 Men — 10 9–16 Półfinał": [_slot("Renzo Del Cont", "Justas Pažarauskas", "Renzo Del Cont")],
    }}
    assert _knockout_finish(bracket, _Subject("Renzo Del Cont")) == (None, None)


def test_the_main_final_is_still_gold_or_silver():
    bracket = {"knockout": {"B1 Men — Finał": [_slot("Naqi Rizvi", "Jani Kallunki", "Jani Kallunki")]}}
    assert _knockout_finish(bracket, _Subject("Jani Kallunki"))[0] == "gold"
    assert _knockout_finish(bracket, _Subject("Naqi Rizvi"))[0] == "silver"
