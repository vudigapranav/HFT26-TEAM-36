from dataclasses import dataclass


@dataclass(frozen=True)
class Event:
    user_id: str
    event_id: str
    ts: int
