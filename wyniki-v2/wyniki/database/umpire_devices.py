"""Umpire tablets seen by ANDROID_ID. Five Teclasts share one model string."""
from __future__ import annotations

from .connection import db_conn


def remember_umpire_device(
    *,
    android_id: str,
    manufacturer: str = "",
    model: str = "",
    device: str = "",
    platform: str = "",
    court_id: str = "",
) -> None:
    ident = str(android_id or "").strip()
    if not ident:
        return
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO umpire_devices (
                android_id, manufacturer, model, device, platform, last_court_id, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(android_id) DO UPDATE SET
                manufacturer = excluded.manufacturer,
                model = excluded.model,
                device = excluded.device,
                platform = excluded.platform,
                last_court_id = excluded.last_court_id,
                last_seen = CURRENT_TIMESTAMP
            """,
            (
                ident[:32],
                str(manufacturer or "")[:80],
                str(model or "")[:120],
                str(device or "")[:160],
                str(platform or "")[:50],
                str(court_id or "")[:80],
            ),
        )
        conn.commit()
