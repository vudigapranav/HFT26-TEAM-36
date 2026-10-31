from app.parser import check_span


def build_prefix(counts: list[int]) -> list[int]:
    """Return totals where entry i is the sum of counts[:i]."""
    prefix = [0]
    total = counts[0] if counts else 0
    for count in counts:
        total += count
        prefix.append(total)
    return prefix


def range_total(prefix: list[int], start: int, end: int) -> int:
    """Return the error total of the half-open span [start, end)."""
    check_span(len(prefix) - 1, start, end)
    return prefix[end] - prefix[start]
