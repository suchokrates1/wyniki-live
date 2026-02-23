"""Event broadcasting system with SSE support."""
from __future__ import annotations

import queue
import threading
from typing import Any, Dict


class EventBroker:
    """Thread-safe event broadcasting to multiple SSE listeners."""
    
    def __init__(self) -> None:
        self.listeners: set[queue.Queue] = set()
        self.lock = threading.Lock()

    def listen(self) -> queue.Queue:
        """Register a new listener queue."""
        listener: queue.Queue = queue.Queue(maxsize=25)
        with self.lock:
            self.listeners.add(listener)
        return listener

    def discard(self, listener: queue.Queue) -> None:
        """Remove a listener queue."""
        with self.lock:
            self.listeners.discard(listener)

    def broadcast(self, payload: Dict[str, Any]) -> None:
        """Send event to all connected listeners."""
        with self.lock:
            listeners = list(self.listeners)
        for listener in listeners:
            try:
                listener.put_nowait(payload)
            except queue.Full:
                continue


# Global singleton instance
event_broker = EventBroker()


def emit_score_update(kort_id: str, court_state: Dict[str, Any]) -> None:
    """Emit score update event to all SSE listeners.

    When DEMO_OVERLAY_ACTIVE is True, real court updates are suppressed
    to avoid conflicting with demo data in overlays.
    """
    from .court_manager import serialize_public_court_state, is_demo_overlay_active

    if is_demo_overlay_active():
        return  # suppress real updates while demo overlay is active

    payload = {
        "type": "state_update",
        "kort_id": kort_id,
        "data": serialize_public_court_state(court_state)
    }
    
    event_broker.broadcast(payload)


