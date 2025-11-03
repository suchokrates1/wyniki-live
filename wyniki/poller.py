"""UNO polling manager governed by admin switches."""
from __future__ import annotations

import threading
from typing import Any, Dict, Optional, Set

import requests

from .config import settings, log
from .query_system import QuerySystem
from .state import (
    available_courts,
    get_uno_activity_multiplier,
    get_uno_hourly_status,
    is_uno_requests_enabled,
    normalize_kort_id,
)
from .utils import shorten


class UnoCommandClient:
    """Adapts query method calls to local UNO execution API."""

    def __init__(self, kort_id: str) -> None:
        self.kort_id = kort_id
        internal_base = getattr(settings, "internal_api_base", None)
        if internal_base:
            base = str(internal_base).rstrip("/")
        else:
            base = f"http://127.0.0.1:{settings.port}"
        self.base_url = base

    def _send(self, command: str) -> Optional[object]:
        url = f"{self.base_url}/api/uno/exec/{self.kort_id}"
        try:
            response = requests.post(
                url,
                json={"command": command},
                headers=settings.auth_header,
                timeout=5,
            )
        except requests.RequestException as exc:  # pragma: no cover - network error guard
            log.warning("poller kort=%s command=%s request failed: %s", self.kort_id, command, exc)
            return None
        if response.status_code != 200:
            log.warning(
                "poller kort=%s command=%s status=%s body=%s",
                self.kort_id,
                command,
                response.status_code,
                shorten(response.text),
            )
            return None
        try:
            data = response.json()
        except ValueError:
            log.warning("poller kort=%s command=%s response not json", self.kort_id, command)
            return None
        payload = data.get("response")
        if isinstance(payload, dict) and "payload" in payload:
            return payload.get("payload")
        return payload

    def __getattr__(self, name: str):
        if name.startswith("Get"):
            def _invoke(*args: Any, **kwargs: Any) -> Optional[object]:
                return self._send(name)

            return _invoke
        raise AttributeError(name)


class CourtPollingWorker(threading.Thread):
    """Background thread running a ``QuerySystem`` for a single court."""

    def __init__(self, kort_id: str) -> None:
        super().__init__(daemon=True)
        self.kort_id = kort_id
        self.client = UnoCommandClient(kort_id)
        self._stop_event = threading.Event()
        self.system = QuerySystem(self.client, sleep_fn=self._sleep)
        self._slowdown_counter = 0
        self._last_mode: Optional[str] = None
        self._current_speed_multiplier = 1.0

    def _sleep(self, delay: float) -> None:
        if delay <= 0:
            return
        self._stop_event.wait(delay)

    def stop(self) -> None:
        self._stop_event.set()

    def _sync_activity_multiplier(self) -> None:
        target = get_uno_activity_multiplier()
        if abs(target - self._current_speed_multiplier) < 0.01:
            return
        self.system.set_speed_multiplier(target)
        self._current_speed_multiplier = target
        log.info("UNO poller speed kort=%s multiplier=%.2f", self.kort_id, target)

    def run(self) -> None:  # noqa: D401 - inherited docstring
        log.info("UNO poller started kort=%s", self.kort_id)
        try:
            self._sync_activity_multiplier()
            while not self._stop_event.is_set():
                self._sync_activity_multiplier()
                if not is_uno_requests_enabled():
                    if self._stop_event.wait(1.0):
                        break
                    continue
                status = get_uno_hourly_status(self.kort_id)
                mode = status.get("mode")
                if mode != self._last_mode:
                    if mode == "slowdown":
                        log.warning(
                            "UNO poller slowdown kort=%s count=%s limit=%s remaining=%s",
                            self.kort_id,
                            status.get("count"),
                            status.get("limit"),
                            status.get("remaining"),
                        )
                    elif mode == "normal" and self._last_mode in {"slowdown", "limit"}:
                        log.info(
                            "UNO poller resumed normal cadence kort=%s count=%s limit=%s",
                            self.kort_id,
                            status.get("count"),
                            status.get("limit"),
                        )
                    elif mode == "limit":
                        log.warning(
                            "UNO poller hit hourly limit kort=%s count=%s limit=%s",
                            self.kort_id,
                            status.get("count"),
                            status.get("limit"),
                        )
                    self._last_mode = mode

                if mode == "limit":
                    sleep_for = float(status.get("slowdown_sleep") or 5.0)
                    if self._stop_event.wait(sleep_for):
                        break
                    continue

                if mode == "slowdown":
                    factor = max(1, int(status.get("slowdown_factor") or 1))
                    self._slowdown_counter = (self._slowdown_counter + 1) % factor
                    if self._slowdown_counter != 0:
                        sleep_for = float(status.get("slowdown_sleep") or 5.0)
                        if self._stop_event.wait(sleep_for):
                            break
                        continue
                else:
                    self._slowdown_counter = 0

                try:
                    self.system.run_once()
                except Exception as exc:  # pragma: no cover - defensive guard
                    log.warning("UNO poller error kort=%s: %s", self.kort_id, exc)
        finally:
            log.info("UNO poller stopped kort=%s", self.kort_id)


class PollerManager:
    """Coordinates per-court polling workers."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._workers: Dict[str, CourtPollingWorker] = {}

    def sync(self) -> None:
        with self._lock:
            if not is_uno_requests_enabled():
                self._stop_all_locked()
                return
            desired = self._desired_korts()
            self._stop_missing_locked(desired)
            for kort_id in desired:
                if kort_id not in self._workers:
                    worker = CourtPollingWorker(kort_id)
                    self._workers[kort_id] = worker
                    worker.start()

    def _desired_korts(self) -> Set[str]:
        korts: Set[str] = set()
        for kort_id, overlay_id in available_courts():
            if not overlay_id:
                continue
            normalized = normalize_kort_id(kort_id) or str(kort_id)
            if normalized:
                korts.add(normalized)
        return korts

    def _stop_missing_locked(self, desired: Set[str]) -> None:
        missing = [kort for kort in self._workers if kort not in desired]
        for kort_id in missing:
            worker = self._workers.pop(kort_id)
            worker.stop()
            worker.join(timeout=2)

    def _stop_all_locked(self) -> None:
        for worker in self._workers.values():
            worker.stop()
        for worker in self._workers.values():
            worker.join(timeout=2)
        self._workers.clear()


_manager = PollerManager()


def sync_poller_state() -> None:
    """Ensure poller workers match the current admin configuration."""
    _manager.sync()


__all__ = ["sync_poller_state"]
