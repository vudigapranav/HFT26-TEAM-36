# TorqueCode backend decisions

Status: the independent-validation policy below describes the current change. Later sections retain the earlier architectural decisions and historical ownership context.

## 2026-10-31 — independent validation policy (supersedes earlier K5/K6 descriptions)

The backend now supports four reviewed Python task families: request peak, second-largest distinct integer, event deduplication, and session windows. Their fixed contracts, hand-derived examples, references and grading templates live in `generation/families.ts` and the reviewed seed bank. Expected outputs for newly assembled grading tests come from independent TypeScript implementations (sorting/exhaustive selection/brute-force windows), never from executing the candidate reference. Validation additionally compares the reference against fixed and reproducible seeded-random oracle cases in three isolated executions.

The LLM can select a permitted family/scenario ID. It cannot author executable code, statements, examples or answer keys. Statements are rendered from fixed contracts and verified examples. An altered statement, unsupported family, unreviewed reference implementation, untrusted test template, missing oracle result or unavailable runner cannot receive a valid certificate. The Python topic scanner remains a supplementary indicator; the topic claim depends on the reviewed implementation provenance. Performance means the pinned workload/time assertion, not a proof of algorithmic complexity. Families without a runtime requirement report `not_applicable`.

The factory seam remains compatible with K8 (`createGenerator` dependencies and `generateAssessment` return shape unchanged), and API wiring uses this implementation. A fallback now needs real semantic/structural verification too; test doubles that return only `valid: true` are deliberately insufficient. `source: generated` means an assembled reviewed template selected with the model, not novel model-written code. With no provider, reviewed seed fallback is explicitly marked `seed_bank`.

Durable assessments remain unavailable until validation completes. The worker first verifies its fallback, then may attempt model selection; a provider timeout can reuse only that already-verified fallback. Without verified tasks, the job fails without grading or producing a report. Policy version and semantic evidence are stored in existing private generation JSON; no migration is needed. Public status adds optional `generation.verification` and does not expose private progress fields. On upgrade, active legacy jobs are revalidated while retaining candidate files, grades, unlocks and deadlines; a persisted revalidation marker preserves this behavior after interruption. Completed historical reports are retained without claiming retrospective certification.

Limits: Python only; a bounded library with fixed reviewed difficulty tiers; contextual adaptation from profile/domain/claims, not inspection of project repositories. Finite oracle checks and reviewed contracts improve correctness assurance but are not a formal proof, universal task validation, automatic difficulty calibration, or a complete prose-leak detector. Adding a family requires review of its contract, independent oracle, hand-derived anchors, starter behavior and grading template. Change the validation policy version when correctness rules or trusted artifacts change so active sessions are rechecked.

## Scope and sources

- Karthik owns K0–K8, including the API, contracts, generation, validation, Python analysis tools, seed bank and integration.
- The supplied split matches canonical `docs/TorqueCode_Backend_Plan.md`, now inherited from origin/main along with the setup kit. Teammate files are inherited unchanged; only owned/shared paths are modified.
- The current context leaves validation language to K0. TypeScript orchestration and Python AST tools follow the approved decision; correctness remains deterministic.
- Existing `core/` and `ai_engine/` placeholders remain untouched. Use the split's owned folders for implementation.

## Stack

| Area | Decision |
|---|---|
| Backend | TypeScript, strict mode; Fastify 5; ESM |
| Runtime | Node 24.22.1 recommended; installed Node 26.7.0 is also checked. Exact verification results live in the status log. |
| Dependencies | pnpm 11.25.0; workspace and frozen `pnpm-lock.yaml` |
| Shared models | TypeBox 1; official Fastify TypeBox provider; runtime schemas plus inferred types |
| Python | Python 3.13; uv project and lockfile; pytest. AST scripts are JSON-in/JSON-out, never imports/evaluation of untrusted source. |
| Database, K2 | PostgreSQL 16, pg 8, numbered SQL migrations and parameterized SQL; no ORM |
| Authentication, K2 | Email/password with Argon2id; random opaque sessions, hashed tokens in PostgreSQL, HttpOnly cookies; HTTPS Secure cookies and CSRF/origin checks |
| Jobs, K4 | pg-boss 12 using PostgreSQL; one trusted worker entry point in the same codebase, bounded retries and idempotent writes; no Redis |
| Execution, R1–R3 | Rithvik's Docker runner, Python first, pytest. No network, non-root, resource/time/output limits. Must be proved on the actual demo machine. |
| Featherless, R4 | Only `src/backend/llm/` calls the provider, through one shared queue. Rithvik records measured model choices and plan limits later. |

