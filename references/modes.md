# Modes: who plays, and which tasks run

A mode is one entry in the modes file: a model for each role, the files to read first, an ordered
task list and a few rules. `scripts/mode.mjs` reads and validates it; nothing else in the skill
hard-codes a model.

## Which file is in effect

The first that exists wins. Files are never merged, so the one in effect is the whole truth:

1. `--file <path>` on the command
2. `$MAESTRO_MODES`
3. `maestro.modes.json` in the current directory or a parent, inside the current git repository only
   (commit it to share a team's modes). It is used only once the user has trusted it — see below
4. `~/.config/agentic-maestro/modes.json` (your own lineups, for every project)
5. the skill's `templates/modes.json`

```bash
node scripts/mode.mjs path                 # which file, and why
node scripts/mode.mjs init --user          # copy the built-in file to ~/.config/agentic-maestro/ to edit
node scripts/mode.mjs init --project       # or to ./maestro.modes.json
node scripts/mode.mjs check                # validate after every edit
node scripts/mode.mjs trust                # accept the project file as it is now
```

### A project file has to be trusted

A `maestro.modes.json` arrives with the repository, so it may be somebody else's text. It decides which
models run and which tasks, rules and skills the agent follows; a hostile one is a way to steer the
agent. So `mode.mjs` uses a project file only when its SHA-256 is recorded in
`~/.config/agentic-maestro/trusted.json`. A new or changed project file makes every command refuse
(exit 1) instead of quietly falling back to another file. Read the file, then run `mode.mjs trust`.
`init --project` trusts the copy it writes; after you edit it, trust it again. The agent is told never
to run `trust` for you. A file outside a git repository, or above the repository root, is never used.

## Models

Name each model once under `models`, then use the alias in any mode:

```json
"models": {
  "fable":    { "harness": "claude",   "model": "fable",                    "effort": "high", "family": "anthropic" },
  "codex":    { "harness": "codex",    "model": null,                       "effort": "high", "family": "openai" },
  "deepseek": { "harness": "opencode", "model": "opencode/deepseek-v4-pro", "effort": null,   "family": "deepseek" }
}
```

- `harness` is the CLI that runs it: `claude`, `codex` or `opencode`.
- `model` is the exact id that CLI accepts. `null` means the CLI's configured default; OpenCode always
  needs `provider/model` — list yours with `opencode models`. Ids in the built-in file are examples
  from one machine: replace them with ids your account can run.
- `effort` is passed through to the CLI; `null` leaves it out.
- `family` is the vendor family. It is what makes a review independent: `mode.mjs` refuses a mode
  whose reviewer or red-team model shares a family with a role that writes the code.

Check a new model before relying on it: `mode.mjs args` builds the arguments, `--dry-run` shows the
command without running it.

```bash
node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args economy executor) --brief README.md --dir . --out /tmp/try --dry-run
```

## Roles

| Role | Does | Runs |
|---|---|---|
| `maestro` | Plans, rules, arbitrates, merges; writes the code in a direct mode | The current session |
| `executor` | Implements one brief | Write mode, its own worktree |
| `executorStrong` | Implements the high-risk briefs (security, parsers, money, persistence) | Write mode, its own worktree |
| `reviewer` | Independent review of a commit | Read-only |
| `redteam` | Security review of a plan or commit | Read-only |
| `scout` | Finds a pattern, lists callers; returns paths and facts | Read-only |

`reviewer` and `redteam` may list several aliases (a panel); pick one with `args ... --index <n>`.
In `direct` the first reviewer handles ordinary work and the whole list is the panel for high-risk
work.
`mode.mjs args` adds `--mode read-only` for the read-only roles.

The maestro is normally `"session"`: whatever model the session runs on, so the same mode works
whether you start it on Fable, Opus, GPT or a cheaper model. `session` is not defined under `models`
and only the maestro can use it. Because the file cannot know that model's family, the agent passes
it: `--session-family anthropic`. In a mode where the maestro writes the code (`direct`, `harden`)
the script then skips a reviewer from the same family, and refuses if nobody else is listed — which
is why those modes list reviewers from two families. A mode may still pin its maestro to one alias;
the skill cannot switch the session's model, so when they differ it says so and carries on. On Claude Code a role whose harness is
`claude` can also run in-process through the Agent tool, passing the alias's `model`
(`harnesses.md`).

## A mode

```json
"economy": {
  "title": "Economy: a strong maestro conducts cheap coders",
  "when": "Saving strong-model tokens: ...",
  "cost": "Lowest strong-model tokens per feature; more wall-clock and more fix rounds.",
  "pipeline": "delegate",
  "read": ["references/delegate.md", "references/harnesses.md"],
  "roles": { "maestro": "session", "executor": "deepseek", "executorStrong": "opus", "reviewer": "codex" },
  "tasks": ["Plan: ...", "Brief each lane ...", "..."],
  "rules": ["Route by risk: ..."]
}
```

- `when` and `cost` are what the maestro shows the user when it asks which mode to use. Write them
  for that reader.
- `pipeline` is `direct`, `delegate` or `review`; it decides the required roles and which playbook
  the tasks come from.
- `read` is everything loaded when the mode starts. Keep it short: every file costs context in every
  session that uses the mode.
- `tasks` is the order of work. Reword, reorder, remove or add steps to fit how you work; a step
  removed here is a step the maestro will not do. The floor in `SKILL.md` §1 still applies to any
  list.
- `rules` are the mode's own constraints, in addition to the floor.
- `skills` (optional) names other installed skills the mode leans on: a list, or lists keyed by target
  when the mode serves several (`"contracts"`, `"api"`). Write each name as your host lists it — a
  plugin's skill is usually `plugin:skill`. The maestro loads the ones that are installed and names
  the rest as missing; nothing is installed for you. This is how a specialist skill set is mixed into
  a mode without copying its text, which also keeps to its licence.

## Common edits

| You want | Change |
|---|---|
| Fable conducts, Opus codes | That is `frontier`. Run the session on Fable and say "frontier". |
| Another model conducts | Nothing to edit: start the session on that model. The maestro is the session's model in every built-in mode. |
| A different cheap coder | Point `models.deepseek.model` at another id, or add an alias and use it in `economy.roles.executor`. |
| Claude credits are gone | Start the session in Codex or OpenCode and say "reserve". Whatever model that session runs on conducts. |
| A second red-team reviewer | Add its alias to `redteam.roles.redteam`. Different families find different things. |
| Another chain or stack in audits | Add a target under `audit.skills` (for example `"solana"`) with the skills for it, and say the target when you start the audit. |
| Normal code versus important code | `frontier` for normal code, `critical` for important APIs and contracts, `audit` before a first deployment. |
| A lighter direct mode for small work | Copy `direct` under a new name with fewer tasks; keep prove, review and report. |
| A mode of your own | Add an entry with a `pipeline`, roles and tasks. `mode.mjs check` says what is missing. |
| A fallback mode | Set `"default"`: it is taken when no mode's `when` fits, and offered first when the maestro asks. It does not override a mode whose `when` fits. |
