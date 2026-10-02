"""WhatsApp when a known tablet drops to the battery level set in the admin list."""
from __future__ import annotations

from typing import Any

from ..config import logger
from ..database.connection import db_conn
from ..database.panic import list_panic_recipients
from ..database.umpire_devices import list_umpire_devices
from .panic import tablet_label
from .waha_client import send_text, waha_configured


def battery_percent(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    if number < 0 or number > 100:
        return None
    return number


def charging_flag(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes"}


def _who(row: dict) -> str:
    sticker = str(row.get("sticker") or "").strip()
    if sticker.isdigit():
        return f"Tablet {sticker}"
    if sticker:
        return sticker
    model = tablet_label(row)
    if model:
        return model
    return str(row.get("android_id") or "Tablet")


def consider_low_battery(android_id: str) -> str | None:
    """Return the WhatsApp text once, when the level first falls to the threshold."""
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
        data = dict(row)
    return f"{_who(data)} ma {int(level)}% baterii."


def notify_low_battery(text: str) -> None:
    if not text or not waha_configured():
        return
    recipients = [row for row in list_panic_recipients() if row["enabled"]]
    if not recipients:
        logger.info("battery_alert_skipped", reason="no recipients")
        return
    sent = 0
    for recipient in recipients:
        if send_text(recipient["chat_id"], text):
            sent += 1
    logger.info("battery_alert_sent", sent=sent)


def device_rows() -> list[dict]:
    rows = []
    for row in list_umpire_devices():
        seen = str(row.get("last_seen") or "").strip()
        if seen and "T" not in seen:
            seen = seen.replace(" ", "T") + "Z"
        rows.append({
            "android_id": row["android_id"],
            "name": str(row.get("sticker") or ""),
            "model": tablet_label(row),
            "manufacturer": row.get("manufacturer") or "",
            "platform": row.get("platform") or "",
            "last_court_id": row.get("last_court_id") or "",
            "battery_level": row.get("battery_level"),
            "is_charging": bool(row.get("is_charging")) if row.get("is_charging") is not None else False,
            "app_version": row.get("app_version") or "",
            "battery_alert_percent": row.get("battery_alert_percent"),
            "last_seen": seen,
        })
    return rows