K1 installs only its own dependencies. PostgreSQL, auth and job dependencies arrive with their implementation tasks.

## Contracts and integration

- Public package: `@torquecode/contracts`, at `src/backend/contracts/`. Export `public.ts` and public route inventory `http.ts` only. Internal models and seams are relative server imports and absent from package exports.
- `public.ts` supplies portfolio, normalized profile, task, run result, integrity events, errors, progress, quiz and report schemas/types. Never duplicate these in teammate modules.
- `internal.ts` holds private task artifacts, runner requests/results, session/event data and validation receipts. `seams.ts` holds the ten callable boundaries.
- Async seams accept `AbortSignal`; real implementations must bound their own external calls. Caller cancellation is not a sandbox.
- `SeamResult` distinguishes real `ok`, explicit development `fixture`, and `unavailable`. Production wiring must reject fixture results. Validation, generation, scoring and report stubs return unavailable; they never invent passing receipts, grades or outcomes.
- Quiz has two operations under one seam: questions and answer submission. Lanes must remain within the profile's claims.
- Assistant model context is public task data, current files, visible failures, message and history. References and hidden tests never enter that context. A server-side output guard may access references separately.
- Candidate Run selects visible tests; Submit selects all tests. Public results contain visible details and hidden aggregates only. All Submit stdout/stderr are discarded at the public boundary.
- API task projection uses explicit nested allow-lists. Generated task metadata must never become a Fastify schema: schemas are trusted application code.
- REST JSON uses the context's draft resource paths; progress initially uses polling. Only `/health` exists in K1. `contracts/http.ts` inventories future paths without claiming implementation. `pnpm openapi` emits only implemented routes.

```text
Frontend -> public contracts -> Fastify app -> injected Ports
                                           |-- Karthik generation/validation
                                           |-- Rithvik runner/LLM
                                           `-- Pranav intake/quiz/scoring/report
```

## Owned structure

| Area | Owner / structure |
|---|---|
| `src/backend/api/` | Karthik: factory, config, server entry, projections, errors, development adapters and smoke commands; later auth/session/routes/jobs |
| `src/backend/contracts/` | Karthik: public schemas/package, private models and seam signatures |
| `src/backend/generation/` | Karthik: later validation gates, orchestration, prompts and fallback |
| `src/backend/tools/` | Karthik: later Python AST tooling |
| `src/backend/seed_bank/` | Karthik/Aryan: manifest, starter/reference, visible/hidden tests and hints |
| `src/backend/runner/local/` | Karthik's explicit K1 exception: immutable fixture runner, reporter and process supervision |
| Other `runner/`, `llm/`, `deploy/` | Rithvik; no implementation changes by Karthik |
| `intake/`, `scoring/` | Pranav; no implementation changes by Karthik |
| `src/backend/tests/` | Shared; each person tests their area and shared contracts |

The ownership map is reused from Pranav's merged setup kit, with one explicit addition: Karthik owns `src/backend/uv.lock`. Runtime configuration remains in package/project files, not extra unowned root files. Root manifests and workspace configuration are setup/shared integration files.

## Local stand-in safety and limits

The K1 stand-in accepts only the complete digest-verified seed-1 starter/reference, exact test manifest and exact limits. It writes verified artifacts into a fresh temporary directory, runs real pytest in a separate process group, validates every expected test ID and exit-code/result agreement, then cleans up. It strips inherited application credentials, disables automatic pytest plugins, enforces a wall-clock deadline and caps combined output.

It is **not a sandbox**. Memory, CPU and process-count isolation are not enforced by this stand-in. There is no candidate execution HTTP endpoint. Edited source, replacement tests/paths/limits and changed seed artifacts are rejected. It must never be used for candidate submissions or LLM-generated code. Rithvik replaces its adapter with the real runner before K3's playable flow.

## Commands

Run from repository root unless stated otherwise:

```sh
pnpm install --frozen-lockfile --ignore-scripts
uv sync --project src/backend --python 3.13 --locked
pnpm ownership:check
pnpm typecheck
pnpm build
pnpm test
pnpm smoke:seams
pnpm test:seed1
pnpm test:python
pnpm openapi
pnpm dev
```

- HTTP: `http://127.0.0.1:3001/health`; set PORT to a valid integer to change it. K1 refuses remote binding and non-skeleton modes. No database, key or `.env` file is needed.
- TypeScript per-area tests after the contracts build: `pnpm --filter @torquecode/backend exec vitest run --config vitest.config.ts tests/<area>`.
- Shared contract tests: replace `<area>` with `contracts`. Every backend contributor runs these plus typecheck and their own tests before requesting review.
- Future Python tools: `uv run --project src/backend pytest src/backend/tests/tools` once those tests exist. No tool suite is claimed in K1.
- Do not run pytest over the whole seed bank: starter tests intentionally fail, and starter/reference must execute in independent workspaces. Use `pnpm test:seed1`.
- Copying `.env.example` is optional; its secret placeholders are empty. K1 does not automatically load `.env`.

