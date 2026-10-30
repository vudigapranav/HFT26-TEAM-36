# Pranav — status log

Newest entries at the bottom. Written by `/ship`.

## 2026-10-30 23:00 — prompts — add per-person checkpoint prompt files
- Changed: docs/prompts/KARTHIK_Codex_Prompts.md, docs/prompts/RITHVIK_Claude_Prompts.md, docs/prompts/PRANAV_Claude_Prompts.md (docs only, no code)
- Seams/contracts affected: none
- Teammates should know: your prompts for the 00:30 checkpoint are in docs/prompts/. K0 (BACKEND_DECISIONS.md) is still pending and blocks P1/R2 code.
- Next: P1 once K0 and K1a are merged

## 2026-10-30 23:32 — P4 — first-run rule for "real code change" in context §12
- Changed: docs/TorqueCode_Context.md §12 rule 4 (one sentence)
- Seams/contracts affected: none
- Teammates should know: for the first run, "previous hash" = hash of the untouched starter files, so running starter code unchanged doesn't count toward TestDiscipline.
- Next: P1 → P3 → P4 once K1a (contracts) is on main

## 2026-10-30 23:52 — P1–P4 — intake (parsePortfolio, quiz) + AIE scorer on Karthik's contracts
- Changed: src/backend/intake/{data,normalize,portfolio,quiz}.ts, src/backend/scoring/aie.ts, tests/intake/*, tests/scoring/*
- Seams/contracts affected: implements Ports.parsePortfolio (intake/portfolio.ts), Ports.quiz (intake/quiz.ts), Ports.calculateAie (scoring/aie.ts) exactly as in contracts/seams.ts. Ready for Karthik to wire in place of dev-stubs.
- Teammates should know:
  - Karthik: the AIE scorer needs these event payloads — run/submit: { run_id, files_hash } with files_hash = hashEditableFiles(files) exported from scoring/aie.ts; hint_served: { level }. Starter hash is computed from task.files, no contract change needed.
  - Karthik: CandidateProfile has no field for warnings / injection flags / domain scores. parsePortfolioDetailed() returns them; please add optional `warnings` and `injection_flags` to the public profile (or a sibling response) so the upload screen can show them.
  - Empty topics: implemented the context §10.1 A2 fallback (arrays, strings) WITH an explicit warning (not silent) — matches EXPECTED.md. Resolves TODO(OPEN-EMPTY-TOPICS) unless the team objects.
  - Topic matching is exact-synonym only (taxonomy.json rule), no fuzzy guessing.
- Verified: typecheck clean; backend tests 40/40 (21 new: 6 fixtures per EXPECTED.md, invalid input, 300 randomized quiz lanes per fixture, 9 AIE rules); ownership check passed.
- Next: P5 report builder.

## 2026-10-30 23:59 — P5 — buildReport on the shared contracts
- Changed: src/backend/scoring/report.ts, src/backend/tests/scoring/report.test.ts
- Seams/contracts affected: implements Ports.buildReport exactly as in contracts/seams.ts. Output passes the public Report schema.
- Teammates should know:
  - Karthik: wire scoring/report.ts → buildReport. It reads the same event payloads as calculateAie (run/submit: { run_id, files_hash }; hint_served: { level }).
  - Final score policy is in named constants at the top of report.ts: 80 × correctness + mean AIE over attempted Adept/Master tasks. TODO(OPEN-Q4): a Novice-only session scales correctness to 100 until the team decides.
  - Focus areas = DSA topics of tasks not fully solved + behaviour notes (testing discipline, hint reliance). Integrity signals count tab_hidden, copy, paste, assistant_blocked, extraction_flagged.
- Verified: typecheck clean; backend tests all pass; ownership check passed.
- Next: help with integration for the 00:30 checkpoint.

## 2026-10-31 00:38 — checkpoint — verified end to end; Karthik's next prompts
- Changed: docs/prompts/KARTHIK_Next_Prompts.md (K9 wiring, K10 tiers, K5 validation, K6 generation, K8 integration)
- Seams/contracts affected: none
- Teammates should know: checkpoint met on main @ 32cd3fd — typecheck clean; 75 tests pass (DB tests pass on real Postgres; Docker tests by Rithvik); full API journey 17/17 through APP_MODE=auth. Docker runner merged but not yet wired (K9). Open product decisions Q1/Q3/Q4 use the context §15 recommendations until changed.
- Next: frontend with Akshit.

## 2026-10-31 00:50 — hardening — attack review of the integrated API + fuzz fixes
- Changed: intake/portfolio.ts (drop whitespace-only tokens), scoring/report.ts (row cap, missing topics), tests (fuzz + regressions), scripts/attack-api.py, docs/reviews/2026-10-31-integration-attack.md
- Seams/contracts affected: none (behavior now always contract-valid)
- Teammates should know: Karthik — please read docs/reviews/2026-10-31-integration-attack.md findings 2 and 3 (response schemas not enforced; /portfolio body limit). Everyone: `python3 scripts/attack-api.py` re-runs 39 API attacks against a live auth-mode backend.
- Next: frontend with Akshit.

## 2026-10-31 00:50 — frontend plan for Akshit (+ Pranav)
- Changed: docs/prompts/AKSHIT_Frontend_Plan.md (stack, proxy, full API map, screens F0–F8 with owners, prompts)
- Seams/contracts affected: none
- Teammates should know: Karthik — please add "- src/frontend" to pnpm-workspace.yaml so the frontend can import @torquecode/contracts types. Frontend dev runs on http://localhost:5173 → backend AUTH_ORIGIN must be exactly that.
- Next: F2/F3/F6 after Akshit's F0.

## 2026-10-31 00:55 — frontend plan: Akshit is the sole frontend owner (OpenCode)
- Changed: docs/prompts/AKSHIT_Frontend_Plan.md — all screens F0–F8 assigned to Akshit in build order; OpenCode session-opener + Ship prompts (no /start or /ship there).
- Teammates should know: Pranav is not building frontend; he reviews/merges. Karthik — still please add "- src/frontend" to pnpm-workspace.yaml.

## 2026-10-31 01:00 — review — K9 merged; HIGH finding: Docker daemon down ⇒ fake 0 grade
- Changed: docs/reviews/2026-10-31-integration-attack.md (update + finding 7)
- Teammates should know: Rithvik + Karthik — read finding 7 and fix before the demo (a closed Docker Desktop currently turns every run into a graded 0/2 instead of 503). Attack suite now 39/39; journey 17/17; 87 tests + 15 DB tests pass on main.
- Karthik: pnpm-workspace.yaml still needs "- src/frontend" for Akshit.

## 2026-10-31 02:15 — P6 — lock product decisions Q1, Q3, Q4
- Changed: docs/TorqueCode_Context.md (§5 journey bullets, §10.1 A3, §12 Novice note, §15 rows Q1/Q3/Q4) — docs only
- Seams/contracts affected: none
- Teammates should know: Karthik (K10) — these are now [LOCKED — Pranav, 2026-10-31]: tiers Novice 15 / Adept 20 / Master 25 min; next tier unlocks when ALL tests (visible+hidden) of the current tier's final submit pass; upgrading is the candidate's choice; no demotion (declining = keep working on the current tier); AIE only for Adept/Master, Novice-only sessions scale correctness to 100 (already what scoring/report.ts does). Existing TODO(OPEN-Q1/Q3/Q4) markers in code can stay or be removed in your own areas; behavior doesn't change.
- Next: P7 (AIE vs R5 events tests)
## 2026-10-31 02:30 — P7 — AIE scorer verified against R5 assistant events
- Changed: src/backend/tests/scoring/aie.test.ts (4 new tests). No scoring code changed: every new test passed against the current scorer.
- Seams/contracts affected: none
- Teammates should know: proven — a blocked attempt (assistant_blocked + extraction_flagged) weighs 0 in Independence/HintYield and gives the same score as no AI use, but counts once per attempt in integrity_flags; an LLM outage (no events) changes nothing; 6 delivered assistant_message events → Independence 0; the report's integrity_signals lists both assistant_blocked and extraction_flagged counts. Rithvik's R5 event rules match the scorer as-is.
- Checks: pnpm typecheck passed; pnpm test 216 passed / 28 skipped (PostgreSQL + Docker) + 9 Python passed; ownership check passed. Needs `uv sync --project src/backend --python 3.13 --locked` first, or 6 seed-runner tests fail with a missing .venv.
- Next: P8 claims vs demonstrated
## 2026-10-31 02:45 — P8 — claims vs demonstrated (context §13)
- Changed: src/backend/scoring/claims.ts (new, claimsVsDemonstrated), src/backend/tests/scoring/claims.test.ts (6 tests). Contracts not touched.
- Seams/contracts affected: needs a contract addition by Karthik (below). Not yet wired into buildReport.
- Rules: one entry per claimed topic, in profile order. tested_by = a session task whose dsa_topics include the topic and that has a report row, else null. demonstrated = that task's final submit passed every test (passed === total > 0), else false; null when not tested. If several tasks cover the topic: a fully solved one wins, then the higher tier, then task order.
- Teammates should know: **Karthik** — please add to the Report object in src/backend/contracts/public.ts:
  `claims: Type.Optional(Type.Array(object({ topic: Topic, tested_by: Type.Union([Id, Type.Null()]), demonstrated: Type.Union([Type.Boolean(), Type.Null()]) }), { maxItems: 19 })),`
  and add an optional `profile?: CandidateProfile` to the buildReport seam input in contracts/seams.ts, passing the session's parsed profile from the API. Then this one line goes in the object returned by buildReportValue in scoring/report.ts (I'll add it once the contract lands):
  `...(input.profile ? { claims: claimsVsDemonstrated(input.profile, tasks, rows.map(x => x.row)) } : {}),`
  **Akshit** — once that ships, the report page can show a "Claims vs demonstrated" table from report.claims (null = not tested this session).
- Checks: pnpm typecheck passed; pnpm test 218 passed / 28 skipped (PostgreSQL + Docker) + 9 Python passed; ownership check passed.
- Next: P9 README
## 2026-10-31 03:00 — P9 — submission README
- Changed: README.md (replaces the starter template: problem, solution, how it works, architecture from context §9, real-vs-next table, setup, security/integrity design, honest limitations, team PAARK roles, demo link placeholder). Docs only.
- Seams/contracts affected: none
- Teammates should know: the "What's real today" table lists only what's merged on main @ 6793cee. When K10/K7/K5/K6/R3/R6/frontend merge, update that table and the "In progress" line. deploy/README.md is linked but doesn't exist yet. Rithvik, please create it in R6. Demo/live URLs are placeholders. No test counts or performance numbers are claimed.
- Next: merge P6–P9 PRs; review K10.
