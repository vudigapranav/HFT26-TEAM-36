# Karthik — backend progress and verification

This file distinguishes implementation, executed verification, integration readiness and merged completion. A passing check is not proof of complete correctness or security. New work updates this record with actual evidence.

## Responsibility tracker

| Task | Implementation | Verification / integration |
|---|---|---|
| K0 decisions | Stack approved; Karthik confirmed team agreement. Decisions documented. | User re-confirmed original contracts after reading later checkpoint prompts; K1 PR pending. |
| K1 skeleton/contracts/seed | Implemented in the team checkout; ready for review, not committed/merged. | Initial verification was 14 tests. Skill-assisted review now adds five TS cases and four real Python cases; final integrated verification below. |
| K2 database/login | Not started | Not tested |
| K3 sessions/timer/tiers | Not started | Blocked on product policies and real runner for candidate flow |
| K4 complete API/background jobs | Not started | Not tested |
| K5 validation engine | Not started | Seed checks are not the complete validation engine |
| K6 generation pipeline | Not started | No live Featherless call or generated task tested |
| K7 Adept/Master seeds | Not started | Novice seed only in K1 |
| K8 end-to-end integration | Not started | Shared seam smoke is not the full assessment journey |

## Current verification

Verified first in a temporary build, then in this actual team checkout on 2026-10-30 (Asia/Kolkata). All results below were observed; checks are not a claim of exhaustive correctness.

| Command / check | Actual result | What it establishes |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed | Workspace installs from the frozen dependency lock |
| `uv sync --project src/backend --python 3.13 --locked` | Passed; Python 3.13.5, pytest 9.2.0 | Real Python seed-test environment available |
| `pnpm typecheck` | Passed | Strict TypeScript integration checks |
| `pnpm build` | Passed | Contracts and backend compile |
| `pnpm test` on Node 26.7.0 | 14/14 passed across 4 files | API, contracts, seams and trusted runner behavior |
| Same Vitest suite on Node 24.22.1 | 14/14 passed across 4 files | Recommended runtime compatibility |
| `pnpm smoke:seams` | Passed, all ten seams called | Real seed execution; fixtures/unavailable responses remain explicit |
| `pnpm test:seed1` | Reference 5/5 on each of 3 runs; starter 2 F2P failures and 3 P2P passes | Real deterministic seed behavior, no syntax/import failure |
| `pnpm openapi` | Passed in temporary build; only `/health` documented | Does not advertise unimplemented endpoints |
| `pnpm ownership:check` | Passed; all 44 changed files permitted for Karthik | Teammate implementation folders untouched |
| Node 24 compiled backend + real HTTP request | Passed, HTTP 200; listener closed after probe | Built app listens and returns the expected health response |

Behavior covered: unknown/mistyped/oversized/malformed requests, sanitized internal errors, loopback configuration, private export rejection, nested task leakage sentinels, hidden-result/log filtering, rejection of frontend-forged scoring events, request/source/test/path/limit tampering, changed disk artifacts, visible-only runs, process timeout/output cap/cancellation, repeated reference stability and explicit non-grading stubs.

Early failures corrected: TypeBox array-to-union inference was unsuitable and replaced with typed enums; Fastify error typing corrected; test-harness resolution of a forbidden private import replaced with Node's actual package-export check. The latest runs above pass.

No test results are simulated. Development fixtures are labelled. No coverage percentage, exhaustive correctness claim, load benchmark or security certification is asserted. Authentication, ownership of stored records, database/jobs, production sandbox anti-tamper, live AI, Python AST tools and the complete frontend journey remain untested because they are not implemented in K1.

## Integration notes

- Work stays on `karthik/backend`; no commit, push, rebase, merge or branch switch is performed.
- Pranav's `setup-kit` branch is only locally inspected. Canonical backend split there is identical to the supplied document. Preserve this filled decisions file when that kit lands.
- Public contracts package and ten server-side seams are K1's main integration deliverable. No changes to frontend, intake, scoring, LLM or real runner/deployment modules.
- Candidate execution, live generation, authentication, database, grading policies and full frontend journey are not ready.

## Next

Review K1. Next implementation is K2: PostgreSQL schema, registration, login and a protected endpoint. Product policies stay open for later tasks. Karthik reviews backend integration; Pranav owns final merge. No commit/push/merge has been performed.

## 2026-10-30 23:23 IST — K1 — verified skeleton ready for review

- Changed: 44 owned/shared files, including decisions, progress documentation, workspace setup, public/private contracts, all ten seam adapters, API health/errors, trusted seed runner and original Novice task.
- Seam impact: Rithvik and Pranav can compile against `contracts/seams.ts`; frontend imports only `@torquecode/contracts`. Stub fixtures and unavailable results are explicit.
- Final evidence in this checkout: frozen installs, ownership check, strict typecheck/build, 14 passing tests on Node 26 and 24, ten-seam smoke, repeated real seed runs and compiled-app HTTP health check.
- Remaining limits: no candidate sandbox, auth/database/jobs, live LLM, full validation/generation, scoring/report implementation, Python AST tools or full frontend journey. No percentage coverage or perfect-test claim.
- Git: remains `karthik/backend`; changes uncommitted; no push, merge, rebase or branch switch.

## 2026-10-30 — K1 — skill-assisted engineering review and shipping preparation

User authorized reviewing/fixing and shipping original K1, then waiting for “next”. Later K1a prompt differences were presented; user explicitly chose the previously approved contracts. New task branch is `karthik/k1-skeleton`, created from the latest origin/main after preserving original work in a backup stash. The original `karthik/backend` branch is retained. `git checkout main`, `git pull --ff-only origin main`, and `git config core.hooksPath .githooks` were completed safely.

