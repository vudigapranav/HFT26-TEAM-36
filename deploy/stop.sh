#!/usr/bin/env bash
# Stops the demo. Database data is kept unless you pass --purge --yes.
#   deploy/stop.sh               stop backend + PostgreSQL, remove leftover runner containers
#   deploy/stop.sh --purge --yes also DELETE the database volume (all accounts and reports)
source "$(dirname "$0")/lib.sh"
PURGE=0
if [ "${1:-}" = "--purge" ]; then
  [ "${2:-}" = "--yes" ] || die "--purge deletes every account and report. Re-run with: deploy/stop.sh --purge --yes"
  PURGE=1
fi

if [ -f "$DEPLOY/.env" ]; then load_config; fi
say "Stopping backend"
stop_backend "${BACKEND_PORT:-3001}"

LEFTOVER="$(docker ps -aq --filter label=torquecode.runner=1 2>/dev/null || true)"
if [ -n "$LEFTOVER" ]; then say "Removing leftover runner containers"; docker rm -f $LEFTOVER >/dev/null; fi

if [ -f "$DEPLOY/.env" ]; then
  if [ "$PURGE" = 1 ]; then say "Removing PostgreSQL and its data volume"; "${COMPOSE[@]}" down -v
  else say "Stopping PostgreSQL (data kept in volume torquecode-pgdata)"; "${COMPOSE[@]}" stop; fi
fi
say "Stopped."
