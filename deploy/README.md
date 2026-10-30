# TorqueCode demo deployment (R6)

One machine, local only. Everything binds to `127.0.0.1`; nothing is exposed to the network.

```text
browser ──▶ frontend dev server (AUTH_ORIGIN, proxies /api) ──▶ backend  127.0.0.1:3001  (host process)
                                                                 ├─▶ PostgreSQL 16  127.0.0.1:54329  (Docker Compose, volume torquecode-pgdata)
                                                                 ├─▶ docker CLI ──▶ runner containers (worker + grader per Run/Submit)
                                                                 └─▶ https://api.featherless.ai (outbound, key from env)
```

**Why the backend runs on the host, not in Compose:** it has to start runner containers. Putting it in a
container would mean mounting the Docker socket into a web-facing container, which gives full control of the
host's Docker. Runner containers never get the socket, network, the database or any key (see
`src/backend/runner/harness/README.md`). Remaining risk: whoever compromises the backend process can drive Docker
on this machine, as with any Docker-based runner.

## Requirements

| | Version | Check |
|---|---|---|
| Docker Desktop | running, Linux containers, Compose v2 | `docker info` |
| Node.js | 24 LTS, >= 24.22.1 (repo `engines`) | `node -v` |
| curl, bash | macOS/Linux built in; Windows: Git Bash | |

pnpm doesn't need to be installed: the scripts use `npx pnpm@11.25.0` (the repo's pinned version) if needed.
Apple Silicon: the runner image (`python:3.13-slim`) and `postgres:16-alpine` are multi-arch, and `docker build`
builds natively for arm64.

## Start

```bash
deploy/start.sh
```

It is idempotent and fails with an actionable message at the first problem. It:

1. checks Docker, Compose, Node and curl;
2. creates `deploy/.env` from `.env.example` (git-ignored, `chmod 600`) with a generated database password;
3. starts PostgreSQL 16 and waits for its health check;
4. builds the runner image `torquecode-runner-python:dev` if it's missing (`--rebuild` forces a rebuild) and checks it runs pytest;
5. runs `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm build`;
6. applies the database migrations (`dist/api/db/command.js`);
7. starts the backend (`APP_MODE=auth`, `RUNNER=docker`) from `src/backend` and waits for `/health`.

Featherless: set `FEATHERLESS_API_KEY` in the repo-root `.env` or in `deploy/.env`. Without it the app still
runs, and AI calls return 503.

## Verify

```bash
deploy/verify.sh            # real HTTP journey through PostgreSQL + Docker
deploy/verify.sh --outage   # also: unreachable Docker daemon -> 503, no grade, no host details leaked
```

The journey runs register → login (cookie session) → `/auth/me` → portfolio → quiz → assessment → task (no
private data) → Run of the starter (fails in Docker) → Submit of the fixed code (all tests pass) → hint → report.
It also checks that a second account gets 404 for the first account's report and assessment. Output is JSON;
the exit code is non-zero on the first failed check.
Each run registers 2 accounts (3 with `--outage`). Several runs within a few minutes trip the backend's per-IP
auth rate limiter (`register` fails with HTTP 429): that's the product working, so wait and retry.

## Stop and teardown

```bash
deploy/stop.sh                 # stop backend + PostgreSQL, remove leftover runner containers; DATA KEPT
deploy/stop.sh --purge --yes   # also delete the database volume (every account and report)
```

`stop.sh` confirms the backend is really gone (it asks `/health`, then kills whatever listens on the port), so
it also works on Windows Git Bash, where the recorded pid doesn't control `node.exe`.

## Database

- Migrations run on every `start.sh`. To run them by hand:
  `cd src/backend && DATABASE_URL=postgres://torquecode:<password>@127.0.0.1:54329/torquecode node dist/api/db/command.js`
- Backup: `docker exec torquecode-postgres-1 pg_dump -U torquecode torquecode > backup.sql`
- Restore: `docker exec -i torquecode-postgres-1 psql -U torquecode -d torquecode < backup.sql`

## Resource guidance

- Each Run/Submit starts two containers: the worker (the task's limits, e.g. 128 MB / 1 CPU / 32 pids) and the
  grader (256 MB / 1 CPU / 64 pids). It takes about 1.8 s on a 24-CPU laptop (`docs/status/rithvik.md`, R3).
- Plan for at least 4 GB of RAM for Docker Desktop and about 2 GB of disk for the images.
- The Featherless client caps itself at 2 concurrent requests (`FEATHERLESS_MAX_CONCURRENCY`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Docker is not running` | Start Docker Desktop; wait for "Engine running". On Windows, if it won't start with a `*.sock ... cannot be accessed` error: quit it, rename `%LOCALAPPDATA%\Docker\run` and start it again. |
| `ports are not available ... 54329` | Another service or a Windows reserved range (`netsh interface ipv4 show excludedportrange protocol=tcp`). Set `POSTGRES_PORT` in `deploy/.env` to a free port. |
| `/health` shows `runner_available: false` | Image missing or Docker down: `deploy/start.sh --rebuild`. Runs return 503 (no grade) until fixed. |
| Run/Submit return 503 `SANDBOX_UNAVAILABLE` | Docker stopped mid-demo. Restart Docker Desktop, then `deploy/start.sh` (it restarts the backend). |
| Build fails on Windows with `The syntax of the command is incorrect` | Run the scripts from Git Bash: `lib.sh` points pnpm at bash for package scripts. |
| `Backend failed to start` | `deploy/.run/backend.log`; usually PostgreSQL down or migrations not applied. Run `deploy/start.sh` again. |
| Leftover containers after a crash | `deploy/stop.sh` removes everything labelled `torquecode.runner=1`. |
| AI returns 503 | `FEATHERLESS_API_KEY` missing or provider down; grading is unaffected. |

On Windows Git Bash, don't pipe `start.sh` into another command (`| tail`): the backend inherits the pipe and
the pipe never closes. Run it directly in the terminal.

## Demo fallback

1. **Docker breaks during the demo:** grading returns 503, never a fake score. Restart Docker Desktop and run
   `deploy/start.sh`.
2. **Featherless down:** hints from the pre-generated ladder still work; only the live assistant is affected.
3. **Machine problems:** play the backup screen recording of the full flow (record one on the demo machine with
   `deploy/verify.sh` passing and the frontend open).
4. **Clean slate between rehearsals:** `deploy/stop.sh --purge --yes && deploy/start.sh`.

## What has been verified, and where

See `docs/status/rithvik.md` (R6). The final demo machine must run `deploy/start.sh && deploy/verify.sh --outage`
itself; a run on another machine doesn't prove the demo machine works.
