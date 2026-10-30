from app.models import Event
from app.store import EventStore


def summarize_events(events: list[Event]) -> list[dict[str, str | int]]:
    """Return unique-event counts per user, ordered by user ID."""
    counts: dict[str, int] = {}
    for event in EventStore(events).deduplicated():
        counts[event.user_id] = counts.get(event.user_id, 0) + 1
    return [
        {"user_id": user_id, "count": counts[user_id]}
        for user_id in sorted(counts)
    ]
