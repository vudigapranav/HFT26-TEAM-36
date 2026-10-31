# Independent validation review — 2026-10-31

Baseline: `origin/main` at `b0fad23` (K11 merged). This change addresses the supplied K5/K6 audit, without frontend work.

Three focused tests were executed before the implementation against the original real Docker validator. All three failed their rejection assertions because the original validator returned `valid: true`: an incorrect second-largest reference with its own maximum answer key; a false statement example; and an unreviewed import-free DP reference claiming arrays-only validation. The same three tests pass after the change. The DP case demonstrates a provenance gap, not a general-purpose algorithm classifier.

The replacement uses four bounded reviewed Python families and independent TypeScript oracles. The model selects family/scenario IDs; it cannot supply code, arbitrary prose or expected answers. Canonical statements and structured examples share the fixed family contract. K5 enforces test provenance, reference provenance, claimed topics, oracle assertions, reference repetitions and starter regression behavior. Unnecessary performance checks report `not_applicable`; the Master check measures a pinned workload and does not prove complexity. General prose leakage detection remains heuristic.

The API checks fallback tasks before attempting provider selection. It never promotes a missing/legacy/fixture validation result into a verified assessment. Failed validation withholds questions and reports and commits a terminal event. Active legacy assessments are revalidated without replacing saved candidate files, grades, unlocks or deadlines; an interrupted revalidation preserves that intent. Completed historical reports are not retrospectively certified. Existing JSON progress stores policy metadata; there is no database migration.

The compiled HTTP check initially exposed missing Python scanner assets in the build. The build now copies `tools/*.py` to `dist/tools/`; the repeated built-backend check passed.

Verification of the final implementation:

- `RUNNER=docker TORQUECODE_REQUIRE_DB=1 TORQUECODE_ALL_DB_TESTS=1 pnpm test:auth`: 26 files, 391 passed, no failures/skips, real isolated PostgreSQL and real Docker runner. Persistence tests intentionally use labeled validation doubles to isolate storage behavior; generation suites execute the actual validator/runner.
- `pnpm typecheck`, `pnpm build`: passed. Final build includes the Python scanners.
- `pnpm test:python`: 4 passed. Release-check fixture suite: 6 passed.
- Built backend on separate port 3103 and a disposable database: full HTTP journey passed; verification flag checked; saved files, expiry deadline, unlocks, grade, AIE and claims survived restart; expiry recovery produced a durable report/history and exactly one session-end event after repeated restart. Test process and disposable database were cleaned up.
- No live model calls or cloud deployment verified. The HTTP journey intentionally had no provider key: reviewed fallback was certified and assistant returned `503 LLM_UNAVAILABLE`.
- Ownership and whitespace checks passed. API wiring is byte-for-byte equal to the current `karthik/k8-final` wiring to avoid an unnecessary overlap conflict. The factory ABI remains unchanged. K8 tests that assume fallback requires no validation must be updated before that PR is merged with this policy.

Limits: finite deterministic/seeded checks, reviewed difficulty tiers, Python only and bounded profile/domain contextualization. No claim of formal correctness, arbitrary AI task support, actual repository personalization or automatic difficulty calibration.
