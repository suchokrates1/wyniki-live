"""Court configuration and state management."""
from __future__ import annotations

import threading
from collections import OrderedDict, deque
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple

from ..config import settings, logger


# Thread-safe state storage
STATE_LOCK = threading.Lock()
COURTS: Dict[str, Dict[str, Any]] = {}  # kort_id -> state
DEMO_COURTS: Dict[str, Dict[str, Any]] = {}  # separate demo storage (never pollutes real data)
DEMO_OVERLAY_ACTIVE: bool = False  # when True, public APIs serve DEMO_COURTS
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
    """Get public snapshot of all courts.

    When DEMO_OVERLAY_ACTIVE is True, returns DEMO_COURTS data.
    Otherwise returns real COURTS data.
    """
    with STATE_LOCK:
        source = DEMO_COURTS if (DEMO_OVERLAY_ACTIVE and DEMO_COURTS) else COURTS
        return {kort_id: serialize_public_court_state(state) for kort_id, state in source.items()}


# ============ DEMO DATA MANAGEMENT ============

def set_demo_overlay(active: bool) -> None:
    """Toggle demo overlay mode."""
    global DEMO_OVERLAY_ACTIVE
    with STATE_LOCK:
        DEMO_OVERLAY_ACTIVE = active
    logger.info("demo_overlay_toggled", active=active)


def is_demo_overlay_active() -> bool:
    """Check if demo data is being served to overlays."""
    with STATE_LOCK:
        return DEMO_OVERLAY_ACTIVE


def has_demo_data() -> bool:
    """Check if demo data is loaded."""
    with STATE_LOCK:
        return bool(DEMO_COURTS)


def get_demo_courts_snapshot() -> Dict[str, Any]:
    """Get snapshot of demo courts for admin preview."""
    with STATE_LOCK:
        return {kort_id: serialize_public_court_state(state)
                for kort_id, state in DEMO_COURTS.items()}


def clear_demo_data() -> None:
    """Clear all demo data and deactivate demo overlay."""
    global DEMO_OVERLAY_ACTIVE
    with STATE_LOCK:
        DEMO_COURTS.clear()
        DEMO_OVERLAY_ACTIVE = False
    logger.info("demo_data_cleared")


def _generate_ibta_score(scenario: str) -> Dict[str, Any]:
    """Generate IBTA-legal score for a given match scenario.

    IBTA blind tennis rules:
    - Short sets: first to 4 games, win by 2
    - Best of 3 sets (match ends at 2 set wins)
    - Tiebreak at 4-4 in games
    """
    import random

    points_options = ["0", "15", "30", "40"]

    def _random_completed_set(winner: str) -> Tuple[int, int]:
        """Generate a completed set score where `winner` won (A or B)."""
        patterns = [
            (4, 0), (4, 1), (4, 2),  # straight wins
            (5, 3),                    # win by 2 after 3-3
        ]
        w_games, l_games = random.choice(patterns)
        if winner == "A":
            return (w_games, l_games)
        return (l_games, w_games)

    def _random_in_progress_set() -> Tuple[int, int]:
        """Generate an in-progress set score (no winner yet)."""
        options = [
            (0, 0), (1, 0), (0, 1), (1, 1), (2, 0), (0, 2),
            (2, 1), (1, 2), (2, 2), (3, 0), (0, 3), (3, 1),
            (1, 3), (3, 2), (2, 3), (3, 3),
        ]
        return random.choice(options)

    if scenario == "set1_in_progress":
        # First set in progress
        g_a, g_b = _random_in_progress_set()
        return {
            "set1_a": g_a, "set1_b": g_b,
            "set2_a": 0, "set2_b": 0,
            "set3_a": 0, "set3_b": 0,
            "current_set": 1,
            "current_games_a": g_a, "current_games_b": g_b,
            "points_a": random.choice(points_options),
            "points_b": random.choice(points_options),
            "time_seconds": random.randint(600, 2400),
        }
    elif scenario == "set2_in_progress":
        # First set completed, second in progress
        winner = random.choice(["A", "B"])
        s1a, s1b = _random_completed_set(winner)
        g_a, g_b = _random_in_progress_set()
        return {
            "set1_a": s1a, "set1_b": s1b,
            "set2_a": g_a, "set2_b": g_b,
            "set3_a": 0, "set3_b": 0,
            "current_set": 2,
            "current_games_a": g_a, "current_games_b": g_b,
            "points_a": random.choice(points_options),
            "points_b": random.choice(points_options),
            "time_seconds": random.randint(2400, 4800),
        }
    elif scenario == "set2_deuce":
        # Second set, deuce situation (40-40)
        winner = random.choice(["A", "B"])
        s1a, s1b = _random_completed_set(winner)
        g_a, g_b = _random_in_progress_set()
        pts = random.choice([("40", "40"), ("ADV", "40"), ("40", "ADV")])
        return {
            "set1_a": s1a, "set1_b": s1b,
            "set2_a": g_a, "set2_b": g_b,
            "set3_a": 0, "set3_b": 0,
            "current_set": 2,
            "current_games_a": g_a, "current_games_b": g_b,
            "points_a": pts[0], "points_b": pts[1],
            "time_seconds": random.randint(3000, 5400),
        }
    else:
        # Default: early first set
        g_a, g_b = random.choice([(0, 0), (1, 0), (0, 1), (1, 1)])
        return {
            "set1_a": g_a, "set1_b": g_b,
            "set2_a": 0, "set2_b": 0,
            "set3_a": 0, "set3_b": 0,
            "current_set": 1,
            "current_games_a": g_a, "current_games_b": g_b,
            "points_a": random.choice(points_options),
            "points_b": random.choice(points_options),
            "time_seconds": random.randint(300, 1200),
        }


