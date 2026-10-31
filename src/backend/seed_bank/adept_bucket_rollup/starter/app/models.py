def validate_values(values: list) -> list[int]:
    """Return a copy of values after checking each is a nonnegative integer."""
    checked: list[int] = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError("values must be nonnegative integers")
        checked.append(value)
    return checked
