#!/usr/bin/env node
// Tests scripts/mode.mjs against the built-in modes file and against broken copies of it: every
// broken copy must be refused with the right exit code and message, and the built-in file must pass.
// Usage: node tools/test-mode.mjs        Exit: 0 all passed; 1 a case failed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODE = join(ROOT, 'scripts', 'mode.mjs');
const BUILTIN = join(ROOT, 'templates', 'modes.json');
const tmp = mkdtempSync(join(tmpdir(), 'maestro-mode-'));
let failed = 0;
let count = 0;

const run = (args, opts = {}) => {
  const r = spawnSync(process.execPath, [MODE, ...args], { encoding: 'utf8', cwd: opts.cwd ?? tmp, env: { ...process.env, MAESTRO_MODES: '', XDG_CONFIG_HOME: join(tmp, 'xdg'), ...(opts.env ?? {}) } });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
};
const check = (name, got, code, needle) => {
  count++;
  if (got.code === code && got.text.includes(needle)) return console.log(`ok   ${name}`);
  failed++;
  console.log(`FAIL ${name}: exit ${got.code} (want ${code}), want text "${needle}"\n${got.text}`);
};
const broken = (name, edit) => {
  const cfg = JSON.parse(readFileSync(BUILTIN, 'utf8'));
  edit(cfg);
  const p = join(tmp, `${name.replace(/[^a-z0-9]+/gi, '-')}.json`);
  writeFileSync(p, JSON.stringify(cfg));
  return p;
};
const refuses = (name, edit, needle, code = 1) => check(name, run(['check', '--file', broken(name, edit)]), code, needle);

check('built-in file is valid', run(['check', '--file', BUILTIN]), 0, 'ok ');
check('list names the default', run(['list', '--file', BUILTIN]), 0, '(default)');
check('show prints tasks', run(['show', 'frontier', '--file', BUILTIN]), 0, 'tasks:');
check('unknown mode', run(['show', 'nope', '--file', BUILTIN]), 2, "no such mode 'nope'");
check('unknown command', run(['frobnicate', '--file', BUILTIN]), 2, 'unknown command');

refuses('unknown mode key', (c) => { c.modes.direct.taks = ['x']; }, "unknown key 'taks'");
refuses('unknown top-level key', (c) => { c.extra = 1; }, "unknown key 'extra'");
refuses('wrong version', (c) => { c.version = 2; }, '"version" must be 1');
refuses('default names no mode', (c) => { c.default = 'nope'; }, '"default" must name');
refuses('reviewer from the maestro family in a direct mode', (c) => { c.modes.direct.roles.maestro = 'fable'; c.modes.direct.roles.reviewer = 'sonnet'; }, 'also writes the code (maestro)');
refuses('reviewer from the executor family in a delegate mode', (c) => { c.modes.economy.roles.reviewer = 'deepseek-flash'; }, 'also writes the code (executor)');
refuses('reviewer from the strong executor family', (c) => { c.modes.economy.roles.reviewer = 'sonnet'; }, 'also writes the code (executorStrong)');
refuses('unknown model alias', (c) => { c.modes.frontier.roles.executor = 'gpt'; }, "unknown model alias 'gpt'");
refuses('unknown role', (c) => { c.modes.frontier.roles.conductor = 'fable'; }, "unknown role 'conductor'");
refuses('missing required role', (c) => { delete c.modes.frontier.roles.reviewer; }, "needs 'reviewer'");
refuses('review mode with nobody to review', (c) => { delete c.modes.redteam.roles.redteam; }, "needs 'reviewer' or 'redteam'");
refuses('opencode model left to the CLI default', (c) => { c.models.glm.model = null; }, 'opencode needs provider/model');
refuses('model id with shell characters', (c) => { c.models.glm.model = 'a b; echo x'; }, 'without spaces or quotes');
refuses('model id with a comment character', (c) => { c.models.glm.model = 'opencode/glm#high'; }, 'without spaces or quotes');
refuses('model id that looks like an option', (c) => { c.models.glm.model = '--dry-run'; }, 'without spaces or quotes');
refuses('effort that looks like an option', (c) => { c.models.codex.effort = '-x'; }, 'an effort level, or null');
refuses('unknown harness', (c) => { c.models.glm.harness = 'cursor'; }, 'must be one of claude, codex, opencode');
refuses('model without a family', (c) => { delete c.models.glm.family; }, 'name the vendor family');
refuses('read path outside the skill', (c) => { c.modes.direct.read = ['../outside.md']; }, 'no such file in the skill');
refuses('read path that does not exist', (c) => { c.modes.direct.read = ['references/nope.md']; }, 'no such file in the skill');
refuses('empty task list', (c) => { c.modes.direct.tasks = []; }, 'tasks: must be a non-empty list');
refuses('several models on a role that takes one', (c) => { c.modes.frontier.roles.executor = ['opus', 'sonnet']; }, 'only reviewer and redteam');
refuses('unknown pipeline', (c) => { c.modes.direct.pipeline = 'waterfall'; }, 'pipeline: must be one of');

