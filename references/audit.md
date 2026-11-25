# Audit: a full security review of a contract system or a critical API

`redteam` checks one plan or one commit. An audit takes a whole component — a contract system, a
service that moves money or grants authority — and works through it in phases, each leaving a file a
person can read. It is read-only on the code under review; tests and proofs are written in a scratch
worktree. The finding format, the dispatch command and the arbitration are those of `redteam.md`;
this file adds the phases around them. The mode's first task is "Before starting" below; phases 1–10
are its tasks 2–11. Skills are named here by their short name; the modes file has the full one.

## Before starting

- **The user's own code only.** Ask once when the request does not make that plain. Contracts: local
  and forked chains only (`anvil`); never send a transaction to a live network, never ask for or
  handle a private key or seed phrase. An API: a local or staging instance the user names; never
  probe production, never use real customer data or credentials. A key or live secret found in the
  repository is the incident rule of `redteam.md` §5, not a finding to queue.
- **Tools**: run `scripts/toolcheck.sh contracts`, `api` or `all` (a system with both) from the
  project directory. Each of its lines becomes a tool row of the report's COVERAGE section: present
  and run is "covered", missing is "not covered". Install nothing unasked — tell the user which are
  missing and what each would add.
- **Skills**: the mode's `skills` lists specialist skills per target. Load the ones that are installed
  where a phase names them, and say in one line which are not installed. A skill deepens a phase; with
  or without it, the phase is done and its file written in this format by the maestro. Do not swap in
  other skills the mode does not list.
- Everything goes in `.agent-runs/<id>-audit/`, where `<id>` is a short name you give this audit
  (`staking-audit-1`). If the project does not git-ignore `.agent-runs/` and `.agent-briefs/`, keep
  them outside the repository or ask before touching its `.gitignore`.

## Phases

### 1. Scope — `scope.md`
The commit SHA; every file in scope with its line count; what is out of scope and why (dependencies
are out, deploy scripts and configuration are in: they set owners, arguments and initial state); the
specification and documents that say what the code should do; the privileged roles and keys and
exactly what each can do; the trust assumptions (an honest admin? a correct oracle? a trusted
sequencer or upstream API?); earlier audits and known issues. A branch that moves is a new scope.

### 2. Context — `context.md`
Understand before hunting. Actors and what each wants; assets and where they sit; every entry point
in one table:

| Entry point | Who can call | Moves or changes | Checks made | External calls |
|---|---|---|---|---|

For contracts that is every external or public function that changes state; for an API every route
and message handler. Then the integrations (tokens, oracles, bridges, other services), the flows as a
state chart (`verification.md`), and the **invariants** I1..In in plain statements ("total shares
times price never exceeds assets held", "a member never reads another workspace's rows"). Later
phases refer to entry points and invariants by these names.
Skills that help: `x-ray`, `entry-point-analyzer`, `audit-context-building`.

### 3. Deterministic pass — `tools/`
Everything a machine can find is found by a machine first, so reviewers spend their attention on what
it cannot. Keep each analyzer's raw output in `tools/`; triage it into candidates. An analyzer's raw
findings never go into the report; only triaged candidates that phase 7 settles do.

| Target | Run |
|---|---|
| Contracts | `forge build` (warnings count), `forge test`, `forge coverage`; Slither; Aderyn; Semgrep with Solidity rules |
| API or service | The project's own lint, types and tests; Semgrep or CodeQL; a dependency audit (the package manager's own, or osv-scanner); a secret scan (gitleaks); an infrastructure scan when the repository holds deployment config |

Low test coverage on an entry point from phase 2 is itself a candidate.
Skills that help: `secure-workflow-guide`, `semgrep`, `codeql`, `supply-chain-risk-auditor`.

### 4. Panel review — `review-<n>.md` (one per reviewer)
Each `redteam` model reviews read-only with `scope.md`, `context.md` and its list of areas. Every area
is read by two reviewers from different model families; one family twice is one opinion. With a panel
of two, both get every area. With three or more, spread the areas so each still has two readers.

