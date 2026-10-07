"""Personal accounts for people who run a series. The admin keeps its own single password.

An account starts without a password: the admin invites the person, and the link in
the invitation lets them set one. The hash is werkzeug's (scrypt).
"""
from __future__ import annotations

from typing import Any

from werkzeug.security import check_password_hash, generate_password_hash

from .connection import _utc_now, db_conn

MIN_PASSWORD_LENGTH = 10
# The organizer panel and every mail to an organizer come in one of these.
LANGUAGES = ("pl", "en", "de", "it", "es", "fr", "lt")
DEFAULT_LANGUAGE = "en"
# Checked when the address is unknown, so a wrong address takes as long as a wrong password.
_DUMMY_HASH = generate_password_hash("not-a-real-password")
_PUBLIC = "id, email, name, language, disabled, last_login_at, created_at, CASE WHEN password_hash = '' THEN 0 ELSE 1 END AS has_password"


def ensure_account_columns(cursor) -> None:
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(accounts)")}
    if "language" not in columns:
        cursor.execute(f"ALTER TABLE accounts ADD COLUMN language TEXT NOT NULL DEFAULT '{DEFAULT_LANGUAGE}'")


def normalize_language(language: str | None) -> str:
    code = str(language or "").strip().lower()[:2]
    return code if code in LANGUAGES else DEFAULT_LANGUAGE


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


def ensure_account(email: str, name: str = "", language: str | None = None) -> int:
    """The account for this address, created without a password when it is new.

    A language given here replaces the stored one: the admin picks it when inviting."""
    address = normalize_email(email)
    with db_conn() as conn:
        row = conn.execute("SELECT id, name FROM accounts WHERE email = ?", (address,)).fetchone()
        if row:
            if name.strip() and not row["name"]:
                conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (name.strip(), row["id"]))
            if language:
                conn.execute("UPDATE accounts SET language = ? WHERE id = ?", (normalize_language(language), row["id"]))
            conn.commit()
            return int(row["id"])
        cursor = conn.execute(
            "INSERT INTO accounts (email, name, language) VALUES (?, ?, ?)",
            (address, name.strip(), normalize_language(language)),
        )
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


def set_language(account_id: int, language: str | None) -> str:
    code = normalize_language(language)
    with db_conn() as conn:
        conn.execute("UPDATE accounts SET language = ? WHERE id = ?", (code, account_id))
        conn.commit()
    return code
