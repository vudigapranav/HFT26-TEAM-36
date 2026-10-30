def longest_window(codes: list[str], k: int) -> tuple[int, int]:
    """Return the earliest longest half-open span with at most k codes."""
    if k < 0:
        raise ValueError("k must be nonnegative")
    if k == 0 or not codes:
        return (0, 0)
    left = best_start = best_end = 0
    counts: dict[str, int] = {}
    for right, code in enumerate(codes):
        counts[code] = counts.get(code, 0) + 1
        while len(counts) > k:
            outgoing = codes[left]
            counts[outgoing] -= 1
            if counts[outgoing] == 0:
                del counts[outgoing]
            left += 1
        if right + 1 - left > best_end - best_start:
            best_start, best_end = left, right + 1
    return (best_start, best_end)
