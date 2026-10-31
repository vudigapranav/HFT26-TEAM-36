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

## 2026-10-31 03:30 — P10 — demo data, demo script, pitch facts
- Changed: docs/demo/demo-portfolio.json, docs/demo/demo-portfolio-injection.json, docs/demo/DEMO_SCRIPT.md, docs/demo/PITCH_FACTS.md. Docs only.
- Seams/contracts affected: none
- Verified: both portfolios run through the real parsePortfolioDetailed. Demo → backend (0.94), topics arrays/hashing/two_pointers/sorting, 0 warnings, 0 injection flags. Injection → 2 flags (projects[0].description, projects[0].highlights[1]). On main @ 7313627: typecheck clean; pnpm test 222 passed / 28 skipped (Docker not running, PostgreSQL harness skipped) + 9 Python passed. Every pitch number names its commit; all cited commits are ancestors of main.
- Teammates should know: **Aryan**, use only docs/demo/PITCH_FACTS.md for slide numbers. **Akshit**, DEMO_SCRIPT.md is the click path the frontend must support, and every click is marked FE. **Karthik/Rithvik**, the script marks the Unlock/Upgrade, Adept and assistant steps as needing K10, K7 and R6, each with a cut line. Update the tags as those merge.
- Next: re-check DEMO_SCRIPT tags and PITCH_FACTS numbers at feature freeze.

## 2026-10-31 03:05 — product rule change + merges
- Changed: docs/TorqueCode_Context.md §5/§7/§10/§11/§14/§15, CLAUDE.md (new top section), docs/TorqueCode_Backend_Plan.md K3, docs/prompts/AKSHIT_Frontend_Plan.md, docs/prompts/K10_Unlock_Change.md, README, demo script, pitch facts
- Decision (LOCKED, Pranav 03:00): one 60-minute timer, no per-tier split; everyone starts on Novice questions; after **submitting** every question in the current set (correctness not required) the candidate may click "Unlock next questions"; max 2 unlocks; never name the level in the assessment UI (backend keeps tier internally; report may name levels); earlier questions stay open; AI help only on Adept/Master questions.
- Merged: PR #29 (R3 split-container grading), PR #30 (K7 Adept+Master seeds, R3-compatible, + Aryan's pitch drafts), PR #31 (pitch facts), PR #32 (rule change).
- Teammates should know: **Karthik** — use docs/prompts/K10_Unlock_Change.md for K10 and update BACKEND_DECISIONS (Q1/Q3 locked). **Akshit** — no level names on the coding screen; only an "Unlock next questions" button driven by `unlock_available`. **Rithvik** — please run the Adept/Master seeds once on real Docker. Everyone: `git pull` + start a fresh Claude Code session to load the new CLAUDE.md.

## 2026-10-31 03:45 — P11 — report + claims follow the question-set unlock rule
- Changed: src/backend/scoring/report.ts, src/backend/scoring/claims.ts, src/backend/tests/scoring/report.test.ts (+5 tests), src/backend/tests/scoring/claims.test.ts (+3 tests, existing calls updated).
- Report: a task counts only if its tier was reached. "Reached" is the highest of session.current_tier and any tier named in a tier_unlocked / tier_upgraded event payload `{ tier }`; malformed tiers are ignored. Locked-tier tasks get no row and don't affect correctness, focus areas or outcome. An offered-but-untouched available task still counts as 0 (it was offered). The Q4 novice-only scaling and AIE rules are unchanged. The outcome now ends with "Unlocked N of 2 further question sets." New exports: highestTierRank, MAX_UNLOCKS.
- Claims: signature is now claimsVsDemonstrated(profile, tasks, rows, attempted: ReadonlySet<string>), plus a new attemptedTaskIds(events) (≥1 run or submit). An unattempted task never counts as tested, so an attempted lower tier beats an unattempted higher one.
- Seams/contracts affected: none changed. buildReport's signature is unchanged.
- Teammates should know: **Karthik (K10)** — please (1) pass ALL session tasks (every tier) to buildReport; the report filters them. (2) On each unlock set session.current_tier to the new tier AND log a server event `tier_upgraded` with payload `{ tier: 'adept' | 'master' }` (either is enough; both is safest). (3) The earlier P8 request still stands, with one change to the call line: add to Report in contracts/public.ts
  `claims: Type.Optional(Type.Array(object({ topic: Topic, tested_by: Type.Union([Id, Type.Null()]), demonstrated: Type.Union([Type.Boolean(), Type.Null()]) }), { maxItems: 19 })),`
  plus an optional `profile?: CandidateProfile` on the buildReport seam input. The line I'll add to buildReportValue is now
  `...(input.profile ? { claims: claimsVsDemonstrated(input.profile, tasks, rows.map(x => x.row), attemptedTaskIds(events)) } : {}),`
  No separate "unlocked sets" contract field is needed; the outcome text carries it. Ask me if the frontend wants a number.
