# Aryan — ChatGPT kit (seed tasks K7 + pitch)

You don't need a terminal or git. You work in **one ChatGPT chat**, and send the zips/files ChatGPT makes to **Pranav**. Pranav's Claude commits them on an `aryan/...` branch, re-tests them and merges.

**Your two jobs, in this order**
1. **K7 — two seed tasks (Adept + Master).** This is urgent: without them the tier upgrade has nothing to show. Target: both sent to Pranav by **04:00**.
2. **Pitch** — PPT outline, slides content and a 3-minute script, using only the facts in §5 below.

---

## 1. Files to upload to ChatGPT (from `ARYAN_kit.zip`, which Pranav sends you)

Upload all of these in the first message:
- `TorqueCode_Context.md` — what we're building (single source of truth)
- `TorqueCode_Backend_Plan.md` — who owns what
- `BACKEND_DECISIONS.md` — stack and rules
- `README.md` — current solution summary
- `seed_template/` files — the existing Novice seed task, the exact format you must copy:
  `task.json`, `hints.json`, `starter/app/summary.py`, `reference/app/summary.py`, `tests/test_visible.py`, `tests/test_hidden.py`

---

## 2. Prompt 0 — paste first (with the files attached)

```
You are helping Aryan from team PAARK (CBIT Hacktoberfest 2026, 24-hour hackathon) on TorqueCode, a portfolio-driven adaptive coding assessment platform.
The attached TorqueCode_Context.md is the single source of truth. Read it fully, plus the backend plan, BACKEND_DECISIONS.md and README.md.
Rules you must follow:
- Labels: build [PS]/[LOCKED], follow [RECOMMENDED], never guess [OPEN], never implement [FUTURE SCOPE].
- Grading is deterministic tests only; an LLM never judges correctness.
- Reference solutions, hidden tests and hints are server-only.
- Never invent features, numbers or results. If you didn't run it, say so.
- Original work only (written during the hackathon); stdlib Python 3.13 + pytest only.
My jobs: (1) K7 — write two hand-verified seed tasks (Adept + Master) in exactly the format of the attached seed_template (the existing Novice task "seed-novice-request-summary"); (2) the pitch deck and script.
First, reply with: a 5-line summary of TorqueCode, the 3 tiers and what each needs, and the exact file layout + task.json fields of the seed template. Nothing else yet.
```

---

## 3. Prompt A — Adept seed task

```
Write seed task 2 (Adept). Copy the seed_template layout exactly:
adept_event_dedupe/ with task.json, hints.json, starter/app/..., reference/app/..., tests/test_visible.py, tests/test_hidden.py.

Requirements:
- task.json: task_id "seed-adept-event-dedupe", tier "adept", domain "backend", language "python", task_type "feature", source "seed_bank",
  dsa_topics ["arrays","hashing"], same "limits" object as the template, f2p_ids and p2p_ids in the template's "tests/test_x.py::test_name" format.
- A small realistic backend service split across 3 files: app/models.py (a dataclass Event with user_id, event_id, ts), app/store.py, app/service.py.
  The candidate must implement ONE feature that touches 2 of the files: deduplicate events by event_id (keep the earliest ts) and return per-user counts sorted by user_id.
- Reference = complete working code. Starter = the reference with ONLY the feature stubbed (functions raise NotImplementedError); every other line identical.
- Only stdlib; no collections.Counter, heapq, bisect, sorting tricks beyond sorted() on keys; dicts/sets are fine (hashing is claimed).
- statement_md: realistic, says which files are editable, gives 2 examples whose outputs exactly match the reference.
- 3–4 visible tests, 4–6 hidden tests (edge cases: empty input, duplicate with later ts first, one user, many users). Some tests must pass on the starter too (p2p, e.g. models/store helpers that already work); the feature tests are f2p.
- hints.json: exactly 3 strings, nudge → where to look → which concept. No code, no line from the reference.

Then VERIFY with your Python tool (actually run it, don't simulate):
1. Copy reference/ + tests/ into a temp dir, run `python -m pytest -q` → every test passes. Repeat 3 times.
2. Copy starter/ + tests/ into a fresh temp dir, run pytest → every f2p id FAILS and every p2p id PASSES, no syntax/import errors.
3. Run the statement examples against the reference and confirm the outputs.
Paste both pytest outputs. If anything is off, fix and re-run. Finally give me a zip named adept_event_dedupe.zip containing the folder.
```

---

## 4. Prompt B — Master seed task

