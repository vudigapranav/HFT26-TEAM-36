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
