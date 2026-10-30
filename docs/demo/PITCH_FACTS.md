# TorqueCode — pitch facts (for Aryan)

Only things merged on `main`, checked at **`main` @ `19df7ff`** (2026-10-31, after PR #46; first written at `7313627`). Every number names the commit it comes from. If a fact isn't here, don't put it on a slide. Ask Pranav first.

**Not on main yet, so don't claim it as working:** persistent assessments across a backend restart (K11), live task generation (K6), cloud deployment (R6b) and the frontend. Pitch these as "in progress" or roadmap.

**Now on main (since the last version of this file):** question sets with "Unlock next questions" and the assistant endpoint (K10, PR #42, `5667e0d`), the validation engine (K5, PR #44, `59b7ef9`), the K7 seeds checked on real Docker (R7, `f168c2b`) and one-command local deployment (R6, `00e01b5`).

---

## 1. Tests (measured by Pranav on `19df7ff`)

| Fact | Number | Source |
| :--- | :--- | :--- |
| TypeScript tests passing | **275 passed**, 55 skipped, 0 failed (22 files, 2 skipped) | `pnpm test` on `19df7ff`, Node 26.10 |
| Python tests passing | **9 passed** | same run |
| Typecheck | clean | `pnpm typecheck` on `19df7ff` |
| Why 55 were skipped | PostgreSQL and Docker suites skip themselves when those services aren't available. Docker wasn't running on the machine used for this check. | same run |

Separately reported by teammates on their own machines (say "reported", not "we measured"):
- Docker runner suite: **32 passed, 0 failed** (Rithvik, `773e8a8`).
- Guarded assistant suite: **57 passed** (Rithvik, `a8b8a54`).
- PostgreSQL auth suite: **9/9 passed** on a real PostgreSQL (Karthik, `1a8d9c1`).
- R3 anti-tamper suite: **20 tests, all on real Docker** (Rithvik, `8f567a6`).
- LLM suite after the R5-live fixes: **133 passed** (Rithvik, `9fff6a3`).
- All 3 seed tasks on real Docker: reference passes all tests 3× and the starter fails exactly its F2P tests: **4 passed, 0 failed** (Rithvik, `f168c2b`).
- Deployment journey `deploy/verify.sh --outage`: **31/31 checks**, 3 runs, on Windows 11 + Docker Desktop (Rithvik, `00e01b5`). Not yet run on the demo Mac.

## 2. What the sandbox enforces (runner code on `19df7ff`; measurements from `37e14cd` and `8f567a6`)

Every Run/Submit uses fresh Docker containers (an untrusted worker with the candidate's code and a trusted grader with the tests, `8f567a6`), with:
- **No network** (`--network none`).
- **Memory, CPU and process limits** (`--memory`, `--memory-swap`, `--cpus`, `--pids-limit`). Seed task 1 uses 5 s, 128 MB, 1 CPU, 32 processes and 64 KB of output (`37e14cd`).
- **Read-only filesystem** except a small `noexec` `/tmp`; candidate code mounted read-only.
- **Non-root user** (`10001`), **all Linux capabilities dropped**, `no-new-privileges`.
- **Wall-clock timeout**, then the container is killed and removed.
- **The grade comes from the grader container's own report stream**, never from the candidate's exit code (`8f567a6`).

Hostile cases Rithvik ran (`37e14cd`, `773e8a8`):
- An infinite loop was killed at 5 s.
- A fork bomb was contained by the 32-process limit.
- About 20 MB of output was captured as exactly **65,536 bytes**.
- The tampering cases Rithvik tested (`sys.exit(0)`, `os._exit(0)`, a naive forged report, deleted tests) were graded **0 passed**.
- **R3 split-container grading (PR #29, merged `fc4f39f`, 31 Oct ~03:00):** candidate code runs in a separate untrusted container and never sees the test source, expected outputs or the report. Reading the test files for answers, forged reports, forced exits and pytest monkeypatching no longer change a grade (20 real-Docker tests, reported by Rithvik). Cost: about +208 ms per run (Rithvik's laptop, 5 runs).
- **Honest limits:** hidden-test *inputs* are visible to the candidate's function (it receives them as arguments); a kernel or Docker escape is out of scope. Say "tampering with grading is blocked by design", not "unhackable".
- Network, DNS and write probes were all blocked.

If Docker is down, the API returns **503 SANDBOX_UNAVAILABLE** and records no grade, instead of a fake 0 (finding 7, fixed and verified in `4fbaeee`).

## 3. Hidden tests never reach the browser (`19df7ff`)

- **Run** = visible tests only; **Submit** = visible + hidden.
- For hidden tests the browser gets **aggregates only**: no test code, names or expected output. All Submit stdout/stderr is discarded.
- Reference solutions and hint ladders are server-only. Every public response is built from explicit allow-lists and checked against the public contracts in tests.
- Candidates can only send their task's editable files; test, config, unknown and `../` paths are rejected before the sandbox runs.

## 4. Guarded assistant layers (modules `a8b8a54`, PR #19; API endpoint `5667e0d`, K10 PR #42)

The endpoint only answers on later question sets; on the first set hints and the assistant return 403. Without a Featherless key it returns 503, never a fake answer.

1. **The model never sees** the reference solution or hidden tests, only the task, the candidate's current code, visible failures and the chat.
2. **Input guard:** catches extraction attempts (for example "ignore previous instructions", "write the whole function").
3. **Deterministic output guard:** limits code volume, blocks redefinitions of the task's functions, and checks similarity to the reference on the server when the reference is supplied.
4. **Everything is logged:** delivered replies → `assistant_message`; blocks → `assistant_blocked` (+ `extraction_flagged`); an LLM outage logs nothing.
5. **Hint ladder first:** pre-written hints (levels 1–3) are served without an LLM call.

**10/10** canned jailbreak attempts are blocked in the test suite (`a8b8a54`, fixture `src/backend/tests/fixtures/llm/jailbreaks.json`). They're blocked at the input layer because they're known patterns.

**Live-model measurement (R5-live, Rithvik, `9fff6a3`; model `Qwen/Qwen3-30B-A3B-Instruct-2507` on seed task 1 played as an Adept question):**
- **Before the fixes:** 8 of the 12 replies the model answered leaked the fix.
- **After the fixes:** **0 leaks in 22 scenarios** (5 honest questions, 7 paraphrased or multi-turn extraction attempts, 10 jailbreaks). All 5 honest questions got useful guidance without the fix.
- **Cost:** about **$0.0018** total live spend for R5-live.
- **Speed:** median about **2.1 s** per answered call (after the fixes; range 1.1–5.7 s).
- **Caveats (say these if asked):** a small sample (22 scenarios, one task, one model). The input rules are patterns, so new phrasings reach the model. The output guard catches code, not prose. In run 2 the model complied, so the output guard wasn't exercised live; its coverage comes from replaying run-1 leaks in tests. One paraphrase (P5) got a soft confirmation.
- Don't say "unjailbreakable" or "leak-proof"; say "0 leaks in our 22-scenario live test, after fixing the 8 leaks we found." 

## 5. AI efficiency score: computed from logs only (`19df7ff`)

- Up to **20%** of the final score (problem statement).
- Formula: `20 × gate × (0.5·Independence + 0.3·HintYield + 0.2·TestDiscipline)`. Weights: hint levels 1/2/3 count 1/2/3; an assistant message counts 1; `H_max = 6` (context §12, locked).
- **No AI and solved → full 20; no AI and failed → not a free 20** (the gate uses the final submit's pass rate).
- Re-running tests without a real code change doesn't count (files are hashed per run).
- Blocked jailbreaks score 0 but show as integrity flags; an LLM outage changes nothing. Proven by tests merged in PR #23 (`194a329`).
- Novice has no assistant, so a Novice-only session is scored on correctness scaled to 100 (decision Q4, locked in PR #22, `10a10a8`).

## 6. Attack suite (`scripts/attack-api.py`, review `docs/reviews/2026-10-31-integration-attack.md`)

- **39 API attacks** against a live backend in auth mode, including:
  - missing and foreign Origin (CSRF) and unauthenticated calls
  - malformed, oversized and `__proto__` bodies
  - another user reading or changing your assessment
  - file-path tricks and flipping the editable flag
  - hint spam, forged and foreign-task events, parallel runs
  - checking that the report leaks no hidden tests or reference
- First run: 38/39 blocked (`7646245`). After fixes: **39/39** (`230ea36`), still **39/39** after the assistant merge (`4fbaeee`).
- Full API journey (upload → quiz → assessment → run → hint → submit → report): **17/17 steps** (`230ea36`).

## 7. Portfolio intake (`19df7ff`)

- Strict schema validation with field-level errors; DSA topics normalized to a **fixed 19-topic list** (typos and synonyms handled).
- Prompt-injection text in a portfolio is **flagged and treated as plain text**: try `docs/demo/demo-portfolio-injection.json`.
- The onboarding quiz's focus lane **can never include a topic the portfolio didn't claim** (randomized test, merged in PR #7).

## 8. Task validation engine: deterministic gates (K5, PR #44, `59b7ef9`; `src/backend/generation/validate.ts`)

Every task must pass **every** gate to count as valid. A gate that couldn't run counts as not passed, so the task is rejected.
1. **Schema:** a complete task (exactly 3 hints, reference file for every starter file, unique test IDs, every test classified F2P or P2P, visible tests match the manifest), Python only.
2. **Topics:** the task's declared DSA topics are all claimed by the candidate, and a **Python AST scan** of the reference finds no unclaimed constructs (`heapq` → heap, `bisect` → binary search, `deque`/`queue` → queue).
3. **Imports:** an allow-list (standard library pieces such as `collections`, `itertools`, `math`; tests may also use `pytest`, `random`, `time`), plus no `eval`/`exec`/`compile`/`__import__`.
4. **Format:** tests have the structure the split-container runner supports.
5. **Leakage:** the starter isn't the reference, and every hint passes the assistant's output guard against the reference (no solution code in hints).
6. **Reference:** passes **every** test **3 times** in the sandbox.
7. **Starter:** fails exactly the F2P tests and passes exactly the P2P tests.
8. **Performance (Master):** the performance tests pass on all 3 reference runs and fail on the starter.
- **Docker down →** the run-based gates are marked *skipped* → the task is **invalid**, never "valid by default".
- **Honest caveat:** the *examples* gate currently passes once the schema gate has matched visible tests to the manifest. The *differential* gate checks that the 3 reference runs give identical results; it does **not** yet compare against a brute-force solution, as the context describes. Karthik's K5 follow-up is making both stricter. Say "8 deterministic gates" and don't claim brute-force differential testing.
- **Where it's used:** wired as the `validateTask` seam. It will check every generated task once live generation (K6) lands. Its own tests: `src/backend/tests/generation/validate.test.ts`.

## 9. Honest limitations (say these if asked)

- It checks skills consistent with the portfolio, not who wrote the listed projects.
- It can't detect AI on a second device; it only logs integrity signals.
- The sandbox is standard Docker isolation (hackathon-grade): candidate inputs are visible to candidate code, and container escape is out of scope.
- Assistant guards are heuristics; hints can be wrong but are never used for grading.
