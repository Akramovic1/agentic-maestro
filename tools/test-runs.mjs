#!/usr/bin/env node
// Tests scripts/runs.mjs against run directories in every state, and scripts/spawn.mjs end to end
// with a stand-in agent CLI, including a launcher that is killed while its agent keeps running.
// Usage: node tools/test-runs.mjs        Exit: 0 all passed; 1 a case failed.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNS = join(ROOT, 'scripts', 'runs.mjs');
const SPAWN = join(ROOT, 'scripts', 'spawn.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'maestro-runs-'));
let failed = 0;
let count = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runs = (args) => {
  const r = spawnSync(process.execPath, [RUNS, ...args], { encoding: 'utf8' });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
};
const check = (name, ok, detail = '') => {
  count++;
  if (ok) return console.log(`ok   ${name}`);
  failed++;
  console.log(`FAIL ${name}\n${detail}`);
};
const has = (name, got, code, needle) => check(name, got.code === code && got.text.includes(needle), `exit ${got.code} (want ${code}), want text "${needle}"\n${got.text}`);
const rowOf = (text, run) => text.split('\n').find((l) => l.startsWith(`${run} `)) ?? '';

// --- hand-made run directories, one per state
const dir = join(tmp, 'runs');
const make = (name, files, ages = {}) => {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), typeof body === 'string' ? body : JSON.stringify(body));
  for (const [f, secondsAgo] of Object.entries(ages)) {
    const t = new Date(Date.now() - secondsAgo * 1000);
    utimesSync(join(d, f), t, t);
  }
};
const started = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const run = (extra = {}) => ({ harness: 'codex', model: null, mode: 'write', feature: 'F12', round: '1', role: 'build', startedAt: started(3), timeoutSec: 3600, launcherPid: 1, childPid: 999999999, ...extra });
make('a-ok', { 'result.json': { harness: 'codex', status: 'ok', exitCode: 0, seconds: 120, sessionId: 'sess-1' }, 'run.json': run() });
make('b-failed', { 'result.json': { harness: 'claude', model: 'opus', status: 'failed', exitCode: 1, seconds: 30, sessionId: null } });
make('c-running', { 'run.json': run(), heartbeat: 'x', 'events.jsonl': '{}\n', 'stderr.log': '' });
make('d-quiet', { 'run.json': run({ startedAt: started(40) }), heartbeat: 'x', 'events.jsonl': '{}\n', 'stderr.log': '' }, { 'events.jsonl': 1800, 'stderr.log': 1800 });
make('e-orphaned', { 'run.json': run({ startedAt: started(40) }), heartbeat: 'x', 'events.jsonl': '{}\n' }, { heartbeat: 600, 'events.jsonl': 600 });
make('f-legacy', { 'command.txt': '{}' });
make('g-timeout', { 'result.json': { harness: 'opencode', status: 'timeout', exitCode: 124, seconds: 3600 } });

const all = runs([dir]);
has('a mixed directory needs attention', all, 1, 'needs attention:');
check('a finished run shows its status and session', /a-ok\s+ok\s+F12 build r1\s+codex\s+2m\s+-\s+0\s+sess-1/.test(rowOf(all.text, 'a-ok')), all.text);
check('a failed run is flagged', rowOf(all.text, 'b-failed').includes('failed') && all.text.includes('b-failed (failed)'), all.text);
check('a live run is running and not flagged', /c-running\s+running/.test(rowOf(all.text, 'c-running')) && !all.text.includes('c-running ('), all.text);
check('a silent live run is quiet', /d-quiet\s+quiet/.test(rowOf(all.text, 'd-quiet')) && all.text.includes('d-quiet (quiet): no output for 30m'), all.text);
check('a run with a stale heartbeat is orphaned', /e-orphaned\s+orphaned/.test(rowOf(all.text, 'e-orphaned')) && all.text.includes('the agent is gone too'), all.text);
check('a directory that is not a run is unknown and not flagged', /f-legacy\s+unknown/.test(rowOf(all.text, 'f-legacy')) && !all.text.includes('f-legacy ('), all.text);
check('a timeout is flagged', all.text.includes('g-timeout (timeout)'), all.text);

