"""CRUD for tournament doubles teams (pairs)."""
from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from ..config import logger
from ..services.teams import (
    format_team_display_name,
    ordered_player_ids,
    pair_key_from_player_ids,
)
from .connection import _utc_now, db_conn


class TeamValidationError(ValueError):
    """Invalid doubles pair (singles category, same person, missing players)."""


class TeamConflictError(ValueError):
    """Pair already exists in the category, or delete is blocked by group membership."""


def _player_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": int(row["id"]),
        "tournament_id": int(row["tournament_id"]),
        "name": str(row["name"] or ""),
        "first_name": str(row["first_name"] or ""),
        "last_name": str(row["last_name"] or ""),
        "category": str(row["category"] or ""),
        "country": str(row["country"] or ""),
        "gender": str(row["gender"] or ""),
    }


def _team_payload(
    row: sqlite3.Row,
    player1: Optional[Dict[str, Any]] = None,
    player2: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "id": int(row["id"]),
        "tournament_id": int(row["tournament_id"]),
        "category_id": int(row["category_id"]),
        "player1_id": int(row["player1_id"]),
        "player2_id": int(row["player2_id"]),
        "display_name": str(row["display_name"] or ""),
        "pair_key": str(row["pair_key"] or ""),
        "created_at": str(row["created_at"] or ""),
    }
    if player1 is not None:
        payload["player1"] = player1
    if player2 is not None:
        payload["player2"] = player2
    return payload


def _load_player(cursor: sqlite3.Cursor, player_id: int, tournament_id: int) -> Dict[str, Any]:
    cursor.execute(
        """
        SELECT id, tournament_id, name, first_name, last_name, category, country, gender
        FROM players
        WHERE id = ? AND tournament_id = ?
        """,
        (player_id, tournament_id),
    )
    row = cursor.fetchone()
    if not row:
        raise TeamValidationError("Player not found in this tournament")
    return _player_dict(row)


def _hydrate_team(cursor: sqlite3.Cursor, row: sqlite3.Row) -> Dict[str, Any]:
    player1 = _load_player(cursor, int(row["player1_id"]), int(row["tournament_id"]))
    player2 = _load_player(cursor, int(row["player2_id"]), int(row["tournament_id"]))
    return _team_payload(row, player1, player2)


def fetch_tournament_teams(
    tournament_id: int,
    *,
    category_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            if category_id is not None:
                cursor.execute(
                    """
                    SELECT * FROM tournament_teams
                    WHERE tournament_id = ? AND category_id = ?
                    ORDER BY display_name, id
                    """,
                    (tournament_id, category_id),
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM tournament_teams
                    WHERE tournament_id = ?
                    ORDER BY category_id, display_name, id
                    """,
                    (tournament_id,),
                )
            return [_hydrate_team(cursor, row) for row in cursor.fetchall()]
    except Exception as e:
        logger.error("fetch_tournament_teams_error", error=str(e), tournament_id=tournament_id)
        return []


def fetch_tournament_team(team_id: int) -> Optional[Dict[str, Any]]:
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tournament_teams WHERE id = ?", (team_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return _hydrate_team(cursor, row)
    except Exception as e:
        logger.error("fetch_tournament_team_error", error=str(e), team_id=team_id)
        return None


def insert_tournament_team(
    tournament_id: int,
    category_id: int,
    player1_id: int,
    player2_id: int,
) -> Dict[str, Any]:
    from .categories import fetch_tournament_category

    category = fetch_tournament_category(category_id)
    if not category or int(category["tournament_id"]) != int(tournament_id):
        raise TeamValidationError("Category not found in this tournament")
    if not category.get("is_doubles"):
        raise TeamValidationError("Cannot confirm a pair in a singles category")

    try:
        pair_key = pair_key_from_player_ids(player1_id, player2_id)
        stored_p1, stored_p2 = ordered_player_ids(player1_id, player2_id)
    except ValueError as exc:
        raise TeamValidationError(str(exc)) from exc

    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            player_a = _load_player(cursor, stored_p1, tournament_id)
            player_b = _load_player(cursor, stored_p2, tournament_id)
            display_name = format_team_display_name(player_a, player_b)
            cursor.execute(
                """
                INSERT INTO tournament_teams (
                    tournament_id, category_id, player1_id, player2_id,
                    display_name, pair_key, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tournament_id,
                    category_id,
                    stored_p1,
                    stored_p2,
                    display_name,
                    pair_key,
                    _utc_now(),
                ),
            )
            team_id = int(cursor.lastrowid)
            conn.commit()
        logger.info(
            "tournament_team_inserted",
            team_id=team_id,
            tournament_id=tournament_id,
            category_id=category_id,
        )
        team = fetch_tournament_team(team_id)
        if not team:
            raise TeamValidationError("Failed to load created team")
        return team
    except sqlite3.IntegrityError as exc:
        raise TeamConflictError("This pair already exists in the category") from exc
    except (TeamValidationError, TeamConflictError):
        raise
    except Exception as e:
        logger.error("insert_tournament_team_error", error=str(e), tournament_id=tournament_id)
        raise


def delete_tournament_team(team_id: int) -> bool:
    existing = fetch_tournament_team(team_id)
    if not existing:
        return False
    try:
        with db_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM bracket_group_players WHERE team_id = ?",
                (team_id,),
            )
            if int(cursor.fetchone()[0] or 0):
                raise TeamConflictError("Cannot delete a pair that is assigned to a group")
            cursor.execute("DELETE FROM tournament_teams WHERE id = ?", (team_id,))
            conn.commit()
            return cursor.rowcount > 0
    except TeamConflictError:
        raise
    except Exception as e:
        logger.error("delete_tournament_team_error", error=str(e), team_id=team_id)
        return False