- Checks: tests written first (8 failed before the change, all pass after). pnpm typecheck passed; pnpm test 250 passed / 46 skipped (Docker + PostgreSQL not available here) + 9 Python passed; ownership check below.
- Next: wire claims once the contract lands.
## 2026-10-31 04:05 — P12 — submission readiness
- Changed: README.md, docs/demo/PITCH_FACTS.md, docs/demo/DEMO_SCRIPT.md, scripts/pre-submit-check.sh (new). Docs + script only.
- README: Demo video / Live URL / "How to run the demo" → deploy/README.md placeholders at the top. "What's real today" checked at 462c530: R3 split grading, K7 seeds (task files, not yet served), R5-live, unlock rule (decided; API flow pending K10). K10, R6 and frontend are not merged, so they stay "in progress". The sandbox and limitations text now reflects R3. No 15/20/25 wording remains.
- PITCH_FACTS: re-measured on 462c530 (typecheck clean; 242 passed / 46 skipped + 9 Python). Added R3 (8f567a6) and R5-live (9fff6a3) numbers exactly as in docs/status/rithvik.md: 8 of 12 answered replies leaked before the fixes → 0 leaks in 22 scenarios after; about $0.0018 total; median about 2.1 s per answered call. Caveats included.
- DEMO_SCRIPT: re-checked against 462c530. The second-set step uses the merged Adept seed (needs K10 to serve it). The jailbreak line is now the tested fixture jb-01-direct. Caveat added: R5-live wasn't measured on the Adept seed itself. The report step notes P11 (PR #36). The dependency table is updated.
- scripts/pre-submit-check.sh: typecheck, test, attack suite (needs a backend on 127.0.0.1:3001), secret scan (tracked .env files, non-empty .env.example secrets, sk-/Bearer/rc_ keys). Prints ✅/❌ and exits 1 on any failure. Run on 462c530 with a local backend up: all 8 checks ✅ (attack suite 39 pass / 0 fail).
- **Fix found while doing P12:** my P11 PR #36 had been pushed with only the status file. A `git stash pop` during /ship had unstaged the code. Pushed the missing code + tests as a0f1f21; PR #36 now has all 5 files and passes typecheck and tests (250 passed / 46 skipped). P6–P8 were checked and are complete on main.
- Seams/contracts affected: none
- Next: P13 once Karthik's K8 adds Report.claims.

