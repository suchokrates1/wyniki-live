"""Match history tracking and persistence."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..config import logger


def _score_arrays_from_sets_history(sets_history: Optional[List[Dict[str, Any]]]) -> tuple[List[int], List[int]]:
    """Build persisted score arrays from authoritative sets_history data.

    Super tie-break points stay in the arrays so public history can show [10:3]
    as a third tennis-style column instead of dropping the match STB.
    """
    if not sets_history:
        return [], []

    score_a: List[int] = []
    score_b: List[int] = []
    for set_info in sets_history:
        if not isinstance(set_info, dict):
            continue
        games_a = int(set_info.get("player1_games", 0) or 0)
        games_b = int(set_info.get("player2_games", 0) or 0)
        is_stb = bool(set_info.get("is_super_tiebreak"))
        tb_raw = set_info.get("tiebreak_loser_points")
        if games_a == 0 and games_b == 0 and tb_raw is None and not is_stb:
            continue
        if is_stb and tb_raw is not None and max(games_a, games_b) <= 1:
            loser_points = int(tb_raw)
            winner_points = max(10, loser_points + 2)
            if games_a > games_b:
                games_a, games_b = winner_points, loser_points
            else:
                games_a, games_b = loser_points, winner_points
        score_a.append(games_a)
        score_b.append(games_b)
    return score_a, score_b


def add_match_to_history(kort_id: str, state: Dict[str, Any]) -> None:
    """Add completed match to history."""
    entry = _build_history_entry(kort_id, state)
    
    from ..database import get_tournament_id_for_court, get_active_tournament_id
    entry["tournament_id"] = get_tournament_id_for_court(kort_id) or get_active_tournament_id()
    logger.info(f"Match added to history: {entry.get('player_a')} vs {entry.get('player_b')}")
    
    # Persist to database
    _persist_history_entry(entry)


def _build_history_entry(kort_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """Build history entry from court state.

    Player names and sets come from the finished Match row when match_id is set.
    Court overlay may already show the next pair by the time finish lands.
    """
    from ..utils import format_duration

    a_data = state.get("A", {})
    b_data = state.get("B", {})
    match_time = state.get("match_time", {})
    history_meta = state.get("history_meta", {})

    sets_history_data = None
    player_a = a_data.get("full_name") or a_data.get("surname") or "-"
    player_b = b_data.get("full_name") or b_data.get("surname") or "-"
    phase = history_meta.get("phase", "Grupowa")
    winner_name = history_meta.get("winner_name")
    injured_player_name = history_meta.get("injured_player_name")
    result_note = history_meta.get("result_note")
    finish_reason = history_meta.get("finish_reason", "normal")

    match_id = history_meta.get("match_id")
    if match_id:
        try:
            from ..db_models import Match, db

            match_record = db.session.get(Match, match_id)
            if match_record:
                if match_record.player1_name:
                    player_a = match_record.player1_name
                if match_record.player2_name:
                    player_b = match_record.player2_name
                if match_record.phase:
                    phase = match_record.phase
                if match_record.winner_name:
                    winner_name = match_record.winner_name
                if match_record.injured_player_name is not None:
                    injured_player_name = match_record.injured_player_name
                if match_record.result_note is not None:
                    result_note = match_record.result_note
                if match_record.finish_reason:
                    finish_reason = match_record.finish_reason
                if match_record.sets_history:
                    sets_history_data = json.loads(match_record.sets_history)
        except Exception:
            pass

    score_a = [a_data.get(f"set{i}", 0) for i in [1, 2, 3]]
    score_b = [b_data.get(f"set{i}", 0) for i in [1, 2, 3]]
    derived_score_a, derived_score_b = _score_arrays_from_sets_history(sets_history_data)
    if derived_score_a and derived_score_b:
        score_a = derived_score_a
        score_b = derived_score_b

    return {
        "kort_id": kort_id,
        "player_a": player_a,
        "player_b": player_b,
        "score_a": score_a,
        "score_b": score_b,
        "sets_history": sets_history_data,
        "duration": format_duration(match_time.get("seconds", 0)),
        "duration_seconds": match_time.get("seconds", 0),
        "phase": phase,
        "category": history_meta.get("category"),
        "match_id": history_meta.get("match_id"),
        "stats_mode": history_meta.get("stats_mode"),
        "finish_reason": finish_reason,
        "winner_name": winner_name,
        "injured_player_name": injured_player_name,
        "result_note": result_note,
        "ended_ts": datetime.now(timezone.utc).isoformat(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "completed_at": match_time.get("finished_ts"),
    }


def _persist_history_entry(entry: Dict[str, Any]) -> None:
    """Persist history entry to database."""
    try:
        from ..database import insert_match_history
        insert_match_history(entry)
    except Exception as e:
        logger.error(f"Failed to persist history entry: {e}")


def delete_latest_history() -> bool:
    """Remove the most recent history entry."""
    from ..database import delete_latest_history_entry
    return delete_latest_history_entry() is not None
