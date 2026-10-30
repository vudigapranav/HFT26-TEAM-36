# TorqueCode — pitch facts (for Aryan)

Only things merged on `main`, checked at **`main` @ `7313627`** (2026-10-31, after PR #25). Every number names the commit it comes from. If a fact isn't here, don't put it on a slide. Ask Pranav first.

**Not on main yet, so don't claim it as working:** the three-tier flow with Upgrade (K10), the assistant HTTP endpoint (K10), Adept/Master tasks (K7), the validation engine and live task generation (K5/K6), sandbox anti-tamper hardening (R3), demo-machine deployment (R6) and the frontend. Pitch these as "in progress" or roadmap.

---

## 1. Tests (measured by Pranav on `7313627`)

| Fact | Number | Source |
| :--- | :--- | :--- |
| TypeScript tests passing | **222 passed**, 28 skipped, 0 failed (17 files) | `pnpm test` on `7313627`, Node 26.10 |
| Python tests passing | **9 passed** | same run |
| Typecheck | clean | `pnpm typecheck` on `7313627` |
| Why 28 were skipped | PostgreSQL and Docker suites skip themselves when those services aren't available. Docker wasn't running on the machine used for this check. | same run |

Separately reported by teammates on their own machines (say "reported", not "we measured"):
- Docker runner suite: **32 passed, 0 failed** (Rithvik, `773e8a8`).
- Guarded assistant suite: **57 passed** (Rithvik, `a8b8a54`).
- PostgreSQL auth suite: **9/9 passed** on a real PostgreSQL (Karthik, `1a8d9c1`).

## 2. What the sandbox enforces (runner code on `7313627`; measurements from `37e14cd`)

Every Run/Submit is a fresh Docker container with:
- **No network** (`--network none`).
- **Memory, CPU and process limits** (`--memory`, `--memory-swap`, `--cpus`, `--pids-limit`). Seed task 1 uses 5 s, 128 MB, 1 CPU, 32 processes and 64 KB of output (`37e14cd`).
- **Read-only filesystem** except a small `noexec` `/tmp`; candidate code mounted read-only.
- **Non-root user** (`10001`), **all Linux capabilities dropped**, `no-new-privileges`.
- **Wall-clock timeout**, then the container is killed and removed.
- **Grading from per-test JUnit XML**, never from the exit code alone.

Hostile cases Rithvik ran (`37e14cd`, `773e8a8`):
- An infinite loop was killed at 5 s.
- A fork bomb was contained by the 32-process limit.
- About 20 MB of output was captured as exactly **65,536 bytes**.
- `sys.exit(0)`, `os._exit(0)`, a forged report or deleted tests still graded **0 passed**.
- Network, DNS and write probes were all blocked.

If Docker is down, the API returns **503 SANDBOX_UNAVAILABLE** and records no grade, instead of a fake 0 (finding 7, fixed and verified in `4fbaeee`).

## 3. Hidden tests never reach the browser (`7313627`)

- **Run** = visible tests only; **Submit** = visible + hidden.
- For hidden tests the browser gets **aggregates only**: no test code, names or expected output. All Submit stdout/stderr is discarded.
- Reference solutions and hint ladders are server-only. Every public response is built from explicit allow-lists and checked against the public contracts in tests.
- Candidates can only send their task's editable files; test, config, unknown and `../` paths are rejected before the sandbox runs.

## 4. Guarded assistant layers (modules merged in `a8b8a54`, PR #19; API endpoint still pending in K10)

1. **The model never sees** the reference solution or hidden tests, only the task, the candidate's current code, visible failures and the chat.
2. **Input guard:** catches extraction attempts (for example "ignore previous instructions", "write the whole function").
3. **Deterministic output guard:** limits code volume, blocks redefinitions of the task's functions, and checks similarity to the reference on the server when the reference is supplied.
4. **Everything is logged:** delivered replies → `assistant_message`; blocks → `assistant_blocked` (+ `extraction_flagged`); an LLM outage logs nothing.
5. **Hint ladder first:** pre-written hints (levels 1–3) are served without an LLM call.

**10/10** canned jailbreak attempts are blocked in the test suite (`a8b8a54`, fixture `src/backend/tests/fixtures/llm/jailbreaks.json`). **Be honest:** they're blocked at the input layer because they're known patterns, and no live-model measurement exists yet (Rithvik's status, `a8b8a54`). Don't say "unjailbreakable".

## 5. AI efficiency score: computed from logs only (`7313627`)

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

## 7. Portfolio intake (`7313627`)

- Strict schema validation with field-level errors; DSA topics normalized to a **fixed 19-topic list** (typos and synonyms handled).
- Prompt-injection text in a portfolio is **flagged and treated as plain text**: try `docs/demo/demo-portfolio-injection.json`.
- The onboarding quiz's focus lane **can never include a topic the portfolio didn't claim** (randomized test, merged in PR #7).

## 8. Honest limitations (say these if asked)

- It checks skills consistent with the portfolio, not who wrote the listed projects.
- It can't detect AI on a second device; it only logs integrity signals.
- The sandbox is hackathon-grade: candidate code currently shares the test interpreter (R3 is hardening this).
- Assistant guards are heuristics; hints can be wrong but are never used for grading.
