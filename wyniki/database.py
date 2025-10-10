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
              set1_a INTEGER,
              set1_b INTEGER,
              set2_a INTEGER,
              set2_b INTEGER,
              tie_a INTEGER,
              tie_b INTEGER
            );
            """
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
            SELECT kort_id, ended_ts, duration_seconds, player_a, player_b,
                   set1_a, set1_b, set2_a, set2_b, tie_a, tie_b
            FROM match_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        return cursor.fetchall()


def insert_match_history(entry: Dict[str, object]) -> None:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO match_history (
                kort_id, ended_ts, duration_seconds, player_a, player_b,
                set1_a, set1_b, set2_a, set2_b, tie_a, tie_b
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("kort"),
                entry.get("ended_at"),
                entry.get("duration_seconds", 0),
                entry.get("player_a"),
                entry.get("player_b"),
                entry.get("set1_a", 0),
                entry.get("set1_b", 0),
                entry.get("set2_a", 0),
                entry.get("set2_b", 0),
                entry.get("tie_a", 0),
                entry.get("tie_b", 0),
            ),
        )
        connection.commit()


def delete_latest_history_entry(kort_id: Optional[str] = None) -> Optional[Dict[str, object]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        if kort_id:
            cursor.execute(
                """
                SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b
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
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b
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
        "set1_a": row["set1_a"],
        "set1_b": row["set1_b"],
        "set2_a": row["set2_a"],
        "set2_b": row["set2_b"],
        "tie_a": row["tie_a"],
        "tie_b": row["tie_b"],
    }


init_db()

__all__ = [
    "db_conn",
    "delete_latest_history_entry",
    "fetch_recent_history",
    "fetch_state_cache",
    "init_db",
    "insert_match_history",
    "upsert_state_cache",
]
