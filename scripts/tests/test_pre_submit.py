"""Exercise release-gate results without needing a running backend or provider."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class PreSubmitTests(unittest.TestCase):
    def check_gate(self, tests="Tests  10 passed (10)", attacks="62 pass / 0 fail", status=0):
        with tempfile.TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            commands = {
                "pnpm": '#!/bin/sh\nif [ "$1" = test:auth ]; then [ "$TORQUECODE_REQUIRE_DB" = 1 ] && [ "$TORQUECODE_ALL_DB_TESTS" = 1 ] && [ "$RUNNER" = docker ] || exit 9; printf "  %s\\n" "$TEST_SUMMARY"; fi\n',
                "curl": "#!/bin/sh\nexit 0\n",
                "python3": '#!/bin/sh\nprintf "%s\\n" "$ATTACK_SUMMARY"\nexit "$ATTACK_STATUS"\n',
            }
            for name, content in commands.items():
                executable = bin_dir / name
                executable.write_text(content)
                executable.chmod(0o755)
            env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}",
                       TEST_SUMMARY=tests, ATTACK_SUMMARY=attacks, ATTACK_STATUS=str(status))
            return subprocess.run(["bash", "scripts/pre-submit-check.sh"], cwd=ROOT,
                                  env=env, capture_output=True, text=True, timeout=30)

    def test_complete_results_pass(self):
        result = self.check_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_skipped_unit_or_service_tests_fail(self):
        result = self.check_gate(tests="Tests  10 passed | 9 skipped (19)")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("required tests skipped", result.stdout)

    def test_postgres_startup_skip_fails(self):
        result = self.check_gate(tests="SKIP PostgreSQL integration: could not start")
        self.assertNotEqual(result.returncode, 0)

    def test_skipped_attacks_fail(self):
        self.assertNotEqual(self.check_gate(attacks="62 pass / 0 fail (5 skipped)").returncode, 0)

    def test_success_summary_cannot_hide_process_failure(self):
        self.assertNotEqual(self.check_gate(status=1).returncode, 0)

    def test_empty_attack_suite_fails(self):
        self.assertNotEqual(self.check_gate(attacks="0 pass / 0 fail").returncode, 0)


if __name__ == "__main__":
    unittest.main()
