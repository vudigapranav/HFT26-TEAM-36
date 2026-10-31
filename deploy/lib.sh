# Shared helpers for deploy/*.sh. Sourced, not executed. Works on macOS (bash 3.2), Linux and Git Bash.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$REPO/deploy"
RUN="$DEPLOY/.run"
COMPOSE=(docker compose -f "$DEPLOY/docker-compose.yml" --env-file "$DEPLOY/.env")

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWARN: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# pnpm pinned to the repo's packageManager version; falls back to npx when pnpm isn't installed.
pnpm_cmd() {
  if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version 2>/dev/null)" = "11.25.0" ]; then pnpm "$@"
  else npx -y pnpm@11.25.0 "$@"; fi
}

# Windows Git Bash: pnpm runs package scripts with cmd.exe, which can't run the build's mkdir -p/cp.
if [ -n "${MSYSTEM:-}" ] && command -v bash >/dev/null 2>&1; then
  export pnpm_config_script_shell="$(cygpath -w "$(command -v bash)")"
fi

# Reads KEY=VALUE lines (no shell evaluation) and exports them, unless already set in the environment.
load_env_file() {
  local file="$1" line key value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"; value="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    if [ -z "${!key:-}" ] && [ -n "$value" ]; then export "$key=$value"; fi
  done < "$file"
}

load_config() {
  [ -f "$DEPLOY/.env" ] || die "deploy/.env missing; run deploy/start.sh first"
  load_env_file "$DEPLOY/.env"
  load_env_file "$REPO/.env"  # only fills values deploy/.env left blank (e.g. FEATHERLESS_API_KEY)
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing in deploy/.env}"
  POSTGRES_PORT="${POSTGRES_PORT:-54329}"; BACKEND_PORT="${BACKEND_PORT:-3001}"
  AUTH_ORIGIN="${AUTH_ORIGIN:-http://127.0.0.1:4177}"; RUNNER_IMAGE="${RUNNER_IMAGE:-torquecode-runner-python:dev}"
  export DATABASE_URL="postgres://torquecode:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/torquecode"
  RUNNER="${RUNNER:-docker}"
  export APP_MODE=auth RUNNER HOST=127.0.0.1 PORT="$BACKEND_PORT" AUTH_ORIGIN RUNNER_IMAGE
  export RUNNER_HARNESS_DIR="$REPO/src/backend/runner/harness"
}

backend_pid() { [ -f "$RUN/backend.pid" ] && cat "$RUN/backend.pid" || true; }
pid_alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
backend_up() { curl -fsS --max-time 2 "http://127.0.0.1:${1}/health" >/dev/null 2>&1; }

# The process listening on 127.0.0.1:<port>. On Git Bash, `$!` is an MSYS pid that
# doesn't control the native node.exe, so stopping goes by the listening port instead.
listener_pid() {
  if [ -n "${MSYSTEM:-}" ]; then
    netstat -ano | awk -v port="127.0.0.1:$1" '$2 == port && $4 == "LISTENING" { print $5; exit }'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -n 1
  fi
}
kill_listener() {
  local pid; pid="$(listener_pid "$1")"
  [ -n "$pid" ] || return 0
  if [ -n "${MSYSTEM:-}" ]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
  else kill "$pid" 2>/dev/null || true; fi
}

# Stops our backend: graceful first, then by listening port, and verifies it is gone.
stop_backend() {
  local port="$1" pid; pid="$(backend_pid)"
  if pid_alive "$pid"; then kill "$pid" 2>/dev/null || true; fi
  for _ in 1 2 3 4 5; do backend_up "$port" || break; sleep 1; done
  if backend_up "$port"; then kill_listener "$port"; sleep 2; fi
  rm -f "$RUN/backend.pid"
  ! backend_up "$port" || die "Backend on port $port is still running; stop it manually (pid $(listener_pid "$port"))."
}

# Polls /health until it answers (or the timeout passes). Prints the JSON.
wait_health() {
  local port="$1" deadline=$((SECONDS + ${2:-60})) body
  while [ "$SECONDS" -lt "$deadline" ]; do
    if body="$(curl -fsS --max-time 3 "http://127.0.0.1:${port}/health" 2>/dev/null)"; then printf '%s\n' "$body"; return 0; fi
    sleep 1
  done
  return 1
}
