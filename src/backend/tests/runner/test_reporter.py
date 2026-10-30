"""Exercise the local reporter through real pytest sessions, not fabricated grades."""
import json
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.fixture
def run_session(tmp_path):
    reporter_dir = Path(__file__).resolve().parents[2] / "runner" / "local"

    def run(source):
        (tmp_path / "test_sample.py").write_text(source, encoding="utf-8")
        report_path = tmp_path / "report.json"
        result = subprocess.run(
            [sys.executable, "-B", "-m", "pytest", "-p", "reporter", "-p", "no:cacheprovider", "-q", "test_sample.py"],
            cwd=tmp_path,
            env={"PATH": "/usr/bin:/bin", "PYTHONPATH": str(reporter_dir),
                 "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "TORQUE_REPORT_PATH": str(report_path)},
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode, json.loads(report_path.read_text(encoding="utf-8"))

    return run


@pytest.mark.parametrize("source,status,exit_code", [
    ("def test_case():\n    assert True\n", "pass", 0),
    ("def test_case():\n    assert False\n", "fail", 1),
    ("import pytest\n@pytest.fixture\ndef resource():\n    raise RuntimeError('setup failed')\ndef test_case(resource):\n    assert True\n", "error", 1),
    ("import pytest\n@pytest.fixture\ndef resource():\n    yield\n    raise RuntimeError('teardown failed')\ndef test_case(resource):\n    assert True\n", "error", 1),
], ids=["pass", "assertion-failure", "setup-error", "teardown-error"])
def test_reporter_preserves_real_test_outcome(run_session, source, status, exit_code):
    actual_exit, report = run_session(source)
    assert actual_exit == exit_code
    assert report["exit_code"] == exit_code
    assert len(report["tests"]) == 1
    result = report["tests"][0]
    assert result["id"] == "test_sample.py::test_case"
    assert result["status"] == status
    assert result["duration_ms"] >= 0
