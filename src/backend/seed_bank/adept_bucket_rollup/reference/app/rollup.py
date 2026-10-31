from app.models import validate_values


def rollup(values: list, size: int) -> list[int]:
    """Sum consecutive buckets of `size` values; the last bucket may be shorter."""
    if size < 1:
        raise ValueError("size must be at least 1")
    totals: list[int] = []
    for index, value in enumerate(validate_values(values)):
        if index % size == 0:
            totals.append(0)
        totals[-1] += value
    return totals
