# Rithvik — status log

Newest entries at the bottom. Written by `/ship`.

## 2026-10-31 00:13 — R0 — runner image proved in Docker; fixtures; Featherless measured
- Changed:
  - `src/backend/runner/images/python/Dockerfile`: `python:3.13-slim` (ARG `PYTHON_VERSION`), pytest 9.2.0 and its deps pinned to the versions in K1's `uv.lock`, non-root uid 10001, WORKDIR `/work`, `PYTHONDONTWRITEBYTECODE=1`, `HOME=/tmp`.
  - `src/backend/runner/images/python/sandbox-check.sh`: runs every runner fixture in the image and checks the verdict.
  - `src/backend/tests/fixtures/runner/`: 13 cases (benign, infinite loop, fork bomb, memory bomb, huge output, `sys.exit`/`os._exit` at import, test deletion, conftest override, forged results, isolation probes). See its README.
  - `src/backend/tests/fixtures/llm/jailbreaks.json`: the 10 R5 jailbreak attempts.
- Sandbox flags (defaults = seed task 1 limits from K1: 5000 ms, 128 MB, 1 CPU, 32 pids, 64 KB output):
  ```
  docker run -d --name <unique> --network none --memory 128m --memory-swap 128m --cpus 1 --pids-limit 32 \
    --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m --user 10001:10001 --cap-drop ALL \
    --security-opt no-new-privileges --log-opt max-size=1m --log-opt max-file=1 \
    -e PYTHONPATH=/work -e PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 -v <work>:/work:ro -v <out>:/out \
    torquecode-runner-python:dev python -m pytest -q -p no:cacheprovider --junitxml=/out/results.xml <test files>
  ```
  The run is attached and its output read live through a 64 KB cap (not `docker logs` afterwards: log rotation keeps only the tail). The caller polls with a wall-clock deadline, then `docker kill`, then removes the container.
- Results (`bash src/backend/runner/images/python/sandbox-check.sh`, 2026-10-31):
  - Host: Windows 11, x86-64, 24 CPUs, 16 GB, Docker 29.8.0, Linux containers. Image `torquecode-runner-python:dev`: Python 3.13.18, pytest 9.2.0, uid 10001. **Not yet checked on the demo machine (OPEN-Q10); Apple Silicon unverified.**
  - All 13 cases: 0 unexpected results; Docker daemon healthy afterwards; no leftover containers. Total ~1m43s.

    | case | verdict | how it ended |
    |---|---|---|
    | ok / isolation_probe | pass | 4/4 and 12/12 pass: non-root, no network, no DNS, read-only root + `/work`, writable `/tmp`, no secrets in env |
    | buggy / conftest_override / delete_tests | fail | candidate conftest dropped; `rmtree /work/tests` had no effect |
    | syntax_error / exit_at_import | error | collection errors |
    | hard_exit | error | exit code 0 but no results file, so not a pass |
    | infinite_loop | timeout | killed at 5 s (exit 137) |
    | fork_bomb | timeout | contained by `--pids-limit 32`, killed at 5 s |
    | memory_bomb | error | OOM-killed at 128 MB (exit 137) |
    | huge_output | fail | ~20 MB emitted, captured exactly 65,536 bytes |
    | forge_report | **pass (GAP)** | candidate `atexit` rewrote results.xml to all-pass on buggy code; see below |
  - Latency, passing case: ~1.7 s client-side, ~1.1 s inside the container. Fits the 5 s limit, but R2 should keep containers warm (context §10.1 A4) or start the deadline after container start.
  - Before Docker was up, host pytest gave the same verdicts for the 6 non-hostile cases. With its conftest left in place, `conftest_override` turns buggy code into 4 passes.
- Seams/contracts affected: none. Nothing imports contracts yet.
- Teammates should know:
  - Karthik: the runner image uses Python 3.13 and pytest 9.2.0 to match `pyproject.toml`/`uv.lock`. Keep them in sync if you change either.
  - Karthik: known gap for R3. Candidate code shares the process with pytest, so it can rewrite the results file (`forge_report` fixture) or patch pytest at import. Results need a trust boundary outside the candidate's process.
  - Karthik: the `/out` bind mount has no size cap; a candidate can write to it until the deadline. R2 will cap or replace it.
  - Karthik: `nextHint` receives only `task_id`, so `hints.ts` needs a way to look up the task's hint ladder. Which store should it use?
  - Karthik: please add `FEATHERLESS_API_KEY=`, `FEATHERLESS_MODEL_GENERATION=`, `FEATHERLESS_MODEL_ASSISTANT=` to `.env.example`.
- Next: R2 (contracts are on main); run the sandbox check on the demo machine.

