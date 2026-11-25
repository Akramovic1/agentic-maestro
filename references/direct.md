# Direct mode: the maestro plays it itself

The strong model writes the code. Nothing is saved by skipping a step here: the cost of direct mode
is tokens, and the tokens buy verification, so spend them there. The floor in `SKILL.md` §1 applies
unchanged — direct mode removes the brief, not the rulings, the review or the evidence.

## The loop

1. **Goal.** Two lines: what the user wants, and the smallest change that meets it. If the request
   reads two ways and the readings lead to different code, rule on it (see Autonomy) and state the
   ruling.
2. **Baseline.** Record the base SHA and run the gates once. A test that was already red is recorded
   as red, not fixed silently and not blamed on the change.
3. **Reproduce or specify.** Nothing is written until there is a check that fails now and will pass
   when the work is right. The playbooks below say what this step, and each later one, means for that
   kind of work; a playbook is not a second loop.
4. **Shape.** Name the data shapes, states and boundaries before any logic. Remove what the change
   makes dead before adding to it.
5. **Build in verifiable units.** A unit is a small group of edits that ends in one check. Run the
   check; do not start the next unit on a red one. Targeted tests per unit, full gates once at the end.
6. **Prove.** Gates by exit code, then run the real artifact (`verification.md`). "It compiles" and
   "the tests I wrote pass" are not proof that the user's goal is met.
7. **Self-review.** Read the whole diff as its reviewer: anything outside the goal, any guard that
   hides a cause, any comment that justifies a shortcut, any test that asserts the implementation
   instead of the behaviour. Fix before asking anyone else to look, then commit on the working branch
   (a review needs a commit that does not move; if the project's rules do not let you commit, ask
   once for the session).
8. **Independent review**, scaled by risk (below). Arbitrate each finding: AGREE with an exact fix,
   or DISAGREE / DEFER with a reason.
9. **Harden.** Each agreed finding and each correction gets a category and, where it can recur, a
   deterministic check (`hardening.md`).
10. **Report** with the block at the end of this file.

## Playbooks

Pick one; a task that fits none is an investigation first.

### Bug fix
1. Reproduce it as a failing test, or a scripted repro when no test can reach it. No repro after a
   bounded attempt: report what was tried and what would make it reproducible; do not fix by guess.
2. Trace the symptom back to the first place the state went wrong. Fix it there.
3. A guard is a fix only when the state it handles is legitimate. A guard around an impossible state
   hides the next bug.
4. The repro stays in the suite. Run the neighbours of the fix, not only the new test.
5. Search for siblings: the same mistake elsewhere is the same bug. One sibling found means a category
   for `hardening.md`.

### Feature
1. Write the "done means" assertions from the acceptance text before any code.
2. Find ONE clean existing feature and follow its structure. If the closest pattern carries
   workarounds, say so and do not copy them.
3. Shape first: types, states, the interface other code will call.
4. Build unit by unit with its tests. Refusal paths and limits are tested, not only the success path.
5. Drive it for real and keep the evidence; add the feature to the feature map (`verification.md`).

### Refactor
1. Pin the behaviour first. If the code to move has no tests that would notice a change, write
   characterisation tests and commit them before the refactor.
2. Remove before reshaping: dead code, one-caller wrappers, unused options.
3. Migrate every caller and delete the old interface in the same batch. No compatibility layer is left
   behind "for now"; if one must exist, it has an owner and a removal condition in the report.
4. The suite passes with the same test count before and after, and architecture tests (import
   boundaries, file-list scans) are run. A changed assertion needs a written reason.

### Performance
1. Measure before touching anything, with a command anyone can rerun. Keep the command as a script.
2. Explain the number: what limits it, and whether it measures the work you think it does (warm-up,
   caching, the wrong build mode and the wrong input size are the usual liars).
3. One change at a time, re-measured with the same command, several runs.
4. Report before and after with the spread, the command, and the machine. A speedup with no
   explanation of where the time went is not accepted.

### Investigation
Read-only. Answer with file:line evidence and label every claim **measured** (ran it, saw it),
**inferred** (read the code) or **guess**. No code changes unless the user asks for them next.

## Design rules

Each applies at a specific moment; cite the one that changed a decision in the report.

