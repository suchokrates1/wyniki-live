"""Who is an administrator: personal accounts (the same table as organizers') with a flag.

The admin used to sign in with one shared password (ADMIN_PASSWORD). It keeps working only
until the first administrator has set a password of their own; from then on only accounts do.
"""
from __future__ import annotations

from typing import Any

from .accounts import _PUBLIC
from .connection import db_conn


def list_admins() -> list[dict[str, Any]]:
    with db_conn() as conn:
        rows = conn.execute(f"SELECT {_PUBLIC} FROM accounts WHERE is_admin = 1 ORDER BY name COLLATE NOCASE, email").fetchall()
    return [dict(row) for row in rows]


def set_admin(account_id: int, admin: bool) -> bool:
    with db_conn() as conn:
        cursor = conn.execute("UPDATE accounts SET is_admin = ? WHERE id = ?", (1 if admin else 0, account_id))
        conn.commit()
        return cursor.rowcount > 0


def is_active_admin(account_id: int) -> bool:
    with db_conn() as conn:
        row = conn.execute("SELECT 1 FROM accounts WHERE id = ? AND is_admin = 1 AND disabled = 0", (account_id,)).fetchone()
    return row is not None


def active_admins_with_password() -> int:
    """Administrators who can sign in now; while there are none, the shared password still works."""
    with db_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM accounts WHERE is_admin = 1 AND disabled = 0 AND password_hash != ''"
        ).fetchone()
    return int(row[0])
