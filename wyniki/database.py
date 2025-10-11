"""Database helpers for persisting match snapshots and history."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Dict, Generator, Iterable, Optional

from .config import settings


@contextmanager
def db_conn() -> Generator[sqlite3.Connection, None, None]:
    connection = sqlite3.connect(settings.db_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts TEXT NOT NULL,
              kort_id TEXT NOT NULL,
              player TEXT NOT NULL,
              surname TEXT,
              points TEXT,
              set1 INTEGER,
              set2 INTEGER
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshot_meta (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts TEXT NOT NULL,
              kort_id TEXT NOT NULL,
              overlay_visible INTEGER NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS state_cache (
              kort_id TEXT PRIMARY KEY,
              ts TEXT NOT NULL,
              state TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS match_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kort_id TEXT NOT NULL,
              ended_ts TEXT NOT NULL,
              duration_seconds INTEGER NOT NULL,
              player_a TEXT,
              player_b TEXT,
              category TEXT,
              phase TEXT DEFAULT 'Grupowa',
              set1_a INTEGER,
              set1_b INTEGER,
              set2_a INTEGER,
              set2_b INTEGER,
              tie_a INTEGER,
              tie_b INTEGER,
              set1_tb_a INTEGER DEFAULT 0,
              set1_tb_b INTEGER DEFAULT 0,
              set2_tb_a INTEGER DEFAULT 0,
              set2_tb_b INTEGER DEFAULT 0
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS courts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kort_id TEXT NOT NULL UNIQUE,
              overlay_id TEXT NOT NULL
            );
            """
        )

        cursor.execute("PRAGMA table_info(match_history)")
        existing_columns = {row["name"] for row in cursor.fetchall()}
        tie_columns = {
            "set1_tb_a": "ALTER TABLE match_history ADD COLUMN set1_tb_a INTEGER DEFAULT 0",
            "set1_tb_b": "ALTER TABLE match_history ADD COLUMN set1_tb_b INTEGER DEFAULT 0",
            "set2_tb_a": "ALTER TABLE match_history ADD COLUMN set2_tb_a INTEGER DEFAULT 0",
            "set2_tb_b": "ALTER TABLE match_history ADD COLUMN set2_tb_b INTEGER DEFAULT 0",
        }
        for column, statement in tie_columns.items():
            if column not in existing_columns:
                cursor.execute(statement)
        if "category" not in existing_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN category TEXT")
        if "phase" not in existing_columns:
            cursor.execute("ALTER TABLE match_history ADD COLUMN phase TEXT DEFAULT 'Grupowa'")
            cursor.execute(
                "UPDATE match_history SET phase = 'Grupowa' WHERE phase IS NULL OR TRIM(phase) = ''"
            )

        cursor.execute("SELECT kort_id FROM courts")
        existing_courts = {row["kort_id"] for row in cursor.fetchall()}
        for kort_id, overlay_id in settings.overlay_ids.items():
            if overlay_id and kort_id not in existing_courts:
                cursor.execute(
                    "INSERT INTO courts (kort_id, overlay_id) VALUES (?, ?)",
                    (str(kort_id), overlay_id),
                )
        connection.commit()


def fetch_state_cache() -> Iterable[sqlite3.Row]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT kort_id, state FROM state_cache")
        return cursor.fetchall()


def upsert_state_cache(kort_id: str, ts: str, state: Dict[str, object]) -> None:
    encoded = json.dumps(state)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO state_cache (kort_id, ts, state)
            VALUES (?, ?, ?)
            ON CONFLICT(kort_id) DO UPDATE SET ts=excluded.ts, state=excluded.state
            """,
            (kort_id, ts, encoded),
        )
        connection.commit()


def fetch_recent_history(limit: int) -> Iterable[sqlite3.Row]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                   category, phase,
                   set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                   set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b
            FROM match_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return cursor.fetchall()


def fetch_match_history_entry(entry_id: int) -> Optional[sqlite3.Row]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                   category, phase,
                   set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                   set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b
            FROM match_history
            WHERE id = ?
            """,
            (entry_id,),
        )
        return cursor.fetchone()


