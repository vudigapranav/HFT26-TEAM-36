import pytest

from app.models import normalize_batch
from app.service import summarize_events
from app.store import deduplicate


def test_counts_are_sorted_and_deduplicated():
    rows = [("bob", "b1", 5), ("amy", "a1", 8), ("bob", "b1", 3), ("amy", "a2", 9)]
    assert summarize_events(rows) == [
        {"user_id": "amy", "count": 2}, {"user_id": "bob", "count": 1}]


def test_store_keeps_earliest_timestamp():
    rows = [("later", "shared", 20), ("earlier", "shared", 4)]
    assert deduplicate(rows) == [("earlier", "shared", 4)]


def test_normalize_preserves_rows():
    rows = [("amy", "a1", 0), ("bob", "b1", 7), ("amy", "a1", 3)]
    assert normalize_batch(rows) == rows


def test_normalize_rejects_bad_rows():
    for bad in [("amy", "", 1), ("", "a1", 1), ("amy", "a1", -1), ("amy", "a1")]:
        with pytest.raises(ValueError):
            normalize_batch([bad])
