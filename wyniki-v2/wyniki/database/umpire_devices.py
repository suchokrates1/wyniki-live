"""Umpire tablets seen by ANDROID_ID. Five Teclasts share one model string."""
from __future__ import annotations

from .connection import db_conn


def device_sticker(android_id: str) -> str:
    ident = str(android_id or "").strip()[:32]
    if not ident:
        return ""
    with db_conn() as conn:
        row = conn.execute(
            "SELECT sticker FROM umpire_devices WHERE android_id = ?",
            (ident,),
        ).fetchone()
    if row is None:
        return ""
    return str(row["sticker"] or "").strip()


def set_device_sticker(android_id: str, sticker: str) -> None:
    ident = str(android_id or "").strip()[:32]
    label = str(sticker or "").strip()[:40]
    if not ident or not label:
        return
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO umpire_devices (android_id, sticker)
            VALUES (?, ?)
            ON CONFLICT(android_id) DO UPDATE SET sticker = excluded.sticker
            """,
            (ident, label),
        )
        conn.commit()


def claim_low_battery_alert(android_id: str) -> dict | None:
    """Latch a low-battery warning. Return the row once, when WhatsApp should go out."""
    ident = str(android_id or "").strip()[:32]
    if not ident:
        return None
    with db_conn() as conn:
        row = conn.execute(
            """
            SELECT android_id, manufacturer, model, device, sticker,
                   battery_level, is_charging, battery_alert_percent, battery_alert_active
            FROM umpire_devices WHERE android_id = ?
            """,
            (ident,),
        ).fetchone()
        if row is None:
            return None
        level = row["battery_level"]
        threshold = row["battery_alert_percent"]
        charging = bool(row["is_charging"])
        active = bool(row["battery_alert_active"])
        low = (
            level is not None
            and threshold is not None
            and not charging
            and int(level) <= int(threshold)
        )
        if not low:
            if active:
                conn.execute(
                    "UPDATE umpire_devices SET battery_alert_active = 0 WHERE android_id = ?",
                    (ident,),
                )
                conn.commit()
            return None
        if active:
            return None
        conn.execute(
            "UPDATE umpire_devices SET battery_alert_active = 1 WHERE android_id = ?",
            (ident,),
        )
        conn.commit()
        return dict(row)


def list_umpire_devices() -> list[dict]:
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT android_id, manufacturer, model, device, platform, last_court_id, sticker,
                   battery_level, is_charging, app_version, battery_alert_percent, last_seen
            FROM umpire_devices
            ORDER BY last_seen DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def update_umpire_device(android_id: str, *, name: str | None = None, battery_alert_percent: int | None = None, clear_alert: bool = False) -> bool:
    ident = str(android_id or "").strip()[:32]
    if not ident:
        return False
    assignments = []
    values: list = []
    if name is not None:
        assignments.append("sticker = ?")
        values.append(str(name).strip()[:40])
    if clear_alert:
        assignments.append("battery_alert_percent = NULL")
    elif battery_alert_percent is not None:
        assignments.append("battery_alert_percent = ?")
        values.append(int(battery_alert_percent))
    if not assignments:
        return True
    values.append(ident)
    with db_conn() as conn:
        cursor = conn.execute(
            f"UPDATE umpire_devices SET {', '.join(assignments)} WHERE android_id = ?",
            values,
        )
        conn.commit()
        return cursor.rowcount > 0


def remember_umpire_device(
    *,
    android_id: str,
    manufacturer: str = "",
    model: str = "",
    device: str = "",
    platform: str = "",
    court_id: str = "",
    battery_level: int | None = None,
    is_charging: bool | None = None,
    app_version: str = "",
) -> None:
    ident = str(android_id or "").strip()
    if not ident:
        return
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO umpire_devices (
                android_id, manufacturer, model, device, platform, last_court_id,
                battery_level, is_charging, app_version, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(android_id) DO UPDATE SET
                manufacturer = CASE
                    WHEN excluded.manufacturer != '' THEN excluded.manufacturer
                    ELSE umpire_devices.manufacturer
                END,
                model = CASE
                    WHEN excluded.model != '' THEN excluded.model
                    ELSE umpire_devices.model
                END,
                device = CASE
                    WHEN excluded.device != '' THEN excluded.device
                    ELSE umpire_devices.device
                END,
                platform = CASE
                    WHEN excluded.platform != '' THEN excluded.platform
                    ELSE umpire_devices.platform
                END,
                last_court_id = CASE
                    WHEN excluded.last_court_id != '' THEN excluded.last_court_id
                    ELSE umpire_devices.last_court_id
                END,
                battery_level = COALESCE(excluded.battery_level, umpire_devices.battery_level),
                is_charging = COALESCE(excluded.is_charging, umpire_devices.is_charging),
                app_version = COALESCE(excluded.app_version, umpire_devices.app_version),
                last_seen = CURRENT_TIMESTAMP
            """,
            (
                ident[:32],
                str(manufacturer or "")[:80],
                str(model or "")[:120],
                str(device or "")[:160],
                str(platform or "")[:50],
                str(court_id or "")[:80],
                battery_level,
                None if is_charging is None else int(bool(is_charging)),
                str(app_version or "").strip()[:40] or None,
            ),
        )
        conn.commit()
