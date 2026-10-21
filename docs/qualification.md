# Verification without conflating evidence

## Application checks

```sh
bun run typecheck
bun run test
```

Tests use a clearly labelled fake execution client and scripted Flow contexts.
Pure analysis tests exercise captured board/attempt facts without I/O. Controller
tests verify read-only status (including active ownership and missing state),
explicit identity reconciliation, durability ordering, card revisions, human
acceptance, duplicate claims and recovery without submission. Scripted Flow
tests cover adaptive paths, out-of-set rejection, finite budgets and candidate
path validation.
They do not establish native containment or real model quality.

The test timeout accommodates filesystem sync costs on slow worktrees; it does
not disable durable writes.

## Installed public-host checks

Install the qualification project's pinned packages with copied files. The
evaluation recipe's lock is included: do not install `node_modules`
inside the captured recipe directory.

```sh
bun install --cwd qualification/project --frozen-lockfile --backend copyfile --ignore-scripts
bun run qualify
```

The suite explicitly reviews its synthetic, credential-free project with local
evaluation authority. It exercises only installed public entrypoints:

- approved inspection and preparation without dispatch;
- persistence before submission;
- exact duplicate observation and changed-request conflict;
- observer closure versus owner settlement;
- retained export and destination collision without another execution;
- owner loss followed by checkpoint retrieval/export, not resumption;
- candidate → evaluation → revised candidate → evaluation in one Run;
- actual nonzero/zero test-exit evidence;
- controller-driven Markdown → review → explicit human acceptance.

Reports and raw failure details are retained privately under
`.tmp/qualification-<id>/`. Safe stdout summaries list completed checks, not
tickets, source requests or private exceptions. A failure before a check
finishes is not a passing qualification.

Use the documented Jig host prerequisites. Select an out-of-standard-location
Bubblewrap with `JIG_BWRAP_PATH`; do not replace containment or use private Jig
state to make a test pass. If even `jig init` followed by ordinary review fails,
report that public reproduction to the host maintainer before attributing it
to the application.

## Live-Agent qualification

Not performed by the deterministic suite. Separately review the real application,
authenticate the operator-selected Agent, and use an authorized consumer
repository with exact file selection. Exercise contrasting tasks and at least
one technique change after contrary evidence. Record candidate correctness,
reviewer effort, latency/cost and failures. Do not equate an agent-selected
`finish` or green candidate-controlled tests with independent correctness.

Retain the old Jig example until this application satisfies its agreed
replacement criteria. Passing mock tests alone is not such a criterion.
