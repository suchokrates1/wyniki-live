"""What a series panel leaves behind: the admin's publication lock, the change log, and
player edits waiting for the admin to look at them.

- tournament_locks: an empty lock lets the organizer decide whether a tournament is
  public; 'private' means the admin forced it off the website and the switch is locked.
- audit_log: every change made from the organizer panel, who, what and when.
- player_reviews: an organizer may edit any player in the shared base (a class after a
  medical, say). The edit applies at once; the admin checks it later and may undo it.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .connection import _utc_now, db_conn

LOCKS = ("", "private")


def ensure_series_record_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tournament_locks (
            tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
            visibility_lock TEXT NOT NULL DEFAULT ''
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            account_email TEXT NOT NULL DEFAULT '',
            tournament_id INTEGER,
            action TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_tournament ON audit_log(tournament_id, id)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_player_id INTEGER NOT NULL REFERENCES global_players(id) ON DELETE CASCADE,
            account_id INTEGER,
            account_email TEXT NOT NULL DEFAULT '',
            before TEXT NOT NULL DEFAULT '{}',
            after TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            decided_at TEXT
        )
    """)


# ----- publication lock -----

def visibility_lock(tournament_id: int) -> str:
    with db_conn() as conn:
        row = conn.execute("SELECT visibility_lock FROM tournament_locks WHERE tournament_id = ?", (tournament_id,)).fetchone()
        return row["visibility_lock"] if row else ""


def visibility_locks() -> dict[int, str]:
    with db_conn() as conn:
        return {row["tournament_id"]: row["visibility_lock"] for row in conn.execute("SELECT * FROM tournament_locks")}


def set_visibility_lock(tournament_id: int, lock: Any) -> None:
    """'private' also takes the tournament off the website at once."""
    value = "private" if lock is True or str(lock or "").strip().lower() in {"private", "true", "1", "on"} else ""
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO tournament_locks (tournament_id, visibility_lock) VALUES (?, ?) "
            "ON CONFLICT(tournament_id) DO UPDATE SET visibility_lock = excluded.visibility_lock",
            (tournament_id, value),
        )
        if value == "private":
            conn.execute("UPDATE tournaments SET is_public = 0 WHERE id = ?", (tournament_id,))
        conn.commit()


# ----- change log -----

_SECRET_KEYS = {"password", "office_password", "pin"}


def _clean(detail: Any) -> Any:
    if isinstance(detail, dict):
        return {key: ("•••" if key in _SECRET_KEYS and value else _clean(value)) for key, value in detail.items()}
    if isinstance(detail, list):
        return [_clean(item) for item in detail[:50]]
    return detail


def record(account: dict, action: str, tournament_id: int | None = None, detail: Any = None) -> None:
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO audit_log (account_id, account_email, tournament_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (account.get("id"), account.get("email", ""), tournament_id, action,
             json.dumps(_clean(detail or {}), ensure_ascii=False, default=str)[:4000], _utc_now()),
        )
        conn.commit()


def log_for_tournament(tournament_id: int, limit: int = 200) -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT id, account_email, action, detail, created_at FROM audit_log WHERE tournament_id = ? ORDER BY id DESC LIMIT ?",
            (tournament_id, limit),
        ).fetchall()
    return [{**dict(row), "detail": json.loads(row["detail"] or "{}")} for row in rows]


# ----- player edits to check -----

def queue_player_review(global_player_id: int, account: dict, before: dict, after: dict) -> None:
    changed = {key for key in after if before.get(key) != after.get(key)}
    if not changed:
        return
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO player_reviews (global_player_id, account_id, account_email, before, after, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (global_player_id, account.get("id"), account.get("email", ""),
             json.dumps({key: before.get(key) for key in changed}, ensure_ascii=False),
             json.dumps({key: after.get(key) for key in changed}, ensure_ascii=False), _utc_now()),
        )
        conn.commit()


def pending_player_reviews() -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT r.*, g.first_name, g.last_name FROM player_reviews r
            JOIN global_players g ON g.id = r.global_player_id
            WHERE r.status = 'pending' ORDER BY r.id
            """
        ).fetchall()
    return [{**dict(row), "before": json.loads(row["before"]), "after": json.loads(row["after"])} for row in rows]


def get_player_review(review_id: int) -> dict[str, Any] | None:
    with db_conn() as conn:
        row = conn.execute("SELECT * FROM player_reviews WHERE id = ?", (review_id,)).fetchone()
    return {**dict(row), "before": json.loads(row["before"]), "after": json.loads(row["after"])} if row else None


def decide_player_review(review_id: int, status: str) -> bool:
    with db_conn() as conn:
        cursor = conn.execute(
            "UPDATE player_reviews SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
            (status, _utc_now(), review_id),
        )
        conn.commit()
        return cursor.rowcount > 0
