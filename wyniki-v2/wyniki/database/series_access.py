"""Who reaches which tournament of a series.

An owner or an editor of a series reaches every tournament in it. A tournament organizer
(role 'local') reaches only the tournaments the admin granted them in member_tournaments:
a series such as TWT ranks tournaments that other people run, and each of them sees only
their own.
"""
from __future__ import annotations

import sqlite3

from .connection import db_conn

LOCAL = "local"


def ensure_member_tournaments(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS member_tournaments (
            series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            PRIMARY KEY (series_id, account_id, tournament_id)
        )
    """)


def granted(series_id: int, account_id: int) -> list[int]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT tournament_id FROM member_tournaments WHERE series_id = ? AND account_id = ? ORDER BY tournament_id",
            (series_id, account_id),
        ).fetchall()
    return [int(row[0]) for row in rows]


def set_granted(series_id: int, account_id: int, tournament_ids: list) -> list[int]:
    """Grants exactly these tournaments; ones outside the series are left out."""
    wanted = {int(tid) for tid in tournament_ids or [] if str(tid).strip().lstrip("-").isdigit()}
    with db_conn() as conn:
        in_series = {int(row[0]) for row in conn.execute(
            "SELECT tournament_id FROM series_tournaments WHERE series_id = ?", (series_id,))}
        conn.execute("DELETE FROM member_tournaments WHERE series_id = ? AND account_id = ?", (series_id, account_id))
        conn.executemany(
            "INSERT INTO member_tournaments (series_id, account_id, tournament_id) VALUES (?, ?, ?)",
            [(series_id, account_id, tid) for tid in sorted(wanted & in_series)],
        )
        conn.commit()
    return sorted(wanted & in_series)


def can_reach(account_id: int, tournament_id: int) -> bool:
    """True when one of the person's series ranks the tournament and their role there opens it."""
    with db_conn() as conn:
        row = conn.execute(
            f"""
            SELECT 1 FROM series_tournaments st
            JOIN series_members m ON m.series_id = st.series_id AND m.account_id = ?
            LEFT JOIN member_tournaments mt
              ON mt.series_id = m.series_id AND mt.account_id = m.account_id AND mt.tournament_id = st.tournament_id
            WHERE st.tournament_id = ? AND (m.role != '{LOCAL}' OR mt.tournament_id IS NOT NULL)
            """,
            (account_id, tournament_id),
        ).fetchone()
    return row is not None


def visible_tournaments(item: dict, account_id: int, tournaments: list[dict]) -> list[dict]:
    """The series' tournaments as this person sees them: a tournament organizer only their own."""
    if item.get("role") != LOCAL:
        return tournaments
    mine = set(granted(item["id"], account_id))
    return [row for row in tournaments if int(row["id"]) in mine]
