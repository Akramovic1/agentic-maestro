<task>
Fix round {{ROUND}}. Do not commit.
</task>
<workspace>
- Baseline commit: {{SHA}}. Exact working directory: {{WORKDIR}}. Worktree {{WORKTREE}}, branch {{BRANCH}}. Never touch other directories.
- Before every shell command: {{ENV_EXPORTS}}
- Never pipe a command into `tail`. Write output to a log, print the exit code, then tail the log; keep the full log for the orchestrator: `cmd > /tmp/am.log 2>&1; echo "exit=$?"; tail -30 /tmp/am.log`.
- You may read the files in your map and their imports, callers, types and tests; no open-ended exploration.
- Never read secrets, env or credential files; never make paid or subscription calls; never run commands marked user-only.
- Anything else you need is a reported blocked question, not a decision.
</workspace>
<findings>
F1 ({{SEVERITY}}) "{{FINDING_TEXT}}" ({{FILE}}:{{LINE}})
   Ruling: {{EXACT_FIX}}. Test: {{TEST_TO_ADD}}.
F2 …
{{STRUCTURAL_RULING_IF_3RD_ROUND}}
</findings>
<still-applies>
Previous rulings that still apply: {{PRIOR_RULINGS}}
Invariants that must keep holding (each still tested): {{INVARIANTS}}
Conventions that apply: {{CONVENTIONS}}
</still-applies>
<map>Only these files: …</map>
<gates>Exact commands, per-package only (tests, typecheck, lint of the packages you change), once at the end: {{GATE_COMMANDS}}</gates>
<report>At most {{N}} lines: one per finding, gate counts and exit codes. Blocked questions: list each. Do not commit.</report>
