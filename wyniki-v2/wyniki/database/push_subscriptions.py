"""Storage for public Web Push subscriptions.

One row per browser that asked to be told when a match starts. The push
service's endpoint URL identifies the device, so it is the primary key in
practice: re-subscribing the same browser updates the row rather than piling up
duplicates. Rows are dropped as soon as a push service says the endpoint is
gone, which is the only reliable unsubscribe signal browsers give us.
"""

from __future__ import annotations

from typing import Any

import structlog

from .connection import db_conn

logger = structlog.get_logger()


def save_subscription(
    endpoint: str,
    p256dh: str,
    auth: str,
    court_id: str | None = None,
    lang: str = "pl",
) -> bool:
    """Store or refresh one subscription. Returns False only on a real failure."""
    if not endpoint or not p256dh or not auth:
        return False
    try:
        with db_conn() as conn:
            conn.execute(
                """
                INSERT INTO push_subscriptions (endpoint, p256dh, auth, court_id, lang)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET
                    p256dh = excluded.p256dh,
                    auth = excluded.auth,
                    court_id = excluded.court_id,
                    lang = excluded.lang
                """,
                (endpoint, p256dh, auth, court_id or None, lang or "pl"),
            )
            conn.commit()
        return True
    except Exception as exc:  # noqa: BLE001 - surfaced by the caller as a 500
        logger.error("push_subscription_save_error", error=str(exc))
        raise


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
            WHERE court_id IS NULL OR court_id = ?
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


def count_subscriptions() -> int:
    with db_conn() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0])
