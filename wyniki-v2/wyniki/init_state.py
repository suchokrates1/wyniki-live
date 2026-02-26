"""State initialization and loading."""
from __future__ import annotations

from .config import logger, settings
from .database import init_db, fetch_courts, fetch_tournaments, fetch_match_history
from .services.court_manager import refresh_courts_from_db
from .services.history_manager import load_history_from_db


def initialize_state() -> None:
    """Initialize application state from database."""
    logger.info("Initializing application state...")
    
    # Initialize database schema
    try:
        init_db()
        logger.info("Database schema initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
    
    # Ensure at least one active tournament exists
    try:
        tournaments = fetch_tournaments()
        if not tournaments:
            from datetime import date
            from .database import insert_tournament
            insert_tournament("Turniej domyślny", date.today().isoformat(), "2099-12-31", active=True)
            logger.info("Seeded default tournament")
    except Exception as e:
        logger.error(f"Failed to seed tournament: {e}")
    
    # Load courts from database
    try:
        db_courts_list = fetch_courts()
        db_courts = [row["kort_id"] for row in db_courts_list]
        
        if not db_courts:
            # Seed with production court IDs (1-5)
            logger.info("Seeding default courts (1-5)")
            from .database import insert_court
            for kort_id in ['1', '2', '3', '4', '5']:
                insert_court(kort_id)
            db_courts = [str(i) for i in range(1, 6)]
        
        refresh_courts_from_db(db_courts, seed_if_empty=False)
        logger.info(f"Loaded {len(db_courts)} courts from database")
    except Exception as e:
        logger.error(f"Failed to load courts: {e}")
        # Fallback to default courts
        default_courts = [str(i) for i in range(1, 6)]
        refresh_courts_from_db(default_courts)
        logger.info(f"Using {len(default_courts)} default courts")
    
    # Load match history from database
    try:
        history = fetch_match_history(limit=settings.match_history_size)
        # fetch returns newest first, load oldest first so deque order is correct
        load_history_from_db(list(reversed(history)))
        logger.info(f"Loaded {len(history)} match history entries from database")
    except Exception as e:
        logger.error(f"Failed to load match history: {e}")
    
    logger.info("State initialization complete")

