"""Mail to a series when its subscription is about to end, and when it has ended.

Once per end date and kind: a changed end date (a renewal) starts the reminders afresh.
The series owners get it (everyone on the series when it has no owner), each in their
own language, with a copy to the organizer contact address. A notice that could not be
mailed is tried again on the next pass; it is only marked sent once it went out.
"""
from __future__ import annotations

from datetime import date, timedelta

import structlog

from ..config import settings
from ..database import series as series_db
from ..database import series_plan
from .email_reports import _send_email
from .organizer_mails import SENDER_EMAIL, SENDER_NAME, plan_mail

logger = structlog.get_logger()

DAYS_BEFORE = 14
PASS_INTERVAL_SECONDS = 3600


def due_kind(valid_until: str, today: date) -> str | None:
    """'ending' within DAYS_BEFORE days of the end, 'ended' from the day after it."""
    try:
        end = date.fromisoformat(valid_until)
    except ValueError:
        return None
    if today > end:
        return "ended"
    if end - today <= timedelta(days=DAYS_BEFORE):
        return "ending"
    return None


def _recipients(series_id: int) -> dict[str, list[str]]:
    """Addresses by language: the owners, or everyone on the series when it has no owner."""
    members = [m for m in (series_db.get_series(series_id) or {}).get("members", []) if not m["disabled"]]
    chosen = [m for m in members if m["role"] == "owner"] or members
    by_language: dict[str, list[str]] = {}
    for member in chosen:
        by_language.setdefault(member.get("language") or "en", []).append(member["email"])
    return by_language


def _send_notice(send, kind: str, item: dict, language: str, recipients: list[str], contact: str) -> bool:
    subject, body = plan_mail(language, kind, series=item["name"], valid_until=item["valid_until"],
                              base_url=settings.mail_base_url, contact=contact)
    return send(subject, body, recipients, from_name=SENDER_NAME, from_email=SENDER_EMAIL, reply_to=contact)


def run_pass(today: date | None = None, send=_send_email) -> list[tuple[int, str]]:
    """Send what is due; returns (series id, kind) for each notice that went out.

    Each organizer gets it in their own language, the contact address a copy in Polish."""
    today = today or date.today()
    contact = series_plan.contact_email()
    sent = []
    for item in series_plan.series_with_end_dates():
        kind = due_kind(item["valid_until"], today)
        if not kind or series_plan.notice_sent(item["id"], kind, item["valid_until"]):
            continue
        groups = _recipients(item["id"])
        results = [_send_notice(send, kind, item, language, addresses, contact) for language, addresses in groups.items()]
        results.append(_send_notice(send, kind, item, "pl", [contact], contact))
        if all(results):
            series_plan.mark_notice_sent(item["id"], kind, item["valid_until"])
            sent.append((item["id"], kind))
            logger.info("subscription_notice_sent", series_id=item["id"], kind=kind, languages=sorted(groups))
    return sent


def run_forever() -> None:
    import gevent

    while True:
        try:
            run_pass()
        except Exception as exc:  # noqa: BLE001 - one bad pass must not end them all
            logger.warning("subscription_notice_pass_failed", error=str(exc))
        gevent.sleep(PASS_INTERVAL_SECONDS)


_started = False


def start() -> bool:
    """One greenlet per server process; never under pytest."""
    global _started
    import os

    if _started or os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    import gevent

    gevent.spawn(run_forever)
    _started = True
    return True
