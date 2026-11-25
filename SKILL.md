---
name: agentic-maestro
description: "Build high-quality code in the working mode that fits the session: direct (the strong model writes the code itself), frontier (a strong model conducts strong coders), critical (strong coders plus mandatory red-team passes, for important APIs and smart contracts), economy (a strong model conducts cheap coders such as DeepSeek or GLM), reserve (no strong-model credits left), redteam (security check of a plan or commit), audit (full security review of a contract system or critical API) and harden (turn recurring findings into lint rules, types and tests). Each mode has its own model lineup and task list in an editable modes file, and runs on Claude Code, Codex or OpenCode. Use when implementing a feature, fixing a bug or refactoring where quality matters, when choosing which models do the work, when spawning or delegating to sub-agents, when writing an executor brief, when running a build, review, fix and merge pipeline, or when a security review or smart-contract audit is asked for."
license: MIT
compatibility: Claude Code, Codex, OpenCode (any Agent Skills host); Node.js 18+ and bash for the scripts
---

# agentic-maestro

The model running this session is the **maestro**. A **mode** says how a piece is performed: who
writes the code, who reviews it, and which tasks run in which order. Modes exist because sessions
differ — some days strong-model tokens are plentiful, some days they are gone, some work is a security
check and not a build. Every mode stands on the same floor (§1): precise rulings plus an independent
review are the safeguard, not a guarantee; who writes the code changes the cost, not the safeguard.

`<skill>` is this skill's directory; a path written as `scripts/...`, `references/...` or
`templates/...` in any file of the skill is relative to it. The maestro is called the orchestrator in
the brief templates and in `references/delegate.md`: the same role.

Terms used to choose a mode:
- **Lane**: a piece of the work with its own set of files that can be built and pass its gates without
  the other pieces.
- **Strong model**: the best model the user can run right now. When its credits are gone, the next
  best one conducts (`reserve`).
- **Build mode**: a mode that changes code — `direct`, `frontier`, `critical`, `economy`, `reserve`,
  `harden`.
- **High-risk work**: security rules, parsers of untrusted input, money, persistence and migrations,
  concurrency, public interfaces and stored formats, cross-system flows. Every file of the skill that
  says "high-risk" means this list.

## 0. Pick the mode, every session

1. Run `node <skill>/scripts/mode.mjs list`. It prints the modes in effect — the project's
   `maestro.modes.json`, else the user's file, else the built-in one — with each mode's `when`, cost
   and model lineup.
