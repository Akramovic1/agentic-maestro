---
name: agentic-maestro
description: "Orchestrate software work with a strong model as the conductor and cheaper models as executors, aiming to keep quality: precise briefs plus an independent review are the safeguard, not a guarantee. Use when delegating implementation, fixes or integration to a sub-agent (any model or harness), when writing a builder/fixer/integrator brief, or when running a build -> review -> fix -> merge pipeline."
---

# agentic-maestro

The strong model is the **maestro**: it holds all the context, makes every design decision, and writes
precise parts. Cheaper models are the **players**: they execute one part exactly, without needing the
whole score. Quality is the aim: precise briefs plus an independent review are the safeguard, not a
guarantee; the executor's intelligence only changes the cost, not the safeguard.

Part A is how to write a brief. Part B is how to run the pipeline. Templates are in `templates/`,
helper scripts in `scripts/`.

## Part A — Writing a brief

### Roles

- The orchestrator specifies **observable** behaviour exactly: interfaces, limits, error codes and the
  critical invariants. It never writes "decide how to…".
- Routine implementation choices — local names, helper structure, internal layout — are the executor's.
- The executor implements exactly the brief. It may read the files in its map and their imports,
  callers, types and tests; no open-ended exploration. Anything else it needs is a reported question,
  not a decision.

### The brief (fixed order)

Use `templates/brief.md`. Sections:

1. **Role and workspace**: baseline commit SHA, exact working directory, worktree path, branch,
   environment exports, prerequisites, "do not commit" (the orchestrator commits).
2. **Feature**: the id and the acceptance criteria, quoted exactly, plus the spec lines that define it.
3. **Rulings** R1..Rn: exact semantics, including names, codes, limits, formulas, refusal behaviour
   and versioning, plus the dependency contracts it must not break. Write them near code precision for
   anything touching security, money, persistence or parsing.
4. **Done means**: the exact assertions the tests must prove, derived from the acceptance criteria.
5. **File map**: the files to create or change, and ONE existing feature to copy as the pattern.
6. **Pattern excerpts**: usually ~2 key functions of that pattern, pasted
   (`scripts/excerpt.sh <file> <regex> [lines]`).
7. **Conventions**: prefer only the project rules that apply, quoted word for word
   (`scripts/conv.sh <conventions-dir> <keyword>...`).
8. **Code map pointer**: the sections of `docs/CODEMAP.md` for the packages it touches
   (`node scripts/codemap.mjs <repo> [groups...]` generates the map).
9. **Pre-review checklist**: only the areas the feature touches (see below).
10. **Gates**: the exact per-package commands (tests, typecheck and lint of the packages it changed),
    once at the end.
11. **Report contract**: at most N lines, one line per ruling, gate counts and exit codes, and a
    **Blocked questions** section.

Brief size (~12 KB), excerpt length and the number of quoted conventions are guidelines ("prefer",
"usually") with one reason: context cost. They are not hard limits.

### Pre-review checklist (paste only the relevant areas)

Each area applies only when the feature touches that domain. The executor self-checks each relevant
one before reporting. These are default rules; a deviation needs a written reason in the report.

- **Storage**: re-verify stored data on every read with the write's own function; compare complete
  pins (id + version + content hash); recompute derived values and refuse mismatches. Anything
  shown or applied against a versioned record (findings, labels, proposals) carries the complete pin
  of the version it judged: render it only on that version, and refuse an apply whose pin is stale.
  Read shared records through their verifying reader, never by parsing their bytes directly.
- **Input**: never truncate, clamp or default — refuse with a fixed, value-free error; check bounds
  BEFORE expensive work; parse untrusted input strictly (model output, media, tool stderr, files); no
  free-text parsing where a structured channel exists; no caller-chosen destinations, keys or paths.
- **Media / sandbox**: no large reads inside locks or transactions; no unbounded lists from external
  data.
- **Concurrency**: recording is idempotent, keyed per step (look up the recorded result first, and
  test a replay by COUNTING stored results, not only model calls); an
  external side effect uses the provider's own idempotency key where one exists; concurrent writers
  tested with two real connections.
- **Tests**: negative tests use REAL objects of the wrong kind, owner or state, not only nonexistent
  ids; boundary tests at exactly the limit and one over; never weaken or exempt an existing test
  (if one must change, say why).

### Working rules every brief carries

- Never pipe a command into `tail`. Write its output to a UNIQUE log inside your own worktree (for
  example `.agent-logs/<step>.log`, git-ignored — never a shared `/tmp` path), then keep the exit
  code: `LOG=.agent-logs/<step>.log; mkdir -p .agent-logs; cmd > "$LOG" 2>&1; rc=$?; tail -30 "$LOG";
  echo "exit=$rc"`. Callers judge `rc`, never the tail.
- Run tests after a group of related edits, not after each edit.
- Read files in ranges after a grep; prefer not to read a large file whole (context cost).
- If the same error repeats 3 times, or a command waits more than 10 minutes, stop and report
  instead of retrying.
- Never read secrets, env files or credentials; never make paid or subscription calls; never run
  commands marked user-only.

### Fix-round briefs (`templates/fix-brief.md`)

