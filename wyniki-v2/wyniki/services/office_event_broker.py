"""Tournament-scoped invalidation fan-out for authenticated office SSE clients."""
from __future__ import annotations

import queue
import threading
from datetime import datetime, UTC
from typing import Any

from .listener_fanout import ListenerFanOut


class OfficeEventBroker:
    """Keep independent listener queues per tournament within this process."""

    def __init__(self) -> None:
        self._rooms: dict[int, ListenerFanOut] = {}
        self._lock = threading.Lock()

    def listen(self, tournament_id: int) -> queue.Queue:
        with self._lock:
            room = self._rooms.get(int(tournament_id))
            if room is None:
                room = ListenerFanOut()
                self._rooms[int(tournament_id)] = room
            return room.listen()

    def discard(self, tournament_id: int, listener: queue.Queue) -> None:
        with self._lock:
            room = self._rooms.get(int(tournament_id))
            if room is None:
                return
            room.discard(listener)
            if room.empty():
                self._rooms.pop(int(tournament_id), None)

    def broadcast(self, tournament_id: int, payload: dict[str, Any]) -> None:
        with self._lock:
            room = self._rooms.get(int(tournament_id))
        if room is not None:
            room.broadcast(payload)


office_event_broker = OfficeEventBroker()


def emit_office_invalidation(tournament_id: int, scopes: list[str] | None = None) -> None:
    """Notify office sessions that tournament-derived data changed."""
    office_event_broker.broadcast(
        int(tournament_id),
        {
            "tournament_id": int(tournament_id),
            "scopes": sorted(set(scopes or ["dashboard"])),
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
