"""Watch court 1 and publish the lector clip when the score has settled.

One greenlet, same as the reminder loop: the app runs a single gunicorn worker.
Pytest never starts it.
"""
from __future__ import annotations

import os

import structlog

logger = structlog.get_logger()

PASS_INTERVAL_SECONDS = 1
_started = False


def run_forever() -> None:
    import gevent

    from .court_lector import playback

    logger.info("lector_loop_started", interval_seconds=PASS_INTERVAL_SECONDS)
    while True:
        try:
            playback.tick()
        except Exception as exc:  # noqa: BLE001 - one bad look must not end the loop
            logger.warning("lector_tick_failed", error=str(exc))
        gevent.sleep(PASS_INTERVAL_SECONDS)


def should_start() -> bool:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return False
    return True


def start(force: bool = False) -> bool:
    global _started
    if _started:
        return False
    if not force and not should_start():
        return False
    try:
        import gevent
    except ImportError:
        logger.warning("lector_loop_unavailable", reason="gevent not installed")
        return False
    gevent.spawn(run_forever)
    _started = True
    return True