## Open product and infrastructure decisions

- Q1 LOCKED (Pranav, 2026-10-31): one server-authoritative 60-minute session; no per-tier budgets. Submit every question in the current set, regardless of correctness, to make the next set eligible for voluntary unlock.
- `TODO(OPEN-Q2)`: quiz purpose, scoring and timing relative to the 60-minute timer.
- Q3 LOCKED (Pranav, 2026-10-31): at most two voluntary unlocks; declining keeps the current set accessible, and previously unlocked questions remain accessible until expiry. No candidate-facing tier names.
- `TODO(OPEN-Q4)`: Novice AIE treatment and score aggregation/outcomes remain open. Pranav has locked H_max=6, hint/assistant weights, the first-of-three-runs-or-ten-minutes window, final-submit gate, and starter hash as the first-run baseline in context §12. Pranav owns their scorer implementation; K1 computes no grade.
- `TODO(OPEN-ASSISTANT-LIMITS)`: Adept/Master hint and assistant limits.
- Empty topics: Karthik confirmed arrays/strings fallback WITH a visible warning on 2026-10-31. Use parsePortfolioDetailed; never discard the warning.
- `TODO(OPEN-Q7)`: Python-first MVP scope and explicit behavior for unsupported candidate stacks; JavaScript is a contract value, not an implemented runner.
- `TODO(OPEN-Q9)`: measured Featherless models, limits and fairness between generation/assistant calls.
- `TODO(OPEN-Q10)`: organizers' portfolio schema, deployment requirement and actual demo machine.
- Setup-kit integration: inherited from current origin/main; preserve the filled decisions and explicit uv.lock ownership addition. core.hooksPath is .githooks.

## Acceptance and release state

K1 requires clean install/build/typecheck, all ten callable seams, real repeated seed runs, explicit rejection of candidate code, public-data leakage checks, bounded process behavior and documented limitations. See `docs/status/karthik.md` for actual commands/results and remaining work. No benchmark, production security certification or end-to-end assessment is claimed.

## Approved compatibility exception to the checkpoint prompts

After reading the K1 checkpoint prompts (working notes, removed before submission), Karthik explicitly chose: “Keep the earlier approved K1 contracts and ship them, explicitly flagging the differences to Pranav and Rithvik.” The original approval applied to K1. On 2026-10-31 Karthik explicitly extended the same stack and contract decisions to K2; conflicting checkpoint defaults remain superseded.

