"""Database access layer for v2."""
import json
import sqlite3
from contextlib import contextmanager
from typing import Dict, List, Optional, Generator, Any
from pathlib import Path

from .config import settings, logger


@contextmanager
def db_conn() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections."""
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    connection = sqlite3.connect(str(db_path), check_same_thread=False)
    connection.row_factory = sqlite3.Row
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
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Players table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                name TEXT NOT NULL,
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
                phase TEXT DEFAULT 'Grupowa'
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
        
        conn.commit()
    
    logger.info("database_initialized", db_path=settings.database_path)


def insert_match_history(entry: Dict[str, Any]) -> None:
    """Insert a match history entry."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO match_history (
                    kort_id, ended_ts, duration_seconds,
                    player_a, player_b, score_a, score_b,
                    category, phase
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.get("kort_id"),
                entry.get("ended_ts"),
                entry.get("duration_seconds", 0),
                entry.get("player_a"),
                entry.get("player_b"),
                json.dumps(entry.get("score_a", [])),
                json.dumps(entry.get("score_b", [])),
                entry.get("category"),
                entry.get("phase", "Grupowa")
            ))
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


def fetch_courts() -> List[Dict[str, Optional[str]]]:
    """Fetch all courts from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT kort_id FROM courts")
            rows = cursor.fetchall()
        
        courts = [{"kort_id": row["kort_id"]} for row in rows]
        logger.debug("courts_fetched", count=len(courts))
        return courts
    except Exception as e:
        logger.error("fetch_courts_error", error=str(e))
        return []


def insert_court(kort_id: str) -> None:
    """Insert a new court."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR IGNORE INTO courts (kort_id, active)
                VALUES (?, 1)
            """, (kort_id,))
            conn.commit()
        logger.info("court_inserted", kort_id=kort_id)
    except Exception as e:
        logger.error("insert_court_error", kort_id=kort_id, error=str(e))


def upsert_court(kort_id: str) -> None:
    """Insert or update court configuration."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO courts (kort_id, active)
                VALUES (?, 1)
                ON CONFLICT(kort_id) DO NOTHING
            """, (kort_id,))
            conn.commit()
        logger.info("court_upserted", kort_id=kort_id, overlay_id=overlay_id)
    except Exception as e:
        logger.error("upsert_court_error", kort_id=kort_id, error=str(e))


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


def fetch_match_history(limit: int = 100) -> List[Dict]:
    """Fetch match history from database."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM match_history
                ORDER BY ended_ts DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            
            result = []
            for row in rows:
                result.append({
                    "id": row["id"],
                    "kort_id": row["kort_id"],
                    "ended_ts": row["ended_ts"],
                    "duration_seconds": row["duration_seconds"],
                    "player_a": row["player_a"],
                    "player_b": row["player_b"],
                    "score_a": json.loads(row["score_a"]) if row["score_a"] else [],
                    "score_b": json.loads(row["score_b"]) if row["score_b"] else [],
                    "category": row["category"],
                    "phase": row["phase"]
                })
            return result
    except Exception as e:
        logger.error("fetch_match_history_error", error=str(e))
        return []


# ==================== TOURNAMENTS ====================

