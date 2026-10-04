"""Storage for public Web Push subscriptions.

One row per browser that asked to be told when a match starts. The push
service's endpoint URL identifies the device, so it is the primary key in
practice: re-subscribing the same browser updates the row rather than piling up
duplicates. Rows are dropped as soon as a push service says the endpoint is
gone, which is the only reliable unsubscribe signal browsers give us.
"""

from __future__ import annotations

import unicodedata
from typing import Any

import structlog

from .connection import db_conn

logger = structlog.get_logger()

DEFAULT_REMINDER_MINUTES = 30
PREFERENCE_COLUMNS = (
    "notify_match_start",
    "notify_plan",
    "notify_change",
    "notify_reminder",
    "notify_delay",
)


def player_key(name: str) -> str:
    """A name reduced to something two spellings of the same player share.

    The schedule stores names as free text typed by the office, so "Kozioł",
    "koziol" and "KOZIOŁ" have to land on the same key. Accents are folded
    rather than stripped by hand so this holds for every language we show.
    """
    folded = unicodedata.normalize("NFKD", str(name or ""))
    ascii_only = "".join(ch for ch in folded if not unicodedata.combining(ch))
    # Polish ł has no combining form, so it survives NFKD and needs folding here.
    ascii_only = ascii_only.replace("ł", "l").replace("Ł", "L")
    return " ".join(ascii_only.lower().split())


def players_in_fixture(*names: Any) -> set[str]:
    """Every player a schedule row refers to, splitting doubles pairs."""
    keys: set[str] = set()
    for name in names:
        for part in str(name or "").split("/"):
            key = player_key(part)
            if key:
                keys.add(key)
    return keys


def save_subscription(
    endpoint: str,
    p256dh: str,
    auth: str,
    court_id: str | None = None,
    lang: str = "pl",
    preferences: dict[str, Any] | None = None,
    players: list[str] | None = None,
) -> bool:
    """Store or refresh one subscription, its preferences and followed players."""
    if not endpoint or not p256dh or not auth:
        return False
    prefs = preferences or {}
    # Anything the caller does not mention keeps the first version's behaviour:
    # tell me about match starts and about my plan, stay quiet about the rest.
    defaults = {
        "notify_match_start": True,
        "notify_plan": True,
        "notify_change": True,
        "notify_reminder": False,
        "notify_delay": False,
    }
    stored = {column: 1 if prefs.get(column, defaults[column]) else 0 for column in PREFERENCE_COLUMNS}
    stored["reminder_minutes"] = int(prefs.get("reminder_minutes") or DEFAULT_REMINDER_MINUTES)

    columns = ("endpoint", "p256dh", "auth", "court_id", "lang", *stored)
    updatable = [c for c in columns if c != "endpoint"]
    sql = (
        f"INSERT INTO push_subscriptions ({', '.join(columns)})"
        f" VALUES ({', '.join('?' for _ in columns)})"
        f" ON CONFLICT(endpoint) DO UPDATE SET {', '.join(f'{c} = excluded.{c}' for c in updatable)}"
    )
    params = (endpoint, p256dh, auth, court_id or None, lang or "pl", *stored.values())

    try:
        with db_conn() as conn:
            conn.execute(sql, params)
            row = conn.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
            subscription_id = row[0]
            conn.execute("DELETE FROM push_subscription_players WHERE subscription_id = ?", (subscription_id,))
            for name in players or []:
                key = player_key(name)
                if not key:
                    continue
                conn.execute(
                    "INSERT OR REPLACE INTO push_subscription_players (subscription_id, player_key, player_name)"
                    " VALUES (?, ?, ?)",
                    (subscription_id, key, str(name).strip()),
                )
            conn.commit()
        return True
    except Exception as exc:  # noqa: BLE001 - surfaced by the caller as a 500
        logger.error("push_subscription_save_error", error=str(exc))
        raise


def subscriptions_for_players(player_keys: set[str], preference: str) -> list[dict[str, Any]]:
    """Devices following any of these players that asked for this notification."""
    if not player_keys or preference not in PREFERENCE_COLUMNS:
        return []
    placeholders = ",".join("?" for _ in player_keys)
    with db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT s.endpoint, s.p256dh, s.auth, s.lang, s.reminder_minutes
            FROM push_subscriptions s
            JOIN push_subscription_players p ON p.subscription_id = s.id
            WHERE p.player_key IN ({placeholders}) AND s.{preference} = 1
            """,
            tuple(player_keys),
        ).fetchall()
    return [
        {"endpoint": r[0], "p256dh": r[1], "auth": r[2], "lang": r[3], "reminder_minutes": r[4]}
        for r in rows
    ]


def followed_players(endpoint: str) -> list[str]:
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT p.player_name FROM push_subscription_players p"
            " JOIN push_subscriptions s ON s.id = p.subscription_id WHERE s.endpoint = ?",
            (endpoint,),
        ).fetchall()
    return [r[0] for r in rows]


def delete_subscription(endpoint: str) -> bool:
    """Remove one subscription. True when a row actually went away."""
    if not endpoint:
        return False
    with db_conn() as conn:
        cursor = conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        conn.commit()
        return cursor.rowcount > 0


def subscriptions_for_court(court_id: str | None) -> list[dict[str, Any]]:
    """Subscriptions to notify for a court: those watching it, plus the ones
    that asked about every court (`court_id IS NULL`)."""
    with db_conn() as conn:
        conn.row_factory = None
        rows = conn.execute(
            """
            SELECT endpoint, p256dh, auth, lang
            FROM push_subscriptions
            WHERE notify_match_start = 1 AND (court_id IS NULL OR court_id = ?)
            """,
            (court_id,),
        ).fetchall()
    return [
        {"endpoint": row[0], "p256dh": row[1], "auth": row[2], "lang": row[3]}
        for row in rows
    ]


def mark_sent(endpoints: list[str]) -> None:
    if not endpoints:
        return
    placeholders = ",".join("?" for _ in endpoints)
    with db_conn() as conn:
        conn.execute(
            f"UPDATE push_subscriptions SET last_sent_at = CURRENT_TIMESTAMP WHERE endpoint IN ({placeholders})",
            endpoints,
        )
        conn.commit()


def claim_send(schedule_id: int, kind: str) -> bool:
    """Reserve one notification for a fixture. False when it already went out.

    The insert itself is the lock: the primary key makes a second attempt fail,
    so a restart mid-pass cannot send anything twice.
    """
    try:
        with db_conn() as conn:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO push_sent_log (schedule_id, kind) VALUES (?, ?)",
                (int(schedule_id), str(kind)),
            )
            conn.commit()
            return cursor.rowcount > 0
    except Exception as exc:  # noqa: BLE001 - a missed reminder beats a crashed job
        logger.warning("push_sent_log_claim_failed", error=str(exc), schedule_id=schedule_id, kind=kind)
        return False


def release_send(schedule_id: int, kind: str) -> None:
    """Give a claim back when the send turned out to reach nobody."""
    try:
        with db_conn() as conn:
            conn.execute(
                "DELETE FROM push_sent_log WHERE schedule_id = ? AND kind = ?",
                (int(schedule_id), str(kind)),
            )
            conn.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("push_sent_log_release_failed", error=str(exc), schedule_id=schedule_id)


def count_subscriptions() -> int:
    with db_conn() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0])
