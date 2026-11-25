#!/usr/bin/env node
// Reads the modes file: which modes exist, which models fill each role, the ordered tasks and rules
// of a mode, and the spawn.mjs arguments for one role. It fails closed: an unknown key, role, model
// alias or reference file, a mode whose reviewer shares a model family with the code's author, or a
// missing required role stops it with no output.
//
// Usage:
//   node scripts/mode.mjs list                         every mode: title, when, lineup
//   node scripts/mode.mjs show <mode> [--json]         lineup, files to read first, tasks, rules
//   node scripts/mode.mjs args <mode> <role> [--index <n>]
//                                                      one line of spawn.mjs arguments for that role:
//                                                      --harness H [--model M] [--effort E] [--mode read-only]
//   node scripts/mode.mjs check                        validate the file in effect
//   node scripts/mode.mjs path                         print which file is in effect and why
//   node scripts/mode.mjs init --user | --project      copy the built-in file there to edit (never overwrites)
// Every command takes --file <path> to name the modes file explicitly.
//
// The file in effect is the FIRST of these that exists; files are never merged:
//   1. --file <path>
//   2. $MAESTRO_MODES
//   3. maestro.modes.json in the current directory or the nearest parent, up to the repository root
//   4. ${XDG_CONFIG_HOME:-~/.config}/agentic-maestro/modes.json
//   5. the skill's templates/modes.json
//
// File shape (closed: any other key is refused):
// {
//   "version": 1,
//   "default": "<mode>",
//   "models": { "<alias>": { "harness": "claude|codex|opencode", "model": "<id>"|null,
//                            "effort": "<level>"|null, "family": "<vendor family>" } },
//   "modes":  { "<mode>": { "title", "when", "cost", "pipeline": "direct|delegate|review",
//                           "read": ["references/x.md"], "roles": { "<role>": "<alias>"|["<alias>"] },
//                           "tasks": ["..."], "rules": ["..."], "skills": ["<other skill>"],
//                           "allowSameFamilyReview": false } }
// }
// "skills" (optional) names other installed skills the mode leans on for specialist work: a list, or
// an object of lists keyed by target ("contracts", "api") when the mode serves several. The maestro
// loads the ones that are installed and names the ones that are not; mode.mjs cannot see the host's
// skill list, so it checks the shape only.
// Roles: maestro, executor, executorStrong, reviewer, redteam, scout. Required: direct -> maestro,
// reviewer; delegate -> maestro, executor, reviewer; review -> maestro and reviewer or redteam.
// "model": null means the CLI's own default (not allowed for opencode, which needs provider/model).
// A reviewer or red-team model must come from a different family than every role that writes code in
// that mode (maestro in direct; executor and executorStrong wherever they appear), unless the mode sets
// "allowSameFamilyReview": true.
// Exit: 0 done; 1 the modes file is invalid, or init found a file already there; 2 usage or unreadable.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILTIN = join(SKILL, 'templates', 'modes.json');
const PROJECT_NAME = 'maestro.modes.json';
const userPath = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'agentic-maestro', 'modes.json');
const fail = (code, msg) => {
  console.error(`mode.mjs: ${msg}`);
  process.exit(code);
};
const USAGE = 'usage: node scripts/mode.mjs list | show <mode> [--json] | args <mode> <role> [--index <n>] | check | path | init --user|--project   [--file <path>]';

const argv = process.argv.slice(2);
const flags = { json: false, user: false, project: false, file: null, index: null };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') flags.json = true;
  else if (a === '--user') flags.user = true;
  else if (a === '--project') flags.project = true;
  else if (a === '--file' || a === '--index') {
    if (i + 1 >= argv.length) fail(2, `${a} needs a value`);
    flags[a.slice(2)] = argv[++i];
  } else if (a.startsWith('--')) fail(2, `unknown option '${a}'\n${USAGE}`);
  else pos.push(a);
}
const cmd = pos[0];
if (!cmd) fail(2, USAGE);

