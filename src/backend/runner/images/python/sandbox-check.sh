#!/usr/bin/env bash
# R0 sandbox check: runs every case in src/backend/tests/fixtures/runner/cases
# inside the runner image with the isolation flags below, and compares the
# verdict with the case's `expect` file.
#
#   docker build -t torquecode-runner-python:dev src/backend/runner/images/python
#   bash src/backend/runner/images/python/sandbox-check.sh [case ...]
#
# Env overrides: IMAGE, WALL_MS, MEMORY_MB, CPUS, PIDS, OUTPUT_BYTES,
# KEEP=<dir> (keep each case's JUnit XML there).
# Defaults are seed task 1's limits. Works in Git Bash (Windows), macOS bash 3.2 and Linux.
set -u
export MSYS_NO_PATHCONV=1 # stop Git Bash rewriting /work, /out, /tmp

HERE=$(cd "$(dirname "$0")" && pwd)
FIXTURES=${FIXTURES:-$HERE/../../../tests/fixtures/runner}
IMAGE=${IMAGE:-torquecode-runner-python:dev}
WALL_MS=${WALL_MS:-5000}
MEMORY_MB=${MEMORY_MB:-128}
CPUS=${CPUS:-1}
PIDS=${PIDS:-32}
OUTPUT_BYTES=${OUTPUT_BYTES:-65536}
KEEP=${KEEP:-}

host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
xml_attr() { sed -n "s/.*<testsuite[^>]* $1=\"\([0-9]*\)\".*/\1/p" "$2" | head -n 1; }

docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "Image $IMAGE not found. Build it first: docker build -t $IMAGE $HERE" >&2; exit 2; }

run_case() {
  local case_dir=$1 case work out ws name expect total limit i timed_out exit_code oom bytes capped
  local verdict tests failures errors result
  case=$(basename "$case_dir")
  expect=$(cat "$case_dir/expect")
  ws=$(mktemp -d); work=$ws/work; out=$ws/out
  mkdir -p "$work/app" "$work/tests" "$out"

  # Only the editable path (app/) comes from the candidate; anything else they
  # send (conftest.py, tests/) is dropped. Tests are copied in fresh every run.
  cp -R "$case_dir/candidate/app/." "$work/app/"
  find "$work" -name conftest.py -exec rm -f {} +
  cp "$FIXTURES"/base/tests/*.py "$work/tests/"
  [ -d "$case_dir/tests" ] && cp "$case_dir"/tests/*.py "$work/tests/"
  : > "$work/conftest.py"; : > "$work/tests/conftest.py"
  chmod -R a+rX "$work"; chmod 777 "$out"
  total=$(cat "$work"/tests/test_*.py | grep -c '^def test_')

  name="tc-check-$case-$$-$RANDOM"
  # Attached run, read live through the cap: `docker logs` afterwards would only
  # return the tail left after log rotation. If the cap is hit, the client exits
  # and the container keeps running until the deadline below kills it.
  ( docker run --name "$name" \
    --network none \
    --memory "${MEMORY_MB}m" --memory-swap "${MEMORY_MB}m" \
    --cpus "$CPUS" --pids-limit "$PIDS" \
    --read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
    --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
    --log-opt max-size=1m --log-opt max-file=1 \
    -e PYTHONPATH=/work -e PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
    -v "$(host_path "$work"):/work:ro" -v "$(host_path "$out"):/out" \
    "$IMAGE" python -m pytest -q -p no:cacheprovider --junitxml=/out/results.xml \
    $(cd "$work" && ls tests/test_*.py) 2>&1 | head -c $(( OUTPUT_BYTES + 1 )) > "$ws/output" ) &
  client=$!
  i=0; until docker inspect "$name" >/dev/null 2>&1 || [ "$i" -ge 100 ]; do sleep 0.1; i=$(( i + 1 )); done

  # Wall-clock deadline, measured from container creation; then docker kill.
  limit=$(( WALL_MS / 100 )); i=0; timed_out=0
  while [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = "true" ]; do
    if [ "$i" -ge "$limit" ]; then docker kill "$name" >/dev/null 2>&1; timed_out=1; break; fi
    sleep 0.1; i=$(( i + 1 ))
  done
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$name")
  oom=$(docker inspect -f '{{.State.OOMKilled}}' "$name")
  wait "$client" 2>/dev/null
  bytes=$(wc -c < "$ws/output" | tr -d ' ')
  capped=no; [ "$bytes" -gt "$OUTPUT_BYTES" ] && { capped=yes; bytes=$OUTPUT_BYTES; }
  docker rm -f "$name" >/dev/null 2>&1

  # Never trust the exit code: the verdict comes from the per-test XML only.
  if [ "$timed_out" = 1 ]; then verdict=timeout
  elif [ ! -s "$out/results.xml" ]; then verdict=error
  else
    tests=$(xml_attr tests "$out/results.xml"); failures=$(xml_attr failures "$out/results.xml"); errors=$(xml_attr errors "$out/results.xml")
    if [ "${errors:-1}" -gt 0 ]; then verdict=error
    elif [ "${failures:-1}" -gt 0 ]; then verdict=fail
    elif [ "${tests:-0}" -ne "$total" ]; then verdict=error
    else verdict=pass; fi
  fi
  [ -n "$KEEP" ] && [ -s "$out/results.xml" ] && mkdir -p "$KEEP" && cp "$out/results.xml" "$KEEP/$case.xml"
  rm -rf "$ws"

  if [ "$expect" = contained ]; then [ "$verdict" != pass ] && result=OK || result=FAIL
  else [ "$verdict" = "$expect" ] && result=OK || result=FAIL; fi
  [ -f "$case_dir/expect_capped" ] && [ "$capped" != yes ] && result=FAIL
  [ "$result" = FAIL ] && [ -f "$case_dir/known_gap" ] && result=GAP
  printf '%-18s %-10s %-8s %-5s %-4s %-6s %-6s %-6s %s\n' \
    "$case" "$expect" "$verdict" "$exit_code" "$oom" "$timed_out" "$bytes" "$capped" "$result"
  [ "$result" != FAIL ]
}

printf '%-18s %-10s %-8s %-5s %-4s %-6s %-6s %-6s %s\n' case expect verdict exit oom killed bytes capped result
failed=0
if [ $# -gt 0 ]; then dirs=""; for c in "$@"; do dirs="$dirs $FIXTURES/cases/$c"; done
else dirs=$(ls -d "$FIXTURES"/cases/*/); fi
for d in $dirs; do run_case "${d%/}" || failed=$(( failed + 1 )); done
docker info >/dev/null 2>&1 && echo "docker daemon healthy after run" || { echo "docker daemon NOT responding" >&2; failed=$(( failed + 1 )); }
echo "unexpected results: $failed"
[ "$failed" -eq 0 ]
