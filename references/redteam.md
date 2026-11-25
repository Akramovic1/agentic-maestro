# Red team: a security check of a plan or a commit

A read-only mode. Independent reviewers try to show that a design or a commit breaks its own security
rules; the maestro arbitrates; fixes are built in another mode. It reviews the user's own code and
systems, and it changes no product code.

Run it twice on work that matters: once on the **plan** before anything is built (wrong rulings are
cheapest to fix here), and once on the **integrated commit** before merge. The `critical` mode does
both as part of its build. A whole component — a contract system, a service — is the `audit` mode
(`audit.md`), which uses this file's finding format and arbitration.

## 1. Scope

Write down, before any reviewer starts:
- **What**: the plan revision (file and hash) or the commit SHA and its base. Reviewers get that
  exact thing; a moved branch means a new scope.
- **Trust boundaries**: where data or authority crosses from less trusted to more trusted — user
  input, model output, uploaded files, webhooks, another tenant's data, a tool's stderr, the network.
- **What must hold**: the security rulings and invariants in plain statements ("a member cannot read
  another workspace's exports", "a replayed webhook records nothing twice").
- **Areas** to cover, from the table below. An area left out is listed as out of scope in the report.

| Area | The question |
|---|---|
| Authority | Can a caller act as, or read the data of, someone else? Is every check on the server side and on every path? |
| Input | Is every untrusted input parsed strictly and refused when malformed, incomplete or over a limit — never clamped, defaulted or guessed? |
| Fail-closed | When a check errors, times out or gets an unexpected value, does the operation refuse? |
| Identity and keys | Can two different things produce the same key, id or cache entry? Can a caller choose a destination, path or key? |
| Replay and ordering | Is a repeated, reordered or concurrent request safe? Is idempotency counted on stored results? |
| Secrets and data flow | Do secrets or another user's data reach logs, errors, model or tool requests, generated files or the client? |
| Storage | Is stored data verified on read? Are migrations reversible and safe on existing rows? |
| Dependencies and build | Is a new dependency, install script, CI step or generated file introduced, and is it pinned and needed? |
| Agent surface | Can text from a file, page or tool result steer an agent or a tool call? |
| Contract logic (smart contracts) | Reentrancy and the order of external calls; arithmetic, rounding direction and units; share and balance accounting; oracle and price inputs; upgrade and storage layout; signature replay |

## 2. Prompt and dispatch

Each reviewer gets the same prompt: the scope, the grounding of every review (original requirements,
the rulings, the dependency contracts, read access to the repository), the areas, and the output
format below. Word it as verification of correctness and input validation ("show an input for which
ruling R3 does not hold"), which is both accurate and what content filters expect.

Dispatch every model the mode in use lists for `redteam`, read-only and in parallel, from the project
directory. `<mode>` is that mode (`redteam`, `critical` or `audit`); `<id>` is a short name you give
this run (`vault-fee-1`):

```bash
node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args <mode> redteam --index 1) --brief .agent-briefs/<id>-redteam.md --dir . --out .agent-runs/<id>-redteam-1
node <skill>/scripts/spawn.mjs $(node <skill>/scripts/mode.mjs args <mode> redteam --index 2) --brief .agent-briefs/<id>-redteam.md --dir . --out .agent-runs/<id>-redteam-2
```

Run each as a tracked background job, judge it by its exit code and `result.json`, and record the
`sessionId` from `result.json`: the re-check resumes that id (`--resume <id>`). If the project does
not git-ignore `.agent-briefs/` and `.agent-runs/`, keep both outside the repository or ask before
touching its `.gitignore`.

Reviewers from different model families miss different things; one family twice is one opinion.

## 3. Findings

```
P1 | P2 | P3   <file:line or plan section>   <area>
Claim: <what does not hold>
Input: <the concrete request, file or sequence that shows it>
Expected: <what the rulings say should happen>   Actual: <what happens>
Reproduction: <the test, as code, in the finding> | none — <why it is still a claim>
```

- Reviewers are read-only, so a reproduction arrives as test code inside the finding. The maestro
  creates a **scratch worktree** at the reviewed SHA (`git worktree add <dir> <sha>`), puts the test
  there, never in the candidate, and runs it. It must fail there; one that passes sends the finding
  back to its reviewer or rejects it.
- A plan has no code to run. Its reproduction is the concrete sequence of calls or inputs that the
  rulings allow and should not; the fix is a changed ruling, and the re-check reads the new revision.
- A finding with no concrete input is a question, not a finding; it is reported as P3 with what
  would settle it.
- End with: areas covered, areas not covered and why, then PASS / PASS-WITH-FOLLOWUP / NEEDS FIXES.

## 4. Arbitrate, fix, re-check

1. Arbitrate the union of all reviewers' findings; the same finding from two reviewers counts once.
   AGREE with an exact ruling, or DISAGREE / DEFER with a reason. Never forward a raw finding.
2. Hand agreed findings to a build mode as fix briefs (`templates/fix-brief.md`), one reproduction per
   finding, kept in the suite as a regression test. Security fixes use a fresh session and the
   strongest coder that mode has (`executorStrong` where it exists; the maestro itself in `direct`).
   Inside `critical` the fixes stay in `critical`; otherwise the build mode is the user's choice when
   it has not been said.
3. Re-check each fix in the session of the reviewer that raised it, on the new SHA, with the fix diff
   plus the invariants it touches.
4. Every agreed category is promoted on its **first** occurrence (`hardening.md`): security findings
   do not wait for a second feature. This mode names the check each category needs; the check is
   written in the build mode that fixes the finding.

## 5. If something is already exposed

A live credential in the repository or a log, data that reached the wrong tenant, or an unexpected
outbound call is not a finding to queue. Stop dispatching, do not copy the value anywhere (name the
file and line only), tell the user at once, and leave rotation and disclosure to them.

## Report

```
SCOPE: <plan revision or SHA>, base <SHA>
AREAS: covered <list> | not covered <list — reason>
FINDINGS: P1=<n> P2=<n> P3=<n>; agreed <n>, rejected <n>, deferred <n>
FIXES: <finding -> fix brief / commit, re-check verdict>
HARDENED: <category -> check needed, or check added by the build mode>
VERDICT: PASS | PASS-WITH-FOLLOWUP | NEEDS FIXES — <the findings that block a merge>
OPEN: none | <what is unresolved, with owner>
```

"Not covered" is never reported as clean, and no review certifies the absence of vulnerabilities; it
reports what was looked for and what was found.
