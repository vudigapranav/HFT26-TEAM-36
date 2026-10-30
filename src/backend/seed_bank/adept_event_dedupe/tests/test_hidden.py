from app.models import Event
from app.service import summarize_events
from app.store import EventStore


def test_empty_batch():
    assert EventStore([]).deduplicated() == []
    assert summarize_events([]) == []


def test_one_user_many_retries():
    events = [Event("u", "x", 9), Event("u", "x", 3),
              Event("u", "y", 0), Event("u", "y", 5)]
    assert summarize_events(events) == [{"user_id": "u", "count": 2}]


def test_global_ids_and_first_wins_timestamp_ties():
    events = [Event("z", "shared", 10), Event("a", "shared", 2),
              Event("b", "shared", 2), Event("b", "other", 1)]
    assert EventStore(events).deduplicated() == [events[1], events[3]]
    assert summarize_events(events) == [
        {"user_id": "a", "count": 1}, {"user_id": "b", "count": 1}]


def test_many_users_and_input_is_unchanged():
    events = [Event(f"user-{i % 17:02}", f"event-{i}", i) for i in range(1000)]
    events += [Event("retry-owner", f"event-{i}", 2000 + i) for i in range(1000)]
    before = list(events)
    expected = [{"user_id": f"user-{i:02}", "count": 59 if i < 14 else 58}
                for i in range(17)]
    assert summarize_events(events) == expected
    assert events == before


def test_case_sensitive_ids_and_first_seen_order():
    events = [Event("z", "ID", 8), Event("a", "id", 1), Event("b", "ID", 0)]
    assert EventStore(events).deduplicated() == [events[2], events[1]]
    assert summarize_events(events) == [
        {"user_id": "a", "count": 1}, {"user_id": "b", "count": 1}]


def test_model_value_equality():
    assert Event("u", "e", 7) == Event("u", "e", 7)
    assert Event("u", "e", 7) != Event("u", "e", 8)
