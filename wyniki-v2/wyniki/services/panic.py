"""Umpire panic: one WhatsApp fan-out, with a short cooldown."""
from __future__ import annotations

import calendar
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
from ..database.panic_threads import (
    add_message,
    known_waha_ids,
    open_thread,
    thread_view,
    waiting_thread_count,
)
from ..database.courts import get_tournament_id_for_court
from ..database.tournaments import fetch_tournament, get_active_tournament_name
from ..database.umpire_devices import device_is_test, device_sticker, remember_umpire_device
from .court_manager import get_court_state
from .waha_client import recent_messages, send_text, waha_configured

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


def _without_repeated_prefix(text: str) -> str:
    parts = text.split()
    if len(parts) >= 2 and parts[1].lower().startswith(parts[0].lower()):
        return " ".join(parts[1:])
    return text


def tablet_label(client: dict[str, Any] | None) -> str:
    """Model string from the umpire app, used when the tablet has no sticker number."""
    meta = client or {}
    manufacturer = str(meta.get("device_manufacturer") or "").strip()
    model = str(meta.get("device_model") or "").strip()
    device = str(meta.get("device") or "").strip()
    if manufacturer and model:
        if model.lower().startswith(manufacturer.lower()):
            return model
        return f"{manufacturer} {model}"
    if device:
        return _without_repeated_prefix(device)
    return model


def tournament_label(court_id: str, from_state: str = "") -> str:
    name = str(from_state or "").strip()
    if name:
        return name
    if court_id:
        tournament_id = get_tournament_id_for_court(court_id)
        if tournament_id:
            row = fetch_tournament(tournament_id) or {}
            named = str(row.get("name") or "").strip()
            if named:
                return named
    return str(get_active_tournament_name() or "").strip()


def compose_message(*, tournament: str, court_id: str, players: str, note: str, tablet: str = "", android_id: str = "", sticker: str = "", when: datetime | None = None) -> str:
    del when, android_id
    court = str(court_id or "").strip()
    who = str(tablet or "").strip()
    number = str(sticker or "").strip()
    if number and court and court != "?":
        text = f"Sędzia na tablecie {number}, kort {court}, potrzebuje pomocy."
    elif number:
        text = f"Sędzia na tablecie {number} potrzebuje pomocy."
    elif court and court != "?":
        text = f"Sędzia na korcie {court} potrzebuje pomocy."
    elif who and who not in {"Tablet", "PWA"}:
        text = f"Sędzia na {who} potrzebuje pomocy."
    else:
        text = "Sędzia potrzebuje pomocy."
    named = str(tournament or "").strip()
    if named:
        text += f" Turniej: {named}."
    if players:
        text += f" {players}."
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
    meta = client or {}
    android_id = str(meta.get("android_id") or "").strip()
    remember_umpire_device(
        android_id=android_id,
        manufacturer=str(meta.get("device_manufacturer") or ""),
        model=str(meta.get("device_model") or ""),
        device=str(meta.get("device") or ""),
        platform=str(meta.get("platform") or ""),
        court_id=court_id,
    )
    if device_is_test(android_id):
        logger.info("panic_suppressed", reason="test device")
        return {"ok": True, "sent": 0, "thread_token": None}, 200
    sticker = device_sticker(android_id)
    text = compose_message(
        tournament=tournament_label(court_id, ctx["tournament"]),
        court_id=ctx["court_id"],
        players=ctx["players"],
        note=note,
        tablet="" if ctx["court_id"] or sticker else tablet_label(client),
        android_id=android_id,
        sticker=sticker,
    )
    sent = 0
    failed = 0
    deliveries: list[tuple[str, str]] = []
    for recipient in recipients:
        message_id = send_text(recipient["chat_id"], text)
        if message_id:
            sent += 1
            deliveries.append((recipient["chat_id"], message_id if isinstance(message_id, str) else ""))
        else:
            failed += 1
    if sent == 0:
        logger.warning("panic_delivery_failed", court_id=court_id or None, failed=failed)
        return {"error": "WhatsApp delivery failed", "failed": failed}, 502
    mark_sent(key)
    token = open_thread(android_id)
    shown = " ".join((note or "").split()) or "Prośba o pomoc"
    for chat_id, message_id in deliveries:
        add_message(token, direction="umpire", body=shown, waha_id=message_id, chat_id=chat_id)
    logger.info("panic_sent", court_id=court_id or None, sent=sent, failed=failed)
    return {"ok": True, "sent": sent, "failed": failed, "thread_token": token}, 200