def fetch_tournaments() -> List[Dict]:
    """Fetch all tournaments."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, start_date, end_date, active, created_at
                FROM tournaments
                ORDER BY start_date DESC
            """)
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
                SELECT id, name, start_date, end_date, active, created_at
                FROM tournaments WHERE id = ?
            """, (tournament_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error("fetch_tournament_error", error=str(e), tournament_id=tournament_id)
        return None


def insert_tournament(name: str, start_date: str, end_date: str, active: bool = False) -> Optional[int]:
    """Insert a new tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tournaments (name, start_date, end_date, active)
                VALUES (?, ?, ?, ?)
            """, (name, start_date, end_date, 1 if active else 0))
            conn.commit()
            logger.info("tournament_inserted", id=cursor.lastrowid, name=name)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_tournament_error", error=str(e))
        return None


def update_tournament(tournament_id: int, name: str, start_date: str, end_date: str, active: bool) -> bool:
    """Update a tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tournaments
                SET name = ?, start_date = ?, end_date = ?, active = ?
                WHERE id = ?
            """, (name, start_date, end_date, 1 if active else 0, tournament_id))
            conn.commit()
            logger.info("tournament_updated", id=tournament_id)
            return True
    except Exception as e:
        logger.error("update_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def delete_tournament(tournament_id: int) -> bool:
    """Delete a tournament and all its players."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("tournament_deleted", id=tournament_id)
            return True
    except Exception as e:
        logger.error("delete_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


def set_active_tournament(tournament_id: int) -> bool:
    """Set a tournament as active (deactivates all others)."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            # Deactivate all
            cursor.execute("UPDATE tournaments SET active = 0")
            # Activate the selected one
            cursor.execute("UPDATE tournaments SET active = 1 WHERE id = ?", (tournament_id,))
            conn.commit()
            logger.info("active_tournament_set", id=tournament_id)
            return True
    except Exception as e:
        logger.error("set_active_tournament_error", error=str(e), tournament_id=tournament_id)
        return False


# ==================== PLAYERS ====================

def fetch_players(tournament_id: Optional[int] = None) -> List[Dict]:
    """Fetch players, optionally filtered by tournament."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if tournament_id:
                cursor.execute("""
                    SELECT id, tournament_id, name, category, country, created_at
                    FROM players
                    WHERE tournament_id = ?
                    ORDER BY name
                """, (tournament_id,))
            else:
                cursor.execute("""
                    SELECT id, tournament_id, name, category, country, created_at
                    FROM players
                    ORDER BY tournament_id DESC, name
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
                SELECT p.id, p.tournament_id, p.name, p.category, p.country, p.created_at
                FROM players p
                INNER JOIN tournaments t ON p.tournament_id = t.id
                WHERE t.active = 1
                ORDER BY p.name
            """)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error("fetch_active_tournament_players_error", error=str(e))
        return []


def insert_player(tournament_id: int, name: str, category: str = "", country: str = "") -> Optional[int]:
    """Insert a new player."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO players (tournament_id, name, category, country)
                VALUES (?, ?, ?, ?)
            """, (tournament_id, name, category, country))
            conn.commit()
            logger.info("player_inserted", id=cursor.lastrowid, name=name, tournament_id=tournament_id)
            return cursor.lastrowid
    except Exception as e:
        logger.error("insert_player_error", error=str(e))
        return None


def update_player(player_id: int, name: str, category: str, country: str) -> bool:
    """Update a player."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE players
                SET name = ?, category = ?, country = ?
                WHERE id = ?
            """, (name, category, country, player_id))
            conn.commit()
            logger.info("player_updated", id=player_id)
            return True
    except Exception as e:
        logger.error("update_player_error", error=str(e), player_id=player_id)
        return False


def delete_player(player_id: int) -> bool:
    """Delete a player."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM players WHERE id = ?", (player_id,))
            conn.commit()
            logger.info("player_deleted", id=player_id)
            return True
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
                cursor.execute("""
                    INSERT INTO players (tournament_id, name, category, country)
                    VALUES (?, ?, ?, ?)
                """, (
                    tournament_id,
                    player.get("name", ""),
                    player.get("category", ""),
                    player.get("country", "")
                ))
                count += 1
            conn.commit()
            logger.info("players_bulk_inserted", count=count, tournament_id=tournament_id)
            return count
    except Exception as e:
        logger.error("bulk_insert_players_error", error=str(e))
        return 0

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM match_history
                ORDER BY id DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
        
        history = []
        for row in rows:
            entry = dict(row)
            # Parse JSON score arrays
            if entry.get("score_a"):
                entry["score_a"] = json.loads(entry["score_a"])
            if entry.get("score_b"):
                entry["score_b"] = json.loads(entry["score_b"])
            history.append(entry)
        
        logger.debug("match_history_fetched", count=len(history))
        return history
    except Exception as e:
        logger.error("fetch_match_history_error", error=str(e))
        return []