### Skills actually loaded and applied

| Installed skill | Instructions loaded | Concrete effect |
|---|---|---|
| api-design-principles | `/Users/karthik/.agents/skills/api-design-principles/SKILL.md` | Reviewed response schemas, resource inventory, HTTP errors and contract consumers; fixed the missing nested required-field path. No unrelated route rename/versioning. |
| api-security-review | `/Users/karthik/.agents/skills/api-security-review/SKILL.md` | Inventoried health-only surface and all ten OWASP API categories; reviewed projections, output caps, caller trust, credentials and execution paths; UTF-8 cap repair. Referenced `plays/api-security-review.md` is absent, so its extra playbook coverage is unavailable. |
| python-testing-patterns | `/Users/karthik/.agents/skills/python-testing-patterns/SKILL.md` and `references/details.md` | Applied only to Python reporter/seed tests: isolated tmp_path fixture, parametrized real pytest subprocesses, explicit pass/fail/setup/teardown cases. |
| code-review-excellence | `/Users/karthik/.agents/skills/code-review-excellence/SKILL.md`, `references/review-techniques.md`, `references/review-patterns.md` | Read source/consumers, prioritized demonstrable defects, wrote red-before-green regressions, left future modules and taste refactors unchanged. |
| gstack-review | `/Users/karthik/.codex/skills/gstack-review/SKILL.md`, shared preamble, installed review checklist and functional QA methods | Initialized real gstack review/evidence records, included untracked K1 source, critical/informational passes, gate scan, replayed probes, and native adversarial subagent. Native reviewer read fixtures in summary mode; parent reviewed full tests. Claude Code CLI is unavailable, so no external-model review is claimed. |

### Confirmed defects and regression proof

1. **P2 output bytes:** raw byte truncation followed by UTF-8 replacement returned 3 bytes for a 1-byte cap (also 6 for 2 with invalid UTF-8). Replayed unchanged. Fix caps decoded text on Unicode code-point boundaries and shares the remaining budget across stdout/stderr. Four regression cases were red before the fix.
2. **P2 API field path:** a missing candidate.name returned /candidate. Replayed unchanged. Fix uses Ajv's required missingProperty with JSON-pointer escaping, returning /candidate/name. Added regression was red before the fix.
3. **P2 Python reporter:** real pytest teardown failure had process exit 1 but recorded pass. Replayed unchanged. Existing runner rejected this inconsistency, so no incorrect grade was released. Fix records teardown failure as error. New four-case Python suite initially had 1 failure/3 passes; now 4 pass.

No tests, assertions or timeouts were weakened. `pnpm test` now includes the Python reporter suite, preventing a silent language-specific regression gap. No new dependency was needed.

### OWASP API review disposition

| Risk | K1 observation / disposition |
|---|---|
| API1 object authorization | No assessment/report/user resource routes yet; K2/K4 ownership checks untested, not certified. |
| API2 authentication | Public loopback health is intentional; no login/token/session implementation in K1. |
| API3 property authorization | Explicit nested task projection, private package export rejection and hidden aggregates/log removal tested. No confirmed leak. |
| API4 consumption | Body size, wall-clock timeout, cancellation and output cap tested; UTF-8 bug fixed. Real sandbox memory/CPU/PID isolation remains Rithvik's scope. |
| API5 function authorization | Only health exposed; developer seams are not HTTP endpoints. Future privileged routes not implemented. |
| API6 sensitive flows | Assessment/AI flows are unavailable; quotas and abuse controls must precede their exposure. |
| API7 SSRF | No current outbound fetch/provider call; no SSRF surface found in K1. |
| API8 misconfiguration | Loopback-only config, sanitized errors, empty secret placeholders; no public deployment/TLS/gateway claim. |
| API9 inventory | OpenAPI advertises health only; future route inventory explicitly labelled draft. |
| API10 consumption | Digest-pinned immutable seed, exact requested artifacts, expected structured test IDs and exit-code agreement; teardown-report bug fixed. This is not a hostile-code sandbox. |

### Verification evidence and limits

- Repaired candidate: `pnpm typecheck`, `pnpm build`, `pnpm test` (19 TS + 4 Python), seam smoke, seed verification and ownership checks passed in actual checkout before branch synchronization; repeat integrated verification is required below.
- Original probe/replay and repaired probe checkpoints are retained in `/private/tmp/torquecode-k1-review-evidence/`; the initial 14-test baseline is superseded by repaired-input results. A uv cache permission failure was a setup restriction and passed after escalation; it is not counted as a product defect.
- No percentage coverage, exhaustive security certification, external Claude review or later-task completion is claimed.
- Primary behavior references: Node Buffer decoding https://nodejs.org/api/buffer.html ; pytest reports https://pytest.org/en/stable/reference/reference.html ; Ajv required errors https://github.com/ajv-validator/ajv/blob/master/docs/api.md .

### Teammates should know

Use TypeBox public schemas/package, snake_case models and the ten functions in contracts/seams.ts. The later K1a prompt's Zod schemas.ts, camelCase names, llmChat/getQuiz/scoreQuiz/computeAIE and wiring.ts are not present, by Karthik's explicit decision. This is original K1, not completion of K1a/K1b checkpoint endpoints. Pranav's new scoring constants/window/hash rules are authoritative for P4; K1 computes no grade. Large/empty-topic intake behavior needs agreement before P1/K4 wiring; teammate fixtures/modules are unchanged.

### Next

Finalize integrated tests, documentation audit, pre-push hook and PR to vudigapranav/HFT26-TEAM-36 main. Do not target cbitosc. Stop after shipping K1 and wait for Karthik's “next”.
