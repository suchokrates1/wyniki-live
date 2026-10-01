"""Umpire panic: one WhatsApp fan-out, with a short cooldown."""
from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any

from ..config import logger, settings
from ..database.connection import fetch_app_settings, upsert_app_settings
from ..database.panic import (
    delete_panic_recipient,
    insert_panic_recipient,
    list_panic_recipients,
    update_panic_recipient,
)
from .court_manager import get_court_state
from .tablet_aliases import fleet_label
from .waha_client import send_text, waha_configured

_PANIC_ENABLED_KEY = "panic_enabled"
_last_sent: dict[str, float] = {}


def panic_enabled() -> bool:
    stored = fetch_app_settings([_PANIC_ENABLED_KEY]).get(_PANIC_ENABLED_KEY)
    return stored != "0"


def set_panic_enabled(enabled: bool) -> None:
    upsert_app_settings({_PANIC_ENABLED_KEY: "1" if enabled else "0"})


def list_recipients() -> list[dict[str, Any]]:
    return list_panic_recipients()


def add_recipient(name: str, chat_id: str) -> dict[str, Any]:
    clean_name = name.strip()
    clean_chat = chat_id.strip()
    if not clean_name or not clean_chat:
        raise ValueError("name and chat_id are required")
    new_id = insert_panic_recipient(clean_name, clean_chat)
    return {"id": new_id, "name": clean_name, "chat_id": clean_chat, "enabled": True}


def update_recipient(recipient_id: int, *, name: str | None = None, chat_id: str | None = None, enabled: bool | None = None) -> dict[str, Any] | None:
    current = next((row for row in list_recipients() if row["id"] == recipient_id), None)
    if current is None:
        return None
    next_name = current["name"] if name is None else name.strip()
    next_chat = current["chat_id"] if chat_id is None else chat_id.strip()
    next_enabled = current["enabled"] if enabled is None else bool(enabled)
    if not next_name or not next_chat:
        raise ValueError("name and chat_id are required")
    update_panic_recipient(recipient_id, next_name, next_chat, next_enabled)
    return {"id": recipient_id, "name": next_name, "chat_id": next_chat, "enabled": next_enabled}


def delete_recipient(recipient_id: int) -> bool:
    return delete_panic_recipient(recipient_id)


_COURT_PREFIX = re.compile(r"^(court|kort|platz|campo|cancha|kortas)\s+", re.IGNORECASE)
_COURT_ID = re.compile(r"^t\d+-(\d+)$", re.IGNORECASE)


def _court_ordinal(value: str) -> str:
    text = str(value or "").strip()
    if not text or text == "?":
        return ""
    plain = _COURT_PREFIX.sub("", text).strip()
    if plain.isdigit():
        return plain
    match = _COURT_ID.fullmatch(plain)
    return match.group(1) if match else ""


def display_court(court_id: str) -> str:
    """The number the umpire sees, never a question mark for a missing court."""
    state = get_court_state(court_id) or {}
    name = str(state.get("court_name") or "").strip()
    for candidate in (name, court_id):
        ordinal = _court_ordinal(candidate)
        if ordinal:
            return ordinal
    return name or str(court_id or "").strip()


def tablet_label(client: dict[str, Any] | None) -> str:
    meta = client or {}
    return fleet_label(
        device=meta.get("device"),
        device_model=meta.get("device_model"),
        device_manufacturer=meta.get("device_manufacturer"),
        platform=meta.get("platform"),
    )


def compose_message(*, tournament: str, court_id: str, players: str, note: str, tablet: str = "", when: datetime | None = None) -> str:
    del when
    court = str(court_id or "").strip()
    who = str(tablet or "").strip()
    if court and court != "?":
        text = f"Sędzia na korcie {court} potrzebuje pomocy."
    elif who and who not in {"Tablet", "PWA"}:
        text = f"Sędzia na {who} potrzebuje pomocy."
    else:
        text = "Sędzia potrzebuje pomocy."
    if players:
        text += f" {players}."
    if tournament:
        text += f" {tournament}."
    clean_note = " ".join((note or "").split())
    if clean_note:
        text += f" Notatka: {clean_note[:280]}"
    return text


def court_context(court_id: str) -> dict[str, str]:
    state = get_court_state(court_id) or {}
    names = []
    for side in ("A", "B"):
        player = state.get(side) or {}
        label = (player.get("full_name") or player.get("surname") or "").strip()
        if label and label != "-":
            names.append(label)
    return {
        "tournament": str(state.get("tournament_name") or "").strip(),
        "court_id": display_court(court_id),
        "players": " – ".join(names),
    }


def cooldown_key(court_id: str, remote_addr: str) -> str:
    if court_id:
        return f"court:{court_id}"
    return f"ip:{remote_addr or 'unknown'}"


def cooldown_remaining(key: str, now: float | None = None) -> int:
    last = _last_sent.get(key)
    if last is None:
        return 0
    left = int(settings.panic_cooldown_seconds) - int((now if now is not None else time.monotonic()) - last)
    return max(left, 0)


def mark_sent(key: str, now: float | None = None) -> None:
    _last_sent[key] = now if now is not None else time.monotonic()


def reset_cooldowns() -> None:
    _last_sent.clear()


def dispatch_panic(*, court_id: str, note: str, remote_addr: str, client: dict[str, Any] | None = None) -> tuple[dict[str, Any], int]:
    if not waha_configured():
        return {"error": "Panic is not configured"}, 503
    if not panic_enabled():
        return {"error": "Panic is disabled"}, 403
    recipients = [row for row in list_recipients() if row["enabled"]]
    if not recipients:
        return {"error": "No panic recipients"}, 503

    key = cooldown_key(court_id, remote_addr)
    remaining = cooldown_remaining(key)
    if remaining:
        return {"error": "Cooldown", "retry_after": remaining}, 429

    ctx = court_context(court_id) if court_id else {"tournament": "", "court_id": "", "players": ""}
    text = compose_message(
        tournament=ctx["tournament"],
        court_id=ctx["court_id"],
        players=ctx["players"],
        note=note,
        tablet="" if ctx["court_id"] else tablet_label(client),
    )
    sent = 0
    failed = 0
    for recipient in recipients:
        if send_text(recipient["chat_id"], text):
            sent += 1
        else:
            failed += 1
    if sent == 0:
        logger.warning("panic_delivery_failed", court_id=court_id or None, failed=failed)
        return {"error": "WhatsApp delivery failed", "failed": failed}, 502
    mark_sent(key)
    logger.info("panic_sent", court_id=court_id or None, sent=sent, failed=failed)
    return {"ok": True, "sent": sent, "failed": failed}, 200
