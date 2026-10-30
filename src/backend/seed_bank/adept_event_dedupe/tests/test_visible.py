from app.models import Event
from app.service import summarize_events
from app.store import EventStore


def test_counts_are_sorted_and_deduplicated():
    events = [Event("bob", "b1", 5), Event("amy", "a1", 8),
              Event("bob", "b1", 3), Event("amy", "a2", 9)]
    assert summarize_events(events) == [
        {"user_id": "amy", "count": 2}, {"user_id": "bob", "count": 1}]


def test_store_keeps_earliest_timestamp():
    events = [Event("later", "shared", 20), Event("earlier", "shared", 4)]
    assert EventStore(events).deduplicated() == [events[1]]


def test_model_preserves_fields():
    event = Event("amy", "a1", 0)
    assert (event.user_id, event.event_id, event.ts) == ("amy", "a1", 0)


def test_snapshot_is_independent():
    events = [Event("amy", "a1", 1)]
    store = EventStore(events)
    events.clear()
    snapshot = store.snapshot()
    snapshot.clear()
    assert store.snapshot() == [Event("amy", "a1", 1)]
