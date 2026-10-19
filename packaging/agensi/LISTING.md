# Agensi listing copy (for the "Submit a Skill" form; not shipped in the zip)

**Name:** agentic-maestro

**Tagline (short description):**
Delegate coding work to cheaper sub-agents without losing quality: precise briefs, independent review, one launcher for Claude Code, Codex and OpenCode.

**Category:** Agents & Orchestration

**Tags:** multi-agent, orchestration, sub-agents, delegation, claude-code, codex, opencode, code-review, workflow-automation, cost-optimization

**Price:** Free (the same code is MIT-licensed on GitHub; a free listing builds reputation and drives traffic to the repo).

**Listing description:**

Your strongest model shouldn't write every line. agentic-maestro turns it into a conductor: it plans,
writes exact rulings, arbitrates review findings and merges, while cheaper sub-agents execute precise
briefs and an independent reviewer checks every result.

What you get:

- **When to spawn at all.** A rule for when delegation pays and when the orchestrator should just do it inline.
- **Briefs instead of context.** Templates for build, fix and integration briefs: exact rulings, a "done means" list, one pattern to copy, only the conventions that apply, and a fixed report block you can scan in seconds.
- **Fail-closed tooling.** `brief.mjs` refuses a brief with a missing value or a convention keyword that matches nothing; `scope-check.sh` flags files changed outside the brief's map, even ones hidden by renames or git index flags.
- **One launcher for every agent.** `spawn.mjs` runs Claude Code, Codex or OpenCode (v1 and v2) headless in write or read-only mode, resumes exact sessions, and records session id, exit code, tokens and cost per run.
- **A pipeline that converges.** Independent review from a different model family, arbitration of every finding, a fresh executor per fix round, a structural ruling after three rounds on the same component, and a checklist that learns from recurring findings.
- **Parallel lanes on one machine.** File ownership per lane, a lock for heavy checks, stacked branches and small merge batches.

Measured on one large TypeScript monorepo (field notes, not a benchmark): 65–70% fewer tokens re-read
by executors, about half the build time per feature, and fix rounds down from ~74 min to 10–25 min.
Lean headless mode cut a one-line Claude Code run from $0.15 to $0.06.

Works with Claude Code, Codex, OpenCode and any Agent Skills host. Requires Node.js 18+ and bash.
Source and docs: https://github.com/Akramovic1/agentic-maestro
