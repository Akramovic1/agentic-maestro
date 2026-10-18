#!/bin/bash
# Machine-wide gate lock: at most $GATE_SLOTS (default 2) heavy check commands at once across all
# lanes. Usage: gate.sh <command...>. If the lock location is not writable (a sandbox that forbids
# writing outside its worktree), the command runs directly instead of waiting forever.
B=${GATE_LOCK:-/tmp/agentic-maestro-gate.lock}; SLOTS=${GATE_SLOTS:-2}
while :; do
  for s in $(seq 1 "$SLOTS"); do
    L="$B.$s"
    if mkdir "$L" 2>/dev/null; then
      echo $$ > "$L/pid"; trap 'rm -f "$L/pid"; rmdir "$L"' EXIT INT TERM
      nice -n 5 "$@"; exit $?
    fi
    if [ ! -d "$L" ]; then nice -n 5 "$@"; exit $?; fi
    owner=$(cat "$L/pid" 2>/dev/null)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -f "$L/pid"; rmdir "$L" 2>/dev/null; fi
  done
  sleep 5
done
