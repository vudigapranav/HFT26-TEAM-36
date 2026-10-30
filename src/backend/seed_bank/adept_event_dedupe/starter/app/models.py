from dataclasses import dataclass


@dataclass(frozen=True)
class Event:
    user_id: str
    event_id: str
    ts: int


def parse_rows(rows: list) -> list[Event]:
    """Validate raw (user_id, event_id, ts) rows and build Event records."""
    events: list[Event] = []
    for row in rows:
        if len(row) != 3:
            raise ValueError("Expected (user_id, event_id, ts)")
        user_id, event_id, ts = row
        if not isinstance(user_id, str) or not user_id or not isinstance(event_id, str) or not event_id:
            raise ValueError("user_id and event_id must be nonempty strings")
        if not isinstance(ts, int) or isinstance(ts, bool) or ts < 0:
            raise ValueError("ts must be a nonnegative integer")
        events.append(Event(user_id, event_id, ts))
    return events


def to_rows(events: list[Event]) -> list[tuple[str, str, int]]:
    """Convert Event records back to (user_id, event_id, ts) tuples."""
    return [(event.user_id, event.event_id, event.ts) for event in events]


def normalize_batch(rows: list) -> list[tuple[str, str, int]]:
    """Validate a raw batch and return it as tuples, in input order."""
    return to_rows(parse_rows(rows))
