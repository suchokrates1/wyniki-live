"""How a tournament orders players level on wins in a group table: the organizer gives the rule
before the first match (the contract says so) and the tables, the knockout seeding and the
public page all follow it (bracket_standings.order_standings)."""
from __future__ import annotations

from .connection import db_conn

DEFAULT_TABLE_ORDER = "wins_sets_games"
TABLE_ORDERS = (DEFAULT_TABLE_ORDER, "wins_h2h_sets_games", "itf")


def table_order(value: object) -> str:
    """One of TABLE_ORDERS; anything else is the default."""
    code = str(value or "").strip().lower()
    return code if code in TABLE_ORDERS else DEFAULT_TABLE_ORDER


def ensure_table_order(cursor) -> None:
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(tournaments)")}
    if "table_order" not in columns:
        cursor.execute(f"ALTER TABLE tournaments ADD COLUMN table_order TEXT NOT NULL DEFAULT '{DEFAULT_TABLE_ORDER}'")


def tournament_table_order(tournament_id: int) -> str:
    with db_conn() as conn:
        row = conn.execute("SELECT table_order FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
    return table_order(row["table_order"] if row else None)


def set_tournament_table_order(tournament_id: int, value: object) -> str:
    order = table_order(value)
    with db_conn() as conn:
        conn.execute("UPDATE tournaments SET table_order = ? WHERE id = ?", (order, tournament_id))
        conn.commit()
    return order
