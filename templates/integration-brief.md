<role>You integrate ONE merge batch. You only merge, renumber, move code to its new home and fix merge seams; no behaviour changes.</role>
<workspace>
- Work ONLY in {{WORKTREE}} (branch {{BRANCH}} — the integration branch — based on {{BASE}}: {{CURRENT_NUMBERING}}).
- Before every shell command: {{ENV_EXPORTS}}
- Never pipe a command into `tail`. Write output to a log, print the exit code, then tail the log; keep the full log for the orchestrator: `cmd > /tmp/am.log 2>&1; echo "exit=$?"; tail -30 /tmp/am.log`.
- Authority: you may commit and push ONLY on this integration branch, with the exact messages below. The orchestrator owns merging to main; never touch main.
- Never read secrets, env or credential files; never make paid or subscription calls.
</workspace>
<task>
1. `git merge --no-ff origin/{{BRANCH_A}}` — {{WHAT_A}}. Renumber: {{RENUMBER_A}} (every reference). Message: "{{MSG_A}}".
2. …
Moved code since these branches were cut: {{MOVES}}.
After the merge these behaviours/invariants must hold, each proved by a test: {{INVARIANTS}}.
Semantic conflicts (both sides valid but incompatible) are reported to the orchestrator, never resolved by your judgement. Mechanical conflicts to resolve in place: {{MECHANICAL}}.
Seams in one commit "{{SEAM_MSG}}".
</task>
<gates>
{{SUITES_OF_EVERY_PACKAGE_THAT_WRITES_OR_READS_A_CHANGED_SHARED_FORMAT}}
whole-repo typecheck, lint, build (concurrency 1)
</gates>
<review>
The final integrated commit (SHA) is reviewed by the independent reviewer before merging to main. The reviewer also receives the original requirements/acceptance, these rulings, and permission to challenge a ruling (if a ruling itself is wrong, say so).
</review>
<report>At most 8 lines: commits, conflicts and resolutions, renumbering, seams, each gate with counts and exit code. Blocked questions: list each.</report>
