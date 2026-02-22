"""Overlay settings management for OBS stream overlays.

Supports multiple overlay presets (e.g. "kort1 focus", "split 1+2"),
each with independently positioned court scoreboards and stats panels.
Also stores tournament branding (logo + name) and court label settings.
"""
from __future__ import annotations

import copy
import threading
from typing import Any, Dict

from ..config import logger

# ---------- thread-safety ----------
_OVERLAY_LOCK = threading.Lock()


# ---------- element builders ----------

def _court_el(court_id: str, x: int, y: int, w: int,
              size: str = "small", show_logo: bool = False,
              label_text: str = "") -> Dict[str, Any]:
    """Build a court-scoreboard element dict."""
    return {
        "type": "court",
        "court_id": str(court_id),
        "visible": True,
        "x": x, "y": y, "w": w,
        "size": size,
        "show_logo": show_logo,
        "label_text": label_text or f"KORT {court_id}",
        "label_position": "above",
        "label_gap": 4 if size == "large" else 2,
        "label_bg_opacity": 0.85 if size == "large" else 0.6,
        "label_font_size": 14 if size == "large" else 10,
    }


def _stats_el(court_id: str, x: int, y: int, w: int = 360) -> Dict[str, Any]:
    """Build a stats-panel element dict."""
    return {
        "type": "stats",
        "court_id": str(court_id),
        "visible": False,
        "x": x, "y": y, "w": w,
    }


# ---------- default overlays ----------

def _overlay_focus(focus: str, name: str) -> Dict[str, Any]:
    others = [c for c in ("1", "2", "3", "4") if c != focus]
    elements = [_court_el(focus, 24, 860, 460, "large", True)]
    for i, cid in enumerate(others):
        elements.append(_court_el(cid, 20 + i * 280, 20, 260, "small"))
    elements.append(_stats_el(focus, 500, 830))
    return {"name": name, "auto_hide": False, "elements": elements}


def _overlay_all() -> Dict[str, Any]:
    positions = [(20, 20), (980, 20), (20, 560), (980, 560)]
    elements = [
        _court_el(str(i + 1), x, y, 440, "large", True)
        for i, (x, y) in enumerate(positions)
    ]
    return {"name": "Wszystkie korty", "auto_hide": False, "elements": elements}


# ---------- canonical defaults ----------

_DEFAULT_SETTINGS: Dict[str, Any] = {
    "tournament_logo": None,
    "tournament_name": "",
    "overlays": {
        "1": _overlay_focus("1", "Kort 1 \u2013 g\u0142\u00f3wny"),
        "2": _overlay_focus("2", "Kort 2 \u2013 g\u0142\u00f3wny"),
        "3": _overlay_focus("3", "Kort 3 \u2013 g\u0142\u00f3wny"),
        "4": _overlay_focus("4", "Kort 4 \u2013 g\u0142\u00f3wny"),
        "all": _overlay_all(),
    },
}

# ---------- live state ----------
_overlay_settings: Dict[str, Any] = {}


def _ensure_defaults() -> None:
    global _overlay_settings
    if not _overlay_settings:
        _overlay_settings = copy.deepcopy(_DEFAULT_SETTINGS)


# ---------- public API ----------

def get_overlay_settings() -> Dict[str, Any]:
    """Return a deep-copy of current overlay settings."""
    with _OVERLAY_LOCK:
        _ensure_defaults()
        return copy.deepcopy(_overlay_settings)


def update_overlay_settings(new: Dict[str, Any]) -> Dict[str, Any]:
    """Merge *new* into current settings and return updated copy."""
    global _overlay_settings
    with _OVERLAY_LOCK:
        _ensure_defaults()
        for key in ("tournament_logo", "tournament_name"):
            if key in new:
                _overlay_settings[key] = new[key]
        if "overlays" in new and isinstance(new["overlays"], dict):
            for oid, odata in new["overlays"].items():
                if isinstance(odata, dict):
                    _overlay_settings.setdefault("overlays", {})[oid] = odata
        logger.info("overlay_settings_updated")
        return copy.deepcopy(_overlay_settings)


def delete_overlay(overlay_id: str) -> bool:
    """Remove a single overlay preset. Returns True if found & deleted."""
    global _overlay_settings
    with _OVERLAY_LOCK:
        _ensure_defaults()
        overlays = _overlay_settings.get("overlays", {})
        if overlay_id in overlays:
            del overlays[overlay_id]
            logger.info("overlay_deleted", overlay_id=overlay_id)
            return True
        return False
