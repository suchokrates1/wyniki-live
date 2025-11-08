"""Match logic and state transitions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from ..config import logger
from .court_manager import STATE_LOCK

POINT_SEQUENCE = ["0", "15", "30", "40", "ADV"]


def ensure_match_struct(state: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Ensure match_time and match_status exist."""
    if "match_time" not in state:
        state["match_time"] = {
            "seconds": 0,
            "running": False,
            "offset_seconds": 0,
            "started_ts": None,
            "finished_ts": None,
            "resume_ts": None,
            "auto_resume": True,
        }
    if "match_status" not in state:
        state["match_status"] = {
            "active": False,
            "last_completed": None,
        }
    return state["match_time"], state["match_status"]


def maybe_start_match(state: Dict[str, Any]) -> None:
    """Start match timer if conditions are met."""
    match_time, match_status = ensure_match_struct(state)
    
    if match_status.get("active"):
        return  # Already active
    
    # Check if both players have names
    a_name = state.get("A", {}).get("surname", "-")
    b_name = state.get("B", {}).get("surname", "-")
    
    if a_name != "-" and b_name != "-":
        match_status["active"] = True
        if not match_time.get("started_ts"):
            match_time["started_ts"] = datetime.now(timezone.utc).isoformat()
        if match_time.get("auto_resume", True):
            match_time["running"] = True
            match_time["resume_ts"] = datetime.now(timezone.utc).isoformat()
        logger.info(f"Match started: {a_name} vs {b_name}")


def update_match_timer(state: Dict[str, Any]) -> None:
    """Update match timer seconds if running."""
    match_time, _ = ensure_match_struct(state)
    
    if not match_time.get("running"):
        return
    
    resume_ts = match_time.get("resume_ts")
    if not resume_ts:
        return
    
    try:
        from ..utils import parse_iso_datetime
        resumed = parse_iso_datetime(resume_ts)
        now = datetime.now(timezone.utc)
        elapsed = (now - resumed).total_seconds()
        match_time["seconds"] = match_time.get("offset_seconds", 0) + int(elapsed)
    except Exception as e:
        logger.warning(f"Failed to update match timer: {e}")


def stop_match_timer(state: Dict[str, Any]) -> None:
    """Stop match timer permanently."""
    match_time, _ = ensure_match_struct(state)
    match_time["running"] = False
    match_time["finished_ts"] = datetime.now(timezone.utc).isoformat()
    logger.debug("Match timer stopped")


def pause_match_timer(state: Dict[str, Any], *, manual: bool = False) -> None:
    """Pause match timer."""
    match_time, _ = ensure_match_struct(state)
    
    if match_time.get("running"):
        update_match_timer(state)
        match_time["offset_seconds"] = match_time.get("seconds", 0)
        match_time["running"] = False
        match_time["resume_ts"] = None
        logger.debug(f"Match timer paused (manual={manual})")


def reset_tie_and_points(state: Dict[str, Any]) -> None:
    """Reset tie-break and regular points."""
    state.setdefault("tie", {}).update({"A": 0, "B": 0, "visible": None})
    state.get("A", {})["points"] = "0"
    state.get("B", {})["points"] = "0"


def reset_regular_points(state: Dict[str, Any]) -> None:
    """Reset only regular points (not tie-break)."""
    state.get("A", {})["points"] = "0"
    state.get("B", {})["points"] = "0"


def lock_tie_updates(state: Dict[str, Any]) -> None:
    """Lock tie-break from external updates."""
    tie = state.setdefault("tie", {})
    tie["locked"] = True


def tie_update_allowed(state: Dict[str, Any], new_value: int) -> bool:
    """Check if tie-break update is allowed."""
    tie = state.get("tie", {})
    if tie.get("locked"):
        return False
    if tie.get("visible") is False:
        return False
    return True


def count_short_set_wins(state: Dict[str, Any]) -> Dict[str, int]:
    """Count set wins for best-of-3 match."""
    wins = {"A": 0, "B": 0}
    
    for set_num in [1, 2, 3]:
        a_games = state.get("A", {}).get(f"set{set_num}", 0)
        b_games = state.get("B", {}).get(f"set{set_num}", 0)
        
        winner = short_set_winner(a_games, b_games)
        if winner:
            wins[winner] += 1
    
    return wins


def short_set_winner(games_a: int, games_b: int) -> Optional[str]:
    """Determine set winner (first to 4, must win by 2)."""
    if games_a >= 4 and games_a >= games_b + 2:
        return "A"
    if games_b >= 4 and games_b >= games_a + 2:
        return "B"
    return None


def maybe_update_current_set_indicator(state: Dict[str, Any]) -> Dict[str, int]:
    """Update current_set field based on completed sets."""
    wins = count_short_set_wins(state)
    completed = wins["A"] + wins["B"]
    
    if completed == 0:
        state["current_set"] = 1
    elif completed == 1:
        state["current_set"] = 2
    elif completed >= 2:
        state["current_set"] = 3
    
    return wins


def finalize_match_if_needed(kort_id: str, state: Dict[str, Any], wins: Optional[Dict[str, int]] = None) -> None:
    """Check if match is over and finalize."""
    if wins is None:
        wins = count_short_set_wins(state)
    
    # Match ends when someone wins 2 sets
    if wins["A"] >= 2 or wins["B"] >= 2:
        stop_match_timer(state)
        match_status = state.setdefault("match_status", {})
        match_status["active"] = False
        match_status["last_completed"] = datetime.now(timezone.utc).isoformat()
        
        winner = "A" if wins["A"] >= 2 else "B"
        logger.info(f"Match completed on court {kort_id}: {winner} wins {wins[winner]}-{wins['A' if winner == 'B' else 'B']}")
        
        # Create history entry
        from .history_manager import add_match_to_history
        add_match_to_history(kort_id, state)


def reset_after_match(state: Dict[str, Any]) -> None:
    """Reset court state after match completion."""
    state["A"] = {
        "surname": "-",
        "full_name": None,
        "points": "0",
        "set1": 0,
        "set2": 0,
        "set3": 0,
        "current_games": 0,
        "flag_url": None,
        "flag_code": None,
        "flag_lookup_surname": None,
    }
    state["B"] = {
        "surname": "-",
        "full_name": None,
        "points": "0",
        "set1": 0,
        "set2": 0,
        "set3": 0,
        "current_games": 0,
        "flag_url": None,
        "flag_code": None,
        "flag_lookup_surname": None,
    }
    state["current_set"] = 1
    state["serve"] = None
    state["tie"] = {"A": 0, "B": 0, "visible": None, "locked": False}
    state["match_time"] = {
        "seconds": 0,
        "running": False,
        "offset_seconds": 0,
        "started_ts": None,
        "finished_ts": None,
        "resume_ts": None,
        "auto_resume": True,
    }
    state["match_status"] = {
        "active": False,
        "last_completed": None,
    }
    logger.info("Court reset after match")


def handle_match_flow(kort_id: Optional[str], state: Dict[str, Any]) -> None:
    """Handle automatic match flow logic."""
    with STATE_LOCK:
        maybe_start_match(state)
        wins = maybe_update_current_set_indicator(state)
        finalize_match_if_needed(kort_id or "unknown", state, wins)

