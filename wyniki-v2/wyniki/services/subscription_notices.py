"""Mail to a series when its subscription is about to end, and when it has ended.

Once per end date and kind: a changed end date (a renewal) starts the reminders afresh.
The series owners get it (everyone on the series when it has no owner), with a copy to
the organizer contact address. A notice that could not be mailed is tried again on the
next pass; it is only marked sent once it went out.
"""
from __future__ import annotations

from datetime import date, timedelta
from html import escape

import structlog

from ..database import series as series_db
from ..database import series_plan
from .email_reports import _send_email

logger = structlog.get_logger()

DAYS_BEFORE = 14
PASS_INTERVAL_SECONDS = 3600


def _pl_date(iso: str) -> str:
    year, month, day = iso.split("-")
    return f"{day}.{month}.{year}"


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


def _recipients(series_id: int) -> list[str]:
    members = [m for m in (series_db.get_series(series_id) or {}).get("members", []) if not m["disabled"]]
    owners = [m["email"] for m in members if m["role"] == "owner"]
    return owners or [m["email"] for m in members]


def _message(kind: str, name: str, valid_until: str, contact: str) -> tuple[str, str]:
    when = _pl_date(valid_until)
    if kind == "ending":
        subject = f"blindtennis.app: abonament serii {name} kończy się {when}"
        pl = f"Abonament serii <strong>{escape(name)}</strong> kończy się <strong>{when}</strong>. Po tym dniu panel organizatora działa tylko do odczytu; turnieje zostają na stronie."
        en = f"The subscription of <strong>{escape(name)}</strong> ends on <strong>{when}</strong>. After that the organizer panel is read only; tournaments stay on the site."
    else:
        subject = f"blindtennis.app: abonament serii {name} wygasł"
        pl = f"Abonament serii <strong>{escape(name)}</strong> wygasł {when}. Panel organizatora działa tylko do odczytu; turnieje zostają na stronie."
        en = f"The subscription of <strong>{escape(name)}</strong> ended on {when}. The organizer panel is read only; tournaments stay on the site."
    mail = escape(contact)
    body = f"""
    <html><body style="font-family:Arial,sans-serif;color:#111;font-size:16px;line-height:1.5">
      <p>{pl}</p><p>Aby przedłużyć, napisz na <a href="mailto:{mail}">{mail}</a>.</p>
      <hr><p lang="en">{en} To renew, write to <a href="mailto:{mail}">{mail}</a>.</p>
    </body></html>
    """
    return subject, body


def run_pass(today: date | None = None, send=_send_email) -> list[tuple[int, str]]:
    """Send what is due; returns (series id, kind) for each notice that went out."""
    today = today or date.today()
    contact = series_plan.contact_email()
    sent = []
    for item in series_plan.series_with_end_dates():
        kind = due_kind(item["valid_until"], today)
        if not kind or series_plan.notice_sent(item["id"], kind, item["valid_until"]):
            continue
        recipients = _recipients(item["id"])
        subject, body = _message(kind, item["name"], item["valid_until"], contact)
        if send(subject, body, [*recipients, contact]):
            series_plan.mark_notice_sent(item["id"], kind, item["valid_until"])
            sent.append((item["id"], kind))
            logger.info("subscription_notice_sent", series_id=item["id"], kind=kind, recipients=len(recipients))
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
