"""A tournament's two logo paths (the logo itself and its dark-background version)."""
from __future__ import annotations

from .connection import db_conn

FIELDS = ("logo_path", "logo_dark_path")


def set_logo(tournament_id: int, path: str, field: str = "logo_path") -> str:
    """Stores the path ('' takes it away) and returns the one it replaced."""
    if field not in FIELDS:
        raise ValueError(field)
    with db_conn() as conn:
        row = conn.execute(f"SELECT {field} FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
        conn.execute(f"UPDATE tournaments SET {field} = ? WHERE id = ?", (path, tournament_id))
        conn.commit()
        return str(row[0] or "") if row else ""
