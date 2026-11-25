#!/usr/bin/env node
// Shows the state of every run directory that scripts/spawn.mjs created, without reading a
// transcript: which agents are still working, which have gone quiet, which lost their launcher, and
// how the finished ones ended. It only reads files; it starts, stops and deletes nothing.
//
// Usage: node scripts/runs.mjs [<runs-dir>] [--active] [--json] [--quiet-after <minutes>] [--dead-after <seconds>]
//   <runs-dir>      default .agent-runs in the current directory; each sub-directory is one run
//   --active        list only the runs that are not finished
//   --json          one JSON array instead of the table
//   --quiet-after   minutes without output before a running job is reported as quiet (default 10)
//   --dead-after    seconds without a heartbeat before a job counts as orphaned (default 60)
//
// States:
//   running   the launcher's heartbeat is fresh and the agent wrote output recently
//   quiet     the heartbeat is fresh but nothing was written for --quiet-after minutes: read the tail
//             of stderr.log and events.jsonl, and stop the job if it is looping or waiting
//   orphaned  no result and no fresh heartbeat: the launcher died. The agent CLI may still be running
//             (its pid is shown); stop it, then relaunch into a NEW run directory
//   ok | failed | timeout | no_report | cli_missing    finished: the status spawn.mjs recorded
//   unknown   a directory with neither result.json nor run.json (made by an older spawn.mjs, or not a run)
// Exit: 0 nothing needs attention; 1 at least one run is quiet, orphaned, failed, timed out or ended
// without a report; 2 usage or an unreadable runs directory.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const fail = (code, msg) => {
  console.error(`runs.mjs: ${msg}`);
  process.exit(code);
};
const USAGE = 'usage: node scripts/runs.mjs [<runs-dir>] [--active] [--json] [--quiet-after <minutes>] [--dead-after <seconds>]';

const argv = process.argv.slice(2);
const opt = { active: false, json: false, 'quiet-after': '10', 'dead-after': '60' };
let root = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--active') opt.active = true;
  else if (a === '--json') opt.json = true;
  else if (a === '--quiet-after' || a === '--dead-after') {
    if (i + 1 >= argv.length) fail(2, `${a} needs a value\n${USAGE}`);
    opt[a.slice(2)] = argv[++i];
  } else if (a.startsWith('--')) fail(2, `unknown option '${a}'\n${USAGE}`);
  else if (root === null) root = a;
  else fail(2, `unexpected argument '${a}'\n${USAGE}`);
}
for (const k of ['quiet-after', 'dead-after']) if (!/^[1-9][0-9]*$/.test(opt[k])) fail(2, `--${k} must be a positive integer`);
const quietMs = Number(opt['quiet-after']) * 60_000;
const deadMs = Number(opt['dead-after']) * 1000;
root = resolve(root ?? '.agent-runs');
if (!existsSync(root)) fail(2, `no such runs directory: ${root}\n  It is created by the first agent spawned from a project. Run this from that project's folder, or pass the path.`);

const now = Date.now();
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
};
const pidExists = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const span = (ms) => {
  if (ms === null || !Number.isFinite(ms)) return '-';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

let names;
try {
  names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
} catch (e) {
  fail(2, `cannot read ${root}: ${e.message}`);
}

const FINISHED_BAD = new Set(['failed', 'timeout', 'no_report', 'cli_missing']);
const runs = [];
for (const name of names) {
  const dir = join(root, name);
  const result = existsSync(join(dir, 'result.json')) ? readJson(join(dir, 'result.json')) : null;
  const run = existsSync(join(dir, 'run.json')) ? readJson(join(dir, 'run.json')) : null;
  const lastOutput = Math.max(mtime(join(dir, 'events.jsonl')) ?? 0, mtime(join(dir, 'stderr.log')) ?? 0) || null;
  const beat = mtime(join(dir, 'heartbeat'));
  const started = run?.startedAt ? Date.parse(run.startedAt) : null;
  const r = {
    name, dir, state: 'unknown', attention: false, note: '',
    role: run?.role ?? null, feature: run?.feature ?? null, round: run?.round ?? null,
    harness: result?.harness ?? run?.harness ?? null, model: result?.model ?? run?.model ?? null,
    elapsed: null, sinceOutput: null, exitCode: result?.exitCode ?? null, sessionId: result?.sessionId ?? null,
    childPid: run?.childPid ?? null,
  };
  if (result) {
    r.state = typeof result.status === 'string' ? result.status : 'unknown';
    r.elapsed = typeof result.seconds === 'number' ? result.seconds * 1000 : null;
    r.attention = FINISHED_BAD.has(r.state);
    if (r.attention) r.note = 'read final.md and the tail of stderr.log before relaunching';
  } else if (run) {
    r.elapsed = started ? now - started : null;
    r.sinceOutput = lastOutput ? now - lastOutput : null;
    if (beat !== null && now - beat <= deadMs) {
      const silent = r.sinceOutput ?? r.elapsed ?? 0;
      if (silent > quietMs) {
        r.state = 'quiet';
        r.attention = true;
        r.note = `no output for ${span(silent)}: read the tail of stderr.log and events.jsonl; stop it if it is looping or waiting`;
      } else r.state = 'running';
    } else {
      r.state = 'orphaned';
      r.attention = true;
      r.note = `the launcher is gone; ${pidExists(r.childPid) ? `a process with the agent's pid ${r.childPid} still exists: stop it, then` : 'the agent is gone too:'} relaunch into a new run directory`;
    }
  } else if (opt.active) continue;
  if (opt.active && result) continue;
  runs.push(r);
}

const attention = runs.filter((r) => r.attention);
if (opt.json) {
  console.log(JSON.stringify(runs, null, 2));
} else if (runs.length === 0) {
  console.log(`no ${opt.active ? 'active ' : ''}runs in ${root}`);
} else {
  const rows = runs.map((r) => [
    r.name, r.state, [r.feature, r.role, r.round ? `r${r.round}` : null].filter(Boolean).join(' ') || '-',
    [r.harness, r.model].filter(Boolean).join(' ') || '-', span(r.elapsed), span(r.sinceOutput),
    r.exitCode === null ? '-' : String(r.exitCode), r.sessionId ?? '-',
  ]);
  const head = ['run', 'state', 'task', 'agent', 'elapsed', 'last output', 'exit', 'session'];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (row) => row.map((c, i) => c.padEnd(width[i])).join('  ').trimEnd();
  console.log([line(head), ...rows.map(line)].join('\n'));
  if (attention.length) console.log(['', 'needs attention:', ...attention.map((r) => `  ${r.name} (${r.state}): ${r.note}`)].join('\n'));
}
process.exit(attention.length ? 1 : 0);