### Featherless
Measured 2026-10-31 from this laptop, key read from `.env` (never logged).
- `GET /v1/plan`: plan "Request Pricing" (`feather_request_pricing`). `concurrency: 100`, `max_context_length: null`, `max_model_size: null`, `api_access: true`, `credits: 25.00`. So the context limit is per model, and the $25 credit is the real budget.
- `GET /v1/models`: 22,422 models. Shortlisted 3 ungated models of 34B or smaller.
- Test: system prompt "Reply only with JSON. No prose, no markdown fences.", a small task-summary request, `max_tokens 120`, temperature 0, 3 sequential rounds:

  | model | context | concurrency cost | $/M in / out | latency (3 runs) | JSON-only |
  |---|---|---|---|---|---|
  | `Qwen/Qwen3-Coder-30B-A3B-Instruct` | 32k | 1 | 0.125 / 0.45 | 1.79, 2.36, 3.08 s | 3/3 |
  | `Qwen/Qwen2.5-Coder-32B-Instruct` | 32k | 2 | 0.68 / 1.20 | 9.46, 3.56, 18.53 s | 3/3 |
  | `Qwen/Qwen3-30B-A3B-Instruct-2507` | 262k | 1 | 0.125 / 0.45 | 1.28, 1.14, 1.23 s | 3/3 |

- **Proposed (TODO(OPEN-Q9), Karthik to record in BACKEND_DECISIONS.md):**
  - generation = `Qwen/Qwen3-Coder-30B-A3B-Instruct`
  - assistant = `Qwen/Qwen3-30B-A3B-Instruct-2507`
  - Drop Qwen2.5-Coder-32B: slow, high variance, about 5× the price, and double the concurrency cost.
- Not measured yet: long generation prompts, parallel calls and 429 behaviour (R4 queue tests). These are tiny prompts, so the latencies are lower bounds.

## 2026-10-31 00:27 — R2 — Docker runTests seam (`runner/dockerRunner.ts`)
- Changed:
  - `src/backend/runner/dockerRunner.ts`: `createDockerRunner({ image?, docker? })` and the default `runTestsInDocker`. Exact `Ports['runTests']` type: `(RunRequest, Context) => Promise<SeamResult<InternalRunResult>>`.
  - `src/backend/runner/junit.ts`: strict JUnit reader and fail-closed `grade()`.
  - `src/backend/tests/runner/docker-runner.test.ts`: 32 tests (19 unit tests, 13 against real Docker).
- How it runs:
  - Validates the request: safe relative paths only; no `conftest.py`, `pytest.ini`, `pyproject.toml`, `setup.cfg`, `tox.ini`, `sitecustomize.py`, `*.pth`, `pytest`/`_pytest`/`pluggy` shadows, or `__pycache__`; no files in test dirs; no case-insensitive collisions; limits within bounds; at most 2 MiB.
  - Writes a fresh temp workspace with candidate files, trusted tests, a trusted `pytest.ini` and empty `conftest.py` files.
  - `spawn('docker', args)` with no shell, using the R0 flags plus `--rm --pull never --label torquecode.runner=1`. Limits come from `RunRequest.limits`; seed task 1 uses 5 s, 128 MB, 1 CPU, 32 pids, 64 KB.
  - Runs `python -I -B -m pytest -q -p no:cacheprovider -c /work/pytest.ini --rootdir /work --junitxml /out/results.xml <selected tests>`. `-I` means candidate files can't shadow pytest.
  - Run mode = visible tests only; submit = visible + hidden.
  - At the wall-clock deadline: `docker kill`, all tests `timeout`. Afterwards `docker rm -f` and the temp dir is removed (in `finally`), plus a process-exit cleanup hook.
  - stdout and stderr are each capped at `output_bytes`, streamed and drained, never fully buffered. The JUnit report is limited to 1 MiB.
- Grading is fail-closed:
  - Every expected test id gets a status. Missing, malformed or oversized report, skipped tests, and pytest exit codes other than 0/1 all count as `error`.
  - Nothing passes unless pytest's exit code agrees with the report. This catches the R0 `forge_report` attack as long as the candidate doesn't also force exit code 0.
