from __future__ import annotations

from typing import Iterator

import pytest
from flask import Flask

from wyniki import routes, state


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep global state isolated and avoid writing to persistent storage."""
    monkeypatch.setattr(routes, "persist_state_cache", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "broadcast_kort_state", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "is_plugin_enabled", lambda: True)

    with state.STATE_LOCK:
        state.snapshots.clear()
    state.GLOBAL_LOG.clear()
    state.GLOBAL_HISTORY.clear()
    with state.UNO_COMMAND_QUEUE_LOCK:
        state.UNO_PENDING_COMMANDS.clear()
    state.UNO_REQUEST_USAGE.clear()
    state.UNO_REQUEST_METRICS.update({"bucket": None, "total": 0, "success": 0})

    yield

    with state.STATE_LOCK:
        state.snapshots.clear()
    state.GLOBAL_LOG.clear()
    state.GLOBAL_HISTORY.clear()
    with state.UNO_COMMAND_QUEUE_LOCK:
        state.UNO_PENDING_COMMANDS.clear()
    state.UNO_REQUEST_USAGE.clear()
    state.UNO_REQUEST_METRICS.update({"bucket": None, "total": 0, "success": 0})


@pytest.fixture()
def client() -> Iterator:
    app = Flask(__name__)
    app.secret_key = "testing"
    routes.register_routes(app)
    with app.test_client() as test_client:
        yield test_client


def test_reflect_queues_flag_update_from_payload(client) -> None:
    kort_id = "1"
    flag_url = "https://flags.example/a.png"

    response = client.post(
        f"/api/local/reflect/{kort_id}",
        json={"command": "SetNamePlayerA", "value": "Alice", "flagUrl": flag_url},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload is not None

    flag_push = payload.get("flag_push")
    assert isinstance(flag_push, list)
    assert flag_push
    queued_entry = flag_push[0]
    assert queued_entry["queued"] is True
    assert queued_entry["field"] == "Player A Flag"
    assert queued_entry["value"] == flag_url

    with state.UNO_COMMAND_QUEUE_LOCK:
        queue = state.UNO_PENDING_COMMANDS.get(kort_id)
        assert queue is not None
        item = queue.get("flag:player a flag")
    assert item is not None
    assert item["command"] == "SetCustomizationField"
    assert item["payload"] == {"fieldId": "Player A Flag", "value": flag_url}