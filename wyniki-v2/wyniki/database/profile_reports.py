"""Reports that something on a public profile is wrong."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..db_models import ProfileReport
from .orm_rows import get_row
from .unit_of_work import add_row, commit_writes

DAILY_LIMIT = 5


def _since_yesterday() -> str:
    return (datetime.now(UTC) - timedelta(hours=24)).isoformat()


def recent_count(global_player_id: int | None, entry_id: int | None) -> int:
    query = ProfileReport.query.filter(ProfileReport.created_at >= _since_yesterday())
    if global_player_id:
        query = query.filter(ProfileReport.global_player_id == global_player_id)
    else:
        query = query.filter(ProfileReport.entry_id == entry_id)
    return query.count()


def add_report(global_player_id: int | None, entry_id: int | None, player_name: str, message: str) -> ProfileReport:
    row = ProfileReport(
        global_player_id=global_player_id,
        entry_id=entry_id,
        player_name=player_name,
        message=message,
        status="open",
        created_at=datetime.now(UTC).isoformat(),
    )
    add_row(row)
    commit_writes()
    return row


def open_reports() -> list[dict]:
    rows = (
        ProfileReport.query.filter_by(status="open")
        .order_by(ProfileReport.id.desc())
        .all()
    )
    return [row.to_dict() for row in rows]


def close_report(report_id: int) -> bool:
    row = get_row(ProfileReport, report_id)
    if row is None or row.status != "open":
        return False
    row.status = "done"
    commit_writes()
    return True