- Startup failures (Docker missing or down, image missing: exit 125/126/127) and rejected requests return `{ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE' }` and never throw. An abort signal kills the container and rethrows.
- Test evidence (Windows 11, Docker 29.8.0, image `torquecode-runner-python:dev`):
  - `npx tsc --noEmit -p tsconfig.json` (in src/backend): OK.
  - `npx vitest run --config vitest.config.ts tests/runner/docker-runner.test.ts`: **32 passed, 0 failed, 0 skipped**, 28 s. Docker tests skip cleanly if the image or daemon is missing.
  - Seed task 1: reference 5/5 twice. The starter fails exactly `f2p_ids` and passes `p2p_ids`.
  - Run mode returns only the 2 visible tests. `publicRun(submit)` contains no hidden ids or hidden test source, and hidden is `{passed: 2, total: 3}`.
  - Hostile cases: infinite loop → timeout and container removed; huge output capped at 64 KB and graded `fail`; network/DNS/write probes pass inside the container; deleting tests has no effect (4 tests still graded); `sys.exit(0)`, `os._exit(0)`, forged report and syntax error all give 0 passed / all `error`; memory bomb contained; missing image or missing docker binary → `SANDBOX_UNAVAILABLE`.
  - Whole backend suite: 71 passed, **5 failed, all in Karthik's existing tests, caused by this Windows checkout, not R2** (no R2 change touches them):
    - 4 fail with "Trusted seed artifacts changed": `core.autocrlf=true` checks the seed files out with CRLF, and the pinned digest only matches the LF version (verified).
    - 1 times out: `process.kill(-pid)` in `runner/local/process.ts` is POSIX-only.
