"""What a series' subscription allows, and the notices sent about its end.

- series.max_tournaments_per_year: tournaments starting in one calendar year; 0 = no limit.
- series.max_courts: courts per tournament; 0 = no limit.
- series_notices: one row per notice sent, so a reminder goes out once per end date.
- app setting organizer_contact_email: where organizers write, and the copy of reminders.
"""
from __future__ import annotations

import sqlite3
from typing import Any

from .connection import _utc_now, db_conn, fetch_app_settings, upsert_app_settings

DEFAULT_CONTACT = "contact@blindtennis.app"
CONTACT_KEY = "organizer_contact_email"


def ensure_series_plan_columns(cursor: sqlite3.Cursor) -> None:
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(series)")}
    if "max_tournaments_per_year" not in columns:
        cursor.execute("ALTER TABLE series ADD COLUMN max_tournaments_per_year INTEGER NOT NULL DEFAULT 0")
    if "max_courts" not in columns:
        cursor.execute("ALTER TABLE series ADD COLUMN max_courts INTEGER NOT NULL DEFAULT 0")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS series_notices (
            series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            valid_until TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            PRIMARY KEY (series_id, kind, valid_until)
        )
    """)


def contact_email() -> str:
    return (fetch_app_settings([CONTACT_KEY]).get(CONTACT_KEY) or "").strip() or DEFAULT_CONTACT


def set_contact_email(address: str) -> str:
    upsert_app_settings({CONTACT_KEY: str(address or "").strip().lower()})
    return contact_email()


def limits(series_id: int) -> dict[str, int]:
    with db_conn() as conn:
        row = conn.execute("SELECT max_tournaments_per_year, max_courts FROM series WHERE id = ?", (series_id,)).fetchone()
    return {"max_tournaments_per_year": int(row[0] or 0), "max_courts": int(row[1] or 0)} if row else {"max_tournaments_per_year": 0, "max_courts": 0}


def tournaments_in_year(series_id: int, year: str) -> int:
    with db_conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) FROM series_tournaments st JOIN tournaments t ON t.id = st.tournament_id
            WHERE st.series_id = ? AND substr(t.start_date, 1, 4) = ?
            """,
            (series_id, str(year)),
        ).fetchone()
    return int(row[0] or 0)


def series_with_end_dates() -> list[dict[str, Any]]:
    with db_conn() as conn:
        return [dict(row) for row in conn.execute("SELECT id, name, valid_until FROM series WHERE valid_until != ''")]


def notice_sent(series_id: int, kind: str, valid_until: str) -> bool:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM series_notices WHERE series_id = ? AND kind = ? AND valid_until = ?", (series_id, kind, valid_until)
        ).fetchone()
    return row is not None


def mark_notice_sent(series_id: int, kind: str, valid_until: str) -> None:
    with db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO series_notices (series_id, kind, valid_until, sent_at) VALUES (?, ?, ?, ?)",
            (series_id, kind, valid_until, _utc_now()),
        )
        conn.commit()
