from app.models import Event
from app.store import EventStore


def summarize_events(events: list[Event]) -> list[dict[str, str | int]]:
    """Return unique-event counts per user, ordered by user ID."""
    raise NotImplementedError("Implement per-user summary")
