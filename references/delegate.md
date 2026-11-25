# Delegate: the maestro conducts, players execute

Used by the modes that brief executors (`frontier`, `critical`, `economy`, `reserve`, and cleanup
lanes of `harden`). The maestro — called the orchestrator below and in the brief templates — holds all the
context, makes every design decision and writes precise parts; each executor plays one part exactly,
without the whole score. The mode decides which model plays; this file is the same for all of them.
The mode's task list is the order of work; Part B explains each of its steps.

A spawn costs a brief (~5–12 KB of maestro output), a review and a commit. Except in `critical`, the maestro does a
change inline when it is one file and under ~50 changed lines, or when writing the brief would take
longer than the change. For facts you need to WRITE a brief (where is the pattern, who calls X): when the
project has a code graph, ask it (`graphify explain|path|query`, `graphify.md`); when it has none, a
cheap read-only scout (the mode's `scout`) that returns paths and facts — not file dumps — is fine.
Design stays with the maestro.

When to ask the user instead of ruling: `SKILL.md` §1.6. A stored-format or public-interface change
that the request did not name is asked, not ruled.

## Part A — Writing a brief

### Roles
- The orchestrator specifies **observable** behaviour exactly: interfaces, limits, error codes and the
  critical invariants. It never writes "decide how to…".
- Routine implementation choices — local names, helper structure, internal layout — are the executor's.
- The executor implements exactly the brief, reads only its map plus their imports, callers, types and
  tests, and reports anything else as a blocked question.

### Sections (template order — stable blocks first, so parallel lanes share a cached prefix)
1. **Rules**: `templates/_rules.md`, identical in every brief (logging with exit codes, bounded reading,
   gates once, stop after 3 identical errors, scope, tests are evidence, comments, safety, blocked
   questions).
2. **Role**, then **Conventions**: only the project rules that apply, quoted verbatim (`conv.sh`).
3. **Checklist**: only the areas the feature touches (`checklist.md` format).
4. **Workspace**: baseline SHA, exact working directory, branch, env exports, prerequisites, "do not
   commit".
5. **Feature**: id and acceptance criteria quoted exactly, plus the spec lines that define it.
6. **Rulings** R1..Rn: exact semantics — names, codes, limits, formulas, refusal behaviour, versioning,
   and the dependency contracts not to break. Near-code precision for security, money, persistence and
   parsing. Anything that parses, validates or gates is FAIL-CLOSED.
7. **Done means**: the exact assertions the tests must prove.
8. **Map**: the only files it may create or change, ONE existing feature as the pattern — a clean one,
   because executors copy whatever it does, workarounds included — and the `docs/CODEMAP.md` sections
   to read. On a large repo add a **graph** block (`"graph"` in the spec): graphify's answers about the
   symbols it touches, so it never explores to find callers or paths.
9. **Excerpts**: usually ~2 key functions of the pattern (`excerpt.sh`).
10. **Gates**: exact per-package commands, wrapped by `gate.sh` when lanes run in parallel. A lint rule
    or test added by hardening belongs here, where it costs no brief context.
11. **Report**: the fixed block (STATUS / FILES / one line per ruling / one line per gate / CHECKLIST /
    BLOCKED), so a report is scanned in seconds and grepped across lanes.

Use `scripts/brief.mjs` (see `templates/brief-spec.example.json`): it fills the template, pulls
excerpts, conventions and checklist areas, prefixes gates, and refuses on any gap. ~12 KB is a
guideline for context cost, not a limit.

### Fix briefs (`templates/fix-brief.md`)
- Each finding quoted with file:line, then the exact ruling and the test that proves it.
- Only the affected files; never "re-read the feature".
- Repeat the rules, workspace, conventions, invariants and still-valid rulings: a fresh session knows
  nothing.
- Always a FRESH session per round; never resume the builder (its transcript multiplies cost).
- Same component with findings 3 rounds in a row: the brief carries a **structural ruling** that removes
  the whole category ("the caller can no longer name the destination; derive it"), not another patch.

### Integration briefs (`templates/integration-brief.md`)
- Exact merge order with commit messages and the SHA each merged branch must contain.
- Renumbering (migrations, decision records) with every reference; code that moved since the branch cut.
- Authority: commit and push ONLY on the integration branch; the orchestrator merges to main.
- The invariants that must hold after the merge, each tested; semantic conflicts are reported, never
  resolved by the executor.

## Part B — Running the pipeline

0. **First run on a project**: `brief.mjs` refuses a brief without quoted conventions and a code map.
   Make sure `docs/conventions/` holds the project rules briefs will quote, generate `docs/CODEMAP.md`
   (`codemap.mjs`), and git-ignore `.agent-logs/`, `.agent-briefs/` and `.agent-runs/`.
1. **Plan**: resolve every ambiguity as explicit rulings before any build. A change that cannot be
   split into lanes that each pass their gates alone (a repository-wide rename) is ONE lane, however
   many files it touches. On a large repo rebuild the
   code graph first in the background (`graphify update <repo>`; a brief refuses answers whose cited files changed since). Split the work into lanes,
   each with the files it owns; give shared hotspots (barrels, lockfiles, migration numbers, generated
   files) to one lane or to integration, and pick each lane's executor by risk (below).
2. **Spawn**: one executor per lane with its brief, in its own worktree, as a tracked background job
   (`harnesses.md`). Take the model from the mode, never from memory:
   `node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args <mode> executor) --brief ... --dir ... --out ...`.
   On Claude Code a role whose harness is `claude` may instead run in-process through the Agent tool,
   with the call's `model` set from the mode; every other role goes through `spawn.mjs`.
   Record each session id.
   While lanes run, watch them with `scripts/runs.mjs .agent-runs --active`: it says which are
   running, quiet or orphaned without a transcript being read (`operations.md`).
3. **Blocked questions**: answer in the SAME session (`SendMessage` / `spawn.mjs --resume <id>`) while
   its context is small — the executor finished everything else first. Only fix rounds start fresh.
4. **Check scope, then commit**: `scope-check.sh <worktree> <base> <map...>`; out-of-map files are
   reverted or ruled on BEFORE review. Check `git status`, commit (the orchestrator commits).
5. **Review and verify in parallel** on that commit: an independent reviewer (a different model family,
   `mode.mjs args <mode> reviewer`) and your own verification (levels below). Runtime evidence goes
   to the arbitration and to the reviewer of the integrated commit.
6. **Arbitrate**: per finding, AGREE with an exact fix ruling, or DISAGREE / DEFER with a reason. Never
   forward raw findings. Tag each agreed finding with a category; a category recurring in a second
   feature is promoted (`hardening.md`): a type, a lint rule or a test first, a project checklist rule
   (`checklist.md`) only when it needs judgement.
7. **Fix**: a fresh executor with the fix brief.
8. **Re-review**: resume the reviewer's OWN session id (never "the last session"); it reads the fix
   diff PLUS the invariants the fix touches and any open findings — never the fix diff alone.
9. **Integrate** the batch; the reviewer reviews the final integrated commit (SHA).
10. **Merge** small batches of 1–3 features as soon as each passes.

### Merge acceptance
Gates pass on the exact commit being merged; no unresolved P1/P2 findings; every deferral has a written
reason; the approval is tied to one immutable commit SHA.

### Reviewer grounding
Every review receives the original requirements/acceptance text, the brief's rulings, read access to the
repository and the dependency contracts, and explicit permission to challenge a ruling ("if a ruling
itself is wrong, say so"). Prompt shape: `operations.md`.

### Verification levels
- **Executor**: per-package checks of the packages it changed.
- **Orchestrator (light)**: whole-repo typecheck and lint once, plus the suites of the changed packages
  and the apps that consume them. Judge by exit codes, never by piped output.
- **Runtime**: where the feature can be run, the orchestrator drives it once on the commit under
  review and keeps the evidence (`verification.md`).
- **Full fresh-clone battery**: once at the end, or overnight. Not per merge.
- Refactors that move files also run tests that scan source text or file lists (architecture tests).

### Model, effort and cost
- Orchestrate with the strongest affordable model (plan, rule, arbitrate, merge).
- Route executors by **risk and observed history up front**: plumbing, schemas, CRUD, UI and refactors
  go to the mode's `executor`; high-risk work (`SKILL.md`, Terms), renderers and anything that must be
  deterministic go to its `executorStrong` from the start, at max effort for new builds. Fix rounds
  and integration: high is enough. A mode with no `executorStrong` uses its `executor` for
  everything; whether high-risk work may start there is the mode's own rule (`reserve` asks first).
- Track cost per feature (orchestration + execution + review + rework) in the ledger
  (`operations.md`) and let it move component classes between executors, and between modes.

### Keep the orchestrator's context small
Read the report block and `result.json`, not transcripts; read the full report and logs only when the
status is not done, an exit code is non-zero or the verdict is not PASS. Use `excerpt.sh` and the code
map instead of opening large files.
