import pytest

from app.models import normalize_batch
from app.service import summarize_events
from app.store import deduplicate


def test_empty_batch():
    assert deduplicate([]) == []
    assert summarize_events([]) == []


def test_one_user_many_retries():
    rows = [("u", "x", 9), ("u", "x", 3), ("u", "y", 0), ("u", "y", 5)]
    assert summarize_events(rows) == [{"user_id": "u", "count": 2}]


def test_global_ids_and_first_wins_timestamp_ties():
    rows = [("z", "shared", 10), ("a", "shared", 2), ("b", "shared", 2), ("b", "other", 1)]
    assert deduplicate(rows) == [("a", "shared", 2), ("b", "other", 1)]
    assert summarize_events(rows) == [
        {"user_id": "a", "count": 1}, {"user_id": "b", "count": 1}]


def test_many_users_and_late_retries():
    rows = [(f"user-{i % 17:02}", f"event-{i}", i) for i in range(1000)]
    rows += [("retry-owner", f"event-{i}", 2000 + i) for i in range(1000)]
    expected = [{"user_id": f"user-{i:02}", "count": 59 if i < 14 else 58} for i in range(17)]
    assert summarize_events(rows) == expected


def test_case_sensitive_ids_and_first_seen_order():
    rows = [("z", "ID", 8), ("a", "id", 1), ("b", "ID", 0)]
    assert deduplicate(rows) == [("b", "ID", 0), ("a", "id", 1)]
    assert summarize_events(rows) == [
        {"user_id": "a", "count": 1}, {"user_id": "b", "count": 1}]


def test_normalize_value_types():
    assert normalize_batch([("u", "e", 0)]) == [("u", "e", 0)]
    with pytest.raises(ValueError):
        normalize_batch([("u", "e", True)])
