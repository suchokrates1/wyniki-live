"""Rows the emulator E2E run leaves behind, found and removed by their marker.

Only this package knows how an "E2E-" marker maps onto tournaments, matches,
statistics, history and base players; the endpoint asks for them by name.
"""
from __future__ import annotations

from typing import Any, Optional

from ..db_models import Court, GlobalPlayer, Match, MatchHistory, MatchStatistics, Tournament, db


def _named_like(marker: str) -> str:
    return f"%{marker}%"


def _match_filter(marker: str):
    like = _named_like(marker)
    return (Match.player1_name.like(like)) | (Match.player2_name.like(like))


def _history_filter(marker: str, match_ids: list[int]):
    like = _named_like(marker)
    rule = (MatchHistory.player_a.like(like)) | (MatchHistory.player_b.like(like))
    return rule | MatchHistory.match_id.in_(match_ids) if match_ids else rule


def e2e_tournaments(marker: str) -> list[Tournament]:
    return (
        db.session.query(Tournament)
        .filter(Tournament.name.like(f"{marker}%"))
        .order_by(Tournament.id.desc())
        .all()
    )


def e2e_matches(marker: str) -> list[Match]:
    return db.session.query(Match).filter(_match_filter(marker)).order_by(Match.id.desc()).all()


def e2e_history(marker: str, match_ids: list[int]) -> list[MatchHistory]:
    return (
        db.session.query(MatchHistory)
        .filter(_history_filter(marker, match_ids))
        .order_by(MatchHistory.id.desc())
        .all()
    )


def e2e_statistics(match_ids: list[int]) -> list[MatchStatistics]:
    if not match_ids:
        return []
    return db.session.query(MatchStatistics).filter(MatchStatistics.match_id.in_(match_ids)).all()


def delete_e2e_matches(match_ids: list[int]) -> tuple[int, int]:
    """Remove the statistics first, then the matches. Returns how many of each."""
    if not match_ids:
        return 0, 0
    statistics = (
        db.session.query(MatchStatistics)
        .filter(MatchStatistics.match_id.in_(match_ids))
        .delete(synchronize_session=False)
    )
    matches = db.session.query(Match).filter(Match.id.in_(match_ids)).delete(synchronize_session=False)
    return statistics, matches


def delete_e2e_history(marker: str, match_ids: list[int]) -> int:
    return db.session.query(MatchHistory).filter(_history_filter(marker, match_ids)).delete(
        synchronize_session=False
    )


def delete_e2e_global_players(marker: str) -> int:
    like = _named_like(marker)
    return (
        db.session.query(GlobalPlayer)
        .filter((GlobalPlayer.first_name.like(like)) | (GlobalPlayer.last_name.like(like)))
        .delete(synchronize_session=False)
    )


def matches_in_progress(court_id: Optional[str] = None) -> list[Match]:
    """What the director's remote lists: matches a tablet still has open."""
    rows = db.session.query(Match).filter_by(status="in_progress")
    if court_id:
        rows = rows.filter_by(court_id=court_id)
    return rows.order_by(Match.updated_at.desc()).all()


def court_names(court_ids) -> dict[str, str]:
    ids = [cid for cid in court_ids if cid]
    if not ids:
        return {}
    rows: list[Any] = db.session.query(Court).filter(Court.kort_id.in_(ids)).all()
    return {row.kort_id: str(row.name or "").strip() for row in rows}
