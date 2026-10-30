# Karthik — next prompts after the 00:30 checkpoint (Codex)

> Checkpoint was met: full API flow passes end to end (login → portfolio → quiz → assessment → run → hint → submit → report).
> Use the **Session opener** and **Ship prompt** from `docs/prompts/KARTHIK_Codex_Prompts.md` §2–§3 as before.
> Do these in order. One task per branch, small commits, push at least every 30 minutes. Pranav's assistant reviews and merges.
> PR base is always `vudigapranav/HFT26-TEAM-36` `main`, never cbitosc.

**Product decisions still OPEN (Q1, Q3, Q4).** Until Pranav says otherwise, build to the context §15 recommendations:
- Q1: Novice 15 min, Adept 20, Master 25. The next tier unlocks when all hidden tests of the current tier pass, and the candidate clicks Upgrade.
- Q3: no demotion.
- Q4: AI score only for Adept and Master.

Keep `TODO(OPEN-Qn)` markers so these are easy to change.

---

## K9 — wiring + housekeeping (00:40 → 01:00) ⚡ do first

```
Task K9. Branch karthik/k9-wiring from origin/main.
1. Wire Rithvik's Docker runner: in api/wiring.ts (or where Ports are built) use
   runTests: process.env.RUNNER === 'docker' ? runTestsInDocker : runSeedTests
   (import { runTestsInDocker } from '../runner/dockerRunner.js'). When RUNNER=docker, set AssessmentState.runner to
   'isolated' and ALLOW candidate-edited files for editable paths; keep the stand-in's refusal when RUNNER is not docker.
   A runner result of kind 'unavailable' must become an API error (503), never a grade.
2. Before building RunRequest.files, enforce the task's editable allow-list: reject any path that isn't an editable
   file of that task (Rithvik's runner can't know which files are editable).
3. Add .gitattributes at the repo root: "* text=auto eol=lf" (seed digests break on Windows checkouts otherwise).
4. .env.example: add FEATHERLESS_MODEL_GENERATION= and FEATHERLESS_MODEL_ASSISTANT= (empty values).
5. docs/BACKEND_DECISIONS.md: record the Featherless models from docs/status/rithvik.md
   (generation: Qwen/Qwen3-Coder-30B-A3B-Instruct, assistant: Qwen/Qwen3-30B-A3B-Instruct-2507 — confirm with Rithvik),
   and that RUNNER=docker is the demo mode.
6. tsconfig.json include: add "runner/**/*.ts", "intake/**/*.ts", "scoring/**/*.ts", "llm/**/*.ts", "generation/**/*.ts"
   so they typecheck even without a test importing them.
7. Optional: add 'INVALID_REQUEST' to Unavailable['code'] and use it for rejected run requests (tell Rithvik).
Tests: the assessment flow test runs with the stand-in; add one test (skipped without Docker) that runs edited
candidate code through the Docker runner via the API. Then Ship.
```

---

## K10 — multi-tier assessment flow (01:00 → 02:00)

```
Task K10. Branch karthik/k10-tiers from origin/main.
Turn the single-seed assessment into the 3-tier flow (context §5 + §15 Q1/Q3 recommendations above).
- An assessment holds one task per tier: novice, adept, master. Source for now: the seed bank (Aryan is adding
  adept + master seed tasks; load whatever exists, and if a tier has no task, mark it unavailable instead of crashing).
- Server-side timer: 60 min total; per-tier budgets 15/20/25 (TODO(OPEN-Q1)); auto-submit at expiry.
- Tier state machine: novice_active → adept_unlocked (all novice hidden tests pass) → adept_active (candidate calls
  POST /assessments/:id/tier/upgrade) → master_unlocked → master_active → finished. No demotion (TODO(OPEN-Q3)).
  Log tier_unlocked / tier_upgraded events.
- Hints and the assistant are only allowed in adept/master (PS). The novice hint endpoint must refuse.
- GET task and status return the current tier's task and which tiers are unlocked.
- Report covers every attempted tier; calculateAie runs only for adept/master tasks (TODO(OPEN-Q4)).
- Add the endpoint POST /assessments/:id/assistant wired to Ports.assistantReply (Rithvik implements it in R5;
  until then it returns 503 'assistant not available'). Pass ONLY public task data + current files + visible failures.
Tests: unlock only after all novice hidden tests pass; upgrade refused before unlock; novice hint refused;
timer expiry auto-submits; report includes all attempted tiers. Then Ship.
```

---

## K5 — validation engine (02:00 → 03:30)

```
Task K5. Branch karthik/k5-validation from origin/main.
Implement Ports.validateTask in src/backend/generation/validate.ts — deterministic gates only (context §10.2 B3),
each gate → { gate, status: pass|fail, reason } in the ValidationReceipt:
- schema: task + files + tests complete and well-formed
- topics: task.dsa_topics ⊆ claimed_topics; static scan of the reference (src/backend/tools/topic_scan.py, Python ast,
  JSON in/out, never import/eval candidate code) flags constructs from unclaimed topics (e.g. heapq when heap isn't claimed)
- imports: only allow-listed modules (tools/import_check.py)
- reference: reference passes ALL tests, 3 runs in a row (through Ports.runTests — the Docker runner)
- starter: f2p_ids fail and p2p_ids pass on the starter; no syntax errors
- leakage: starter not too similar to the reference (normalized token similarity threshold); hints contain no
  solution code (long code blocks or high similarity to the reference)
- differential + performance: implement after the rest; Master tasks only for performance
Run validateTask over every seed-bank task in a test (all must pass), plus deliberately broken copies that must be
rejected with clear reasons. Expose receipts so the frontend can show them ("Reference passes 5/5 ✓ …"). Then Ship.
```

---

## K6 — generation pipeline (03:30 → 06:00, needs Rithvik's R4 `chat`)

```
Task K6. Branch karthik/k6-generation from origin/main.
Implement Ports.generateAssessment in src/backend/generation/generate.ts (context §10.2 B2):
- Prompts as versioned files in generation/prompts/ (never inline strings). Portfolio text is untrusted: delimit it.
- Staged calls through Ports.chat ONLY (Rithvik's Featherless client): spec → reference + brute force → test inputs.
  Model output uses tagged sections <file path="...">...</file> plus a small JSON header; parse defensively.
- Expected outputs are computed by RUNNING the reference (never written by the LLM).
- Starter derived deterministically from the reference: tools/mutate.py (bug injection: off-by-one, flipped comparison,
  missing edge case) for bug-fix tasks; tools/stub.py (function-body stubs) for feature tasks.
- Hint ladder (3 levels) generated, then checked by the leakage gate.
- validateTask every candidate task; retry up to 3 times feeding back the failing gate's reason; then fall back to the
  seed bank for that tier (re-skinned to the candidate's domain only if it still validates).
- Progress callback per tier/stage so the frontend progress screen can show validation receipts live.
- Generation runs as a background job; POST /assessments returns immediately and status shows progress.
Tests with Ports.chat mocked: happy path, unparseable output → retry → seed fallback, topic-bound violation rejected.
One manual script `pnpm gen:smoke` that runs a real generation for tests/fixtures/portfolios/normal-web.json. Then Ship.
```

---

## K8 — integration (rolling, until the 12:00 feature freeze)

- Review Aryan's seed tasks: all must pass `validateTask`.
- Pair with Akshit and Pranav on the frontend's API calls; keep `src/backend/README.md` endpoint table current.
- With Rithvik (R6): one-command start on the demo machine, with Postgres, Docker runner image and a pre-generated
  demo assessment.
- After 12:00, bug fixes only.
