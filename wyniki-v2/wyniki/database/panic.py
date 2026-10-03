"""WhatsApp recipients for the umpire panic button."""
from __future__ import annotations

from typing import Any

from .connection import db_conn


def list_panic_recipients() -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, chat_id, enabled, created_at FROM panic_recipients ORDER BY id"
        ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "chat_id": row["chat_id"],
            "enabled": bool(row["enabled"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def insert_panic_recipient(name: str, chat_id: str) -> int:
    with db_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO panic_recipients (name, chat_id, enabled) VALUES (?, ?, 1)",
            (name, chat_id),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)


def update_panic_recipient(recipient_id: int, name: str, chat_id: str, enabled: bool) -> None:
    with db_conn() as conn:
        conn.execute(
            "UPDATE panic_recipients SET name = ?, chat_id = ?, enabled = ? WHERE id = ?",
            (name, chat_id, 1 if enabled else 0, recipient_id),
        )
        conn.commit()


def delete_panic_recipient(recipient_id: int) -> bool:
    with db_conn() as conn:
        cursor = conn.execute("DELETE FROM panic_recipients WHERE id = ?", (recipient_id,))
        conn.commit()
        return cursor.rowcount > 0
