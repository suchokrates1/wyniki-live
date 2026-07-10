"""Database access layer for v2."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional
from werkzeug.security import generate_password_hash

from .config import settings, logger


def _default_simulation_office_password_hash(is_simulation: bool, office_password_hash: str) -> str:
    if is_simulation and not (office_password_hash or '').strip():
        return generate_password_hash('test')
    return (office_password_hash or '').strip()


@contextmanager
def db_conn() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections."""
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    connection = sqlite3.connect(str(db_path), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    """Initialize database schema."""
    with db_conn() as conn:
        cursor = conn.cursor()
        
        # Courts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS courts (
                kort_id TEXT PRIMARY KEY,
                pin TEXT,
                name TEXT,
                tournament_id INTEGER,
                display_order INTEGER DEFAULT 0,
                active INTEGER DEFAULT 1
            )
        """)
        
        # Tournaments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                active INTEGER DEFAULT 0,
                location TEXT DEFAULT '',
                city TEXT DEFAULT '',
                country TEXT DEFAULT '',
                logo_path TEXT,
                report_email TEXT DEFAULT '',
                summary_sent_at TEXT,
                is_public INTEGER DEFAULT 1,
                stats_enabled INTEGER DEFAULT 1,
                is_simulation INTEGER DEFAULT 0,
                access_key TEXT DEFAULT '',
                office_password_hash TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Players table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                first_name TEXT DEFAULT '',
                last_name TEXT DEFAULT '',
                category TEXT,
                country TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        
        # Match history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS match_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kort_id TEXT NOT NULL,
                ended_ts TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                player_a TEXT,
                player_b TEXT,
                score_a TEXT,
                score_b TEXT,
                category TEXT,
                phase TEXT DEFAULT 'Grupowa',
                match_id INTEGER,
                stats_mode TEXT,
                finish_reason TEXT DEFAULT 'normal',
                winner_name TEXT,
                injured_player_name TEXT,
                result_note TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                court_id TEXT NOT NULL,
                player1_name TEXT NOT NULL,
                player2_name TEXT NOT NULL,
                status TEXT DEFAULT 'in_progress',
                tournament_id INTEGER,
                bracket_group_id INTEGER,
                phase TEXT,
                client_match_uuid TEXT,
                schedule_id INTEGER,
                finish_reason TEXT DEFAULT 'normal',
                winner_name TEXT,
                injured_player_name TEXT,
                result_note TEXT,
                player1_sets INTEGER DEFAULT 0,
                player2_sets INTEGER DEFAULT 0,
                player1_games INTEGER DEFAULT 0,
                player2_games INTEGER DEFAULT 0,
                player1_points INTEGER DEFAULT 0,
                player2_points INTEGER DEFAULT 0,
                sets_history TEXT,
                client_info TEXT,
                client_ip TEXT,
                client_country TEXT,
                client_user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS match_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id INTEGER NOT NULL UNIQUE,
                player1_aces INTEGER DEFAULT 0,
                player1_double_faults INTEGER DEFAULT 0,
                player1_winners INTEGER DEFAULT 0,
                player1_forced_errors INTEGER DEFAULT 0,
                player1_unforced_errors INTEGER DEFAULT 0,
                player1_first_serves INTEGER DEFAULT 0,
                player1_first_serves_in INTEGER DEFAULT 0,
                player1_first_serve_percentage REAL DEFAULT 0.0,
                player2_aces INTEGER DEFAULT 0,
                player2_double_faults INTEGER DEFAULT 0,
                player2_winners INTEGER DEFAULT 0,
                player2_forced_errors INTEGER DEFAULT 0,
                player2_unforced_errors INTEGER DEFAULT 0,
                player2_first_serves INTEGER DEFAULT 0,
                player2_first_serves_in INTEGER DEFAULT 0,
                player2_first_serve_percentage REAL DEFAULT 0.0,
                match_duration_ms INTEGER DEFAULT 0,
                winner TEXT,
                stats_mode TEXT,
                received_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
            )
        """)
        
        # App settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        # Migration: Add pin column to courts if it doesn't exist
        cursor.execute("PRAGMA table_info(courts)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'pin' not in columns:
            cursor.execute("ALTER TABLE courts ADD COLUMN pin TEXT")
            logger.info("database_migration", action="added_pin_column_to_courts")
        if 'name' not in columns:
            cursor.execute("ALTER TABLE courts ADD COLUMN name TEXT")
            cursor.execute("UPDATE courts SET name = kort_id WHERE name IS NULL OR TRIM(name) = ''")
            logger.info("database_migration", action="added_name_to_courts")
        if 'tournament_id' not in columns:
            cursor.execute("ALTER TABLE courts ADD COLUMN tournament_id INTEGER")
            cursor.execute("SELECT id FROM tournaments ORDER BY id ASC LIMIT 1")
            first_tournament = cursor.fetchone()
            if first_tournament:
                cursor.execute(
                    "UPDATE courts SET tournament_id = ? WHERE tournament_id IS NULL",
                    (first_tournament["id"],),
                )
            logger.info("database_migration", action="added_tournament_id_to_courts")
        if 'display_order' not in columns:
            cursor.execute("ALTER TABLE courts ADD COLUMN display_order INTEGER DEFAULT 0")
            cursor.execute(
                "UPDATE courts SET display_order = CAST(kort_id AS INTEGER) WHERE display_order IS NULL OR display_order = 0"
            )
            logger.info("database_migration", action="added_display_order_to_courts")
        
        # Migration: Add match_id and stats_mode columns to match_history
        cursor.execute("PRAGMA table_info(match_history)")
        mh_columns = [row[1] for row in cursor.fetchall()]
        if 'match_id' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN match_id INTEGER")
            logger.info("database_migration", action="added_match_id_to_match_history")
        if 'stats_mode' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN stats_mode TEXT")
            logger.info("database_migration", action="added_stats_mode_to_match_history")
        
        # Migration: Add score_a/score_b TEXT columns (replaces old set1_a/set1_b/... columns)
        if 'score_a' not in mh_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN score_a TEXT")
            cursor.execute("ALTER TABLE match_history ADD COLUMN score_b TEXT")
            # Backfill from old per-set columns if they exist
            if 'set1_a' in mh_columns:
                cursor.execute("SELECT id, set1_a, set1_b, set2_a, set2_b, tie_a, tie_b FROM match_history")
                for row in cursor.fetchall():
                    sa = json.dumps([row['set1_a'] or 0, row['set2_a'] or 0, row['tie_a'] or 0])
                    sb = json.dumps([row['set1_b'] or 0, row['set2_b'] or 0, row['tie_b'] or 0])
                    cursor.execute("UPDATE match_history SET score_a=?, score_b=? WHERE id=?", (sa, sb, row['id']))
            logger.info("database_migration", action="added_score_a_score_b_to_match_history")
        
        # Migration: Add first_name/last_name columns to players
        cursor.execute("PRAGMA table_info(players)")
        player_columns = [row[1] for row in cursor.fetchall()]
        if 'first_name' not in player_columns:
            cursor.execute("ALTER TABLE players ADD COLUMN first_name TEXT DEFAULT ''")
            cursor.execute("ALTER TABLE players ADD COLUMN last_name TEXT DEFAULT ''")
            # Backfill: split existing 'name' into first_name + last_name
            cursor.execute("SELECT id, name FROM players")
            for row in cursor.fetchall():
                full = (row['name'] or '').strip()
                parts = full.rsplit(' ', 1)
                if len(parts) == 2:
                    fn, ln = parts[0], parts[1]
                else:
                    fn, ln = '', full  # single word → last name
                cursor.execute(
                    "UPDATE players SET first_name=?, last_name=? WHERE id=?",
                    (fn, ln, row['id'])
                )
            logger.info("database_migration", action="added_first_name_last_name_to_players")
        
        # Migration: Add sets_history column to match_history (for tiebreak scores)
        cursor.execute("PRAGMA table_info(match_history)")
        mh_cols2 = [row[1] for row in cursor.fetchall()]
        if 'sets_history' not in mh_cols2:
            cursor.execute("ALTER TABLE match_history ADD COLUMN sets_history TEXT")
            logger.info("database_migration", action="added_sets_history_to_match_history")
        
        # Migration: Add tournament_id column to match_history
        cursor.execute("PRAGMA table_info(match_history)")
        mh_cols3 = [row[1] for row in cursor.fetchall()]
        if 'tournament_id' not in mh_cols3:
            cursor.execute("ALTER TABLE match_history ADD COLUMN tournament_id INTEGER")
            # Assign existing history to the first tournament (default)
            cursor.execute("SELECT id FROM tournaments ORDER BY id ASC LIMIT 1")
            first_t = cursor.fetchone()
            if first_t:
                cursor.execute("UPDATE match_history SET tournament_id = ? WHERE tournament_id IS NULL", (first_t["id"],))
            logger.info("database_migration", action="added_tournament_id_to_match_history")

        cursor.execute("PRAGMA table_info(match_history)")
        mh_result_cols = [row[1] for row in cursor.fetchall()]
        match_history_result_columns = {
            'finish_reason': "TEXT DEFAULT 'normal'",
            'winner_name': 'TEXT',
            'injured_player_name': 'TEXT',
            'result_note': 'TEXT',
        }
        for column_name, ddl in match_history_result_columns.items():
            if column_name not in mh_result_cols:
                cursor.execute(f"ALTER TABLE match_history ADD COLUMN {column_name} {ddl}")
                logger.info("database_migration", action=f"added_{column_name}_to_match_history")
        
        # Bracket tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                order_num INTEGER DEFAULT 0,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_group_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                player_id INTEGER,
                player_name TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES bracket_groups(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tournament_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                preset_key TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                hint_bands TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
                UNIQUE(tournament_id, label)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tournament_categories_tid ON tournament_categories(tournament_id, sort_order)")
        cursor.execute("PRAGMA table_info(bracket_groups)")
        bracket_group_cols = [row[1] for row in cursor.fetchall()]
        if 'tournament_category_id' not in bracket_group_cols:
            cursor.execute("ALTER TABLE bracket_groups ADD COLUMN tournament_category_id INTEGER")
            logger.info("database_migration", action="added_tournament_category_id_to_bracket_groups")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bracket_knockout (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                phase TEXT NOT NULL,
                position INTEGER DEFAULT 1,
                player1_name TEXT,
                player2_name TEXT,
                winner_name TEXT,
                score_summary TEXT,
                finish_reason TEXT DEFAULT 'normal',
                result_note TEXT,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tournament_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                day_date TEXT NOT NULL,
                scheduled_time TEXT DEFAULT '',
                court_id TEXT DEFAULT '',
                court_label TEXT DEFAULT '',
                category_name TEXT DEFAULT '',
                bracket_group_id INTEGER,
                group_name TEXT DEFAULT '',
                phase TEXT DEFAULT 'Grupowa',
                player1_name TEXT NOT NULL DEFAULT '',
                player2_name TEXT NOT NULL DEFAULT '',
                status TEXT DEFAULT 'draft',
                source_type TEXT DEFAULT 'manual',
                source_ref_id INTEGER,
                match_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                notes_public TEXT DEFAULT '',
                notes_internal TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tournament_schedule_day ON tournament_schedule(tournament_id, day_date, sort_order)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tournament_schedule_court ON tournament_schedule(tournament_id, court_id, day_date, scheduled_time)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tournament_schedule_match ON tournament_schedule(match_id)")
        
        # Migration: Add tournament_id, bracket_group_id, phase to matches
        cursor.execute("PRAGMA table_info(matches)")
        m_cols = [row[1] for row in cursor.fetchall()]
        if 'tournament_id' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN tournament_id INTEGER")
            logger.info("database_migration", action="added_tournament_id_to_matches")
        if 'bracket_group_id' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN bracket_group_id INTEGER")
            logger.info("database_migration", action="added_bracket_group_id_to_matches")
        if 'phase' not in m_cols:
            cursor.execute("ALTER TABLE matches ADD COLUMN phase TEXT")
            logger.info("database_migration", action="added_phase_to_matches")
        match_client_columns = {
            'client_match_uuid': 'TEXT',
            'schedule_id': 'INTEGER',
            'client_info': 'TEXT',
            'client_ip': 'TEXT',
            'client_country': 'TEXT',
            'client_user_agent': 'TEXT',
            'finish_reason': "TEXT DEFAULT 'normal'",
            'winner_name': 'TEXT',
            'injured_player_name': 'TEXT',
            'result_note': 'TEXT',
        }
        for column_name, ddl in match_client_columns.items():
            if column_name not in m_cols:
                cursor.execute(f"ALTER TABLE matches ADD COLUMN {column_name} {ddl}")
                logger.info("database_migration", action=f"added_{column_name}_to_matches")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_client_uuid ON matches(client_match_uuid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_matches_schedule_id ON matches(schedule_id)")

        cursor.execute("PRAGMA table_info(bracket_knockout)")
        knockout_cols = [row[1] for row in cursor.fetchall()]
        knockout_result_columns = {
            'finish_reason': "TEXT DEFAULT 'normal'",
            'result_note': 'TEXT',
        }
        for column_name, ddl in knockout_result_columns.items():
            if column_name not in knockout_cols:
                cursor.execute(f"ALTER TABLE bracket_knockout ADD COLUMN {column_name} {ddl}")
                logger.info("database_migration", action=f"added_{column_name}_to_bracket_knockout")

        cursor.execute("PRAGMA table_info(tournament_schedule)")
        schedule_cols = [row[1] for row in cursor.fetchall()]
        schedule_defaults = {
            'scheduled_time': "TEXT DEFAULT ''",
            'court_id': "TEXT DEFAULT ''",
            'court_label': "TEXT DEFAULT ''",
            'category_name': "TEXT DEFAULT ''",
            'bracket_group_id': "INTEGER",
            'group_name': "TEXT DEFAULT ''",
            'phase': "TEXT DEFAULT 'Grupowa'",
            'status': "TEXT DEFAULT 'draft'",
            'source_type': "TEXT DEFAULT 'manual'",
            'source_ref_id': "INTEGER",
            'match_id': "INTEGER",
            'sort_order': "INTEGER DEFAULT 0",
            'notes_public': "TEXT DEFAULT ''",
            'notes_internal': "TEXT DEFAULT ''",
            'created_at': "TEXT DEFAULT ''",
            'updated_at': "TEXT DEFAULT ''",
        }
        for column_name, ddl in schedule_defaults.items():
            if column_name not in schedule_cols:
                cursor.execute(f"ALTER TABLE tournament_schedule ADD COLUMN {column_name} {ddl}")
                logger.info("database_migration", action=f"added_{column_name}_to_tournament_schedule")
        
        # Migration: Add location column to tournaments
        cursor.execute("PRAGMA table_info(tournaments)")
        t_cols = [row[1] for row in cursor.fetchall()]
        if 'location' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN location TEXT DEFAULT ''")
            logger.info("database_migration", action="added_location_to_tournaments")
        if 'city' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN city TEXT DEFAULT ''")
            logger.info("database_migration", action="added_city_to_tournaments")
        if 'country' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN country TEXT DEFAULT ''")
            logger.info("database_migration", action="added_country_to_tournaments")
        if 'logo_path' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN logo_path TEXT")
            logger.info("database_migration", action="added_logo_path_to_tournaments")
        if 'report_email' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN report_email TEXT DEFAULT ''")
            logger.info("database_migration", action="added_report_email_to_tournaments")
        if 'summary_sent_at' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN summary_sent_at TEXT")
            logger.info("database_migration", action="added_summary_sent_at_to_tournaments")
        if 'is_public' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN is_public INTEGER DEFAULT 1")
            logger.info("database_migration", action="added_is_public_to_tournaments")
        if 'stats_enabled' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN stats_enabled INTEGER DEFAULT 1")
            logger.info("database_migration", action="added_stats_enabled_to_tournaments")
        if 'is_simulation' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN is_simulation INTEGER DEFAULT 0")
            logger.info("database_migration", action="added_is_simulation_to_tournaments")
        if 'access_key' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN access_key TEXT DEFAULT ''")
            logger.info("database_migration", action="added_access_key_to_tournaments")
        if 'office_password_hash' not in t_cols:
            cursor.execute("ALTER TABLE tournaments ADD COLUMN office_password_hash TEXT DEFAULT ''")
            logger.info("database_migration", action="added_office_password_hash_to_tournaments")
        simulation_office_password_hash = generate_password_hash('test')
        cursor.execute(
            """
            UPDATE tournaments
            SET office_password_hash = ?
            WHERE COALESCE(is_simulation, 0) = 1
              AND COALESCE(office_password_hash, '') = ''
            """,
            (simulation_office_password_hash,),
        )
        if cursor.rowcount:
            logger.info("database_migration", action="backfilled_simulation_office_passwords", count=cursor.rowcount)
        cursor.execute(
            "UPDATE tournaments SET city = COALESCE(NULLIF(TRIM(location), ''), city, '') WHERE TRIM(COALESCE(city, '')) = '' AND TRIM(COALESCE(location, '')) != ''"
        )
        cursor.execute(
            "UPDATE tournaments SET location = TRIM(COALESCE(city, '') || CASE WHEN TRIM(COALESCE(city, '')) != '' AND TRIM(COALESCE(country, '')) != '' THEN ', ' ELSE '' END || COALESCE(country, ''))"
        )
        
        # Migration: Add gender column to players
        cursor.execute("PRAGMA table_info(players)")
        p_cols2 = [row[1] for row in cursor.fetchall()]
        if 'gender' not in p_cols2:
            cursor.execute("ALTER TABLE players ADD COLUMN gender TEXT DEFAULT ''")
            logger.info("database_migration", action="added_gender_to_players")
        
        # Migration: Create global_players table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS global_players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL DEFAULT '',
                last_name TEXT NOT NULL DEFAULT '',
                gender TEXT DEFAULT '',
                birth_date TEXT,
                country TEXT DEFAULT '',
                category TEXT DEFAULT '',
                photo_url TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: Add global_player_id column to players
        cursor.execute("PRAGMA table_info(players)")
        p_cols3 = [row[1] for row in cursor.fetchall()]
        if 'global_player_id' not in p_cols3:
            cursor.execute("ALTER TABLE players ADD COLUMN global_player_id INTEGER REFERENCES global_players(id) ON DELETE SET NULL")
            logger.info("database_migration", action="added_global_player_id_to_players")

        conn.commit()
    
    logger.info("database_initialized", db_path=settings.database_path)


def _normalize_player_name(value: Optional[str]) -> str:
    """Normalize player names for tolerant exact matching."""
    return " ".join((value or "").strip().lower().split())


def _player_surname(value: Optional[str]) -> str:
    """Return the normalized surname/token used by mobile clients."""
    normalized = _normalize_player_name(value)
    if not normalized:
        return ""
    return normalized.split()[-1]


def _bracket_row_match_priority(row: sqlite3.Row, player_name: str) -> int:
    """Rank player matches: full-name exact wins over surname-only fallback."""
    normalized = _normalize_player_name(player_name)
    if not normalized:
        return 0

    first_name = (row["player_first_name"] or "").strip()
    last_name = (row["player_last_name"] or "").strip()
    exact_candidates = {
        _normalize_player_name(row["bracket_player_name"]),
        _normalize_player_name(row["player_full_name"]),
        _normalize_player_name(f"{first_name} {last_name}"),
        _normalize_player_name(last_name),
    }
    exact_candidates.discard("")
    if normalized in exact_candidates:
        return 2

    surname = _player_surname(player_name)
    surname_candidates = {
        _player_surname(row["bracket_player_name"]),
        _player_surname(row["player_full_name"]),
        _player_surname(last_name),
    }
    surname_candidates.discard("")
    if surname and surname in surname_candidates:
        return 1
    return 0


def _find_bracket_groups_for_player(cursor: sqlite3.Cursor, tournament_id: int, player_name: str) -> tuple[set[int], int]:
    """Find candidate bracket groups for a player using exact names first, surname fallback second."""
    cursor.execute(
        """
        SELECT DISTINCT bgp.group_id, bg.name,
               bgp.player_name AS bracket_player_name,
               p.name AS player_full_name,
               p.first_name AS player_first_name,
               p.last_name AS player_last_name
        FROM bracket_group_players bgp
        JOIN bracket_groups bg ON bg.id = bgp.group_id
        LEFT JOIN players p ON p.id = bgp.player_id
        WHERE bg.tournament_id = ?
        """,
        (tournament_id,),
    )

    best_priority = 0
    matched_group_ids: set[int] = set()
    for row in cursor.fetchall():
        priority = _bracket_row_match_priority(row, player_name)
        if priority <= 0:
            continue
        if priority > best_priority:
            best_priority = priority
            matched_group_ids = {int(row["group_id"])}
        elif priority == best_priority:
            matched_group_ids.add(int(row["group_id"]))

    return matched_group_ids, best_priority


def detect_bracket_context(player1_name: str, player2_name: str, tournament_id: int) -> Dict[str, Any]:
    """Detect bracket group/phase for a match based on player names.
    
    Returns dict with:
      - group_id: int or None
      - phase: 'Grupowa' | 'Pucharowa' | None
      - warning: str code or None ('different_groups' | 'no_bracket')
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            p1 = (player1_name or "").strip()
            p2 = (player2_name or "").strip()
            p1_surname = p1.split()[-1] if p1 else ""
            p2_surname = p2.split()[-1] if p2 else ""

            def _find_explicit_phase(table_name: str) -> Optional[str]:
                cursor.execute(
                    f"""
                    SELECT phase
                    FROM {table_name}
                    WHERE tournament_id = ?
                      AND phase IS NOT NULL
                      AND TRIM(phase) != ''
                      AND phase != 'Grupowa'
                      AND ((player1_name = ? AND player2_name = ?)
                        OR (player1_name = ? AND player2_name = ?))
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (tournament_id, p1, p2, p2, p1),
                )
                row = cursor.fetchone()
                if row:
                    return row["phase"]
                if not p1_surname or not p2_surname:
                    return None
                cursor.execute(
                    f"""
                    SELECT phase
                    FROM {table_name}
                    WHERE tournament_id = ?
                      AND phase IS NOT NULL
                      AND TRIM(phase) != ''
                      AND phase != 'Grupowa'
                      AND ((player1_name LIKE ? AND player2_name LIKE ?)
                        OR (player1_name LIKE ? AND player2_name LIKE ?))
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    (
                        tournament_id,
                        f"%{p1_surname}",
                        f"%{p2_surname}",
                        f"%{p2_surname}",
                        f"%{p1_surname}",
                    ),
                )
                row = cursor.fetchone()
                return row["phase"] if row else None

            scheduled_phase = _find_explicit_phase("tournament_schedule")
            if scheduled_phase:
                return {"group_id": None, "phase": scheduled_phase, "warning": None}

            # Prefer explicit knockout slots over shared group membership so
            # same-group finals are not misclassified as group matches.
            knockout_phase = _find_explicit_phase("bracket_knockout")
            if knockout_phase:
                return {"group_id": None, "phase": knockout_phase, "warning": None}

            p1_gids, p1_priority = _find_bracket_groups_for_player(cursor, tournament_id, player1_name)
            p2_gids, p2_priority = _find_bracket_groups_for_player(cursor, tournament_id, player2_name)

            if not p1_gids or not p2_gids:
                return {"group_id": None, "phase": None, "warning": "no_bracket"}

            common = p1_gids & p2_gids

            if common:
                gid = min(common)
                return {"group_id": gid, "phase": "Grupowa", "warning": None}

            surname_only_ambiguous = (p1_priority == 1 and len(p1_gids) > 1) or (p2_priority == 1 and len(p2_gids) > 1)
            if surname_only_ambiguous:
                return {"group_id": None, "phase": None, "warning": "no_bracket"}

            return {"group_id": None, "phase": "Pucharowa", "warning": "different_groups"}

    except Exception as e:
        logger.error("detect_bracket_context_error", error=str(e))
        return {"group_id": None, "phase": None, "warning": None}


def _split_bracket_label(value: Optional[str]) -> tuple[str, str]:
    """Split a bracket label into category prefix and suffix."""
    label = (value or "").strip()
    if not label:
        return "", ""
    if " — " not in label:
        return "", label
    prefix, suffix = label.split(" — ", 1)
    return prefix.strip(), suffix.strip()


GROUP_PHASE = "Grupowa"
GROUP_REMATCH_PHASE = "Grupowa — Rewanż"

DEFAULT_GROUP_SCHEDULE_NOTE_PL = "Godzina orientacyjna zostanie podana przez biuro zawodow"
DEFAULT_KNOCKOUT_SCHEDULE_NOTE_PL = "Mecz fazy pucharowej - godzina do potwierdzenia"
DEFAULT_GROUP_SCHEDULE_NOTE_DE = "Orientierungszeit wird vom Turnierbüro bekannt gegeben"
DEFAULT_KNOCKOUT_SCHEDULE_NOTE_DE = "Pokalspiel – Uhrzeit noch zu bestätigen"


def _tournament_country_code(tournament_id: int) -> str:
    try:
        with db_conn() as conn:
            row = conn.execute(
                "SELECT UPPER(COALESCE(country, '')) AS country FROM tournaments WHERE id = ?",
                (tournament_id,),
            ).fetchone()
            return str(row["country"] if row else "")
    except Exception:
        return ""


def _default_group_schedule_note(tournament_id: int) -> str:
    if _tournament_country_code(tournament_id) == "DE":
        return DEFAULT_GROUP_SCHEDULE_NOTE_DE
    return DEFAULT_GROUP_SCHEDULE_NOTE_PL


def _default_knockout_schedule_note(tournament_id: int) -> str:
    if _tournament_country_code(tournament_id) == "DE":
        return DEFAULT_KNOCKOUT_SCHEDULE_NOTE_DE
    return DEFAULT_KNOCKOUT_SCHEDULE_NOTE_PL


def is_group_stage_phase(phase: Optional[str]) -> bool:
    """Return True for regular or rematch group-stage phases."""
    value = (phase or "").strip()
    return value in {GROUP_PHASE, GROUP_REMATCH_PHASE}


def expected_group_matches_count(tournament_id: int, group_id: int, player_count: int) -> int:
    with db_conn() as conn:
        return _expected_group_matches_count(conn.cursor(), tournament_id, group_id, player_count)


def count_finished_group_matches(tournament_id: int, group_id: int) -> int:
    with db_conn() as conn:
        return _count_finished_group_matches(conn.cursor(), tournament_id, group_id)


def _phase_kind(phase: Optional[str]) -> Optional[str]:
    """Map localized phase labels to a stable semantic kind."""
    _, suffix = _split_bracket_label(phase)
    normalized = (suffix or phase or "").strip().lower()
    if not normalized:
        return None
    if "półfina" in normalized or "semif" in normalized:
        return "semifinal"
    if "3." in normalized or "3 " in normalized or "third" in normalized or "3rd" in normalized:
        return "third_place"
    if "5." in normalized or "5 " in normalized or "fifth" in normalized or "5th" in normalized:
        return "fifth_place"
    if "7." in normalized or "7 " in normalized or "seventh" in normalized or "7th" in normalized:
        return "seventh_place"
    if normalized == "pucharowa":
        return "knockout"
    if "fina" in normalized or normalized == "final":
        return "final"
    return None


def _group_sort_key(name: str) -> tuple[int, str]:
    """Sort groups so A/B stay in a stable order inside a category."""
    _, suffix = _split_bracket_label(name)
    label = (suffix or name or "").strip()
    last_token = label.split()[-1].upper() if label else ""
    if len(last_token) == 1 and last_token.isalpha():
        return (0, last_token)
    return (1, label.lower())


def _is_group_partition_name(name: str) -> bool:
    """Return True when a group label is one partition of a wider A/B category."""
    prefix, suffix = _split_bracket_label(name)
    if not prefix or not suffix:
        return False
    label = suffix.strip()
    if not label:
        return False
    last_token = label.split()[-1].upper()
    return label.casefold().startswith("grupa ") or (len(last_token) == 1 and last_token.isalpha())


def _knockout_bucket_key(group_name: str) -> tuple[str, str]:
    """Group standings into either one single-group final or a shared A/B bracket."""
    name = (group_name or "").strip()
    prefix, _ = _split_bracket_label(name)
    if _is_group_partition_name(name):
        return ("multi", prefix)
    return ("single", name)


def _is_knockout_placeholder_name(name: Optional[str]) -> bool:
    """Detect generated placeholder labels that should be replaced by real players."""
    value = (name or "").strip()
    if not value:
        return True
    lowered = value.lower()
    if lowered.startswith("zwycięzca pf") or lowered.startswith("przegrany pf"):
        return True
    if lowered.startswith("winner sf") or lowered.startswith("loser sf"):
        return True
    if re.match(r"^\d+[A-Za-z]$", value):
        return True
    if re.match(r"^\d+\.\s+", value):
        return True
    return False


def _standing_placeholder(rank: int, group_name: str, category_prefix: str) -> str:
    """Stable standing placeholder, e.g. 1. B2 Mężczyźni or 1A for partitioned groups."""
    if _is_group_partition_name(group_name):
        _, suffix = _split_bracket_label(group_name)
        label = (suffix or "").strip()
        last_token = label.split()[-1].upper() if label else ""
        if len(last_token) == 1 and last_token.isalpha():
            return f"{rank}{last_token}"
    prefix = (category_prefix or group_name or "").strip()
    return f"{rank}. {prefix}"


def _is_group_play_complete(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
    player_count: int,
) -> bool:
    if player_count < 2:
        return True
    expected = _expected_group_matches_count(cursor, tournament_id, group_id, player_count)
    return _count_finished_group_matches(cursor, tournament_id, group_id) >= expected


def _bucket_groups_play_complete(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    ordered_groups: List[Dict[str, Any]],
    group_id_by_name: Dict[str, int],
    player_count_by_name: Dict[str, int],
) -> bool:
    for group in ordered_groups:
        name = str(group.get("name") or "").strip()
        group_id = group_id_by_name.get(name)
        if not group_id:
            return False
        player_count = player_count_by_name.get(name) or len(group.get("standings") or [])
        if not _is_group_play_complete(cursor, tournament_id, group_id, player_count):
            return False
    return True


def _slot_phase_matches(slot_phase: str, expected_kind: str, category_prefix: str) -> bool:
    """Check whether a stored phase belongs to the requested category/kind."""
    slot_prefix, _ = _split_bracket_label(slot_phase)
    return slot_prefix == category_prefix and _phase_kind(slot_phase) == expected_kind


def _expected_group_matches_count(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
    player_count: int,
) -> int:
    """Count scheduled group-stage matches for one bracket group."""
    if player_count < 2:
        return 0
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM tournament_schedule
        WHERE tournament_id = ?
          AND bracket_group_id = ?
          AND phase IN (?, ?)
        """,
        (tournament_id, group_id, GROUP_PHASE, GROUP_REMATCH_PHASE),
    )
    scheduled = int(cursor.fetchone()["count"] or 0)
    expected_rr = player_count * (player_count - 1) // 2
    if scheduled > expected_rr > 0:
        return expected_rr
    if scheduled > 0:
        return scheduled
    return expected_rr


def _count_finished_group_matches(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group_id: int,
) -> int:
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM matches
        WHERE tournament_id = ?
          AND status = 'finished'
          AND COALESCE(finish_reason, 'normal') != 'test'
          AND phase IN (?, ?)
          AND bracket_group_id = ?
        """,
        (tournament_id, GROUP_PHASE, GROUP_REMATCH_PHASE, group_id),
    )
    return int(cursor.fetchone()["count"] or 0)


def _assign_knockout_slot_player(cursor, slot: sqlite3.Row, side: int, player_name: str) -> None:
    """Write a player into the requested side if the slot is empty or placeholder-only."""
    column = "player1_name" if side == 1 else "player2_name"
    current_value = slot[column]
    if current_value and not _is_knockout_placeholder_name(current_value):
        return
    cursor.execute(f"UPDATE bracket_knockout SET {column} = ? WHERE id = ?", (player_name, slot["id"]))


def _knockout_schedule_player_names(slot: sqlite3.Row) -> tuple[str, str]:
    """Return schedule-facing player names, using stable placeholders for pending finals."""
    player1_name = (slot["player1_name"] or "").strip()
    player2_name = (slot["player2_name"] or "").strip()
    phase_kind = _phase_kind(str(slot["phase"] or ""))

    if phase_kind == "final":
        return (
            player1_name or "Zwycięzca PF 1",
            player2_name or "Zwycięzca PF 2",
        )
    if phase_kind == "third_place":
        return (
            player1_name or "Przegrany PF 1",
            player2_name or "Przegrany PF 2",
        )
    return (player1_name, player2_name)


def _build_knockout_slots_for_category(category_prefix: str, ordered_groups: List[Dict]) -> List[Dict]:
    """Generate semifinal/final/placement slots for one category."""
    group_a = ordered_groups[0]["standings"]
    group_b = ordered_groups[1]["standings"]

    semifinal_phase = f"{category_prefix} — Półfinał" if category_prefix else "Półfinał"
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    fifth_phase = f"{category_prefix} — o 5. miejsce" if category_prefix else "o 5. miejsce"
    seventh_phase = f"{category_prefix} — o 7. miejsce" if category_prefix else "o 7. miejsce"

    slots = [
        {
            "phase": semifinal_phase,
            "position": 1,
            "player1_name": group_a[0]["name"],
            "player2_name": group_b[1]["name"],
        },
        {
            "phase": semifinal_phase,
            "position": 2,
            "player1_name": group_b[0]["name"],
            "player2_name": group_a[1]["name"],
        },
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
    ]

    if len(group_a) >= 3 and len(group_b) >= 3:
        slots.append(
            {
                "phase": fifth_phase,
                "position": 1,
                "player1_name": group_a[2]["name"],
                "player2_name": group_b[2]["name"],
            }
        )
    if len(group_a) >= 4 and len(group_b) >= 4:
        slots.append(
            {
                "phase": seventh_phase,
                "position": 1,
                "player1_name": group_a[3]["name"],
                "player2_name": group_b[3]["name"],
            }
        )
    return slots


def _build_single_group_final_slots(group_name: str, standings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate a direct final for one completed 3-player group."""
    if len(standings) < 2:
        return []
    final_phase = f"{group_name} — Finał" if group_name else "Finał"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": standings[0]["name"],
            "player2_name": standings[1]["name"],
        }
    ]


def _build_provisional_single_group_final_slots(group_name: str, category_prefix: str) -> List[Dict[str, Any]]:
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_name, category_prefix),
        }
    ]


