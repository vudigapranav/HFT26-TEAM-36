# Runner harness: split-container grading (R3)

Every Run/Submit uses two containers from `torquecode-runner-python`:

```text
            host (dockerRunner.ts)                       relays one JSON line at a time
  grader (TRUSTED)  ── stdout ──▶  validate ──▶  stdin ──  worker (UNTRUSTED)
  /grade: tests, ini              size ≤ 1 MiB/line        /work: candidate files only
  /harness (ro)     ◀── stdin ──  id must match ◀ stdout ─ /harness (ro)
  pytest + proxies                one call in flight       candidate prints → stderr
  report → stdout                 ≤ 10 000 calls           no tests, no report path
```

- **Grader** (`grade.py`): runs pytest on the task's tests. Imports of the candidate's modules
  return proxies, so `from app.summary import peak_requests` gives a function whose calls are relayed.
  The report goes out on the grader's own protocol stream; there is no writable mount anywhere.
- **Worker** (`worker.py`): imports and runs the candidate's code. It can't see the tests, expected
  values, hints, other runs or the Docker socket. Everything it sends is validated by the host;
  a malformed, oversized, unsolicited or wrong-id reply kills the worker and the test is `error`.
- **Codec** (`protocol.py`): plain data only. No pickle, no eval, no object handles.

## Supported task format (for task authors: Karthik, Aryan)

Tests are ordinary pytest files. They work unchanged when they:

1. Import candidate code as modules or names: `from app.summary import f`, `import app.summary as s`,
   `from app.config import LIMIT` (module-level constants must be plain data).
2. Call candidate **functions** with plain-data arguments and compare plain-data results:
   `None, bool, int, finite float, str, list, tuple, dict, set, frozenset, bytes` (nested is fine).
3. Expect builtin exceptions with `pytest.raises(ValueError)` etc. (ValueError, TypeError, KeyError,
   IndexError, ZeroDivisionError, RuntimeError, NotImplementedError, AttributeError, OverflowError,
   RecursionError, ArithmeticError, LookupError, StopIteration, AssertionError, Exception).

Candidate code may span many files and import its own modules freely (`app/x.py` importing `app/y.py`).

**Not supported** (the run returns `unavailable: Task not supported by the isolated runner`, never a grade):

- passing objects, classes, callables, generators or file handles **as arguments**;
- returning objects/instances (the test gets `error`; a reference doing this fails validation);
- checking in-place mutation of an argument (the candidate works on a copy);
- object identity (`is`), monkeypatching candidate modules from tests, or fixtures that reach
  into candidate internals;
- tests that start servers or apps from candidate code (e.g. FastAPI TestClient).

Adapt such tasks by exposing a function: e.g. instead of `RateLimiter().allow(t)` per call, test
`simulate_limiter(capacity, events) -> list[bool]`.

## What this boundary guarantees, and what it doesn't

Guaranteed (within the supported format, tested in `tests/runner/r3-antitamper.test.ts`):

- Candidate code never executes in the process or container that holds tests and the report.
- Hidden test **source**, expected outputs and the report are not readable or writable by candidate code.
- Forged reports, forced exits, pytest/builtin monkeypatching, injected protocol frames and huge
  replies cannot produce a pass.

Not guaranteed:

- **Hidden test inputs are visible to the candidate**: their function receives the arguments.
  A candidate can log them (to its own output) or special-case them. Inputs are not confidential.
- **Oracle inference**: repeated Runs reveal visible-test outcomes, as with any grader.
- **Container escape**: isolation is standard Docker (non-root, no network, read-only root, caps
  dropped, no-new-privileges, pid/memory/CPU limits). A kernel or Docker escape is out of scope.
- A candidate can still harm its own grade (crash, hang, garble its replies): always `error`/`timeout`, never `pass`.
