from app.rollup import rollup


def peak_bucket(values: list, size: int) -> dict | None:
    """Return the earliest bucket with the largest total, or None without data."""
    raise NotImplementedError("Implement peak bucket lookup")
