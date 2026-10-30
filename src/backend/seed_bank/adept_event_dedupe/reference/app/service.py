from app.models import parse_rows
from app.store import EventStore


def summarize_events(rows: list) -> list[dict[str, str | int]]:
    """Return unique-event counts per user, ordered by user ID."""
    counts: dict[str, int] = {}
    for event in EventStore(parse_rows(rows)).deduplicated():
        counts[event.user_id] = counts.get(event.user_id, 0) + 1
    return [
        {"user_id": user_id, "count": counts[user_id]}
        for user_id in sorted(counts)
    ]
