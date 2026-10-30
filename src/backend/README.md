# TorqueCode backend — K1 + K2 authentication

Read `docs/BACKEND_DECISIONS.md` from repository root for the agreed stack, ownership, contracts and open policies. `docs/status/karthik.md` records progress and test evidence.

From repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
uv sync --project src/backend --python 3.13 --locked
pnpm typecheck
pnpm build
pnpm test
pnpm test:python
pnpm smoke:seams
pnpm test:seed1
pnpm dev
```

`GET http://127.0.0.1:3001/health` reports skeleton mode and disabled candidate execution. `pnpm openapi` prints OpenAPI JSON for implemented routes. Skeleton mode exposes health only; draft future paths are exported from `@torquecode/contracts/http`.

No database or LLM key is needed. K1 binds only to loopback. PORT defaults to 3001. HOST defaults to 127.0.0.1. APP_MODE defaults to skeleton; other modes fail closed.

Teammates implement `Ports` from `contracts/seams.ts`, reuse the package's public schemas, and replace their injected adapter in `api/` through Karthik. All asynchronous seams accept cancellation. Errors and development fixtures are explicit results. Generation/validation/scoring/report adapters cannot claim success before implementation.

The local runner is exclusively for immutable, hash-pinned seed fixtures and executes real pytest. It rejects edited candidate code. It is process supervision, not isolation: candidate execution and generated tasks require Rithvik's container runner. Do not expose the local runner through HTTP.

Do not run pytest over both starter/reference trees together. `pnpm test:seed1` verifies reference passes on three runs and checks the intentionally failing starter's exact F2P/P2P behavior.

The backend's dependencies are open-source libraries; original TorqueCode application and seed code is written for this hackathon. Package metadata preserves dependency licenses.

`pnpm test` now runs both Vitest and the real pytest reporter regression suite. The approved K1 compatibility exception and exact differences from the later checkpoint prompts are documented in `docs/BACKEND_DECISIONS.md`; teammates must implement the exported current seam signatures.


## K2 authentication

Use a **new, dedicated PostgreSQL 16 development database**. Do not run migrations against an unknown cluster/database. Export variables explicitly; the app does not load `.env`:

```sh
export DATABASE_URL='postgresql://localhost/torquecode_dev'
export APP_MODE=auth
export AUTH_ORIGIN='http://127.0.0.1:3001'
pnpm db:migrate
pnpm dev
```

The URL above assumes you have deliberately created that dedicated database with suitable local credentials. It is not a command to reuse an existing database. For deployment set AUTH_ORIGIN to the exact HTTPS browser origin, use NODE_ENV=production, and keep the app behind Rithvik's loopback reverse proxy. No cross-origin CORS flow is configured.

- `POST /auth/register`: JSON `{ "email": "candidate@example.org", "password": "a unique long passphrase" }` → 201 public user, no automatic login.
- `POST /auth/login`: same credentials → 200 public user and HttpOnly session cookie.
- `GET /auth/me`: send that cookie → 200 public user; absent/invalid/expired → 401.
- `POST /auth/logout`: send cookie → 204, cookie cleared and presented session revoked.

Every POST requires `Origin: http://127.0.0.1:3001` (or the configured AUTH_ORIGIN), including curl. Use curl's `-c`/`-b` cookie jar options to preserve the login cookie. Password length is 12–128 characters; email <=254; auth bodies <=2 KiB. Cookies expire after seven days. HTTPS uses Secure, SameSite=Strict and a __Host- name; plain HTTP cookies work only for loopback development. Rate limits are 20 attempts/IP and 10/account per 15 minutes, shared between register/login; two concurrent credential operations per API process. Responses contain no password/session hashes or raw session tokens in JSON.

`pnpm openapi` follows APP_MODE and prints only enabled routes. `pnpm build` includes migration SQL; `pnpm --filter @torquecode/backend exec node dist/api/db/command.js` applies the same migrations from a build.

```sh
pnpm test:auth
```

This integration command ignores DATABASE_URL and creates a fresh temporary PostgreSQL cluster with a private Unix socket, then removes it. Install PostgreSQL tools and make `pg_config` available, or set PG_BIN to their directory. No existing service is started/stopped or modified. The full `pnpm test` runs this harness; unavailable PostgreSQL skips the integration tests. Set TORQUECODE_REQUIRE_DB=1 to make unavailable PostgreSQL a failure. Once PostgreSQL starts, migration or assertion failures always fail. Direct Vitest skips the nine database tests unless invoked by this harness. Codex's sandbox blocks initdb's shared-memory syscall; run this command in a normal terminal. Karthik reported all nine tests passed on 2026-10-31; the sandbox restriction is an environment limitation, not an application failure.

K2 adds no portfolio/assessment/runner integration, email verification, password reset, or public deployment. The local seed runner remains immutable-fixture-only. See the status log for actual verification and release state.
