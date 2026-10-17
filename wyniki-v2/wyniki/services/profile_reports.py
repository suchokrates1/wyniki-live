"""Save a profile report and tell the desk on WhatsApp, the same numbers as the panic button."""
from __future__ import annotations

from ..config import logger, settings
from ..database.orm_rows import get_row
from ..database.panic import list_panic_recipients
from ..database.profile_reports import DAILY_LIMIT, add_report, recent_count
from ..db_models import GlobalPlayer, Player
from .waha_client import send_text, waha_configured

MESSAGE_MIN = 3
MESSAGE_MAX = 800


def _subject(global_player_id: int | None, entry_id: int | None):
    """The person the report is about, taken from the database, not from the form."""
    if global_player_id:
        person = get_row(GlobalPlayer, global_player_id)
        if person is None:
            return None
        return person.id, None, person.full_name
    if entry_id:
        entry = get_row(Player, entry_id)
        if entry is None:
            return None
        return entry.global_player_id, entry.id, entry.full_name
    return None


def _notify(name: str, message: str, global_player_id: int | None) -> None:
    if not waha_configured():
        logger.info("profile_report_saved", notify="waha_off")
        return
    recipients = [row for row in list_panic_recipients() if row["enabled"]]
    if not recipients:
        logger.info("profile_report_saved", notify="no_recipients")
        return
    link = ""
    if global_player_id:
        link = f"\n{settings.mail_base_url.rstrip('/')}/#players/global/{global_player_id}"
    text = f"Błąd w profilu: {name}\n{message[:MESSAGE_MAX]}{link}"
    sent = 0
    for recipient in recipients:
        if send_text(recipient["chat_id"], text):
            sent += 1
    logger.info("profile_report_sent", sent=sent)


def submit_report(payload: dict) -> tuple[dict, int]:
    """(body, http status). A filled honeypot looks like success and is dropped."""
    if str(payload.get("leave_blank") or "").strip():
        return {"ok": True}, 200

    message = " ".join(str(payload.get("message") or "").split())
    if len(message) < MESSAGE_MIN or len(message) > MESSAGE_MAX:
        return {"error": "message"}, 400

    try:
        global_player_id = int(payload["global_player_id"]) if payload.get("global_player_id") else None
        entry_id = int(payload["entry_id"]) if payload.get("entry_id") else None
    except (TypeError, ValueError):
        return {"error": "player"}, 400

    subject = _subject(global_player_id, entry_id)
    if subject is None:
        return {"error": "player"}, 404
    global_player_id, entry_id, name = subject
    if not name:
        return {"error": "player"}, 404

    if recent_count(global_player_id, entry_id) >= DAILY_LIMIT:
        return {"error": "limit"}, 429

    add_report(global_player_id, entry_id, name, message)
    try:
        _notify(name, message, global_player_id)
    except Exception as exc:
        logger.warning("profile_report_notify_failed", error=str(exc))
    return {"ok": True}, 200
