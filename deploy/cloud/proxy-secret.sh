# Sourced by setup-vm.sh. Keeps the Vercel<->Caddy proxy secret stable across reruns.
#   ensure_proxy_secret <env-file> <rotate:0|1>
# Sets PROXY_SECRET and PROXY_SECRET_STATE (existing | generated | rotated).
# A new secret is generated only when none exists, or when rotation is explicitly requested.
ensure_proxy_secret() {
  local file="$1" rotate="${2:-0}" current=""
  if [ -f "$file" ]; then current="$(sed -n 's/^PROXY_SECRET=\([0-9a-f]\{64\}\)$/\1/p' "$file" | head -n 1)"; fi
  if [ -n "$current" ] && [ "$rotate" != 1 ]; then
    PROXY_SECRET="$current"; PROXY_SECRET_STATE=existing; return 0
  fi
  PROXY_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  [ "${#PROXY_SECRET}" = 64 ] || { echo "ERROR: could not generate a proxy secret" >&2; return 1; }
  if [ -n "$current" ]; then PROXY_SECRET_STATE=rotated; else PROXY_SECRET_STATE=generated; fi
}
