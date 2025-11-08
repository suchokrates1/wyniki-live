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
