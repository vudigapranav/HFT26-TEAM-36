# Rithvik — all remaining prompts (Claude Code)

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Rithvik.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**State:** R1–R5 + R3 anti-tamper + R5-live all merged (thank you). **Done since: JOB 1 (#39) and R6 (#40).** **Left (Pranav, 04:17): (a) runner-wide admission limit (small PR) → (b) JOB 5 K6 live generation on top of Karthik's K5 → (c) JOB 2b cloud VM + Vercel as soon as Pranav gives the VM → JOB 3 if time.** K5 is Karthik's again.

Use `/start <id>` before each job and `/ship` after it.

---

## JOB 0 — runner-wide admission limit (`/start R9`, ≤30 min)

```
Branch rithvik/r9-admission. In runner/dockerRunner.ts add a bounded, process-wide limit on simultaneous Docker runs (e.g. RUNNER_MAX_CONCURRENT, default 4) with a bounded FIFO queue; abort while waiting releases the slot; queue full → unavailable 'runner busy' (never a grade). Tests: parallel runs, saturation, abort while queued. Nothing else in this PR. Then /ship.
```

---

## JOB 1 — real-Docker check of the three seeds (`/start R7`) — ✅ DONE (#39)

```
Branch rithvik/k7-docker-check, tests only (+ your status file).
Add src/backend/tests/runner/seeds-docker.test.ts (describe.skipIf no Docker): for each seed in src/backend/seed_bank (novice_request_summary, adept_event_dedupe, master_session_window) run the REAL R3 runner, submit mode: reference 3× → every test passes; starter → exactly task.json f2p_ids fail and p2p_ids pass. Record timings (Master starter ≈ 2 s on a fast machine; must stay far below wall_time_ms) in docs/status/rithvik.md.
Expected (Pranav's local R3-harness simulation): adept reference 10/10, starter 7 fail / 3 pass; master reference 10/10, starter 5 fail / 5 pass; novice 5/5 and 2 fail / 3 pass.
If anything differs, report it in your status file — do NOT edit seed files (Karthik/Aryan own them).
Then /ship.
```

---

## JOB 2 — R6 deployment (`/start R6`) — ✅ merged (#40); still run `deploy/start.sh && deploy/verify.sh --outage` on the demo machine

```
Branch rithvik/r6-deploy. Only deploy/ (+ runner/ if needed, tests, your status file).
1. deploy/docker-compose.yml: postgres:16 (named volume + healthcheck); a one-shot migrate service (pnpm db:migrate); the backend (APP_MODE=auth, RUNNER=docker, AUTH_ORIGIN from env, access to the Docker socket for the runner, RUNNER_HARNESS_DIR correct). Build torquecode-runner-python:dev for the host architecture (Apple Silicon → arm64).
2. deploy/start.sh: check Docker is running → build the runner image → compose up → wait until /health shows runner_available:true → print the URL. deploy/stop.sh. deploy/reset-db.sh. deploy/README.md with exact steps. .env.example with EMPTY values only (FEATHERLESS_API_KEY, FEATHERLESS_MODEL_GENERATION, FEATHERLESS_MODEL_ASSISTANT, AUTH_ORIGIN, DATABASE_URL). Never commit .env.
3. Frontend on the same origin: if src/frontend exists, serve its dev server or built bundle and proxy /api → backend (strip /api, keep the Origin header); AUTH_ORIGIN must equal that origin. If the frontend isn't merged yet, leave a clearly marked slot and document it.
4. Prove it on the actual demo machine from a clean clone + clean browser: register → upload docs/demo/demo-portfolio.json → quiz → assessment → edit + Run + Submit on real Docker → (after K10) unlock + assistant → report. Write exact commands, timings and results in docs/status/rithvik.md.
5. Demo safety: never restart the backend mid-demo (assessments live in memory); one command to reset; check that a missing Featherless key only disables the assistant (503), never the rest.
6. Record a backup screen recording of the full flow and tell Pranav where it is.
Then /ship.
```

---

## JOB 2b — cloud VM + Vercel (`/start R6b`) ⚡ after R6 works locally

```
Pranav decided (CLAUDE.md "Deployment + ownership decision"): frontend on Vercel, backend + Docker sandbox + PostgreSQL on ONE cloud VM with Docker (not AWS). Branch rithvik/r6b-cloud. Only deploy/ (+ your status file).
1. deploy/cloud/: a guide + scripts for a fresh Ubuntu VM (DigitalOcean/Azure/GCP, 2–4 vCPU, 4–8 GB): install Docker, clone, deploy/start.sh in production mode, PostgreSQL bound to localhost only, a reverse proxy with automatic HTTPS (Caddy) in front of the backend, systemd (or compose restart policies) so it survives reboots, firewall: only 80/443 (+ SSH).
2. Production env: NODE_ENV=production (HTTPS-only cookies), AUTH_ORIGIN=https://<vercel-app>, TRUST_PROXY=true (Karthik adds it in K11), FEATHERLESS_* from the VM's own .env (never git), RUNNER=docker.
3. Vercel: src/frontend/vercel.json (coordinate with Akshit — it's his folder; send him the exact file) with a rewrite {"source": "/api/:path*", "destination": "https://<backend-host>/:path*"} so the browser stays same-origin; check that Origin and Set-Cookie pass through and that a Run (2–6 s) finishes within the proxy timeout.
4. Verify from a clean browser on the public Vercel URL: register → portfolio → quiz → Run/Submit on the VM's Docker → report; then deploy/verify.sh against the VM. Write steps + results in your status file.
Then /ship.
```

---

## JOB 3 — after R6b (`/start R8`), only if time remains

```
Pick whichever is most useful, in this order, and tell Pranav which you took:
a) Help Akshit integrate the frontend with the real backend on the demo machine (proxy, cookies, AUTH_ORIGIN, CORS-free same origin) — debugging only in deploy/ unless Akshit asks.
b) Warm-container / startup-time improvements in the runner if a Run takes > 3 s on the demo Mac (measure first; don't claim numbers you didn't measure).
c) Run pnpm llm:eval once more after K10 merges, against an adept and a master seed, with LLM_EVAL_CAP_USD=0.10; record results in your status file.
Then /ship.
```

---

## JOB 4 — K5 validation: **Karthik's** (Pranav, 04:17). Don't build it. Agree the task format with him; K6 calls his `validateTask`.

---

## JOB 5 — K6 live generation (`/start K6`) — generation pipeline (after K5)

```
Task K6. Branch rithvik/k6-generation from origin/main. Karthik builds validateTask (K5) in parallel: code against Ports.validateTask and use a stub in tests until his PR merges.
STRUCTURED TESTS (Pranav 04:17, from your audit): the model proposes data only — {entrypoint: "app.module:function", cases: [{args: [...], kwargs?: {...}}], visibility per case} — and a FIXED trusted template in generation/ renders the pytest files (plain-data calls, expected values computed by running the reference). Never accept LLM-written Python test files. Mark generated task statements as untrusted in the assistant prompt (llm/assistant.ts: drop the "(trusted)" label for task text; add an injection test).
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
One manual script `pnpm gen:smoke` that runs a real generation for tests/fixtures/portfolios/normal-web.json. Then /ship.

UPDATES (03:20):
- Generated tests MUST follow the R3 harness format (plain-data arguments/returns, builtin exceptions only; no objects, no subprocess, no servers). Put this rule in the generation prompt; the K5 "format" gate enforces it.
- One task per tier for now (the question-set code supports N).
- If generation fails or Featherless is unavailable → seed bank for that tier. The demo must work with ZERO LLM calls.
```

---