def _unix(text: str) -> float:
    raw = str(text or "").strip().replace("T", " ")[:19]
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return 0
    return float(calendar.timegm(parsed.timetuple()))


def _message_id(message: dict[str, Any]) -> str:
    ident = message.get("id")
    if isinstance(ident, dict):
        ident = ident.get("id") or ident.get("_serialized") or ""
    return str(ident or "")


def _parent_id(message: dict[str, Any]) -> str:
    raw = message.get("_data") if isinstance(message.get("_data"), dict) else {}
    parent = raw.get("parentMsgId") or message.get("replyTo") or ""
    if isinstance(parent, dict):
        parent = parent.get("id") or parent.get("_serialized") or ""
    return str(parent or "")


def _quotes(parent: str, outbound_id: str) -> bool:
    if not parent or not outbound_id or outbound_id == "sent":
        return False
    return parent == outbound_id or outbound_id.endswith(parent) or parent.endswith(outbound_id)


def _public_messages(view: dict[str, Any]) -> list[dict[str, str]]:
    return [{"direction": row["direction"], "text": row["text"]} for row in view["messages"]]


def read_thread(token: str) -> dict[str, Any] | None:
    """Pull new WhatsApp replies, then return the conversation."""
    view = thread_view(token)
    if view is None:
        return None
    _absorb_replies(view)
    view = thread_view(token) or view
    return {"messages": _public_messages(view)}


def send_follow_up(token: str, note: str) -> tuple[dict[str, Any], int]:
    view = thread_view(token)
    if view is None:
        return {"error": "Thread not found"}, 404
    text = " ".join((note or "").split())
    if not text:
        return {"error": "Note is required"}, 400
    if not waha_configured():
        return {"error": "Panic is not configured"}, 503
    if device_is_test(view["android_id"]):
        return {"ok": True, "sent": 0}, 200
    sticker = device_sticker(view["android_id"])
    who = f"Tablet {sticker}" if sticker else "Sędzia"
    outgoing = f"{who}: {text[:280]}"
    chats = []
    seen = set()
    for row in view["messages"]:
        chat_id = row.get("chat_id") or ""
        if chat_id and chat_id not in seen:
            seen.add(chat_id)
            chats.append(chat_id)
    if not chats:
        chats = [row["chat_id"] for row in list_recipients() if row["enabled"] and row["chat_id"]]
    sent = False
    for chat_id in chats:
        message_id = send_text(chat_id, outgoing)
        if not message_id:
            continue
        sent = True
        add_message(
            token,
            direction="umpire",
            body=text,
            waha_id=message_id if isinstance(message_id, str) else "",
            chat_id=chat_id,
        )
    if not sent:
        return {"error": "WhatsApp delivery failed"}, 502
    refreshed = read_thread(token) or {"messages": []}
    return refreshed, 200


def _absorb_replies(view: dict[str, Any]) -> None:
    outbound = {row["waha_id"] for row in view["messages"] if row.get("waha_id")}
    chats = {row["chat_id"] for row in view["messages"] if row.get("chat_id")}
    if not chats or not waha_configured():
        return
    started = _unix(view["created_at"])
    only_waiting = waiting_thread_count() <= 1
    seen = known_waha_ids()
    for chat_id in chats:
        for message in recent_messages(chat_id):
            if message.get("fromMe"):
                continue
            message_id = _message_id(message)
            body = " ".join(str(message.get("body") or "").split())
            if not message_id or not body or message_id in seen:
                continue
            parent = _parent_id(message)
            quoted = any(_quotes(parent, outbound_id) for outbound_id in outbound)
            timestamp = float(message.get("timestamp") or 0)
            if not quoted and not (only_waiting and timestamp >= started - 2):
                continue
            add_message(view["token"], direction="desk", body=body, waha_id=message_id, chat_id=chat_id)
            seen.add(message_id)
