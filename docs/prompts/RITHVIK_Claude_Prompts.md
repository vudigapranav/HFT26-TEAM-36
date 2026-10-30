# Rithvik — Claude Code prompts (sandbox + Featherless) · checkpoint 00:30

> Tool: **Claude Code**. `CLAUDE.md` loads the rules automatically, and `/start` and `/ship` are built in.
> Paste the prompts below **in order**. Times are IST targets.

---

## 0. The 00:30 checkpoint — what the team will look at

Karthik's backend runs the flow: portfolio → quiz → assessment with seed task 1 → Run/Submit → hint. **Your part of the demo:**

1. **Run/Submit executes inside your Docker sandbox** (`RUNNER=docker`): no network, limits enforced, per-test results.
2. Infinite loops, fork bombs and huge output are all stopped safely. Show one live.
3. **One real Featherless call** through your client, plus the plan limits you read from `/v1/plan`.
4. **Hint** endpoint serves level 1 from the seed task's ladder through your `nextHint`.

**Dependency:** you write sandbox *code* after Karthik's contracts PR (K1a) is merged, around 23:25. Before that, do the language-free prep in Prompt R0.

---

## 1. One-time setup (terminal, 2 min)

```bash
# Pranav must first merge "pranav/setup-kit" into main.
git checkout main && git pull
git config core.hooksPath .githooks
docker info >/dev/null && echo "docker ok"     # Docker Desktop must be running
cp -n .env.example .env 2>/dev/null; echo "FEATHERLESS_API_KEY=<paste-key-here>" >> .env   # .env is git-ignored
claude
```

**Never paste the key into a prompt or a committed file.** It goes only in `.env`.

---

## 2. Prompt R0 — sandbox prep + Featherless smoke test (22:50 → 23:25, no backend code yet)

```
I'm Rithvik. This is pre-K0 prep that Pranav approved: no backend language code yet, only the runner image and
shell checks, so it's allowed while BACKEND_DECISIONS.md is pending.
Create branch rithvik/r1-sandbox-prep from origin/main.

Part A — sandbox (task R1):
1. Check Docker: `docker info`, CPU architecture (`uname -m`). Note results.
2. Create src/backend/runner/images/python/Dockerfile: python:3.12-slim base, pytest pinned to an exact version,
   a non-root user (uid 10001), WORKDIR /work, ENV PYTHONDONTWRITEBYTECODE=1, nothing else installed.
   Must build on Apple Silicon (arm64) and x86.
3. Build it as torquecode-runner-python:dev.
4. Prove isolation with a manual docker run of a tiny pytest file mounted read-only at /work, using:
   --rm --network none --memory 256m --cpus 1 --pids-limit 64 --read-only --tmpfs /tmp --user 10001
   and a separate writable mount /out for the JUnit XML. Verify: tests run; `curl`/socket to the internet fails;
   writing outside /tmp and /out fails.
5. Prove the dangerous cases are contained: infinite loop (killed by a wall-clock timeout using --name + docker kill),
   fork bomb (stopped by --pids-limit), huge print (output capped by the caller to 64 KB).
6. Write the exact working docker run command and the results into docs/status/rithvik.md.

Part B — Featherless smoke test (no code, shell only; never print the key — read it from .env):
1. curl GET https://api.featherless.ai/v1/plan with the key → record max_context_length and concurrency.
2. curl GET https://api.featherless.ai/v1/models → pick 2–3 candidate models of 34B or smaller (record exact IDs).
3. One small chat completion per candidate via curl → record latency and whether it followed a "reply only JSON" instruction.
4. Record everything (no key!) in docs/status/rithvik.md under "Featherless".

Then /ship.
```

---

## 3. Prompt R2 — Docker `runTests` (after K1a merges, ~23:25 → 00:00)