```
Write seed task 3 (Master), same layout: master_session_window/ (task.json, hints.json, starter/, reference/, tests/).

Requirements:
- task.json: task_id "seed-master-session-window", tier "master", domain "backend", task_type "bug_fix", dsa_topics ["arrays","sliding_window"],
  limits same as template but wall_time_ms 10000.
- Realistic multi-file code (3 files, e.g. app/parser.py, app/window.py, app/report.py): find the longest stretch of requests where at most K distinct
  error codes appear (classic sliding window), then format a report.
- The starter has exactly 2 bugs in 2 DIFFERENT files: (1) a correctness bug (e.g. off-by-one in the parser or report), (2) a performance bug that
  makes the window O(n^2) (e.g. recomputing distinct codes from scratch each step instead of maintaining counts).
- One hidden test runs n = 200000 inside the test with a generous margin: assert the reference finishes in < 2.0 s; the buggy O(n^2) version must take
  far longer (measure it: it should exceed 10 s or time out). Use a fixed seed for any random input. Never borderline.
- Only stdlib; dicts are fine; no heapq/bisect/deque tricks outside sliding_window/arrays.
- 3–4 visible tests, 4–6 hidden tests. Correctness-bug tests are f2p; the perf test is f2p; tests that already pass on the starter are p2p.
- hints.json: 3 strings (nudge → where to look → concept), no code.

VERIFY with your Python tool exactly like the Adept task (reference passes 3×; starter: f2p fail, p2p pass; examples match).
Also report the measured time of the perf test on reference and on starter. Paste outputs. Give me master_session_window.zip.
```

When both zips are ready: **send them to Pranav** with the pasted pytest outputs. Don't edit them by hand afterwards.

---

## 5. Facts you may use in the pitch (as of `main` @ 7313627, 31 Oct 02:10)

Only these. If ChatGPT wants a number that isn't here, leave a `[TBD]`.
- Backend: TypeScript (Fastify 5, strict), TypeBox shared contracts, PostgreSQL 16, Argon2id passwords + HttpOnly cookie sessions; Python 3.13 + pytest for candidate code.
- Sandbox (Docker): `--network none`, memory/CPU/process limits, read-only filesystem with small tmpfs, non-root user, all Linux capabilities dropped, timeout + kill, output cap. Results parsed per test ID from JUnit XML, never from the exit code alone. If Docker is down the API returns "sandbox unavailable" — it never invents a grade.
- Hidden tests, reference solutions and hint ladders never reach the browser; Submit output is discarded; only hidden pass/fail counts are returned.
- Guarded assistant (Adept/Master): the model never sees the reference; input guard (override/extraction/roleplay/encoding attempts); deterministic output guard (code-line limits, similarity to the reference checked server-side); blocks are logged as integrity flags.
- AI efficiency score (max 20 of 100): computed only from event logs — independence, hint yield, test discipline, gated by the final pass rate. No AI + solved = full 20; blocked extraction attempts score 0 and show as integrity flags.
- Portfolio intake: strict schema, 19-topic DSA taxonomy with typo/synonym normalization, domain detection (Web/ML/Security/Backend), prompt-injection text flagged.
- Quality: 222 automated tests passing on main (28 more need PostgreSQL/Docker and run on the team machines); a 39-check adversarial API attack suite passes; a 2,000-input fuzz test on portfolio intake.
- Tier rules: Novice 15 / Adept 20 / Master 25 min in one 60-minute session; next tier unlocks when all tests pass; upgrading is the candidate's choice; no demotion.
- Featherless models chosen by measurement: generation `Qwen3-Coder-30B-A3B-Instruct`, assistant `Qwen3-30B-A3B-Instruct-2507`.
- Still being built (don't present as done unless Pranav confirms): 3-tier flow + live assistant endpoint, Adept/Master tasks, live task generation + validation engine, anti-tamper hardening, deployment, frontend.
- Future scope (roadmap slide only): project-based assessments from the candidate's own repos; camera-based proctoring.

---

## 6. Prompt C — pitch deck content

```
Now the pitch. Using ONLY the facts section I paste below plus the context file (no invented numbers, users, judges' criteria or results),
write slide-by-slide content for a 9-slide deck, each with a title, 3–4 short bullets and a speaker note:
1 Title (TorqueCode — "Put your code under torque.", Team PAARK, TEAM-36)
2 Problem (static tests ignore background; AI makes portfolios unverifiable)
3 Solution in one line + the journey (portfolio → quiz → Novice → Adept → Master → report)
4 Live demo slide (placeholder steps)
5 How grading stays honest (deterministic tests, sandbox, hidden tests never leave the server, no LLM judging)
6 Guarded AI assistant + AI efficiency score (how it's computed from logs)
7 Architecture (frontend → core platform → AI engine → Featherless) + stack
8 Integrity, honest limitations and future scope (repo-based assessments, camera proctoring — roadmap only)
9 Team PAARK + roles + thank you
Mark anything not yet built as "in progress" exactly as the facts say.
FACTS:
<paste §5 here>
```

## 7. Prompt D — 3-minute script + judge Q&A

```
Write a 3-minute spoken pitch script for the deck (about 400 words, natural, two speakers: Pranav and Aryan),
then 10 likely judge questions with short honest answers (e.g. "Can't they just use ChatGPT on their phone?", "How do you stop the assistant leaking the answer?",
"What if the generated task is wrong?", "Why not let the LLM grade?", "How does it scale?"). Use only the facts; say "not yet" where true.
```

Send the deck text and script to Pranav for a fact-check before you build the final slides.
