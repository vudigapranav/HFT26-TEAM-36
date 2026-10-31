#!/usr/bin/env bash
# Clean slate for a rehearsal: stops everything, DELETES the database volume, starts again.
#   deploy/reset-db.sh --yes
source "$(dirname "$0")/lib.sh"
[ "${1:-}" = "--yes" ] || die "This deletes every account, assessment and report. Re-run with: deploy/reset-db.sh --yes"
"$DEPLOY/stop.sh" --purge --yes
"$DEPLOY/start.sh"
