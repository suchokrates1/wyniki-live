"""A disconnected SSE listener must not receive the next event."""
import queue

import pytest

from wyniki.services.listener_fanout import ListenerFanOut
from wyniki.services.office_event_broker import OfficeEventBroker


def test_a_discarded_listener_misses_the_next_event():
    fanout = ListenerFanOut()
    staying = fanout.listen()
    leaving = fanout.listen()
    fanout.discard(leaving)
    fanout.broadcast({"type": "state_update"})
    assert staying.get_nowait() == {"type": "state_update"}
    with pytest.raises(queue.Empty):
        leaving.get_nowait()


def test_a_full_queue_does_not_block_the_other_listener():
    fanout = ListenerFanOut(maxsize=1)
    full = fanout.listen()
    other = fanout.listen()
    full.put_nowait({"old": True})
    fanout.broadcast({"type": "state_update"})
    assert other.get_nowait() == {"type": "state_update"}


def test_office_rooms_do_not_hear_each_other():
    broker = OfficeEventBroker()
    first = broker.listen(1)
    second = broker.listen(2)
    broker.broadcast(1, {"tournament_id": 1})
    assert first.get_nowait()["tournament_id"] == 1
    with pytest.raises(queue.Empty):
        second.get_nowait()
    broker.discard(1, first)
    broker.broadcast(1, {"tournament_id": 1})
    with pytest.raises(queue.Empty):
        first.get_nowait()
