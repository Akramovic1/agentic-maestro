#!/bin/bash
# Machine-wide gate lock: at most $GATE_SLOTS (default 2) heavy check commands at once across all
# lanes. Usage: gate.sh <command...>.
#   GATE_SLOTS    number of slots (positive integer, base 10; '08' is 8; default 2)
#   GATE_LOCK_DIR lock directory (default ${TMPDIR:-/tmp}/agentic-maestro-gate, created 0700)
#   GATE_MAX_WAIT max seconds to wait for a slot (positive integer, default 3600; on timeout exit 75)
#
# The lock is a KERNEL lock on one file per slot ($GATE_LOCK_DIR/slot.<n>), so a stale lock cannot
# exist: when the holder dies the operating system releases it. Acquisition is non-blocking with
# flock(1) when it exists (Linux util-linux); otherwise a single embedded python3 program acquires
# the slot itself with fcntl.flock(LOCK_EX|LOCK_NB). Each round tries every slot and then sleeps 2 s.
# The command runs as a child in its own process group (its own session) while the lock stays held;
# INT/TERM/HUP are forwarded to that group, the lock is kept until the child exits, and the child's
# exit code is propagated (128+signal if it was killed by a signal). There is NO unlocked fallback:
# exit 69 if there is no lock mechanism or the lock directory cannot be created or written.
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

if command -v flock >/dev/null; then
  MECH=flock
elif command -v python3 >/dev/null; then
  MECH=python3
else
  echo "gate.sh: neither 'flock' nor 'python3' is available; refusing to run unlocked" >&2
  exit 69
fi

if ! mkdir -p "$LOCK_DIR"; then
  echo "gate.sh: cannot create lock directory '$LOCK_DIR'; refusing to run unlocked" >&2
  exit 69
fi
chmod 700 "$LOCK_DIR"
probe="$LOCK_DIR/.probe.$$"
# The probe is the only step allowed to silence stderr.
if ! ( : >"$probe" ) 2>/dev/null; then
  echo "gate.sh: lock directory '$LOCK_DIR' is not writable; refusing to run unlocked" >&2
  exit 69
fi
rm -f "$probe"

if [ "$MECH" = python3 ]; then
  # One program: acquires a slot, then runs the command as its child in a new session, forwards
  # INT/TERM/HUP to the child's process group, keeps the lock fd until the child exits, and exits
  # with the child's status (128+signal when killed). MAX_WAIT expiry exits 75.
  exec python3 -c '
import fcntl, os, signal, subprocess, sys, time

lock_dir = sys.argv[1]
slots = int(sys.argv[2])
max_wait = int(sys.argv[3])
cmd = sys.argv[4:]


def fail(code, message):
    sys.stderr.write("gate.sh: " + message + "\n")
    sys.exit(code)


# Acquire a slot: non-blocking flock on each slot per round, 2 s between rounds.
lock_fd = None
deadline = time.monotonic() + max_wait
while lock_fd is None:
    for n in range(1, slots + 1):
        path = os.path.join(lock_dir, "slot.%d" % n)
        try:
            fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
        except OSError as exc:
            fail(69, "cannot use slot %d under %s: %s; refusing to run unlocked"
                 % (n, lock_dir, exc.strerror))
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            continue
        lock_fd = fd
        break
    if lock_fd is None:
        if time.monotonic() >= deadline:
            fail(75, "timed out after %ds waiting for a gate slot (GATE_SLOTS=%d, lock=%s)"
                 % (max_wait, slots, lock_dir))
        time.sleep(2)

child = None
pending = []


def forward(signum, frame):
    if child is None:
        pending.append(signum)
        return
    try:
        os.killpg(child.pid, signum)
    except OSError:
        pass


for forwarded in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(forwarded, forward)

try:
    os.nice(5)
except OSError:
    pass

try:
    child = subprocess.Popen(cmd, start_new_session=True)
except OSError as exc:
    fail(127, "%s: %s" % (cmd[0], exc.strerror or exc))

for signum in pending:
    try:
        os.killpg(child.pid, signum)
    except OSError:
        pass

rc = child.wait()
os.close(lock_fd)
if rc < 0:
    sys.exit(128 - rc)
sys.exit(rc)
' "$LOCK_DIR" "$SLOTS" "$MAX_WAIT" "$@"
fi

LOCK_FD=

# try_slot <n>: 0 acquired, 1 busy, 2 error. On success sets LOCK_FD.
try_slot() {
  slot="$LOCK_DIR/slot.$1"
  LOCK_FD=
  # Writable-file test before opening on fd 9; the wrapper's stderr stays untouched afterwards.
  if ! ( : >>"$slot" ) 2>/dev/null; then
    return 2
  fi
  exec 9>"$slot" || return 2
  if flock -n 9; then
    LOCK_FD=9
    return 0
  fi
  exec 9>&-
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
  if [ -n "$LOCK_FD" ]; then
    exec 9>&-
    LOCK_FD=
  fi
}
trap 'release' EXIT

forward() { kill -"$1" -- -"$child" 2>/dev/null || kill -"$1" "$child" 2>/dev/null; }
trap 'forward TERM' TERM
trap 'forward INT' INT
trap 'forward HUP' HUP

# Run the command as a child in its own process group; the lock stays held until it exits.
set -m
nice -n 5 "$@" 9>&- &
child=$!
set +m

wait "$child"; rc=$?
while kill -0 "$child" 2>/dev/null; do
  wait "$child"; rc=$?
done
release
trap - EXIT
exit $rc
