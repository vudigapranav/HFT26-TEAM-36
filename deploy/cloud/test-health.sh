#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/health.sh"
calls=0
curl() { calls=$((calls+1)); return 0; }
wait_backend_health http://test.invalid 3 0
[ "$calls" = 1 ] || { echo 'FAIL: successful poll should stop'; exit 1; }
calls=0
curl() { calls=$((calls+1)); [ "$calls" -ge 3 ]; }
wait_backend_health http://test.invalid 3 0
[ "$calls" = 3 ] || { echo 'FAIL: retries should reach success'; exit 1; }
calls=0
curl() { calls=$((calls+1)); return 1; }
if wait_backend_health http://test.invalid 3 0; then echo 'FAIL: exhausted polls must fail'; exit 1; fi
[ "$calls" = 3 ] || { echo 'FAIL: retry bound'; exit 1; }
echo '3 health polling checks passed'
