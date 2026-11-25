# Verification: prove it on the real artifact

Gates say the code is consistent with its tests. Verification says the thing does what the user
asked. When the maestro writes the code it verifies before review; when executors write it, the
maestro verifies the commit under review while the reviewer reads the diff. Whoever approves the
final commit looks at the evidence first and the diff second.

## Pick the level by risk

| Level | Proves | Use for |
|---|---|---|
| Static | Types, lint and dependency rules hold | Everything |
| Tests | The stated assertions hold | Everything with behaviour |
| Runtime | The built artifact behaves, driven the way a user drives it | Anything that can run: UI, CLI, API, job |
| Property | An invariant holds across generated inputs | Parsers, serialisers, limits, money arithmetic, idempotency |
| Formal | A protocol has no bad interleaving | Concurrency and multi-party flows where a class of bug keeps returning |

Each level is added because the one below missed something, not for coverage. For a library or a CLI
do not invent browser checks; for a UI do not stop at unit tests.

## Runtime verification

Run what was built, with the tools a developer would use, and keep what you saw.

| Artifact | Drive it by | Evidence to keep |
|---|---|---|
| CLI | The real command with real arguments, including a refusal case | The command, exit code and output in a log file |
| HTTP API or server | Start it, call the endpoints, read its log | Request, status, response body, the relevant log lines |
| Web or desktop UI | The harness's browser tool or a browser automation script, through the page as a user would | Screenshots at each state; a short recording for motion or timing |
| Job or pipeline | Run it on a small real input, then run it again | Output, and proof the second run changed nothing |
| Library | A short example program that uses the public interface | The program and its output |

Rules:
- Drive the success path, one refusal path and one boundary (exactly at the limit, one over).
- Evidence goes in `.agent-runs/<feature>/evidence/` (git-ignored) and is named in the report. A
  claim with no artifact is reported as `(inferred)`.
- A failure found here is a finding like any other: category, fix, and a test that would have caught
  it, so the next run does not depend on someone looking.

## Feature map

A feature map is the application's site map from the user's side: the names people use for things,
and how to reach and check each one. It removes guessing ("the panel on the left") for agents and
reviewers alike, and it is what a brief or a runtime check points at.

Keep it in `docs/FEATURES.md`, one entry per user-visible feature:

```
## Export to CSV
- Where: Reports page, toolbar, "Export" button
- Reach: sign in as a member, open /reports, pick any range with data
- Check: a file downloads; row count equals the table's; an empty range shows "Nothing to export"
- Code: packages/export/ (docs/CODEMAP.md "Export")
```

When the project has a feature map, a feature is not done until its entry is added or updated.
Starting a map in a project that has none is `harden` work, proposed to the user, not slipped into a
feature. Entries describe behaviour, not implementation; when the two disagree, that is a finding.

## Driver

The second time the same runtime check is done by hand, turn it into a command the project owns
(`scripts/drive <feature> <step>`, a test helper, a small CLI). It starts the app in a known state,
performs the Reach steps, and returns the facts the Check needs as plain output with an exit code.

- One driver, reused by every agent: no session re-derives how to sign in or seed data.
- It is code, so it is reviewed and tested like code, and it is what the gates call.
- A driver that needs a secret gets it from the environment the user prepared; it never reads
  credential files itself.

## State charts

For a flow with states (a wizard, a sync, a notification that is read on one device and cleared on
another), write the states and transitions as the user experiences them, as a Mermaid
`stateDiagram-v2` in the pull request or the report. Reviewing the chart against the intent is
faster than reviewing the code, and it shows whether the goal was understood before the code is read.
A transition in the chart with no test is a gap.

## Property-based tests

Use them where a handful of examples cannot cover the input space. Derive the expected result from
the generated input with the production primitives, not from a second hand-written implementation.

- Round trips: `parse(serialise(x))` equals `x`.
- Refusals: any input outside the limits is refused, never clamped.
- Idempotency: applying twice equals applying once, checked by counting stored results.
- Ordering: the result is the same for every order of independent events.

Libraries: fast-check (JS/TS), Hypothesis (Python), proptest (Rust), rapid or `testing/quick` (Go);
for Solidity, Foundry's fuzz and invariant tests, and Echidna or Medusa when installed.
Keep the seed of any failure as a fixed regression case.

## Formal checks (optional)

Worth the effort when the same concurrency or ordering category has returned after tests were added:
multi-device state, locks and leases, replay and exactly-once delivery. Model the protocol (TLA+ is
the usual choice), check it, and keep the model next to the decision record it explains. Treat it as
one more layer: a checked model proves the design, not that the code follows it, so the invariants it
names still need tests. If nobody on the project will maintain the model, a property test over
interleavings is the better investment.

## After a release

Only once the layers above are in place: drive the released build through the feature map like a
user, report what breaks, and open one fix per finding through the normal pipeline. Automating a loop
that still produces weak changes only produces more of them, faster.