2. Choose:
   - The user named a mode or its meaning ("economy", "use the cheap models", "do it direct", "red
     team this"): that mode.
   - A mode was chosen earlier in this session: keep it until the user changes it. When the work
     changes kind (a security check is `redteam`, a full security review is `audit`, findings that keep
     returning are `harden`), propose the switch in one line and make it when the user agrees.
   - Otherwise list the modes whose `when` fits; read enough of the repository to count the lanes
     when the request does not settle it. One candidate: take it. None: take the file's `default`.
     Several that differ only in depth (`redteam` against `audit`): the lighter one for a single
     change, the deeper one for a whole component or a deployment; say which and why. Several that
     differ in who writes the code or in budget — strong coders against cheap ones, one writer
     against several — ask ONE question listing only those candidates with their `when` lines, the
     file's `default` first when it is among them. Never guess between budgets.
   - Trivial work — docs, copy, a local rename — needs no mode: do it, check it, say so.
3. Run `node <skill>/scripts/mode.mjs show <mode>`. Tell the user the mode and its lineup in one line
   (`role=model` pairs, as `list` prints them), read the files it lists under "read first", put its
   tasks on the task list in order, and follow its rules. Other files in `references/` are read when a
   task names them. When the mode lists `skills`, load the ones that are installed, for the target at
   hand, at the task that needs them, and name the missing ones in one line; never install one unasked.
4. The maestro is whatever model this session runs on. If the mode names a different one, say so in
   one line and continue: only the user can change the session's model. Independence is judged on the
   models actually running: when this session's model is from the same family as the mode's reviewer
   and the maestro writes the code, use a reviewer from another family (ask which, if the mode lists
   none).
5. Match the security effort to the work. Ordinary code gets the review its build mode gives and no
   security pass: do not over-secure it.
   - Code that moves money or value, grants authority, handles keys or secrets, or is a smart
     contract is built in `critical`. So is anything the user calls critical.
   - Other high-risk work (a migration, a new public endpoint, concurrency) stays in its build mode,
     takes the higher review tier there, and ends with a proposed `redteam` pass on the integrated
     commit.
   - Before a first deployment or release of a contract system, or of an API that moves money or
     grants authority, and after a large change to its value-moving or authority logic, propose
     `audit`.
   A proposal waits for the user's yes. A request that already is the check ("audit this", "check
   the contracts before mainnet") is the chosen mode, not a proposal.

Built-in modes (the modes file is the authority; this table is a summary):

| Mode | Who writes the code | For |
|---|---|---|
| `direct` | The maestro itself | Plenty of strong-model tokens, one lane, or work that needs judgement |
| `frontier` | Strong coders, conducted by the maestro | Ordinary code with plenty of tokens and several lanes; keeps the maestro's context for design and review |
| `critical` | Strong coders only | High-risk code: important APIs, smart contracts. Red team on the plan and on the commit, property tests required |
| `economy` | Cheap coders, conducted by a strong maestro | Saving strong-model tokens on work that sits behind exact rulings |
| `reserve` | Cheap coders, conducted by the best model still available | Strong-model credits are used up; run from Codex or OpenCode |
| `redteam` | Nobody (read-only) | A security check of one plan or one commit by independent reviewers |
| `audit` | Nobody (tests in a scratch copy) | A full security review of a contract system or a critical API: analyzers, panel, property tests, a proof per finding, a report |
| `harden` | The maestro, cheap coders for cleanup | Turning recurring findings into lint rules, types and tests |

One piece of work can use more than one: `direct` for a hard core, `economy` for the lanes around it,
`redteam` on the integrated commit. A change that is one file and under ~50 changed lines is done
inline by the maestro in any build mode except `critical`. Inline skips the brief and the spawn; it
does not skip the proof, the review its risk calls for, or the report.

To change a lineup or a mode's tasks: `node <skill>/scripts/mode.mjs init --user` (or `--project`),
edit the file, then `mode.mjs check`. Format and examples: `references/modes.md`. Spawn calls take
their model from the mode, never from memory:
`node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args <mode> <role>) --brief ... --dir ... --out ...`.

## 1. The floor (every mode)

1. **Rulings before code.** Resolve every ambiguity as an explicit ruling. Anything that parses,
   validates or gates is FAIL-CLOSED.
2. **Tests are evidence.** "Done" is a list of exact assertions written before the code; an existing
   test is never weakened, skipped or deleted to get a pass.
3. **Prove it on the real artifact.** Gates are judged by exit code, and anything that can run is run
   and leaves evidence (`references/verification.md`).
4. **Independent review** by a different model family from the one that wrote the code, for anything
   above trivial; every finding arbitrated — AGREE with an exact fix ruling, or DISAGREE / DEFER with
   a reason, never forwarded raw — and the approval tied to one commit SHA.
5. **Every correction becomes structure.** A correction from the user, the reviewer or your own second
   attempt is promoted to a type, a lint rule or a test before it becomes prose
   (`references/hardening.md`).
6. **Authority.** Commit, merge and push follow the user's and the project's rules. Reversible choices
   inside the goal are ruled on and reported. Asked first, never assumed: irreversible or
   outward-facing actions, a change to a public interface or stored format, anything touching policy,
   money or identity that no ruling covers, and scope beyond the stated goal.

## 2. The three pipelines

A mode's `pipeline` says who writes the code and which roles the mode needs; its `read` list names
the playbook that explains its tasks.

- **direct** (`references/direct.md`): the maestro writes the code. Goal, baseline, reproduce or
  specify, shape, build in verified units, prove on the real artifact, self-review, independent
  review scaled by risk, harden, report. Playbooks for bug fix, feature, refactor, performance and
  investigation.
- **delegate** (`references/delegate.md`): the maestro plans and rules; executors implement precise
  briefs in their own worktrees; an independent reviewer checks every commit; fixes go to a fresh
  executor; small batches merge. `references/harnesses.md` has the spawn call for each agent CLI,
  `references/operations.md` the concurrency, git and ledger rules.
- **review** (`references/redteam.md`, `references/audit.md`): read-only reviewers challenge a plan,
  a commit or a whole component; the maestro arbitrates and proves each finding; fixes are built in
  a build mode.

## Files

| Path | Read it when |
|---|---|
| `references/modes.md` | Editing the modes file, adding a mode, changing a model |
| `references/direct.md` | The `direct` mode starts, or any mode that lists it |
| `references/delegate.md` | A mode that briefs executors starts: writing briefs, running build -> review -> fix -> merge |
| `references/redteam.md` | A security check of a plan or a commit starts |
| `references/audit.md` | A full security review of a component starts |
| `references/hardening.md` | A finding or correction is being promoted to a check |
| `references/verification.md` | Proving work on the real artifact: runtime evidence, feature map, driver, property and formal checks |
| `references/harnesses.md` | Spawning on Claude Code, Codex or OpenCode |
| `references/operations.md` | Several executors on one machine: lanes, git, reviewer prompts, cost ledger |
| `references/checklist.md` | Choosing checklist areas for a brief; adding a rule that needs judgement |
| `references/graphify.md` | Optional code graph for callers, imports and paths on a large repo |
| `templates/` | `modes.json` (built-in modes), brief, fix-brief, integration-brief, the shared `_rules.md`, a Claude Code agent definition, an example brief spec |

| Script | Does |
|---|---|
| `scripts/mode.mjs list \| show <mode> \| args <mode> <role> [--index n] \| check \| path \| init` | Prints and validates modes; `args` gives the launcher arguments for a role (`--index` picks one of a panel). Refuses an unknown key, role or model, and a reviewer from the coder's own family |
| `scripts/toolcheck.sh contracts\|api\|all` | Lists which analyzers are installed, so a report says "not covered" for a missing one |
| `scripts/brief.mjs <spec.json> --out <file>` | Assembles a brief from a JSON spec; refuses missing values, excerpts or keywords |
| `scripts/spawn.mjs --harness claude\|codex\|opencode ...` | Runs one headless agent; writes `result.json` (session id, exit, tokens) and a ledger row |
| `scripts/scope-check.sh <worktree> <base> <allowed>...` | Lists changed files outside the brief's map |
| `scripts/excerpt.sh`, `scripts/conv.sh` | A pattern excerpt; the matching convention bullets, verbatim |
| `scripts/codemap.mjs <repo> [groups] \| --generic` | Generates `docs/CODEMAP.md` (JS/TS workspaces, or any git repo) |
| `graphify update <repo>` (optional, `uv tool install graphifyy`) | Builds a local code graph; `brief.mjs` pastes its `explain` / `path` answers into briefs |
| `scripts/gate.sh <cmd>` | Machine-wide lock: at most N heavy checks at once |
