<task>
Fix round {{ROUND}} on this worktree ({{WORKTREE}}, branch {{BRANCH}}, last commit {{SHA}}). Do not commit.
Review findings (quoted) and the orchestrator's rulings:
F1 ({{SEVERITY}}) "{{FINDING_TEXT}}" ({{FILE}}:{{LINE}})
   Ruling: {{EXACT_FIX}}. Test: {{TEST_TO_ADD}}.
F2 …
{{STRUCTURAL_RULING_IF_3RD_ROUND}}
</task>
<map>Only these files: …</map>
<gates>Per-package only: tests, typecheck and lint of the packages you change, once at the end; filter output.</gates>
<report>At most {{N}} lines: one per finding, gate counts. Do not commit.</report>
