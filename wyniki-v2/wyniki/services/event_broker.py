"""Event broadcasting system with SSE support."""
from __future__ import annotations

from typing import Any

from .listener_fanout import ListenerFanOut


class EventBroker(ListenerFanOut):
    """Thread-safe event broadcasting to multiple SSE listeners."""


event_broker = EventBroker()


def emit_score_update(kort_id: str, court_state: dict[str, Any]) -> None:
    """Emit score update event to all SSE listeners.

    When DEMO_OVERLAY_ACTIVE is True, real court updates are suppressed
    to avoid conflicting with demo data in overlays.
    """
    from .court_manager import serialize_public_court_state, is_demo_overlay_active
    from ..database.court_streams import fetch_watch_urls_for_date

    if is_demo_overlay_active():
        return

    data = serialize_public_court_state(court_state)
    url = fetch_watch_urls_for_date().get(str(kort_id))
    if url:
        data["watch_url"] = url

    event_broker.broadcast({
        "type": "state_update",
        "kort_id": kort_id,
        "data": data,
    })
