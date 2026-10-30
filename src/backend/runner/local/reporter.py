"""Structured pytest reports for immutable K1 fixtures, not candidate grading."""
import json
from pathlib import Path
import os

_results = {}


def pytest_runtest_logreport(report):
    if report.when == "call" or (report.when in {"setup", "teardown"} and report.failed):
        _results[report.nodeid] = {
            "id": report.nodeid,
            "status": "pass" if report.passed else "fail" if report.when == "call" else "error",
            "duration_ms": max(0, report.duration * 1000),
        }


def pytest_sessionfinish(session, exitstatus):
    Path(os.environ["TORQUE_REPORT_PATH"]).write_text(
        json.dumps({"exit_code": int(exitstatus), "tests": list(_results.values())}),
        encoding="utf-8",
    )
