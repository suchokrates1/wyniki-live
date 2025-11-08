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
                overlay_id TEXT
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
            cursor.execute("SELECT kort_id, overlay_id FROM courts")
            rows = cursor.fetchall()
        
        courts = [{"kort_id": row["kort_id"], "overlay_id": row["overlay_id"]} for row in rows]
        logger.debug("courts_fetched", count=len(courts))
        return courts
    except Exception as e:
        logger.error("fetch_courts_error", error=str(e))
        return []


def upsert_court(kort_id: str, overlay_id: Optional[str]) -> None:
    """Insert or update court configuration."""
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO courts (kort_id, overlay_id)
                VALUES (?, ?)
                ON CONFLICT(kort_id) DO UPDATE SET overlay_id=excluded.overlay_id
            """, (kort_id, overlay_id))
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
