from app.parser import parse_counts
from app.prefix import build_prefix, range_total


def budget_report(lines: list[str], queries: list, budget: int) -> list[dict]:
    """Report the error total of each queried span against the budget."""
    if budget < 0:
        raise ValueError("budget must be nonnegative")
    prefix = build_prefix(parse_counts(lines))
    report = []
    for start, end in queries:
        errors = range_total(prefix, start, end)
        report.append({
            "start": start,
            "end_exclusive": end,
            "errors": errors,
            "over_budget": errors > budget,
        })
    return report


def count_over_budget(lines: list[str], queries: list, budget: int) -> int:
    """Return how many queried spans are over budget."""
    return sum(1 for row in budget_report(lines, queries, budget) if row["over_budget"])
