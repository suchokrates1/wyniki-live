"""Tournament-scoped invalidation fan-out for authenticated office SSE clients."""
from __future__ import annotations

import queue
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any


class OfficeEventBroker:
    """Keep independent listener queues per tournament within this process."""

    def __init__(self) -> None:
        self._listeners: dict[int, set[queue.Queue]] = defaultdict(set)
        self._lock = threading.Lock()

    def listen(self, tournament_id: int) -> queue.Queue:
        listener: queue.Queue = queue.Queue(maxsize=25)
        with self._lock:
            self._listeners[int(tournament_id)].add(listener)
        return listener

    def discard(self, tournament_id: int, listener: queue.Queue) -> None:
        with self._lock:
            listeners = self._listeners.get(int(tournament_id))
            if not listeners:
                return
            listeners.discard(listener)
            if not listeners:
                self._listeners.pop(int(tournament_id), None)

    def broadcast(self, tournament_id: int, payload: dict[str, Any]) -> None:
        with self._lock:
            listeners = list(self._listeners.get(int(tournament_id), set()))
        for listener in listeners:
            try:
                listener.put_nowait(payload)
            except queue.Full:
                # Clients always resync the authoritative dashboard after an event.
                # Dropping a burst event is therefore safe.
                continue


office_event_broker = OfficeEventBroker()


def emit_office_invalidation(tournament_id: int, scopes: list[str] | None = None) -> None:
    """Notify office sessions that tournament-derived data changed."""
    office_event_broker.broadcast(
        int(tournament_id),
        {
            "tournament_id": int(tournament_id),
            "scopes": sorted(set(scopes or ["dashboard"])),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
