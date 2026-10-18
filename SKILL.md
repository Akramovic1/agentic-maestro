---
name: agentic-maestro
description: Orchestrate software work with a strong model as the conductor and cheaper models as executors, without losing quality. Use when delegating implementation, fixes or integration to a sub-agent (any model or harness), when writing a builder/fixer/integrator brief, or when running a build -> review -> fix -> merge pipeline.
---

# agentic-maestro

The strong model is the **maestro**: it holds all the context, makes every design decision, and writes
precise parts. Cheaper models are the **players**: they execute one part exactly, without needing the
whole score. Quality comes from the precision of the brief and from an independent review, not from
the executor's intelligence.

Part A is how to write a brief. Part B is how to run the pipeline. Templates are in `templates/`,
helper scripts in `scripts/`.

## Part A — Writing a brief

### Roles

- The orchestrator decides everything: architecture, rulings, limits, error codes, migration policy,
  acceptance. It never writes "decide how to…".
- The executor implements exactly the brief. It reads only the brief and the files in its map. If a
  design question comes up, it reports the question instead of deciding.

### The brief (fixed order, at most about 12 KB)

Use `templates/brief.md`. Sections:

1. **Role and workspace**: worktree path, branch, environment exports, "do not commit" (the
   orchestrator commits).
2. **Feature**: the id and the acceptance criteria, quoted exactly, plus the spec lines that define it.
3. **Rulings** R1..Rn: exact semantics, including names, codes, limits, formulas, refusal behaviour
   and versioning. Write them near code precision for anything touching security, money, persistence
   or parsing.
4. **Done means**: the exact assertions the tests must prove, derived from the acceptance criteria.
5. **File map**: the files to create or change, and ONE existing feature to copy as the pattern.
6. **Pattern excerpts**: at most 2 key functions of that pattern, pasted, up to 40 lines each
   (`scripts/excerpt.sh <file> <regex> [lines]`).
7. **Conventions**: at most 6 project rules that apply, quoted word for word
   (`scripts/conv.sh <conventions-dir> <keyword>...`).
8. **Code map pointer**: the sections of `docs/CODEMAP.md` for the packages it touches
   (`node scripts/codemap.mjs <repo> [groups...]` generates the map).
9. **Pre-review checklist**: only the areas the feature touches (see below).
10. **Gates**: per-package checks only (tests, typecheck and lint of the packages it changed), once
    at the end.
11. **Report contract**: at most N lines, one line per ruling, gate counts and exit codes.

### Pre-review checklist (paste only the relevant areas)

The reviewer's recurring finding categories. The executor self-checks each before reporting.

- **Storage**: re-verify stored data on every read with the write's own function; compare complete
  pins (id + version + content hash); recompute derived values and refuse mismatches.
- **Input**: never truncate, clamp or default — refuse with a fixed, value-free error; check bounds
  BEFORE expensive work; parse untrusted input strictly (model output, media, tool stderr, files); no
  free-text parsing where a structured channel exists; no caller-chosen destinations, keys or paths.
- **Media / sandbox**: no large reads inside locks or transactions; no unbounded lists from external
  data.
- **Concurrency**: retries and replays exactly-once (look up the recorded result first, a unique key
  per step); concurrent writers tested with two real connections.
- **Tests**: negative tests use REAL objects of the wrong kind, owner or state, not only nonexistent
  ids; boundary tests at exactly the limit and one over; never weaken or exempt an existing test
  (if one must change, say why).

### Working rules every brief carries

- Filter every command's output: `… 2>&1 | tail -30`, or grep for failures and the summary line.
  Raw output stays in context for every later step.
- Run tests after a group of related edits, not after each edit.
- Read files in ranges after a grep; never read a large file whole.
- If the same error repeats 3 times, or a command waits more than 10 minutes, stop and report
  instead of retrying.
- Never read secrets, env files or credentials; never make paid or subscription calls; never run
  commands marked user-only.