def _generate_demo_stats() -> Dict[str, Any]:
    """Generate realistic match statistics for one player."""
    import random
    first_serves = random.randint(15, 40)
    first_serves_in = random.randint(int(first_serves * 0.4), int(first_serves * 0.75))
    pct = round(first_serves_in / first_serves * 100) if first_serves > 0 else 0
    return {
        "aces": random.randint(0, 3),
        "double_faults": random.randint(0, 5),
        "winners": random.randint(2, 10),
        "unforced_errors": random.randint(3, 12),
        "first_serve_pct": pct,
    }


def seed_demo_data() -> Tuple[bool, str, Dict[str, Dict[str, Any]]]:
    """Generate IBTA blind tennis demo data and store in DEMO_COURTS.

    Uses real players from the active tournament database.
    Generates IBTA-legal scores (short sets to 4, max 2 sets).
    Fills match statistics for overlay display.
    Does NOT touch real COURTS — demo data is stored separately.

    Returns:
        (success, message, demo_courts_dict) tuple.
    """
    import random
    import time
    from ..database import fetch_active_tournament_players

    # Fetch real players from active tournament
    db_players = fetch_active_tournament_players()

    # Need at least 2 players for 1 court
    if len(db_players) < 2:
        msg = f"Za mało zawodników w aktywnym turnieju ({len(db_players)}/2). Dodaj zawodników lub ustaw aktywny turniej."
        logger.warning("demo_data_not_enough_players",
                        available=len(db_players), required=2)
        return (False, msg, {})

    # Shuffle and pick players for available courts (2 per court)
    random.shuffle(db_players)
    max_pairs = len(db_players) // 2
    num_courts = min(max_pairs, 4)
    selected = db_players[:num_courts * 2]

    # Match scenarios for variety
    scenarios = ["set1_in_progress", "set2_in_progress", "set2_deuce", "set1_in_progress"]
    phases = ["Grupowa", "Półfinał", "Grupowa", "Grupowa"]

    court_ids = _sorted_court_ids(COURTS.keys()) if COURTS else ["1", "2", "3", "4"]
    court_ids = court_ids[:num_courts]  # fill as many courts as we have players for

    demo_matches: Dict[str, Dict[str, Any]] = {}

    for i, kort_id in enumerate(court_ids):
        p_a = selected[i * 2]
        p_b = selected[i * 2 + 1]

        # Player names
        name_a = p_a.get("name", "Player A")
        name_b = p_b.get("name", "Player B")

        # Flag image URLs from CDN (2-letter ISO code)
        cc_a = (p_a.get("country") or "")[:2].lower()
        cc_b = (p_b.get("country") or "")[:2].lower()
        flag_url_a = f"https://flagcdn.com/w40/{cc_a}.png" if len(cc_a) == 2 else None
        flag_url_b = f"https://flagcdn.com/w40/{cc_b}.png" if len(cc_b) == 2 else None

        # Generate IBTA-legal score
        score = _generate_ibta_score(scenarios[i % len(scenarios)])

        demo_matches[kort_id] = {
            "A": {
                "surname": name_a,
                "full_name": name_a,
                "points": score["points_a"],
                "set1": score["set1_a"],
                "set2": score["set2_a"],
                "set3": score["set3_a"],
                "current_games": score["current_games_a"],
                "flag_url": flag_url_a,
                "flag_code": cc_a.upper() or None,
                "flag_lookup_surname": None,
            },
            "B": {
                "surname": name_b,
                "full_name": name_b,
                "points": score["points_b"],
                "set1": score["set1_b"],
                "set2": score["set2_b"],
                "set3": score["set3_b"],
                "current_games": score["current_games_b"],
                "flag_url": flag_url_b,
                "flag_code": cc_b.upper() or None,
                "flag_lookup_surname": None,
            },
            "current_set": score["current_set"],
            "serve": random.choice(["A", "B"]),
            "mode": None,
            "tie": {"A": 0, "B": 0, "visible": None, "locked": False},
            "match_time": {
                "seconds": score["time_seconds"],
                "running": True,
                "offset_seconds": 0,
                "started_ts": None,
                "finished_ts": None,
                "resume_ts": time.time(),
                "auto_resume": True,
            },
            "match_status": {"active": True, "last_completed": None},
            "history_meta": {
                "phase": phases[i % len(phases)],
                "category": p_a.get("category") or p_b.get("category") or None,
            },
            "overlay_visible": None,
            "updated": None,
            "stats": {
                "player_a": _generate_demo_stats(),
                "player_b": _generate_demo_stats(),
            },
        }

    with STATE_LOCK:
        DEMO_COURTS.clear()
        for kort_id, state in demo_matches.items():
            DEMO_COURTS[kort_id] = state
    logger.info("demo_data_seeded", courts=list(demo_matches.keys()),
                source="database")

    # Return serialized demo data so admin can preview immediately
    from copy import deepcopy
    serialized = {k: deepcopy(v) for k, v in demo_matches.items()}
    return (True, f"Demo: korty {', '.join(demo_matches.keys())}", serialized)

