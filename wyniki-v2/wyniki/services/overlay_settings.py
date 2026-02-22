"""Overlay settings management for OBS stream overlays."""
from __future__ import annotations

import threading
from typing import Dict, Any

from ..config import logger

# Thread-safe lock for overlay settings
_OVERLAY_LOCK = threading.Lock()

# Default settings
_DEFAULT_SETTINGS: Dict[str, Any] = {
    "courts_visible": {
        "1": True,
        "2": True,
        "3": True,
        "4": True,
    },
    "auto_hide": False,
    "show_stats": False,
    "court_positions": {
        "1": {"x": 24, "y": 896, "w": 420, "size": "large"},
        "2": {"x": 20, "y": 20, "w": 260, "size": "small"},
        "3": {"x": 292, "y": 20, "w": 260, "size": "small"},
        "4": {"x": 564, "y": 20, "w": 260, "size": "small"},
    },
    "stats_position": {"x": 460, "y": 836, "w": 360},
}

# Current settings (in-memory)
_overlay_settings: Dict[str, Any] = {}


def _ensure_defaults() -> None:
    """Ensure settings dict has all default keys."""
    global _overlay_settings
    if not _overlay_settings:
        import copy
        _overlay_settings = copy.deepcopy(_DEFAULT_SETTINGS)


def get_overlay_settings() -> Dict[str, Any]:
    """Get current overlay settings (thread-safe)."""
    with _OVERLAY_LOCK:
        _ensure_defaults()
        import copy
        return copy.deepcopy(_overlay_settings)


def update_overlay_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Update overlay settings (thread-safe). Returns updated settings."""
    global _overlay_settings
    with _OVERLAY_LOCK:
        _ensure_defaults()

        if "courts_visible" in new_settings:
            cv = new_settings["courts_visible"]
            if isinstance(cv, dict):
                for k, v in cv.items():
                    _overlay_settings["courts_visible"][str(k)] = bool(v)

        if "auto_hide" in new_settings:
            _overlay_settings["auto_hide"] = bool(new_settings["auto_hide"])

        if "show_stats" in new_settings:
            _overlay_settings["show_stats"] = bool(new_settings["show_stats"])

        if "court_positions" in new_settings:
            cp = new_settings["court_positions"]
            if isinstance(cp, dict):
                if "court_positions" not in _overlay_settings:
                    _overlay_settings["court_positions"] = {}
                for k, v in cp.items():
                    if isinstance(v, dict):
                        if str(k) in _overlay_settings["court_positions"]:
                            _overlay_settings["court_positions"][str(k)].update(v)
                        else:
                            _overlay_settings["court_positions"][str(k)] = v

        if "stats_position" in new_settings:
            sp = new_settings["stats_position"]
            if isinstance(sp, dict):
                if "stats_position" not in _overlay_settings:
                    _overlay_settings["stats_position"] = {}
                _overlay_settings["stats_position"].update(sp)

        logger.info("overlay_settings_updated", settings=_overlay_settings)

        import copy
        return copy.deepcopy(_overlay_settings)
