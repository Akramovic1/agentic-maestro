#!/bin/bash
# Machine-wide gate lock: at most $GATE_SLOTS (default 2) heavy check commands at once across all
# lanes. Usage: gate.sh <command...>.
#   GATE_SLOTS    number of slots (positive integer, default 2)
#   GATE_LOCK     lock base path (default /tmp/agentic-maestro-gate.lock)
#   GATE_MAX_WAIT max seconds to wait for a slot (default 3600; on timeout exit 75)
# The ONLY unlocked fallback is when the lock PARENT directory is not writable (a sandbox that
# forbids writing outside its worktree). A vanished lock dir is never permission to run unlocked.
SLOTS=${GATE_SLOTS:-2}
B=${GATE_LOCK:-/tmp/agentic-maestro-gate.lock}
MAX_WAIT=${GATE_MAX_WAIT:-3600}

case "$SLOTS" in
  '' | *[!0-9]*)
    echo "gate.sh: GATE_SLOTS must be a positive integer (got '$SLOTS')" >&2
    exit 64
    ;;
esac
if [ "$SLOTS" -lt 1 ]; then
  echo "gate.sh: GATE_SLOTS must be a positive integer (got '$SLOTS')" >&2
  exit 64
fi
if [ "$#" -lt 1 ]; then
  echo "gate.sh: no command given; usage: gate.sh <command...>" >&2
  exit 64
fi

PARENT=$(dirname "$B")
mkdir -p "$PARENT" 2>/dev/null

# Probe the parent once: this is the only condition under which we run without the lock.
probe="$B.probe.$$"
if ! mkdir "$probe" 2>/dev/null; then
  echo "gate.sh: WARNING: lock parent '$PARENT' is not writable; running '$*' WITHOUT the gate lock" >&2
  exec nice -n 5 "$@"
fi
rmdir "$probe" 2>/dev/null

deadline=$(( $(date +%s) + MAX_WAIT ))
held=
L=
while :; do
  for s in $(seq 1 "$SLOTS"); do
    i="$B.$s"
    if mkdir "$i" 2>/dev/null; then
      L="$i"
      echo $$ > "$L/pid"
      held=1
      break
    fi
    # Stale-lock removal ONLY when the recorded PID exists and is dead. Atomically rename the stale
    # lock dir aside, then remove it, so two waiters cannot both clear the same lock.
    owner=$(cat "$i/pid" 2>/dev/null)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      stale="$i.stale.$$"
      if mv "$i" "$stale" 2>/dev/null; then rm -rf "$stale"; fi
    fi
  done
  [ -n "$held" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "gate.sh: timed out after ${MAX_WAIT}s waiting for a gate slot (GATE_SLOTS=$SLOTS, lock=$B)" >&2
    exit 75
  fi
  sleep 5
done

cleanup() { rm -f "$L/pid" 2>/dev/null; rmdir "$L" 2>/dev/null; }
trap 'cleanup' EXIT

# Run the command as a child, hold the lock until it exits, propagate its exit code and signals.
nice -n 5 "$@" &
child=$!
trap 'kill -TERM "$child" 2>/dev/null' TERM
trap 'kill -INT "$child" 2>/dev/null' INT
trap 'kill -HUP "$child" 2>/dev/null' HUP
wait "$child"
exit $?