- Historical K1 scope: the original skeleton did not complete the newer K1a/K1b checkpoint sequence. K2 auth is documented separately below; checkpoint assessment endpoints and in-memory sessions remain outside this change.
- Shared public package uses TypeBox `public.ts`, snake_case fields, and server-private `internal.ts`. It does not provide Zod `schemas.ts` or camelCase aliases.
- Seam names are `runTests`, `chat`, `nextHint`, `assistantReply`, `generateAssessment`, `validateTask`, `parsePortfolio`, `quiz`, `calculateAie`, `buildReport`. `quiz` accepts either profile-only or answers; there are no `llmChat`, `getQuiz`, `scoreQuiz`, or `computeAIE` aliases.
- Integration adapters are `api/dev-stubs.ts`; the server injects Ports. There is no `api/wiring.ts` yet. Pranav and Rithvik must use `contracts/seams.ts` rather than assuming the newer prompt's filenames/signatures.
- `pnpm` workspace, Node 24.22.1, Python 3.13, pytest and proposed PostgreSQL/opaque-cookie authentication remain the approved stack; npm, Python 3.12, SQLite/Prisma and JWT in the prompt are superseded defaults, not implemented requirements.
- K1 exposed only `/health`; explicit auth mode now adds the four K2 auth routes. `pnpm openapi` prints enabled OpenAPI; no `/docs` Swagger UI is claimed.
- Pranav's large/empty-topic intake fixture expectations conflict with K1 input caps/strict claimed-topic bounding. Resolve these before wiring P1/K4; do not silently change teammate fixtures or add claimed topics.


## K2 database and authentication

- Explicit `APP_MODE=auth` requires `DATABASE_URL` and exact `AUTH_ORIGIN` (no trailing slash/path). Default skeleton mode still needs no database and exposes health only. Health mode is now `skeleton | auth`; candidate execution remains false. Binding remains loopback pending Rithvik's deployment integration.
- `pnpm db:migrate` applies numbered SQL transactionally, under an advisory lock, with immutable SHA-256 migration checksums. Migrations are an explicit operator action, never applied automatically at startup. Choose a dedicated TorqueCode database; never point migrations at an unknown existing database. Compiled builds include migration SQL.
- `auth_users`: UUID identity, lowercase unique email, Argon2id hash (19 MiB, 2 iterations, parallelism 1). Email case is intentionally ignored; password whitespace is preserved. Credentials require a valid email <=254 characters and password 12–128 characters; auth bodies are capped at 2 KiB. No email verification/password reset is included in K2.
- POST `/auth/register` returns 201 `{user:{user_id,email}}`; duplicate email returns 409. Registration does not log in. POST `/auth/login` returns 200 with the same public user and a fresh 256-bit cookie token; invalid account/password returns identical 401 errors and performs Argon2 verification against a dummy hash for missing accounts.
- GET `/auth/me` is the protected endpoint. Identity is derived exclusively from the session cookie. POST `/auth/logout` deletes only the presented session and clears its cookie (204, idempotent). `auth_sessions` holds SHA-256 token hashes, never raw tokens; expiry is seven days with no sliding extension. Expired rows are rejected by SQL and removed on subsequent login.
- Cookies: HttpOnly, Path=/, SameSite=Lax (Karthik’s latest explicit proxy decision), Max-Age/Expires. HTTPS origins use Secure and `__Host-tc_session` without Domain; HTTP is restricted to loopback development and uses `tc_session`. NODE_ENV=production requires HTTPS. Browser/API traffic must use the configured same origin (e.g. reverse proxy); no cross-origin CORS integration is added.
- Exact Origin is required on every state-changing request in auth mode, including register/login/logout; absent, `null`, foreign and lookalike origins fail before parsing/SQL. CLI callers must supply Origin. Auth responses use Cache-Control: no-store. Public TypeBox responses exclude hashes and session secrets.
- Database rate counters allow 20 attempts/IP and 10/account in fixed 15-minute windows shared by register/login and across app processes. Successful attempts count too. Keys are hashed; expired counters are cleaned on credential attempts. X-Forwarded-For is not trusted. Each app allows at most two in-flight credential operations and rejects excess work with 429/Retry-After. Multi-instance global work limits and edge throttling remain deployment concerns.
- `pnpm test:auth` always creates/removes its own PostgreSQL cluster with a private Unix socket, no TCP listener, rejecting TCP auth. It ignores inherited DATABASE_URL. PostgreSQL binaries must be installed (`pg_config`, optionally PG_BIN). `pnpm test` includes it; unavailable PostgreSQL now explicitly skips (TORQUECODE_REQUIRE_DB=1 requires it), while launched migration/assertion failures still fail. A skipped integration suite in a direct Vitest run is not PostgreSQL verification. In this Codex sandbox, initdb is blocked by shmget permissions (an environment limitation). Karthik reported a successful host-terminal test:auth run on 2026-10-31: 1/1 file, 9/9 real PostgreSQL auth tests passed. See status log for evidence attribution.
- New public auth schemas and `/auth/me` inventory are additive; ten seams and assessment Session remain unchanged. Pranav/Rithvik module implementations are untouched. Karthik has approved the visible empty-topic fallback; tier and Novice-only scoring policies remain TODO(OPEN-Q1/Q4).


