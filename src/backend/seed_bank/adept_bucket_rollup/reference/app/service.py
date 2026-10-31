from app.rollup import rollup


def peak_bucket(values: list, size: int) -> dict | None:
    """Return the earliest bucket with the largest total, or None without data."""
    totals = rollup(values, size)
    if not totals:
        return None
    best = 0
    for index in range(1, len(totals)):
        if totals[index] > totals[best]:
            best = index
    return {"index": best, "total": totals[best]}
