# Runner fixtures (R0 → R2/R3)

Hostile and benign candidate submissions for the sandbox. Used today by
`src/backend/runner/images/python/sandbox-check.sh`, and by R2's runner tests later.

- `base/tests/` — trusted visible + hidden tests (4 tests) for `app/words.py::count_unique`.
- `cases/<name>/candidate/` — what the candidate sends. Only `app/` is editable;
  anything else (`conftest.py`, `tests/`) must be dropped by the runner.
- `cases/<name>/tests/` — extra **trusted** tests for that case (only `isolation_probe`).
- `cases/<name>/expect` — expected verdict: `pass | fail | error | timeout`, or
  `contained` = anything except `pass`, with the container ended by the runner.
- `cases/<name>/known_gap` — the expected verdict is not achieved yet; reported as `GAP`, not a failure.
- `cases/<name>/expect_capped` — the output cap must also trigger (`huge_output`).

| Case | Attack / purpose | Expected | What must stop it |
|---|---|---|---|
| `ok` | correct solution | pass | — |
| `buggy` | case-sensitive bug | fail | — |
| `syntax_error` | module doesn't parse | error | collection errors count as error |
| `infinite_loop` | `while True` | timeout | wall-clock deadline + `docker kill` |
| `fork_bomb` | every process forks forever | contained | `--pids-limit`, then the deadline |
| `memory_bomb` | allocates 16 MB blocks forever | contained | `--memory` (OOM kill) |
| `huge_output` | ~20 MB of stdout on failing tests | fail | caller caps output at 64 KB |
| `exit_at_import` | `sys.exit(0)` at import | error | collection error, not a pass |
| `hard_exit` | `os._exit(0)` at import: exit code 0, no results | error | verdict from XML, never the exit code |
| `delete_tests` | `rmtree /work/tests` at import | fail | `/work` mounted read-only |
| `conftest_override` | conftest hook rewrites every result to passed | fail | runner drops candidate conftest, writes empty ones |
| `forge_report` | `atexit` overwrites `/out/results.xml` with all-pass | fail (**known gap**) | not solved yet, see below |
| `isolation_probe` | trusted probes: non-root, no network/DNS, read-only root and `/work`, writable `/tmp`, no secrets in env | pass | the docker run flags |

Checked on host pytest without Docker: `ok`, `buggy`, `syntax_error`, `exit_at_import`,
`hard_exit` and `conftest_override` give the expected verdicts. With its conftest left in
place, `conftest_override` reports 4 passed on buggy code, so the fixture is a real attack.

**Known gap (`forge_report`, for R3):** candidate code runs in the same process as pytest,
so it can rewrite the results file after pytest writes it (or patch pytest at import).
Reading the file outside the container doesn't help. Options for R3: run the grading
harness in a separate process from candidate code, or compare outputs outside the sandbox
(context §10.1 A5).
