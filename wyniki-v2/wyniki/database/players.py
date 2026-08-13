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

def _normalize_player_name(value: Optional[str]) -> str:
    """Normalize player names for tolerant exact matching."""
    return " ".join((value or "").strip().lower().split())

def _player_surname(value: Optional[str]) -> str:
    """Return the normalized surname/token used by mobile clients.

    Pair labels must not be reduced to the second partner's last name.
    """
    from ..services.teams import is_team_display_name

    if is_team_display_name(value):
        return ""
    normalized = _normalize_player_name(value)
    if not normalized:
        return ""
    return normalized.split()[-1]

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
