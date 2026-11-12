"""Match finish reason validation and score adjustments (normal, retirement, walkover, test)."""
from __future__ import annotations

import json

from ..config import logger
from ..db_models import Match
from .match_format import match_score_satisfies_format
from .match_result import resolve_match_winner, same_competitor
from .umpire_client_meta import _clean_client_text

FINISH_REASON_NORMAL = "normal"
FINISH_REASON_TEST = "test"
FINISH_REASON_RETIREMENT = "retirement"
FINISH_REASON_WALKOVER = "walkover"
FINISH_REASONS = {
    FINISH_REASON_NORMAL,
    FINISH_REASON_TEST,
    FINISH_REASON_RETIREMENT,
    FINISH_REASON_WALKOVER,
}


def _match_players(match: Match) -> set[str]:
    return {match.player1_name, match.player2_name}


def _winner_from_score(match: Match) -> str | None:
    if int(match.player1_sets or 0) > int(match.player2_sets or 0):
        return match.player1_name
    if int(match.player2_sets or 0) > int(match.player1_sets or 0):
        return match.player2_name
    return None


def _apply_walkover_score(match: Match, _winner_name: str) -> None:
    """A walkover is a win with no score (ATP Rulebook 2026, chapter IV)."""
    match.player1_sets = 0
    match.player2_sets = 0
    match.player1_games = 0
    match.player2_games = 0
    match.player1_points = 0
    match.player2_points = 0
    match.sets_history = "[]"


def _append_retirement_current_score(match: Match) -> None:
    if not int(match.player1_games or 0) and not int(match.player2_games or 0):
        return
    try:
        sets_history = json.loads(match.sets_history) if match.sets_history else []
    except Exception:
        sets_history = []
    if any(
        isinstance(item, dict)
        and item.get("unfinished")
        and item.get("finish_reason") == FINISH_REASON_RETIREMENT
        for item in sets_history
    ):
        return
    current_set_number = len(sets_history) + 1
    if any(int(item.get("set_number", 0) or 0) == current_set_number for item in sets_history if isinstance(item, dict)):
        return
    sets_history.append({
        "set_number": current_set_number,
        "player1_games": int(match.player1_games or 0),
        "player2_games": int(match.player2_games or 0),
        "unfinished": True,
        "finish_reason": FINISH_REASON_RETIREMENT,
    })
    match.sets_history = json.dumps(sets_history)


def _apply_finish_outcome(match: Match, data: dict) -> None:
    reason = str(data.get("finish_reason") or FINISH_REASON_NORMAL).strip().lower()
    if reason not in FINISH_REASONS:
        raise ValueError("Unsupported finish_reason")

    winner_name = _clean_client_text(data.get("winner_name"), 200)
    injured_player_name = _clean_client_text(data.get("injured_player_name"), 200)
    result_note = _clean_client_text(data.get("result_note"), 255)

    if reason == FINISH_REASON_RETIREMENT:
        if injured_player_name not in _match_players(match):
            raise ValueError("injured_player_name must be one of match players")
        winner_name = match.player2_name if injured_player_name == match.player1_name else match.player1_name
        result_note = result_note or f"Krecz: {injured_player_name}"
        _append_retirement_current_score(match)
    elif reason == FINISH_REASON_WALKOVER:
        if winner_name not in _match_players(match):
            raise ValueError("winner_name must be one of match players for walkover")
        injured_player_name = None
        result_note = result_note or "Walkower"
        _apply_walkover_score(match, winner_name)
    elif reason == FINISH_REASON_TEST:
        winner_name = winner_name or _winner_from_score(match)
        injured_player_name = None
        result_note = result_note or "Mecz testowy"
    else:
        scored_winner = resolve_match_winner(
            player1=match.player1_name,
            player2=match.player2_name,
            stored_winner=winner_name,
            finish_reason=reason,
            sets_history=match.sets_history,
            player1_sets=match.player1_sets,
            player2_sets=match.player2_sets,
            score_is_final=match_score_satisfies_format(match),
        )
        if winner_name and scored_winner and not same_competitor(winner_name, scored_winner):
            logger.warning(
                "finish_winner_contradicts_score",
                match_id=match.id,
                sent=winner_name,
                from_score=scored_winner,
            )
        winner_name = scored_winner
        injured_player_name = None

    match.finish_reason = reason
    match.winner_name = winner_name
    match.injured_player_name = injured_player_name
    match.result_note = result_note
