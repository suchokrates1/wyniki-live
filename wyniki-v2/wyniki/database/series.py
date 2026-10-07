"""Tournament series and the people who run them.

A series (a tour such as TWT) groups tournaments that someone else may organise: one
tournament can belong to a series and still be, say, a world championship. So the link
is its own table with the tier the series gives that tournament, not a column on it.
People sign in with their own account; one account may belong to several series.
"""
from __future__ import annotations

import re
import sqlite3
import unicodedata
from typing import Any

from .connection import db_conn

ROLES = ("owner", "editor")


def ensure_series_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            country TEXT NOT NULL DEFAULT '',
            website TEXT NOT NULL DEFAULT '',
            valid_until TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL DEFAULT '',
            disabled INTEGER NOT NULL DEFAULT 0,
            last_login_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS series_members (
            series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'editor',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (series_id, account_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS series_tournaments (
            series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
            tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            tier TEXT NOT NULL DEFAULT '',
            counts_for_ranking INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (series_id, tournament_id)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_series_tournaments_tournament ON series_tournaments(tournament_id)")
    if "logo_path" not in {row[1] for row in cursor.execute("PRAGMA table_info(series)")}:
        cursor.execute("ALTER TABLE series ADD COLUMN logo_path TEXT NOT NULL DEFAULT ''")
    from .accounts import ensure_account_columns
    from .series_plan import ensure_series_plan_columns
    from .series_records import ensure_series_record_tables

    ensure_series_record_tables(cursor)
    ensure_series_plan_columns(cursor)
    ensure_account_columns(cursor)


def slugify(name: str) -> str:
    plain = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:40] or "seria"


def _rows(cursor: sqlite3.Cursor) -> list[dict[str, Any]]:
    return [dict(row) for row in cursor.fetchall()]


# ----- series -----

def list_series() -> list[dict[str, Any]]:
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM series ORDER BY name COLLATE NOCASE")
        series = _rows(cursor)
        for item in series:
            item["members"] = _members(cursor, item["id"])
            item["tournaments"] = _tournaments(cursor, item["id"])
        return series


def get_series(series_id: int) -> dict[str, Any] | None:
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM series WHERE id = ?", (series_id,))
        row = cursor.fetchone()
        if not row:
            return None
        item = dict(row)
        item["members"] = _members(cursor, series_id)
        item["tournaments"] = _tournaments(cursor, series_id)
        return item


def create_series(name: str, *, slug: str = "", country: str = "", website: str = "", valid_until: str = "") -> int:
    with db_conn() as conn:
        cursor = conn.cursor()
        base = slugify(slug or name)
        candidate, n = base, 2
        while cursor.execute("SELECT 1 FROM series WHERE slug = ?", (candidate,)).fetchone():
            candidate, n = f"{base}-{n}", n + 1
        cursor.execute(
            "INSERT INTO series (name, slug, country, website, valid_until) VALUES (?, ?, ?, ?, ?)",
            (name.strip(), candidate, country.strip().upper()[:2], website.strip(), valid_until.strip()),
        )
        conn.commit()
        return int(cursor.lastrowid)


def update_series(series_id: int, fields: dict[str, Any]) -> bool:
    allowed = {"name", "country", "website", "valid_until"}
    values: dict[str, Any] = {key: str(value or "").strip() for key, value in fields.items() if key in allowed}
    for key in ("max_tournaments_per_year", "max_courts"):
        if key in fields:
            try:
                values[key] = max(0, int(fields[key] or 0))
            except (TypeError, ValueError):
                values[key] = 0
    if "country" in values:
        values["country"] = values["country"].upper()[:2]
    if values.get("name") == "":
        values.pop("name")
    if not values:
        return False
    with db_conn() as conn:
        assignments = ", ".join(f"{key} = ?" for key in values)
        cursor = conn.execute(f"UPDATE series SET {assignments} WHERE id = ?", (*values.values(), series_id))
        conn.commit()
        return cursor.rowcount > 0


def set_logo(series_id: int, logo_path: str) -> str:
    """Stores the series' logo path ('' takes it away) and returns the one it replaced."""
    with db_conn() as conn:
        row = conn.execute("SELECT logo_path FROM series WHERE id = ?", (series_id,)).fetchone()
        conn.execute("UPDATE series SET logo_path = ? WHERE id = ?", (logo_path, series_id))
        conn.commit()
        return str(row[0] or "") if row else ""


def public_series_of(tournament_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    """The series each tournament belongs to, as the public page shows them: name, logo, rank."""
    ids = [int(tid) for tid in tournament_ids]
    if not ids:
        return {}
    marks = ", ".join("?" for _ in ids)
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT st.tournament_id, s.id, s.name, s.slug, s.website, s.logo_path, st.tier
            FROM series_tournaments st JOIN series s ON s.id = st.series_id
            WHERE st.tournament_id IN ({marks}) ORDER BY s.name COLLATE NOCASE
            """,
            ids,
        ).fetchall()
    found: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        found.setdefault(int(row[0]), []).append(
            {"id": row[1], "name": row[2], "slug": row[3], "website": row[4], "logo_path": row[5] or "", "tier": row[6] or ""}
        )
    return found


def delete_series(series_id: int) -> bool:
    with db_conn() as conn:
        cursor = conn.execute("DELETE FROM series WHERE id = ?", (series_id,))
        conn.commit()
        return cursor.rowcount > 0


# ----- tournaments in a series -----

def _tournaments(cursor: sqlite3.Cursor, series_id: int) -> list[dict[str, Any]]:
    cursor.execute(
        """
        SELECT t.id, t.name, t.start_date, t.end_date, t.city, t.country, t.is_public, t.is_simulation, t.active,
               st.tier, st.counts_for_ranking
        FROM series_tournaments st JOIN tournaments t ON t.id = st.tournament_id
        WHERE st.series_id = ? ORDER BY t.start_date DESC, t.id DESC
        """,
        (series_id,),
    )
    return _rows(cursor)


def series_tournaments(series_id: int) -> list[dict[str, Any]]:
    with db_conn() as conn:
        return _tournaments(conn.cursor(), series_id)


def attach_tournament(series_id: int, tournament_id: int, tier: str = "", counts_for_ranking: bool = True) -> None:
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO series_tournaments (series_id, tournament_id, tier, counts_for_ranking) VALUES (?, ?, ?, ?)
            ON CONFLICT(series_id, tournament_id) DO UPDATE SET tier = excluded.tier, counts_for_ranking = excluded.counts_for_ranking
            """,
            (series_id, tournament_id, str(tier or "").strip()[:20], 1 if counts_for_ranking else 0),
        )
        conn.commit()


def detach_tournament(series_id: int, tournament_id: int) -> bool:
    with db_conn() as conn:
        cursor = conn.execute(
            "DELETE FROM series_tournaments WHERE series_id = ? AND tournament_id = ?", (series_id, tournament_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def tournament_in_series(tournament_id: int, series_ids: list[int]) -> bool:
    if not series_ids:
        return False
    marks = ",".join("?" for _ in series_ids)
    with db_conn() as conn:
        row = conn.execute(
            f"SELECT 1 FROM series_tournaments WHERE tournament_id = ? AND series_id IN ({marks})",
            (tournament_id, *series_ids),
        ).fetchone()
        return row is not None


# ----- members -----

def _members(cursor: sqlite3.Cursor, series_id: int) -> list[dict[str, Any]]:
    cursor.execute(
        """
        SELECT a.id, a.email, a.name, a.language, a.disabled, a.last_login_at, m.role,
               CASE WHEN a.password_hash = '' THEN 0 ELSE 1 END AS has_password
        FROM series_members m JOIN accounts a ON a.id = m.account_id
        WHERE m.series_id = ? ORDER BY a.name COLLATE NOCASE, a.email
        """,
        (series_id,),
    )
    return _rows(cursor)


def add_member(series_id: int, account_id: int, role: str = "editor") -> None:
    role = role if role in ROLES else "editor"
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO series_members (series_id, account_id, role) VALUES (?, ?, ?)
            ON CONFLICT(series_id, account_id) DO UPDATE SET role = excluded.role
            """,
            (series_id, account_id, role),
        )
        conn.commit()


def remove_member(series_id: int, account_id: int) -> bool:
    with db_conn() as conn:
        cursor = conn.execute(
            "DELETE FROM series_members WHERE series_id = ? AND account_id = ?", (series_id, account_id)
        )
        conn.commit()
        return cursor.rowcount > 0


def series_of_account(account_id: int) -> list[dict[str, Any]]:
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.name, s.slug, s.country, s.website, s.valid_until, s.logo_path,
                   s.max_tournaments_per_year, s.max_courts, m.role
            FROM series_members m JOIN series s ON s.id = m.series_id
            WHERE m.account_id = ? ORDER BY s.name COLLATE NOCASE
            """,
            (account_id,),
        )
        return _rows(cursor)
