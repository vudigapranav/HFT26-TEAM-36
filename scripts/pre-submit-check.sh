#!/usr/bin/env bash
# P12 — pre-submission check (owner: Pranav). Run from anywhere inside the repo:
#   bash scripts/pre-submit-check.sh
# Needs pnpm + uv set up (see README "Setup"). For the attack suite, start the backend first in auth mode on
# http://127.0.0.1:3001, e.g. deploy/start.sh. Another address: TORQUECODE_API=http://127.0.0.1:3002 bash scripts/pre-submit-check.sh
# Prints a ✅/❌ checklist and exits 1 if anything failed or required checks were skipped.
# Never prints secret values, only file:line locations.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

API="${TORQUECODE_API:-http://127.0.0.1:3001}"
LOG="$(mktemp -d)"
trap 'rm -rf "$LOG"' EXIT
RESULTS=()
FAILED=0
ok()   { RESULTS+=("✅ $1"); }
fail() { RESULTS+=("❌ $1"); FAILED=1; }

echo "== 1/4 typecheck"
if pnpm typecheck >"$LOG/typecheck.txt" 2>&1; then ok "pnpm typecheck"
else fail "pnpm typecheck (see output below)"; tail -n 20 "$LOG/typecheck.txt"; fi

echo "== 2/4 tests"
# Run all backend suites inside the isolated DB harness, so auth is executed once
# rather than skipped in the general suite and re-run separately.
if { RUNNER=docker TORQUECODE_REQUIRE_DB=1 TORQUECODE_ALL_DB_TESTS=1 pnpm test:auth && pnpm test:python; } >"$LOG/test.txt" 2>&1; then
  if grep -Eq 'SKIP PostgreSQL|[1-9][0-9]* skipped' "$LOG/test.txt"; then
    fail "backend tests — required tests skipped; verify with PostgreSQL and Docker available"
    grep -E 'Tests |SKIP PostgreSQL' "$LOG/test.txt" | tail -n 10
  else
    ok "backend tests — $(grep -E '^ +Tests ' "$LOG/test.txt" | sed -E 's/^ +Tests +//' | paste -sd ';' -)"
  fi
else
  fail "backend tests (see output below)"; grep -E 'FAIL|Tests ' "$LOG/test.txt" | tail -n 20
fi

echo "== 3/4 attack suite against $API"
if curl -sf -o /dev/null --max-time 5 "$API/health"; then
  attack_status=0
  TORQUECODE_API="$API" python3 scripts/attack-api.py >"$LOG/attack.txt" 2>&1 || attack_status=$?
  summary="$(grep -E '^[0-9]+ pass / [0-9]+ fail( \([0-9]+ skipped\))?$' "$LOG/attack.txt" | tail -n 1)"
  if [[ "$attack_status" -eq 0 && "$summary" =~ ^[1-9][0-9]*\ pass\ /\ 0\ fail$ ]]; then ok "attack suite — $summary"
  else fail "attack suite — ${summary:-did not finish}"; grep -E '^❌|Error|Traceback' "$LOG/attack.txt" | head -n 20; fi
else
  fail "attack suite — no backend at $API (start it in auth mode, then re-run)"
fi

echo "== 4/4 secrets in tracked files"
SELF=':!scripts/pre-submit-check.sh'
env_files="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)"
if [[ -z "$env_files" ]]; then ok "no .env files tracked"; else fail "tracked .env files: $(echo "$env_files" | paste -sd ' ' -)"; fi

example_vals="$(git ls-files | grep -E '\.env\.example$' | xargs -I{} grep -nHE '^[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=.+' {} 2>/dev/null | cut -d= -f1 || true)"
if [[ -z "$example_vals" ]]; then ok ".env.example secret placeholders are empty"; else fail ".env.example has non-empty secret values at: $(echo "$example_vals" | paste -sd ' ' -)"; fi

scan() { # $1 = label, $2 = regex
  local hits
  hits="$(git grep -nIE "$2" -- . "$SELF" | cut -d: -f1,2 || true)"
  if [[ -z "$hits" ]]; then ok "no $1 in tracked files"; else fail "$1 found at: $(echo "$hits" | head -n 10 | paste -sd ' ' -)"; fi
}
scan "sk- API keys" 'sk-[A-Za-z0-9_-]{20,}'
scan "Bearer tokens" 'Bearer [A-Za-z0-9._~+/=-]{20,}'
scan "Featherless-style rc_ keys" 'rc_[A-Za-z0-9]{20,}'

echo
echo "== Pre-submit checklist ($(git rev-parse --short HEAD) on $(git branch --show-current))"
printf '%s\n' "${RESULTS[@]}"
if [[ "$FAILED" -eq 0 ]]; then echo; echo "All checks passed."; else echo; echo "Some checks failed."; fi
exit "$FAILED"
