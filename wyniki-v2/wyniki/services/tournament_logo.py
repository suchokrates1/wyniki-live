"""A tournament's logo, served under /data/tournament-logos/, in the same two versions as a
series' logo: the logo itself and its version for a dark background.

The admin's tournament form still takes the logo itself with the other settings; these calls are
for setting either version on its own (the organizer's panel, the admin's logo boxes).
"""
from __future__ import annotations

from ..database.connection import db_conn
from .uploaded_pictures import drop, field_for, read_picture, store

FOLDER = "tournament-logos"
FIELDS = ("logo_path", "logo_dark_path")

__all__ = ["field_for", "remove", "save"]


def _set(tournament_id: int, path: str, field: str) -> str:
    """Stores the path ('' takes it away) and returns the one it replaced."""
    if field not in FIELDS:
        raise ValueError(field)
    with db_conn() as conn:
        row = conn.execute(f"SELECT {field} FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
        conn.execute(f"UPDATE tournaments SET {field} = ? WHERE id = ?", (path, tournament_id))
        conn.commit()
        return str(row[0] or "") if row else ""


def save(tournament_id: int, uploaded_file, field: str = "logo_path") -> tuple[dict, int]:
    data, extension, error = read_picture(uploaded_file)
    if error:
        return error
    stem = f"t{tournament_id}{'-dark' if field == 'logo_dark_path' else ''}"
    path = store(FOLDER, stem, data, extension)
    drop(FOLDER, _set(tournament_id, path, field))
    return {field: path}, 200


def remove(tournament_id: int, field: str = "logo_path") -> dict:
    drop(FOLDER, _set(tournament_id, "", field))
    return {field: ""}
