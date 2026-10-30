# Next prompts — 03:20 round (after R3, R5-live, K7 and the unlock-rule change)

Main @ 41fffb6: 242 tests pass. Merged since 02:00: R3 split-container grading, R5-live (0 leaks in 22 live scenarios), K7 Adept+Master seeds, the question-set unlock rule (CLAUDE.md top section).
Everyone: `git pull` and start a **fresh** Claude Code / Codex session first. PR base = `vudigapranav/HFT26-TEAM-36` `main`, never cbitosc.

---

## Karthik (Codex) — K10 now, then K5 → K6 → K8

**K10:** paste the *Delta* (if started) or *Full* prompt from `docs/prompts/K10_Unlock_Change.md`, plus this extra line:
```
Also: load all three seed tasks (novice_request_summary, adept_event_dedupe, master_session_window) as the three question sets. Pass ALL of the session's tasks to buildReport — Pranav's report (P11) filters to the tiers the candidate actually reached using session.current_tier. Refuse to start a set whose topics the profile didn't claim (keep the 422 SEED_TOPIC_UNAVAILABLE behaviour per task, not per session: a missing Adept/Master task just means no further unlock).
```

**K5 (after K10):**
```
Task K5 — validation engine. Branch karthik/k5-validation. Use the K5 prompt in docs/prompts/KARTHIK_Next_Prompts.md, with these updates:
- The reference/starter gates run through Ports.runTests, which is now Rithvik's R3 split-container runner. A run returning unavailable "Task not supported by the isolated runner" is a FAILED gate ("format") — the task's tests must call candidate functions with plain data only (see src/backend/runner/harness/README.md). Add that as its own gate.
- Without Docker (CI), run the reference/starter gates through the local stand-in only for the three reviewed seeds, and mark the gate "skipped: runner unavailable" otherwise — never "pass".
- Performance gate for Master: reference must finish its perf test well inside the limit; the starter must fail it.
- All three current seeds must pass every gate; deliberately broken copies (reference fails, starter passes everything, unclaimed heapq import, hint containing a reference line) must be rejected with clear reasons.
- Receipts are public-safe: gate names, pass/fail, counts — never test source or expected values.
Then Ship.
```

**K6 (after K5):** use the K6 prompt in `KARTHIK_Next_Prompts.md`, adding:
```
- Generated tests MUST follow the R3 harness format (plain-data arguments/returns, builtin exceptions only; no objects, no subprocess, no servers). Put that rule in the generation prompt and let the K5 "format" gate enforce it.
- One task per tier for now (the question-set code supports N).
- Hints: generate the 3-level ladder; the leakage gate + Rithvik's guards decide. Never put reference code in hints.
- If generation fails or Featherless is unavailable → seed bank for that tier. The demo must work with zero LLM calls.
```

**K8 (rolling):**
```
K8 — integration. Contracts: add an optional `claims: Array<{topic, tested_by: string|null, demonstrated: boolean|null}>` to Report and an optional profile (or claimed_topics) input to the buildReport seam (exact request in docs/status/pranav.md, P8/P11). Update BACKEND_DECISIONS.md: Q1/Q3 locked (unlock rule), R3 runner, R5-live results. Add "- src/frontend" to pnpm-workspace.yaml if not done. Keep an end-to-end API test of the full 3-set journey green on every merge.
```

---

## Rithvik (Claude Code) — `/start R6`

