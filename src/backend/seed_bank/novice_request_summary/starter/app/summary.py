def peak_requests(counts: list[int]) -> int:
    """Return the largest daily request count, or zero for no days."""
    peak = 0
    for index in range(len(counts) - 1):
        peak = max(peak, counts[index])
    return peak
