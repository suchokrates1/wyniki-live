"""What the public player profile is built from: entries and match history that count.

A tournament counts when it is public, is not a simulation, and has statistics turned
on. That rule lived in the admin blueprint beside the queries it filtered; both belong
here, so a handler asks for "the matches that count" instead of spelling it out again.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, or_

from ..db_models import GlobalPlayer, Match, MatchHistory, Player, Tournament, db


def website_tournament_filter():
    """Public, and not one of the simulations the app store robot plays in."""
    return (Tournament.is_public == 1) & (func.coalesce(Tournament.is_simulation, 0) == 0)


def website_stats_filter():
    """The same, and counting towards the players' statistics."""
    return website_tournament_filter() & (Tournament.stats_enabled == 1)


def _history_of_counting_tournaments():
    """A history row with no tournament is from before they were recorded; it counts."""
    return (
        db.session.query(MatchHistory)
        .outerjoin(Tournament, MatchHistory.tournament_id == Tournament.id)
        .filter((MatchHistory.tournament_id.is_(None)) | website_stats_filter())
    )


def entries_in_counting_tournaments() -> list[Player]:
    """Every entry of every counting tournament, newest tournament first."""
    return (
        db.session.query(Player)
        .join(Tournament)
        .filter(website_stats_filter())
        .order_by(Tournament.start_date.desc(), Tournament.id.desc(), Player.id.desc())
        .all()
    )


def counting_entries_of_global_player(global_player_id: int) -> list[Player]:
    return (
        db.session.query(Player)
        .join(Tournament)
        .filter(Player.global_player_id == global_player_id, website_stats_filter())
        .all()
    )


def counting_entries_named(first_name: Optional[str], last_name: str) -> list[Player]:
    """Entries of someone who was never linked to the shared base."""
    return (
        db.session.query(Player)
        .join(Tournament)
        .filter(Player.last_name == last_name, Player.first_name == first_name, website_stats_filter())
        .all()
    )


def counting_history_for(name: str) -> list[MatchHistory]:
    """Those matches, newest first."""
    return (
        _history_of_counting_tournaments()
        .filter(or_(MatchHistory.player_a == name, MatchHistory.player_b == name))
        .order_by(MatchHistory.ended_ts.desc())
        .all()
    )


def phases_of_matches(match_ids) -> dict[int, str]:
    """The phase each of these matches was played in."""
    ids = [int(mid) for mid in match_ids if mid]
    if not ids:
        return {}
    return {
        row.id: (row.phase or "")
        for row in db.session.query(Match).filter(Match.id.in_(ids)).all()
    }


def counting_tournament_ids() -> set[int]:
    """Tournaments the public may be shown at all."""
    return {row.id for row in db.session.query(Tournament).filter(website_stats_filter()).all()}


def global_player_matching(first_name: Optional[str], last_name: Optional[str]) -> Optional[GlobalPlayer]:
    """The base row for a name on an entry, ignoring case and stray spaces."""
    return (
        db.session.query(GlobalPlayer)
        .filter(
            func.lower(func.trim(GlobalPlayer.first_name)) == (first_name or "").strip().lower(),
            func.lower(func.trim(GlobalPlayer.last_name)) == (last_name or "").strip().lower(),
        )
        .first()
    )
