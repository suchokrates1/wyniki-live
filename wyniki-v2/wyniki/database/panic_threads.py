"""One help request and the replies that come back on WhatsApp."""
from __future__ import annotations

import secrets
from typing import Any

from .connection import db_conn


def open_thread(android_id: str) -> str:
    token = secrets.token_hex(16)
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO panic_threads (token, android_id) VALUES (?, ?)",
            (token, str(android_id or "")[:32]),
        )
        conn.commit()
    return token


def add_message(
    token: str,
    *,
    direction: str,
    body: str,
    waha_id: str = "",
    chat_id: str = "",
) -> None:
    text = " ".join(str(body or "").split())
    if not text:
        return
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO panic_messages (token, direction, body, waha_id, chat_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                token,
                "desk" if direction == "desk" else "umpire",
                text[:500],
                str(waha_id or "")[:80],
                str(chat_id or "")[:80],
            ),
        )
        conn.commit()


def thread_view(token: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        thread = conn.execute(
            "SELECT token, android_id, created_at FROM panic_threads WHERE token = ?",
            (token,),
        ).fetchone()
        if thread is None:
            return None
        rows = conn.execute(
            """
            SELECT direction, body, waha_id, chat_id, created_at
            FROM panic_messages WHERE token = ? ORDER BY id
            """,
            (token,),
        ).fetchall()
    return {
        "token": thread["token"],
        "android_id": thread["android_id"] or "",
        "created_at": thread["created_at"] or "",
        "messages": [
            {
                "direction": row["direction"],
                "text": row["body"],
                "waha_id": row["waha_id"] or "",
                "chat_id": row["chat_id"] or "",
                "created_at": row["created_at"] or "",
            }
            for row in rows
        ],
    }


def known_waha_ids() -> set[str]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT waha_id FROM panic_messages WHERE waha_id != ''"
        ).fetchall()
    return {str(row["waha_id"]) for row in rows}


def waiting_thread_count() -> int:
    """Threads whose latest line is still from the umpire."""
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT token FROM panic_threads
            WHERE created_at >= datetime('now', '-6 hours')
            """
        ).fetchall()
    waiting = 0
    for row in rows:
        view = thread_view(row["token"])
        if view and view["messages"] and view["messages"][-1]["direction"] == "umpire":
            waiting += 1
    return waiting
