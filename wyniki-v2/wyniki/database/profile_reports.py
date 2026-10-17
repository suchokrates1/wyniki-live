"""Reports that something on a public profile is wrong."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..db_models import ProfileReport
from .connection import db_conn
from .orm_rows import get_row
from .unit_of_work import add_row, commit_writes

DAILY_LIMIT = 5


def ensure_profile_reports(cursor) -> None:
    """The table the model describes (profile_report_model.py): the app's schema is hand-written."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS profile_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_player_id INTEGER,
            entry_id INTEGER,
            player_name VARCHAR(200) NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'open',
            created_at VARCHAR(50)
        )
    """)


def _since_yesterday() -> str:
    return (datetime.now(UTC) - timedelta(hours=24)).isoformat()


def recent_count(global_player_id: int | None, entry_id: int | None) -> int:
    """Reports about this player in the last 24 hours (by the global player, else the entry)."""
    column, value = ("global_player_id", global_player_id) if global_player_id else ("entry_id", entry_id)
    with db_conn() as conn:
        row = conn.execute(
            f"SELECT COUNT(*) FROM profile_reports WHERE created_at >= ? AND {column} IS ?",
            (_since_yesterday(), value),
        ).fetchone()
    return int(row[0]) if row else 0


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
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT id, global_player_id, entry_id, player_name, message, status, created_at "
            "FROM profile_reports WHERE status = 'open' ORDER BY id DESC"
        ).fetchall()
    return [
        {
            **dict(row),
            "player_name": row["player_name"] or "",
            "message": row["message"] or "",
            "status": row["status"] or "open",
            "created_at": row["created_at"] or "",
        }
        for row in rows
    ]


def close_report(report_id: int) -> bool:
    row = get_row(ProfileReport, report_id)
    if row is None or row.status != "open":
        return False
    row.status = "done"
    commit_writes()
    return True