const active = runs([dir, '--active']);
check('--active lists only unfinished runs', !active.text.includes('a-ok') && !active.text.includes('f-legacy') && active.text.includes('c-running') && active.text.includes('e-orphaned'), active.text);
const tolerant = runs([dir, '--active', '--quiet-after', '45', '--dead-after', '900']);
has('thresholds are adjustable: nothing is quiet or orphaned', tolerant, 0, 'running');
const json = runs([dir, '--json']);
let parsed = null;
try { parsed = JSON.parse(json.text); } catch { /* reported below */ }
check('--json is one array with a state per run', Array.isArray(parsed) && parsed.length === 7 && parsed.find((r) => r.name === 'e-orphaned')?.state === 'orphaned', json.text);

const clean = join(tmp, 'clean');
mkdirSync(join(clean, 'only-ok'), { recursive: true });
writeFileSync(join(clean, 'only-ok', 'result.json'), JSON.stringify({ harness: 'codex', status: 'ok', exitCode: 0, seconds: 5 }));
has('all finished and ok: exit 0', runs([clean]), 0, 'only-ok');
has('nothing active', runs([clean, '--active']), 0, 'no active runs');
has('a missing runs directory is a usage error', runs([join(tmp, 'nope')]), 2, 'no such runs directory');
has('a bad threshold is a usage error', runs([dir, '--quiet-after', '0']), 2, 'must be a positive integer');
has('an unknown option is a usage error', runs([dir, '--watch']), 2, "unknown option '--watch'");

// --- end to end: spawn.mjs with a stand-in CLI that sleeps, then a launcher killed mid-run
const fake = join(tmp, 'fake-cli.sh');
writeFileSync(fake, '#!/bin/sh\ncat >/dev/null\necho \'{"type":"started"}\'\nsleep "${FAKE_SLEEP:-3}"\n');
chmodSync(fake, 0o755);
const work = join(tmp, 'work');
mkdirSync(work);
const brief = join(tmp, 'brief.md');
writeFileSync(brief, 'do nothing\n');
const live = join(tmp, 'live');
const launch = (name, sleepSec) => spawn(process.execPath, [SPAWN, '--harness', 'codex', '--bin', fake, '--brief', brief, '--dir', work, '--out', join(live, name)], { stdio: 'ignore', env: { ...process.env, FAKE_SLEEP: String(sleepSec) } });
const exited = (child) => new Promise((r) => child.on('exit', r));

const one = launch('one', 3);
await sleep(1200);
check('spawn.mjs writes run.json and a heartbeat at start', existsSync(join(live, 'one', 'run.json')) && existsSync(join(live, 'one', 'heartbeat')));
const mid = runs([live]);
check('a job in flight is running', /one\s+running/.test(rowOf(mid.text, 'one')) && mid.code === 0, mid.text);
await exited(one);
const after = runs([live]);
check('the same job ends with the status spawn.mjs recorded', /one\s+no_report/.test(rowOf(after.text, 'one')) && after.code === 1, after.text);

const two = launch('two', 30);
await sleep(1200);
const info = JSON.parse(readFileSync(join(live, 'two', 'run.json'), 'utf8'));
two.kill('SIGKILL');
await exited(two);
await sleep(2200);
const lost = runs([live, '--active', '--dead-after', '2']);
check('a killed launcher leaves an orphaned run and names the surviving agent pid', /two\s+orphaned/.test(rowOf(lost.text, 'two')) && lost.text.includes(`pid ${info.childPid} still exists`), lost.text);
try { process.kill(-info.childPid, 'SIGKILL'); } catch { /* already gone */ }

rmSync(tmp, { recursive: true, force: true });
console.log(`${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
