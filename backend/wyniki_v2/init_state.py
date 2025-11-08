"""State initialization and loading."""
from __future__ import annotations

from .config import loggerger, settings
from .database import fetch_courts
from .services.court_manager import refresh_courts_from_db
from .services.throttle_manager import set_uno_requests_enabled


def initialize_state() -> None:
    """Initialize application state from database."""
    logger.info("Initializing application state...")
    
    # Load courts from database
    try:
        db_courts_list = fetch_courts()
        db_courts = {row["kort_id"]: row.get("overlay_id") for row in db_courts_list}
        refresh_courts_from_db(db_courts, seed_if_empty=True)
        logger.info(f"Loaded {len(db_courts)} courts from database")
    except Exception as e:
        logger.error(f"Failed to load courts: {e}")
        # Fallback to default courts
        default_courts = {str(i): None for i in range(1, 5)}
        refresh_courts_from_db(default_courts)
        logger.info(f"Using {len(default_courts)} default courts")
    
    # Initialize UNO throttling (disabled by default for safety)
    set_uno_requests_enabled(False, "startup - manual enable required")
    
    logger.info("State initialization complete")

