"""Database abstraction layer."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .config import log


def insert_match_history(entry: Dict[str, Any]) -> None:
    """Insert match history entry into database."""
    # TODO: Implement database insertion
    log.info(f"TODO: Insert history: {entry}")


def delete_latest_history_entry() -> None:
    """Delete most recent history entry."""
    # TODO: Implement database deletion
    log.info("TODO: Delete latest history")


def fetch_courts() -> List[Dict[str, Optional[str]]]:
    """Fetch courts from database."""
    # TODO: Implement database fetch
    return [
        {"kort_id": "1", "overlay_id": None},
        {"kort_id": "2", "overlay_id": None},
        {"kort_id": "3", "overlay_id": None},
        {"kort_id": "4", "overlay_id": None},
    ]


def upsert_court(kort_id: str, overlay_id: Optional[str]) -> None:
    """Insert or update court configuration."""
    # TODO: Implement database upsert
    log.info(f"TODO: Upsert court: {kort_id} -> {overlay_id}")


def fetch_app_settings(keys: List[str]) -> Dict[str, Any]:
    """Fetch application settings by keys."""
    # TODO: Implement database fetch
    return {}


def upsert_app_settings(settings: Dict[str, str]) -> None:
    """Update application settings."""
    # TODO: Implement database upsert
    log.info(f"TODO: Upsert settings: {settings}")
