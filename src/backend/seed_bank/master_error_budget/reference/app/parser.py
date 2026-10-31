def parse_counts(lines: list[str]) -> list[int]:
    """Parse `minute|errors` records into per-minute error counts."""
    counts: list[int] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 2:
            raise ValueError("expected minute|errors")
        minute, errors = (part.strip() for part in parts)
        if not minute or not (errors.isascii() and errors.isdigit()):
            raise ValueError("invalid record")
        counts.append(int(errors))
    return counts


def check_span(size: int, start: int, end: int) -> None:
    """Reject spans outside the half-open range [0, size]."""
    if not 0 <= start <= end <= size:
        raise ValueError("span out of range")
