def peak_requests(counts: list[int]) -> int:
    """Return the largest daily request count, or zero for no days."""
    peak = 0
    for count in counts:
        peak = max(peak, count)
    return peak
