"""Match history tracking and persistence."""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

from ..config import settings, logger
from .court_manager import GLOBAL_HISTORY, STATE_LOCK


def add_match_to_history(kort_id: str, state: Dict[str, Any]) -> None:
    """Add completed match to history."""
    entry = _build_history_entry(kort_id, state)
    
    with STATE_LOCK:
        GLOBAL_HISTORY.append(entry)
    
    logger.info(f"Match added to history: {entry.get('player_a')} vs {entry.get('player_b')}")
    
    # Persist to database
    _persist_history_entry(entry)


def _build_history_entry(kort_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """Build history entry from court state."""
    from ..utils import format_duration
    
    a_data = state.get("A", {})
    b_data = state.get("B", {})
    match_time = state.get("match_time", {})
    history_meta = state.get("history_meta", {})
    
    return {
        "kort_id": kort_id,
        "player_a": a_data.get("surname", "-"),
        "player_b": b_data.get("surname", "-"),
        "score_a": [a_data.get(f"set{i}", 0) for i in [1, 2, 3]],
        "score_b": [b_data.get(f"set{i}", 0) for i in [1, 2, 3]],
        "duration": format_duration(match_time.get("seconds", 0)),
        "duration_seconds": match_time.get("seconds", 0),
        "phase": history_meta.get("phase", "Grupowa"),
        "category": history_meta.get("category"),
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


def get_history() -> List[Dict[str, Any]]:
    """Get match history."""
    with STATE_LOCK:
        return list(GLOBAL_HISTORY)


def load_history_from_db(entries: List[Dict[str, Any]]) -> None:
    """Load match history from database."""
    with STATE_LOCK:
        GLOBAL_HISTORY.clear()
        for entry in entries[-settings.match_history_size:]:
            GLOBAL_HISTORY.append(entry)
    
    logger.info(f"Loaded {len(GLOBAL_HISTORY)} history entries")


def delete_latest_history() -> bool:
    """Remove most recent history entry."""
    with STATE_LOCK:
        if GLOBAL_HISTORY:
            removed = GLOBAL_HISTORY.pop()
            logger.info(f"Removed history entry: {removed.get('player_a')} vs {removed.get('player_b')}")
            
            # Also remove from database
            try:
                from ..database import delete_latest_history_entry
                delete_latest_history_entry()
            except Exception as e:
                logger.error(f"Failed to delete from DB: {e}")
            
            return True
    return False

