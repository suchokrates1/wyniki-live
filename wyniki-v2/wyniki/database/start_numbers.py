"""Start numbers: 1, 2, 3… inside each tournament category.

A player or pair gets a number the first time it is listed in a category and keeps it for
good: drawing groups, removing others or editing the player never renumbers anyone, and a
removed competitor's number is not given again (the category keeps its own counter).
"""
from __future__ import annotations

from typing import Dict, Iterable, List

from ..config import logger
from .connection import db_conn

KINDS = ("player", "team")


def ensure_start_number_tables(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS category_start_numbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            competitor_id INTEGER NOT NULL,
            start_number INTEGER NOT NULL,
            FOREIGN KEY (category_id) REFERENCES tournament_categories(id) ON DELETE CASCADE,
            UNIQUE(category_id, kind, competitor_id),
            UNIQUE(category_id, kind, start_number)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_category_start_numbers_tid ON category_start_numbers(tournament_id)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS category_start_number_counters (
            category_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            last_number INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (category_id, kind),
            FOREIGN KEY (category_id) REFERENCES tournament_categories(id) ON DELETE CASCADE
        )
    """)


def _assign(cursor, tournament_id: int, category_id: int, kind: str, competitor_ids: Iterable[int]) -> int:
    cursor.execute(
        "SELECT competitor_id FROM category_start_numbers WHERE category_id = ? AND kind = ?",
        (category_id, kind),
    )
    numbered = {int(row[0]) for row in cursor.fetchall()}
    missing = sorted({int(value) for value in competitor_ids if value is not None} - numbered)
    if not missing:
        return 0
    cursor.execute(
        "SELECT last_number FROM category_start_number_counters WHERE category_id = ? AND kind = ?",
        (category_id, kind),
    )
    row = cursor.fetchone()
    cursor.execute(
        "SELECT COALESCE(MAX(start_number), 0) FROM category_start_numbers WHERE category_id = ? AND kind = ?",
        (category_id, kind),
    )
    last = max(int(row[0]) if row else 0, int(cursor.fetchone()[0] or 0))
    for competitor_id in missing:
        last += 1
        cursor.execute(
            "INSERT INTO category_start_numbers (tournament_id, category_id, kind, competitor_id, start_number) VALUES (?, ?, ?, ?, ?)",
            (tournament_id, category_id, kind, competitor_id, last),
        )
    cursor.execute(
        "INSERT INTO category_start_number_counters (category_id, kind, last_number) VALUES (?, ?, ?) "
        "ON CONFLICT(category_id, kind) DO UPDATE SET last_number = excluded.last_number",
        (category_id, kind, last),
    )
    return len(missing)


def assign_start_numbers(tournament_id: int, category_id: int, kind: str, competitor_ids: Iterable[int]) -> Dict[str, Dict[str, Dict[str, int]]]:
    """Number the competitors of a category that have no number yet, in the order they were added."""
    if kind not in KINDS:
        raise ValueError(f"unknown start number kind: {kind}")
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        cursor.execute(
            "SELECT id FROM tournament_categories WHERE id = ? AND tournament_id = ?",
            (int(category_id), int(tournament_id)),
        )
        if cursor.fetchone() is None:
            conn.rollback()
            raise LookupError("category_not_found")
        table = "players" if kind == "player" else "tournament_teams"
        ids = [int(value) for value in competitor_ids]
        if ids:
            placeholders = ",".join("?" for _ in ids)
            cursor.execute(f"SELECT id FROM {table} WHERE tournament_id = ? AND id IN ({placeholders})", (int(tournament_id), *ids))
            ids = [int(row[0]) for row in cursor.fetchall()]
        added = _assign(cursor, int(tournament_id), int(category_id), kind, ids)
        conn.commit()
    if added:
        logger.info("start_numbers_assigned", tournament_id=tournament_id, category_id=category_id, kind=kind, count=added)
    return fetch_start_numbers(tournament_id)


def fetch_start_numbers(tournament_id: int) -> Dict[str, Dict[str, Dict[str, int]]]:
    """{category_id: {"player": {player_id: number}, "team": {team_id: number}}} (ids as strings for JSON)."""
    result: Dict[str, Dict[str, Dict[str, int]]] = {}
    with db_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT category_id, kind, competitor_id, start_number FROM category_start_numbers WHERE tournament_id = ?",
            (int(tournament_id),),
        )
        for category_id, kind, competitor_id, number in cursor.fetchall():
            bucket = result.setdefault(str(category_id), {"player": {}, "team": {}})
            bucket.setdefault(kind, {})[str(competitor_id)] = int(number)
    return result


def forget_start_numbers(cursor, kind: str, competitor_ids: List[int]) -> None:
    """A removed competitor loses its row; the category counter keeps the number from coming back."""
    if not competitor_ids:
        return
    placeholders = ",".join("?" for _ in competitor_ids)
    cursor.execute(
        f"DELETE FROM category_start_numbers WHERE kind = ? AND competitor_id IN ({placeholders})",
        (kind, *[int(value) for value in competitor_ids]),
    )


def number_existing_teams(cursor) -> None:
    """Pairs already in a doubles category get numbers in the order they were created."""
    cursor.execute("SELECT tournament_id, category_id, id FROM tournament_teams ORDER BY id")
    by_category: Dict[tuple, List[int]] = {}
    for tournament_id, category_id, team_id in cursor.fetchall():
        by_category.setdefault((int(tournament_id), int(category_id)), []).append(int(team_id))
    for (tournament_id, category_id), team_ids in by_category.items():
        _assign(cursor, tournament_id, category_id, "team", team_ids)