```
Two jobs, one branch + PR each. Only runner/, llm/, deploy/ (+ tests, your status file).

JOB 1 — real-Docker check of the new seeds (15 min, branch rithvik/k7-docker-check, tests only).
Add tests/runner/seeds-docker.test.ts (describe.skipIf no Docker): for each seed in src/backend/seed_bank (novice_request_summary, adept_event_dedupe, master_session_window) run the REAL R3 runner on reference (3×) and starter, submit mode: reference = all pass; starter = exactly f2p_ids fail and p2p_ids pass (from task.json). Record timings (Master starter ≈ 2 s on a fast machine; must stay far below wall_time_ms). If anything differs from Pranav's simulated result (reference 10/10, starter 7 fail/3 pass and 5 fail/5 pass), report it in your status file — don't edit seed files (Karthik/Aryan own them).

JOB 2 — R6 deployment on the demo Mac (Apple Silicon). Branch rithvik/r6-deploy.
- deploy/docker-compose.yml: postgres:16 (named volume, healthcheck) + a one-shot migrate service (pnpm db:migrate) + backend (APP_MODE=auth, RUNNER=docker, AUTH_ORIGIN from env, Docker socket available to the backend for the runner, RUNNER_HARNESS_DIR correct). Build the runner image for the host arch.
- deploy/start.sh (and deploy/README.md): checks Docker is running → builds torquecode-runner-python:dev → starts compose → waits for /health ok with runner_available:true → prints the frontend URL. deploy/stop.sh. .env.example with empty values only (FEATHERLESS_API_KEY etc.). Never commit .env.
- Frontend: if src/frontend exists, run its dev server (or a built static bundle) behind the same origin with /api → backend (strip /api, keep Origin); AUTH_ORIGIN must equal that origin.
- Prove it from a clean clone + clean browser on the demo machine: register → portfolio (docs/demo/demo-portfolio.json) → quiz → assessment → edit + Run + Submit (real Docker) → report. Write exact steps + results in your status file. Record a backup screen recording.
- Keep the demo safe: one command to reset the DB; never restart the backend mid-demo (assessments live in memory).
/ship after each job.
```

---

## Pranav (Claude Code) — `/start P11`

P11 prompt is in the chat message of 03:15 (report filters to the tiers the candidate reached + claims "attempted" fix). After that:

```
/start P12
```
```
P12 — submission readiness (docs/, README.md, scripts/ only). 1) README: update "What's real today" from git log + status files (R3, R5-live, K7, unlock rule; K10/R6/frontend only if merged), replace 15/20/25 wording if any remains, add Demo video + Live URL placeholders at the top, add "How to run the demo" pointing to deploy/README.md. 2) docs/demo/PITCH_FACTS.md: add R5-live numbers exactly as in docs/status/rithvik.md (0 leaks in 22 scenarios after fixes; 8/12 leaked before; ~$0.0018 total; median ~2.1 s) with the caveats. 3) scripts/pre-submit-check.sh: runs pnpm typecheck, pnpm test, python3 scripts/attack-api.py against a running server, greps the repo for secrets (.env files, sk- keys) and prints a checklist. No invented numbers. Then /ship.
```

---

## Akshit (OpenCode, no terminal) — paste as a follow-up in his OpenCode chat

```
Product change from Pranav — update the coding screen:
1. NEVER show "Novice", "Adept", "Master" or a tier bar anywhere in the assessment UI.
2. One 60-minute countdown for the whole session (server remaining_sec), no per-level timers.
3. Show the list of questions the candidate currently has (neutral names: "Question 1", "Question 2", or the task title). Earlier questions stay clickable after unlocking.
4. Show an "Unlock next questions" button ONLY when GET /api/assessments/:id/status says unlock_available === true. Clicking it calls POST /api/assessments/:id/tier/upgrade with {} and then reloads status + the question list. Hide it after 2 unlocks (unlocks_used === 2). Until the backend has these fields, keep the button hidden (no errors).
5. Show the hint button and the AI assistant panel ONLY on questions where the task response has assistant_enabled === true. Assistant: POST /api/assessments/:id/assistant {message, history} → show reply; if {blocked:true, reason} show "The assistant can't help with that" (no reason details); on 503 show "Assistant unavailable".
6. Report page may show level names (Novice/Adept/Master) — that's allowed after the session.
Keep everything else (Run/Submit, autosave, integrity events, 503 sandbox banner). Then tell Pranav which screens work, and send him a zip of src/frontend if you can't push.
```

---

## Aryan (ChatGPT) — slides + rehearsal

```
My deck text is final in docs/pitch/PITCH_DECK_TEXT.md (updated: one 60-minute session, attempt every question → "Unlock next questions", up to twice; levels never named; anti-tamper grading done; assistant tested live: 0 leaks in 22 scenarios after fixes). Turn it into slide-by-slide layout instructions for Google Slides/PowerPoint: dark background, one accent colour, max 4 bullets, one visual idea per slide (diagram for architecture, a 3-box flow for the journey, a shield/layers visual for grading + assistant). Give me exact text per slide and where screenshots go (placeholders: login, coding screen, report). Then a 60-second version of the script for a short demo slot.
```
Then: build the slides, rehearse with Pranav twice (timed), and take screenshots once the frontend works.
