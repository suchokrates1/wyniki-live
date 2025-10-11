"""Helpers for managing court overlay configuration."""
from __future__ import annotations

import threading
from typing import Dict, List, Optional, Tuple

from .config import log, normalize_overlay_id, settings
from .database import delete_court as db_delete_court
from .database import fetch_courts as db_fetch_courts
from .database import upsert_court as db_upsert_court

_LOCK = threading.RLock()
_COURTS: Dict[str, Optional[str]] = {}


def _sort_key(kort_id: str) -> Tuple[int, str]:
    try:
        return (0, f"{int(str(kort_id)) :04d}")
    except (TypeError, ValueError):
        return (1, str(kort_id))


def _normalize_kort_id(value: str) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        try:
            return str(int(text))
        except ValueError:
            return text
    return text


def reload_courts() -> Dict[str, Optional[str]]:
    mapping: Dict[str, Optional[str]] = {}
    for row in db_fetch_courts() or []:
        kort_id = _normalize_kort_id(row["kort_id"])
        if not kort_id:
            continue
        overlay_id = row["overlay_id"]
        normalized_overlay = normalize_overlay_id(overlay_id) or (overlay_id.strip() if isinstance(overlay_id, str) else None)
        mapping[kort_id] = normalized_overlay
    if not mapping and settings.overlay_ids:
        mapping = {str(k): v for k, v in settings.overlay_ids.items()}
    with _LOCK:
        global _COURTS
        _COURTS = mapping
    return dict(mapping)


def get_overlay_map() -> Dict[str, Optional[str]]:
    with _LOCK:
        if not _COURTS:
            reload_courts()
        return dict(_COURTS)


def list_courts() -> List[Tuple[str, Optional[str]]]:
    mapping = get_overlay_map()
    if not mapping:
        return []
    return sorted(mapping.items(), key=lambda item: _sort_key(item[0]))


def overlay_id_to_kort_map() -> Dict[str, str]:
    mapping = get_overlay_map()
    return {overlay: kort for kort, overlay in mapping.items() if overlay}


def get_overlay_for_kort(kort_id: str) -> Optional[str]:
    normalized = _normalize_kort_id(kort_id)
    if not normalized:
        return None
    return get_overlay_map().get(normalized)


def upsert_court(kort_id: str, overlay_id: str) -> Dict[str, Optional[str]]:
    normalized_kort = _normalize_kort_id(kort_id)
    normalized_overlay = normalize_overlay_id(overlay_id)
    if not normalized_kort:
        raise ValueError("Kort ID cannot be empty")
    if not normalized_overlay:
        raise ValueError("Overlay ID cannot be empty")
    db_upsert_court(normalized_kort, normalized_overlay)
    log.info("court upsert kort=%s overlay=%s", normalized_kort, normalized_overlay)
    return reload_courts()


def delete_court(kort_id: str) -> bool:
    normalized_kort = _normalize_kort_id(kort_id)
    if not normalized_kort:
        return False
    deleted = db_delete_court(normalized_kort)
    if deleted:
        log.info("court delete kort=%s", normalized_kort)
        reload_courts()
    return deleted


def ensure_loaded() -> None:
    get_overlay_map()


ensure_loaded()

__all__ = [
    "delete_court",
    "ensure_loaded",
    "get_overlay_for_kort",
    "get_overlay_map",
    "list_courts",
    "overlay_id_to_kort_map",
    "reload_courts",
    "upsert_court",
]
