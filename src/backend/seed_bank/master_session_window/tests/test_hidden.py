import json
from pathlib import Path
import random
import subprocess
import sys

import pytest

from app.parser import parse_codes
from app.report import build_report
from app.window import longest_window


def test_report_with_shrinking_and_long_tail():
    codes = ["A", "B", "C", "C", "B", "B", "A"]
    lines = [f"r{i}|{code}" for i, code in enumerate(codes)]
    assert build_report(lines, 2) == {"start": 1, "end_exclusive": 6, "length": 5}


def test_reports_match_small_bruteforce_oracle():
    rng = random.Random(3607)
    cases = [(["A"], 1)]
    cases += [([rng.choice("ABCD") for _ in range(rng.randrange(21))],
               rng.randrange(5)) for _ in range(100)]
    for codes, k in cases:
        best = (0, 0)
        for start in range(len(codes)):
            for end in range(start + 1, len(codes) + 1):
                if len(set(codes[start:end])) <= k and end - start > best[1] - best[0]:
                    best = (start, end)
        lines = [f"r{i}|{code}" for i, code in enumerate(codes)]
        assert longest_window(codes, k) == best
        assert build_report(lines, k) == {
            "start": best[0], "end_exclusive": best[1], "length": best[1] - best[0]}


def test_empty_zero_budget_and_invalid_budget():
    assert build_report([], 2) == {"start": 0, "end_exclusive": 0, "length": 0}
    assert build_report(["r1|A"], 0) == {"start": 0, "end_exclusive": 0, "length": 0}
    with pytest.raises(ValueError):
        longest_window(["A"], -1)


def test_parser_rejects_malformed_records():
    for bad in ["missing-separator", "r1|A|B", "|A", "r1|  "]:
        with pytest.raises(ValueError):
            parse_codes([bad])


def test_parser_ignores_blank_lines_and_strips_fields():
    lines = [" ", " r1 | TIMEOUT ", "", "r2|DENIED"]
    assert parse_codes(lines) == ["TIMEOUT", "DENIED"]
    assert longest_window(parse_codes(lines), 1) == (0, 1)


def test_large_window_performance():
    # Isolate this call so an O(n^2) candidate fails this test, rather than
    # consuming the entire 10-second task budget and hiding other results.
    worker = (
        "import json,time; from app.window import longest_window; "
        "codes=['TIMEOUT']*200000; started=time.perf_counter(); "
        "span=longest_window(codes,1); elapsed=time.perf_counter()-started; "
        "print(json.dumps({'span':span,'elapsed_sec':elapsed,'n':len(codes)}))"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", worker],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True, text=True, timeout=4.0, check=False,
        )
    except subprocess.TimeoutExpired:
        pytest.fail("200000-input window exceeded the 4-second worker deadline", pytrace=False)
    assert result.returncode == 0, result.stderr
    measurement = json.loads(result.stdout)
    assert measurement["span"] == [0, 200000]
    assert measurement["n"] == 200000
    assert measurement["elapsed_sec"] < 2.0, measurement