- Seams/contracts affected: none changed. Uses `RunRequest`, `InternalRunResult`, `Limits`, `TestFile`, `SeamResult` and `Context` from `contracts/internal.ts` as merged in K1 (PR 6).
- Teammates should know:
  - Karthik, wiring (I don't edit `api/`): in `createDevPorts()` / production ports, use
    `import { runTestsInDocker } from '../runner/dockerRunner.js';`
    `runTests: process.env.RUNNER === 'docker' ? runTestsInDocker : runSeedTests`
    The image is built with `docker build -t torquecode-runner-python:dev src/backend/runner/images/python`; override it with `RUNNER_IMAGE`. A result of `unavailable` must map to an API error, never a grade.
  - Karthik: the API must still check candidate edits against the task's editable allow-list before building `RunRequest.files`. The runner blocks config and test-path files but can't know which task files are editable.
  - Karthik: the contract has no "invalid request" code, so rejected requests use `SANDBOX_UNAVAILABLE` with a message starting `Rejected run request:`. Consider adding `INVALID_REQUEST` to `Unavailable['code']`.
  - Karthik: add `* text=auto eol=lf` (or at least `src/backend/seed_bank/** eol=lf`) to a `.gitattributes`, so seed digests match on Windows clones. `tsconfig.json` `include` lists only `runner/local`; `runner/*.ts` gets compiled today only because tests import it.
  - Known limitation (R3): candidate code shares the interpreter with the tests, so it can still read hidden test files at runtime and, by forcing exit code 0 as well, forge a consistent report. This is not production-grade isolation. `/out` is a bind mount without a size cap.
- Next: R4 (Featherless client). R3 hardening after the checkpoint.

## 2026-10-31 01:10 — R4 — Featherless client (`llm/featherless.ts`, Ports['chat'])
- Changed:
  - `src/backend/llm/featherless.ts`: the only module that calls Featherless.
    - `chat` matches `Ports['chat']` exactly.
    - Also exports `createFeatherlessClient(config, deps)`, `readFeatherlessConfig(env)`, `sharedFeatherlessClient()`, `FairLimiter`, `validateChat`, `FeatherlessError`, `DEFAULT_MODELS` and `DEFAULT_MODEL_ALIAS`.
  - `src/backend/llm/smoke.ts`: manual one-call smoke test.
  - `src/backend/tests/llm/featherless.test.ts`: 37 mocked tests.
  - Shared files, lines added only: a `llm:smoke` script in root and backend `package.json`.
- Design:
  - Native `fetch` against the OpenAI-compatible `/chat/completions`. No SDK, so there's no new dependency or lockfile change, and exactly one retry layer. The transport is injectable.
  - Explicit `User-Agent: torquecode-backend/0.1`. Measured: Featherless returns 404 on `GET /v1/models/{id}` for Node's default `node` UA (and `undici`) but 200 for a custom UA. This was found by the real smoke test.
  - Model selection is by purpose. `FEATHERLESS_MODEL_GENERATION` defaults to `Qwen/Qwen3-Coder-30B-A3B-Instruct`; `FEATHERLESS_MODEL_ASSISTANT` defaults to `Qwen/Qwen3-30B-A3B-Instruct-2507`.
  - `ChatRequest.model` must be `'default'` or exactly the configured ID for that purpose. Anything else, including the other purpose's model, is rejected, so no unapproved or expensive model can be selected.
  - One process-wide queue: a weighted semaphore.
    - Admission needs in-flight < `FEATHERLESS_MAX_CONCURRENCY` (default 2) **and** units in use + model cost ≤ plan concurrency.
    - Plan (`/v1/plan`) and per-model cost (`GET /v1/models/{id}`, about 1 KB, never the 8 MB catalog) are read lazily on first use, with a 5 s timeout, and cached. Failures fall back to 1 request in flight and are retried after 5 minutes. Unknown model cost counts as 4 units.
    - Bounded queue (`FEATHERLESS_MAX_QUEUE`, default 16): when full, the call is rejected immediately with `queue_full`. Waiting longer than 30 s gives `queue_timeout`.
    - One FIFO per purpose, served round-robin with head-of-line blocking, so neither purpose can starve the other.
    - Queued requests can be cancelled. Capacity is released after success, error, timeout and abort.
  - Request rules:
    - Purpose, role, message count (≤ 50), input characters (≤ 48,000) and `max_tokens` are validated (generation ≤ 4096, assistant ≤ 1024).
    - Request timeout is `FEATHERLESS_TIMEOUT_MS` (default 60 s) and is not retried, to protect credits. `Context.signal` is propagated, and an abort rethrows its reason like the runner does.
    - Retries: only 429, 5xx (except 501) and network errors, at most 3 attempts in total. Backoff is 500 ms × 2^n with jitter and honours `Retry-After`; a value above 20 s means no retry. The slot is held while backing off.
    - 400, 401, 403 and 404 are never retried. An empty or invalid reply is `malformed_response`; no reply is ever fabricated.
    - No key means `not_configured`, and the provider isn't contacted. The env is read on first call, so a missing key never blocks backend startup.
  - Failures return `{ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: 'LLM unavailable: <category>' }`. The message is generic; no provider text reaches the API.
  - Logs are one JSON line per call: `request_id`, purpose, model, outcome or category, attempts, queue wait, latency and token counts. They never contain the key, prompts, code or replies; a test checks this.
- Verification (Windows 11, Node 24.19.0, pnpm 11.25.0):
  - `pnpm typecheck` OK. `tsc` build emits `dist/llm/featherless.js` and `dist/llm/smoke.js`.
  - `pnpm build` then fails at `mkdir -p` because Windows `cmd.exe` can't run that part of the build script. This is unchanged from main.
  - `vitest run tests/llm`: **37 passed, 0 failed, 0 skipped**. It covers all 20 required scenarios plus a compile-time `Ports['chat']` assignment and the smoke command.
  - Mutation check: removing the round-robin, ignoring unit weights, or retrying 401 each makes the matching test fail.
  - Full backend suite: 116 passed, 12 failed, 9 skipped (PostgreSQL). Clean `origin/main` on this machine gives the identical 12 failures (79 passed): 11 are the CRLF seed-digest issue and 1 is POSIX `process.kill(-pid)`. R4 adds no failures, and the R2 Docker runner is still 32/32.
  - Real smoke test (`pnpm llm:smoke`, 1 chat call): `{"ok":true,"model":"Qwen/Qwen3-30B-A3B-Instruct-2507","latency_ms":2794,"reply_preview":"ready"}`, with prompt 15 / completion 2 tokens. The live plan read gave `plan_concurrency 100`, so `max_in_flight` is 2. Both models report `concurrency_cost 1` and `available_on_current_plan true`.
- Seams/contracts affected: none changed. Uses `ChatRequest`, `Context` and `SeamResult` from `contracts/internal.ts`.
- Teammates should know:
  - Karthik, wiring (I don't edit `api/`): in `api/wiring.ts`, add
    `import { chat } from '../llm/featherless.js';`
    and include `chat` in the object returned by `createWiredPorts` (for example `..., buildReport, chat, nextHint: ...`).
  - Generation calls `ports.chat({ purpose: 'generation', model: 'default', max_tokens, messages }, { signal })`. Treat `unavailable` as "LLM down, use the seed bank".
  - Karthik: `Unavailable['code']` has no LLM code, so failures use `SANDBOX_UNAVAILABLE` (your 503 path). Consider adding `LLM_UNAVAILABLE` and `INVALID_REQUEST`.
  - Karthik/Pranav: please add `FEATHERLESS_MODEL_GENERATION=`, `FEATHERLESS_MODEL_ASSISTANT=`, `FEATHERLESS_MAX_CONCURRENCY=`, `FEATHERLESS_MAX_QUEUE=` and `FEATHERLESS_TIMEOUT_MS=` to `.env.example`. `FEATHERLESS_API_KEY=` is already there.
  - Karthik: `tsconfig.json` `include` lists neither `llm/**` nor `runner/*.ts`. They're type-checked and built only because tests import them; adding `"llm/**/*.ts", "runner/**/*.ts"` makes that explicit. The `build` script's `mkdir -p` and `cp` don't run on Windows.
  - TODO(OPEN-Q9): the team still has to freeze the model choice and record it in BACKEND_DECISIONS.md.
- Known limitations:
  - The queue is per process; a second backend process would have its own.
  - Plan and model metadata calls go through their own 5 s timeout, not the queue.
  - No streaming. The credit balance isn't tracked per call (only token counts are logged).
- Next: R5 (hints + guarded assistant on top of `chat`), then R3 hardening.
