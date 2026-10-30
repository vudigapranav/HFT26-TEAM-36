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

Default skeleton mode needs no database or LLM key and exposes health only. APP_MODE=auth enables database-backed login and checkpoint assessment routes with explicit configuration below. Unsupported modes fail closed. PORT defaults to 3001 and HOST to loopback 127.0.0.1.

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

Every POST requires `Origin: http://127.0.0.1:3001` (or the configured AUTH_ORIGIN), including curl. Use curl's `-c`/`-b` cookie jar options to preserve the login cookie. Password length is 12–128 characters; email <=254; auth bodies <=2 KiB. Cookies expire after seven days. HTTPS uses Secure, SameSite=Lax and a __Host- name; plain HTTP cookies work only for loopback development. Rate limits are 20 attempts/IP and 10/account per 15 minutes, shared between register/login; two concurrent credential operations per API process. Responses contain no password/session hashes or raw session tokens in JSON.

`pnpm openapi` follows APP_MODE and prints only enabled routes. `pnpm build` includes migration SQL; `pnpm --filter @torquecode/backend exec node dist/api/db/command.js` applies the same migrations from a build.

```sh
pnpm test:auth
```

This integration command ignores DATABASE_URL and creates a fresh temporary PostgreSQL cluster with a private Unix socket, then removes it. Install PostgreSQL tools and make `pg_config` available, or set PG_BIN to their directory. No existing service is started/stopped or modified. The full `pnpm test` runs this harness; unavailable PostgreSQL skips the integration tests. Set TORQUECODE_REQUIRE_DB=1 to make unavailable PostgreSQL a failure. Once PostgreSQL starts, migration or assertion failures always fail. Direct Vitest skips the nine database tests unless invoked by this harness. Codex's sandbox blocks initdb's shared-memory syscall; run this command in a normal terminal. Karthik reported all nine tests passed on 2026-10-31; the sandbox restriction is an environment limitation, not an application failure.

K2 adds no portfolio/assessment/runner integration, email verification, password reset, or public deployment. The local seed runner remains immutable-fixture-only. See the status log for actual verification and release state.


## Seed checkpoint API — K3 + K4-lite

With APP_MODE=auth, the server also exposes the assessment API. Authentication is required: register, then log in and keep the cookie. Auth data is in PostgreSQL; assessment state is in memory and resets on restart.

Akshit’s frontend setup: proxy `/api` to `http://127.0.0.1:3001`, strip the `/api` prefix, and preserve the browser’s Origin. Call relative URLs such as `/api/auth/login`. Set backend AUTH_ORIGIN to the exact frontend origin, e.g. `http://localhost:5173`. Use the same hostname consistently; no CORS is required. HttpOnly + SameSite=Lax cookies are handled by the browser.

| Request (backend path) | Body / result |
|---|---|
| POST /portfolio | Raw portfolio JSON → `{profile,warnings,injection_flags}`; display warnings, including empty-topic fallback |
| GET /onboarding-quiz | Stored profile → `{questions}` |
| POST /onboarding-quiz | `{answers:[{question_id,option_id}]}` → `{focus_lane}` |
| POST /assessments | `{}` → assessment_id, task_id, report_id, deadline, remaining_sec and policy_todos |
| GET /assessments/:id/status | Server-owned remaining time/status and runner capability |
| GET /assessments/:id/tasks/:taskId | Public task and saved files only |
| PUT /assessments/:id/tasks/:taskId/files | `{files:[{path,content,editable:true}]}` → `{ok:true}` |
| POST .../run or .../submit | `{}` uses saved files; optional `{files:[...]}` saves/runs replacement editable files |
| POST /assessments/:id/hint | `{}` → next `{level,text}`, maximum three |
| POST /assessments/:id/events | Public EventsRequest only; scorer events are generated by the server |
| GET /reports/:id | Use returned report_id → current report snapshot from real scorer/report builder |

Upload before quiz/assessment. The current seed requires arrays in the normalized claimed topics; incompatible claims get 422 SEED_TOPIC_UNAVAILABLE. One assessment is active per user. Tier upgrades remain TODO(OPEN-Q1); Novice report scoring follows Pranav’s named provisional TODO(OPEN-Q4) rule. No generated tasks, Adept/Master seeds, live assistant or full K4 are claimed.

**Runner limitation:** local mode runs only exact reviewed seed starter/reference fixtures. Arbitrary candidate edits return 503 SANDBOX_UNAVAILABLE. They may be autosaved, but need Rithvik’s isolated runner to execute. The API never substitutes passing results. On the server’s 60-minute deadline it attempts auto-submit once; unavailable execution is visible as auto_submit_error in status. Hidden contents and submit logs never reach the client.

`api/wiring.ts` is the single replacement point for Rithvik’s merged runner. `api/assessment-store.ts` is the process-local store; it bounds profiles/assessments, events, runs and concurrent execution. A restart loses assessments/reports, not auth records. GET report before expiry is a snapshot; the status endpoint identifies completion.

### Demo PostgreSQL preparation

For the currently tested Mac, use Homebrew PostgreSQL 16 as the baseline; Docker is not on PATH. Rithvik owns final demo deployment. If creating a new dedicated local cluster, run the following **only with unused data/socket directories** from repository root in a normal terminal:

```sh
PG_BIN="$(brew --prefix postgresql@16)/bin"
mkdir -p .local/pgsocket
chmod 700 .local/pgsocket
"$PG_BIN/initdb" -D .local/pgdata -U torquecode_dev --auth-local=trust --auth-host=reject --no-locale -E UTF8
"$PG_BIN/pg_ctl" -D .local/pgdata -l .local/postgres.log -o "-k $PWD/.local/pgsocket -h ''" -w start
"$PG_BIN/createdb" -h "$PWD/.local/pgsocket" -U torquecode_dev torquecode_dev
```

Connect via a socket URL whose host query parameter is the absolute `.local/pgsocket` path, then run `pnpm db:migrate`. No TCP listener is enabled by these development commands. Never reuse an unknown cluster or commit its data. `.local/` is ignored. The current Codex sandbox cannot start PostgreSQL; the host terminal can. The final demo-machine setup and browser flow still need team verification.


## Docker demo mode — K9

```sh
docker build -t torquecode-runner-python:dev src/backend/runner/images/python
export RUNNER=docker
export RUNNER_IMAGE=torquecode-runner-python:dev
# Also configure APP_MODE=auth, DATABASE_URL and AUTH_ORIGIN as above.
pnpm dev
```

Startup inspects the selected image once and logs availability. If Docker/image is unavailable the server still starts: `/health` is degraded with runner_available=false and assessment status reports the same capability. Run/Submit returns 503 SANDBOX_UNAVAILABLE without a grade/event; there is no local fallback. A successful later execution restores readiness. Restart after installing/building Docker to repeat the startup probe, or retry a run.

Docker mode allows candidate edits only to exact editable task paths. The API rejects tests/config files, new paths and traversal before invoking the runner. Server-owned immutable files/tests/limits are preserved. The local mode still refuses arbitrary candidate edits. Submit logs and hidden test details never reach public responses.

`POST /portfolio` accepts up to 1 MiB; intake applies its field caps and returns warnings that the frontend must display. Other routes keep the global 256 KiB body cap (auth uses its existing smaller cap).

Run `pnpm typecheck && pnpm test`, and `RUNNER=docker pnpm test` with the image installed. Real Docker tests skip explicitly when Docker/image is missing. This does not certify R3 anti-forgery hardening: see Rithvik's status log and the backend decisions. The image was host-tested by Rithvik on Windows; actual demo-machine validation remains required.
