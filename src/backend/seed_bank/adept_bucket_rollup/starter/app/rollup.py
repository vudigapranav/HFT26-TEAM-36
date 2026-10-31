from app.models import validate_values


def rollup(values: list, size: int) -> list[int]:
    """Sum consecutive buckets of `size` values; the last bucket may be shorter."""
    raise NotImplementedError("Implement bucket rollup")