- Quote each review finding with its file:line, then give the exact ruling for it.
- List only the affected files. Never ask the executor to re-read the whole feature.
- Repeat every time: the workspace/environment block, the conventions that apply, the invariants that
  must keep holding and the previous rulings that still apply — a fresh session knows nothing.
- Always a FRESH session per round; never resume the previous builder (transcripts multiply cost).
- If the same component drew findings 3 rounds in a row, the brief carries a **structural ruling**
  that removes the whole category (for example: "the caller can no longer name the destination;
  derive it"), not another patch.

### Integration briefs (`templates/integration-brief.md`)

- The exact merge order, with each commit message.
- Renumbering (migrations, decision records) with every reference to update.
- Code that moved since the branch was cut: where it lives now.
- **Authority**: the executor may commit and push ONLY on the integration branch, with the given
  messages; the orchestrator owns merging to main.
- **Invariants, not text**: list the behaviours/invariants that must hold after the merge, each one
  tested. Do not just say "keep both sides".
- **Semantic conflicts** (both sides valid but incompatible) are reported to the orchestrator, never
  resolved by the executor's judgement.
- Seam fixes go in one commit, then the suites of every package that writes or reads a changed
  shared format (including Docker and e2e suites).
- The final integrated commit (SHA) is reviewed by the independent reviewer before merging.

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
   in parallel). Read the fix diff PLUS the invariants the fix touches and any outstanding findings —
   never the fix diff alone.
7. **Integrate**: build the merge batch, then have the independent reviewer review the final
   integrated commit (SHA) before merging.
8. **Merge**: small batches of 1–3 features as soon as each passes.

### Merge acceptance

- Gates pass on the exact commit being merged.
- No unresolved blocking (P1/P2) findings.
- Every deferral has a written reason.
- Approval is tied to one immutable commit SHA.

### Reviewer grounding

Every review receives: the original requirements/acceptance text, the brief's rulings, read access to
the repository and the brief's dependency contracts, and explicit permission to challenge a ruling
("if a ruling itself is wrong, say so").

### Verification levels

- **Executor**: per-package checks for the packages it changed.
- **Orchestrator (light)**: whole-repo typecheck and lint once, plus the test suites of the changed
  packages and of the apps that consume them.
- **Full fresh-clone battery**: once at the end, or nightly while the user is away. Not per merge.
- Refactors that move files also run any tests that scan source text or file lists (architecture
  tests).

### Parallelism

- Stack dependent features: start B from unmerged A's branch, and rebase when A lands.
- Test any helper script INSIDE the executor's sandbox before relying on it: some sandboxes cannot
  write outside the worktree.

### Tooling hygiene

- Before the first executor runs, make sure the project ignores `.agent-logs/`; before committing an
  executor's work, check `git status` for stray files (logs, scratch scripts) instead of a blind
  `git add -A`.

- Track every background job (a watcher or tracked run); never fire-and-forget with `&`. A "running"
  status with a dead process is orphaned: cancel and relaunch.
- Run CLI reviewers non-interactively with `< /dev/null` (some wait for stdin forever).
- Reviewer prompts: delta-scoped, "keep it tight, budget for the final report", findings as P1/P2/P3
  with file:line and a verdict. Frame as correctness and input validation, not attack wording.
- Some sandboxes cannot commit inside git worktrees: the orchestrator commits.
- Push every lane with an explicit refspec (`git push -u origin HEAD:refs/heads/<branch>`), check the
  exit code, and check that local HEAD equals the remote branch: a stacked worktree branch inherits its
  parent's upstream, so a bare `git push` fails or targets the wrong branch. Integration briefs name the
  exact commit SHA each merged branch must contain.

### Keep context small

- The project instruction file stays at most ~15 KB (rules, commands, index). Long per-area
  conventions live verbatim in `docs/conventions/<area>.md`.
- Progress/history files keep recent milestones; older ones are archived verbatim.
- Regenerate `docs/CODEMAP.md` after merges that add, move or rename files.
- As orchestrator, read only the tails of executor and reviewer reports by default — but read the
  FULL report whenever the verdict is not PASS or any exit code is non-zero — and use the excerpt
  and code-map tools instead of opening large files.

### Model choice

- Use the strongest affordable model to orchestrate (plan, rule, arbitrate, merge).
- Use a cheaper executor for plumbing, schemas, CRUD, UI and refactors.
- Route by **risk and observed history up front**: security rules, parsers of untrusted input,
  renderers and determinism, and cross-system end-to-end work go to a stronger executor from the
  start — do not wait for rounds to fail.
- Second safeguard: if the same component drew findings 3 rounds in a row, issue the structural
  ruling from the fix-round section above.
- Track total cost per feature: orchestration + execution + review + rework.

### Operational notes (defaults, adjust per setup)

- Up to 4 executors at once (they are mostly idle while waiting on the model).
- At most 2 heavy check commands at any moment, through a lock script (`scripts/gate.sh`; `GATE_SLOTS`,
  `GATE_LOCK_DIR`, `GATE_MAX_WAIT`).
- Container runtimes capped (for example 2 CPUs). Never run a full battery alongside executors. Use
  `nice -n 5`, not background QoS (background priority made checks 3–4 times slower).
- Set executors to maximum reasoning effort for new builds; high is enough for fix rounds and
  integration.
- Integration commits carry no AI attribution trailer.