def _build_provisional_four_player_group_knockout_slots(
    group_name: str,
    category_prefix: str,
) -> List[Dict[str, Any]]:
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_name, category_prefix),
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": _standing_placeholder(3, group_name, category_prefix),
            "player2_name": _standing_placeholder(4, group_name, category_prefix),
        },
    ]


def _build_provisional_knockout_slots_for_category(
    category_prefix: str,
    ordered_groups: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    group_a = ordered_groups[0]
    group_b = ordered_groups[1]
    group_a_name = str(group_a.get("name") or category_prefix)
    group_b_name = str(group_b.get("name") or category_prefix)
    player_count_a = len(group_a.get("standings") or [])
    player_count_b = len(group_b.get("standings") or [])

    semifinal_phase = f"{category_prefix} — Półfinał" if category_prefix else "Półfinał"
    final_phase = f"{category_prefix} — Finał" if category_prefix else "Finał"
    third_phase = f"{category_prefix} — o 3. miejsce" if category_prefix else "o 3. miejsce"
    fifth_phase = f"{category_prefix} — o 5. miejsce" if category_prefix else "o 5. miejsce"
    seventh_phase = f"{category_prefix} — o 7. miejsce" if category_prefix else "o 7. miejsce"

    slots = [
        {
            "phase": semifinal_phase,
            "position": 1,
            "player1_name": _standing_placeholder(1, group_a_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_b_name, category_prefix),
        },
        {
            "phase": semifinal_phase,
            "position": 2,
            "player1_name": _standing_placeholder(1, group_b_name, category_prefix),
            "player2_name": _standing_placeholder(2, group_a_name, category_prefix),
        },
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": None,
            "player2_name": None,
        },
    ]

    if player_count_a >= 3 and player_count_b >= 3:
        slots.append(
            {
                "phase": fifth_phase,
                "position": 1,
                "player1_name": _standing_placeholder(3, group_a_name, category_prefix),
                "player2_name": _standing_placeholder(3, group_b_name, category_prefix),
            }
        )
    if player_count_a >= 4 and player_count_b >= 4:
        slots.append(
            {
                "phase": seventh_phase,
                "position": 1,
                "player1_name": _standing_placeholder(4, group_a_name, category_prefix),
                "player2_name": _standing_placeholder(4, group_b_name, category_prefix),
            }
        )
    return slots


def _compute_provisional_knockout_slots_from_bracket(
    bracket_groups: List[Dict[str, Any]],
    *,
    tournament_id: int,
    group_id_by_name: Dict[str, int],
    player_count_by_name: Dict[str, int],
) -> Dict[str, Any]:
    """Build knockout slots with standing placeholders until group play is finished."""
    buckets: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for group in bracket_groups:
        name = str(group.get("name") or "").strip()
        if not name:
            continue
        buckets.setdefault(_knockout_bucket_key(name), []).append(group)

    slots: List[Dict[str, Any]] = []
    with db_conn() as conn:
        cursor = conn.cursor()
        for (bucket_kind, bucket_name), bucket_groups in buckets.items():
            ordered_groups = sorted(bucket_groups, key=lambda group: _group_sort_key(str(group.get("name") or "")))
            complete = _bucket_groups_play_complete(
                cursor,
                tournament_id,
                ordered_groups,
                group_id_by_name,
                player_count_by_name,
            )
            if bucket_kind == "multi":
                if len(ordered_groups) < 2:
                    continue
                if len(ordered_groups) > 2:
                    return {"error": f"Auto knockout supports exactly 2 groups per category: {bucket_name}"}
                first_group = ordered_groups[0].get("standings") or []
                second_group = ordered_groups[1].get("standings") or []
                if len(first_group) < 2 or len(second_group) < 2:
                    return {"error": f"Category needs at least 2 players per group: {bucket_name}"}
                if complete:
                    slots.extend(_build_knockout_slots_for_category(bucket_name, ordered_groups))
                else:
                    slots.extend(_build_provisional_knockout_slots_for_category(bucket_name, ordered_groups))
                continue

            standings = ordered_groups[0].get("standings") or []
            group_name = str(ordered_groups[0].get("name") or bucket_name)
            player_count = player_count_by_name.get(group_name) or len(standings)
            if player_count >= 4 or len(standings) >= 4:
                top_four = standings[:4] if len(standings) >= 4 else standings
                if complete and len(top_four) >= 4:
                    slots.extend(_build_four_player_group_knockout_slots(bucket_name, top_four))
                else:
                    slots.extend(_build_provisional_four_player_group_knockout_slots(group_name, bucket_name))
            elif player_count == 3 or len(standings) == 3:
                if complete:
                    slots.extend(_build_single_group_final_slots(bucket_name, standings))
                else:
                    slots.extend(_build_provisional_single_group_final_slots(group_name, bucket_name))

    if not slots:
        return {"error": "Need at least one eligible category for knockout generation"}
    return {"status": "ok", "knockout": slots}


