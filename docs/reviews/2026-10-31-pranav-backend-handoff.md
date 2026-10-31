# Pranav backend handoff — P13

Scope: portfolio intake, quiz, deterministic scoring, report claims, and integration verification. No frontend code or dependencies are included. Experimental persistence/generation work from this chat was removed; those implementations remain with Karthik and Rithvik.

## Additive integration contract

`Report.claims` is optional for old callers. Each row contains `topic`, `tested_by: string | null`, and `demonstrated: boolean | null`. Untested claims are null/null. An attempted question with an incomplete final submission is false. The helper considers only question sets reached in this assessment.

`Ports.buildReport` accepts optional `profile`. The implementation uses that shared input type rather than maintaining a second local interface. Calls without a profile retain their previous response shape.

The assessment captures `profile_snapshot` at creation and passes it into report building. Subsequent portfolio uploads do not change the claims in an earlier report. Existing in-memory records without a snapshot use the user's current parsed profile as a compatibility fallback.

## Teammate integration points

- **Karthik K11/K8:** `profile_snapshot` intentionally matches the field already present on `karthik/k11-persistence`. Preserve it through database hydration and pass it into the `buildReport(record)` helper. Keep the optional Report.claims contract when integrating that branch. No extra report fields or database migration are required by P13 itself.
- **Karthik test harness:** `TORQUECODE_ALL_DB_TESTS=1` selects the full Vitest suite inside the isolated PostgreSQL harness. Preserve this option when combining the Docker fallback/persistence test changes in K11. Default `test:auth` behavior is unchanged.
- **Rithvik K6:** generation/runner/LLM source is unchanged in this change. Report claims use the actual task metadata and final submission results; no new generation seam is required.
- **Akshit:** no frontend implementation was retained. After integrating this backend, render `report.claims` when present; null means not tested, false means not demonstrated by the final submit, true means demonstrated. `tested_by` is a report task ID, not a candidate question URL.

## Verification commands

- `pnpm typecheck && pnpm build`
- `RUNNER=docker TORQUECODE_REQUIRE_DB=1 TORQUECODE_ALL_DB_TESTS=1 pnpm test:auth`
- `pnpm test:python`
- `python3 -m unittest discover -s scripts/tests -v`
- `BASE=http://127.0.0.1:3101 ORIGIN=http://127.0.0.1:3101 python3 scripts/e2e-journey.py`
- `TORQUECODE_API=http://127.0.0.1:3101 python3 scripts/attack-api.py`

The journey now checks report claims against the uploaded profile. Live assistant checks still require a provider key. The submission checker deliberately fails when required tests/attacks are skipped. It runs the full backend suite inside the DB harness so the default auth skip in a standalone Vitest run does not create a false release failure.

## Completed verification

Final backend-only working tree: typecheck/build passed; the sequential isolated PostgreSQL + real Docker run passed all 347 backend tests across 23 files with no skips; Python reporter 4 passed; release-gate command fixtures 6 passed. Initial overlapping Docker runs had timing failures and were stopped; they are not presented as passing verification.

On the separate local test server at port 3101, the complete seed journey passed both unlocks, all three sets, score/AIE/integrity and claims checks. The API attack suite reported 64 passed, zero failed, three skipped because a live assistant key was not configured. The journey also warns that report history is not implemented on current main. Cloud deployment, live provider behavior, and K11 restart recovery are not verified by this change.
