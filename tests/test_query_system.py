from __future__ import annotations

from collections import Counter

import pytest

from wyniki.query_system import QuerySystem


class FakeClock:
    def __init__(self) -> None:
        self._now = 0.0

    def now(self) -> float:
        return self._now

    def sleep(self, seconds: float) -> None:
        self._now += max(0.0, seconds)


class RecordingClient:
    def __init__(self) -> None:
        self.calls = Counter()
        self.tie_active = False

    def _record(self, name: str) -> None:
        self.calls[name] += 1

    # Normal mode endpoints -------------------------------------------------
    def GetPointsPlayerA(self) -> None:
        self._record("GetPointsPlayerA")

    def GetPointsPlayerB(self) -> None:
        self._record("GetPointsPlayerB")

    def GetCurrentSetPlayerA(self) -> None:
        self._record("GetCurrentSetPlayerA")

    def GetCurrentSetPlayerB(self) -> None:
        self._record("GetCurrentSetPlayerB")

    def GetSet1PlayerA(self) -> None:
        self._record("GetSet1PlayerA")

    def GetSet1PlayerB(self) -> None:
        self._record("GetSet1PlayerB")

    def GetSet2PlayerA(self) -> None:
        self._record("GetSet2PlayerA")

    def GetSet2PlayerB(self) -> None:
        self._record("GetSet2PlayerB")

    def GetTieBreakVisibility(self) -> bool:
        self._record("GetTieBreakVisibility")
        return self.tie_active

    def GetNamePlayerA(self) -> None:
        self._record("GetNamePlayerA")

    def GetNamePlayerB(self) -> None:
        self._record("GetNamePlayerB")

    # Tie-break endpoints ---------------------------------------------------
    def GetTieBreakPlayerA(self) -> None:
        self._record("GetTieBreakPlayerA")

    def GetTieBreakPlayerB(self) -> None:
        self._record("GetTieBreakPlayerB")


@pytest.fixture()
def scheduler() -> tuple[QuerySystem, RecordingClient, FakeClock]:
    clock = FakeClock()
    client = RecordingClient()
    system = QuerySystem(client, now_fn=clock.now, sleep_fn=clock.sleep)
    return system, client, clock


def test_normal_mode_cadence(scheduler: tuple[QuerySystem, RecordingClient, FakeClock]) -> None:
    system, client, clock = scheduler
    client.tie_active = False

    system.run_for(60)

    assert system.mode == QuerySystem.NORMAL_MODE
    assert client.calls["GetPointsPlayerA"] == 6
    assert client.calls["GetPointsPlayerB"] == 6
    assert client.calls["GetCurrentSetPlayerA"] == 1
    assert client.calls["GetCurrentSetPlayerB"] == 1
    assert client.calls["GetSet1PlayerA"] == 1
    assert client.calls["GetSet1PlayerB"] == 1
    assert client.calls["GetSet2PlayerA"] == 1
    assert client.calls["GetSet2PlayerB"] == 1
    assert client.calls["GetTieBreakVisibility"] == 1
    assert client.calls["GetNamePlayerA"] == 1
    assert client.calls["GetNamePlayerB"] == 1
    assert client.calls["GetTieBreakPlayerA"] == 0
    assert client.calls["GetTieBreakPlayerB"] == 0
    assert clock.now() == 50


def test_switches_to_tie_mode(scheduler: tuple[QuerySystem, RecordingClient, FakeClock]) -> None:
    system, client, _ = scheduler
    client.tie_active = True

    system.run_steps(9)  # reach GetTieBreakVisibility in normal mode

    assert system.mode == QuerySystem.TIE_MODE
    assert all(task.mode == QuerySystem.TIE_MODE for task in system.pending())


def test_tie_mode_only_polls_tie_endpoints(
    scheduler: tuple[QuerySystem, RecordingClient, FakeClock]
) -> None:
    system, client, _ = scheduler
    client.tie_active = True

    system.run_steps(9)  # switch to tie mode
    system.run_steps(3)  # execute immediate tie-break tasks

    before = client.calls.copy()
    system.run_for(60)
    after = client.calls

    assert system.mode == QuerySystem.TIE_MODE
    assert after["GetTieBreakPlayerA"] - before["GetTieBreakPlayerA"] == 5
    assert after["GetTieBreakPlayerB"] - before["GetTieBreakPlayerB"] == 5
    # Visibility should not be re-polled within the first minute (interval=60)
    assert after["GetTieBreakVisibility"] - before["GetTieBreakVisibility"] == 0
    # No other endpoints should be touched in tie mode
    for key in (
        "GetPointsPlayerA",
        "GetPointsPlayerB",
        "GetCurrentSetPlayerA",
        "GetCurrentSetPlayerB",
        "GetSet1PlayerA",
        "GetSet1PlayerB",
        "GetSet2PlayerA",
        "GetSet2PlayerB",
        "GetNamePlayerA",
        "GetNamePlayerB",
    ):
        assert after[key] == before[key]


def test_returns_to_normal_mode_after_tie(
    scheduler: tuple[QuerySystem, RecordingClient, FakeClock]
) -> None:
    system, client, _ = scheduler
    client.tie_active = True

    system.run_steps(9)
    system.run_steps(3)
    system.run_for(60)

    client.tie_active = False
    system.run_for(15)

    assert system.mode == QuerySystem.NORMAL_MODE
    assert all(task.mode == QuerySystem.NORMAL_MODE for task in system.pending())
