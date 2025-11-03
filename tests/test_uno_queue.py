import types

import pytest

from wyniki import state
from wyniki.poller import CourtPollingWorker


class _FakeTime:
    def __init__(self, value: float = 1000.0) -> None:
        self.value = value

    def monotonic(self) -> float:
        return self.value

    def time(self) -> float:
        return self.value

    def sleep(self, seconds: float) -> None:
        self.value += seconds


@pytest.fixture(autouse=True)
def _reset_uno_queue():
    """Ensure UNO command queue is isolated across tests."""
    state.UNO_PENDING_COMMANDS.clear()
    state.UNO_REQUEST_USAGE.clear()
    state.UNO_REQUEST_METRICS.update({"bucket": None, "total": 0, "success": 0})
    yield
    state.UNO_PENDING_COMMANDS.clear()
    state.UNO_REQUEST_USAGE.clear()
    state.UNO_REQUEST_METRICS.update({"bucket": None, "total": 0, "success": 0})


@pytest.mark.parametrize(
    "field_id, flag_url, expected",
    [
        ("Player A Flag", "https://flags.example/a.png", True),
        ("Player B Flag", "https://flags.example/b.png", True),
        ("", "https://flags.example/x.png", False),
        ("Player A Flag", "", False),
        ("Player A Flag", None, False),
    ],
)
def test_enqueue_flag_update_validation(field_id, flag_url, expected):
    queued = state.enqueue_uno_flag_update("1", field_id, flag_url)
    assert queued is expected

    if expected:
        assert "1" in state.UNO_PENDING_COMMANDS
        queue = state.UNO_PENDING_COMMANDS["1"]
        expected_key = f"flag:{field_id.lower()}"
        assert expected_key in queue
        assert queue[expected_key]["payload"]["fieldId"] == field_id
    else:
        assert state.UNO_PENDING_COMMANDS.get("1") is None


def test_dequeue_and_requeue_respects_attempts(monkeypatch):
    fake_time = _FakeTime()
    monkeypatch.setattr(state, "time", fake_time)

    state.enqueue_uno_flag_update("1", "Player A Flag", "https://flags.example/a.png")

    item = state.dequeue_uno_command("1")
    assert item is not None
    assert item["attempts"] == 0

    # First retry should succeed and schedule a future attempt.
    requeued = state.requeue_uno_command("1", item, backoff_seconds=2.5)
    assert requeued is True

    # Not ready yet because of backoff.
    assert state.dequeue_uno_command("1") is None

    fake_time.value += 5.0
    next_item = state.dequeue_uno_command("1")
    assert next_item is not None
    assert next_item["attempts"] == 1

    # Simulate hitting the retry ceiling.
    next_item["attempts"] = next_item["max_attempts"] - 1
    dropped = state.requeue_uno_command("1", next_item, backoff_seconds=1.0)
    assert dropped is False
    assert state.dequeue_uno_command("1") is None


def test_worker_processes_queue_success(monkeypatch):
    state.enqueue_uno_flag_update("7", "Player A Flag", "https://flags.example/a.png")

    response_holder = {}

    def _fake_execute(command, payload):
        response_holder["command"] = command
        response_holder["payload"] = payload
        return True, 200, {"ok": True}

    worker = CourtPollingWorker.__new__(CourtPollingWorker)
    worker.kort_id = "7"
    worker.client = types.SimpleNamespace(execute=_fake_execute)

    processed = CourtPollingWorker._process_command_queue(worker)
    assert processed is True
    assert response_holder["command"] == "SetCustomizationField"
    assert response_holder["payload"]["fieldId"] == "Player A Flag"
    assert response_holder["payload"]["value"] == "https://flags.example/a.png"
    assert state.dequeue_uno_command("7") is None


def test_worker_requeues_on_temporary_failure(monkeypatch):
    fake_time = _FakeTime()
    monkeypatch.setattr(state, "time", fake_time)

    state.enqueue_uno_flag_update("9", "Player B Flag", "https://flags.example/b.png")

    def _fake_execute(command, payload):
        return False, 429, {"retry_after": 30}

    worker = CourtPollingWorker.__new__(CourtPollingWorker)
    worker.kort_id = "9"
    worker.client = types.SimpleNamespace(execute=_fake_execute)

    processed = CourtPollingWorker._process_command_queue(worker)
    assert processed is True

    # Command should remain queued with increased backoff.
    assert state.dequeue_uno_command("9") is None

    with state.UNO_COMMAND_QUEUE_LOCK:
        queued_entry = state.UNO_PENDING_COMMANDS["9"]["flag:player b flag"]
        target_monotonic = queued_entry["next_attempt"]

    fake_time.value = target_monotonic + 5.0
    queued_again = state.dequeue_uno_command("9")
    assert queued_again is not None
    assert queued_again["attempts"] == 1
