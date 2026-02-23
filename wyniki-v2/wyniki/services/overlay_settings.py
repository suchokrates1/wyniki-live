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
              zone: str = "free", show_logo: bool = False,
              label_text: str = "",
              label_position: str = "above",
              font_size: int = 17, bg_opacity: float = 0.95,
              logo_size: int = 60,
              h: int | None = None) -> Dict[str, Any]:
    """Build a court-scoreboard element dict."""
    el: Dict[str, Any] = {
        "type": "court",
        "court_id": str(court_id),
        "visible": True,
        "x": x, "y": y, "w": w,
        "show_logo": show_logo,
        "font_size": font_size,
        "bg_opacity": bg_opacity,
        "logo_size": logo_size,
        "zone": zone,
        "label_text": label_text or f"KORT {court_id}",
        "label_position": label_position,
        "label_gap": 4,
        "label_bg_opacity": 0.85,
        "label_font_size": 14 if zone == "free" else 12,
    }
    if h is not None:
        el["h"] = h
    return el


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
    """Court-specific overlay: main court big bottom-left, 3 others top bar.

    - Main court: bottom-left, big (w=600), no logo, label ABOVE scoreboard.
    - Top 3 courts: zone='top', no logo, label BELOW scoreboard.
    All symmetrical, no logos.
    """
    others = [c for c in ("1", "2", "3", "4") if c != focus]
    elements = []
    # Main court — big, bottom-left, label above
    elements.append(
        _court_el(focus, 30, 890, 600, zone="free", show_logo=False,
                  label_position="above")
    )
    # Top 3 courts in grid, label below
    for i, cid in enumerate(others):
        elements.append(
            _court_el(cid, 20 + i * 634, 10, 620,
                      zone="top", show_logo=False,
                      label_position="below", font_size=14)
        )
    return {
        "name": name,
        "auto_hide": False,
        "top_bar": {
            "enabled": True,
            "columns": 3,
            "margin_x": 20,
            "margin_top": 10,
            "gap": 12,
        },
        "elements": elements,
    }


def _overlay_all() -> Dict[str, Any]:
    """4 courts in a 2x2 grid — no logos, labels above."""
    positions = [(20, 20), (980, 20), (20, 560), (980, 560)]
    elements = [
        _court_el(str(i + 1), x, y, 440, zone="free",
                  show_logo=False, label_position="above")
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