## K3 + K4-lite checkpoint API (2026-10-31)

- K2 was published as 1a8d9c1 and merged by the team in PR #9 (edeb1fb). Follow-up branch karthik/k3-k4-lite inherits K2; do not merge either PR automatically. Karthik explicitly reordered work: publish K2, then this checkpoint API before further auth polish.
- Server APP_MODE=auth now enables auth plus the seed assessment routes. Skeleton mode remains health-only. All assessment routes use the shared PostgreSQL cookie-session reader and enforce per-user resource ownership. Assessment/portfolio state is deliberately in memory; restart loses it, while auth users/sessions remain in PostgreSQL.
- POST /portfolio uses Pranav’s parsePortfolioDetailed and returns `{profile,warnings,injection_flags}`. Input caps/normalization are delegated to that parser under the global request-body cap. Empty topics visibly fall back to arrays/strings. GET/POST /onboarding-quiz uses Ports.quiz wired to intake/quiz.ts; only offered question/option pairs and unique answers are accepted. Upload is required first; quiz submission is optional while TODO(OPEN-Q2) remains.
- POST /assessments with `{}` creates a single Novice seed session for 60 minutes. The seed uses arrays; profiles without arrays receive 422 SEED_TOPIC_UNAVAILABLE instead of fabricated personalization or added claimed topics. One active assessment/user; no guessed tier unlock or upgrade policy (TODO(OPEN-Q1)). Seed domain/content remain explicit fallback data, not generated/personalized tasks.
- GET /assessments/:id/status returns server remaining_sec, expires_at, report_id, policy_todos and runner capability. GET /assessments/:id/tasks/:taskId projects public fields plus the user’s saved editable files. PUT .../files autosaves only the exact editable file set. POST .../run and .../submit accept `{}` for saved files or `{files:[...]}` for a replacement editable set; server supplies all tests, limits and task identity. Hidden tests are aggregates only and submit stdout/stderr are removed.
- Wiring lives only in api/wiring.ts: real parsePortfolio/quiz/calculateAie/buildReport, reviewed seed hint ladder and immutable local runTests. Replace runTests with Rithvik’s runTestsDocker only after it merges and is verified against contracts/seams.ts. Local mode refuses arbitrary candidate edits with 503 SANDBOX_UNAVAILABLE; it runs only exact reviewed starter/reference fixtures. It is not a playable sandbox for general submissions.
- API-generated run/submit events contain `{run_id,files_hash}` using scoring/aie.ts hashEditableFiles; hint_served contains `{level}`. POST /assessments/:id/hint with `{}` serves levels 1–3 through Ports.nextHint. It is the explicitly requested checkpoint hint-ladder route; no Novice live assistant is exposed. POST /assessments/:id/events accepts only public integrity event types, timestamps them server-side and cannot forge scorer run/submit events.
- Deadline: one-second sweep plus request-time checks marks the assessment finished and attempts one automatic submit of saved files. Edits after expiry are rejected. Unavailable isolated execution records auto_submit_error; no fake result is stored. The completed report remains readable. This is process-local expiry, not crash-resilient scheduling. Manual submits may be repeated until expiry.
- GET /reports/:id (use report_id from creation/status) calls real buildReport; calculateAie is wired for later AI tiers. Before expiry this is a current snapshot. Novice scoring preserves Pranav’s existing named provisional fallback with TODO(OPEN-Q4); no AI score is invented for Novice.
- Bounds: at most 100 stored profiles and assessments/process; 100 runs/assessment, 900 normal events with reserved space for finalization, and two concurrent runner operations/process. Restart clears process-local capacity. No cross-process assessment persistence or quotas are claimed.
- Akshit handoff: frontend dev server proxies `/api` to `http://127.0.0.1:3001` AND strips `/api`; preserve the browser Origin. Frontend uses `/api/auth/...`, `/api/portfolio`, etc., with normal same-origin cookies. Set AUTH_ORIGIN to the frontend origin (for example http://localhost:5173), use one consistent hostname, no CORS. Cookies are HttpOnly + SameSite=Lax; HTTPS still uses Secure/__Host-. Teammate frontend files are untouched; proxy configuration and browser integration are not yet verified.
- Demo database preparation: prefer Homebrew postgresql@16 on the currently host-tested Mac (installed and real auth tests passed); Docker is not on this Mac’s PATH. Use a fresh dedicated data directory/database. Do not start or modify an unknown default Homebrew cluster. Docker compose remains Rithvik’s alternative when available. The actual demo machine/teammate confirmation is still pending; no Rithvik agreement or deployed database is claimed.


## K9 — Docker API wiring (2026-10-31)

- Demo mode is `RUNNER=docker` with `APP_MODE=auth`. `api/wiring.ts` selects Rithvik's `runTestsInDocker`; other modes retain immutable `runSeedTests`. `RUNNER_IMAGE` defaults to `torquecode-runner-python:dev`; an explicitly empty value is normalized by API wiring without editing R2's implementation.
- Build the image from repository root: `docker build -t torquecode-runner-python:dev src/backend/runner/images/python`. Startup runs one bounded, shell-free `docker image inspect` for the selected image and logs runner/image/availability. Missing Docker, daemon or image does not stop the API. `/health` reports `status:degraded`, `runner:isolated`, `runner_available:false`; assessment state exposes the same availability/image. A real unavailable execution remains 503 SANDBOX_UNAVAILABLE with no grade or run/submit event. Later successful execution can restore readiness. No silent fallback to the local runner.
- In Docker mode, edited candidate files are allowed only for this task's exact editable paths. Test/config/unknown/traversal/absolute paths are rejected before runner invocation. Trusted non-editable task files, tests and limits are supplied by the server. Run/submit logs keep `{run_id,files_hash}`. Public run responses still expose visible details and hidden aggregate only; submit stdout/stderr are discarded.
- `/portfolio` alone accepts a 1 MiB body so the real intake parser caps huge portfolios with visible warnings. The global limit remains 256 KiB; auth's smaller limit remains unchanged. Flow tests validate every success/error response with TypeBox `Value.Check` against explicit public contracts; Fastify response schemas are not claimed as runtime validators.
- Root `.gitattributes` pins text to LF to preserve the reviewed seed digest on Windows. TypeScript includes runner/intake/scoring/llm/generation modules explicitly. Runner implementation, images, intake/scoring and LLM source are unchanged by K9.
- Recorded Rithvik model choices from his R0 measurements: generation `Qwen/Qwen3-Coder-30B-A3B-Instruct`; assistant `Qwen/Qwen3-30B-A3B-Instruct-2507`. Set FEATHERLESS_MODEL_GENERATION/ASSISTANT explicitly when R4 is wired. These are measured tiny-prompt proposals recorded at Karthik's request; long generation, concurrency/429 behavior and live API integration remain unverified. No provider calls or key values are added here.
- R2 is container isolation for the demo, not production grading integrity: Rithvik documents that candidate code shares the pytest interpreter and can forge a consistent report by forcing exit 0, and /out lacks a size cap. R3 remains his hardening task; K9 does not alter or certify those properties.
- Verification commands: `pnpm typecheck && pnpm test`; additionally `RUNNER=docker pnpm test` on a Docker/image-equipped machine. Real Docker suites use describe.skipIf when missing. Skipped Docker checks are reported explicitly, never as verified container execution.

## K10 question-set implementation

- One 60-minute timer; attempt-based voluntary unlocks, maximum two.
- Every question in the current set requires a validated Submit before unlocking.
- Question sets support multiple tasks and retain independent files.
- Previously unlocked questions remain editable and runnable.
- Candidate assessment JSON uses neutral question IDs and assistance flags.
- Hints and guarded assistant are restricted to higher-level questions.
- LLM availability is separate from deterministic grading.
- Review status: full backend Vitest run reported 255 passed and 9 auth integration tests skipped. The skipped tests require isolated PostgreSQL verification.
- Follow-up integration: reconcile report task filtering and scoring with Pranav's P11 changes before merging.

## K5 validation receipt scope and Master performance naming

- The current private task contract declares neither machine-readable statement examples nor a brute-force oracle. The examples receipt therefore says "No statement examples declared; covered by visible tests". It is not proof that prose examples were executed.
- The differential receipt currently establishes only "Reference deterministic across 3 runs (no brute-force oracle supplied)". It does not claim reference/oracle comparisons or randomized differential cases. K6 must add and execute a supported oracle before claiming differential validation.
- Master performance tests must have a trusted test ID matching `/performance|perf|large_window/i` (for example `tests/test_hidden.py::test_large_window`). At least one such test is required; each must pass on all three reference runs and fail on the starter. The trusted test supplies the actual input size and timing assertion. This does not establish a brute-force timing comparison.

## K11 PostgreSQL assessment persistence

- Migration `002_assessments.sql` follows immutable, numbered checksums and the existing transaction/advisory migration lock. Apply `pnpm db:migrate` explicitly before startup. Auth mode now requires both auth and assessment tables.
- The server uses `PostgresAssessmentStore`. Its map-shaped working copies exist only inside a request transaction; production has no process-wide profile/assessment cache or 100-item capacity limit. The memory adapter remains for isolated unit tests only. Queries load the caller's latest profile and the addressed assessment (or active assessment on creation), with SQL ownership predicates.
- PostgreSQL stores portfolio/profile history, the latest quiz focus and assessment-bound focus snapshot, session deadlines/unlocks, private task snapshots, editable files, runs, append-only events with server occurrence timestamps (never client-supplied timestamps), report snapshots/final reports and generation jobs. Private task JSON stays server-side. Stored run JSON uses the public projection: visible details and hidden aggregate, with submit stdout/stderr removed. Restoring internal scoring data from hidden aggregates never recreates hidden source or expected outputs.
- A per-user PostgreSQL advisory transaction lock serializes changes across API instances. The partial unique active-assessment index enforces one active session/user; SQL enforces 30 executions per assessment/minute. The previous process-wide profile/assessment caps and 100-run lifetime cap are removed. Existing per-assessment event and assistant quotas remain.
- Every successful mutation commits before the route returns. Guarded assistant callbacks collect metadata in the transaction working copy; assistant_message, assistant_blocked, extraction_flagged and hint_served are awaited inserts before reply delivery. An insert/commit failure returns sanitized 503 PERSISTENCE_UNAVAILABLE and withholds the reply/hint. Unavailable runner/provider calls create no usage/grade events.
- Startup and a one-second sweep find expired unfinished records by persisted expires_at. Auto-submits, session_end and final reports commit atomically under the same user lock. A second process/restart sees expiration finalized and does not repeat committed auto-submits. A crash before commit can repeat external runner execution; exactly-once persistence is guaranteed, not exactly-once invocation of an external process.
- Generation uses the assignment's durable generation_jobs table, replacing the earlier unimplemented pg-boss plan without adding a queue dependency. Creation returns immediately with queued progress. A bounded worker calls Ports.generateAssessment and deterministic validation under one end-to-end deadline; late progress cannot reopen terminal jobs. The profile and focus are snapshotted when the assessment starts; missing K6, failure or timeout resolves to reviewed seed tasks. PostgreSQL session advisory locks prevent concurrent workers processing the same job. Interrupted jobs resume on restart. Generated tasks must pass Ports.validateTask before use; progress and receipts expose only selected public fields, never provider text or private task artifacts.
- GET /reports pages through the caller's completed reports ({id,created_at,final_score,outcome}), 100 at a time in descending creation/ID order. A returned next_cursor is supplied as ?before=<id> for the next page; cursors are ownership-checked in SQL and older history remains accessible; GET /reports/:id preserves current snapshots during an active session and durable final reports afterward. Ownership is enforced in SQL.
- TRUST_PROXY accepts true/false, default false (empty example value also means false). Only explicitly enabled deployments trust the first x-forwarded-for hop, through Fastify's proxy handling, for IP rate limits. The backend must be reachable only through the trusted Vercel/reverse-proxy path when enabled; arbitrary direct callers must not be permitted to supply trusted forwarding headers. AUTH_ORIGIN and same-origin Secure/HttpOnly/SameSite=Lax cookies remain unchanged; no CORS is added.
- `pnpm test:persistence` uses the isolated PostgreSQL harness. `pnpm test:auth` and the full `pnpm test` include auth plus persistence suites. Native initdb is tried first; an existing postgres:16 image can supply a fresh, uniquely named, loopback-only ephemeral test container if native startup is unavailable. The harness never uses inherited DATABASE_URL and removes only its own resources. TORQUECODE_REQUIRE_DB=1 makes unavailable infrastructure fail instead of skip.

## K8 — final backend integration

- P13 `Report.claims` remains optional for legacy callers. Assessment creation snapshots the candidate profile; PostgreSQL hydration restores that same profile for claims-vs-demonstrated reports, even after a newer portfolio upload.
- K6 is wired through `api/wiring.ts` using `createGenerator`, the configured chat and runTests ports, K5 deterministic validation, and reviewed seed-bank fallback. Explicit test overrides remain supported.
- A provider failure returns compatible reviewed seeds rather than claiming generated tasks, and only after the same semantic verification as a generated task (independent oracle executed in the isolated runner); otherwise nothing is released. The aggregate generation source is `generated` when at least one accepted task was generated; otherwise it is `seed_bank`. Individual task provenance remains in private task metadata.
- Receipts follow the independent-validation policy at the top of this file: `differential` = agreement with an independent oracle, `examples` = pinned contract and structured examples. Performance test IDs are per family (`performanceIds` in `generation/families.ts`); the earlier `/performance|perf|large_window/i` naming rule is superseded.
- R3 uses split-container grading so candidate code cannot directly control the trusted grader's result. Adversarial tests include forged reports, hidden-test access, process exits, resource exhaustion and network isolation. This is not a proof of protection against Docker or kernel escapes.
- R5-live measured 0 observed leaks across 22 scenarios after guard improvements, with 5/5 honest prompts answered. The measured sample covers one model and task; prose hints and unseen paraphrases remain risks.
- K8's real PostgreSQL API integration exercises authentication, demo portfolio, quiz, all three question sets, two voluntary unlocks, fake guarded assistant, hints, claims, and report persistence across a backend restart. The journey deliberately uses fake runner and chat ports plus the harness's validation certificate double, so it proves persistence, not task correctness; real Docker validation is covered by `tests/generation/k8-wiring.test.ts` and `arrays-families.test.ts`, and provider behaviour needs separate checks.
- `TRUST_PROXY` defaults to false. It may be enabled only behind a controlled trusted reverse proxy; forwarded identity headers from arbitrary direct callers must not be trusted. The prepared R6b deployment kit is not proof of a live cloud deployment.
