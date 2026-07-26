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

from .connection import _default_simulation_office_password_hash, db_conn, fetch_app_settings, upsert_app_settings

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

def _tournament_quick_info_key(tournament_id: int) -> str:
    return f"tournament_quick_info:{int(tournament_id)}"

def get_tournament_quick_info(tournament_id: int) -> Dict[str, Any]:
    """Return the office-authored quick info banner for a tournament."""
    default = {"message": "", "active": False, "updated_at": None}
    stored = fetch_app_settings([_tournament_quick_info_key(tournament_id)]).get(
        _tournament_quick_info_key(tournament_id)
    )
    if not stored:
        return default
    try:
        data = json.loads(stored)
        if not isinstance(data, dict):
            return default
        return {
            "message": str(data.get("message") or "").strip(),
            "active": bool(data.get("active")),
            "updated_at": data.get("updated_at"),
        }
    except (ValueError, TypeError):
        return default

def save_tournament_quick_info(
    tournament_id: int,
    message: str,
    *,
    active: bool = True,
) -> Dict[str, Any]:
    """Persist quick info shown as a public banner on the live site."""
    from ..db_models import utc_now_iso

    normalized = str(message or "").strip()[:2000]
    payload = {
        "message": normalized,
        "active": bool(active),
        "updated_at": utc_now_iso(),
    }
    upsert_app_settings({_tournament_quick_info_key(tournament_id): json.dumps(payload, ensure_ascii=False)})
    return get_tournament_quick_info(tournament_id)

def get_public_tournament_quick_info(tournament_id: int) -> Optional[Dict[str, Any]]:
    """Return active quick info for the public site, or None when hidden/empty."""
    info = get_tournament_quick_info(tournament_id)
    if not info.get("active") or not info.get("message"):
        return None
    return {"message": info["message"], "updated_at": info.get("updated_at")}