```
/start R2
```
Then paste:
```
Implement the runTests seam for real in src/backend/runner/dockerRunner.ts, matching the exact type in
src/backend/contracts/seams.ts and the RunResult schema in contracts/schemas.ts. Use the stack in BACKEND_DECISIONS.md.

Requirements:
- Write candidate files + test files to a fresh temp dir; mount it read-only at /work; a separate writable /out for JUnit XML.
- docker run flags exactly as recorded in docs/status/rithvik.md (no network, memory/CPU/pids limits, read-only root,
  tmpfs /tmp, non-root user, --rm, unique --name).
- Command inside: python -m pytest -q -p no:cacheprovider --junitxml=/out/results.xml <selected test files>.
- mode "run" = visible tests only; "submit" = visible + hidden. Hidden tests return status only, never their bodies.
- Wall-clock timeout from Limits: on timeout `docker kill` the container and mark tests "timeout".
- Cap stdout and stderr at 64 KB each. Never trust the exit code alone — parse JUnit XML per test id.
- Always clean up the temp dir and the container, even on errors.
- Anti-tamper basics (R3, start here): copy test files in fresh on every run and also write an empty conftest.py
  over any candidate conftest.py; only paths listed as editable in the task may come from the candidate.

Tests (in src/backend/tests/runner/): seed task 1 starter fails / reference passes (use
src/backend/seed_bank/novice-001.json if merged, else a small fixture of your own under tests/fixtures/runner/);
infinite loop → timeout; fork bomb → contained; huge print → capped; network access blocked;
a candidate file that deletes tests or calls sys.exit(0) at import still gets graded correctly.
Skip Docker tests cleanly (not fail) if Docker isn't running.

Do NOT edit src/backend/api/wiring.ts — note in your status entry: "dockerRunner ready for wiring (RUNNER=docker)".
Then /ship.
```

---

## 4. Prompt R4 — Featherless client (00:00 → 00:20)

```
/start R4
```
Then paste:
```
Implement the llmChat seam in src/backend/llm/featherless.ts, matching contracts/seams.ts exactly.
This file is the ONLY place in the codebase that talks to Featherless.

- OpenAI Node SDK with baseURL https://api.featherless.ai/v1; key from env FEATHERLESS_API_KEY (never logged).
- Models from env FEATHERLESS_MODEL_GENERATION and FEATHERLESS_MODEL_ASSISTANT (use the IDs I recorded in
  docs/status/rithvik.md); purpose "generation" | "assistant" picks the model.
- ONE shared queue for all calls. On startup read GET /v1/plan and use its concurrency (fallback 1). Remember bigger
  models cost more concurrency units — keep in-flight requests within the plan.
- Retry HTTP 429 and 5xx with exponential backoff, max 3 tries; request timeout; clear typed errors.
- Log per call: purpose, model, latency, token counts, success/failure. No prompts, no key, no candidate code in logs.
- Unit tests with the HTTP layer mocked (no real network in tests): queue never exceeds concurrency, 429 retry works.
- A manual script `npm run llm:smoke` (add the script entry to src/backend/package.json — shared file, only add lines)
  that makes one real call and prints latency + reply.

I need these env names added to .env.example, but that file is Karthik's/Pranav's. Write
"please add FEATHERLESS_API_KEY=, FEATHERLESS_MODEL_GENERATION=, FEATHERLESS_MODEL_ASSISTANT= to .env.example"
under "Teammates should know" in my status entry instead of editing it.
Then /ship.
```

---

## 5. Prompt R5-lite — `nextHint` from the ladder (00:20 → 00:25, quick win for the demo)

```
/start R5
```
Then paste:
```
Checkpoint-only slice of R5: implement ONLY the nextHint seam in src/backend/llm/hints.ts, matching contracts/seams.ts.
Return level N (1..3) from the task's serverOnly hint ladder; clamp out-of-range levels; never return anything else
from serverOnly. No LLM call here. Tests for levels 1–3 and out-of-range.
The live guarded assistant (input guard, deterministic output guard, similarity check) comes after the checkpoint.
Note "hints.ts ready for wiring" in my status entry. Then /ship.
```

---

## 6. At 00:25 — checkpoint check (terminal)

```bash
git checkout main && git pull
cd src/backend && npm install
RUNNER=docker npm test -- e2e      # Karthik's checkpoint flow through your sandbox
npm run llm:smoke                   # one real Featherless call
```

## 7. After the checkpoint (next prompts will come then)

R3 full anti-tamper hardening → R5 guarded assistant (input/output guards, similarity to reference, 10 jailbreak tests) → R6 deployment on the demo machine.
