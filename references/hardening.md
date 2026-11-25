# Hardening: every correction becomes structure

An agent's output follows its input, and the codebase is the largest input it has. A workaround left
in the code is copied by the next agent as the established pattern; a rule written in prose is read
some of the time. So a correction is finished only when the repository itself prevents the mistake.
This applies in every mode: to findings from the reviewer, to corrections from the user, and to
anything you had to fix twice yourself.

## The ladder

For each agreed finding or correction, take the highest rung that fits. Lower rungs cost context on
every run and are followed less reliably.

| Rung | Form | Costs per run |
|---|---|---|
| 1 | **Make it impossible**: a type, an API that cannot be misused, a directory boundary, deleting the dangerous entry point | Nothing |
| 2 | **Static rule**: a lint rule, a banned import or call, a dependency rule | Nothing (runs in the gates) |
| 3 | **Test**: unit, property or architecture test that fails on the mistake | Nothing (runs in the gates) |
| 4 | **Runtime check**: an assertion or refusal at the boundary | Nothing |
| 5 | **Prose**: a checklist rule or a convention line | Context in every brief and session |

Prose is for what needs judgement ("prefer the smaller interface"). If a rule can be stated as "never
call X outside Y", it is rung 1 or 2, not rung 5.

When to climb:
- A finding in a **second** feature with the same category: promote it now.
- A finding that touches security, money or stored data: promote on the **first** occurrence.
- A rule already in prose that is still being broken: it was on the wrong rung; move it up and delete
  the prose line.

## Writing a static rule

**The message is a brief.** The agent that trips the rule reads only the error text, so it must carry
the fix: what is wrong, what to do instead, where the pattern is.

```
Bad:  "setTimeout is not allowed."
Good: "No timers in feature code: a timer here hides an ordering problem between the store and the
       view. Subscribe to the store event instead (pattern: src/features/chat/useChatScroll.ts).
       If no event exists, report a blocked question; do not disable this rule."
```

**Land the rule with the cleanup.** A rule that forbids new cases while old ones remain teaches the
opposite of what it says, because the old cases are still the pattern. Fix the existing occurrences
in the same batch. When there are too many, record the current count as a baseline that may only go
down, and schedule the cleanup as its own lanes.

**Disabling is a finding.** A new suppression comment, an added exemption or a raised threshold is
reviewed like a weakened test: it needs a written reason, and "the rule was in the way" is not one.

Tools that already exist, by ecosystem (use the project's own before adding one):

| Ecosystem | Banned calls and imports | Boundaries between directories |
|---|---|---|
| JS / TS | ESLint `no-restricted-imports`, `no-restricted-syntax`, `no-restricted-properties` | dependency-cruiser, or `no-restricted-imports` with path patterns |
| Python | Ruff `banned-api` (flake8-tidy-imports) | import-linter contracts |
| Go | golangci-lint `forbidigo`, `depguard` | `internal/` packages, `depguard` |
| Rust | Clippy `disallowed_methods`, `disallowed_types` | Crate and module visibility |
| Any | An architecture test that scans source text | An architecture test that scans imports or file lists |

## Shapes that remove a whole category

- **Ban what needs nuance.** An API that is correct only with care is misused at volume. Allow it in
  one framework layer, ban it everywhere else, and expose a narrow wrapper that cannot be misused.
- **Put the boundary in the directory tree.** Two top-level directories with imports between them
  forbidden say more than a paragraph about layering, and the rule is one line. It also makes a
  brief's map and `scope-check.sh` trivial to write.
- **Derive instead of accept.** If callers keep passing a wrong destination, key or path, remove the
  parameter and derive the value. This is the structural ruling of the fix-brief, kept permanently.
- **Delete the old way.** Deprecated code that still compiles is still a pattern. Migrate the callers
  and delete it, or move it behind a boundary that new code cannot import.

## Comments and prose

- No comment justifies a workaround, a skipped rule or a "temporary" shortcut. That text is an escape
  hatch, it cannot be enforced, and the next agent treats it as permission. The work is a blocked
  question or a finding instead.
- Comments that stay: an invariant the code cannot express, a reference to the spec or decision
  record, public API documentation.
- A correction given once is not automatically a rule. Before writing it down anywhere, ask whether it
  holds for the whole project or only for this change; agents over-apply small corrections recorded as
  permanent law.
- When a rule moves up the ladder, delete its prose line from the project's own checklist or
  instruction file; those shrink as the gates grow. The skill's own files are never edited for a
  project (a project still on the skill's default checklist copies it to
  `docs/conventions/review-checklist.md` first).

## Bookkeeping

- Tag each agreed finding with one category (`input/clamp`, `tests/fake-negative`); put it in the
  ledger's `findings` column and in the report (`HARDENED:` in the direct report block).
- A category with a check gets the check's name next to it, so the next arbitration sees it is
  covered and a recurrence means the check has a hole.
- Watch three numbers per component class: fix rounds per feature, findings per review, and reverts
  after merge. Falling numbers are what justify lighter review for that class; a class is not trusted
  with less review because it feels safe.
