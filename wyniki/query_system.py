"""Polling scheduler for overlay API queries.

This module orchestrates two polling modes used by the public scoreboards:

* ``normal`` – standard game flow without an active tie-break.
* ``tie-break`` – activated when the tie-break overlay is visible.

The scheduler keeps calling UNO API endpoints at different frequencies
depending on the active mode.  It guarantees that:

* switching to the tie-break mode immediately stops every other query,
  leaving only tie-break related endpoints active;
* returning to the normal mode re-enables the original cadence without
  missing the next due invocation;
* rate limiting can be reasoned about because every task is scheduled
  using monotonic timestamps.

The implementation uses a small priority queue based dispatcher so that
it remains deterministic and easy to test.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import heapq
import logging
import time
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from .config import log


VisibilityValue = Optional[bool]


def _coerce_visibility(value: Any) -> VisibilityValue:
    """Convert a visibility payload into a tri-state boolean."""

    if isinstance(value, dict):
        for key in ("visible", "isVisible", "Visible"):
            if key in value:
                return _coerce_visibility(value[key])
        return None
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if not text:
            return None
        if text in {"1", "true", "yes", "on", "visible", "active"}:
            return True
        if text in {"0", "false", "no", "off", "hidden", "inactive"}:
            return False
        return None
    return None


@dataclass
class QuerySpec:
    """Definition of a single polling task."""

    mode: str
    name: str
    method_name: str
    interval: float
    args: Tuple[Any, ...] = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    on_result: Optional[Callable[[Any], None]] = None
    precondition: Optional[Callable[[], bool]] = None
    repeat: bool = True


@dataclass(order=True)
class ScheduledTask:
    """Priority queue wrapper for :class:`QuerySpec`."""

    due: float
    order: int
    spec: QuerySpec = field(compare=False)


class QuerySystem:
    """Polling scheduler responsible for coordinating UNO API calls."""

    NORMAL_MODE = "normal"
    TIE_MODE = "tie-break"

    def __init__(
        self,
        client: Any,
        *,
        now_fn: Callable[[], float] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self.client = client
        self._now = now_fn or time.monotonic
        self._sleep = sleep_fn or time.sleep
        self.log = logger or log
        self.mode = self.NORMAL_MODE
        self._queue: List[ScheduledTask] = []
        self._counter = 0
        self._speed_multiplier = 1.0
        self._modes: Dict[str, List[QuerySpec]] = {
            self.NORMAL_MODE: self._build_normal_specs(),
            self.TIE_MODE: self._build_tie_specs(),
        }
        self._activate_mode(self.mode, initial=True)

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    def run_once(self) -> None:
        """Execute the next due query, blocking until it is ready."""

        if not self._queue:
            self._activate_mode(self.mode)
            return

        task = heapq.heappop(self._queue)
        now = self._now()
        if task.due > now:
            delay = task.due - now
            if delay > 0:
                self._sleep(delay)
            now = self._now()

        spec = task.spec
        should_run = True
        if spec.precondition is not None:
            try:
                should_run = bool(spec.precondition())
            except Exception as exc:  # pragma: no cover - defensive guard
                should_run = False
                self.log.warning("Query %s precondition failed: %s", spec.name, exc)

        result: Any = None
        if should_run:
            try:
                method = getattr(self.client, spec.method_name)
            except AttributeError as exc:
                self.log.error("Missing client method %s: %s", spec.method_name, exc)
            else:
                try:
                    result = method(*spec.args, **spec.kwargs)
                except Exception as exc:  # pragma: no cover - defensive guard
                    self.log.warning("Query %s failed: %s", spec.name, exc)

            if spec.on_result is not None:
                try:
                    spec.on_result(result)
                except Exception as exc:  # pragma: no cover - defensive guard
                    self.log.warning("Query %s result handler failed: %s", spec.name, exc)

        if spec.repeat and self.mode == spec.mode:
            interval = max(0.0, spec.interval * self._speed_multiplier)
            self._schedule(spec, now + interval)

    def run_steps(self, steps: int) -> None:
        """Execute ``steps`` tasks sequentially."""

        for _ in range(max(0, steps)):
            self.run_once()

    def run_for(self, duration: float) -> None:
        """Run pending tasks for ``duration`` seconds of simulated time."""

        end_time = self._now() + max(0.0, duration)
        while self._queue and self._queue[0].due < end_time:
            self.run_once()

    def next_due(self) -> Optional[float]:
        """Return the timestamp of the next scheduled task."""

        if not self._queue:
            return None
        return self._queue[0].due

    def pending(self) -> Iterable[QuerySpec]:
        """Yield currently scheduled specs in chronological order."""

        for task in sorted(self._queue):
            yield task.spec

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _schedule(self, spec: QuerySpec, due: float) -> None:
        heapq.heappush(self._queue, ScheduledTask(due, self._counter, spec))
        self._counter += 1

    def _activate_mode(self, mode: str, *, initial: bool = False) -> None:
        self.mode = mode
        self._queue.clear()
        now = self._now()
        for spec in self._modes[mode]:
            self._schedule(spec, now)
        if not initial:
            self.log.info("Query system switched to %s mode", mode)

    def set_speed_multiplier(self, multiplier: float) -> None:
        try:
            value = float(multiplier)
        except (TypeError, ValueError):
            return
        if value < 1.0:
            value = 1.0
        if abs(value - self._speed_multiplier) < 0.01:
            return
        self._speed_multiplier = value
        self._activate_mode(self.mode, initial=True)

    def configure_spec(
        self,
        method_name: str,
        *,
        precondition: Optional[Callable[[], bool]] = None,
        on_result: Optional[Callable[[Any], None]] = None,
        interval: Optional[float] = None,
        repeat: Optional[bool] = None,
    ) -> None:
        for specs in self._modes.values():
            for spec in specs:
                if spec.method_name != method_name:
                    continue
                if precondition is not None:
                    spec.precondition = precondition
                if on_result is not None:
                    spec.on_result = on_result
                if interval is not None:
                    spec.interval = float(interval)
                if repeat is not None:
                    spec.repeat = bool(repeat)
        for task in self._queue:
            if task.spec.method_name != method_name:
                continue
            if precondition is not None:
                task.spec.precondition = precondition
            if on_result is not None:
                task.spec.on_result = on_result
            if interval is not None:
                task.spec.interval = float(interval)
            if repeat is not None:
                task.spec.repeat = bool(repeat)

    def _build_normal_specs(self) -> List[QuerySpec]:
        return [
            self._spec(self.NORMAL_MODE, "GetPointsPlayerA", 10.0),
            self._spec(self.NORMAL_MODE, "GetPointsPlayerB", 10.0),
            self._spec(self.NORMAL_MODE, "GetCurrentSetPlayerA", 10.0),  # Polled only at 40/ADV via precondition
            self._spec(self.NORMAL_MODE, "GetCurrentSetPlayerB", 10.0),  # Polled only at 40/ADV via precondition
            self._spec(self.NORMAL_MODE, "GetSet1PlayerA", 10.0),  # Polled only when games >= 3 via precondition
            self._spec(self.NORMAL_MODE, "GetSet1PlayerB", 10.0),  # Polled only when games >= 3 via precondition
            self._spec(self.NORMAL_MODE, "GetSet2PlayerA", 10.0),  # Polled only when games >= 3 via precondition
            self._spec(self.NORMAL_MODE, "GetSet2PlayerB", 10.0),  # Polled only when games >= 3 via precondition
            self._spec(
                self.NORMAL_MODE,
                "GetTieBreakVisibility",
                180.0,
                on_result=self._handle_visibility_normal,
            ),
            self._spec(self.NORMAL_MODE, "GetNamePlayerA", 30.0),
            self._spec(self.NORMAL_MODE, "GetNamePlayerB", 30.0),
        ]

    def _build_tie_specs(self) -> List[QuerySpec]:
        return [
            self._spec(self.TIE_MODE, "GetTieBreakPlayerA", 10.0),
            self._spec(self.TIE_MODE, "GetTieBreakPlayerB", 10.0),
            self._spec(
                self.TIE_MODE,
                "GetTieBreakVisibility",
                60.0,
                on_result=self._handle_visibility_tie,
            ),
        ]

    def _spec(
        self,
        mode: str,
        method_name: str,
        interval: float,
        *,
        name: Optional[str] = None,
        args: Iterable[Any] | None = None,
        kwargs: Dict[str, Any] | None = None,
        on_result: Optional[Callable[[Any], None]] = None,
        precondition: Optional[Callable[[], bool]] = None,
        repeat: bool = True,
    ) -> QuerySpec:
        return QuerySpec(
            mode=mode,
            name=name or method_name,
            method_name=method_name,
            interval=float(interval),
            args=tuple(args or ()),
            kwargs=dict(kwargs or {}),
            on_result=on_result,
            precondition=precondition,
            repeat=repeat,
        )

    def _handle_visibility_normal(self, result: Any) -> None:
        visibility = _coerce_visibility(result)
        if visibility:
            self._activate_mode(self.TIE_MODE)

    def _handle_visibility_tie(self, result: Any) -> None:
        visibility = _coerce_visibility(result)
        if visibility is False:
            self._activate_mode(self.NORMAL_MODE)


__all__ = [
    "QuerySystem",
    "QuerySpec",
    "ScheduledTask",
    "_coerce_visibility",
]
