#!/usr/bin/env bash
# One-command start for the TorqueCode demo: PostgreSQL (Compose) + runner image + backend on the host.
#   deploy/start.sh            start (idempotent; a running, healthy backend is LEFT RUNNING)
#   deploy/start.sh --rebuild  also rebuild the runner image
#   deploy/start.sh --restart  restart a running backend (drops in-memory assessments!)
source "$(dirname "$0")/lib.sh"
REBUILD=0; RESTART=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    --restart) RESTART=1 ;;
    *) die "unknown option $arg (use --rebuild and/or --restart)" ;;
  esac
done

say "Checking prerequisites"
command -v docker >/dev/null || die "docker not found. Install Docker Desktop."
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and wait until it says 'Engine running'."
docker compose version >/dev/null 2>&1 || die "'docker compose' (v2) not available. Update Docker Desktop."
command -v node >/dev/null || die "node not found. Install Node.js 24 LTS (>= 24.22.1)."
command -v curl >/dev/null || die "curl not found."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || die "Node $(node -v) is too old; need Node 24 (>= 24.22.1)."
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number); process.exit(a>24||(a===24&&(b>22||(b===22&&c>=1)))?0:1)' \
  || warn "Node $(node -v) is below the repo's engines (>=24.22.1); it works here, but upgrade before the demo."
echo "  docker $(docker version --format '{{.Server.Version}}') $(docker info --format '{{.OSType}}/{{.Architecture}}'), node $(node -v)"

mkdir -p "$RUN"
if [ ! -f "$DEPLOY/.env" ]; then
  say "Creating deploy/.env (git-ignored) with a generated database password"
  PASSWORD="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  sed "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$PASSWORD/" "$DEPLOY/.env.example" > "$DEPLOY/.env"
  chmod 600 "$DEPLOY/.env" 2>/dev/null || true
fi
load_config
[ -n "${FEATHERLESS_API_KEY:-}" ] || warn "FEATHERLESS_API_KEY not set: the app runs, AI features return 503 until it is."

say "Starting PostgreSQL 16 (127.0.0.1:${POSTGRES_PORT})"
"${COMPOSE[@]}" up -d --wait postgres || die "PostgreSQL did not become healthy. See: docker compose -f deploy/docker-compose.yml logs postgres"

if [ "$REBUILD" = 1 ] || ! docker image inspect "$RUNNER_IMAGE" >/dev/null 2>&1; then
  say "Building runner image $RUNNER_IMAGE for $(docker info --format '{{.Architecture}}')"
  docker build -t "$RUNNER_IMAGE" "$REPO/src/backend/runner/images/python" || die "Runner image build failed."
fi
docker run --rm --network none "$RUNNER_IMAGE" python -m pytest --version >/dev/null 2>&1 || die "Runner image $RUNNER_IMAGE can't run pytest."

say "Installing dependencies and building the backend"
( cd "$REPO" && pnpm_cmd install --frozen-lockfile --ignore-scripts >/dev/null ) || die "pnpm install failed."
( cd "$REPO" && pnpm_cmd build >"$RUN/build.log" 2>&1 ) || die "Build failed; see deploy/.run/build.log"

say "Applying database migrations"
( cd "$REPO/src/backend" && node dist/api/db/command.js ) || die "Migrations failed (is PostgreSQL up? see docker compose logs)."

# Assessments live in backend memory: never restart a healthy backend unless asked.
if backend_up "$BACKEND_PORT"; then
  if [ "$RESTART" = 0 ]; then
    say "Backend already running on port $BACKEND_PORT; leaving it alone (in-memory assessments kept). Use --restart to restart it."
    curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/health"; echo
    exit 0
  fi
  say "Restarting backend (--restart): in-memory assessments are dropped"
  stop_backend "$BACKEND_PORT"
fi
say "Starting backend on http://127.0.0.1:${BACKEND_PORT} (APP_MODE=auth, RUNNER=${RUNNER})"
# cwd must be src/backend: the seed bank and intake data are resolved from it.
( cd "$REPO/src/backend" && nohup node dist/api/server.js </dev/null >"$RUN/backend.log" 2>&1 & echo $! >"$RUN/backend.pid" )
HEALTH="$(wait_health "$BACKEND_PORT" 60)" || { tail -20 "$RUN/backend.log" >&2; die "Backend did not become healthy; full log: deploy/.run/backend.log"; }
echo "  /health: $HEALTH"
case "$HEALTH" in *'"runner_available":true'*) ;; *) warn "Runner not available: check Docker and the $RUNNER_IMAGE image (deploy/README.md, Troubleshooting).";; esac

say "TorqueCode backend is up"
cat <<EOF
  API (loopback only):  http://127.0.0.1:${BACKEND_PORT}
  Frontend origin:      ${AUTH_ORIGIN}  (its dev server must proxy /api -> http://127.0.0.1:${BACKEND_PORT}, stripping /api and keeping Origin)
  Logs:                 deploy/.run/backend.log
  Verify the journey:   deploy/verify.sh   (add --outage for the Docker-down check)
  Stop:                 deploy/stop.sh   (database data is kept)
EOF
[ -f "$REPO/src/frontend/package.json" ] || warn "No frontend in src/frontend yet; only the API is running."
