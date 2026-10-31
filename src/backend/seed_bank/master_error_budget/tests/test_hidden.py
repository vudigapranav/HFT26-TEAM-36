import random
import time

import pytest

from app.parser import parse_counts
from app.prefix import build_prefix, range_total
from app.report import budget_report, count_over_budget


def test_reports_match_direct_sums():
    rng = random.Random(4211)
    for _ in range(80):
        counts = [rng.randrange(6) for _ in range(rng.randrange(1, 15))]
        lines = [f"m{i}|{count}" for i, count in enumerate(counts)]
        queries = []
        for _ in range(5):
            start = rng.randrange(len(counts) + 1)
            queries.append((start, rng.randrange(start, len(counts) + 1)))
        budget = rng.randrange(8)
        expected = []
        for start, end in queries:
            total = 0
            for index in range(start, end):
                total += counts[index]
            expected.append({"start": start, "end_exclusive": end,
                             "errors": total, "over_budget": total > budget})
        assert budget_report(lines, queries, budget) == expected
    assert not budget_report(["m1|3", "m2|3"], [(0, 2)], 6)[0]["over_budget"]
    assert count_over_budget(["m1|3", "m2|4"], [(0, 1), (0, 2), (1, 2)], 4) == 1


def test_prefix_and_span_totals_agree():
    counts = [5, 0, 2, 7]
    prefix = build_prefix(counts)
    assert prefix == [0, 5, 5, 7, 14]
    assert range_total(prefix, 1, 4) == 9


def test_empty_and_invalid_inputs():
    assert budget_report([], [(0, 0)], 1) == [
        {"start": 0, "end_exclusive": 0, "errors": 0, "over_budget": False}]
    assert build_prefix([]) == [0]
    with pytest.raises(ValueError):
        budget_report(["m1|1"], [(0, 1)], -1)
    with pytest.raises(ValueError):
        budget_report(["m1|1"], [(0, 2)], 1)


def test_parser_rejects_malformed_records():
    for bad in ["missing-separator", "m1|2|3", "|4", "m1|-1", "m1|x"]:
        with pytest.raises(ValueError):
            parse_counts([bad])


def test_budget_report_performance():
    lines = [f"m{i}|1" for i in range(30000)]
    queries = [[0, 30000]] * 12000
    started = time.perf_counter()
    over = count_over_budget(lines, queries, 29999)
    elapsed = time.perf_counter() - started
    assert over == 12000
    assert elapsed < 0.3