| Contracts | API or service |
|---|---|
| Access control and privileged roles; initialisers | Object-level authorisation: can a caller reach another owner's object by id? |
| Reentrancy and the order of external calls | Authentication and session handling |
| Arithmetic, rounding direction, decimals and units | Property-level authorisation and mass assignment |
| Oracles, price manipulation, flash loans | Function-level authorisation: admin routes, internal routes |
| Ordering: front-running, slippage, deadlines | Resource limits: size, rate, cost, pagination |
| Token integration: fee-on-transfer, rebasing, missing return values, callbacks | Sensitive business flows that can be automated or replayed |
| Upgradeability, storage layout, delegatecall | Server-side requests to caller-chosen destinations |
| Signatures and replay: domain, nonce, chain id, expiry | Input parsing and refusal on malformed input |
| Denial of service: unbounded loops, griefing, stuck funds | Secrets and data in logs, errors and responses |
| Accounting invariants: share price, first deposit, donation | Configuration, exposed versions and undocumented endpoints |
| Cross-contract and cross-chain assumptions | What is trusted from third-party APIs and webhooks |
| Deploy scripts and configuration | Dependencies and the build pipeline |

Skills that help: `solidity-auditor`, `token-integration-analyzer`, `differential-review` (for a
change rather than a whole component), `insecure-defaults`, `sharp-edges`.

### 5. Properties — tests in the scratch worktree
Each invariant from phase 2 becomes a test that tries to break it: Foundry invariant and fuzz tests
(Echidna or Medusa when installed) for contracts; property tests and negative tests with real objects
of the wrong owner or state for an API (`verification.md`). The mode's `executor` writes them from the
invariant list; they never touch the candidate. Its brief is short: the invariant list, the scratch
worktree as the only directory it may write, the test framework, and "report each invariant as
holds / broken with the seed / could not be expressed". Spawn it with `mode.mjs args audit executor`
(`harnesses.md` has the spawn rules). An invariant with no test is listed as **untested**, not as
holding. Keep the seed of every failure.
Skills that help: `fizz`, `property-based-testing`.

### 6. Specification against code — `spec.md`
One row per claim the documents make: the claim, where the code implements it, the test that shows
it, and holds / does not hold / unspecified. Behaviour that moves value or grants authority and
appears in no document is a finding. Skill that helps: `spec-to-code-compliance`.

### 7. Prove every candidate — `findings.md`
Candidates come from tools, reviewers, failed properties and spec gaps. Each one is settled:

- **Confirmed**: a test or scripted sequence in the scratch worktree, at the audited SHA, that fails
  or shows the loss. On a fork when it needs live state.
- **Rejected**: the reason, kept, so the same claim is not raised again next round.
- **Unconfirmed**: could not be reproduced and could not be ruled out; says what would settle it.

Arbitrate as in `redteam.md` §4. Reviewers report P1 / P2 / P3; the maestro sets the report's
severity from the table below while arbitrating (P1 is Critical or High, P2 is Medium, P3 is Low or
Info). Skill that helps: `fp-check`.

### 8. Report — `report.md`

| Severity | Meaning |
|---|---|
| Critical | Loss of funds or takeover of authority, by anyone, with no special conditions |
| High | The same, needing a plausible condition; or permanent denial of a core function |
| Medium | Limited loss, temporary denial, or a broken invariant with no direct loss shown |
| Low | A deviation from the specification or good practice with no shown impact |
| Info | An observation that changes no behaviour |

```
SUMMARY: <component, SHA, dates, one paragraph of what was found>
SCOPE: <from scope.md, with trust assumptions>
COVERAGE: phase / area / tool -> covered | not covered — <reason>
FINDINGS: <id> <severity> <title> — <location> — <status>
          description, reproduction (test path), recommendation
INVARIANTS: <I-n> -> tested and holds | broken (finding id) | untested
SPEC: <claim> -> holds | does not hold (finding id) | unspecified
RESIDUAL RISK: <what this audit did not look at, and what an independent audit should look at first>
```

### 9. Fix and re-check
Fixes are built in `critical` unless the user picks another build mode: one fix brief per finding,
the reproduction kept as a regression test. Each fix is re-checked on the new SHA in the session of
the reviewer that raised it, with the fix diff plus the invariants it touches. Then search for siblings: the same mistake elsewhere is the same
finding (skill that helps: `variant-analysis`). Update each status: fixed / acknowledged / disputed.

### 10. Harden
Every confirmed class gets a check on its first occurrence (`hardening.md`): a custom Slither or
Semgrep detector, a lint rule, or the invariant test added to the gates. The audit names the check
for each class in the report; it is written in the build mode that fixes the finding, since this mode
changes nothing in the repository under review.

## What an audit here is not

It reports what was looked for and what was found. It certifies nothing, and for contracts that will
hold real value it reduces what an independent audit will find; it does not replace one. Say so in the
report's last section, with the areas a human auditor should start from.
