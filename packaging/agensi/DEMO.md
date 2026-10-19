# Agensi demo section (for the "See it in action" fields; not shipped in the zip)

## The request (what the buyer types)

Use agentic-maestro to add page-size limits to our export API. Delegate the build to a cheap executor on Codex, have Claude review it, and merge only if it passes.

## The result (what your agent delivers)

**Plan — 1 lane, delegated** (touches 3 files and needs tests, so a brief beats doing it inline)

| Ruling | Exact semantics |
|---|---|
| R1 | `pageSize` is an integer 1..500; anything else is refused with `EXPORT_PAGE_TOO_LARGE` (400), never clamped |
| R2 | The bound is checked before the database query runs |
| Contract | `exportRows(query)` keeps its signature; existing error codes are unchanged |

**Done means:** 500 succeeds; 0 and 501 are refused; no query is issued for a refused request (counted with the query spy).

**Brief assembled and checked**

```
$ node scripts/brief.mjs F12.json --out .agent-briefs/F12-build-r1.md
brief.mjs: wrote .agent-briefs/F12-build-r1.md (5.2 KB)
```

It carries the shared rules, the two quoted conventions that apply, the Input and Tests checklist areas, one pattern excerpt (`packages/import/src/limits.ts`), the 3-file map and the per-package gates.

**Executor (Codex, cheap model, own worktree)**

```
$ node scripts/spawn.mjs --harness codex --effort high --brief .agent-briefs/F12-build-r1.md --dir ../wt-F12 --out .agent-runs/F12-build-r1
spawn.mjs: codex ok exit=0 41s session=01a1539a-…
```

Report block:

```
STATUS: done
FILES: packages/export/src/limits.ts, packages/export/src/handler.ts, packages/export/test/limits.test.ts
R1: done
R2: done
GATE pnpm --filter @app/export test: exit=0 passed=48 failed=0
GATE pnpm --filter @app/export typecheck: exit=0
CHECKLIST: ok
BLOCKED: none
```

**Scope check before review:** `scope-check.sh ../wt-F12 3f2c1ab 'packages/export/'` → exit 0, nothing outside the map. Committed as `9c41e07`.

**Independent review (Claude, read-only)** on `9c41e07`: 1 finding.

- P2 — `limits.test.ts:31` tests 501 but not 0 → **AGREE**. Fix ruling: add the lower-bound test asserting `EXPORT_PAGE_TOO_LARGE` and zero queries.

**Fix round 1 (fresh executor, fix brief with the finding quoted):** 1 test added, gates exit 0. **Re-review in the reviewer's own session:** PASS.

**Merged** `9c41e07..b18d2aa` into main. Ledger: 2 executor runs, 1 review + 1 re-review, 0 blocked questions.

**Next steps:** regenerate `docs/CODEMAP.md` (a file was added), and add the clamping finding's category (`input/clamp`) to the project checklist if it shows up in a second feature.
