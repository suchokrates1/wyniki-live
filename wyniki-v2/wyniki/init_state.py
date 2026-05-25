"""State initialization and loading."""
from __future__ import annotations

from datetime import datetime, timezone

from .config import logger, settings
from .database import init_db, fetch_courts, fetch_tournaments, fetch_match_history, get_active_tournament_id
from .db_models import Match, Player
from .services.court_manager import STATE_LOCK, ensure_court_state, refresh_courts_from_db
from .services.history_manager import load_history_from_db


def _resolve_live_player_name(match: Match, raw_name: str | None) -> str:
    candidate = (raw_name or '').strip()
    if not candidate:
        return ''
    if not match.tournament_id:
        return candidate

    player = Player.query.filter_by(tournament_id=match.tournament_id, name=candidate).first()
    if not player:
        player = Player.query.filter_by(tournament_id=match.tournament_id, last_name=candidate).first()
    return player.full_name if player and player.full_name else candidate


def _parse_match_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_recent_live_match(match: Match) -> bool:
    max_age_hours = int(settings.live_rehydrate_max_age_hours or 0)
    if max_age_hours <= 0:
        return True
    reference = _parse_match_timestamp(match.updated_at) or _parse_match_timestamp(match.created_at)
    if not reference:
        return True
    age_seconds = (datetime.now(timezone.utc) - reference).total_seconds()
    return age_seconds <= max_age_hours * 3600


def rehydrate_live_courts() -> int:
    """Rebuild in-memory court state from active matches.

    This keeps overlays/public live views correct after process reloads or cache loss.
    """
    from .api.umpire_api import _sync_court_match_timer_from_match, _sync_live_score_to_court_state

    active_matches = (
        Match.query
        .filter_by(status='in_progress')
        .order_by(Match.updated_at.desc(), Match.id.desc())
        .all()
    )

    restored = 0
    skipped_stale = 0
    restored_courts: set[str] = set()
    for match in active_matches:
        kort_id = (match.court_id or '').strip()
        if not kort_id or kort_id in restored_courts:
            continue
        if not _is_recent_live_match(match):
            skipped_stale += 1
            continue

        court_state = ensure_court_state(kort_id)
        with STATE_LOCK:
            court_state["A"]["surname"] = match.player1_name
            court_state["B"]["surname"] = match.player2_name
            court_state["A"]["full_name"] = _resolve_live_player_name(match, match.player1_name)
            court_state["B"]["full_name"] = _resolve_live_player_name(match, match.player2_name)
            court_state["match_status"]["active"] = True
            _sync_live_score_to_court_state(court_state, match)
            _sync_court_match_timer_from_match(court_state, match)
            if match.phase:
                court_state["history_meta"] = court_state.get("history_meta", {})
                court_state["history_meta"]["phase"] = match.phase
            if match.statistics:
                court_state["stats_mode"] = match.statistics.stats_mode
                court_state["stats"] = {
                    "player_a": {
                        "aces": match.statistics.player1_aces,
                        "double_faults": match.statistics.player1_double_faults,
                        "winners": match.statistics.player1_winners,
                        "forced_errors": match.statistics.player1_forced_errors,
                        "unforced_errors": match.statistics.player1_unforced_errors,
                        "first_serves_in": match.statistics.player1_first_serves_in,
                        "first_serves_total": match.statistics.player1_first_serves,
                        "first_serve_pct": match.statistics.player1_first_serve_percentage,
                        "second_serves_in": None,
                        "second_serves_total": None,
                        "second_serve_pct": None,
                    },
                    "player_b": {
                        "aces": match.statistics.player2_aces,
                        "double_faults": match.statistics.player2_double_faults,
                        "winners": match.statistics.player2_winners,
                        "forced_errors": match.statistics.player2_forced_errors,
                        "unforced_errors": match.statistics.player2_unforced_errors,
                        "first_serves_in": match.statistics.player2_first_serves_in,
                        "first_serves_total": match.statistics.player2_first_serves,
                        "first_serve_pct": match.statistics.player2_first_serve_percentage,
                        "second_serves_in": None,
                        "second_serves_total": None,
                        "second_serve_pct": None,
                    },
                }
            court_state["updated"] = match.updated_at

        restored += 1
        restored_courts.add(kort_id)

    if restored:
        logger.info("rehydrated_live_courts", restored=restored)
    if skipped_stale:
        logger.info("skipped_stale_live_matches", skipped=skipped_stale, max_age_hours=settings.live_rehydrate_max_age_hours)
    return restored


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
            insert_tournament("test tournament", date.today().isoformat(), "2099-12-31", active=True)
            logger.info("Seeded default tournament")
    except Exception as e:
        logger.error(f"Failed to seed tournament: {e}")
    
    # Load courts from database
    try:
        db_courts_list = fetch_courts(active_only=True)
        db_courts = [row["kort_id"] for row in db_courts_list]
        
        if not db_courts:
            logger.info("Seeding default tournament courts (1-5)")
            from .database import create_tournament_courts
            tournament_id = get_active_tournament_id()
            if tournament_id:
                db_courts = create_tournament_courts(tournament_id, 5)
                db_courts_list = fetch_courts(active_only=True)
        
        refresh_courts_from_db(db_courts_list, seed_if_empty=False)
        rehydrate_live_courts()
        logger.info(f"Loaded {len(db_courts)} courts from database")
    except Exception as e:
        logger.error(f"Failed to load courts: {e}")
        # Fallback to default courts
        default_courts = [str(i) for i in range(1, 6)]
        refresh_courts_from_db(default_courts)
        logger.info(f"Using {len(default_courts)} default courts")
    
    # Load match history from database
    try:
        history = fetch_match_history(limit=settings.match_history_size, tournament_id=None)
        # fetch returns newest first, load oldest first so deque order is correct
        load_history_from_db(list(reversed(history)))
        logger.info(f"Loaded {len(history)} match history entries")
    except Exception as e:
        logger.error(f"Failed to load match history: {e}")
    
    logger.info("State initialization complete")

