# agentic-maestro

A Claude Code skill for **orchestrated delegation**: a strong model conducts (plans, rules, arbitrates,
merges), cheaper models execute, and quality holds because every executor gets a precise, self-contained
brief and every result passes an independent review.

It distils what was measured while building a large TypeScript monorepo with a strong orchestrator,
a low-cost executor (DeepSeek v4.1 Flash) and Codex as reviewer. The main levers:

- **Briefs instead of context.** Executors read the brief and their files, not the project docs:
  exact rulings, a "done means" list, one pattern to copy (with excerpts), the few conventions that
  apply (quoted), code-map pointers and a pre-review checklist. Observed on one project (a TypeScript
  monorepo), not a benchmark: the first lean briefs cut tokens re-read by ~65–70% and halved build
  time; fix rounds went from ~300 steps / 74 min to 64–150 steps / 10–25 min.
- **A pre-review checklist** built from the reviewer's recurring finding categories, so most
  findings never happen.
- **Parallel review and light verification**, stacked branches, small merge batches, and one full
  battery at the end.
- **Risk-routed executors and concurrency control** for running several on one laptop.

## Layout

- `SKILL.md`: the skill. Part A is writing briefs; Part B is running the pipeline.
- `templates/`: brief, fix-brief and integration-brief templates.
- `scripts/codemap.mjs`: generates `docs/CODEMAP.md` (per package: source files with header-comment
  purpose and size, plus main exports — exports are approximate, matched by regex).
  `node scripts/codemap.mjs <repo> [groups...]`
- `scripts/excerpt.sh`: a code excerpt for a brief. `excerpt.sh <file> <regex> [lines]`
- `scripts/conv.sh`: quotes matching convention bullets with their continuation lines.
  `conv.sh <dir-or-file> <keyword>...`
- `scripts/gate.sh`: a machine-wide lock for heavy check commands (`GATE_SLOTS`, `GATE_LOCK`,
  `GATE_MAX_WAIT`).

## Install

Link the repository into your Claude Code skills folder:

```bash
ln -s ~/Documents/GitHub/agentic-maestro ~/.claude/skills/agentic-maestro
```

## Portability

Tested on macOS with Bash 3.2 and Node 24. Linux is untested.
