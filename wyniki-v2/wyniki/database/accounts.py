"""Personal accounts for people who run a series. The admin keeps its own single password.

An account starts without a password: the admin invites the person, and the link in
the invitation lets them set one. The hash is werkzeug's (scrypt).
"""
from __future__ import annotations

from typing import Any

from werkzeug.security import check_password_hash, generate_password_hash

from .connection import _utc_now, db_conn

MIN_PASSWORD_LENGTH = 10
# Checked when the address is unknown, so a wrong address takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash("not-a-real-password")
_PUBLIC = "id, email, name, disabled, last_login_at, created_at, CASE WHEN password_hash = '' THEN 0 ELSE 1 END AS has_password"


def normalize_email(email: str | None) -> str:
    return str(email or "").strip().lower()


def get_account(account_id: int) -> dict[str, Any] | None:
    with db_conn() as conn:
        row = conn.execute(f"SELECT {_PUBLIC} FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return dict(row) if row else None


def get_account_by_email(email: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        row = conn.execute(f"SELECT {_PUBLIC} FROM accounts WHERE email = ?", (normalize_email(email),)).fetchone()
        return dict(row) if row else None


def ensure_account(email: str, name: str = "") -> int:
    """The account for this address, created without a password when it is new."""
    address = normalize_email(email)
    with db_conn() as conn:
        row = conn.execute("SELECT id, name FROM accounts WHERE email = ?", (address,)).fetchone()
        if row:
            if name.strip() and not row["name"]:
                conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (name.strip(), row["id"]))
                conn.commit()
            return int(row["id"])
        cursor = conn.execute("INSERT INTO accounts (email, name) VALUES (?, ?)", (address, name.strip()))
        conn.commit()
        return int(cursor.lastrowid)


def password_fingerprint(account_id: int) -> str | None:
    """A piece of the stored hash: an invitation names it, so setting a password spends the link."""
    with db_conn() as conn:
        row = conn.execute("SELECT password_hash FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return None if row is None else (row["password_hash"] or "")[-12:]


def set_password(account_id: int, password: str) -> None:
    with db_conn() as conn:
        conn.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (generate_password_hash(password), account_id))
        conn.commit()


def verify_login(email: str, password: str) -> dict[str, Any] | None:
    """The account when the address and password match and it is not switched off."""
    with db_conn() as conn:
        row = conn.execute("SELECT id, password_hash, disabled FROM accounts WHERE email = ?", (normalize_email(email),)).fetchone()
        if not row or row["disabled"] or not row["password_hash"]:
            check_password_hash(_DUMMY_HASH, password)
            return None
        if not check_password_hash(row["password_hash"], password):
            return None
        conn.execute("UPDATE accounts SET last_login_at = ? WHERE id = ?", (_utc_now(), row["id"]))
        conn.commit()
    return get_account(int(row["id"]))


def set_disabled(account_id: int, disabled: bool) -> bool:
    with db_conn() as conn:
        cursor = conn.execute("UPDATE accounts SET disabled = ? WHERE id = ?", (1 if disabled else 0, account_id))
        conn.commit()
        return cursor.rowcount > 0