const projectFile = () => {
  let dir = process.cwd();
  for (;;) {
    const p = join(dir, PROJECT_NAME);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (existsSync(join(dir, '.git')) || parent === dir) return null;
    dir = parent;
  }
};
const locate = () => {
  if (flags.file) return { path: resolve(flags.file), why: '--file' };
  if (process.env.MAESTRO_MODES) return { path: resolve(process.env.MAESTRO_MODES), why: '$MAESTRO_MODES' };
  const proj = projectFile();
  if (proj) return { path: proj, why: 'project' };
  if (existsSync(userPath())) return { path: userPath(), why: 'user' };
  return { path: BUILTIN, why: 'built-in' };
};

const HARNESSES = ['claude', 'codex', 'opencode'];
const PIPELINES = ['direct', 'delegate', 'review'];
const ROLES = ['maestro', 'executor', 'executorStrong', 'reviewer', 'redteam', 'scout'];
const READ_ONLY = new Set(['reviewer', 'redteam', 'scout']);
const WRITERS = { direct: ['maestro', 'executor', 'executorStrong'], delegate: ['executor', 'executorStrong'], review: [] };
const REQUIRED = { direct: ['maestro', 'reviewer'], delegate: ['maestro', 'executor', 'reviewer'], review: ['maestro'] };
const SAFE = /^[A-Za-z0-9._:/@#-]+$/; // values go into a shell command line through $(...)
const NAME = /^[a-z][a-z0-9-]*$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const closed = (obj, allowed, where, errs) => {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(`${where}: unknown key '${k}' (allowed: ${allowed.join(', ')})`);
};

function validate(cfg) {
  const errs = [];
  if (!isObj(cfg)) return ['the file is not a JSON object'];
  closed(cfg, ['version', 'default', 'models', 'modes'], 'top level', errs);
  if (cfg.version !== 1) errs.push(`"version" must be 1 (got ${JSON.stringify(cfg.version)})`);
  if (!isObj(cfg.models) || Object.keys(cfg.models).length === 0) errs.push('"models" must be a non-empty object');
  if (!isObj(cfg.modes) || Object.keys(cfg.modes).length === 0) errs.push('"modes" must be a non-empty object');
  if (errs.length) return errs;

  for (const [alias, m] of Object.entries(cfg.models)) {
    const w = `models.${alias}`;
    if (!NAME.test(alias)) errs.push(`${w}: an alias is lower-case letters, digits and '-'`);
    if (!isObj(m)) { errs.push(`${w}: must be an object`); continue; }
    closed(m, ['harness', 'model', 'effort', 'family'], w, errs);
    if (!HARNESSES.includes(m.harness)) errs.push(`${w}.harness: must be one of ${HARNESSES.join(', ')}`);
    if (m.model !== null && !(isText(m.model) && SAFE.test(m.model))) errs.push(`${w}.model: a model id without spaces or quotes, or null for the CLI default`);
    if (m.model === null && m.harness === 'opencode') errs.push(`${w}.model: opencode needs provider/model (see \`opencode models\`)`);
    if (m.effort !== null && !(isText(m.effort) && SAFE.test(m.effort))) errs.push(`${w}.effort: an effort level, or null`);
    if (!isText(m.family)) errs.push(`${w}.family: name the vendor family (it decides which reviewer is independent)`);
  }

  for (const [name, mode] of Object.entries(cfg.modes)) {
    const w = `modes.${name}`;
    if (!NAME.test(name)) errs.push(`${w}: a mode name is lower-case letters, digits and '-'`);
    if (!isObj(mode)) { errs.push(`${w}: must be an object`); continue; }
    closed(mode, ['title', 'when', 'cost', 'pipeline', 'read', 'roles', 'tasks', 'rules', 'skills', 'allowSameFamilyReview'], w, errs);
    for (const k of ['title', 'when', 'cost']) if (!isText(mode[k])) errs.push(`${w}.${k}: must be a non-empty string`);
    if (!PIPELINES.includes(mode.pipeline)) { errs.push(`${w}.pipeline: must be one of ${PIPELINES.join(', ')}`); continue; }
    if ('allowSameFamilyReview' in mode && typeof mode.allowSameFamilyReview !== 'boolean') errs.push(`${w}.allowSameFamilyReview: must be true or false`);
    if ('skills' in mode) {
      const groups = isObj(mode.skills) ? Object.entries(mode.skills) : [['', mode.skills]];
      if (groups.length === 0) errs.push(`${w}.skills: must not be empty`);
      for (const [g, list] of groups) {
        const where = g ? `${w}.skills.${g}` : `${w}.skills`;
        if (g && !NAME.test(g)) errs.push(`${where}: a target name is lower-case letters, digits and '-'`);
        if (!Array.isArray(list) || list.length === 0 || !list.every((x) => isText(x) && SAFE.test(x))) errs.push(`${where}: must be a non-empty list of skill names`);
      }
    }
    for (const k of ['read', 'tasks', 'rules']) {
      if (k === 'rules' && !(k in mode)) continue;
      if (!Array.isArray(mode[k]) || mode[k].length === 0 || !mode[k].every(isText)) errs.push(`${w}.${k}: must be a non-empty list of strings`);
    }
    if (Array.isArray(mode.read)) {
      for (const f of mode.read) {
        if (isText(f) && (f.startsWith('/') || f.split('/').includes('..') || !existsSync(join(SKILL, f)))) errs.push(`${w}.read: no such file in the skill: ${f}`);
      }
    }
    if (!isObj(mode.roles)) { errs.push(`${w}.roles: must be an object`); continue; }
    const families = {};
    for (const [role, v] of Object.entries(mode.roles)) {
      if (!ROLES.includes(role)) { errs.push(`${w}.roles: unknown role '${role}' (roles: ${ROLES.join(', ')})`); continue; }
      const list = Array.isArray(v) ? v : [v];
      if (list.length === 0 || !list.every(isText)) { errs.push(`${w}.roles.${role}: a model alias or a non-empty list of aliases`); continue; }
      if (Array.isArray(v) && !['reviewer', 'redteam'].includes(role)) errs.push(`${w}.roles.${role}: only reviewer and redteam may list several models`);
      for (const a of list) if (!isObj(cfg.models[a])) errs.push(`${w}.roles.${role}: unknown model alias '${a}' (have: ${Object.keys(cfg.models).join(', ')})`);
      families[role] = list.map((a) => cfg.models[a]?.family);
    }
    for (const r of REQUIRED[mode.pipeline]) if (!(r in mode.roles)) errs.push(`${w}.roles: a ${mode.pipeline} mode needs '${r}'`);
    if (mode.pipeline === 'review' && !('reviewer' in mode.roles) && !('redteam' in mode.roles)) errs.push(`${w}.roles: a review mode needs 'reviewer' or 'redteam'`);
    if (mode.allowSameFamilyReview !== true) {
      const writers = WRITERS[mode.pipeline].flatMap((r) => (families[r] ?? []).map((f) => [r, f]));
      for (const checker of ['reviewer', 'redteam']) {
        for (const f of families[checker] ?? []) {
          const clash = writers.find(([, wf]) => wf && wf === f);
          if (clash) errs.push(`${w}.roles.${checker}: family '${f}' also writes the code (${clash[0]}); pick another family or set "allowSameFamilyReview": true`);
        }
      }
    }
  }
  if (!isText(cfg.default) || !isObj(cfg.modes[cfg.default])) errs.push(`"default" must name one of the modes (${Object.keys(cfg.modes).join(', ')})`);
  return errs;
}

if (cmd === 'init') {
  if (pos.length !== 1 || flags.user === flags.project) fail(2, 'init needs exactly one of --user or --project');
  const dest = flags.user ? userPath() : join(process.cwd(), PROJECT_NAME);
  if (existsSync(dest)) fail(1, `${dest} already exists; left untouched`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(BUILTIN, 'utf8'));
  console.log(`wrote ${dest}\nedit it, then: node ${join(SKILL, 'scripts', 'mode.mjs')} check`);
  process.exit(0);
}

const src = locate();
if (cmd === 'path') {
  if (pos.length !== 1) fail(2, USAGE);
  console.log(`${src.path} (${src.why})`);
  process.exit(0);
}
let cfg;
try {
  cfg = JSON.parse(readFileSync(src.path, 'utf8'));
} catch (e) {
  fail(2, `cannot read modes file ${src.path}: ${e.message}`);
}
const errs = validate(cfg);
if (errs.length) fail(1, `invalid modes file ${src.path}:\n  - ${errs.join('\n  - ')}`);

const describe = (alias) => {
  const m = cfg.models[alias];
  return `${alias} (${[m.harness, m.model ?? 'CLI default', m.effort].filter(Boolean).join(' ')})`;
};
const lineup = (mode) => Object.entries(mode.roles).map(([role, v]) => `${role}=${(Array.isArray(v) ? v : [v]).join('+')}`).join('  ');
const getMode = (name) => {
  if (!name) fail(2, USAGE);
  const mode = cfg.modes[name];
  if (!mode) fail(2, `no such mode '${name}' (have: ${Object.keys(cfg.modes).join(', ')})`);
  return mode;
};

if (cmd === 'check') {
  if (pos.length !== 1) fail(2, USAGE);
  console.log(`ok ${src.path} (${src.why}): ${Object.keys(cfg.modes).length} modes, ${Object.keys(cfg.models).length} models, default ${cfg.default}`);
} else if (cmd === 'list') {
  if (pos.length !== 1) fail(2, USAGE);
  const out = [`modes file: ${src.path} (${src.why})`, `default: ${cfg.default}`, ''];
  for (const [name, mode] of Object.entries(cfg.modes)) {
    out.push(`${name}${name === cfg.default ? ' (default)' : ''}: ${mode.title}`, `  when:   ${mode.when}`, `  cost:   ${mode.cost}`, `  lineup: ${lineup(mode)}`, '');
  }
  console.log(out.join('\n').trimEnd());
} else if (cmd === 'show') {
  if (pos.length !== 2) fail(2, USAGE);
  const mode = getMode(pos[1]);
  if (flags.json) {
    const roles = Object.fromEntries(Object.entries(mode.roles).map(([r, v]) => [r, (Array.isArray(v) ? v : [v]).map((a) => ({ alias: a, ...cfg.models[a] }))]));
    console.log(JSON.stringify({ name: pos[1], ...mode, roles, source: src.path }, null, 2));
  } else {
    const out = [`mode: ${pos[1]} (${mode.title})`, `when: ${mode.when}`, `cost: ${mode.cost}`, `pipeline: ${mode.pipeline}`, 'lineup:'];
    for (const [role, v] of Object.entries(mode.roles)) out.push(`  ${role.padEnd(15)}${(Array.isArray(v) ? v : [v]).map(describe).join(', ')}`);
    out.push(`read first: ${mode.read.join(', ')}`, 'tasks:');
    mode.tasks.forEach((t, i) => out.push(`  ${String(i + 1).padStart(2)}. ${t}`));
    if (mode.rules) out.push('rules:', ...mode.rules.map((r) => `  - ${r}`));
    if (Array.isArray(mode.skills)) out.push(`skills to load: ${mode.skills.join(', ')}`);
    else if (mode.skills) out.push('skills to load, by target:', ...Object.entries(mode.skills).map(([g, list]) => `  ${g}: ${list.join(', ')}`));
    out.push(`modes file: ${src.path} (${src.why})`);
    console.log(out.join('\n'));
  }
} else if (cmd === 'args') {
  if (pos.length !== 3) fail(2, USAGE);
  const mode = getMode(pos[1]);
  const role = pos[2];
  if (!(role in mode.roles)) fail(2, `mode '${pos[1]}' has no role '${role}' (has: ${Object.keys(mode.roles).join(', ')})`);
  const list = Array.isArray(mode.roles[role]) ? mode.roles[role] : [mode.roles[role]];
  let i = 0;
  if (flags.index !== null) {
    if (!/^[1-9][0-9]*$/.test(flags.index) || Number(flags.index) > list.length) fail(2, `--index must be 1..${list.length} for ${pos[1]}.${role}`);
    i = Number(flags.index) - 1;
  } else if (list.length > 1) fail(2, `${pos[1]}.${role} lists ${list.length} models (${list.join(', ')}); pass --index 1..${list.length}`);
  const m = cfg.models[list[i]];
  const parts = ['--harness', m.harness];
  if (m.model) parts.push('--model', m.model);
  if (m.effort) parts.push('--effort', m.effort);
  if (READ_ONLY.has(role)) parts.push('--mode', 'read-only');
  console.log(parts.join(' '));
} else fail(2, `unknown command '${cmd}'\n${USAGE}`);
