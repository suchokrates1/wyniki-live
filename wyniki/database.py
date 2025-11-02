"""Database helpers for persisting match snapshots and history."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Dict, Generator, Iterable, List, Optional, Tuple

from .config import settings
from .utils import surname


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
            CREATE TABLE IF NOT EXISTS courts (
              kort_id TEXT PRIMARY KEY,
              overlay_id TEXT
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS players (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              list_name TEXT NOT NULL DEFAULT 'default',
              name TEXT NOT NULL,
              flag_code TEXT,
              flag_url TEXT
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
              tie_b INTEGER,
              set1_tb_a INTEGER DEFAULT 0,
              set1_tb_b INTEGER DEFAULT 0,
              set2_tb_a INTEGER DEFAULT 0,
              set2_tb_b INTEGER DEFAULT 0,
              category TEXT,
              phase TEXT DEFAULT 'Grupowa'
            );
            """
        )

        cursor.execute("PRAGMA table_info(match_history)")
        existing_columns = {row["name"] for row in cursor.fetchall()}
        migrations = {
            "set1_tb_a": "ALTER TABLE match_history ADD COLUMN set1_tb_a INTEGER DEFAULT 0",
            "set1_tb_b": "ALTER TABLE match_history ADD COLUMN set1_tb_b INTEGER DEFAULT 0",
            "set2_tb_a": "ALTER TABLE match_history ADD COLUMN set2_tb_a INTEGER DEFAULT 0",
            "set2_tb_b": "ALTER TABLE match_history ADD COLUMN set2_tb_b INTEGER DEFAULT 0",
            "category": "ALTER TABLE match_history ADD COLUMN category TEXT",
            "phase": "ALTER TABLE match_history ADD COLUMN phase TEXT DEFAULT 'Grupowa'",
        }
        for column, statement in migrations.items():
            if column not in existing_columns:
                cursor.execute(statement)
        if "phase" not in existing_columns:
            cursor.execute("UPDATE match_history SET phase = 'Grupowa' WHERE phase IS NULL")
        else:
            cursor.execute(
                "UPDATE match_history SET phase = 'Grupowa' WHERE phase IS NULL OR TRIM(phase) = ''"
            )
        connection.commit()


def fetch_app_settings(keys: Optional[Iterable[str]] = None) -> Dict[str, Optional[str]]:
    query = "SELECT key, value FROM app_settings"
    params: List[object] = []
    filtered_keys: Optional[List[str]] = None
    if keys is not None:
        filtered_keys = [str(key) for key in keys if key]
        if not filtered_keys:
            return {}
        placeholders = ", ".join("?" for _ in filtered_keys)
        query += f" WHERE key IN ({placeholders})"
        params.extend(filtered_keys)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
    settings_map: Dict[str, Optional[str]] = {
        str(row["key"]): row["value"] for row in rows
    }
    if filtered_keys is not None:
        for key in filtered_keys:
            settings_map.setdefault(key, None)
    return settings_map


def upsert_app_settings(updates: Dict[str, Optional[str]]) -> None:
    if not updates:
        return
    with db_conn() as connection:
        cursor = connection.cursor()
        for raw_key, raw_value in updates.items():
            if not raw_key:
                continue
            key = str(raw_key)
            value: Optional[str]
            if raw_value is None:
                value = None
            else:
                text_value = str(raw_value).strip()
                value = text_value or None
            if value is None:
                cursor.execute("DELETE FROM app_settings WHERE key = ?", (key,))
            else:
                cursor.execute(
                    """
                    INSERT INTO app_settings (key, value)
                    VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value
                    """,
                    (key, value),
                )
        connection.commit()


def _row_to_player_dict(row: sqlite3.Row) -> Dict[str, Optional[str]]:
    return {
        "id": int(row["id"]),
        "list_name": row["list_name"],
        "name": row["name"],
        "flag_code": row["flag_code"],
        "flag_url": row["flag_url"],
    }


def fetch_players(list_name: Optional[str] = None) -> List[Dict[str, Optional[str]]]:
    query = "SELECT id, list_name, name, flag_code, flag_url FROM players"
    params: List[object] = []
    if list_name:
        query += " WHERE list_name = ?"
        params.append(str(list_name))
    query += " ORDER BY list_name COLLATE NOCASE, name COLLATE NOCASE, id"
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
    return [_row_to_player_dict(row) for row in rows]


