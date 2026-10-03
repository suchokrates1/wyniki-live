"""The shared player base, read for the admin: who is in it, and where they played.

These are the queries the global-players screens used to write inline. They live here
for the same reason the rest of this package does: a handler asks for rows, it does not
hold the session they come from.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, or_

from ..db_models import GlobalPlayer, Player, Tournament, db


def _trimmed_lower(column):
    return func.lower(func.trim(column))


def global_player_count() -> int:
    """How many people the shared base holds."""
    return db.session.query(GlobalPlayer).count()


def global_player_by_name(first_name: str, last_name: str) -> Optional[GlobalPlayer]:
    """One person by name, ignoring case and stray spaces."""
    return (
        db.session.query(GlobalPlayer)
        .filter(
            _trimmed_lower(GlobalPlayer.first_name) == (first_name or "").strip().lower(),
            _trimmed_lower(GlobalPlayer.last_name) == (last_name or "").strip().lower(),
        )
        .first()
    )


def global_players_with_surname(surname: str) -> list[GlobalPlayer]:
    """Everyone sharing one surname, for the duplicate review."""
    return (
        db.session.query(GlobalPlayer)
        .filter(_trimmed_lower(GlobalPlayer.last_name) == surname)
        .all()
    )


def global_players_without_first_name() -> list[GlobalPlayer]:
    """Rows imported from a start list that only had surnames."""
    return (
        db.session.query(GlobalPlayer)
        .filter(or_(GlobalPlayer.first_name.is_(None), func.trim(GlobalPlayer.first_name) == ""))
        .order_by(GlobalPlayer.last_name)
        .all()
    )


def entries_of_global_player(global_player_id: int) -> list[Player]:
    """Every tournament entry linked to this person."""
    return db.session.query(Player).filter_by(global_player_id=global_player_id).all()


def entries_count_of_global_player(global_player_id: int) -> int:
    return db.session.query(Player).filter_by(global_player_id=global_player_id).count()


def counting_tournaments_of_global_player(global_player_id: int) -> int:
    """How many tournaments that count towards statistics this person has played."""
    return (
        db.session.query(Player)
        .join(Tournament, Player.tournament_id == Tournament.id)
        .filter(Player.global_player_id == global_player_id, Tournament.stats_enabled == 1)
        .count()
    )


def entries_named(first_name: str, last_name: str) -> list[Player]:
    """Entries carrying exactly this name, used when filling the base from old tournaments."""
    return db.session.query(Player).filter_by(first_name=first_name, last_name=last_name).all()


def entries_named_loosely(first_name: str, last_name: str) -> list[Player]:
    """Same, ignoring case and stray spaces."""
    return (
        db.session.query(Player)
        .filter(
            _trimmed_lower(Player.first_name) == (first_name or "").strip().lower(),
            _trimmed_lower(Player.last_name) == (last_name or "").strip().lower(),
        )
        .all()
    )


def entry_of_global_player_in_tournament(tournament_id: int, global_player_id: int) -> Optional[Player]:
    return (
        db.session.query(Player)
        .filter_by(tournament_id=tournament_id, global_player_id=global_player_id)
        .first()
    )


def entry_named_in_tournament(tournament_id: int, first_name: str, last_name: str) -> Optional[Player]:
    return (
        db.session.query(Player)
        .filter(
            Player.tournament_id == tournament_id,
            _trimmed_lower(Player.first_name) == (first_name or "").strip().lower(),
            _trimmed_lower(Player.last_name) == (last_name or "").strip().lower(),
        )
        .first()
    )


def search_global_players(
    query_text: str = "",
    gender: str = "",
    category: str = "",
    country: str = "",
) -> list[Any]:
    """The base as the admin list shows it: filtered, in surname order."""
    rows = db.session.query(GlobalPlayer)
    text = (query_text or "").strip()
    if text:
        like = f"%{text}%"
        rows = rows.filter(
            or_(GlobalPlayer.first_name.ilike(like), GlobalPlayer.last_name.ilike(like))
        )
    if gender:
        rows = rows.filter(GlobalPlayer.gender == gender)
    if category:
        rows = rows.filter(GlobalPlayer.category == category)
    if country:
        rows = rows.filter(func.upper(GlobalPlayer.country) == country.upper())
    return rows.order_by(GlobalPlayer.last_name, GlobalPlayer.first_name).all()
