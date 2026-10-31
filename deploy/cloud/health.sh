# Sourced by setup-vm.sh. A failed final poll must not be hidden by a successful sleep.
wait_backend_health() {
  local url="$1" attempts="${2:-30}" delay="${3:-2}" attempt
  for ((attempt=0; attempt<attempts; attempt++)); do
    if curl -fsS --max-time 3 "$url"; then return 0; fi
    if [ "$((attempt+1))" -lt "$attempts" ]; then sleep "$delay"; fi
  done
  return 1
}
