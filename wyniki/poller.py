"""UNO polling manager governed by admin switches."""
from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional, Set, Tuple, Callable

import requests

from .config import settings, log
from .query_system import QuerySystem
from .state import (
    STATE_LOCK,
    available_courts,
    dequeue_uno_command,
    ensure_court_state,
    get_uno_activity_multiplier,
    get_uno_hourly_status,
    is_uno_requests_enabled,
    normalize_kort_id,
    requeue_uno_command,
    record_uno_request,
    update_uno_rate_limit,
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

    def _endpoint(self) -> str:
        return f"{self.base_url}/api/uno/exec/{self.kort_id}"

    def _call_api(self, payload: Dict[str, Any]) -> Tuple[int, Optional[object]]:
        try:
            response = requests.post(
                self._endpoint(),
                json=payload,
                headers=settings.auth_header,
                timeout=5,
            )
        except requests.RequestException as exc:  # pragma: no cover - network error guard
            log.warning(
                "poller kort=%s command=%s request failed: %s",
                self.kort_id,
                payload.get("command"),
                exc,
            )
            return 0, None
        status = response.status_code
        update_uno_rate_limit(response.headers)
        
        # Log rate limit info on 429 errors
        if status == 429:
            from .state import UNO_RATE_LIMIT_INFO, UNO_RATE_LIMIT_LOCK
            with UNO_RATE_LIMIT_LOCK:
                limit_info = dict(UNO_RATE_LIMIT_INFO)
            if limit_info.get("remaining") is not None:
                reset_ts = limit_info.get("reset")
                if reset_ts:
                    from datetime import datetime
                    reset_str = datetime.fromtimestamp(reset_ts).strftime("%H:%M:%S")
                else:
                    reset_str = "?"
                log.warning(
                    "RATE LIMIT kort=%s: %s/%s remaining (resets at %s)",
                    self.kort_id,
                    limit_info.get("remaining", "?"),
                    limit_info.get("limit", "?"),
                    reset_str,
                )
        
        try:
            data = response.json()
        except ValueError:
            data = response.text
        return status, data

    def _send(self, command: str) -> Optional[object]:
        status, data = self._call_api({"command": command})
        if status != 200 or not isinstance(data, dict):
            # Extract key error info for cleaner logging
            error_msg = ""
            if isinstance(data, dict):
                error = data.get("error", "")
                if status == 429:
                    # Rate limit - extract from headers if available
                    error_msg = f"rate_limit (status 429)"
                elif status == 503:
                    error_msg = f"uno_disabled"
                else:
                    error_msg = error[:50] if error else f"http_{status}"
            else:
                error_msg = f"http_{status}"
            
            log.warning(
                "poller kort=%s command=%s: %s",
                self.kort_id,
                command,
                error_msg,
            )
            return None
        payload = data.get("response")
        if isinstance(payload, dict) and "payload" in payload:
            return payload.get("payload")
        return payload

    def execute(
        self,
        command: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, int, Optional[object]]:
        if not command:
            return False, 0, None
        request_payload: Dict[str, Any] = {"command": command}
        if payload:
            request_payload.update(payload)
        status, data = self._call_api(request_payload)
        if status != 200 or not isinstance(data, dict):
            error_msg = ""
            if isinstance(data, dict):
                error = data.get("error", "")
                if status == 429:
                    error_msg = "rate_limit"
                elif status == 503:
                    error_msg = "uno_disabled"
                else:
                    error_msg = error[:40] if error else f"http_{status}"
            else:
                error_msg = f"http_{status}"
                
            log.warning(
                "poller kort=%s command=%s exec: %s",
                self.kort_id,
                command,
                error_msg,
            )
            return False, status, data
        if not data.get("ok"):
            log.warning(
                "poller kort=%s command=%s exec rejected: %s",
                self.kort_id,
                command,
                shorten(data.get("error", "unknown")),
            )
            return False, status, data
        return True, status, data

    def __getattr__(self, name: str):
        if name.startswith("Get"):
            def _invoke(*args: Any, **kwargs: Any) -> Optional[object]:
                return self._send(name)

            return _invoke
        raise AttributeError(name)


class SmartCourtPollingController:
    """Implements smart polling rules for a single court."""

    MODE_IN_MATCH = "in_match"
    MODE_AWAIT_NAMES = "awaiting_names"
    MODE_AWAIT_FIRST_POINT = "awaiting_first_point"

    TRIGGER_POINTS = {"40", "ADV"}
    NAME_INTERVAL_RESET = 5.0
    NAME_INTERVAL_PREMATCH = 20.0
    POINT_INTERVAL_PREMATCH = 12.0
    POINT_INTERVAL_IN_MATCH = 10.0  # Poll points every 10s during match

    def __init__(self, kort_id: str, system: QuerySystem, *, now_fn: Optional[Callable[[], float]] = None) -> None:
        self.kort_id = kort_id
        self.system = system
        self._now = now_fn or time.monotonic
        self._mode = self.MODE_IN_MATCH
        self._pending_set_poll = False
        self._pending_current_games_poll = False
        self._points_decisive: Dict[str, bool] = {"A": False, "B": False}
        self._last_points: Dict[str, Optional[str]] = {"A": None, "B": None}
        self._last_current_games: Dict[str, int] = {"A": 0, "B": 0}
        self._previous_match_names: Dict[str, Optional[str]] = {"A": None, "B": None}
        self._current_names: Dict[str, Optional[str]] = {"A": None, "B": None}
        self._next_name_poll_allowed = 0.0
        self._next_point_poll_allowed = 0.0

        # Prepared callables for QuerySystem configuration
        self._point_preconditions = {
            "A": lambda: self._should_poll_points("A"),
            "B": lambda: self._should_poll_points("B"),
        }
        self._current_games_preconditions = {
            "A": lambda: self._should_poll_current_games("A"),
            "B": lambda: self._should_poll_current_games("B"),
        }
        self._set_precondition = self._should_poll_sets
        self._name_preconditions = {
            "A": lambda: self._should_poll_name("A"),
            "B": lambda: self._should_poll_name("B"),
        }

    def attach(self) -> None:
        self.system.configure_spec(
            "GetPointsPlayerA",
            precondition=self._point_preconditions["A"],
            on_result=lambda value: self._on_point_result("A", value),
        )
        self.system.configure_spec(
            "GetPointsPlayerB",
            precondition=self._point_preconditions["B"],
            on_result=lambda value: self._on_point_result("B", value),
        )
        self.system.configure_spec(
            "GetCurrentSetPlayerA",
            precondition=self._current_games_preconditions["A"],
            on_result=lambda value: self._on_current_games_result("A", value),
        )
        self.system.configure_spec(
            "GetCurrentSetPlayerB",
            precondition=self._current_games_preconditions["B"],
            on_result=lambda value: self._on_current_games_result("B", value),
        )
        self.system.configure_spec(
            "GetSet1PlayerA",
            precondition=self._set_precondition,
            on_result=self._on_set_poll_result,
        )
        self.system.configure_spec(
            "GetSet1PlayerB",
            precondition=self._set_precondition,
            on_result=self._on_set_poll_result,
        )
        self.system.configure_spec(
            "GetSet2PlayerA",
            precondition=self._set_precondition,
            on_result=self._on_set_poll_result,
        )
        self.system.configure_spec(
            "GetSet2PlayerB",
            precondition=self._set_precondition,
            on_result=self._on_set_poll_result,
        )
        self.system.configure_spec(
            "GetNamePlayerA",
            precondition=self._name_preconditions["A"],
            on_result=lambda value: self._on_name_result("A", value),
        )
        self.system.configure_spec(
            "GetNamePlayerB",
            precondition=self._name_preconditions["B"],
            on_result=lambda value: self._on_name_result("B", value),
        )

    def sync_from_state(self) -> None:
        with STATE_LOCK:
            state = ensure_court_state(self.kort_id)
            a_state = dict(state.get("A") or {})
            b_state = dict(state.get("B") or {})
            match_status = dict(state.get("match_status") or {})
        active = bool(match_status.get("active"))
        points = {
            "A": self._normalize_point(a_state.get("points")),
            "B": self._normalize_point(b_state.get("points")),
        }
        current_games = {
            "A": int(a_state.get("current_games") or 0),
            "B": int(b_state.get("current_games") or 0),
        }
        names = {
            "A": self._canonical_name(a_state),
            "B": self._canonical_name(b_state),
        }
        self._current_names = names
        self._update_mode(active, names, points)
        self._update_point_triggers(points, current_games)

    # ------------------------------------------------------------------
    # Internal helpers for state analysis
    # ------------------------------------------------------------------
    def _update_mode(self, active: bool, names: Dict[str, Optional[str]], points: Dict[str, Optional[str]]) -> None:
        if not active:
            if self._mode == self.MODE_IN_MATCH:
                self._previous_match_names = dict(names)
                self._mode = self.MODE_AWAIT_NAMES
                self._next_name_poll_allowed = 0.0
                self._next_point_poll_allowed = 0.0
                self._pending_set_poll = False
                self._points_decisive = {"A": False, "B": False}
            elif self._mode == self.MODE_AWAIT_NAMES:
                if self._names_changed_meaningfully(names):
                    self._mode = self.MODE_AWAIT_FIRST_POINT
                    self._next_name_poll_allowed = 0.0
                    self._next_point_poll_allowed = 0.0
            elif self._mode == self.MODE_AWAIT_FIRST_POINT:
                if self._names_changed_meaningfully(names):
                    self._next_name_poll_allowed = 0.0
                if self._first_point_detected(points):
                    self._mode = self.MODE_IN_MATCH
                    self._previous_match_names = dict(names)
                    self._next_point_poll_allowed = 0.0  # Start polling immediately in match
        else:
            if self._mode != self.MODE_IN_MATCH:
                self._mode = self.MODE_IN_MATCH
                self._next_point_poll_allowed = 0.0  # Start polling immediately in match
            self._previous_match_names = dict(names)

    def _update_point_triggers(self, points: Dict[str, Optional[str]], current_games: Dict[str, int]) -> None:
        for side in ("A", "B"):
            value = points.get(side)
            previous = self._last_points.get(side)
            decisive = value in self.TRIGGER_POINTS
            
            # Check if current games changed (gem won)
            prev_games = self._last_current_games.get(side, 0)
            curr_games = current_games.get(side, 0)
            games_changed = curr_games != prev_games
            
            if self._mode == self.MODE_IN_MATCH:
                # Trigger current games polling when at decisive points (40/ADV)
                if decisive and (not self._points_decisive[side] or value != previous):
                    self._pending_current_games_poll = True
                
                # Trigger set polling when games changed (gem won)
                if games_changed and curr_games >= 3:
                    # Near end of set (3+ games), check set scores
                    self._pending_set_poll = True
                    # Also keep checking current games
                    self._pending_current_games_poll = True
                
                self._points_decisive[side] = decisive
            else:
                self._points_decisive[side] = False
                
            self._last_points[side] = value
            self._last_current_games[side] = curr_games

        if self._mode != self.MODE_IN_MATCH:
            self._pending_set_poll = False
            self._pending_current_games_poll = False

    # ------------------------------------------------------------------
    # Precondition helpers wired into QuerySystem
    # ------------------------------------------------------------------
    def _should_poll_points(self, side: str) -> bool:
        """Poll points with throttling:
        - AWAIT_NAMES mode: don't poll
        - AWAIT_FIRST_POINT mode: every 12s
        - IN_MATCH mode: every 10s (not on every cycle!)
        """
        if self._mode == self.MODE_AWAIT_NAMES:
            return False
        
        now = self._now()
        if now < self._next_point_poll_allowed:
            return False
        
        if self._mode == self.MODE_AWAIT_FIRST_POINT:
            self._next_point_poll_allowed = now + self.POINT_INTERVAL_PREMATCH
            return True
        
        # MODE_IN_MATCH: throttle to 10s interval
        self._next_point_poll_allowed = now + self.POINT_INTERVAL_IN_MATCH
        return True

    def _should_poll_current_games(self, side: str) -> bool:
        """Poll current games (GetCurrentSetPlayerA/B) only when:
        - We're in match mode
        - Points are at 40 or ADV (decisive moment)
        """
        return self._mode == self.MODE_IN_MATCH and self._pending_current_games_poll

    def _should_poll_sets(self) -> bool:
        """Poll set scores (GetSet1/2PlayerA/B) only when:
        - We're in match mode
        - Current games increased to 3+ (near end of set)
        """
        return self._mode == self.MODE_IN_MATCH and self._pending_set_poll

    def _should_poll_name(self, side: str) -> bool:
        if self._mode == self.MODE_IN_MATCH:
            return False
        now = self._now()
        interval = self.NAME_INTERVAL_RESET if self._mode == self.MODE_AWAIT_NAMES else self.NAME_INTERVAL_PREMATCH
        if now < self._next_name_poll_allowed:
            return False
        self._next_name_poll_allowed = now + interval
        return True

    # ------------------------------------------------------------------
    # Result handlers used after successful UNO calls
    # ------------------------------------------------------------------
    def _on_point_result(self, side: str, value: Any) -> None:
        # Handling is deferred to sync_from_state where we work against the persisted state.
        if self._mode == self.MODE_AWAIT_FIRST_POINT:
            normalized = self._normalize_point(value)
            if normalized and normalized not in {"0", "0-0", "-", ""}:
                self._mode = self.MODE_IN_MATCH
                self._next_point_poll_allowed = 0.0  # Start polling immediately

    def _on_current_games_result(self, side: str, value: Any) -> None:
        """Called after GetCurrentSetPlayerA/B returns.
        If games increased, we should check set scores next."""
        try:
            current_games = int(value or 0)
            prev_games = self._last_current_games.get(side, 0)
            if current_games != prev_games and current_games >= 3:
                # Games changed and approaching end of set
                self._pending_set_poll = True
            self._last_current_games[side] = current_games
        except (ValueError, TypeError):
            pass
        # Clear current games poll flag after checking
        self._pending_current_games_poll = False

    def _on_set_poll_result(self, _value: Any) -> None:
        """Called after GetSet1/2PlayerA/B returns."""
        self._pending_set_poll = False

    def _on_name_result(self, side: str, value: Any) -> None:
        # names are applied through _derive_local_uno_command; we only keep track of recent non-empty values
        normalized = self._normalize_name_value(value)
        if normalized:
            self._current_names[side] = normalized

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_point(raw: Any) -> Optional[str]:
        if raw is None:
            return None
        text = str(raw).strip()
        if not text:
            return None
        return text.upper()

    @staticmethod
    def _canonical_name(side_state: Dict[str, Any]) -> Optional[str]:
        full = side_state.get("full_name") or side_state.get("fullName")
        if isinstance(full, str) and full.strip():
            return full.strip()
        surname = side_state.get("surname")
        if isinstance(surname, str) and surname.strip():
            text = surname.strip()
            if text == "-":
                return None
            return text
        return None

    @staticmethod
    def _normalize_name_value(raw: Any) -> Optional[str]:
        if raw is None:
            return None
        if isinstance(raw, dict):
            candidate = raw.get("value") or raw.get("name")
            if candidate is not None:
                raw = candidate
        text = str(raw).strip()
        if not text or text == "-":
            return None
        return text

    def _names_changed_meaningfully(self, names: Dict[str, Optional[str]]) -> bool:
        for side in ("A", "B"):
            candidate = names.get(side)
            previous = self._previous_match_names.get(side)
            if candidate and candidate != previous:
                return True
        return False

    @staticmethod
    def _first_point_detected(points: Dict[str, Optional[str]]) -> bool:
        baseline = {None, "", "-", "0", "0-0"}
        return any(value not in baseline for value in points.values())
class CourtPollingWorker(threading.Thread):
    """Background thread running a ``QuerySystem`` for a single court."""

    def __init__(self, kort_id: str) -> None:
        super().__init__(daemon=True)
        self.kort_id = kort_id
        self.client = UnoCommandClient(kort_id)
        self._stop_event = threading.Event()
        self.system = QuerySystem(self.client, sleep_fn=self._sleep)
        self.smart = SmartCourtPollingController(kort_id, self.system)
        self.smart.attach()
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

    def _process_command_queue(self) -> bool:
        item = dequeue_uno_command(self.kort_id)
        if not item:
            return False
        command = str(item.get("command") or "").strip()
        if not command:
            log.warning("uno queue entry missing command kort=%s payload=%s", self.kort_id, shorten(item))
            return False
        payload = item.get("payload")
        payload_dict = payload if isinstance(payload, dict) else None
        key = str(item.get("key") or command)
        attempt_number = int(item.get("attempts", 0)) + 1
        success, status, response = self.client.execute(command, payload_dict)
        record_uno_request(success, self.kort_id, command)
        if success:
            log.info(
                "uno queue sent kort=%s key=%s command=%s attempts=%s",
                self.kort_id,
                key,
                command,
                attempt_number,
            )
            return True

        backoff = 5.0
        if status == 429:
            backoff = max(backoff, 60.0)
        elif status in {500, 502, 503, 504}:
            backoff = max(backoff, 15.0)
        if isinstance(response, dict):
            for retry_key in ("retry_after", "retryAfter", "retryAfterSeconds", "retry_after_seconds"):
                raw_retry = response.get(retry_key)
                try:
                    if raw_retry is not None:
                        backoff = max(backoff, float(raw_retry))
                except (TypeError, ValueError):
                    continue

        requeued = requeue_uno_command(self.kort_id, item, backoff_seconds=backoff)
        if not requeued:
            log.error(
                "uno queue command dropped kort=%s key=%s command=%s status=%s payload=%s",
                self.kort_id,
                key,
                command,
                status,
                shorten(response),
            )
        else:
            log.info(
                "uno queue retry kort=%s key=%s command=%s status=%s backoff=%.1fs",
                self.kort_id,
                key,
                command,
                status,
                backoff,
            )
        return True

    def run(self) -> None:  # noqa: D401 - inherited docstring
        log.info("UNO poller started kort=%s", self.kort_id)
        try:
            self._sync_activity_multiplier()
            self.smart.sync_from_state()
            while not self._stop_event.is_set():
                self._sync_activity_multiplier()
                if not is_uno_requests_enabled():
                    log.debug("UNO poller kort=%s paused (UNO disabled)", self.kort_id)
                    if self._stop_event.wait(5.0):
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

                self.smart.sync_from_state()

                if self._process_command_queue():
                    continue

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