### Fix-round briefs (`templates/fix-brief.md`)

- Quote each review finding with its file:line, then give the exact ruling for it.
- List only the affected files. Never ask the executor to re-read the whole feature.
- Always a FRESH session per round; never resume the previous builder (transcripts multiply cost).
- If the same component drew findings 3 rounds in a row, the brief carries a **structural ruling**
  that removes the whole category (for example: "the caller can no longer name the destination;
  derive it"), not another patch.

### Integration briefs (`templates/integration-brief.md`)

- The exact merge order, with each commit message.
- Renumbering (migrations, decision records) with every reference to update.
- Code that moved since the branch was cut: where it lives now.
- Conflict policy: keep both sides, naming each piece that must survive.
- Seam fixes go in one commit, then the suites of every package that writes or reads a changed
  shared format (including Docker and e2e suites).

## Part B — Running the pipeline

### Loop

1. **Plan**: resolve every ambiguity as explicit rulings before building. Anything that parses,
   validates or gates money or security is specified FAIL-CLOSED from the start.
2. **Build**: one executor per feature, with the brief from Part A.
3. **Verify and review in parallel**: commit the executor's work, then run the reviewer (an
   independent model) and your own light verification at the same time on that commit.
4. **Arbitrate**: per finding, AGREE (with an exact fix ruling) or DISAGREE / DEFER (with a reason).
   Never forward raw findings.
5. **Fix**: a fresh executor per round, with the fix brief.
6. **Re-review**: resume the review by its own session id (never "the last session" when several run
   in parallel), scoped to the fix diff only.
7. **Merge**: small batches of 1–3 features as soon as each passes.

### Verification levels

- **Executor**: per-package checks for the packages it changed.
- **Orchestrator (light)**: whole-repo typecheck and lint once, plus the test suites of the changed
  packages and of the apps that consume them.
- **Full fresh-clone battery**: once at the end, or nightly while the user is away. Not per merge.
- Refactors that move files also run any tests that scan source text or file lists (architecture
  tests).

### Parallelism

- Stack dependent features: start B from unmerged A's branch, and rebase when A lands.
- Up to 4 executors at once (they are mostly idle while waiting on the model).
- At most 2 heavy check commands at any moment, through a lock script (`scripts/gate.sh`). Test any
  helper script INSIDE the executor's sandbox before relying on it: some sandboxes cannot write
  outside the worktree.
- Container runtimes capped (for example 2 CPUs). Never run a full battery alongside executors. Use
  `nice`, not background QoS (background priority made checks 3–4 times slower).

### Tooling hygiene

- Track every background job (a watcher or tracked run); never fire-and-forget with `&`. A "running"
  status with a dead process is orphaned: cancel and relaunch.
- Run CLI reviewers non-interactively with `< /dev/null` (some wait for stdin forever).
- Reviewer prompts: delta-scoped, "keep it tight, budget for the final report", findings as P1/P2/P3
  with file:line and a verdict. Frame as correctness and input validation, not attack wording.
- Some sandboxes cannot commit inside git worktrees: the orchestrator commits.
- Set executors to their maximum reasoning effort for new builds; high is enough for fix rounds and
  integration.

### Keep context small

- The project instruction file stays at most ~15 KB (rules, commands, index). Long per-area
  conventions live verbatim in `docs/conventions/<area>.md`.
- Progress/history files keep recent milestones; older ones are archived verbatim.
- Regenerate `docs/CODEMAP.md` after every merge.
- As orchestrator, read only the tails of executor and reviewer reports, and use the excerpt and
  code-map tools instead of opening large files.

### Model choice

- Use the strongest affordable model to orchestrate (plan, rule, arbitrate, merge).
- Use a cheaper executor for plumbing, schemas, CRUD, UI and refactors.
- Reserve a stronger executor for features that historically need 3+ review rounds: sandbox and
  security rules, parsers of untrusted media, renderers and determinism, and cross-system
  end-to-end work.
