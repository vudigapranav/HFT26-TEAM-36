from app.models import Event


class EventStore:
    """An in-memory snapshot of an ingestion batch."""

    def __init__(self, events: list[Event]) -> None:
        self._events = list(events)

    def snapshot(self) -> list[Event]:
        """Return a copy so callers cannot mutate the stored batch."""
        return list(self._events)

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
        raise NotImplementedError("Implement event deduplication")
