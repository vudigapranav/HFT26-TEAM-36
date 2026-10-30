from app.parser import parse_codes
from app.report import build_report
from app.window import longest_window


def test_report_for_mixed_requests():
    lines = ["r1|A", "r2|B", "r3|A", "r4|C", "r5|C"]
    assert build_report(lines, 2) == {"start": 0, "end_exclusive": 3, "length": 3}


def test_single_request_report():
    assert build_report(["r1|TIMEOUT"], 1) == {
        "start": 0, "end_exclusive": 1, "length": 1}


def test_window_returns_earliest_tie():
    assert longest_window(["A", "A", "B", "B"], 1) == (0, 2)
    assert longest_window(["A", "B", "C", "B", "B"], 2) == (1, 5)


def test_parser_preserves_records():
    assert parse_codes(["r1|A", "r2|B", "r3|A"]) == ["A", "B", "A"]
