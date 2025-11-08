"""State initialization and loading."""
from __future__ import annotations

from .config import logger, settings
from .database import init_db, fetch_courts
from .services.court_manager import refresh_courts_from_db
from .services.throttle_manager import set_uno_requests_enabled


def initialize_state() -> None:
    """Initialize application state from database."""
    logger.info("Initializing application state...")
    
    # Initialize database schema
    try:
        init_db()
        logger.info("Database schema initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
    
    # Load courts from database
    try:
        db_courts_list = fetch_courts()
        db_courts = {row["kort_id"]: row.get("overlay_id") for row in db_courts_list}
        
        if not db_courts:
            # Seed with production court IDs (1-5)
            logger.info("Seeding default courts (1-5)")
            from .database import insert_court
            for kort_id in ['1', '2', '3', '4', '5']:
                insert_court(kort_id, None)
            db_courts = {str(i): None for i in range(1, 6)}
        
        refresh_courts_from_db(db_courts, seed_if_empty=False)
        logger.info(f"Loaded {len(db_courts)} courts from database")
    except Exception as e:
        logger.error(f"Failed to load courts: {e}")
        # Fallback to default courts
        default_courts = {str(i): None for i in range(1, 6)}
        refresh_courts_from_db(default_courts)
        logger.info(f"Using {len(default_courts)} default courts")
    
    # Initialize UNO throttling (disabled by default for safety)
    set_uno_requests_enabled(False, "startup - manual enable required")
    
    logger.info("State initialization complete")

