from app.models import parse_rows
from app.store import EventStore


def summarize_events(rows: list) -> list[dict[str, str | int]]:
    """Return unique-event counts per user, ordered by user ID."""
    raise NotImplementedError("Implement per-user summary")
