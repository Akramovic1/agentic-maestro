#!/bin/bash
# Machine-wide gate lock: at most $GATE_SLOTS (default 2) heavy check commands at once across all
# lanes. Usage: gate.sh <command...>.
#   GATE_SLOTS    number of slots (positive integer, base 10; '08' is 8; default 2)
#   GATE_LOCK_DIR lock directory (default ${TMPDIR:-/tmp}/agentic-maestro-gate, created 0700)
#   GATE_MAX_WAIT max seconds to wait for a slot (positive integer, default 3600; on timeout exit 75)
#
# The lock is a KERNEL lock on one file per slot ($GATE_LOCK_DIR/slot.<n>), so a stale lock cannot
# exist: when the holder dies the operating system releases it. Acquisition is non-blocking with
# `flock -n` when the flock command exists (Linux util-linux), otherwise with a tiny embedded
# python3 holder using fcntl.flock(LOCK_EX|LOCK_NB) (macOS). Each round tries every slot and then
# sleeps 2 s. The command runs as a child in its own process group while the lock holder keeps the
# lock file open; INT/TERM are forwarded to that group, the lock is kept until the child exits, and
# the child's exit code is propagated. There is NO unlocked fallback: exit 69 if there is no lock
# mechanism or the lock directory cannot be created or written.
SLOTS=${GATE_SLOTS:-2}
LOCK_DIR=${GATE_LOCK_DIR:-${TMPDIR:-/tmp}/agentic-maestro-gate}
MAX_WAIT=${GATE_MAX_WAIT:-3600}

case "$SLOTS" in
  '' | *[!0-9]*)
    echo "gate.sh: GATE_SLOTS must be a positive integer (got '$SLOTS')" >&2
    exit 64
    ;;
esac
SLOTS=$((10#$SLOTS))
if [ "$SLOTS" -lt 1 ]; then
  echo "gate.sh: GATE_SLOTS must be a positive integer (got '$SLOTS')" >&2
  exit 64
fi

case "$MAX_WAIT" in
  '' | *[!0-9]*)
    echo "gate.sh: GATE_MAX_WAIT must be a positive integer (got '$MAX_WAIT')" >&2
    exit 64
    ;;
esac
MAX_WAIT=$((10#$MAX_WAIT))
if [ "$MAX_WAIT" -lt 1 ]; then
  echo "gate.sh: GATE_MAX_WAIT must be a positive integer (got '$MAX_WAIT')" >&2
  exit 64
fi

if [ "$#" -lt 1 ]; then
  echo "gate.sh: no command given; usage: gate.sh <command...>" >&2
  exit 64
fi

if command -v flock >/dev/null 2>&1; then
  MECH=flock
elif command -v python3 >/dev/null 2>&1; then
  MECH=python3
else
  echo "gate.sh: neither 'flock' nor 'python3' is available; refusing to run unlocked" >&2
  exit 69
fi

if ! mkdir -p "$LOCK_DIR" 2>/dev/null; then
  echo "gate.sh: cannot create lock directory '$LOCK_DIR'; refusing to run unlocked" >&2
  exit 69
fi
chmod 700 "$LOCK_DIR" 2>/dev/null
probe="$LOCK_DIR/.probe.$$"
if ! ( : >"$probe" ) 2>/dev/null; then
  echo "gate.sh: lock directory '$LOCK_DIR' is not writable; refusing to run unlocked" >&2
  exit 69
fi
rm -f "$probe" 2>/dev/null

LOCK_KIND=
LOCK_FD=
LOCK_HOLDER=

# try_slot <n>: 0 acquired, 1 busy, 2 error. On success sets LOCK_KIND/LOCK_FD/LOCK_HOLDER.
try_slot() {
  slot="$LOCK_DIR/slot.$1"
  LOCK_KIND=; LOCK_FD=; LOCK_HOLDER=
  if [ "$MECH" = flock ]; then
    exec 9>"$slot" 2>/dev/null || return 2
    if flock -n 9 2>/dev/null; then
      LOCK_KIND=flock; LOCK_FD=9
      return 0
    fi
    exec 9>&- 2>/dev/null
    return 1
  fi
  fifo="$LOCK_DIR/.ready.$$"
  rm -f "$fifo" 2>/dev/null
  mkfifo "$fifo" 2>/dev/null || return 2
  # Holder: acquire the kernel lock, report 0/1/3 on the ready FIFO, then hold until told to stop
  # (parent death shows as ppid 1).
  python3 -c '
import fcntl, os, sys, time
slot = sys.argv[1]; fifo = sys.argv[2]
try:
    w = os.open(fifo, os.O_WRONLY)
except OSError:
    sys.exit(3)
rc = 1
orig = os.getppid()
try:
    f = open(slot, "a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rc = 0
    except OSError:
        rc = 1
except Exception:
    rc = 3
try:
    os.write(w, str(rc).encode()); os.close(w)
except OSError:
    pass
if rc != 0:
    sys.exit(rc)
while True:
    time.sleep(0.5)
    if os.getppid() != orig:
        sys.exit(0)
' "$slot" "$fifo" &
  LOCK_HOLDER=$!
  msg=$(cat "$fifo" 2>/dev/null)
  rm -f "$fifo" 2>/dev/null
  if [ "$msg" = 0 ]; then
    LOCK_KIND=python3
    return 0
  fi
  wait "$LOCK_HOLDER" 2>/dev/null
  LOCK_HOLDER=
  [ "$msg" = 3 ] && return 2
  return 1
}

acquired=0
deadline=$(( $(date +%s) + MAX_WAIT ))
while [ "$acquired" = 0 ]; do
  s=1
  while [ "$s" -le "$SLOTS" ]; do
    try_slot "$s"; r=$?
    if [ "$r" = 0 ]; then acquired=1; break; fi
    if [ "$r" = 2 ]; then
      echo "gate.sh: cannot use slot $s under '$LOCK_DIR'; refusing to run unlocked" >&2
      exit 69
    fi
    s=$((s + 1))
  done
  [ "$acquired" = 1 ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "gate.sh: timed out after ${MAX_WAIT}s waiting for a gate slot (GATE_SLOTS=$SLOTS, lock=$LOCK_DIR)" >&2
    exit 75
  fi
  sleep 2
done

release() {
  if [ -n "$LOCK_HOLDER" ]; then
    kill -TERM "$LOCK_HOLDER" 2>/dev/null
    wait "$LOCK_HOLDER" 2>/dev/null
    LOCK_HOLDER=
  fi
  if [ -n "$LOCK_FD" ]; then
    exec 9>&- 2>/dev/null
    LOCK_FD=
  fi
}
trap 'release' EXIT

forward() { kill -TERM -- -"$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null; }
trap 'forward' TERM
trap 'forward' INT

# Run the command as a child in its own process group; the lock stays held until it exits.
set -m
if [ "$LOCK_KIND" = flock ]; then
  nice -n 5 "$@" 9>&- &
else
  nice -n 5 "$@" &
fi
child=$!
set +m

wait "$child"; rc=$?
while kill -0 "$child" 2>/dev/null; do
  wait "$child"; rc=$?
done
release
trap - EXIT
exit $rc
