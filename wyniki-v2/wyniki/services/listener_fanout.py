"""One in-process fan-out of SSE events to listener queues."""
from __future__ import annotations

import queue
import threading
from typing import Any


class ListenerFanOut:
    def __init__(self, maxsize: int = 25) -> None:
        self._listeners: set[queue.Queue] = set()
        self._lock = threading.Lock()
        self._maxsize = maxsize

    def listen(self) -> queue.Queue:
        listener: queue.Queue = queue.Queue(maxsize=self._maxsize)
        with self._lock:
            self._listeners.add(listener)
        return listener

    def discard(self, listener: queue.Queue) -> None:
        with self._lock:
            self._listeners.discard(listener)

    def empty(self) -> bool:
        with self._lock:
            return not self._listeners

    def broadcast(self, payload: dict[str, Any]) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener.put_nowait(payload)
            except queue.Full:
                continue