def fetch_player(player_id: int) -> Optional[Dict[str, Optional[str]]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT id, list_name, name, flag_code, flag_url FROM players WHERE id = ?",
            (player_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return _row_to_player_dict(row)


def _flag_score(row: sqlite3.Row) -> int:
    score = 0
    if row["flag_url"]:
        score += 2
    if row["flag_code"]:
        score += 1
    return score


def find_player_by_surname(
    surname_value: str, list_name: Optional[str] = None
) -> Optional[Dict[str, Optional[str]]]:
    normalized = str(surname_value or "").strip()
    if not normalized:
        return None
    normalized_lower = normalized.lower()

    query = "SELECT id, list_name, name, flag_code, flag_url FROM players"
    params: List[object] = []
    if list_name:
        query += " WHERE list_name = ?"
        params.append(str(list_name))

    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()

    matches: List[Tuple[int, sqlite3.Row]] = []
    for row in rows:
        player_surname = surname(row["name"]) if row["name"] else None
        if player_surname and player_surname.strip().lower() == normalized_lower:
            score = _flag_score(row)
            matches.append((-score, row))

    if not matches:
        return None

    matches.sort(key=lambda item: (item[0], str(item[1]["name"]).lower(), int(item[1]["id"])))
    return _row_to_player_dict(matches[0][1])


def insert_player(
    name: str,
    list_name: Optional[str] = None,
    flag_code: Optional[str] = None,
    flag_url: Optional[str] = None,
) -> int:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO players (list_name, name, flag_code, flag_url)
            VALUES (?, ?, ?, ?)
            """,
            (
                str(list_name or "default"),
                name,
                flag_code.strip() if flag_code else None,
                flag_url.strip() if flag_url else None,
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)


def update_player(player_id: int, updates: Dict[str, Optional[str]]) -> bool:
    allowed = {"name", "list_name", "flag_code", "flag_url"}
    sanitized: Dict[str, Optional[str]] = {}
    for raw_key, raw_value in updates.items():
        if raw_key not in allowed:
            continue
        if raw_value is None:
            sanitized[raw_key] = None
        else:
            sanitized[raw_key] = str(raw_value).strip() or None
    if "name" in sanitized and not sanitized["name"]:
        raise ValueError("name")
    if not sanitized:
        return False
    columns = ", ".join(f"{key} = ?" for key in sanitized)
    values = list(sanitized.values())
    values.append(player_id)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(f"UPDATE players SET {columns} WHERE id = ?", values)
        connection.commit()
        return cursor.rowcount > 0


def delete_player(player_id: int) -> bool:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM players WHERE id = ?", (player_id,))
        connection.commit()
        return cursor.rowcount > 0


def fetch_courts() -> List[Dict[str, Optional[str]]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT kort_id, overlay_id
            FROM courts
            ORDER BY CAST(kort_id AS INTEGER), kort_id
            """
        )
        rows = cursor.fetchall()
    return [
        {"kort_id": str(row["kort_id"]), "overlay_id": row["overlay_id"] or None}
        for row in rows
    ]


def fetch_court(kort_id: str) -> Optional[Dict[str, Optional[str]]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT kort_id, overlay_id FROM courts WHERE kort_id = ? LIMIT 1",
            (kort_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return {"kort_id": str(row["kort_id"]), "overlay_id": row["overlay_id"] or None}


def upsert_court(kort_id: str, overlay_id: Optional[str]) -> None:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO courts (kort_id, overlay_id)
            VALUES (?, ?)
            ON CONFLICT(kort_id) DO UPDATE SET overlay_id=excluded.overlay_id
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
                   set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                   set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
                   category, phase
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
                set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
                category, phase
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                entry.get("set1_tb_a", 0),
                entry.get("set1_tb_b", 0),
                entry.get("set2_tb_a", 0),
                entry.get("set2_tb_b", 0),
                entry.get("category"),
                entry.get("phase"),
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
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                       set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
                       category, phase
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
                       set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                       set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
                       category, phase
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
        "set1_tb_a": row["set1_tb_a"],
        "set1_tb_b": row["set1_tb_b"],
        "set2_tb_a": row["set2_tb_a"],
        "set2_tb_b": row["set2_tb_b"],
        "category": row["category"],
        "phase": row["phase"],
    }


def fetch_all_history(limit: Optional[int] = None) -> List[Dict[str, object]]:
    query = (
        """
        SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
               set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
               set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
               category, phase
        FROM match_history
        ORDER BY id DESC
        {limit_clause}
        """
    )
    limit_clause = ""
    params: List[object] = []
    if isinstance(limit, int) and limit > 0:
        limit_clause = "LIMIT ?"
        params.append(limit)
    query = query.format(limit_clause=limit_clause)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
    return [_row_to_history_dict(row) for row in rows]


def fetch_history_entry(entry_id: int) -> Optional[Dict[str, object]]:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT id, kort_id, ended_ts, duration_seconds, player_a, player_b,
                   set1_a, set1_b, set2_a, set2_b, tie_a, tie_b,
                   set1_tb_a, set1_tb_b, set2_tb_a, set2_tb_b,
                   category, phase
            FROM match_history
            WHERE id = ?
            LIMIT 1
            """,
            (entry_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return _row_to_history_dict(row)


def update_history_entry(entry_id: int, fields: Dict[str, object]) -> bool:
    allowed = {
        "kort_id",
        "ended_ts",
        "duration_seconds",
        "player_a",
        "player_b",
        "set1_a",
        "set1_b",
        "set2_a",
        "set2_b",
        "tie_a",
        "tie_b",
        "set1_tb_a",
        "set1_tb_b",
        "set2_tb_a",
        "set2_tb_b",
        "category",
        "phase",
    }
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return False
    columns = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values())
    values.append(entry_id)
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute(f"UPDATE match_history SET {columns} WHERE id = ?", values)
        connection.commit()
        return cursor.rowcount > 0


def delete_history_entry(entry_id: int) -> bool:
    with db_conn() as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM match_history WHERE id = ?", (entry_id,))
        connection.commit()
        return cursor.rowcount > 0


def _row_to_history_dict(row: sqlite3.Row) -> Dict[str, object]:
    return {
        "id": row["id"],
        "kort_id": row["kort_id"],
        "ended_ts": row["ended_ts"],
        "duration_seconds": row["duration_seconds"],
        "player_a": row["player_a"],
        "player_b": row["player_b"],
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
        "category": row["category"],
        "phase": row["phase"],
    }


init_db()

__all__ = [
    "db_conn",
    "delete_court",
    "delete_latest_history_entry",
    "delete_player",
    "fetch_app_settings",
    "fetch_court",
    "fetch_courts",
    "fetch_player",
    "fetch_players",
    "fetch_recent_history",
    "fetch_state_cache",
    "init_db",
    "insert_match_history",
    "insert_player",
    "upsert_app_settings",
    "upsert_court",
    "update_player",
    "upsert_state_cache",
]