const sameFamilyAllowed = broken('same family allowed', (c) => { c.modes.economy.roles.reviewer = 'deepseek-flash'; c.modes.economy.roles.executorStrong = 'opus'; c.modes.economy.allowSameFamilyReview = true; });
check('same-family review passes only with the explicit flag', run(['check', '--file', sameFamilyAllowed]), 0, 'ok ');
const withSkills = broken('skills', (c) => { c.modes.redteam.skills = ['some-audit-skill']; });
check('a mode may name skills to load', run(['show', 'redteam', '--file', withSkills]), 0, 'skills to load: some-audit-skill');
check('the built-in maestro is the session in every mode', run(['list', '--file', BUILTIN]), 0, 'maestro=session');
check('show says the maestro is the session model', run(['show', 'direct', '--file', BUILTIN]), 0, 'session (the model this session runs on)');
check('show asks for the session family when the session writes the code', run(['show', 'direct', '--file', BUILTIN]), 0, 'pass --session-family');
check('nothing to spawn for a session maestro', run(['args', 'direct', 'maestro', '--file', BUILTIN]), 2, 'is the session itself');
check('a Claude session keeps the first reviewer', run(['args', 'direct', 'reviewer', '--session-family', 'anthropic', '--file', BUILTIN]), 0, '--harness codex');
check('a Codex session skips the reviewer from its own family', run(['args', 'direct', 'reviewer', '--session-family', 'openai', '--file', BUILTIN]), 0, '--harness opencode --model opencode/glm-5.3');
check('show marks the reviewer a Codex session must not use', run(['show', 'direct', '--session-family', 'openai', '--file', BUILTIN]), 0, "[this session's own family: not used]");
check('a dependent reviewer picked by index is refused', run(['args', 'direct', 'reviewer', '--index', '1', '--session-family', 'openai', '--file', BUILTIN]), 1, "this session's own family (openai)");
check('an independent reviewer picked by index is allowed', run(['args', 'direct', 'reviewer', '--index', '2', '--session-family', 'openai', '--file', BUILTIN]), 0, 'opencode/glm-5.3');
check('the session family does not limit reviewers when executors write the code', run(['args', 'frontier', 'reviewer', '--session-family', 'openai', '--file', BUILTIN]), 0, '--harness codex');
check('a bad session family is a usage error', run(['check', '--session-family', 'Open AI', '--file', BUILTIN]), 2, '--session-family is a family name');
const onlyOwn = broken('only own family', (c) => { c.modes.direct.roles.reviewer = ['codex']; });
check('without a session family the file alone cannot tell', run(['check', '--file', onlyOwn]), 0, 'ok ');
check('a session with no independent reviewer is refused', run(['check', '--session-family', 'openai', '--file', onlyOwn]), 1, "nobody here is independent of this session's family 'openai'");
refuses('session used for a role other than maestro', (c) => { c.modes.frontier.roles.executor = 'session'; }, 'only the maestro can be "session"');
refuses('session defined as a model', (c) => { c.models.session = { harness: 'claude', model: 'opus', effort: null, family: 'anthropic' }; }, '"session" is reserved');
const pinned = broken('pinned maestro', (c) => { c.modes.direct.roles.maestro = 'fable'; });
check('a mode may still pin its maestro to one model', run(['show', 'direct', '--file', pinned]), 0, 'fable (claude fable high)');
check('a pinned maestro is checked against its reviewers by the file alone', run(['check', '--file', broken('pinned clash', (c) => { c.modes.direct.roles.maestro = 'fable'; c.modes.direct.roles.reviewer = ['sonnet']; })]), 1, 'also writes the code (maestro)');
check('built-in audit lists skills by target', run(['show', 'audit', '--file', BUILTIN]), 0, '  contracts: x-ray');
check('built-in critical has a red-team panel', run(['args', 'critical', 'redteam', '--index', '1', '--file', BUILTIN]), 0, '--mode read-only');
check('built-in critical codes with a strong model', run(['args', 'critical', 'executor', '--file', BUILTIN]), 0, '--model opus');
refuses('empty skills group', (c) => { c.modes.audit.skills.contracts = []; }, 'skills.contracts: must be a non-empty list');
refuses('skills that are not names', (c) => { c.modes.audit.skills = { api: ['a b'] }; }, 'skills.api: must be a non-empty list');
refuses('critical reviewed by the coder family', (c) => { c.modes.critical.roles.redteam = ['sonnet']; }, 'also writes the code (executor)');
writeFileSync(join(tmp, 'notjson.json'), '{not json');
check('unreadable file', run(['check', '--file', join(tmp, 'notjson.json')]), 2, 'cannot read modes file');

