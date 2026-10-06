"""Who a bracket name is: groups and knockout slots carry only names, the page links them to profiles."""
from __future__ import annotations

import sqlite3
from typing import Any


def bracket_player_directory(cursor: sqlite3.Cursor, tournament_id: int) -> dict[str, dict[str, Any]]:
    cursor.execute(
        "SELECT id, name, country, global_player_id FROM players WHERE tournament_id = ?",
        (tournament_id,),
    )
    return {
        r["name"]: {
            "player_id": r["id"],
            "global_player_id": r["global_player_id"],
            "country": (r["country"] or "").strip().upper(),
        }
        for r in cursor.fetchall()
        if r["name"]
    }
