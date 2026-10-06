"""What the champion of a tournament is called: world, continental or national champion, or plain winner.

The office sets it; until then it is guessed from the tournament's name, and says so.
"""
from __future__ import annotations

import re
import sqlite3
from typing import Any

from .connection import db_conn

SCOPES = ("world", "continental", "national", "open")

# Checked in this order: "Weltmeisterschaft" is world before it is a national "Meisterschaft".
_NAME_HINTS = (
    ("world", r"world|świat|swiat|mondial|welt|mundial|pasaulio"),
    ("continental", r"europ|\bem\b|\bme\b|continental"),
    ("national", r"mistrzostwa|\bmp\b|national|nacional|meisterschaft|čempionat|campionat|championnat"),
)


def suggest_title_scope(name: str | None) -> str:
    text = str(name or "").lower()
    for scope, pattern in _NAME_HINTS:
        if re.search(pattern, text):
            return scope
    return "open"


def _ensure_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tournament_titles (
            tournament_id INTEGER PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
            scope TEXT NOT NULL,
            override TEXT DEFAULT ''
        )
        """
    )


def title_fields_with(cursor: sqlite3.Cursor, tournament_id: int, name: str | None) -> dict[str, Any]:
    _ensure_table(cursor)
    cursor.execute("SELECT scope, override FROM tournament_titles WHERE tournament_id = ?", (tournament_id,))
    row = cursor.fetchone()
    if row and row["scope"] in SCOPES:
        return {"title_scope": row["scope"], "title_override": row["override"] or "", "title_scope_guessed": False}
    return {"title_scope": suggest_title_scope(name), "title_override": "", "title_scope_guessed": True}


def title_fields(tournament_id: int, name: str | None) -> dict[str, Any]:
    with db_conn() as conn:
        return title_fields_with(conn.cursor(), tournament_id, name)


def save_tournament_title(tournament_id: int, scope: str | None, override: str | None) -> None:
    scope = str(scope or "").strip()
    if scope not in SCOPES:
        return
    with db_conn() as conn:
        cursor = conn.cursor()
        _ensure_table(cursor)
        cursor.execute(
            """
            INSERT INTO tournament_titles (tournament_id, scope, override) VALUES (?, ?, ?)
            ON CONFLICT(tournament_id) DO UPDATE SET scope = excluded.scope, override = excluded.override
            """,
            (tournament_id, scope, str(override or "").strip()[:80]),
        )
        conn.commit()
