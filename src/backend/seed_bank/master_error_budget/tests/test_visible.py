import pytest

from app.parser import parse_counts
from app.prefix import build_prefix, range_total
from app.report import budget_report


def test_report_flags_only_spans_over_budget():
    lines = ["m1|2", "m2|0", "m3|5"]
    assert budget_report(lines, [(0, 2), (1, 3)], 2) == [
        {"start": 0, "end_exclusive": 2, "errors": 2, "over_budget": False},
        {"start": 1, "end_exclusive": 3, "errors": 5, "over_budget": True},
    ]


def test_prefix_totals_for_mixed_counts():
    assert build_prefix([3, 1, 4]) == [0, 3, 4, 8]


def test_parser_reads_records():
    assert parse_counts([" m1 | 4 ", "", "m2|0"]) == [4, 0]


def test_range_total_rejects_bad_spans():
    prefix = [0, 1, 3]
    for start, end in [(-1, 1), (2, 1), (0, 3)]:
        with pytest.raises(ValueError):
            range_total(prefix, start, end)
