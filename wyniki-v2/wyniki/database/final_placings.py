"""Final results of a tournament played outside blindtennis.app (Loughborough runs on the LTA's
system, for instance): no matches here, only how far each entered player got.

A placing is a band of the draw, the unit the series' points table counts in:
W (winner), F (final), SF, QF, R16, R32, and Q for out before the main draw (a group).
The player's category is the one they entered in, as in the series' rules.
"""
from __future__ import annotations

import sqlite3
from typing import Any

from .connection import db_conn

BANDS = ("W", "F", "SF", "QF", "R16", "R32", "Q")


def ensure_final_placings(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS final_placings (
            tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            band TEXT NOT NULL,
            PRIMARY KEY (tournament_id, player_id)
        )
    """)
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(tournaments)")}
    if "results_external" not in columns:
        cursor.execute("ALTER TABLE tournaments ADD COLUMN results_external INTEGER NOT NULL DEFAULT 0")


def is_external(tournament_id: int) -> bool:
    with db_conn() as conn:
        row = conn.execute("SELECT results_external FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
    return bool(row and row[0])


def set_external(tournament_id: int, external: bool) -> None:
    with db_conn() as conn:
        conn.execute("UPDATE tournaments SET results_external = ? WHERE id = ?", (1 if external else 0, tournament_id))
        conn.commit()


def placings(tournament_id: int) -> list[dict[str, Any]]:
    """Every entry of the tournament with its band ('' when not set yet), by category then band."""
    order = " ".join(f"WHEN '{band}' THEN {index}" for index, band in enumerate(BANDS))
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT p.id AS player_id, p.global_player_id, p.name, COALESCE(p.category, '') AS category,
                   COALESCE(p.gender, '') AS gender, COALESCE(p.country, '') AS country, COALESCE(fp.band, '') AS band
            FROM players p
            LEFT JOIN final_placings fp ON fp.tournament_id = p.tournament_id AND fp.player_id = p.id
            WHERE p.tournament_id = ?
            ORDER BY p.category COLLATE NOCASE, CASE fp.band {order} ELSE 99 END, p.name COLLATE NOCASE
            """,
            (tournament_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def save(tournament_id: int, items: list[dict]) -> list[dict[str, Any]]:
    """Sets the bands given ({player_id, band}); an empty band clears it. Players of other
    tournaments and unknown bands are left out."""
    with db_conn() as conn:
        own = {int(row[0]) for row in conn.execute("SELECT id FROM players WHERE tournament_id = ?", (tournament_id,))}
        for item in items or []:
            try:
                player_id = int(item.get("player_id") or 0)
            except (TypeError, ValueError, AttributeError):
                continue
            band = str(item.get("band") or "").upper()
            if player_id not in own:
                continue
            if band in BANDS:
                conn.execute(
                    """INSERT INTO final_placings (tournament_id, player_id, band) VALUES (?, ?, ?)
                       ON CONFLICT(tournament_id, player_id) DO UPDATE SET band = excluded.band""",
                    (tournament_id, player_id, band),
                )
            elif not band:
                conn.execute("DELETE FROM final_placings WHERE tournament_id = ? AND player_id = ?", (tournament_id, player_id))
        conn.commit()
    return placings(tournament_id)
