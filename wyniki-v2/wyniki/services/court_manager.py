"""Court configuration and state management."""
from __future__ import annotations

import threading
from collections import OrderedDict, deque
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from ..config import settings, logger


# Thread-safe state storage
STATE_LOCK = threading.Lock()
COURTS: Dict[str, Dict[str, Any]] = {}  # kort_id -> state
GLOBAL_LOG: Deque[Dict[str, Any]] = deque()
GLOBAL_HISTORY: Deque[Dict[str, Any]] = deque(maxlen=settings.match_history_size)


def _empty_player_state() -> Dict[str, Any]:
    """Create empty player data structure."""
    return {
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


def _empty_court_state() -> Dict[str, Any]:
    """Create empty court state structure."""
    return {
        "A": _empty_player_state(),
        "B": _empty_player_state(),
        "current_set": 1,
        "serve": None,
        "mode": None,
        "tie": {
            "A": 0,
            "B": 0,
            "visible": None,
            "locked": False,
        },
        "match_time": {
            "seconds": 0,
            "running": False,
            "offset_seconds": 0,
            "started_ts": None,
            "finished_ts": None,
            "resume_ts": None,
            "auto_resume": True,
        },
        "match_status": {
            "active": False,
            "last_completed": None,
        },
        "history_meta": {
            "phase": "Grupowa",
            "category": None,
        },
        "overlay_visible": None,
        "updated": None,
    }


def _kort_sort_key(value: str) -> Tuple[int, str]:
    """Sort key for court IDs (numeric-aware)."""
    import re
    match = re.match(r'^(\d+)', str(value))
    if match:
        return (int(match.group(1)), value)
    return (999999, value)


def _sorted_court_ids(values: Iterable[str]) -> List[str]:
    """Sort court IDs naturally (1, 2, 10 not 1, 10, 2)."""
    return sorted(values, key=_kort_sort_key)


def normalize_kort_id(raw: Any) -> Optional[str]:
    """Normalize court ID to string format."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    return text


def is_known_kort(kort_id: str) -> bool:
    """Check if court exists in configuration."""
    with STATE_LOCK:
        return kort_id in COURTS


def ensure_court_state(kort_id: str) -> Dict[str, Any]:
    """Get or create court state."""
    with STATE_LOCK:
        if kort_id not in COURTS:
            COURTS[kort_id] = _empty_court_state()
        return COURTS[kort_id]


def available_courts() -> List[str]:
    """Get list of court IDs."""
    with STATE_LOCK:
        return _sorted_court_ids(COURTS.keys())


def refresh_courts_from_db(db_courts: List[str], seed_if_empty: bool = False) -> None:
    """Update court configuration from database."""
    from ..models import CourtState
    
    with STATE_LOCK:
        # Ensure all courts have state
        for kort_id in db_courts:
            if kort_id not in COURTS:
                COURTS[kort_id] = _empty_court_state()
        
        # Remove courts no longer in config
        removed = [k for k in COURTS if k not in db_courts]
        for k in removed:
            del COURTS[k]
            logger.info(f"Removed court {k} from memory")
        
        # Resize log if needed
        max_size = len(COURTS) * settings.log_entries_per_court
        if max_size > 0:
            global GLOBAL_LOG
            new_log = deque(GLOBAL_LOG, maxlen=max_size)
            GLOBAL_LOG = new_log


def serialize_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize full court state (internal)."""
    from copy import deepcopy
    return deepcopy(state)


def serialize_public_court_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize court state for public API (exclude sensitive data)."""
    from copy import deepcopy
    public = deepcopy(state)
    # Remove internal fields if needed
    return public


def serialize_all_states() -> Dict[str, Any]:
    """Get all court states."""
    with STATE_LOCK:
        return {kort_id: serialize_court_state(state) for kort_id, state in COURTS.items()}


def serialize_public_snapshot() -> Dict[str, Any]:
    """Get public snapshot of all courts."""
    with STATE_LOCK:
        return {kort_id: serialize_public_court_state(state) for kort_id, state in COURTS.items()}

