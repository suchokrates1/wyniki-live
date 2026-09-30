"""The periodic pass behind match reminders.

Nothing in the system happens at the moment a match becomes due - the clock
simply reaches it - so something has to look. This is a gevent greenlet rather
than a separate process because the app already runs on one gunicorn worker
with gevent, and a second process would need its own lock to avoid sending
everything twice.

It stays asleep unless Web Push is actually configured, and every pass is
wrapped: a failing pass logs and waits for the next one rather than killing the
greenlet and silently ending reminders for the rest of the tournament.
"""

from __future__ import annotations

import os
from datetime import timezone

import structlog

from ..config import settings
from . import match_reminders, web_push

logger = structlog.get_logger()

# Every fixture is checked once a minute. Finer would not help: the schedule is
# in whole minutes and the delay estimate is accurate to about a quarter hour.
PASS_INTERVAL_SECONDS = 60

_started = False


def _tz() -> timezone:
    return timezone.utc


def run_forever() -> None:
    import gevent

    logger.info("reminder_loop_started", interval_seconds=PASS_INTERVAL_SECONDS)
    while True:
        try:
            match_reminders.run_pass(tz=_tz())
        except Exception as exc:  # noqa: BLE001 - one bad pass must not end them all
            logger.warning("reminder_loop_pass_failed", error=str(exc), exc_info=True)
        gevent.sleep(PASS_INTERVAL_SECONDS)


def should_start() -> bool:
    """Only in a real server process, and only when push can actually send."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    if not getattr(settings, "reminder_loop_enabled", True):
        return False
    return web_push.is_enabled()


def start(force: bool = False) -> bool:
    """Spawn the loop once. Returns whether it was started here."""
    global _started
    if _started:
        return False
    if not force and not should_start():
        logger.info("reminder_loop_skipped", push_enabled=web_push.is_enabled())
        return False
    try:
        import gevent
    except ImportError:
        logger.warning("reminder_loop_unavailable", reason="gevent not installed")
        return False

    gevent.spawn(run_forever)
    _started = True
    return True