check('args for a write role', run(['args', 'frontier', 'executor', '--file', BUILTIN]), 0, '--harness claude --model opus --effort high\n');
check('args add read-only for a reviewer', run(['args', 'frontier', 'reviewer', '--file', BUILTIN]), 0, '--mode read-only');
check('args refuse a panel without --index', run(['args', 'redteam', 'redteam', '--file', BUILTIN]), 2, 'pass --index 1..2');
check('args pick a panel member', run(['args', 'redteam', 'redteam', '--index', '2', '--file', BUILTIN]), 0, '--mode read-only');
check('args refuse an index out of range', run(['args', 'redteam', 'redteam', '--index', '3', '--file', BUILTIN]), 2, '--index must be 1..2');
check('args refuse a role the mode lacks', run(['args', 'direct', 'executor', '--file', BUILTIN]), 2, "has no role 'executor'");

const proj = join(tmp, 'proj');
mkdirSync(join(proj, '.git'), { recursive: true });
mkdirSync(join(proj, 'pkg', 'sub'), { recursive: true });
check('with no project or user file the built-in one is used', run(['path'], { cwd: join(proj, 'pkg', 'sub') }), 0, '(built-in)');
check('init --project writes the file', run(['init', '--project'], { cwd: proj }), 0, 'maestro.modes.json');
check('init never overwrites', run(['init', '--project'], { cwd: proj }), 1, 'already exists');
check('a project file is found from a subdirectory', run(['path'], { cwd: join(proj, 'pkg', 'sub') }), 0, '(project)');
check('the copy init --project wrote is trusted', run(['check'], { cwd: join(proj, 'pkg', 'sub') }), 0, '(project)');
appendFileSync(join(proj, 'maestro.modes.json'), '\n');
check('a changed project file is reported as not trusted', run(['path'], { cwd: proj }), 0, '(project, not trusted)');
check('a changed project file is refused, not silently replaced', run(['list'], { cwd: proj }), 1, 'is not trusted');
check('args are refused for an untrusted project file', run(['args', 'frontier', 'executor'], { cwd: proj }), 1, 'is not trusted');
check('--file still works beside an untrusted project file', run(['check', '--file', BUILTIN], { cwd: proj }), 0, '(--file)');
check('trust accepts the project file as it is now', run(['trust'], { cwd: proj }), 0, 'trusted ');
check('a trusted project file is used again', run(['list'], { cwd: proj }), 0, '(project)');
const cloned = join(tmp, 'cloned');
mkdirSync(join(cloned, '.git'), { recursive: true });
writeFileSync(join(cloned, 'maestro.modes.json'), readFileSync(BUILTIN, 'utf8'));
check('a project file that came with a repository is refused until trusted', run(['show', 'direct'], { cwd: cloned }), 1, 'is not trusted');
writeFileSync(join(cloned, 'maestro.modes.json'), '{not json');
check('an invalid project file cannot be trusted', run(['trust'], { cwd: cloned }), 2, 'cannot read modes file');
const loose = join(tmp, 'loose', 'work');
mkdirSync(loose, { recursive: true });
writeFileSync(join(tmp, 'loose', 'maestro.modes.json'), readFileSync(BUILTIN, 'utf8'));
check('a modes file outside any repository is ignored', run(['path'], { cwd: loose }), 0, '(built-in)');
const nested = join(tmp, 'outer', 'inner');
mkdirSync(join(nested, '.git'), { recursive: true });
writeFileSync(join(tmp, 'outer', 'maestro.modes.json'), readFileSync(BUILTIN, 'utf8'));
check('a modes file above the repository root is ignored', run(['path'], { cwd: nested }), 0, '(built-in)');
check('trust needs a project file', run(['trust'], { cwd: loose }), 2, 'trust applies to a project');
check('init --user writes under XDG_CONFIG_HOME', run(['init', '--user']), 0, join('agentic-maestro', 'modes.json'));
check('a user file is used outside a project', run(['path']), 0, '(user)');
check('the project file wins over the user file', run(['path'], { cwd: proj }), 0, '(project)');
check('$MAESTRO_MODES wins over both', run(['path'], { cwd: proj, env: { MAESTRO_MODES: withSkills } }), 0, '($MAESTRO_MODES)');

rmSync(tmp, { recursive: true, force: true });
console.log(`${count - failed}/${count} passed`);
process.exit(failed ? 1 : 0);