| When | Rule |
|---|---|
| Sizing the change | The smallest diff that meets the goal. A new abstraction needs a second caller that exists today. |
| Starting an addition | Subtract first: delete what is dead, then build on the simpler base. |
| Writing branching or stateful logic | Model the domain as a structure — a state machine, a typed model, a table — not as conditionals spread over files. |
| Designing a type or signature | Make the illegal state unrepresentable. Parse external data once at the boundary, trust the type inside. |
| Adding validation or error handling | Guards live at system boundaries; the logic inside stays pure. |
| Anything retried, resumed or run twice | It converges to the same end state when repeated. |
| A new requirement meets an old design | Redesign as if the requirement had been there from the first day, instead of attaching it to the side. |
| Two fixes have failed the same check | They share a premise. Write it down and test it directly before a third fix. |
| The same edit is needed in many places | Write the tool (codemod, script, generator) and run it. The tool is what the reviewer reruns. |
| The same instruction is being written a second time | Encode it as a check instead (`hardening.md`). |

## Review, scaled by risk

| Risk | Examples | Review |
|---|---|---|
| Trivial | Docs, copy, a local rename, a one-line fix with its test | Self-review; say so in the report |
| Ordinary | Behaviour inside one package or module | The mode's first reviewer, on the commit |
| High | High-risk work as `SKILL.md` defines it | Every reviewer the mode lists (a panel), or one reviewer plus a re-review of the fix; property tests and runtime evidence are required |

A change that fits two rows takes the higher one.

Reviewers run read-only on the committed SHA, as tracked background jobs, each session id recorded.
Write the review prompt to `.agent-briefs/<id>-review-r1.md` (keep `.agent-briefs/`, `.agent-runs/` and
`.agent-logs/` git-ignored). It carries the original requirements, your rulings, the dependency
contracts, the commit range, and permission to challenge a ruling; it asks for findings as P1/P2/P3
with file:line, then a verdict: PASS / PASS-WITH-FOLLOWUP / NEEDS FIXES. The model comes from the
mode, run from the project directory:

```bash
node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args direct reviewer --index 1) \
  --brief .agent-briefs/<id>-review-r1.md --dir . --out .agent-runs/<id>-review-r1
```

A panel is the same prompt sent to each reviewer in parallel (`--index 2`, ...). Arbitrate the union
of findings; the same finding from two reviewers counts once. A re-review resumes that reviewer's own
session id (`--resume <id>`).

When the fix round would be large, or your own context is already heavy, hand the fix to a fresh
session with `templates/fix-brief.md` rather than continuing in a long transcript.

## Spending strong-model tokens

In order of what pays:

1. **Verification.** Expect it to cost more than the implementation. That is the intended ratio.
2. **Parallel reading.** Several read-only scouts, each returning paths and facts, while you design.
3. **A reviewer panel** on high-risk changes.
4. **A bake-off.** A design fork with no precedent in the codebase, expensive to reverse: build 2–3
   small prototypes in separate worktrees, compare them on criteria written before building, keep one,
   delete the rest. A fork you can settle by running something is settled by running it, not by asking.
5. **Parallel lanes.** More than one lane is a delegate mode: `frontier` for strong coders, `economy`
   for cheap ones. Ask the user which.

Never on: rerunning the same prompt hoping for a different answer, or resuming a transcript that has
grown past the point where a fresh session with a short brief would be cheaper.

## Autonomy

The floor's authority rule (`SKILL.md` §1.6), applied to direct work:

- **Proceed and report the choice**: reversible decisions inside the goal — local structure, names,
  which clean pattern to follow, how to split units.
- **Ask first**: irreversible writes (migrations run against real data, deletes, force-pushes,
  deploys, messages to people), changes to a public interface or stored format, anything touching
  policy, money or identity that no ruling covers, and scope beyond the stated goal. A second
  unplanned addition to the scope stops the work for one consolidated confirmation.
- **Unattended runs**: keep a short progress file (done / in progress / next / open questions) so the
  work can be picked up from the file alone. An open question parks its unit, not the whole run.

## Report block

```
GOAL: <what the user wanted, one line>
CHANGE: <path — what changed and why>            (one line per file or group)
EVIDENCE: GATE <command>: exit=<n> passed=<n> failed=<n>      (one line per gate)
          RUNTIME <what was driven>: <result> — <artifact path>
REVIEW: <reviewer, session id, verdict, SHA> | self-review only — <why the change is trivial>
FINDINGS: <n> agreed, <n> rejected — <category of each agreed finding>
HARDENED: <category> -> <check added and where> | none — <reason>
OPEN: none | <what is not done, not verified, or waiting on the user>
```

Every factual line is something that was run. A claim that was read rather than run is marked
`(inferred)`; nothing is reported as verified on the strength of the code looking right.
