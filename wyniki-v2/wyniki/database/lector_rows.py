"""What the court lector needs from a tournament to record its phrases ahead: the names that
meet, and the scores written so far (services/lector_fill.py)."""
from __future__ import annotations

from .connection import db_conn

# every place a pairing of two names is written for a tournament
_PAIR_TABLES = ("tournament_schedule", "matches", "bracket_knockout")


def group_player_names(tournament_id: int) -> dict[int, list[str]]:
    """The players of each group of the tournament, by group id."""
    grouped: dict[int, list[str]] = {}
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT bgp.group_id, bgp.player_name
            FROM bracket_group_players bgp
            JOIN bracket_groups bg ON bg.id = bgp.group_id
            WHERE bg.tournament_id = ?
            """,
            (tournament_id,),
        ).fetchall()
    for row in rows:
        grouped.setdefault(int(row["group_id"]), []).append(str(row["player_name"] or ""))
    return grouped


def match_pairs(tournament_id: int) -> list[tuple[str, str]]:
    """Every (player 1, player 2) the schedule, the matches and the knockout draw name."""
    pairs: list[tuple[str, str]] = []
    with db_conn() as conn:
        for table in _PAIR_TABLES:
            for row in conn.execute(
                f"SELECT player1_name, player2_name FROM {table} WHERE tournament_id = ?",
                (tournament_id,),
            ):
                pairs.append((str(row["player1_name"] or ""), str(row["player2_name"] or "")))
    return pairs


def match_set_histories(tournament_id: int) -> list[str | None]:
    """Each match's sets_history as stored (JSON text, or None)."""
    with db_conn() as conn:
        return [row["sets_history"] for row in conn.execute(
            "SELECT sets_history FROM matches WHERE tournament_id = ?", (tournament_id,)
        )]
