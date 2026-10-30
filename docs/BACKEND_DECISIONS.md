# TorqueCode backend decisions

Status: K0 approved; K1 merged in PR #6. Pranav's intake/quiz/AIE (PR #7) and report builder (PR #8) are merged. K2 database/auth is implemented in the working tree on karthik/k2-auth-db; Karthik reports 9/9 isolated PostgreSQL integration tests passed in the host terminal. K2 is not committed, pushed or merged. No merge is authorized.

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

- `TODO(OPEN-Q1)`: exact unlock policy and tier time allocation.
- `TODO(OPEN-Q2)`: quiz purpose, scoring and timing relative to the 60-minute timer.
- `TODO(OPEN-Q3)`: failed-tier and declined-upgrade behavior.
- `TODO(OPEN-Q4)`: Novice AIE treatment and score aggregation/outcomes remain open. Pranav has locked H_max=6, hint/assistant weights, the first-of-three-runs-or-ten-minutes window, final-submit gate, and starter hash as the first-run baseline in context §12. Pranav owns their scorer implementation; K1 computes no grade.
- `TODO(OPEN-ASSISTANT-LIMITS)`: Adept/Master hint and assistant limits.
- `TODO(OPEN-EMPTY-TOPICS)`: reject or explicitly agreed policy; never silently add arrays/strings to claims.
- `TODO(OPEN-Q7)`: Python-first MVP scope and explicit behavior for unsupported candidate stacks; JavaScript is a contract value, not an implemented runner.
- `TODO(OPEN-Q9)`: measured Featherless models, limits and fairness between generation/assistant calls.
- `TODO(OPEN-Q10)`: organizers' portfolio schema, deployment requirement and actual demo machine.
- Setup-kit integration: inherited from current origin/main; preserve the filled decisions and explicit uv.lock ownership addition. core.hooksPath is .githooks.

## Acceptance and release state

K1 requires clean install/build/typecheck, all ten callable seams, real repeated seed runs, explicit rejection of candidate code, public-data leakage checks, bounded process behavior and documented limitations. See `docs/status/karthik.md` for actual commands/results and remaining work. No benchmark, production security certification or end-to-end assessment is claimed.

## Approved compatibility exception to the checkpoint prompts

After reading `docs/prompts/KARTHIK_Codex_Prompts.md`, Karthik explicitly chose: “Keep the earlier approved K1 contracts and ship them, explicitly flagging the differences to Pranav and Rithvik.” The original approval applied to K1. On 2026-10-31 Karthik explicitly extended the same stack and contract decisions to K2; conflicting checkpoint defaults remain superseded.

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
- Cookies: HttpOnly, Path=/, SameSite=Strict, Max-Age/Expires. HTTPS origins use Secure and `__Host-tc_session` without Domain; HTTP is restricted to loopback development and uses `tc_session`. NODE_ENV=production requires HTTPS. Browser/API traffic must use the configured same origin (e.g. reverse proxy); no cross-origin CORS integration is added.
- Exact Origin is required on every state-changing request in auth mode, including register/login/logout; absent, `null`, foreign and lookalike origins fail before parsing/SQL. CLI callers must supply Origin. Auth responses use Cache-Control: no-store. Public TypeBox responses exclude hashes and session secrets.
- Database rate counters allow 20 attempts/IP and 10/account in fixed 15-minute windows shared by register/login and across app processes. Successful attempts count too. Keys are hashed; expired counters are cleaned on credential attempts. X-Forwarded-For is not trusted. Each app allows at most two in-flight credential operations and rejects excess work with 429/Retry-After. Multi-instance global work limits and edge throttling remain deployment concerns.
- `pnpm test:auth` always creates/removes its own PostgreSQL cluster with a private Unix socket, no TCP listener, rejecting TCP auth. It ignores inherited DATABASE_URL. PostgreSQL binaries must be installed (`pg_config`, optionally PG_BIN). `pnpm test` includes it; unavailable PostgreSQL now explicitly skips (TORQUECODE_REQUIRE_DB=1 requires it), while launched migration/assertion failures still fail. A skipped integration suite in a direct Vitest run is not PostgreSQL verification. In this Codex sandbox, initdb is blocked by shmget permissions (an environment limitation). Karthik reported a successful host-terminal test:auth run on 2026-10-31: 1/1 file, 9/9 real PostgreSQL auth tests passed. See status log for evidence attribution.
- New public auth schemas and `/auth/me` inventory are additive; ten seams and assessment Session remain unchanged. Pranav/Rithvik module implementations are untouched. Empty-topic and Novice-only report scoring policies remain unresolved for later integration.
