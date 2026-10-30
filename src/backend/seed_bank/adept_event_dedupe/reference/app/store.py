from app.models import Event, parse_rows, to_rows


class EventStore:
    """An in-memory snapshot of an ingestion batch."""

    def __init__(self, events: list[Event]) -> None:
        self._events = list(events)

    def snapshot(self) -> list[Event]:
        """Return a copy so callers cannot mutate the stored batch."""
        return list(self._events)

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
        earliest: dict[str, Event] = {}
        for event in self._events:
            previous = earliest.get(event.event_id)
            if previous is None or event.ts < previous.ts:
                earliest[event.event_id] = event
        return list(earliest.values())


def deduplicate(rows: list) -> list[tuple[str, str, int]]:
    """Validate rows, then return one earliest delivery per event_id as tuples."""
    return to_rows(EventStore(parse_rows(rows)).deduplicated())