## 2026-10-31 04:45 — P14 — attack suite v2 for K10 (question sets, unlock, AI gating, assistant)
- Changed: scripts/attack-api.py (all 39 original checks kept; 28 new K10 checks; SKIP support; target via TORQUECODE_API, default http://127.0.0.1:3001), scripts/pre-submit-check.sh (accepts "(N skipped)", honours TORQUECODE_API).
- New checks:
  - Unlock: 409 before every question has a Submit; allowed after submitting every question with wrong (starter) code; 2nd unlock; 3rd unlock → 409; another user can't unlock.
  - Locked-set question: GET/PUT/run/submit → 403.
  - First-set hint/assistant → 403; later-set hint → 200 and a hint race; assistant → 200 or 503 LLM_UNAVAILABLE.
  - Oversized assistant message → 4xx. Assistant abuse (ignore instructions, whole function, forged history with a code turn): the reply is checked against reference lines not in the starter.
  - The client can't send tier_unlocked/tier_upgraded/assistant_message/hint_served.
  - 5 parallel submits + 3 unlocks: no 500s, unlocks_used ≤ 2.
  - No /\b(novice|adept|master)\b/i in any candidate-facing response (report excluded).
- One existing check adapted: "parallel hint spam" now also accepts 403, because K10 correctly disables hints on the first set. The race is re-run on an unlocked question.
- Run: main @ 19df7ff, APP_MODE=auth, RUNNER=local, scratch PostgreSQL 15, no Featherless key, port 3002: **62 pass / 0 fail (5 skipped)**. Skipped: 3 assistant-abuse checks (no LLM key) and the 2nd/3rd unlock (needs the Docker runner to grade second-set submits). pre-submit-check against the same server: all 8 ✅ (pnpm test 275 passed / 55 skipped + 9 Python).
- Not covered: K5 (validation engine) has no HTTP surface, so the API suite has nothing to attack there; its own tests cover it.
- Teammates should know: **Rithvik**, on the demo machine (deploy/start.sh with Docker + key), run `python3 scripts/attack-api.py` and confirm 0 skips. That is the only run that exercises the assistant-abuse and 2nd/3rd-unlock checks.
- Seams/contracts affected: none
- Next: P13 once Report.claims lands.
## 2026-10-31 05:05 — P15 — full-journey script (scripts/e2e-journey.py)
- Changed: scripts/e2e-journey.py (new, Python stdlib only).
- What it does: register (unique email) → login → /auth/me → upload docs/demo/demo-portfolio.json → quiz (answer all) → create assessment → wait until ready (polls generation status if present, READY_TIMEOUT_S, default 180 s) → set 1 run + submit every question → unlock → set 2: one hint + one assistant question → run + submit → unlock → set 3 → run + submit → report (final_score 0..100, one row per available question, AIE breakdown on later-set rows, the paste integrity signal it sent) → GET /reports list if present.
  - BASE defaults to http://127.0.0.1:3001; ORIGIN defaults to BASE's scheme://host and must equal AUTH_ORIGIN.
  - Locally (BASE on localhost + seed bank present) set 1 is fixed with the seed reference, matched by task title. Otherwise code is submitted as-is.
  - ✅/❌ per step with timings; exits 1 on the first failure. Never prints cookies or the password.
  - ⚠️ (not a failure) for: assistant 503 LLM_UNAVAILABLE without a key; no /reports list. A runner 503 is a failure, with a pointer to deploy/README.md.
- Verified on main @ 19df7ff (APP_MODE=auth, RUNNER=local, scratch PostgreSQL 15, no key, port 3002): steps 1–10 ✅ through the set-1 reference fix (5/5), unlock 1 and the hint. Assistant ⚠️ (no key). Then it fails cleanly at the set-2 run with 503 SANDBOX_UNAVAILABLE, which is correct, because the local runner only grades the Novice seed. Also checked: an unreachable BASE fails with a clear message.
- **Not yet verified live:** set 2/3 submits, unlock 2, the report checks and the report list. They need the Docker runner. **Rithvik**, after deploy/start.sh on the demo machine, run `python3 scripts/e2e-journey.py`; it should end "Journey PASSED". For the cloud check: `BASE=https://<app>/api ORIGIN=https://<app> python3 scripts/e2e-journey.py`.
- Seams/contracts affected: none
- Next: P16 docs refresh.
## 2026-10-31 05:25 — P16 — docs refresh after K10 + K5
- Changed: README.md, docs/demo/PITCH_FACTS.md, docs/demo/DEMO_SCRIPT.md. Docs only.
- README "What's real today" (checked at 19df7ff): K10 question sets + unlock rule + hints/assistant on later sets (#42), K5 validation engine (#44, wired as the validateTask seam), K7 seeds checked on Docker (R7), R3, R5-live, R6 one-command deploy (verified on Windows, not yet the demo Mac). In progress: K11 persistence, K6 generation, R6b cloud, frontend. "How to run the demo" → deploy/start.sh + verify.sh.
- PITCH_FACTS:
  - My own run on 19df7ff: typecheck clean; pnpm test 275 passed / 55 skipped + 9 Python.
  - New section 8 lists the K5 gates exactly as in validate.ts (schema, topics via Python AST, imports, format, leakage, reference ×3, starter F2P/P2P, Master performance; Docker down → skipped → invalid). Caveat: "examples" currently passes after the schema check, and "differential" only checks the 3 reference runs agree, with no brute-force comparison yet. Karthik's K5 follow-up makes both stricter.
  - Added R7 (4/0, f168c2b) and R6 (31/31 on Windows, 00e01b5) as "reported".
- DEMO_SCRIPT: unlock, second set + assistant and report steps marked ✅ on main (K10, P11). Cut lines kept: no key or not rehearsed → describe the assistant from the slide; first set only → Q4 scaling. Pre-stage checklist uses deploy/start.sh + verify.sh and the P15 journey. The dependency table is updated.
- Note: P14 (#47) and P15 (#48) are still open, so their results aren't cited as merged facts.
- Seams/contracts affected: none
- Next: P13 when Report.claims lands.

## 2026-10-31 — P17 — report correctness and submission verification

- Baseline: main `956dcbb`; no open GitHub PRs at review or pre-publication refresh.
- Fixed report outcomes for multi-question tiers: all offered questions must pass their latest submit before calling a tier fully solved; preserve solved-question count when no complete tier passes. Two regression tests failed before the fix and pass afterward.
- Submission checker now fails on skipped tests/attacks, zero attacks, and nonzero attack-process exit. Six command-fixture tests pass. Pitch facts updated for the already merged K5 receipt correction (#51).
- Checks: typecheck/build passed; backend 288 passed / 55 skipped; Python reporter 4 passed; separate real isolated PostgreSQL auth 9 passed; release-check fixture tests 6 passed; ownership, shell syntax and diff checks passed. Docker unavailable; no live LLM/browser/cloud verification claimed.
- Handoff: docs/reviews/2026-10-31-pranav-readiness.md records remaining frontend, K11, K6, P13 contract and deployment dependencies. P13 remains dependent on Karthik's contract additions; no teammate-owned source was edited.

## 2026-10-31 — P13 — backend claims integration complete

- User corrected scope to Pranav's backend work only. All frontend files/dependencies added in this chat were removed before commit. Experimental persistence/generation implementations were also removed; teammate implementations remain in their own branches.
- Report.claims and optional buildReport profile input are additive. API captures profile_snapshot at assessment creation and passes it into report building; later portfolio uploads cannot rewrite the session's claims. Snapshot name matches Karthik's K11 branch.
- Tests cover demonstrated/failed/untested claims, locked/unattempted tasks, old callers without a profile, a later portfolio upload, report ownership and private-data leakage. The live journey checks claims against the uploaded assessment profile.
- Fixed the submission gate's auth-skip false failure: TORQUECODE_ALL_DB_TESTS=1 runs all suites inside the isolated DB harness, with PostgreSQL required and Docker enabled. The default auth-only harness behavior is preserved. Six fixture tests pass, including required environment flags.
- Verification of the final backend-only source: typecheck/build passed; strict sequential real PostgreSQL + Docker suite 347 passed, 0 failed, 0 skipped (23 files); Python reporter 4 passed; release-gate fixture suite 6 passed; ownership, shell syntax and whitespace checks passed. Overlapping initial Docker runs had timing failures and were stopped; the sequential run above is the completed final regression result.
- Local API journey on separate port 3101 passed all three seed sets, both unlocks, report score/AIE/integrity/claims. API attacks: 64 passed / 0 failed / 3 skipped (live assistant unavailable without a key). Journey warnings: assistant unavailable and report-history endpoint absent on current main. Existing backend on port 3001 was left running.
- Shared edits are limited to optional report contract/input, two API report/snapshot lines, and the optional AssessmentRecord snapshot field. scripts/owners.json explicitly permits those four paths for this authorized integration; no hooks were bypassed.
- Handoff: docs/reviews/2026-10-31-pranav-backend-handoff.md. New teammate PRs #54 (K6), #55 (prepared cloud kit), #56 (K11) are separate and not merged by this change. K11 must preserve the report snapshot/input and the full-suite test-harness option when integrating its overlapping files.

## 2026-10-31 — independent K5/K6 correctness verification

- Reproduced all three requested rejection regressions on the old real Docker validator (each incorrectly accepted), then verified they are rejected by the replacement.
- Added four trusted Python families, independent oracle answer keys, canonical verified examples, strict grading/reference provenance, honest performance receipts and bounded model ID selection. Unsupported or incomplete verification fails closed.
- Closed the durable worker fallback bypass; active old tasks are revalidated while preserving saved work. Failed jobs do not release questions or fabricate reports. Added restart/revalidation and missing-certificate coverage.
- Wired the real factory with K8-compatible wiring. Fixed the compiled build to include Python validation scripts after the real HTTP check exposed their omission.
- Final source suite: 391 passed, 0 failed/skipped across 26 files with isolated PostgreSQL and real Docker. Typecheck/build passed; Python reporter 4 passed; release-check fixtures 6 passed. Built HTTP journey, verification flag, restart durability and exactly-once expiry recovery passed on a separate port/disposable database. No live LLM or cloud verification claimed; assistant correctly unavailable without a key.
- No frontend changes. Details and explicit limits: docs/reviews/2026-10-31-independent-validation.md. Current main remains b0fad23; K8 PR #58 is separate and needs its old fallback mocks aligned with semantic verification before merging.

## 2026-10-31 — independent validation shipped (PR #60) + K8 rebase notes (PR #58)
- Pushed the local-only commit 047d5d9 (`pranav/independent-task-validation`, based on b0fad23). main had not moved, so no rebase was needed and nothing was resolved. The independent-oracle path (semantic_verified, structural_valid, family provenance) is unchanged.
- Ownership: the commit adds generation/*, contracts/internal.ts, api/postgres-assessment-store.ts and api/wiring.ts to Pranav's paths in scripts/owners.json (Karthik-owned areas, approved by Pranav as lead). The pre-push hook passed with no bypass.
- Step-3 results on Pranav's Mac (Node 26.10.0, Docker 29.7.2 with torquecode-runner-python:dev, isolated PostgreSQL **15.15**, the only version installed; the stack pins 16):
  - `pnpm install --frozen-lockfile --ignore-scripts` ✅; `pnpm typecheck` ✅; `pnpm build` ✅
  - `RUNNER=docker TORQUECODE_REQUIRE_DB=1 TORQUECODE_ALL_DB_TESTS=1 pnpm test:auth`: **26 files, 391 passed, 0 failed, 0 skipped**
  - `pnpm test:python`: **4 passed**
  - `pnpm ownership:check` ✅ (0 uncommitted files; the committed diff was checked by the pre-push hook)
  - Not re-run here: the built-backend HTTP journey and restart/expiry checks in docs/reviews/2026-10-31-independent-validation.md (author's earlier run).
- PR #60 opened and merged with a merge commit as vudigapranav (d6e120e, no Co-Authored-By trailer). Limits stated in the PR: Python only, 4 reviewed families, finite oracle checks, no live provider or cloud verified.
- PR #58 (karthik/k8-final @ 1f8b091) review, by trial-merging it onto 047d5d9 in a scratch worktree (Karthik's branch not edited):
  - typecheck ✅
  - `k8-wiring.test.ts` 1 failed / 1 passed: its runner throws, which assumes fallback needs no verification → `expected 'unavailable' to be 'ok'`.
  - `TORQUECODE_REQUIRE_DB=1 pnpm test:persistence` 22 passed, but the K8 journey passes only via #60's test-only `certifiedFixture` validation double.
  - One conflict in persistence.integration.test.ts (both sides add tests at the same place). wiring.ts is identical.
  - #58's BACKEND_DECISIONS K8 section has 3 claims superseded by #60.
  - Exact change list posted: https://github.com/vudigapranav/HFT26-TEAM-36/pull/58#issuecomment-6537402894
- Next: Karthik rebases #58 onto main (with #60) and re-runs test:auth with 0 skips; then P13/claims check if still needed.

## 2026-10-31 08:15 — deployment runbook, submission prep, PR #58 review (branch `pranav/deploy-submission-prep`)
- Added `docs/deploy/VERCEL_VM_RUNBOOK.md`: architecture, the missing real values (VM, BACKEND_HOST, Vercel URL, secrets), where each env var lives, Vercel project settings checked against vercel.com/docs (rewrites, monorepos), a **template** `vercel.json` (not committed as active config: no backend host exists yet), deploy order, verification and rollback. It reuses Rithvik's R6b kit and middleware; nothing is deployed.
- Added `docs/demo/submission.md` (track, demo URL and unfinished checks marked UNKNOWN) and `docs/demo/DEMO_CHECKLIST.md`.
- README and PITCH_FACTS: corrected stale lines (six families from `generation/families.ts`; K11, K6/#60 and #63 on main; frontend and deployment still not done).
- `docs/reviews/2026-10-31-pr58-review.md`: #58's wiring.ts is identical to main; the remaining incompatibilities are listed. No comment was posted on #58, and nothing was merged.
- Checks: the template JSON parses; `node --test deploy/cloud/vercel/torquecode-proxy-headers.test.mjs` passes; ownership check below. No deployment, browser or provider checks were run.

## 2026-10-31 — frontend live on the real stack, PRs merged, K8 rebuilt (branch `claude/cool-cannon-t0ybn8`, Claude Code cloud session)
- Merged #64 (deploy/submission docs) and #59 (frontend). #58 was not merged as-is: its `k8-wiring.test.ts` fails on main (`expected 'unavailable' to be 'ok'`, checked by running it). Instead, `karthik/k8-final` is merged into this branch (no rewrite of Karthik's branch): conflict resolved by keeping both test blocks, the K8 wiring test now verifies the seed fallback through the real Docker runner (skips explicitly without the image), and the three superseded BACKEND_DECISIONS K8 lines are corrected.
- Akshit's zip (drive-download-20261031T012924Z) compared file by file: identical to the import in #59 except CRLF/LF; nothing newer to import.
- Frontend fixes: editor chunk prefetched on the start screen while questions are prepared; dev server pre-bundles Monaco; `pnpm web:serve` serves the production bundle; the preparation screen explains the wait with elapsed seconds; integrity events are sent with `keepalive` on tab hide/pagehide (a paste followed by a reload used to be lost: report said "No signals recorded").
- Vercel (G8): `src/frontend/vercel.json`, `middleware.ts`, `torquecode-proxy-headers.mjs` (from R6b), `@vercel/functions`. The `/api` destination is the `BACKEND_HOST` placeholder: no VM hostname exists yet.
- Deploy fixes: `AUTH_ORIGIN` default is now the frontend's real origin `http://127.0.0.1:4177` (was `localhost:5173` → 403 on every login); `deploy/*.sh` are executable in git (were `Permission denied`); `verify.mjs` waits for the K11 generation job.
- Verified here (Linux, Node 24.22.1, PostgreSQL 16 via Compose, runner image built from the repo Dockerfile's pinned wheels): `deploy/verify.sh --outage` 33/33; `tests/e2e/journey.mjs` in Chromium against the production bundle 10/10 (a–j); frontend node 26/26, UI 50/50; typecheck ✅.
- Measured: question preparation takes 52–90 s (4 sequential Docker validations per task, fallback set verified before selection), and the 60-minute timer runs during it. Backend request for Karthik: start the timer when generation is ready, or verify the fallback set once at startup / in parallel.
- PDF portfolio upload (frontend only; backend still takes JSON): `src/frontend/src/portfolio-pdf.ts` reads the PDF with pdf.js (lazy chunk), drafts JSON with the backend's taxonomy/domain keywords (ambiguous words such as "stack" count only inside a DSA section), and shows what to check. Sample: `public/samples/torquecode-portfolio.pdf` = `docs/demo/demo-portfolio.pdf`, generated from `docs/demo/demo-portfolio.json`. Tests: 3 unit tests on the real sample PDF; browser step b2 validates the draft against the live backend.
- Unlock feature (asked again): already on main via K10 + #59 and verified in the browser journey (steps d–f). A machine showing no unlock button is running an older checkout: `git pull` on main.
- Not done: cloud deployment (no VM/host), live Featherless (no key in this environment), Java/C++ (runner, families and oracles are Python-only).
