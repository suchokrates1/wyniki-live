"""Watch every live court and publish its clip when the score has settled.

Once a minute, one missing brick is generated for an active tournament:
the court number, a name from a known group, or a score outside the shelf.
Pytest never starts the loop.
"""
from __future__ import annotations

import os
import time

import structlog

logger = structlog.get_logger()

PASS_INTERVAL_SECONDS = 1
FILL_INTERVAL_SECONDS = 60
_started = False


def tick_courts(now: float | None = None) -> None:
    from .court_lector import playback_for
    from .court_manager import serialize_all_states
    from .lector_lines import court_state_for_lector, sentences_for_court

    moment = time.monotonic() if now is None else now
    names = {
        str(int(name))
        for state in serialize_all_states().values()
        if (name := str(state.get("court_name") or "").strip()).isdigit() and int(name) >= 1
    }
    for name in sorted(names, key=int):
        playback_for(name).observe(sentences_for_court(court_state_for_lector(name)), moment)


def run_forever() -> None:
    import gevent

    logger.info("lector_loop_started", interval_seconds=PASS_INTERVAL_SECONDS)
    filled_at = 0.0
    while True:
        try:
            tick_courts()
            now = time.monotonic()
            if now - filled_at >= FILL_INTERVAL_SECONDS:
                filled_at = now
                from .lector_fill import fill_next

                fill_next()
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
