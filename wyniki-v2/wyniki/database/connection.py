"""Database access layer submodule."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional
from werkzeug.security import generate_password_hash

from ..config import settings, logger

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

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
