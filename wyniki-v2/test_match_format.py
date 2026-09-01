from types import SimpleNamespace

from wyniki.services.director_commands import dump_match_config
from wyniki.services.match_format import match_score_satisfies_format


def test_default_best_of_three_needs_two_sets():
    match = SimpleNamespace(player1_sets=1, player2_sets=0, match_config=None)
    assert match_score_satisfies_format(match) is False
    match.player1_sets = 2
    assert match_score_satisfies_format(match) is True


def test_stored_sets_to_win_three():
    match = SimpleNamespace(
        player1_sets=2,
        player2_sets=0,
        match_config=dump_match_config({"sets_to_win": 3}),
    )
    assert match_score_satisfies_format(match) is False
    match.player1_sets = 3
    assert match_score_satisfies_format(match) is True


def test_put_payload_config_overrides_stored():
    match = SimpleNamespace(
        player1_sets=1,
        player2_sets=0,
        match_config=dump_match_config({"sets_to_win": 2}),
    )
    assert match_score_satisfies_format(match, {"sets_to_win": 1}) is True


def test_tied_sets_do_not_finish():
    match = SimpleNamespace(player1_sets=2, player2_sets=2, match_config=dump_match_config({"sets_to_win": 2}))
    assert match_score_satisfies_format(match) is False
