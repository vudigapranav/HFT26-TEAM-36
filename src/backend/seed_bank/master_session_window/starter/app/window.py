def longest_window(codes: list[str], k: int) -> tuple[int, int]:
    """Return the earliest longest half-open span with at most k codes."""
    if k < 0:
        raise ValueError("k must be nonnegative")
    if k == 0 or not codes:
        return (0, 0)
    left = best_start = best_end = 0
    for right, code in enumerate(codes):
        while len(set(codes[left:right + 1])) > k:
            left += 1
        if right + 1 - left > best_end - best_start:
            best_start, best_end = left, right + 1
    return (best_start, best_end)
