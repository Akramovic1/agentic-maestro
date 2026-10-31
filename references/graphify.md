# Code graph with graphify (optional, recommended for larger repos)

[graphify](https://github.com/Graphify-Labs/graphify) (Apache-2.0) turns a repository into a knowledge
graph: tree-sitter parses ~40 languages locally and resolves `calls` / `imports` / `inherits` across
files. Building the code graph needs **no LLM and sends nothing off the machine**. Every edge says
whether it was read from the source (`EXTRACTED`) or derived (`INFERRED`).

For the pipeline it replaces the two most expensive kinds of reading:

- **Orchestrator, writing a brief:** "who calls `exportRows`?", "how does the handler reach the DB
  pool?", "what is the pattern feature's neighbourhood?" are answered from `graph.json` instead of
  opening files or sending a scout.
- **Executor, during the build:** the brief carries a `<graph>` block with the answers it needs, and
  the shared rules tell the executor to ask the graph before grepping for any further structural
  question.

The code map (`scripts/codemap.mjs`) stays the fallback when graphify is not installed.

## When it pays

Use it when the repository is large enough that finding callers and paths costs real reading: roughly
200+ source files, or any monorepo. For a small repo `excerpt.sh` and the code map are cheaper than
building a graph.

## Install and build

```bash
uv tool install graphifyy          # or: pipx install graphifyy
graphify update /path/to/repo      # code-only, no LLM; writes /path/to/repo/graphify-out/graph.json
```

- Add `graphify-out/` to `.gitignore` (or commit the graph for the team, see graphify's docs).
- Build once per planning round, not per brief. On a large repo a build takes minutes (measured: about
  13 minutes for 702 files / 7,600 nodes on a laptop, and a rebuild after one edit was no faster,
  because linking symbols across files dominates). Run it in the background while you plan.
- `brief.mjs` refuses only a graph that is stale **for the files its answers cite**: if any of them
  changed after the graph was built, the brief names them and stops. An older graph whose cited files
  are unchanged is used as is.
- Worktrees: build once in the main checkout and point every brief at that `graph.json` (the spec's
  `"graph": {"graph": "/abs/path/graphify-out/graph.json"}`), so executors do not rebuild.
- Executors only run read-only queries (`explain`, `path`, `query`); they never run `update`.

## Measured

On a 702-file TypeScript/Firebase repo (7,600 nodes, 25,500 edges), `graphify explain` for five widely
used functions returned 4.6K tokens in total, against 383K tokens for the files that hold their
callers: 98.8% less. Reading every caller file whole is the worst case; an agent that greps and reads
ranges spends less, so treat this as an upper bound on the saving, not a typical one.

## Questions it answers

| Command | Answers | Use in a brief for |
|---|---|---|
| `graphify explain "X"` | X's file, kind and its most connected neighbours (callers, callees, imports) | the pattern feature, the function being changed, its callers |
| `graphify path "A" "B"` | the shortest dependency path from A to B | dependency contracts ("the handler reaches the pool through …") |
| `graphify query "question"` | a bounded traversal around the matching nodes | open structural questions while planning |

Exit codes: `0` an answer, `3` an ambiguous name (candidates are listed: use the full id), `4` no
matching node. `brief.mjs` turns 3 and 4 into a refused brief, never a silent gap.

## In a brief spec

```json
"graph": {
  "explain": ["exportRows", "checkLimits"],
  "paths": [["ExportHandler", "DbPool"]],
  "maxLines": 40
}
```

Optional keys: `"graph"` (path to graph.json, default `graphify-out/graph.json` under the spec root),
`"query"` (questions), `"maxLines"` (per answer, default 40), `"allowStale": true` (accept answers
that cite files changed since the build; avoid).

The block lands after `<map>` in build and fix briefs. Keep `explain` to the symbols the executor will
touch or must not break: each answer is ~20–40 lines, a fraction of the files it summarizes.
