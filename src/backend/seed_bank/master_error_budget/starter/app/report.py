from app.parser import check_span, parse_counts


def budget_report(lines: list[str], queries: list, budget: int) -> list[dict]:
    """Report the error total of each queried span against the budget."""
    if budget < 0:
        raise ValueError("budget must be nonnegative")
    counts = parse_counts(lines)
    report = []
    for start, end in queries:
        check_span(len(counts), start, end)
        errors = sum(counts[start:end])
        report.append({
            "start": start,
            "end_exclusive": end,
            "errors": errors,
            "over_budget": errors >= budget,
        })
    return report


def count_over_budget(lines: list[str], queries: list, budget: int) -> int:
    """Return how many queried spans are over budget."""
    return sum(1 for row in budget_report(lines, queries, budget) if row["over_budget"])
