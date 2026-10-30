# Integration attack review — 2026-10-31 00:45 (main @ 1685c06 + R2)

Reviewer: Pranav (with assistant). Stack: APP_MODE=auth, PostgreSQL 16, local stand-in runner.
Re-run any time: `python3 scripts/attack-api.py` against a live backend.

## Result: 38 / 39 API attacks blocked

Held up (✅): login and Origin enforcement (no Origin, foreign Origin, form-encoded bodies); cross-user access to
status, task, run and report; autosave rejects non-editable files, path traversal, `..`, conftest injection, NUL bytes
and oversize files; the client can't flip `editable`; parallel hint spam serves at most 3 hints; more than 100 events
rejected; events for a foreign task id or forged server event types rejected; 5 parallel runs with no 500s; reports
never leak hidden or reference code; quiz answers to options that weren't offered are rejected.

## Findings

| # | Severity | Area / owner | Finding | Fix |
|---|---|---|---|---|
| 1 | Medium | Intake / Pranav | Whitespace-only `skills` / `tech_stack` entries produced `""` in the profile (contract violation). The API returned and stored it. | **Fixed** in this PR: empty tokens dropped; fuzz test of 2,000 random inputs added. |
| 2 | Medium | API / Karthik | **Fastify response schemas are not enforced.** Finding 1 passed straight through, so any seam bug can leak contract-invalid data to the frontend. | In tests, `Value.Check` every route's response against its contract schema, or add an `onSend` check in development mode. |
| 3 | Low | API / Karthik | `huge.json` (302 KB) gets 413 at the global 256 KB body limit, before intake can cap it (EXPECTED.md says "capped, not rejected"). | Per-route `bodyLimit: 1_048_576` on `POST /portfolio` only; keep 256 KB everywhere else. The frontend must show the 413 message. |
| 4 | Low | Report / Pranav | More than 20 tasks overflowed the Report contract; a task without `dsa_topics` threw. | **Fixed**: rows capped at 20; missing topics tolerated. |
| 5 | Known | Runner / Rithvik | Candidate code shares the interpreter with pytest, so it can still forge a consistent report by also forcing exit code 0. | R3: write results outside the candidate's process (separate reporter process or out-of-container check). |
| 6 | Pending | Runner wiring / Karthik | Docker runner merged but not wired; edited code is refused (503) until K9. | `docs/prompts/KARTHIK_Next_Prompts.md` K9. |

## Not yet covered (add when the features land)
- Docker runner through the API with hostile candidate code (needs K9 and a machine with Docker).
- Timer expiry and auto-submit (needs a clock override in tests).
- Tier unlock and upgrade abuse (K10): upgrading before unlock, double upgrades, hints in Novice.
- Assistant jailbreak suite (R5): `src/backend/tests/fixtures/llm/jailbreaks.json`.
