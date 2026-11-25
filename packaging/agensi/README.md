# agentic-maestro

High-quality code from coding agents, in the working mode that fits the session. A strong model
conducts: it plans, writes exact rulings, arbitrates review findings and merges. In `direct` it writes
the code itself; in `frontier` and `economy` strong or cheap sub-agents execute precise briefs; in
`reserve` the work carries on without strong-model credits; `critical` builds important APIs and
smart contracts with red-team passes on the plan and the commit; `redteam` is a read-only security
check; `audit` is a full security review of a component; `harden` turns recurring findings into lint
rules, types and tests. An independent reviewer from a
different model family checks every result. Works with Claude Code, Codex and OpenCode, and any host
that reads Agent Skills.

## What is inside

| Path | Purpose |
|---|---|
| `SKILL.md` | How to pick a mode each session, the rules every mode shares, and what to read next |
| `templates/modes.json` | The built-in modes: a model for each role, the files to read, the ordered tasks and rules. Copy and edit it |
| `references/modes.md` | The modes file format, where your own copy lives, common edits |
| `references/direct.md` | The strong model writes the code: the loop, playbooks for bug fix, feature, refactor and performance, the report block |
| `references/delegate.md` | Writing a brief and running build -> review -> fix -> merge with executors |
| `references/redteam.md` | A read-only security check of a plan or a commit, with arbitration and re-check |
| `references/audit.md` | A full security review of a contract system or a critical API, in ten phases, ending in a report |
| `references/hardening.md` | Turning review findings and corrections into types, lint rules and tests |
| `references/verification.md` | Proving work on the real artifact: runtime evidence, feature map, driver, property and formal checks |
| `references/harnesses.md` | How to spawn on each agent: Claude Code (Agent tool or `claude -p`), Codex (`codex exec`), OpenCode (`opencode run`) |
| `references/checklist.md` | A pre-review checklist and how a project grows its own from recurring review findings |
| `references/operations.md` | Running several executors at once: lanes, git, reviewer prompts, context hygiene, cost ledger |
| `templates/` | Build, fix and integration brief templates, the shared rules block, a Claude Code sub-agent definition, an example brief spec |
| `scripts/mode.mjs` | Lists, shows and validates modes and prints the launcher arguments for a role; refuses a reviewer from the coder's own model family |
| `scripts/toolcheck.sh` | Lists which security analyzers are installed, so a report never implies coverage it did not have |
| `scripts/brief.mjs` | Assembles a brief from a JSON spec; refuses any missing value, excerpt or convention |
| `scripts/spawn.mjs` | Runs one headless agent (`claude`, `codex` or `opencode`) on a brief and records session id, exit code, tokens and cost |
| `scripts/scope-check.sh` | Lists files an executor changed outside its brief's map, before you spend a review |
| `scripts/codemap.mjs` | Generates `docs/CODEMAP.md` so executors navigate without exploring |
| `scripts/excerpt.sh`, `scripts/conv.sh` | Quote a pattern excerpt and the matching project conventions into a brief |
| `scripts/gate.sh`, `scripts/gate_lock.py` | A machine-wide lock so parallel executors never run more than N heavy checks at once |

## Requirements

- Node.js 18+ and bash for the scripts (`python3` for the lock on macOS).
- At least one agent CLI: Claude Code, Codex or OpenCode.

## Safety notes

- The scripts never read secrets, make network calls of their own, or install anything. `spawn.mjs`
  starts the agent CLI you choose, in the working directory you pass, with your existing login.
- Write-mode executors run with auto-approved edits inside their working directory: give each one a
  disposable git worktree. Read-only mode (reviews, scouts) cannot edit files.
- Every brief tells executors never to read secrets or credential files and to report anything the
  brief does not decide instead of guessing.

## Source

Open source (MIT): https://github.com/Akramovic1/agentic-maestro
