#!/usr/bin/env bash
# Tests for proxy-secret.sh (no root, no VM needed): bash deploy/cloud/test-proxy-secret.sh
set -euo pipefail
. "$(dirname "$0")/proxy-secret.sh"
dir="$(mktemp -d)"; trap 'rm -rf "$dir"' EXIT
file="$dir/torquecode.env"
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2', want '$3'"; fail=1; fi; }
write() { printf 'BACKEND_HOST=api.example.com\nPROXY_SECRET=%s\n' "$1" > "$file"; }

ensure_proxy_secret "$file" 0
check "no file -> generated" "$PROXY_SECRET_STATE" generated
first="$PROXY_SECRET"; check "64 hex chars" "$(printf '%s' "$first" | grep -cE '^[0-9a-f]{64}$')" 1
write "$first"

ensure_proxy_secret "$file" 0
check "rerun -> existing" "$PROXY_SECRET_STATE" existing
check "rerun keeps the same secret" "$PROXY_SECRET" "$first"

ensure_proxy_secret "$file" 1
check "explicit rotation -> rotated" "$PROXY_SECRET_STATE" rotated
[ "$PROXY_SECRET" != "$first" ] && check "rotation changes the secret" yes yes || check "rotation changes the secret" no yes

printf 'BACKEND_HOST=x\n' > "$file"
ensure_proxy_secret "$file" 0
check "file without a secret -> generated" "$PROXY_SECRET_STATE" generated

write "short-or-tampered"
ensure_proxy_secret "$file" 0
check "malformed secret is not reused" "$PROXY_SECRET_STATE" generated
exit "$fail"
