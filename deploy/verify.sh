#!/usr/bin/env bash
# Verifies a running deployment end to end over HTTP (see deploy/verify.mjs).
#   deploy/verify.sh            journey: register -> login -> portfolio -> quiz -> assessment -> run -> submit -> hint -> report
#   deploy/verify.sh --outage   also prove an unreachable Docker daemon gives 503 and no grade
source "$(dirname "$0")/lib.sh"
load_config
export BACKEND_PORT
node "$DEPLOY/verify.mjs" "$@"
