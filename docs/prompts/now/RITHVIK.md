# Rithvik — all remaining prompts (Claude Code)

> Updated 31 Oct 03:20 by Pranav. **This file replaces all older prompt files for Rithvik.** Do the prompts in order, one per session/branch.
> Before anything: `git pull` and start a **fresh** session (the rule at the top of `CLAUDE.md` changed at 03:00).
> PR base is always `vudigapranav/HFT26-TEAM-36` → `main`. **Never cbitosc.** Never push to main, never `--no-verify`, never commit `.env`.

**The product rule now (LOCKED, Pranav 03:00):** one 60-minute timer; everyone starts on Novice questions; after **submitting every question in the current set (correct or not)** the candidate may click **"Unlock next questions"**; max **2** unlocks; **level names are never shown** in the assessment UI (the report may name them); earlier questions stay open; AI help only on Adept/Master questions.

**State:** R1–R5 + R3 anti-tamper + R5-live all merged (thank you). **Left: JOB 1 seeds on real Docker (15 min) → JOB 2 R6 deployment (critical for the demo) → JOB 3 support.**

Use `/start <id>` before each job and `/ship` after it.

---

## JOB 1 — real-Docker check of the three seeds (`/start R7`)

```
Branch rithvik/k7-docker-check, tests only (+ your status file).
Add src/backend/tests/runner/seeds-docker.test.ts (describe.skipIf no Docker): for each seed in src/backend/seed_bank (novice_request_summary, adept_event_dedupe, master_session_window) run the REAL R3 runner, submit mode: reference 3× → every test passes; starter → exactly task.json f2p_ids fail and p2p_ids pass. Record timings (Master starter ≈ 2 s on a fast machine; must stay far below wall_time_ms) in docs/status/rithvik.md.
Expected (Pranav's local R3-harness simulation): adept reference 10/10, starter 7 fail / 3 pass; master reference 10/10, starter 5 fail / 5 pass; novice 5/5 and 2 fail / 3 pass.
If anything differs, report it in your status file — do NOT edit seed files (Karthik/Aryan own them).
Then /ship.
```

---

## JOB 2 — R6 deployment on the demo Mac (`/start R6`)

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

## JOB 3 — after R6 (`/start R8`), only if time remains

```
Pick whichever is most useful, in this order, and tell Pranav which you took:
a) Help Akshit integrate the frontend with the real backend on the demo machine (proxy, cookies, AUTH_ORIGIN, CORS-free same origin) — debugging only in deploy/ unless Akshit asks.
b) Warm-container / startup-time improvements in the runner if a Run takes > 3 s on the demo Mac (measure first; don't claim numbers you didn't measure).
c) Run pnpm llm:eval once more after K10 merges, against an adept and a master seed, with LLM_EVAL_CAP_USD=0.10; record results in your status file.
Then /ship.
```