def seed_knockout_rematch_for_groups(
    tournament_id: int,
    bracket_group_ids: List[int],
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Backward-compatible alias for group-stage rematch generation."""
    return ensure_group_rematch_schedule_entries(
        tournament_id,
        bracket_group_ids,
        schedule_day=schedule_day,
    )


def ensure_group_rematch_schedule_entries(
    tournament_id: int,
    bracket_group_ids: List[int],
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Add a second round-robin (everyone vs everyone) for selected groups."""
    groups = fetch_bracket_groups(tournament_id)
    group_by_id = {int(group["id"]): group for group in groups if group.get("id")}
    requested = [int(group_id) for group_id in bracket_group_ids if group_id]
    if not requested:
        return {"status": "error", "error": "no_groups_selected"}

    inserted = 0
    skipped: List[Dict[str, Any]] = []
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = (
                str(schedule_day).strip()
                if schedule_day
                else _schedule_day_for_tournament(cursor, tournament_id)
            )
            now = _utc_now()
            cursor.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?",
                (tournament_id,),
            )
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1

            for group_id in requested:
                group = group_by_id.get(group_id)
                if not group:
                    skipped.append({"group_id": group_id, "reason": "not_found"})
                    continue

                cursor.execute(
                    """
                    SELECT id FROM tournament_schedule
                    WHERE tournament_id = ? AND bracket_group_id = ? AND phase = ?
                    LIMIT 1
                    """,
                    (tournament_id, group_id, GROUP_REMATCH_PHASE),
                )
                if cursor.fetchone():
                    skipped.append({"group_id": group_id, "reason": "rematch_exists"})
                    continue

                before_order = next_order
                next_order = _insert_group_round_robin_schedule_entries(
                    cursor,
                    tournament_id,
                    group,
                    phase=GROUP_REMATCH_PHASE,
                    source_type="group_rematch",
                    default_day=default_day,
                    start_order=next_order,
                    now=now,
                )
                inserted += max(next_order - before_order, 0)

            conn.commit()
        return {
            "status": "ok",
            "inserted": inserted,
            "skipped": skipped,
            "schedule": fetch_tournament_schedule(tournament_id),
        }
    except Exception as e:
        logger.error("ensure_group_rematch_schedule_error", error=str(e), tournament_id=tournament_id)
        return {"status": "error", "error": str(e)}


