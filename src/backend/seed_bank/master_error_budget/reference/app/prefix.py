from app.parser import check_span


def build_prefix(counts: list[int]) -> list[int]:
    """Return totals where entry i is the sum of counts[:i]."""
    prefix = [0]
    for count in counts:
        prefix.append(prefix[-1] + count)
    return prefix


def range_total(prefix: list[int], start: int, end: int) -> int:
    """Return the error total of the half-open span [start, end)."""
    check_span(len(prefix) - 1, start, end)
    return prefix[end] - prefix[start]
