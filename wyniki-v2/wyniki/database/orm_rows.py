"""The only ORM read door.

Request handlers ask for a row by id, or for one of the counts the admin lists
need, instead of holding `db.session` themselves. Together with unit_of_work.py
this keeps the session in one package: nothing above this layer can open a
second connection beside it, or cache a row the next read will contradict.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import func

from ..db_models import GlobalPlayer, Match, Player, Tournament, db


def get_row(model, row_id):
    """One row by primary key, or None."""
    return db.session.get(model, row_id)


def forget_row(instance) -> None:
    """Drop what the session cached for this row; the next read goes to the database."""
    db.session.expire(instance)


def forget_all_rows() -> None:
    """Same, for everything the session holds — after a delete that touched many tables."""
    db.session.expire_all()


def write_session():
    """The session itself, for the few helpers that take one (the player registry)."""
    return db.session


def tournament_counts_for_players(player_ids: Iterable[int]) -> dict[int, int]:
    """How many counting tournaments each of these players has played."""
    ids = [pid for pid in player_ids if pid]
    if not ids:
        return {}
    return dict(
        db.session.query(Player.global_player_id, func.count(Player.id))
        .join(Tournament, Player.tournament_id == Tournament.id)
        .filter(Player.global_player_id.in_(ids))
        .filter(Tournament.stats_enabled == 1)
        .group_by(Player.global_player_id)
        .all()
    )


def tournament_players_grouped_by_name() -> list[Any]:
    """Every distinct name among tournament entries, with the data seen for it.

    Used once, when filling the shared player base from tournaments entered before
    that base existed.
    """
    return (
        db.session.query(
            Player.first_name,
            Player.last_name,
            func.max(Player.gender).label("gender"),
            func.max(Player.category).label("category"),
            func.max(Player.country).label("country"),
        )
        .group_by(Player.first_name, Player.last_name)
        .all()
    )


def repeated_global_player_surnames() -> list[Any]:
    """Surnames held by more than one person in the base, for the duplicate review."""
    surname = func.lower(func.trim(GlobalPlayer.last_name))
    return (
        db.session.query(surname.label("ln"), func.count(GlobalPlayer.id).label("cnt"))
        .filter(GlobalPlayer.last_name.isnot(None), func.trim(GlobalPlayer.last_name) != "")
        .group_by(surname)
        .having(func.count(GlobalPlayer.id) > 1)
        .all()
    )


def first_row_where(model, **filters):
    """The first row matching these columns, or None — the ORM's filter_by, named."""
    return db.session.query(model).filter_by(**filters).first()


def rows_where(model, **filters) -> list[Any]:
    """Every row matching these columns."""
    return db.session.query(model).filter_by(**filters).all()


def tournament_players_by_name(tournament_id: int) -> list[Player]:
    """Every entry of a tournament, in name order — what the tablet lists."""
    return (
        db.session.query(Player)
        .filter_by(tournament_id=tournament_id)
        .order_by(Player.name)
        .all()
    )


def active_tournament_row() -> Optional[Tournament]:
    """The tournament the umpire app falls back to when a court names none."""
    return db.session.query(Tournament).filter_by(active=1).first()


def latest_match_with_uuid(client_match_uuid: str, *, by_update: bool = False) -> Optional[Match]:
    """The match a tablet means by its own id for the match, newest first.

    The tablet keeps playing offline and sends its uuid; by_update picks the one it
    touched last rather than the one created last.
    """
    rows = db.session.query(Match).filter_by(client_match_uuid=client_match_uuid)
    order = (Match.updated_at.desc(), Match.id.desc()) if by_update else (Match.id.desc(),)
    return rows.order_by(*order).first()


def latest_match_on_court(court_id: str, status: str = "in_progress") -> Optional[Match]:
    """What is open on a court right now."""
    return (
        db.session.query(Match)
        .filter_by(court_id=court_id, status=status)
        .order_by(Match.updated_at.desc(), Match.id.desc())
        .first()
    )
