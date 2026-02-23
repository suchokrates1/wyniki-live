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


def get_court_state(kort_id: str) -> Optional[Dict[str, Any]]:
    """Get court state without creating it."""
    with STATE_LOCK:
        return COURTS.get(kort_id)


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


def seed_demo_data() -> None:
    """Populate courts 1-4 with realistic tennis match data for preview."""
    import time

    demo_matches = {
        "1": {
            "A": {
                "surname": "NADAL",
                "full_name": "Rafael Nadal",
                "points": "30",
                "set1": 6, "set2": 4, "set3": 0,
                "current_games": 4,
                "flag_url": None,
                "flag_code": "ES",
                "flag_lookup_surname": None,
            },
            "B": {
                "surname": "DJOKOVIC",
                "full_name": "Novak Djokovic",
                "points": "15",
                "set1": 3, "set2": 5, "set3": 0,
                "current_games": 5,
                "flag_url": None,
                "flag_code": "RS",
                "flag_lookup_surname": None,
            },
            "current_set": 2,
            "serve": "A",
            "mode": None,
            "tie": {"A": 0, "B": 0, "visible": None, "locked": False},
            "match_time": {
                "seconds": 4320,
                "running": True,
                "offset_seconds": 0,
                "started_ts": None,
                "finished_ts": None,
                "resume_ts": time.time(),
                "auto_resume": True,
            },
            "match_status": {"active": True, "last_completed": None},
            "history_meta": {"phase": "Grupowa", "category": "B1"},
            "overlay_visible": None,
            "updated": None,
        },
        "2": {
            "A": {
                "surname": "ŚWIĄTEK",
                "full_name": "Iga Świątek",
                "points": "40",
                "set1": 6, "set2": 6, "set3": 2,
                "current_games": 2,
                "flag_url": None,
                "flag_code": "PL",
                "flag_lookup_surname": None,
            },
            "B": {
                "surname": "SABALENKA",
                "full_name": "Aryna Sabalenka",
                "points": "ADV",
                "set1": 4, "set2": 7, "set3": 3,
                "current_games": 3,
                "flag_url": None,
                "flag_code": "BY",
                "flag_lookup_surname": None,
            },
            "current_set": 3,
            "serve": "B",
            "mode": None,
            "tie": {"A": 0, "B": 0, "visible": None, "locked": False},
            "match_time": {
                "seconds": 6840,
                "running": True,
                "offset_seconds": 0,
                "started_ts": None,
                "finished_ts": None,
                "resume_ts": time.time(),
                "auto_resume": True,
            },
            "match_status": {"active": True, "last_completed": None},
            "history_meta": {"phase": "Półfinał", "category": "A1"},
            "overlay_visible": None,
            "updated": None,
        },
        "3": {
            "A": {
                "surname": "KOWALSKI",
                "full_name": "Jan Kowalski",
                "points": "0",
                "set1": 6, "set2": 3, "set3": 0,
                "current_games": 3,
                "flag_url": None,
                "flag_code": "PL",
                "flag_lookup_surname": None,
            },
            "B": {
                "surname": "MÜLLER",
                "full_name": "Hans Müller",
                "points": "15",
                "set1": 4, "set2": 5, "set3": 0,
                "current_games": 5,
                "flag_url": None,
                "flag_code": "DE",
                "flag_lookup_surname": None,
            },
            "current_set": 2,
            "serve": "A",
            "mode": None,
            "tie": {"A": 0, "B": 0, "visible": None, "locked": False},
            "match_time": {
                "seconds": 3120,
                "running": True,
                "offset_seconds": 0,
                "started_ts": None,
                "finished_ts": None,
                "resume_ts": time.time(),
                "auto_resume": True,
            },
            "match_status": {"active": True, "last_completed": None},
            "history_meta": {"phase": "Grupowa", "category": "B2"},
            "overlay_visible": None,
            "updated": None,
        },
        "4": {
            "A": {
                "surname": "WILLIAMS",
                "full_name": "Serena Williams",
                "points": "0",
                "set1": 2, "set2": 0, "set3": 0,
                "current_games": 2,
                "flag_url": None,
                "flag_code": "US",
                "flag_lookup_surname": None,
            },
            "B": {
                "surname": "OSAKA",
                "full_name": "Naomi Osaka",
                "points": "0",
                "set1": 3, "set2": 0, "set3": 0,
                "current_games": 3,
                "flag_url": None,
                "flag_code": "JP",
                "flag_lookup_surname": None,
            },
            "current_set": 1,
            "serve": "A",
            "mode": None,
            "tie": {"A": 0, "B": 0, "visible": None, "locked": False},
            "match_time": {
                "seconds": 1560,
                "running": True,
                "offset_seconds": 0,
                "started_ts": None,
                "finished_ts": None,
                "resume_ts": time.time(),
                "auto_resume": True,
            },
            "match_status": {"active": True, "last_completed": None},
            "history_meta": {"phase": "Grupowa", "category": "A2"},
            "overlay_visible": None,
            "updated": None,
        },
    }

    with STATE_LOCK:
        for kort_id, state in demo_matches.items():
            COURTS[kort_id] = state
    logger.info("demo_data_seeded", courts=list(demo_matches.keys()))