def insert_match_history(entry: Dict[str, object]) -> int:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO match_history (
                kort_id, ended_ts, duration_seconds, player_a, player_b,
                category, phase,
                set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("kort"),
                entry.get("ended_at"),
                entry.get("duration_seconds", 0),
                entry.get("player_a"),
                entry.get("player_b"),
                entry.get("category"),
                entry.get("phase", "Grupowa"),
                entry.get("set1_a", 0),
                entry.get("set1_b", 0),
                entry.get("set2_a", 0),
                entry.get("set2_b", 0),
                entry.get("tie_a", 0),
                entry.get("tie_b", 0),
                entry.get("set1_tb_a", 0),
                entry.get("set1_tb_b", 0),
                entry.get("set2_tb_a", 0),
                entry.get("set2_tb_b", 0),
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)


def update_match_history_entry(entry_id: int, updates: Dict[str, object]) -> bool:
    assignments = []
    values = []
    for key in ("player_a", "player_b", "category", "phase"):
        if key in updates:
            assignments.append(f"{key} = ?")
            values.append(updates[key])
    if not assignments:
        return False
    values.append(entry_id)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE match_history SET {', '.join(assignments)} WHERE id = ?",
            tuple(values),
        )
        connection.commit()
        return cursor.rowcount > 0


def delete_match_history_entry_by_id(entry_id: int) -> bool:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM match_history WHERE id = ?", (entry_id,))
        connection.commit()
        return cursor.rowcount > 0


def fetch_courts() -> Iterable[sqlite3.Row]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT kort_id, overlay_id
            FROM courts
            ORDER BY CAST(kort_id AS INTEGER), kort_id
            """
        )
        return cursor.fetchall()


def upsert_court(kort_id: str, overlay_id: str) -> None:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO courts (kort_id, overlay_id)
            VALUES (?, ?)
            ON CONFLICT(kort_id) DO UPDATE SET overlay_id = excluded.overlay_id
            """,
            (kort_id, overlay_id),
        )
        connection.commit()


def delete_court(kort_id: str) -> bool:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM courts WHERE kort_id = ?", (kort_id,))
        connection.commit()
        return cursor.rowcount > 0


def delete_latest_history_entry(kort_id: Optional[str] = None) -> Optional[Dict[str, object]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        if kort_id:
            cursor.execute(
                """
                SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                       category, phase,
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                       set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b
                FROM match_history
                WHERE kort_id = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (kort_id,),
            )
        else:
            cursor.execute(
                """
                SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                       category, phase,
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                       set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b
                FROM match_history
                ORDER BY id DESC
                LIMIT 1
                """
            )
        row = cursor.fetchone()
        if not row:
            return None
        cursor.execute("DELETE FROM match_history WHERE id = ?", (row["id"],))
        connection.commit()
    return {
        "kort": row["kort_id"],
        "ended_at": row["ended_ts"],
        "duration_seconds": row["duration_seconds"],
        "player_a": row["player_a"],
        "player_b": row["player_b"],
        "category": row["category"],
        "phase": row["phase"],
        "set1_a": row["set1_a"],
        "set1_b": row["set1_b"],
        "set2_a": row["set2_a"],
        "set2_b": row["set2_b"],
        "tie_a": row["tie_a"],
        "tie_b": row["tie_b"],
        "set1_tb_a": row["set1_tb_a"],
        "set1_tb_b": row["set1_tb_b"],
        "set2_tb_a": row["set2_tb_a"],
        "set2_tb_b": row["set2_tb_b"],
    }


init_db()

__all__ = [
    "db_conn",
    "delete_court",
    "delete_latest_history_entry",
    "delete_match_history_entry_by_id",
    "fetch_courts",
    "fetch_match_history_entry",
    "fetch_recent_history",
    "fetch_state_cache",
    "init_db",
    "insert_match_history",
    "update_match_history_entry",
    "upsert_state_cache",
    "upsert_court",
]