def _build_four_player_group_knockout_slots(group_name: str, standings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate a direct final and 3rd-place match for one 4-player group.

    Semifinals are only used when a category has two groups (A/B); a single group of
    four plays 1st vs 2nd for the title and 3rd vs 4th for bronze.
    """
    if len(standings) < 4:
        return _build_single_group_final_slots(group_name, standings)
    final_phase = f"{group_name} — Finał" if group_name else "Finał"
    third_phase = f"{group_name} — o 3. miejsce" if group_name else "o 3. miejsce"
    return [
        {
            "phase": final_phase,
            "position": 1,
            "player1_name": standings[0]["name"],
            "player2_name": standings[1]["name"],
        },
        {
            "phase": third_phase,
            "position": 1,
            "player1_name": standings[2]["name"],
            "player2_name": standings[3]["name"],
        },
    ]


def _compute_knockout_slots_from_bracket(bracket_groups: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build the expected knockout slots for every eligible category in one tournament."""
    buckets: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for group in bracket_groups:
        name = str(group.get("name") or "").strip()
        if not name:
            continue
        buckets.setdefault(_knockout_bucket_key(name), []).append(group)

    slots: List[Dict[str, Any]] = []
    for (bucket_kind, bucket_name), bucket_groups in buckets.items():
        ordered_groups = sorted(bucket_groups, key=lambda group: _group_sort_key(str(group.get("name") or "")))
        if bucket_kind == "multi":
            if len(ordered_groups) < 2:
                continue
            if len(ordered_groups) > 2:
                return {"error": f"Auto knockout supports exactly 2 groups per category: {bucket_name}"}
            first_group = ordered_groups[0].get("standings") or []
            second_group = ordered_groups[1].get("standings") or []
            if len(first_group) < 2 or len(second_group) < 2:
                return {"error": f"Category needs at least 2 players per group: {bucket_name}"}
            slots.extend(_build_knockout_slots_for_category(bucket_name, ordered_groups))
            continue

        standings = ordered_groups[0].get("standings") or []
        if len(standings) >= 4:
            slots.extend(_build_four_player_group_knockout_slots(bucket_name, standings[:4]))
        elif len(standings) == 3:
            slots.extend(_build_single_group_final_slots(bucket_name, standings))

    if not slots:
        return {"error": "Need at least one eligible category for knockout generation"}
    return {"status": "ok", "knockout": slots}


def seed_provisional_knockout_from_groups(
    tournament_id: int,
    *,
    schedule_day: Optional[str] = None,
) -> Dict[str, Any]:
    """Build or refresh knockout slots with standing placeholders until group play ends."""
    db_groups = fetch_bracket_groups(tournament_id)
    if not db_groups:
        return {"status": "skipped", "reason": "no_groups"}

    group_id_by_name = {str(group.get("name") or ""): int(group["id"]) for group in db_groups if group.get("id")}
    player_count_by_name = {
        str(group.get("name") or ""): len(group.get("players") or [])
        for group in db_groups
    }

    bracket = get_full_bracket(tournament_id)
    if bracket.get("error"):
        return {"status": "error", "error": bracket["error"]}

    generated = _compute_provisional_knockout_slots_from_bracket(
        bracket.get("groups", []),
        tournament_id=tournament_id,
        group_id_by_name=group_id_by_name,
        player_count_by_name=player_count_by_name,
    )
    if generated.get("error"):
        return {"status": "error", **generated}

    slots = generated.get("knockout", [])
    if not slots:
        return {"status": "skipped", "reason": "no_eligible_categories"}

    return _merge_bracket_knockout_slots(
        tournament_id,
        slots,
        schedule_day=schedule_day,
        replace_unfinished_players=True,
    )


def _merge_bracket_knockout_slots(
    tournament_id: int,
    slots: List[Dict[str, Any]],
    *,
    schedule_day: Optional[str] = None,
    replace_unfinished_players: bool = False,
) -> Dict[str, Any]:
    """Insert missing knockout slots and fill placeholder players without overwriting real results."""
    inserted = 0
    updated = 0
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for slot in slots:
                phase = str(slot.get("phase") or "").strip()
                position = int(slot.get("position") or 1)
                if not phase:
                    continue

                cursor.execute(
                    """
                    SELECT id, player1_name, player2_name, winner_name, score_summary
                    FROM bracket_knockout
                    WHERE tournament_id = ? AND phase = ? AND position = ?
                    LIMIT 1
                    """,
                    (tournament_id, phase, position),
                )
                existing = cursor.fetchone()
                if not existing:
                    cursor.execute(
                        """
                        INSERT INTO bracket_knockout (
                            tournament_id, phase, position, player1_name, player2_name, winner_name, score_summary
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            tournament_id,
                            phase,
                            position,
                            slot.get("player1_name"),
                            slot.get("player2_name"),
                            slot.get("winner_name"),
                            slot.get("score_summary"),
                        ),
                    )
                    inserted += 1
                    continue

                assignments: List[str] = []
                values: List[Any] = []
                for field in ("player1_name", "player2_name"):
                    new_value = slot.get(field)
                    current_value = existing[field]
                    can_replace = (
                        replace_unfinished_players
                        and not existing["winner_name"]
                        and new_value is not None
                    )
                    if new_value and (
                        can_replace
                        or not current_value
                        or _is_knockout_placeholder_name(current_value)
                    ):
                        assignments.append(f"{field} = ?")
                        values.append(new_value)
                if slot.get("winner_name") and not existing["winner_name"]:
                    assignments.append("winner_name = ?")
                    values.append(slot.get("winner_name"))
                if slot.get("score_summary") and not existing["score_summary"]:
                    assignments.append("score_summary = ?")
                    values.append(slot.get("score_summary"))
                if assignments:
                    cursor.execute(
                        f"UPDATE bracket_knockout SET {', '.join(assignments)} WHERE id = ?",
                        (*values, existing["id"]),
                    )
                    updated += 1
            conn.commit()
        ensure_knockout_schedule_entries(tournament_id, schedule_day=schedule_day)
        return {"status": "ok", "inserted": inserted, "updated": updated, "knockout": slots}
    except Exception as e:
        logger.error("merge_bracket_knockout_error", error=str(e), tournament_id=tournament_id)
        return {"error": str(e)}


def maybe_generate_knockout_from_completed_groups(tournament_id: int) -> Dict[str, Any]:
    """Generate knockout automatically once all configured group matches are finished."""
    groups = fetch_bracket_groups(tournament_id)
    if not groups:
        return {"status": "skipped", "reason": "no_groups"}

    expected_matches = 0
    finished_matches = 0
    with db_conn() as conn:
        cursor = conn.cursor()
        for group in groups:
            player_count = len(group.get("players", []))
            if player_count < 2:
                continue
            group_id = int(group["id"])
            expected_matches += _expected_group_matches_count(cursor, tournament_id, group_id, player_count)
            finished_matches += _count_finished_group_matches(cursor, tournament_id, group_id)

    if expected_matches == 0:
        return {"status": "skipped", "reason": "no_group_matches_expected"}
    if finished_matches < expected_matches:
        return {
            "status": "pending",
            "reason": "group_stage_incomplete",
            "finished_matches": finished_matches,
            "expected_matches": expected_matches,
        }

    bracket = get_full_bracket(tournament_id)
    groups_data = bracket.get("groups", [])
    generated = _compute_knockout_slots_from_bracket(groups_data)
    if generated.get("error"):
        return generated

    merged = _merge_bracket_knockout_slots(tournament_id, generated.get("knockout", []))
    if merged.get("error"):
        return merged
    if not merged.get("inserted") and not merged.get("updated"):
        return {"status": "skipped", "reason": "knockout_already_configured"}
    return merged


def advance_knockout(match_id: int, tournament_id: int) -> bool:
    """After a knockout match finishes, find the matching slot, persist the result,
    and auto-advance winners to the next round (SF→Final/3rd place)."""
    try:
        from .db_models import Match as MatchModel
        from .db_models import db
        match = db.session.get(MatchModel, match_id)
        if not match or match.status != "finished":
            return False

        p1 = match.player1_name
        p2 = match.player2_name
        winner = match.winner_name or (p1 if match.player1_sets > match.player2_sets else p2)

        sets_history = json.loads(match.sets_history) if match.sets_history else []
        score_parts = []
        for s in sets_history:
            g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
            if g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None:
                continue
            score_parts.append(f"{g1}:{g2}")
        score_summary = " ".join(score_parts)

        with db_conn() as conn:
            cursor = conn.cursor()
            # Find the knockout slot matching these two players
            cursor.execute("""
                SELECT id, phase, position FROM bracket_knockout
                WHERE tournament_id = ?
                  AND ((player1_name = ? AND player2_name = ?)
                    OR (player1_name = ? AND player2_name = ?))
                  AND winner_name IS NULL
            """, (tournament_id, p1, p2, p2, p1))
            slot = cursor.fetchone()
            if not slot:
                return False

            # Update the slot with winner and score
            cursor.execute("""
                UPDATE bracket_knockout
                SET winner_name = ?, score_summary = ?, finish_reason = ?, result_note = ?
                WHERE id = ?
            """, (winner, score_summary, match.finish_reason or 'normal', match.result_note, slot["id"]))

            loser = p2 if winner == p1 else p1

            # Auto-advance: if semifinal, populate final and 3rd place
            if _phase_kind(slot["phase"]) == "semifinal":
                _advance_to_next_round(cursor, tournament_id, slot["phase"], slot["position"], winner, loser)

            conn.commit()
            ensure_knockout_schedule_entries(tournament_id)
            logger.info("knockout_advanced", match_id=match_id, winner=winner, phase=slot["phase"])
            return True

    except Exception as e:
        logger.error("advance_knockout_error", error=str(e), match_id=match_id)
        return False


def _advance_to_next_round(cursor, tournament_id: int, semifinal_phase: str, sf_position: int, winner: str, loser: str) -> None:
    """Fill in final/3rd-place slots based on semifinal results."""
    category_prefix, _ = _split_bracket_label(semifinal_phase)
    cursor.execute(
        "SELECT id, phase, position, player1_name, player2_name FROM bracket_knockout WHERE tournament_id = ?",
        (tournament_id,),
    )
    slots = cursor.fetchall()
    final_slot = next(
        (slot for slot in slots if _slot_phase_matches(slot["phase"], "final", category_prefix)),
        None,
    )
    third_slot = next(
        (slot for slot in slots if _slot_phase_matches(slot["phase"], "third_place", category_prefix)),
        None,
    )
    target_side = 1 if int(sf_position) == 1 else 2
    if final_slot:
        _assign_knockout_slot_player(cursor, final_slot, target_side, winner)
    if third_slot:
        _assign_knockout_slot_player(cursor, third_slot, target_side, loser)


def insert_match_history(entry: Dict[str, Any]) -> None:
    """Insert a match history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            values = (
                entry.get("kort_id"),
                entry.get("ended_ts"),
                entry.get("duration_seconds", 0),
                entry.get("player_a"),
                entry.get("player_b"),
                json.dumps(entry.get("score_a", [])),
                json.dumps(entry.get("score_b", [])),
                entry.get("category"),
                entry.get("phase", "Grupowa"),
                entry.get("match_id"),
                entry.get("stats_mode"),
                json.dumps(entry.get("sets_history")) if entry.get("sets_history") else None,
                entry.get("tournament_id"),
                entry.get("finish_reason", "normal"),
                entry.get("winner_name"),
                entry.get("injured_player_name"),
                entry.get("result_note"),
            )
            existing_id = None
            if entry.get("match_id"):
                cursor.execute(
                    "SELECT id FROM match_history WHERE match_id = ? LIMIT 1",
                    (entry.get("match_id"),),
                )
                existing = cursor.fetchone()
                existing_id = existing["id"] if existing else None
            if existing_id:
                cursor.execute("""
                    UPDATE match_history
                    SET kort_id = ?, ended_ts = ?, duration_seconds = ?,
                        player_a = ?, player_b = ?, score_a = ?, score_b = ?,
                        category = ?, phase = ?, match_id = ?, stats_mode = ?, sets_history = ?,
                        tournament_id = ?, finish_reason = ?, winner_name = ?,
                        injured_player_name = ?, result_note = ?
                    WHERE id = ?
                """, (*values, existing_id))
            else:
                cursor.execute("""
                    INSERT INTO match_history (
                        kort_id, ended_ts, duration_seconds,
                        player_a, player_b, score_a, score_b,
                        category, phase, match_id, stats_mode, sets_history,
                        tournament_id, finish_reason, winner_name, injured_player_name, result_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, values)
            conn.commit()
        logger.info("match_history_inserted", kort_id=entry.get("kort_id"))
    except Exception as e:
        logger.error("insert_match_history_error", error=str(e), entry=entry)


def delete_latest_history_entry() -> Optional[Dict]:
    """Delete the most recent history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            
            # Get latest entry
            cursor.execute("""
                SELECT * FROM match_history
                ORDER BY id DESC
                LIMIT 1
            """)
            row = cursor.fetchone()
            
            if not row:
                return None
            
            deleted = dict(row)
            
            # Delete it
            cursor.execute("DELETE FROM match_history WHERE id = ?", (row["id"],))
            conn.commit()
            
        logger.info("history_entry_deleted", id=deleted["id"])
        return deleted
    except Exception as e:
        logger.error("delete_history_entry_error", error=str(e))
        return None


def fetch_courts(active_only: bool = False, public_only: bool = False) -> List[Dict[str, Optional[str]]]:
    """Fetch courts from database, optionally limited to active tournaments."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            query = """
                SELECT
                    c.kort_id,
                    c.pin,
                    c.name,
                    c.tournament_id,
                    c.display_order,
                    c.active,
                    t.name AS tournament_name
                FROM courts c
                LEFT JOIN tournaments t ON t.id = c.tournament_id
            """
            conditions = []
            if active_only:
                conditions.append("COALESCE(t.active, 0) = 1")
            if public_only:
                conditions.append("COALESCE(t.is_public, 1) = 1")
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            query += " ORDER BY COALESCE(c.tournament_id, 0), c.display_order, c.kort_id"
            cursor.execute(query)
            rows = cursor.fetchall()
        
        courts = [
            {
                "kort_id": row["kort_id"],
                "pin": row["pin"],
                "name": row["name"],
                "tournament_id": row["tournament_id"],
                "display_order": row["display_order"],
                "active": row["active"],
                "tournament_name": row["tournament_name"],
            }
            for row in rows
        ]
        logger.debug("courts_fetched", count=len(courts), active_only=active_only, public_only=public_only)
        return courts
    except Exception as e:
        logger.error("fetch_courts_error", error=str(e))
        return []


def fetch_courts_for_tournament(tournament_id: int) -> List[Dict[str, Optional[str]]]:
    """Fetch courts assigned to a specific tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT kort_id, pin, name, tournament_id, display_order, active
                FROM courts
                WHERE tournament_id = ?
                ORDER BY display_order, kort_id
            """, (tournament_id,))
            return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_courts_for_tournament_error", error=str(e), tournament_id=tournament_id)
        return []


def fetch_court(kort_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single court by ID."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT c.kort_id, c.pin, c.name, c.tournament_id, c.display_order, c.active,
                       t.name AS tournament_name
                FROM courts c
                LEFT JOIN tournaments t ON t.id = c.tournament_id
                WHERE c.kort_id = ?
                LIMIT 1
            """, (kort_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error("fetch_court_error", error=str(e), kort_id=kort_id)
        return None


def get_tournament_id_for_court(kort_id: str) -> Optional[int]:
    """Resolve tournament ID from a court ID."""
    court = fetch_court(kort_id)
    if not court:
        return None
    return court.get("tournament_id")


def insert_court(
    kort_id: str,
    pin: Optional[str] = None,
    tournament_id: Optional[int] = None,
    name: Optional[str] = None,
    display_order: Optional[int] = None,
) -> None:
    """Insert a new court."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR IGNORE INTO courts (kort_id, pin, name, tournament_id, display_order, active)
                VALUES (?, ?, ?, ?, ?, 1)
            """, (
                kort_id,
                pin,
                name or kort_id,
                tournament_id,
                display_order if display_order is not None else 0,
            ))
            conn.commit()
        logger.info("court_inserted", kort_id=kort_id)
    except Exception as e:
        logger.error("insert_court_error", kort_id=kort_id, error=str(e))


def upsert_court(
    kort_id: str,
    pin: Optional[str] = None,
    tournament_id: Optional[int] = None,
    name: Optional[str] = None,
    display_order: Optional[int] = None,
) -> None:
    """Insert or update court configuration."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO courts (kort_id, pin, name, tournament_id, display_order, active)
                VALUES (?, ?, ?, ?, ?, 1)
                ON CONFLICT(kort_id) DO UPDATE SET
                    pin=COALESCE(excluded.pin, courts.pin),
                    name=COALESCE(excluded.name, courts.name),
                    tournament_id=COALESCE(excluded.tournament_id, courts.tournament_id),
                    display_order=COALESCE(excluded.display_order, courts.display_order)
            """, (
                kort_id,
                pin,
                name or kort_id,
                tournament_id,
                display_order,
            ))
            conn.commit()
        logger.info("court_upserted", kort_id=kort_id, pin=pin, tournament_id=tournament_id)
    except Exception as e:
        logger.error("upsert_court_error", kort_id=kort_id, error=str(e))


def delete_court(kort_id: str) -> bool:
    """Delete a court from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM courts WHERE kort_id = ?", (kort_id,))
            conn.commit()
            deleted = cursor.rowcount > 0
        if deleted:
            logger.info("court_deleted", kort_id=kort_id)
        return deleted
    except Exception as e:
        logger.error("delete_court_error", kort_id=kort_id, error=str(e))
        return False


def rename_court(old_kort_id: str, new_kort_id: str) -> bool:
    """Rename a court (change kort_id)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Check if new ID already exists
            cursor.execute("SELECT 1 FROM courts WHERE kort_id = ?", (new_kort_id,))
            if cursor.fetchone():
                logger.warning("rename_court_conflict", old_kort_id=old_kort_id, new_kort_id=new_kort_id)
                return False
            cursor.execute("UPDATE courts SET kort_id = ? WHERE kort_id = ?", (new_kort_id, old_kort_id))
            conn.commit()
            renamed = cursor.rowcount > 0
        if renamed:
            logger.info("court_renamed", old_kort_id=old_kort_id, new_kort_id=new_kort_id)
        return renamed
    except Exception as e:
        logger.error("rename_court_error", old_kort_id=old_kort_id, new_kort_id=new_kort_id, error=str(e))
        return False


def fetch_app_settings(keys: List[str]) -> Dict[str, Any]:
    """Fetch app settings from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            
            if keys:
                placeholders = ",".join("?" for _ in keys)
                cursor.execute(f"SELECT key, value FROM app_settings WHERE key IN ({placeholders})", keys)
            else:
                cursor.execute("SELECT key, value FROM app_settings")
            
            rows = cursor.fetchall()
        
        settings_dict = {row["key"]: row["value"] for row in rows}
        
        # Fill in None for missing keys
        if keys:
            for key in keys:
                settings_dict.setdefault(key, None)
        
        return settings_dict
    except Exception as e:
        logger.error("fetch_app_settings_error", error=str(e))
        return {}


def upsert_app_settings(settings_dict: Dict[str, str]) -> None:
    """Insert or update app settings."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for key, value in settings_dict.items():
                if value is None:
                    cursor.execute("DELETE FROM app_settings WHERE key = ?", (key,))
                else:
                    cursor.execute("""
                        INSERT INTO app_settings (key, value)
                        VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """, (key, value))
            conn.commit()
        logger.info("app_settings_upserted", count=len(settings_dict))
    except Exception as e:
        logger.error("upsert_app_settings_error", error=str(e))


def fetch_match_history(
    limit: int = 100,
    tournament_id: Optional[int] = None,
    public_only: bool = False,
    stats_enabled_only: bool = False,
) -> List[Dict]:
    """Fetch match history from database, enriched with full names."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            conditions = []
            params: List[Any] = []
            if tournament_id is not None:
                conditions.append("mh.tournament_id = ?")
                params.append(tournament_id)
            if public_only:
                conditions.append("(mh.tournament_id IS NULL OR COALESCE(t.is_public, 1) = 1)")
            if stats_enabled_only:
                conditions.append("(mh.tournament_id IS NULL OR COALESCE(t.stats_enabled, 1) = 1)")

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            cursor.execute(f"""
                SELECT mh.* FROM match_history mh
                LEFT JOIN tournaments t ON t.id = mh.tournament_id
                {where_clause}
                ORDER BY mh.ended_ts DESC
                LIMIT ?
            """, (*params, limit))
            rows = cursor.fetchall()
            
            # Detect available columns
            col_names = [desc[0] for desc in cursor.description] if cursor.description else []

            # Build lookup: match_id -> (player1_name, player2_name, created_at)
            match_ids = [r["match_id"] for r in rows if "match_id" in col_names and r["match_id"]]
            match_lookup: Dict[int, Dict] = {}
            duration_lookup: Dict[int, int] = {}
            if match_ids:
                placeholders = ",".join("?" for _ in match_ids)
                cursor.execute(
                    f"SELECT id, player1_name, player2_name, created_at FROM matches WHERE id IN ({placeholders})",
                    match_ids,
                )
                for mr in cursor.fetchall():
                    match_lookup[mr["id"]] = {
                        "p1": mr["player1_name"],
                        "p2": mr["player2_name"],
                        "started_at": mr["created_at"],
                    }
                # Fetch duration from match_statistics for entries with duration=0
                cursor.execute(
                    f"SELECT match_id, match_duration_ms FROM match_statistics WHERE match_id IN ({placeholders})",
                    match_ids,
                )
                for sr in cursor.fetchall():
                    if sr["match_duration_ms"]:
                        duration_lookup[sr["match_id"]] = sr["match_duration_ms"] // 1000

            # Build lookup: last_name -> full_name from players table
            cursor.execute("SELECT first_name, last_name, name FROM players")
            player_name_map: Dict[str, str] = {}
            for pr in cursor.fetchall():
                fn = (pr["first_name"] or "").strip()
                ln = (pr["last_name"] or "").strip()
                full = f"{fn} {ln}".strip() if fn else (pr["name"] or ln)
                if ln:
                    player_name_map[ln] = full

            cursor.execute("""
                SELECT c.kort_id, c.name, t.name AS tournament_name
                FROM courts c
                LEFT JOIN tournaments t ON t.id = c.tournament_id
            """)
            court_lookup = {
                row["kort_id"]: {
                    "court_name": row["name"] or row["kort_id"],
                    "tournament_name": row["tournament_name"],
                }
                for row in cursor.fetchall()
            }

            result = []
            for row in rows:
                entry = {
                    "id": row["id"],
                    "kort_id": row["kort_id"],
                    "ended_ts": row["ended_ts"],
                    "duration_seconds": row["duration_seconds"],
                    "player_a": row["player_a"],
                    "player_b": row["player_b"],
                    "category": row["category"] if "category" in col_names else None,
                    "phase": row["phase"] if "phase" in col_names else "Grupowa",
                    "finish_reason": row["finish_reason"] if "finish_reason" in col_names else "normal",
                    "winner_name": row["winner_name"] if "winner_name" in col_names else None,
                    "injured_player_name": row["injured_player_name"] if "injured_player_name" in col_names else None,
                    "result_note": row["result_note"] if "result_note" in col_names else None,
                }
                
                # Read scores - prefer score_a/score_b JSON, fall back to old per-set columns
                if "score_a" in col_names and row["score_a"]:
                    entry["score_a"] = json.loads(row["score_a"])
                    entry["score_b"] = json.loads(row["score_b"]) if row["score_b"] else []
                elif "set1_a" in col_names:
                    entry["score_a"] = [row["set1_a"] or 0, row["set2_a"] or 0, row["tie_a"] or 0]
                    entry["score_b"] = [row["set1_b"] or 0, row["set2_b"] or 0, row["tie_b"] or 0]
                else:
                    entry["score_a"] = []
                    entry["score_b"] = []
                
                # Optional columns
                mid = row["match_id"] if "match_id" in col_names else None
                entry["match_id"] = mid
                entry["stats_mode"] = row["stats_mode"] if "stats_mode" in col_names else None
                
                # Sets history with tiebreak scores
                if "sets_history" in col_names and row["sets_history"]:
                    entry["sets_history"] = json.loads(row["sets_history"])
                else:
                    entry["sets_history"] = None

                # Enrich names — always resolve through player DB
                # Start with best available raw name, then resolve
                ml = match_lookup.get(mid) if mid else None
                raw_a = entry["player_a"]
                raw_b = entry["player_b"]
                if ml:
                    raw_a = ml["p1"] or raw_a
                    raw_b = ml["p2"] or raw_b
                    entry["started_at"] = ml["started_at"]
                else:
                    entry["started_at"] = None
                entry["player_a"] = _resolve_name(raw_a, player_name_map)
                entry["player_b"] = _resolve_name(raw_b, player_name_map)

                # Fallback duration from match_statistics
                if not entry["duration_seconds"] and mid and mid in duration_lookup:
                    entry["duration_seconds"] = duration_lookup[mid]

                court_meta = court_lookup.get(entry["kort_id"], {})
                entry["court_name"] = court_meta.get("court_name")
                entry["tournament_name"] = court_meta.get("tournament_name")

                result.append(entry)
            return result
    except Exception as e:
        logger.error("fetch_match_history_error", error=str(e))
        return []


def _resolve_name(raw: Optional[str], lookup: Dict[str, str]) -> str:
    """Try to resolve a surname or 'X / Y' doubles pair to full names."""
    if not raw or raw == "-":
        return raw or "-"
    # Doubles format: "Surname1 / Surname2"
    if " / " in raw:
        parts = [lookup.get(p.strip(), p.strip()) for p in raw.split(" / ")]
        return " / ".join(parts)
    return lookup.get(raw.strip(), raw)


# ==================== TOURNAMENTS ====================

def get_active_tournament_id(public_only: bool = False) -> Optional[int]:
    """Get the ID of the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            query = "SELECT id FROM tournaments WHERE active = 1"
            if public_only:
                query += " AND COALESCE(is_public, 1) = 1"
            query += " LIMIT 1"
            cursor.execute(query)
            row = cursor.fetchone()
            return row["id"] if row else None
    except Exception as e:
        logger.error("get_active_tournament_id_error", error=str(e))
        return None


def get_active_tournament_name(public_only: bool = False) -> Optional[str]:
    """Get the name of the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            query = "SELECT name FROM tournaments WHERE active = 1"
            if public_only:
                query += " AND COALESCE(is_public, 1) = 1"
            query += " LIMIT 1"
            cursor.execute(query)
            row = cursor.fetchone()
            return row["name"] if row else None
    except Exception as e:
        logger.error("get_active_tournament_name_error", error=str(e))
        return None


def fetch_active_tournaments(public_only: bool = False) -> List[Dict]:
    """Fetch all active tournaments."""
    try:
        return [t for t in fetch_tournaments(public_only=public_only) if t.get("active") == 1]
    except Exception as e:
        logger.error("fetch_active_tournaments_error", error=str(e))
        return []


def fetch_tournaments(public_only: bool = False) -> List[Dict]:
    """Fetch all tournaments."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            where_clause = "WHERE COALESCE(t.is_public, 1) = 1" if public_only else ""
            cursor.execute("""
                SELECT
                    t.id,
                    t.name,
                    t.start_date,
                    t.end_date,
                    t.active,
                    t.location,
                    t.city,
                    t.country,
                    t.logo_path,
                    t.report_email,
                    t.summary_sent_at,
                    COALESCE(t.is_public, 1) AS is_public,
                    COALESCE(t.stats_enabled, 1) AS stats_enabled,
                    COALESCE(t.is_simulation, 0) AS is_simulation,
                    COALESCE(t.access_key, '') AS access_key,
                    CASE WHEN COALESCE(t.office_password_hash, '') != '' THEN 1 ELSE 0 END AS has_office_password,
                    t.created_at,
                    COUNT(c.kort_id) AS court_count
                FROM tournaments t
                LEFT JOIN courts c ON c.tournament_id = t.id
                {where_clause}
                GROUP BY t.id, t.name, t.start_date, t.end_date, t.active, t.location, t.city, t.country,
                         t.logo_path, t.report_email, t.summary_sent_at, t.is_public, t.stats_enabled,
                         t.is_simulation, t.access_key, t.office_password_hash, t.created_at
                ORDER BY start_date DESC
            """.format(where_clause=where_clause))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_tournaments_error", error=str(e))
        return []


def fetch_tournament(tournament_id: int) -> Optional[Dict]:
    """Fetch a single tournament by ID."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    t.id,
                    t.name,
                    t.start_date,
                    t.end_date,
                    t.active,
                    t.location,
                    t.city,
                    t.country,
                    t.logo_path,
                    t.report_email,
                    t.summary_sent_at,
                    COALESCE(t.is_public, 1) AS is_public,
                    COALESCE(t.stats_enabled, 1) AS stats_enabled,
                    COALESCE(t.is_simulation, 0) AS is_simulation,
                    COALESCE(t.access_key, '') AS access_key,
                    CASE WHEN COALESCE(t.office_password_hash, '') != '' THEN 1 ELSE 0 END AS has_office_password,
                    t.created_at,
                    COUNT(c.kort_id) AS court_count
                FROM tournaments t
                LEFT JOIN courts c ON c.tournament_id = t.id
                WHERE t.id = ?
                GROUP BY t.id, t.name, t.start_date, t.end_date, t.active, t.location, t.city, t.country,
                        t.logo_path, t.report_email, t.summary_sent_at, t.is_public, t.stats_enabled,
                        t.is_simulation, t.access_key, t.office_password_hash, t.created_at
            """, (tournament_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error("fetch_tournament_error", error=str(e), tournament_id=tournament_id)
        return None


def insert_tournament(
    name: str,
    start_date: str,
    end_date: str,
    active: bool = False,
    city: str = "",
    country: str = "",
    logo_path: Optional[str] = None,
    report_email: str = "",
    is_public: bool = True,
    stats_enabled: bool = True,
    is_simulation: bool = False,
    access_key: str = "",
    office_password_hash: str = "",
) -> Optional[int]:
    """Insert a new tournament."""
    try:
        if is_simulation:
            is_public = False
            stats_enabled = False
        office_password_hash = _default_simulation_office_password_hash(is_simulation, office_password_hash)
        location = ", ".join(part for part in [city.strip(), country.strip()] if part.strip())
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tournaments (
                    name, start_date, end_date, active, location, city, country, logo_path, report_email,
                    is_public, stats_enabled, is_simulation, access_key, office_password_hash
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                name,
                start_date,
                end_date,
                1 if active else 0,
                location,
                city.strip(),
                country.strip().upper(),
                logo_path,
                report_email.strip(),
                1 if is_public else 0,
                1 if stats_enabled else 0,
                1 if is_simulation else 0,
                access_key.strip(),
                office_password_hash,
            ))
            conn.commit()
            logger.info("tournament_inserted", id=cursor.lastrowid, name=name)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_tournament_error", error=str(e))
        return None


def update_tournament(
    tournament_id: int,
    name: str,
    start_date: str,
    end_date: str,
    active: bool,
    city: str = "",
    country: str = "",
    logo_path: Optional[str] = None,
    report_email: str = "",
    is_public: bool = True,
    stats_enabled: bool = True,
    is_simulation: bool = False,
    access_key: str = "",
    office_password_hash: str = "",
) -> bool:
    """Update a tournament."""
    try:
        if is_simulation:
            is_public = False
            stats_enabled = False
        office_password_hash = _default_simulation_office_password_hash(is_simulation, office_password_hash)
        location = ", ".join(part for part in [city.strip(), country.strip()] if part.strip())
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tournaments
                SET name = ?, start_date = ?, end_date = ?, active = ?, location = ?, city = ?, country = ?,
                    logo_path = ?, report_email = ?, is_public = ?, stats_enabled = ?, is_simulation = ?,
                    access_key = ?, office_password_hash = ?
                WHERE id = ?
            """, (
                name,
                start_date,
                end_date,
                1 if active else 0,
                location,
                city.strip(),
                country.strip().upper(),
                logo_path,
                report_email.strip(),
                1 if is_public else 0,
                1 if stats_enabled else 0,
                1 if is_simulation else 0,
                access_key.strip(),
                office_password_hash,
                tournament_id,
            ))
            conn.commit()
            logger.info("tournament_updated", id=tournament_id)
            return True
    except Exception as e:
        logger.error("update_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def create_tournament_courts(tournament_id: int, court_count: int) -> List[str]:
    """Create tournament courts with unique IDs and human-friendly names."""
    created_courts: List[str] = []
    total = max(0, int(court_count or 0))
    if total <= 0:
        return created_courts

    existing_ids = {
        str(court.get("kort_id") or "")
        for court in fetch_courts_for_tournament(tournament_id)
    }

    for index in range(1, total + 1):
        kort_id = f"t{tournament_id}-{index}"
        if kort_id in existing_ids:
            continue
        upsert_court(
            kort_id=kort_id,
            pin="0000",
            name=str(index),
            tournament_id=tournament_id,
            display_order=index,
        )
        created_courts.append(kort_id)
    return created_courts


def sync_tournament_courts(tournament_id: int, court_count: int) -> Dict[str, List[str]]:
    """Adjust tournament courts to the requested count.

    Adds missing trailing courts or removes trailing inactive ones.
    Courts with active matches must be handled by the caller before removal.
    """
    requested_total = max(0, int(court_count or 0))
    existing_courts = fetch_courts_for_tournament(tournament_id)
    existing_total = len(existing_courts)

    if requested_total == existing_total:
        return {"created": [], "deleted": []}

    if requested_total > existing_total:
        created = create_tournament_courts(tournament_id, requested_total)
        created = created[existing_total:]
        return {"created": created, "deleted": []}

    courts_to_delete = sorted(
        existing_courts,
        key=lambda court: (int(court.get("display_order") or 0), str(court.get("kort_id") or "")),
        reverse=True,
    )[: existing_total - requested_total]

    deleted_ids: List[str] = []
    for court in courts_to_delete:
        kort_id = str(court.get("kort_id") or "")
        if not kort_id:
            continue
        if delete_court(kort_id):
            deleted_ids.append(kort_id)

    return {"created": [], "deleted": deleted_ids}


def mark_tournament_summary_sent(tournament_id: int, sent_at: Optional[str] = None) -> bool:
    """Persist the timestamp of a sent tournament summary email."""
    from datetime import datetime, timezone

    try:
        value = sent_at or datetime.now(timezone.utc).isoformat()
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE tournaments SET summary_sent_at = ? WHERE id = ?",
                (value, tournament_id),
            )
            conn.commit()
        logger.info("tournament_summary_marked", tournament_id=tournament_id, sent_at=value)
        return True
    except Exception as e:
        logger.error("mark_tournament_summary_sent_error", error=str(e), tournament_id=tournament_id)
        return False


def delete_tournament(tournament_id: int) -> bool:
    """Delete a tournament and all data owned by it."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM tournaments WHERE id = ?", (tournament_id,))
            if not cursor.fetchone():
                return False

            cursor.execute("SELECT id FROM matches WHERE tournament_id = ?", (tournament_id,))
            match_ids = [row["id"] for row in cursor.fetchall()]
            if match_ids:
                placeholders = ",".join("?" for _ in match_ids)
                cursor.execute(f"DELETE FROM match_statistics WHERE match_id IN ({placeholders})", match_ids)
                cursor.execute(
                    f"DELETE FROM match_history WHERE tournament_id = ? OR match_id IN ({placeholders})",
                    [tournament_id, *match_ids],
                )
            else:
                cursor.execute("DELETE FROM match_history WHERE tournament_id = ?", (tournament_id,))

            cursor.execute("DELETE FROM matches WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM tournament_schedule WHERE tournament_id = ?", (tournament_id,))
            cursor.execute(
                "DELETE FROM bracket_group_players WHERE group_id IN "
                "(SELECT id FROM bracket_groups WHERE tournament_id = ?)",
                (tournament_id,),
            )
            cursor.execute("DELETE FROM bracket_groups WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM bracket_knockout WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM players WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM courts WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("tournament_deleted", id=tournament_id)
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def set_active_tournament(tournament_id: int) -> bool:
    """Mark a tournament as active without deactivating others."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE tournaments SET active = 1 WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("active_tournament_set", id=tournament_id)
            return True
    except Exception as e:
        logger.error("set_active_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def set_tournament_active_state(tournament_id: int, active: bool) -> bool:
    """Set active state for a single tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE tournaments SET active = ? WHERE id = ?",
                (1 if active else 0, tournament_id),
            )
            conn.commit()
            logger.info("tournament_active_state_set", id=tournament_id, active=active)
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("set_tournament_active_state_error", error=str(e), tournament_id=tournament_id, active=active)
        return False


# ==================== PLAYERS ====================

def fetch_players(tournament_id: Optional[int] = None) -> List[Dict]:
    """Fetch players, optionally filtered by tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if tournament_id:
                cursor.execute("""
                    SELECT id, tournament_id, name, first_name, last_name, category, country, gender, global_player_id, created_at
                    FROM players
                    WHERE tournament_id = ?
                    ORDER BY last_name, first_name
                """, (tournament_id,))
            else:
                cursor.execute("""
                    SELECT id, tournament_id, name, first_name, last_name, category, country, gender, global_player_id, created_at
                    FROM players
                    ORDER BY tournament_id DESC, last_name, first_name
                """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_players_error", error=str(e))
        return []


def fetch_active_tournament_players() -> List[Dict]:
    """Fetch players from the currently active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.id, p.tournament_id, p.name, p.first_name, p.last_name,
                       p.category, p.country, p.gender, p.global_player_id, p.created_at
                FROM players p
                INNER JOIN tournaments t ON p.tournament_id = t.id
                WHERE t.active = 1
                ORDER BY p.last_name, p.first_name
            """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_active_tournament_players_error", error=str(e))
        return []


def fetch_players_for_active_tournaments(public_only: bool = False) -> List[Dict]:
    """Fetch players belonging to any active tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            public_clause = "AND COALESCE(t.is_public, 1) = 1" if public_only else ""
            cursor.execute(f"""
                SELECT p.id, p.tournament_id, p.name, p.first_name, p.last_name,
                       p.category, p.country, p.gender, p.global_player_id, p.created_at
                FROM players p
                INNER JOIN tournaments t ON p.tournament_id = t.id
                WHERE t.active = 1
                {public_clause}
                ORDER BY t.start_date DESC, p.last_name, p.first_name
            """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_players_for_active_tournaments_error", error=str(e))
        return []


def _tournament_links_global_players(cursor: sqlite3.Cursor, tournament_id: int) -> bool:
    """Simulation tournaments keep players local to the event only."""
    cursor.execute(
        "SELECT COALESCE(is_simulation, 0) AS is_simulation FROM tournaments WHERE id = ?",
        (tournament_id,),
    )
    row = cursor.fetchone()
    if not row:
        return True
    return int(row["is_simulation"] or 0) == 0


def _ensure_global_player(cursor: sqlite3.Cursor, first_name: str, last_name: str,
                          category: str = "", country: str = "", gender: str = "") -> Optional[int]:
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    if not first_name and not last_name:
        return None

    cursor.execute(
        """
        SELECT id FROM global_players
        WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
          AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
        LIMIT 1
        """,
        (first_name, last_name),
    )
    row = cursor.fetchone()
    if row:
        global_player_id = row["id"]
        cursor.execute(
            """
            UPDATE global_players
            SET gender = CASE WHEN COALESCE(TRIM(gender), '') = '' THEN ? ELSE gender END,
                country = CASE WHEN COALESCE(TRIM(country), '') = '' THEN ? ELSE country END,
                category = CASE WHEN COALESCE(TRIM(category), '') = '' THEN ? ELSE category END
            WHERE id = ?
            """,
            ((gender or "").strip(), (country or "").strip(), (category or "").strip(), global_player_id),
        )
        return global_player_id

    cursor.execute(
        """
        INSERT INTO global_players (first_name, last_name, gender, country, category)
        VALUES (?, ?, ?, ?, ?)
        """,
        (first_name, last_name, (gender or "").strip(), (country or "").strip(), (category or "").strip()),
    )
    return cursor.lastrowid


def insert_player(tournament_id: int, name: str, category: str = "", country: str = "",
                  first_name: str = "", last_name: str = "", gender: str = "") -> Optional[int]:
    """Insert a new player."""
    # If first_name/last_name not provided, split from name
    if not first_name and not last_name and name:
        parts = name.strip().rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name.strip()
    # Ensure name is set (for backward compat)
    if not name:
        name = f"{first_name} {last_name}".strip()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            global_player_id = None
            if _tournament_links_global_players(cursor, tournament_id):
                global_player_id = _ensure_global_player(
                    cursor, first_name, last_name, category, country, gender
                )
            cursor.execute("""
                INSERT INTO players (tournament_id, name, first_name, last_name, category, country, gender, global_player_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (tournament_id, name, first_name, last_name, category, country, gender, global_player_id))
            conn.commit()
            logger.info("player_inserted", id=cursor.lastrowid, name=name, tournament_id=tournament_id)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_player_error", error=str(e))
        return None


def _sync_player_name_across_tournament(
    tournament_id: int,
    old_name: str,
    new_name: str,
    player_id: int,
) -> None:
    if not old_name or not new_name or old_name == new_name:
        return
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE bracket_group_players
                SET player_name = ?
                WHERE group_id IN (SELECT id FROM bracket_groups WHERE tournament_id = ?)
                  AND (player_id = ? OR player_name = ?)
                """,
                (new_name, tournament_id, player_id, old_name),
            )
            for column in ("player1_name", "player2_name"):
                cursor.execute(
                    f"""
                    UPDATE tournament_schedule
                    SET {column} = ?
                    WHERE tournament_id = ? AND {column} = ?
                    """,
                    (new_name, tournament_id, old_name),
                )
            conn.commit()
    except Exception as e:
        logger.error(
            "sync_player_name_error",
            error=str(e),
            tournament_id=tournament_id,
            player_id=player_id,
        )


def update_player(player_id: int, name: str, category: str, country: str,
                  first_name: str = "", last_name: str = "", gender: str = "",
                  tournament_id: Optional[int] = None) -> bool:
    """Update a player."""
    # If first_name/last_name not provided, split from name
    if not first_name and not last_name and name:
        parts = name.strip().rsplit(' ', 1)
        if len(parts) == 2:
            first_name, last_name = parts[0], parts[1]
        else:
            first_name, last_name = '', name.strip()
    if not name:
        name = f"{first_name} {last_name}".strip()
    old_name = ""
    scoped_tournament_id = tournament_id
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if scoped_tournament_id is None:
                cursor.execute("SELECT tournament_id, name FROM players WHERE id = ?", (player_id,))
                row = cursor.fetchone()
                scoped_tournament_id = row["tournament_id"] if row else None
                old_name = str(row["name"] if row else "")
            else:
                cursor.execute(
                    "SELECT name FROM players WHERE id = ? AND tournament_id = ?",
                    (player_id, scoped_tournament_id),
                )
                row = cursor.fetchone()
                old_name = str(row["name"] if row else "")
            global_player_id = None
            if scoped_tournament_id is None or _tournament_links_global_players(cursor, scoped_tournament_id):
                global_player_id = _ensure_global_player(
                    cursor, first_name, last_name, category, country, gender
                )
            cursor.execute("""
                UPDATE players
                SET name = ?, first_name = ?, last_name = ?, category = ?, country = ?, gender = ?, global_player_id = ?
                WHERE id = ? AND (? IS NULL OR tournament_id = ?)
            """, (name, first_name, last_name, category, country, gender, global_player_id, player_id, tournament_id, tournament_id))
            conn.commit()
            updated = cursor.rowcount > 0
            logger.info("player_updated", id=player_id)
        if updated and scoped_tournament_id:
            _sync_player_name_across_tournament(scoped_tournament_id, old_name, name, player_id)
        return updated
    except Exception as e:
        logger.error("update_player_error", error=str(e), player_id=player_id)
        return False


def delete_player(player_id: int, tournament_id: Optional[int] = None) -> bool:
    """Delete a player."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM players WHERE id = ? AND (? IS NULL OR tournament_id = ?)",
                (player_id, tournament_id, tournament_id),
            )
            conn.commit()
            logger.info("player_deleted", id=player_id)
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_player_error", error=str(e), player_id=player_id)
        return False


def bulk_insert_players(tournament_id: int, players_data: List[Dict]) -> int:
    """Bulk insert players. Returns count of inserted players."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            count = 0
            for player in players_data:
                p_name = player.get("name", "")
                fn = player.get("first_name", "")
                ln = player.get("last_name", "")
                # Split name if first/last not provided
                if not fn and not ln and p_name:
                    parts = p_name.strip().rsplit(' ', 1)
                    if len(parts) == 2:
                        fn, ln = parts[0], parts[1]
                    else:
                        fn, ln = '', p_name.strip()
                if not p_name:
                    p_name = f"{fn} {ln}".strip()
                category = player.get("category", "")
                country = player.get("country", "")
                gender = player.get("gender", "")
                global_player_id = None
                if _tournament_links_global_players(cursor, tournament_id):
                    global_player_id = _ensure_global_player(cursor, fn, ln, category, country, gender)
                cursor.execute("""
                    INSERT INTO players (tournament_id, name, first_name, last_name, category, country, gender, global_player_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    tournament_id,
                    p_name,
                    fn,
                    ln,
                    category,
                    country,
                    gender,
                    global_player_id,
                ))
                count += 1
            conn.commit()
            logger.info("players_bulk_inserted", count=count, tournament_id=tournament_id)
            return count
    except Exception as e:
        logger.error("bulk_insert_players_error", error=str(e))
        return 0


# ==================== BRACKET ====================

def save_bracket_groups(tournament_id: int, groups: List[Dict]) -> bool:
    """Replace all bracket groups for a tournament.
    groups: [{"name": "A", "players": [player_id, ...]}, ...]
    """
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Delete existing groups (cascade deletes players)
            cursor.execute(
                "DELETE FROM bracket_group_players WHERE group_id IN "
                "(SELECT id FROM bracket_groups WHERE tournament_id = ?)",
                (tournament_id,)
            )
            cursor.execute("DELETE FROM bracket_groups WHERE tournament_id = ?", (tournament_id,))
            cursor.execute("DELETE FROM tournament_schedule WHERE tournament_id = ? AND source_type IN ('group', 'group_rematch')", (tournament_id,))

            # Build player_id -> full name lookup
            cursor.execute(
                "SELECT id, last_name, name FROM players WHERE tournament_id = ?",
                (tournament_id,)
            )
            name_map = {}
            for row in cursor.fetchall():
                full = (row["name"] or "").strip()
                name_map[row["id"]] = full if full else (row["last_name"] or "").strip()

            for idx, g in enumerate(groups):
                category_id = g.get("tournament_category_id")
                cursor.execute(
                    "INSERT INTO bracket_groups (tournament_id, name, order_num, tournament_category_id) VALUES (?, ?, ?, ?)",
                    (tournament_id, g["name"], idx, category_id),
                )
                gid = cursor.lastrowid
                for pid in g.get("players", []):
                    pname = name_map.get(pid, "")
                    if pname:
                        cursor.execute(
                            "INSERT INTO bracket_group_players (group_id, player_id, player_name) VALUES (?, ?, ?)",
                            (gid, pid, pname)
                        )
            conn.commit()
            logger.info("bracket_groups_saved", tournament_id=tournament_id, count=len(groups))
        ensure_group_schedule_entries(tournament_id)
        return True
    except Exception as e:
        logger.error("save_bracket_groups_error", error=str(e))
        return False


def fetch_bracket_groups(tournament_id: int) -> List[Dict]:
    """Get all bracket groups with players for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, order_num, tournament_category_id FROM bracket_groups WHERE tournament_id = ? ORDER BY order_num",
                (tournament_id,),
            )
            groups = []
            for g in cursor.fetchall():
                cursor.execute(
                    "SELECT player_id, player_name FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],),
                )
                players = [{"player_id": r["player_id"], "name": r["player_name"]} for r in cursor.fetchall()]
                groups.append({
                    "id": g["id"],
                    "name": g["name"],
                    "tournament_category_id": g["tournament_category_id"],
                    "players": players,
                })
            return groups
    except Exception as e:
        logger.error("fetch_bracket_groups_error", error=str(e))
        return []


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _schedule_day_for_tournament(cursor: sqlite3.Cursor, tournament_id: int) -> str:
    cursor.execute("SELECT start_date FROM tournaments WHERE id = ?", (tournament_id,))
    row = cursor.fetchone()
    return str(row["start_date"] if row and row["start_date"] else datetime.now(timezone.utc).date().isoformat())


def _knockout_schedule_day_for_tournament(cursor: sqlite3.Cursor, tournament_id: int) -> str:
    """Prefer tournament end_date for knockout schedule entries when it differs from start_date."""
    cursor.execute("SELECT start_date, end_date FROM tournaments WHERE id = ?", (tournament_id,))
    row = cursor.fetchone()
    start = str(row["start_date"] or "") if row else ""
    end = str(row["end_date"] or "") if row else ""
    if end and end != start:
        return end
    return start or datetime.now(timezone.utc).date().isoformat()


def _autoschedule_phases_include_knockout(phases: Optional[List[str]]) -> bool:
    if not phases:
        return True
    wanted = {str(phase).strip().lower() for phase in phases}
    return bool({"knockout", "pucharowa", "knockouts", "all", "wszystko"} & wanted)


def _schedule_pair_clause(player1_name: str, player2_name: str) -> tuple[str, tuple[str, str, str, str]]:
    return (
        "((player1_name = ? AND player2_name = ?) OR (player1_name = ? AND player2_name = ?))",
        (player1_name, player2_name, player2_name, player1_name),
    )


def _format_score_text(sets_history_raw: Any) -> str:
    """Build a compact score string (e.g. '4:2 4:1 STB 10:7') from a sets_history JSON."""
    if not sets_history_raw:
        return ""
    try:
        sets_history = json.loads(sets_history_raw) if isinstance(sets_history_raw, str) else sets_history_raw
    except (ValueError, TypeError):
        return ""
    if not isinstance(sets_history, list):
        return ""
    parts: List[str] = []
    for set_score in sets_history:
        if not isinstance(set_score, dict):
            continue
        p1 = set_score.get("player1_games", 0)
        p2 = set_score.get("player2_games", 0)
        if set_score.get("is_super_tiebreak"):
            parts.append(f"STB {p1}:{p2}")
        else:
            tb = set_score.get("tiebreak_loser_points")
            parts.append(f"{p1}:{p2}" + (f"({tb})" if tb is not None else ""))
    return " ".join(parts)


def _schedule_match_result(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract a public-friendly result for a schedule row joined with its match."""
    has_match = data.get("match_id") not in (None, "", 0)
    sets_history_raw = data.get("match_sets_history")
    score_text = _format_score_text(sets_history_raw)
    return {
        "match_status": data.get("match_status") or "",
        "winner_name": data.get("match_winner_name") or "",
        "result_note": data.get("match_result_note") or "",
        "finish_reason": data.get("match_finish_reason") or "",
        "player1_sets": int(data.get("match_player1_sets") or 0) if has_match else None,
        "player2_sets": int(data.get("match_player2_sets") or 0) if has_match else None,
        "score_text": score_text,
        "has_result": bool(has_match and (score_text or data.get("match_winner_name") or data.get("match_status") == "finished")),
    }


def _schedule_row_payload(row: sqlite3.Row | Dict[str, Any], *, public: bool = False) -> Dict[str, Any]:
    data = dict(row)
    payload = {
        "id": data.get("id"),
        "tournament_id": data.get("tournament_id"),
        "day_date": data.get("day_date") or "",
        "scheduled_time": data.get("scheduled_time") or "",
        "court_id": data.get("court_id") or "",
        "court_label": data.get("court_label") or data.get("court_name") or data.get("court_id") or "",
        "category_name": data.get("category_name") or "",
        "bracket_group_id": data.get("bracket_group_id"),
        "group_name": data.get("group_name") or "",
        "phase": data.get("phase") or "",
        "player1_name": data.get("player1_name") or "",
        "player2_name": data.get("player2_name") or "",
        "status": data.get("status") or "draft",
        "source_type": data.get("source_type") or "manual",
        "source_ref_id": data.get("source_ref_id"),
        "match_id": data.get("match_id"),
        "sort_order": int(data.get("sort_order") or 0),
        "court_display_order": int(data.get("court_display_order") or 9999),
        "notes_public": data.get("notes_public") or "",
        "created_at": data.get("created_at") or "",
        "updated_at": data.get("updated_at") or "",
    }
    payload.update(_schedule_match_result(data))
    if not public:
        payload["notes_internal"] = data.get("notes_internal") or ""
    return payload


def fetch_tournament_schedule(tournament_id: int, *, public_only: bool = False) -> List[Dict[str, Any]]:
    """Return flat tournament schedule entries sorted by day, time, court and order."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            status_clause = "AND ts.status != 'draft'" if public_only else ""
            cursor.execute(
                f"""
                SELECT ts.*, c.name AS court_name, COALESCE(c.display_order, 9999) AS court_display_order,
                       m.status AS match_status, m.winner_name AS match_winner_name,
                       m.result_note AS match_result_note, m.finish_reason AS match_finish_reason,
                       m.player1_sets AS match_player1_sets, m.player2_sets AS match_player2_sets,
                       m.sets_history AS match_sets_history
                FROM tournament_schedule ts
                LEFT JOIN courts c ON c.kort_id = ts.court_id
                LEFT JOIN matches m ON m.id = ts.match_id
                WHERE ts.tournament_id = ? {status_clause}
                ORDER BY ts.day_date, COALESCE(NULLIF(ts.scheduled_time, ''), '99:99'),
                         COALESCE(c.display_order, 9999), ts.sort_order, ts.id
                """,
                (tournament_id,),
            )
            return [_schedule_row_payload(row, public=public_only) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_tournament_schedule_error", error=str(e), tournament_id=tournament_id)
        return []


def _parse_schedule_reference_datetime(value: Optional[str] = None) -> datetime:
    if value:
        normalized = str(value).strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.now().replace(tzinfo=None)


def find_suggested_schedule_match(
    tournament_id: int,
    court_id: str,
    *,
    reference_time: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the nearest unlinked schedule entry for a court and reference time."""
    if not tournament_id or not court_id:
        return None
    reference = _parse_schedule_reference_datetime(reference_time)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT ts.*, c.name AS court_name, COALESCE(c.display_order, 9999) AS court_display_order
                FROM tournament_schedule ts
                LEFT JOIN courts c ON c.kort_id = ts.court_id
                WHERE ts.tournament_id = ?
                  AND ts.court_id = ?
                  AND (ts.match_id IS NULL OR ts.match_id = '')
                  AND COALESCE(ts.status, 'planned') != 'completed'
                  AND COALESCE(ts.day_date, '') != ''
                  AND COALESCE(ts.scheduled_time, '') != ''
                  AND COALESCE(ts.player1_name, '') != ''
                  AND COALESCE(ts.player2_name, '') != ''
                """,
                (tournament_id, court_id),
            )
            candidates = []
            for row in cursor.fetchall():
                entry = _schedule_row_payload(row, public=False)
                try:
                    scheduled_at = datetime.fromisoformat(f"{entry['day_date']}T{entry['scheduled_time']}:00")
                except ValueError:
                    continue
                diff_seconds = abs((scheduled_at - reference).total_seconds())
                future_first = 0 if scheduled_at >= reference else 1
                candidates.append((diff_seconds, future_first, entry.get("sort_order") or 0, entry.get("id") or 0, entry))
            if not candidates:
                return None
            candidates.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
            return candidates[0][4]
    except Exception as e:
        logger.error("find_suggested_schedule_match_error", error=str(e), tournament_id=tournament_id, court_id=court_id)
        return None


def build_public_schedule_payload(tournament_id: int) -> Dict[str, Any]:
    """Return schedule grouped by day and category for the public UI."""
    tournament = fetch_tournament(tournament_id) or {}
    entries = fetch_tournament_schedule(tournament_id, public_only=True)
    days: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        day_date = entry.get("day_date") or ""
        day = days.setdefault(day_date, {"date": day_date, "categories": {}})
        category_name = entry.get("category_name") or entry.get("group_name") or "Kategoria do ustalenia"
        category = day["categories"].setdefault(
            category_name,
            {
                "name": category_name,
                "matches": [],
            },
        )
        category["matches"].append(entry)

    grouped_days = []
    for day in days.values():
        categories = list(day["categories"].values())
        for category in categories:
            category["matches"].sort(
                key=lambda item: (
                    item.get("scheduled_time") or "99:99",
                    item.get("sort_order") or 0,
                    item.get("id") or 0,
                )
            )
        categories.sort(
            key=lambda item: (
                str(item.get("name") or "").casefold(),
            )
        )
        grouped_days.append(
            {
                "date": day["date"],
                "categories": [
                    {"name": category["name"], "matches": category["matches"]}
                    for category in categories
                ],
            }
        )
    grouped_days.sort(key=lambda item: item["date"])

    return {
        "tournament": {
            "id": tournament.get("id") or tournament_id,
            "name": tournament.get("name") or "",
            "start_date": tournament.get("start_date") or "",
            "end_date": tournament.get("end_date") or "",
        },
        "days": grouped_days,
    }


def _coerce_schedule_entry(tournament_id: int, data: Dict[str, Any], default_order: int = 0) -> Dict[str, Any]:
    return {
        "tournament_id": tournament_id,
        "day_date": str(data.get("day_date") or data.get("date") or "").strip(),
        "scheduled_time": str(data.get("scheduled_time") or data.get("time") or "").strip(),
        "court_id": str(data.get("court_id") or "").strip(),
        "court_label": str(data.get("court_label") or "").strip(),
        "category_name": str(data.get("category_name") or data.get("category") or "").strip(),
        "bracket_group_id": data.get("bracket_group_id"),
        "group_name": str(data.get("group_name") or "").strip(),
        "phase": str(data.get("phase") or "Grupowa").strip(),
        "player1_name": str(data.get("player1_name") or data.get("player_a") or "").strip(),
        "player2_name": str(data.get("player2_name") or data.get("player_b") or "").strip(),
        "status": str(data.get("status") or "draft").strip(),
        "source_type": str(data.get("source_type") or "manual").strip(),
        "source_ref_id": data.get("source_ref_id"),
        "match_id": data.get("match_id"),
        "sort_order": int(data.get("sort_order") or default_order),
        "notes_public": str(data.get("notes_public") or "").strip(),
        "notes_internal": str(data.get("notes_internal") or "").strip(),
    }


def upsert_tournament_schedule_entries(tournament_id: int, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create or update schedule entries and return the refreshed schedule."""
    if not entries:
        return fetch_tournament_schedule(tournament_id)
    with db_conn() as conn:
        cursor = conn.cursor()
        default_day = _schedule_day_for_tournament(cursor, tournament_id)
        now = _utc_now()
        for index, raw_entry in enumerate(entries):
            entry = _coerce_schedule_entry(tournament_id, raw_entry, default_order=index)
            if not entry["day_date"]:
                entry["day_date"] = default_day
            if not entry["player1_name"] or not entry["player2_name"]:
                raise ValueError("Two player names are required for schedule entry")
            schedule_id = raw_entry.get("id")
            values = (
                entry["day_date"], entry["scheduled_time"], entry["court_id"], entry["court_label"],
                entry["category_name"], entry["bracket_group_id"], entry["group_name"], entry["phase"],
                entry["player1_name"], entry["player2_name"], entry["status"], entry["source_type"],
                entry["source_ref_id"], entry["match_id"], entry["sort_order"], entry["notes_public"],
                entry["notes_internal"], now,
            )
            if schedule_id:
                cursor.execute(
                    """
                    UPDATE tournament_schedule
                    SET day_date = ?, scheduled_time = ?, court_id = ?, court_label = ?, category_name = ?,
                        bracket_group_id = ?, group_name = ?, phase = ?, player1_name = ?, player2_name = ?,
                        status = ?, source_type = ?, source_ref_id = ?, match_id = ?, sort_order = ?,
                        notes_public = ?, notes_internal = ?, updated_at = ?
                    WHERE id = ? AND tournament_id = ?
                    """,
                    (*values, schedule_id, tournament_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO tournament_schedule (
                        tournament_id, day_date, scheduled_time, court_id, court_label, category_name,
                        bracket_group_id, group_name, phase, player1_name, player2_name, status, source_type,
                        source_ref_id, match_id, sort_order, notes_public, notes_internal, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (tournament_id, *values[:-1], now, now),
                )
        conn.commit()
    return fetch_tournament_schedule(tournament_id)


def update_tournament_schedule_entry(tournament_id: int, schedule_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Patch one schedule entry."""
    allowed_fields = {
        "day_date", "scheduled_time", "court_id", "court_label", "category_name", "bracket_group_id",
        "group_name", "phase", "player1_name", "player2_name", "status", "source_type", "source_ref_id",
        "match_id", "sort_order", "notes_public", "notes_internal",
    }
    updates = {key: value for key, value in data.items() if key in allowed_fields}
    if not updates:
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    if "sort_order" in updates:
        updates["sort_order"] = int(updates.get("sort_order") or 0)
    updates["updated_at"] = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            assignments = ", ".join(f"{key} = ?" for key in updates)
            cursor.execute(
                f"UPDATE tournament_schedule SET {assignments} WHERE id = ? AND tournament_id = ?",
                [*updates.values(), schedule_id, tournament_id],
            )
            conn.commit()
            if cursor.rowcount == 0:
                return None
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    except Exception as e:
        logger.error("update_tournament_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return None


def delete_tournament_schedule_entry(tournament_id: int, schedule_id: int) -> bool:
    """Delete one schedule entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tournament_schedule WHERE id = ? AND tournament_id = ?", (schedule_id, tournament_id))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_tournament_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return False


def publish_tournament_schedule(tournament_id: int, day_date: Optional[str] = None) -> int:
    """Promote all draft schedule entries to 'planned' (published). Returns updated count."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            params: List[Any] = [_utc_now(), tournament_id]
            query = "UPDATE tournament_schedule SET status = 'planned', updated_at = ? WHERE tournament_id = ? AND status = 'draft'"
            if day_date:
                query += " AND day_date = ?"
                params.append(day_date)
            cursor.execute(query, params)
            conn.commit()
            return int(cursor.rowcount or 0)
    except Exception as e:
        logger.error("publish_tournament_schedule_error", error=str(e), tournament_id=tournament_id)
        return 0


def _insert_group_round_robin_schedule_entries(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    group: Dict[str, Any],
    *,
    phase: str,
    source_type: str,
    default_day: str,
    start_order: int,
    now: str,
) -> int:
    """Insert missing round-robin schedule rows for one group and return next sort order."""
    group_id = int(group["id"])
    group_name = group.get("name") or ""
    category_name, _ = _split_bracket_label(group_name)
    players = group.get("players") or []
    next_order = start_order
    for left_index, player1 in enumerate(players):
        for player2 in players[left_index + 1:]:
            player1_name = player1.get("name") or ""
            player2_name = player2.get("name") or ""
            if not player1_name or not player2_name:
                continue
            pair_clause, pair_params = _schedule_pair_clause(player1_name, player2_name)
            cursor.execute(
                f"""
                SELECT id FROM tournament_schedule
                WHERE tournament_id = ? AND bracket_group_id = ? AND phase = ? AND {pair_clause}
                """,
                (tournament_id, group_id, phase, *pair_params),
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                """
                INSERT INTO tournament_schedule (
                    tournament_id, day_date, category_name, bracket_group_id, group_name, phase,
                    player1_name, player2_name, status, source_type, source_ref_id, sort_order,
                    notes_public, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
                """,
                (
                    tournament_id, default_day, category_name or group_name, group_id, group_name, phase,
                    player1_name, player2_name, source_type, group_id, next_order,
                    _default_group_schedule_note(tournament_id), now, now,
                ),
            )
            next_order += 1
    return next_order


def ensure_group_schedule_entries(tournament_id: int) -> List[Dict[str, Any]]:
    """Ensure every configured group round-robin pair has a schedule slot."""
    groups = fetch_bracket_groups(tournament_id)
    if not groups:
        return fetch_tournament_schedule(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = _schedule_day_for_tournament(cursor, tournament_id)
            now = _utc_now()
            cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?", (tournament_id,))
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1
            for group in groups:
                next_order = _insert_group_round_robin_schedule_entries(
                    cursor,
                    tournament_id,
                    group,
                    phase=GROUP_PHASE,
                    source_type="group",
                    default_day=default_day,
                    start_order=next_order,
                    now=now,
                )
            conn.commit()
        return fetch_tournament_schedule(tournament_id)
    except Exception as e:
        logger.error("ensure_group_schedule_error", error=str(e), tournament_id=tournament_id)
        return fetch_tournament_schedule(tournament_id)


def ensure_knockout_schedule_entries(
    tournament_id: int,
    *,
    schedule_day: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Ensure every relevant knockout slot has a schedule entry for office assignment."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            default_day = (
                str(schedule_day).strip()
                if schedule_day
                else _knockout_schedule_day_for_tournament(cursor, tournament_id)
            )
            now = _utc_now()
            cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tournament_schedule WHERE tournament_id = ?", (tournament_id,))
            next_order = int(cursor.fetchone()["max_order"] or 0) + 1
            cursor.execute(
                """
                SELECT id, phase, position, player1_name, player2_name, winner_name
                FROM bracket_knockout
                WHERE tournament_id = ?
                ORDER BY phase, position
                """,
                (tournament_id,),
            )
            for slot in cursor.fetchall():
                player1_name, player2_name = _knockout_schedule_player_names(slot)
                if not player1_name or not player2_name:
                    continue
                category_name, phase_suffix = _split_bracket_label(slot["phase"])
                phase_label = slot["phase"] or phase_suffix or "Pucharowa"
                cursor.execute(
                    """
                    SELECT id, status, match_id, scheduled_time, court_id, court_label
                    FROM tournament_schedule
                    WHERE tournament_id = ? AND source_type = 'knockout' AND source_ref_id = ?
                    """,
                    (tournament_id, slot["id"]),
                )
                existing = cursor.fetchone()
                status = "completed" if slot["winner_name"] else "draft"
                if existing:
                    corrected_status: Optional[str] = None
                    if slot["winner_name"]:
                        corrected_status = "completed"
                    elif existing["status"] == "completed" and not existing["match_id"]:
                        corrected_status = "planned" if (
                            (existing["scheduled_time"] or "").strip()
                            or (existing["court_id"] or "").strip()
                            or (existing["court_label"] or "").strip()
                        ) else "draft"
                    cursor.execute(
                        """
                        UPDATE tournament_schedule
                        SET category_name = ?, phase = ?, player1_name = ?, player2_name = ?,
                            status = CASE
                                WHEN ? IS NOT NULL THEN ?
                                WHEN ? = 'completed' THEN 'completed'
                                ELSE status
                            END,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            category_name or phase_label,
                            phase_label,
                            player1_name,
                            player2_name,
                            corrected_status,
                            corrected_status,
                            status,
                            now,
                            existing["id"],
                        ),
                    )
                    continue
                cursor.execute(
                    """
                    INSERT INTO tournament_schedule (
                        tournament_id, day_date, category_name, phase, player1_name, player2_name,
                        status, source_type, source_ref_id, sort_order, notes_public, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'knockout', ?, ?, ?, ?, ?)
                    """,
                    (
                        tournament_id, default_day, category_name or phase_label, phase_label,
                        player1_name, player2_name, status, slot["id"], next_order,
                        _default_knockout_schedule_note(tournament_id), now, now,
                    ),
                )
                next_order += 1
            conn.commit()
        return fetch_tournament_schedule(tournament_id)
    except Exception as e:
        logger.error("ensure_knockout_schedule_error", error=str(e), tournament_id=tournament_id)
        return fetch_tournament_schedule(tournament_id)


def link_schedule_to_match(
    tournament_id: int,
    match_id: int,
    *,
    schedule_id: Optional[int] = None,
    player1_name: str,
    player2_name: str,
    phase: Optional[str] = None,
    bracket_group_id: Optional[int] = None,
    status: str = "completed",
) -> Optional[Dict[str, Any]]:
    """Link a planned schedule slot to the real match row."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if schedule_id:
                cursor.execute(
                    """
                    SELECT id FROM tournament_schedule
                    WHERE id = ? AND tournament_id = ? AND (match_id IS NULL OR match_id = ?)
                    LIMIT 1
                    """,
                    (schedule_id, tournament_id, match_id),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                cursor.execute(
                    "UPDATE tournament_schedule SET match_id = ?, status = ?, updated_at = ? WHERE id = ?",
                    (match_id, status, _utc_now(), row["id"]),
                )
                conn.commit()
                return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(row["id"])), None)

            pair_clause, pair_params = _schedule_pair_clause(player1_name, player2_name)
            params: List[Any] = [tournament_id, *pair_params]
            filters = ["tournament_id = ?", pair_clause]
            if bracket_group_id:
                filters.append("bracket_group_id = ?")
                params.append(bracket_group_id)
            elif phase:
                filters.append("phase = ?")
                params.append(phase)
            filters.append("(match_id IS NULL OR match_id = ?)")
            params.append(match_id)
            cursor.execute(
                f"""
                SELECT id FROM tournament_schedule
                WHERE {' AND '.join(filters)}
                ORDER BY CASE WHEN match_id IS NULL THEN 0 ELSE 1 END, id
                LIMIT 1
                """,
                params,
            )
            row = cursor.fetchone()
            if not row:
                return None
            cursor.execute(
                "UPDATE tournament_schedule SET match_id = ?, status = ?, updated_at = ? WHERE id = ?",
                (match_id, status, _utc_now(), row["id"]),
            )
            conn.commit()
            schedule_id = row["id"]
        return next((entry for entry in fetch_tournament_schedule(tournament_id) if int(entry["id"]) == int(schedule_id)), None)
    except Exception as e:
        logger.error("link_schedule_to_match_error", error=str(e), tournament_id=tournament_id, match_id=match_id)
        return None


def unlink_schedule_from_match(match_id: int, *, fallback_status: str = "planned") -> int:
    """Detach schedule slots from a match that must not count for tournament lifecycle."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE tournament_schedule
                SET match_id = NULL,
                    status = CASE
                        WHEN status IN ('in_progress', 'completed') THEN ?
                        ELSE status
                    END,
                    updated_at = ?
                WHERE match_id = ?
                """,
                (fallback_status, _utc_now(), match_id),
            )
            affected = cursor.rowcount
            conn.commit()
            return affected
    except Exception as e:
        logger.error("unlink_schedule_from_match_error", error=str(e), match_id=match_id)
        return 0


# ==================== TOURNAMENT CATEGORIES ====================

def _tournament_category_counts(cursor: sqlite3.Cursor, category_id: int) -> tuple[int, int]:
    cursor.execute(
        """
        SELECT COUNT(DISTINCT bgp.player_id)
        FROM bracket_group_players bgp
        JOIN bracket_groups bg ON bg.id = bgp.group_id
        WHERE bg.tournament_category_id = ?
        """,
        (category_id,),
    )
    player_count = int(cursor.fetchone()[0] or 0)
    cursor.execute(
        "SELECT COUNT(*) FROM bracket_groups WHERE tournament_category_id = ?",
        (category_id,),
    )
    group_count = int(cursor.fetchone()[0] or 0)
    return player_count, group_count


def fetch_tournament_categories(tournament_id: int, *, active_only: bool = False) -> List[Dict[str, Any]]:
    from .services.tournament_categories import category_row_payload

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            clause = "AND is_active = 1" if active_only else ""
            cursor.execute(
                f"""
                SELECT tc.*,
                       (SELECT COUNT(DISTINCT bgp.player_id)
                        FROM bracket_group_players bgp
                        JOIN bracket_groups bg ON bg.id = bgp.group_id
                        WHERE bg.tournament_category_id = tc.id) AS player_count,
                       (SELECT COUNT(*)
                        FROM bracket_groups bg
                        WHERE bg.tournament_category_id = tc.id) AS group_count
                FROM tournament_categories tc
                WHERE tc.tournament_id = ? {clause}
                ORDER BY tc.sort_order, tc.id
                """,
                (tournament_id,),
            )
            return [category_row_payload(row) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_tournament_categories_error", error=str(e), tournament_id=tournament_id)
        return []


def fetch_tournament_category(category_id: int) -> Optional[Dict[str, Any]]:
    from .services.tournament_categories import category_row_payload

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT tc.*, 0 AS player_count, 0 AS group_count
                FROM tournament_categories tc
                WHERE tc.id = ?
                """,
                (category_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            payload = category_row_payload(row)
            payload["player_count"], payload["group_count"] = _tournament_category_counts(cursor, category_id)
            return payload
    except Exception as e:
        logger.error("fetch_tournament_category_error", error=str(e), category_id=category_id)
        return None


def _insert_tournament_category_row(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    *,
    label: str,
    preset_key: str = "",
    hint_bands: Optional[List[str]] = None,
    sort_order: Optional[int] = None,
) -> int:
    from .services.tournament_categories import normalize_hint_bands

    if sort_order is None:
        cursor.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM tournament_categories WHERE tournament_id = ?",
            (tournament_id,),
        )
        sort_order = int(cursor.fetchone()[0] or -1) + 1
    bands_json = json.dumps(normalize_hint_bands(hint_bands or []))
    cursor.execute(
        """
        INSERT INTO tournament_categories (
            tournament_id, label, preset_key, sort_order, is_active, hint_bands, created_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (tournament_id, label.strip(), preset_key.strip(), sort_order, bands_json, _utc_now()),
    )
    return int(cursor.lastrowid)


def confirm_tournament_categories(
    tournament_id: int,
    entries: List[Dict[str, Any]],
    *,
    replace: bool = False,
) -> List[Dict[str, Any]]:
    """Create the initial category set for a tournament (after checkbox confirm)."""
    from .services.tournament_categories import preset_defaults, normalize_hint_bands

    if not entries:
        return fetch_tournament_categories(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if replace:
                cursor.execute(
                    "SELECT COUNT(*) FROM tournament_categories WHERE tournament_id = ?",
                    (tournament_id,),
                )
                if int(cursor.fetchone()[0] or 0):
                    cursor.execute(
                        """
                        SELECT COUNT(*) FROM bracket_groups
                        WHERE tournament_id = ? AND tournament_category_id IS NOT NULL
                        """,
                        (tournament_id,),
                    )
                    if int(cursor.fetchone()[0] or 0):
                        raise ValueError("Cannot replace categories while groups are assigned")
                    cursor.execute("DELETE FROM tournament_categories WHERE tournament_id = ?", (tournament_id,))
            cursor.execute(
                "SELECT COUNT(*) FROM tournament_categories WHERE tournament_id = ?",
                (tournament_id,),
            )
            if int(cursor.fetchone()[0] or 0) and not replace:
                raise ValueError("Tournament categories already confirmed")
            for index, entry in enumerate(entries):
                preset_key = str(entry.get("preset_key") or "").strip().upper()
                label = str(entry.get("label") or "").strip()
                hint_bands = entry.get("hint_bands")
                if preset_key and not label:
                    preset = preset_defaults(preset_key)
                    if preset:
                        label = preset["label"]
                        hint_bands = hint_bands or preset.get("hint_bands")
                if not label:
                    continue
                _insert_tournament_category_row(
                    cursor,
                    tournament_id,
                    label=label,
                    preset_key=preset_key,
                    hint_bands=normalize_hint_bands(hint_bands or []),
                    sort_order=index,
                )
            conn.commit()
        logger.info("tournament_categories_confirmed", tournament_id=tournament_id, count=len(entries))
        return fetch_tournament_categories(tournament_id)
    except ValueError:
        raise
    except Exception as e:
        logger.error("confirm_tournament_categories_error", error=str(e), tournament_id=tournament_id)
        raise


def insert_tournament_category(
    tournament_id: int,
    *,
    label: str,
    preset_key: str = "",
    hint_bands: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    from .services.tournament_categories import normalize_hint_bands

    label = label.strip()
    if not label:
        return None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            category_id = _insert_tournament_category_row(
                cursor,
                tournament_id,
                label=label,
                preset_key=preset_key,
                hint_bands=normalize_hint_bands(hint_bands or []),
            )
            conn.commit()
        return fetch_tournament_category(category_id)
    except Exception as e:
        logger.error("insert_tournament_category_error", error=str(e), tournament_id=tournament_id)
        return None


def _propagate_tournament_category_label(
    cursor: sqlite3.Cursor,
    tournament_id: int,
    category_id: int,
    old_label: str,
    new_label: str,
) -> None:
    if not old_label or old_label == new_label:
        return
    now = _utc_now()
    cursor.execute(
        """
        UPDATE bracket_groups
        SET name = CASE
            WHEN name = ? THEN ?
            WHEN name LIKE ? THEN ? || SUBSTR(name, ?)
            ELSE name
        END
        WHERE tournament_id = ? AND tournament_category_id = ?
        """,
        (
            old_label,
            new_label,
            old_label + " — %",
            new_label,
            len(old_label) + 1,
            tournament_id,
            category_id,
        ),
    )
    cursor.execute(
        """
        UPDATE tournament_schedule
        SET category_name = ?, group_name = CASE
            WHEN group_name = ? THEN ?
            WHEN group_name LIKE ? THEN ? || SUBSTR(group_name, ?)
            ELSE group_name
        END, updated_at = ?
        WHERE tournament_id = ? AND category_name = ?
        """,
        (
            new_label,
            old_label,
            new_label,
            old_label + " — %",
            new_label,
            len(old_label) + 1,
            now,
            tournament_id,
            old_label,
        ),
    )
    cursor.execute(
        """
        UPDATE bracket_knockout
        SET phase = REPLACE(phase, ?, ?)
        WHERE tournament_id = ? AND phase LIKE ?
        """,
        (old_label, new_label, tournament_id, old_label + "%"),
    )
    cursor.execute(
        """
        UPDATE tournament_schedule
        SET phase = REPLACE(phase, ?, ?), updated_at = ?
        WHERE tournament_id = ? AND phase LIKE ?
        """,
        (old_label, new_label, now, tournament_id, old_label + "%"),
    )


def update_tournament_category(
    category_id: int,
    *,
    label: Optional[str] = None,
    hint_bands: Optional[List[str]] = None,
    sort_order: Optional[int] = None,
    is_active: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    from .services.tournament_categories import normalize_hint_bands

    existing = fetch_tournament_category(category_id)
    if not existing:
        return None
    tournament_id = int(existing["tournament_id"])
    new_label = label.strip() if label is not None else None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            old_label = existing["label"]
            if new_label is not None and new_label != old_label:
                _propagate_tournament_category_label(
                    cursor, tournament_id, category_id, old_label, new_label
                )
            fields: List[str] = []
            params: List[Any] = []
            if new_label is not None:
                fields.append("label = ?")
                params.append(new_label)
            if hint_bands is not None:
                fields.append("hint_bands = ?")
                params.append(json.dumps(normalize_hint_bands(hint_bands)))
            if sort_order is not None:
                fields.append("sort_order = ?")
                params.append(int(sort_order))
            if is_active is not None:
                fields.append("is_active = ?")
                params.append(1 if is_active else 0)
            if fields:
                params.append(category_id)
                cursor.execute(
                    f"UPDATE tournament_categories SET {', '.join(fields)} WHERE id = ?",
                    params,
                )
            conn.commit()
        return fetch_tournament_category(category_id)
    except Exception as e:
        logger.error("update_tournament_category_error", error=str(e), category_id=category_id)
        return None


def delete_tournament_category(category_id: int, *, force: bool = False) -> bool:
    existing = fetch_tournament_category(category_id)
    if not existing:
        return False
    player_count = int(existing.get("player_count") or 0)
    group_count = int(existing.get("group_count") or 0)
    if (player_count or group_count) and not force:
        return update_tournament_category(category_id, is_active=False) is not None
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE bracket_groups SET tournament_category_id = NULL WHERE tournament_category_id = ?",
                (category_id,),
            )
            cursor.execute("DELETE FROM tournament_categories WHERE id = ?", (category_id,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("delete_tournament_category_error", error=str(e), category_id=category_id)
        return False


def migrate_tournament_categories_from_legacy(tournament_id: int) -> List[Dict[str, Any]]:
    """One-time migration: infer tournament categories from bracket group names."""
    existing = fetch_tournament_categories(tournament_id)
    if existing:
        return existing
    groups = fetch_bracket_groups(tournament_id)
    labels: List[str] = []
    for group in groups:
        base = str(group.get("name") or "").split(" — ")[0].split(" - ")[0].strip()
        if base and base not in labels:
            labels.append(base)
    if not labels:
        mixed = get_mixed_categories(tournament_id)
        for code in mixed:
            from .services.categories import mixed_category_label, format_category_display
            labels.append(mixed_category_label(code) if code == "B34" else f"{format_category_display(code)} Mixed")
    if not labels:
        return []
    entries = [{"label": label} for label in labels]
    categories = confirm_tournament_categories(tournament_id, entries)
    label_to_id = {cat["label"]: cat["id"] for cat in categories}
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for group in groups:
                base = str(group.get("name") or "").split(" — ")[0].split(" - ")[0].strip()
                category_id = label_to_id.get(base)
                if category_id:
                    cursor.execute(
                        "UPDATE bracket_groups SET tournament_category_id = ? WHERE id = ?",
                        (category_id, group["id"]),
                    )
            conn.commit()
    except Exception as e:
        logger.error("migrate_tournament_categories_link_error", error=str(e), tournament_id=tournament_id)
    return fetch_tournament_categories(tournament_id)


def _mixed_categories_settings_key(tournament_id: int) -> str:
    return f"mixed_categories:{int(tournament_id)}"


def get_mixed_categories(tournament_id: int) -> List[str]:
    """Legacy mixed-band settings (app_settings). Prefer get_planning_mixed_bands()."""
    from .services.categories import normalize_mixed_categories

    stored = fetch_app_settings([_mixed_categories_settings_key(tournament_id)]).get(
        _mixed_categories_settings_key(tournament_id)
    )
    if not stored:
        return []
    try:
        data = json.loads(stored)
        if isinstance(data, list):
            return normalize_mixed_categories(data)
    except (ValueError, TypeError):
        pass
    return []


def get_planning_mixed_bands(tournament_id: int) -> List[str]:
    """Mixed player-band codes for import/planning — from tournament_categories, legacy fallback."""
    from .services.tournament_categories import infer_mixed_player_bands

    categories = fetch_tournament_categories(tournament_id, active_only=True)
    if categories:
        return infer_mixed_player_bands(categories)
    return get_mixed_categories(tournament_id)


def clear_legacy_mixed_categories(tournament_id: int) -> bool:
    """Remove deprecated mixed_categories:{id} from app_settings."""
    key = _mixed_categories_settings_key(tournament_id)
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM app_settings WHERE key = ?", (key,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        logger.error("clear_legacy_mixed_categories_error", error=str(e), tournament_id=tournament_id)
        return False


def set_mixed_categories(tournament_id: int, categories: List[str]) -> List[str]:
    """Deprecated — use confirm_tournament_categories instead."""
    from .services.categories import normalize_mixed_categories

    normalized = normalize_mixed_categories(categories)
    upsert_app_settings({_mixed_categories_settings_key(tournament_id): json.dumps(normalized)})
    return normalized


def _autoscheduler_settings_key(tournament_id: int) -> str:
    return f"autoscheduler:{int(tournament_id)}"


def get_autoscheduler_config(tournament_id: int) -> Dict[str, Any]:
    """Return the auto-scheduler config for a tournament, merged over court-based defaults."""
    from .services import auto_scheduler

    courts = fetch_courts_for_tournament(tournament_id)
    config = auto_scheduler.build_default_config(courts)
    stored = fetch_app_settings([_autoscheduler_settings_key(tournament_id)]).get(
        _autoscheduler_settings_key(tournament_id)
    )
    if stored:
        try:
            saved = json.loads(stored)
            if isinstance(saved, dict):
                config.update({k: v for k, v in saved.items() if v not in (None, "")})
                if isinstance(saved.get("slot_minutes"), dict):
                    merged_slots = dict(config.get("slot_minutes") or {})
                    merged_slots.update(saved["slot_minutes"])
                    config["slot_minutes"] = merged_slots
                if isinstance(saved.get("category_courts"), dict):
                    config["category_courts"] = saved["category_courts"]
                if isinstance(saved.get("b1_court_ids"), list):
                    ids = [str(court_id).strip() for court_id in saved["b1_court_ids"] if str(court_id or "").strip()]
                    if ids:
                        config["b1_court_ids"] = ids
                        config["b1_court_id"] = ids[0]
        except (ValueError, TypeError):
            pass
    if not config.get("b1_court_ids") and config.get("b1_court_id"):
        config["b1_court_ids"] = [str(config["b1_court_id"])]
    return config


def save_autoscheduler_config(tournament_id: int, config: Dict[str, Any]) -> Dict[str, Any]:
    """Persist the auto-scheduler config for a tournament."""
    from .services import auto_scheduler

    current = get_autoscheduler_config(tournament_id)
    allowed = {"start_time", "b1_court_id", "b1_court_ids", "category_courts", "slot_minutes", "rest_slots"}
    for key in allowed:
        if key in config and config[key] not in (None, ""):
            current[key] = config[key]
    if isinstance(current.get("b1_court_ids"), list):
        ids = [str(court_id).strip() for court_id in current["b1_court_ids"] if str(court_id or "").strip()]
        if ids:
            current = auto_scheduler.apply_b1_courts(current, ids)
        else:
            current["b1_court_ids"] = []
            current["b1_court_id"] = ""
    upsert_app_settings({_autoscheduler_settings_key(tournament_id): json.dumps(current)})
    return current


def _schedule_entry_match_dict(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": entry.get("id"),
        "category_name": entry.get("category_name") or entry.get("group_name") or "",
        "group_name": entry.get("group_name") or "",
        "phase": entry.get("phase") or "",
        "player1_name": entry.get("player1_name") or "",
        "player2_name": entry.get("player2_name") or "",
        "court_id": entry.get("court_id") or "",
        "sort_order": entry.get("sort_order") or 0,
        "source_type": entry.get("source_type") or "",
        "status": entry.get("status") or "draft",
    }


def generate_autoschedule_proposal(
    tournament_id: int,
    *,
    start_time: Optional[str] = None,
    b1_court_id: Optional[str] = None,
    b1_court_ids: Optional[List[str]] = None,
    day_date: Optional[str] = None,
    phases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build a (non-persisted) auto-placement proposal for the tournament schedule.

    Returns {config, placements, courts} where each placement carries the schedule entry
    plus the proposed court_id/day_date/scheduled_time.
    """
    from .services import auto_scheduler

    ensure_group_schedule_entries(tournament_id)

    config = get_autoscheduler_config(tournament_id)
    if start_time:
        config["start_time"] = str(start_time)
    selected_b1_courts = [
        str(court_id).strip()
        for court_id in (b1_court_ids or [])
        if str(court_id or "").strip()
    ]
    if not selected_b1_courts and b1_court_id:
        selected_b1_courts = [str(b1_court_id).strip()]
    if selected_b1_courts:
        config = auto_scheduler.apply_b1_courts(config, selected_b1_courts)
        save_autoscheduler_config(tournament_id, {
            "b1_court_ids": selected_b1_courts,
            "b1_court_id": selected_b1_courts[0],
        })

    with db_conn() as conn:
        cursor = conn.cursor()
        default_day = _schedule_day_for_tournament(cursor, tournament_id)
        knockout_day = _knockout_schedule_day_for_tournament(cursor, tournament_id)
    target_day = day_date or config.get("day_date") or default_day

    if _autoschedule_phases_include_knockout(phases):
        seed_day = target_day if day_date else knockout_day
        seed_provisional_knockout_from_groups(tournament_id, schedule_day=seed_day)
    else:
        ensure_knockout_schedule_entries(tournament_id)

    entries = fetch_tournament_schedule(tournament_id)
    if day_date:
        target_day_str = str(day_date).strip()
        entries = [
            entry
            for entry in entries
            if str(entry.get("day_date") or "").strip() == target_day_str
        ]
    if phases:
        wanted = {str(p).strip().lower() for p in phases}

        def _is_group_entry(entry) -> bool:
            source = str(entry.get("source_type") or "").lower()
            phase = str(entry.get("phase") or "").lower()
            return source == "group" or "grup" in phase

        def _phase_match(entry) -> bool:
            is_group = _is_group_entry(entry)
            if {"group", "grupowa", "groups"} & wanted:
                if is_group:
                    return True
            if {"knockout", "pucharowa", "knockouts"} & wanted:
                if not is_group:
                    return True
            return False

        entries = [entry for entry in entries if _phase_match(entry)]

    matches = [_schedule_entry_match_dict(entry) for entry in entries]
    placements = auto_scheduler.place_matches(matches, config, target_day)

    entry_by_id = {int(entry["id"]): entry for entry in entries if entry.get("id")}
    result_placements = []
    for placement in placements:
        match = placement["match"]
        entry = entry_by_id.get(int(match["id"])) if match.get("id") else None
        result_placements.append(
            {
                "schedule_id": match.get("id"),
                "court_id": placement["court_id"],
                "day_date": placement["day_date"],
                "scheduled_time": placement["scheduled_time"],
                "band": placement["band"],
                "category_name": entry.get("category_name") if entry else match.get("category_name"),
                "phase": entry.get("phase") if entry else match.get("phase"),
                "player1_name": entry.get("player1_name") if entry else match.get("player1_name"),
                "player2_name": entry.get("player2_name") if entry else match.get("player2_name"),
            }
        )
    return {
        "config": config,
        "courts": fetch_courts_for_tournament(tournament_id),
        "placements": result_placements,
    }


def apply_autoschedule_placements(
    tournament_id: int, placements: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Persist court/time/day placements onto schedule entries (publishes them as 'planned')."""
    if not placements:
        return fetch_tournament_schedule(tournament_id)
    courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}
    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for placement in placements:
                schedule_id = placement.get("schedule_id") or placement.get("id")
                if not schedule_id:
                    continue
                court_id = str(placement.get("court_id") or "")
                court_label = courts.get(court_id, {}).get("name") or court_id
                scheduled_time = str(placement.get("scheduled_time") or "")
                day_date = str(placement.get("day_date") or "")
                # Only auto-publish entries that actually got a slot.
                new_status = "planned" if (court_id and scheduled_time) else None
                assignments = [
                    "court_id = ?",
                    "court_label = ?",
                    "scheduled_time = ?",
                    "updated_at = ?",
                ]
                values: List[Any] = [court_id, court_label, scheduled_time, now]
                if day_date:
                    assignments.insert(0, "day_date = ?")
                    values.insert(0, day_date)
                if new_status:
                    assignments.append(
                        "status = CASE WHEN status IN ('in_progress','completed') THEN status ELSE ? END"
                    )
                    values.append(new_status)
                values.extend([schedule_id, tournament_id])
                cursor.execute(
                    f"UPDATE tournament_schedule SET {', '.join(assignments)} "
                    f"WHERE id = ? AND tournament_id = ?",
                    values,
                )
            conn.commit()
    except Exception as e:
        logger.error("apply_autoschedule_error", error=str(e), tournament_id=tournament_id)
    return fetch_tournament_schedule(tournament_id)


def move_schedule_entry_with_cascade(
    tournament_id: int,
    schedule_id: int,
    *,
    court_id: str,
    scheduled_time: Optional[str] = None,
    day_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Move one entry to a court/time and re-cascade times on the affected courts.

    Moves the entry onto the target court (optionally at a requested time), then recomputes
    sequential start times for every entry on both the source and target courts for that day,
    using the configured slot lengths.
    """
    from .services import auto_scheduler

    config = get_autoscheduler_config(tournament_id)
    schedule = fetch_tournament_schedule(tournament_id)
    moved = next((e for e in schedule if int(e["id"]) == int(schedule_id)), None)
    if not moved:
        return schedule

    source_court = str(moved.get("court_id") or "")
    target_court = str(court_id or source_court)
    target_day = str(day_date or moved.get("day_date") or "")
    courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}

    # Apply the move in-memory first.
    moved["court_id"] = target_court
    moved["court_label"] = courts.get(target_court, {}).get("name") or target_court
    if day_date:
        moved["day_date"] = target_day
    if scheduled_time:
        moved["scheduled_time"] = str(scheduled_time)

    def _court_entries(court, day):
        items = [
            e
            for e in schedule
            if str(e.get("court_id") or "") == court and str(e.get("day_date") or "") == day
        ]
        items.sort(key=lambda e: (str(e.get("scheduled_time") or "99:99"), int(e.get("sort_order") or 0), int(e.get("id") or 0)))
        return items

    updates: List[Dict[str, Any]] = []

    # Target court: pin the moved match at its drop time, cascade only the matches after it
    # (matches earlier on the court keep their times). This matches the "shift by slot" mental model.
    target_entries = _court_entries(target_court, target_day)
    if scheduled_time:
        pivot_index = next(
            (i for i, e in enumerate(target_entries) if int(e["id"]) == int(schedule_id)), 0
        )
        cursor = str(moved.get("scheduled_time") or "")
        for entry in target_entries[pivot_index:]:
            band = auto_scheduler.normalize_band(entry.get("category_name") or entry.get("group_name"))
            entry["scheduled_time"] = cursor
            cursor = auto_scheduler.add_minutes(
                cursor,
                auto_scheduler._slot_minutes_for_court(target_court, config, band),
            )
        updates.extend(target_entries)
    else:
        updates.extend(auto_scheduler.recompute_court_times(target_entries, config))

    # Source court (if different): close the gap left behind by cascading from its start.
    source_day = str(moved.get("day_date") or target_day)
    if source_court and (source_court, source_day) != (target_court, target_day):
        updates.extend(auto_scheduler.recompute_court_times(_court_entries(source_court, source_day), config))

    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            for entry in updates:
                cursor.execute(
                    """
                    UPDATE tournament_schedule
                    SET court_id = ?, court_label = ?, day_date = ?, scheduled_time = ?,
                        status = CASE WHEN status IN ('in_progress','completed') THEN status
                                      WHEN status = 'draft' THEN 'planned' ELSE status END,
                        updated_at = ?
                    WHERE id = ? AND tournament_id = ?
                    """,
                    (
                        str(entry.get("court_id") or ""),
                        courts.get(str(entry.get("court_id") or ""), {}).get("name") or str(entry.get("court_id") or ""),
                        str(entry.get("day_date") or ""),
                        str(entry.get("scheduled_time") or ""),
                        now,
                        int(entry["id"]),
                        tournament_id,
                    ),
                )
            conn.commit()
    except Exception as e:
        logger.error("move_schedule_cascade_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
    return fetch_tournament_schedule(tournament_id)


def unassign_schedule_entry(
    tournament_id: int,
    schedule_id: int,
    *,
    day_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Move a schedule entry back to the unassigned pool (no court/time)."""
    from .services import auto_scheduler

    config = get_autoscheduler_config(tournament_id)
    schedule = fetch_tournament_schedule(tournament_id)
    moved = next((e for e in schedule if int(e["id"]) == int(schedule_id)), None)
    if not moved:
        return schedule

    source_court = str(moved.get("court_id") or "")
    source_day = str(day_date or moved.get("day_date") or "")
    now = _utc_now()
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE tournament_schedule
                SET court_id = '', court_label = '', scheduled_time = '', updated_at = ?
                WHERE id = ? AND tournament_id = ?
                """,
                (now, int(schedule_id), tournament_id),
            )
            conn.commit()
    except Exception as e:
        logger.error("unassign_schedule_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
        return schedule

    if source_court and source_day:
        remaining = [
            e
            for e in fetch_tournament_schedule(tournament_id)
            if str(e.get("court_id") or "") == source_court and str(e.get("day_date") or "") == source_day
        ]
        remaining.sort(
            key=lambda e: (
                str(e.get("scheduled_time") or "99:99"),
                int(e.get("sort_order") or 0),
                int(e.get("id") or 0),
            )
        )
        updates = auto_scheduler.recompute_court_times(remaining, config)
        courts = {str(c.get("kort_id")): c for c in fetch_courts_for_tournament(tournament_id)}
        now = _utc_now()
        try:
            with db_conn() as conn:
                cursor = conn.cursor()
                for entry in updates:
                    cursor.execute(
                        """
                        UPDATE tournament_schedule
                        SET scheduled_time = ?, updated_at = ?
                        WHERE id = ? AND tournament_id = ?
                        """,
                        (
                            str(entry.get("scheduled_time") or ""),
                            now,
                            int(entry["id"]),
                            tournament_id,
                        ),
                    )
                conn.commit()
        except Exception as e:
            logger.error("unassign_schedule_cascade_error", error=str(e), tournament_id=tournament_id, schedule_id=schedule_id)
    return fetch_tournament_schedule(tournament_id)


def delete_unassigned_schedule_entries(
    tournament_id: int,
    *,
    day_date: Optional[str] = None,
) -> int:
    """Delete schedule entries with no court or time assigned (optionally for one day)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            params: List[Any] = [tournament_id]
            query = """
                DELETE FROM tournament_schedule
                WHERE tournament_id = ?
                  AND (COALESCE(court_id, '') = '' OR COALESCE(scheduled_time, '') = '')
            """
            if day_date:
                query += " AND day_date = ?"
                params.append(str(day_date).strip())
            cursor.execute(query, params)
            conn.commit()
            return int(cursor.rowcount or 0)
    except Exception as e:
        logger.error("delete_unassigned_schedule_error", error=str(e), tournament_id=tournament_id)
        return 0


def _find_group_matches(cursor, player_names: List[str], start_date: str, end_date: str, tournament_id: Optional[int] = None) -> List[Dict]:
    """Find finished matches between a set of players within a date range.
    
    Uses exact name matching plus surname-based fallback to handle mixed storage,
    where some rows use full names and others only surnames.
    """
    if len(player_names) < 2:
        return []
    placeholders = ",".join("?" for _ in player_names)
    end_ts = end_date + "T23:59:59"
    tournament_clause = "AND tournament_id = ?" if tournament_id is not None else ""
    tournament_params = [tournament_id] if tournament_id is not None else []
    phase_clause = "AND phase IN (?, ?)"
    phase_params = (GROUP_PHASE, GROUP_REMATCH_PHASE)
    # Try exact match first
    cursor.execute(f"""
         SELECT id, player1_name, player2_name, player1_sets, player2_sets,
             sets_history, created_at, winner_name, finish_reason, result_note
        FROM matches
        WHERE status = 'finished'
           AND COALESCE(finish_reason, 'normal') != 'test'
          {tournament_clause}
          {phase_clause}
          AND player1_name IN ({placeholders})
          AND player2_name IN ({placeholders})
          AND created_at >= ?
          AND created_at <= ?
        ORDER BY created_at
    """, (*tournament_params, *phase_params, *player_names, *player_names, start_date, end_ts))
    exact_results = [dict(row) for row in cursor.fetchall()]

    # Fallback: surname-based matching (bracket stores "Kowalski" but match has "Jan Kowalski")
    # Build a map of surname -> bracket_name for renaming results
    surnames = []
    for name in player_names:
        parts = name.strip().split()
        surname = parts[-1] if parts else name
        surnames.append(surname)

    like_conditions = []
    like_params = []
    for surname in surnames:
        like_conditions.append("player1_name LIKE ?")
        like_params.append(f"%{surname}")
    p1_cond = " OR ".join(like_conditions)

    like_conditions2 = []
    like_params2 = []
    for surname in surnames:
        like_conditions2.append("player2_name LIKE ?")
        like_params2.append(f"%{surname}")
    p2_cond = " OR ".join(like_conditions2)

    cursor.execute(f"""
         SELECT id, player1_name, player2_name, player1_sets, player2_sets,
             sets_history, created_at, winner_name, finish_reason, result_note
        FROM matches
        WHERE status = 'finished'
                  AND COALESCE(finish_reason, 'normal') != 'test'
                    {tournament_clause}
                    {phase_clause}
          AND ({p1_cond})
          AND ({p2_cond})
          AND created_at >= ?
          AND created_at <= ?
        ORDER BY created_at
        """, (*tournament_params, *phase_params, *like_params, *like_params2, start_date, end_ts))
    raw_results = cursor.fetchall()
    if not exact_results and not raw_results:
        return []

    # Build surname -> bracket_name lookup
    surname_to_bracket = {}
    for name in player_names:
        parts = name.strip().split()
        surname = parts[-1].lower() if parts else name.lower()
        surname_to_bracket[surname] = name

    # Remap match player names to bracket names
    seen_pairs = {
        tuple(sorted((row["player1_name"], row["player2_name"])))
        for row in exact_results
        if row.get("player1_name") and row.get("player2_name")
    }
    remapped = []
    for row in raw_results:
        r = dict(row)
        p1_surname = r["player1_name"].strip().split()[-1].lower() if r["player1_name"] else ""
        p2_surname = r["player2_name"].strip().split()[-1].lower() if r["player2_name"] else ""
        bracket_p1 = surname_to_bracket.get(p1_surname)
        bracket_p2 = surname_to_bracket.get(p2_surname)
        if bracket_p1 and bracket_p2 and bracket_p1 != bracket_p2:
            pair_key = tuple(sorted((bracket_p1, bracket_p2)))
            if pair_key in seen_pairs:
                continue
            r["player1_name"] = bracket_p1
            r["player2_name"] = bracket_p2
            remapped.append(r)
            seen_pairs.add(pair_key)

    merged = list(exact_results)
    seen_ids = {int(row["id"]) for row in exact_results if row.get("id") is not None}
    for row in remapped:
        row_id = row.get("id")
        if row_id is not None and int(row_id) in seen_ids:
            continue
        merged.append(row)
        if row_id is not None:
            seen_ids.add(int(row_id))

    merged.sort(key=lambda row: row.get("created_at") or "")
    return merged


def _is_stb(s: dict) -> bool:
    """Detect super tiebreak set (set 3+ with low games and TB points)."""
    if s.get("is_super_tiebreak", False):
        return True
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return (s.get("set_number", 0) >= 3 and max(g1, g2) <= 1
            and s.get("tiebreak_loser_points") is not None)


def _is_empty_set(s: dict) -> bool:
    """Skip junk 0:0 sets (app initialised set 3 but match ended in 2)."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    return g1 == 0 and g2 == 0 and s.get("tiebreak_loser_points") is None


def _build_set_detail(s: dict, flipped: bool = False) -> dict:
    """Build per-set scoreboard data. For STB, use actual TB points."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    tb = s.get("tiebreak_loser_points")
    stb = _is_stb(s)
    if stb and tb is not None:
        # STB: convert games 0/1 → actual tiebreak points
        # Winner gets max(10, tb+2), loser gets tb
        winner_pts = max(10, tb + 2)
        if g1 > g2:  # player1 won STB
            g1, g2 = winner_pts, tb
        else:
            g1, g2 = tb, winner_pts
        tb = None  # no separate TB display needed
    if flipped:
        g1, g2 = g2, g1
    return {"g1": g1, "g2": g2, "tb": tb, "stb": stb}


def _format_set_score(s: dict, flipped: bool = False) -> str:
    """Format a single set score string."""
    g1, g2 = s.get("player1_games", 0), s.get("player2_games", 0)
    if flipped:
        g1, g2 = g2, g1
    tb = s.get("tiebreak_loser_points")
    if _is_stb(s):
        return f"STB {g1}:{g2}" if tb is None else f"STB [{g1}:{g2}({tb})]"
    if tb is not None:
        return f"{g1}:{g2}({tb})"
    return f"{g1}:{g2}"


def _compute_standings(player_names: List[str], matches) -> tuple:
    """Compute standings from a list of matches. Returns (standings, match_results)."""
    stats = {name: {"wins": 0, "losses": 0, "sets_won": 0, "sets_lost": 0,
                     "games_won": 0, "games_lost": 0, "played": 0}
             for name in player_names}

    match_results = []
    for m in matches:
        p1, p2 = m["player1_name"], m["player2_name"]
        s1, s2 = m["player1_sets"], m["player2_sets"]
        sh = json.loads(m["sets_history"]) if m["sets_history"] else []
        sh = [s for s in sh if not _is_empty_set(s)]

        if p1 not in stats or p2 not in stats:
            continue

        stats[p1]["played"] += 1
        stats[p2]["played"] += 1

        winner = m.get("winner_name") if isinstance(m, dict) else None
        if winner == p1:
            stats[p1]["wins"] += 1
            stats[p2]["losses"] += 1
        elif winner == p2:
            stats[p2]["wins"] += 1
            stats[p1]["losses"] += 1
        elif s1 > s2:
            stats[p1]["wins"] += 1
            stats[p2]["losses"] += 1
            winner = p1
        elif s2 > s1:
            stats[p2]["wins"] += 1
            stats[p1]["losses"] += 1
            winner = p2

        stats[p1]["sets_won"] += s1
        stats[p1]["sets_lost"] += s2
        stats[p2]["sets_won"] += s2
        stats[p2]["sets_lost"] += s1

        for s in sh:
            if not _is_stb(s):
                stats[p1]["games_won"] += s.get("player1_games", 0)
                stats[p1]["games_lost"] += s.get("player2_games", 0)
                stats[p2]["games_won"] += s.get("player2_games", 0)
                stats[p2]["games_lost"] += s.get("player1_games", 0)

        # Build per-set score arrays for scoreboard display
        sets_detail = [_build_set_detail(s) for s in sh]

        # Build score string
        score_parts = []
        for s in sh:
            score_parts.append(_format_set_score(s))

        match_results.append({
            "match_id": m["id"],
            "player_a": p1,
            "player_b": p2,
            "score": "  ".join(score_parts),
            "sets": sets_detail,
            "winner": winner,
            "sets_a": s1,
            "sets_b": s2,
            "finish_reason": m.get("finish_reason") if isinstance(m, dict) else None,
            "result_note": m.get("result_note") if isinstance(m, dict) else None,
        })

    # Sort: wins desc, set_diff desc, game_diff desc
    standings = []
    for name, s in stats.items():
        standings.append({
            "name": name,
            **s,
            "set_diff": s["sets_won"] - s["sets_lost"],
            "game_diff": s["games_won"] - s["games_lost"],
        })
    standings.sort(key=lambda x: (x["wins"], x["set_diff"], x["game_diff"]), reverse=True)
    return standings, match_results


def save_bracket_knockout(tournament_id: int, slots: List[Dict]) -> bool:
    """Save knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM bracket_knockout WHERE tournament_id = ?", (tournament_id,))
            for slot in slots:
                cursor.execute(
                    "INSERT INTO bracket_knockout (tournament_id, phase, position, "
                    "player1_name, player2_name, winner_name, score_summary, finish_reason, result_note) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (tournament_id, slot["phase"], slot.get("position", 1),
                     slot.get("player1_name"), slot.get("player2_name"),
                     slot.get("winner_name"), slot.get("score_summary"),
                     slot.get("finish_reason", "normal"), slot.get("result_note"))
                )
            conn.commit()
            logger.info("bracket_knockout_saved", tournament_id=tournament_id, count=len(slots))
            return True
    except Exception as e:
        logger.error("save_bracket_knockout_error", error=str(e))
        return False


def fetch_bracket_knockout(tournament_id: int) -> List[Dict]:
    """Get knockout bracket slots."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, phase, position, player1_name, player2_name, winner_name, score_summary, finish_reason, result_note "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_bracket_knockout_error", error=str(e))
        return []


def _detect_knockout_result(
    cursor,
    p1: str,
    p2: str,
    start_date: str,
    end_date: str,
    tournament_id: Optional[int] = None,
    phase: Optional[str] = None,
) -> Optional[Dict]:
    """Try to find a finished match between two specific players."""
    if not p1 or not p2:
        return None

    end_ts = end_date + "T23:59:59"
    tournament_clause = "AND tournament_id = ?" if tournament_id is not None else ""
    tournament_params = [tournament_id] if tournament_id is not None else []
    surname1 = p1.strip().split()[-1] if p1.strip() else p1
    surname2 = p2.strip().split()[-1] if p2.strip() else p2

    def _fetch_finished_match(match_phase: Optional[str]) -> Optional[sqlite3.Row]:
        phase_clause = "AND phase = ?" if match_phase else ""
        phase_params = [match_phase] if match_phase else []
        cursor.execute(f"""
                        SELECT player1_name, player2_name, player1_sets, player2_sets, sets_history,
                                     winner_name, finish_reason, result_note
            FROM matches
            WHERE status = 'finished'
                            AND COALESCE(finish_reason, 'normal') != 'test'
              {tournament_clause}
              {phase_clause}
              AND ((player1_name = ? AND player2_name = ?) OR (player1_name = ? AND player2_name = ?))
              AND created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (*tournament_params, *phase_params, p1, p2, p2, p1, start_date, end_ts))
        row = cursor.fetchone()
        if row:
            return row
        cursor.execute(f"""
                        SELECT player1_name, player2_name, player1_sets, player2_sets, sets_history,
                                     winner_name, finish_reason, result_note
            FROM matches
            WHERE status = 'finished'
                            AND COALESCE(finish_reason, 'normal') != 'test'
              {tournament_clause}
              {phase_clause}
              AND ((player1_name LIKE ? AND player2_name LIKE ?)
                OR (player1_name LIKE ? AND player2_name LIKE ?))
              AND created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (*tournament_params, *phase_params, f"%{surname1}", f"%{surname2}", f"%{surname2}", f"%{surname1}", start_date, end_ts))
        return cursor.fetchone()

    row = _fetch_finished_match(phase)
    if not row and phase and phase != "Pucharowa":
        row = _fetch_finished_match("Pucharowa")
    if not row and not phase:
        row = _fetch_finished_match(None)

    if not row:
        return None

    p1_surname = p1.strip().split()[-1].lower() if p1.strip() else ""
    match_p1_surname = row["player1_name"].strip().split()[-1].lower() if row["player1_name"] else ""
    flipped = match_p1_surname != p1_surname

    sh = json.loads(row["sets_history"]) if row["sets_history"] else []
    sh = [s for s in sh if not _is_empty_set(s)]
    score_parts = [_format_set_score(s, flipped) for s in sh]
    sets_detail = [_build_set_detail(s, flipped) for s in sh]

    match_winner = row["winner_name"] or (row["player1_name"] if row["player1_sets"] > row["player2_sets"] else row["player2_name"])
    winner_surname = match_winner.strip().split()[-1].lower() if match_winner else ""
    if winner_surname == p1.strip().split()[-1].lower():
        winner = p1
    elif winner_surname == p2.strip().split()[-1].lower():
        winner = p2
    else:
        winner = match_winner
    return {
        "winner": winner,
        "score": "  ".join(score_parts),
        "sets": sets_detail,
        "finish_reason": row["finish_reason"],
        "result_note": row["result_note"],
    }


def get_full_bracket(tournament_id: int) -> Dict:
    """Get complete bracket data for a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()

            # Tournament info
            cursor.execute("SELECT name, start_date, end_date FROM tournaments WHERE id = ?", (tournament_id,))
            t = cursor.fetchone()
            if not t:
                return {"error": "Tournament not found"}

            start_date = t["start_date"]
            end_date = t["end_date"]

            # Groups + standings
            cursor.execute(
                "SELECT id, name FROM bracket_groups WHERE tournament_id = ? ORDER BY order_num",
                (tournament_id,)
            )
            group_rows = cursor.fetchall()

            groups_data = []
            for g in group_rows:
                cursor.execute(
                    "SELECT player_name FROM bracket_group_players WHERE group_id = ?",
                    (g["id"],)
                )
                player_names = [r["player_name"] for r in cursor.fetchall()]
                matches = _find_group_matches(cursor, player_names, start_date, end_date, tournament_id)
                standings, match_results = _compute_standings(player_names, matches)
                groups_data.append({
                    "name": g["name"],
                    "standings": standings,
                    "matches": match_results,
                })

            # Knockout
            cursor.execute(
                "SELECT phase, position, player1_name, player2_name, winner_name, score_summary, finish_reason, result_note "
                "FROM bracket_knockout WHERE tournament_id = ? ORDER BY phase, position",
                (tournament_id,)
            )
            knockout_rows = cursor.fetchall()

            knockout = {}
            for r in knockout_rows:
                phase = r["phase"]
                slot = {
                    "position": r["position"],
                    "player1": r["player1_name"],
                    "player2": r["player2_name"],
                    "winner": r["winner_name"],
                    "score": r["score_summary"],
                    "finish_reason": r["finish_reason"],
                    "result_note": r["result_note"],
                    "sets": None,
                }
                # Auto-detect result from match data (always, to populate sets)
                if slot["player1"] and slot["player2"]:
                    result = _detect_knockout_result(
                        cursor, slot["player1"], slot["player2"], start_date, end_date, tournament_id, phase
                    )
                    if result:
                        if not slot["winner"]:
                            slot["winner"] = result["winner"]
                            slot["score"] = result["score"]
                            slot["finish_reason"] = result.get("finish_reason")
                            slot["result_note"] = result.get("result_note")
                        slot["sets"] = result.get("sets")

                knockout.setdefault(phase, []).append(slot)

            return {
                "tournament": {
                    "id": tournament_id,
                    "name": t["name"],
                },
                "groups": groups_data,
                "knockout": knockout,
            }
    except Exception as e:
        logger.error("get_full_bracket_error", error=str(e))
        return {"error": str(e)}


def generate_knockout_from_standings(tournament_id: int) -> Dict:
    """Auto-generate knockout bracket from completed group standings."""
    try:
        bracket = get_full_bracket(tournament_id)
        generated = _compute_knockout_slots_from_bracket(bracket.get("groups", []))
        if generated.get("error"):
            return generated
        slots = generated.get("knockout", [])

        save_bracket_knockout(tournament_id, slots)
        ensure_knockout_schedule_entries(tournament_id)
        return {"status": "ok", "knockout": slots}
    except Exception as e:
        logger.error("generate_knockout_error", error=str(e))
        return {"error": str(e)}


