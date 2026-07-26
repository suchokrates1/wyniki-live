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

from .connection import db_conn

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
