# Verification without conflating evidence

## Application checks

```sh
bun run typecheck
bun run test
```

Tests use a clearly labelled fake execution client and scripted Flow contexts.
Pure analysis tests exercise captured board/attempt facts without I/O. Package
boundary tests prevent reliance on ambient application SDK installations. Controller
tests verify read-only status (including active ownership and missing state),
explicit identity reconciliation, durability ordering, card revisions, human
acceptance, duplicate claims and recovery without submission. Scripted Flow
tests cover adaptive paths, out-of-set rejection, finite budgets and candidate
path validation.
They do not establish native containment or real model quality.

The test timeout accommodates filesystem sync costs on slow worktrees; it does
not disable durable writes.

## Installed public-host checks

Start with the minimal public baseline if review or startup fails:

```sh
bun run qualify:probe
```

This checks the pinned installed version, calls its ordinary `jig init`, reviews
the unmodified generated source, and runs the code-only greeting. It explicitly
permits dependency resolution for that public template. It neither reads
application task data nor selects an Agent. Reports and command output are
private under `.tmp/host-probe-<id>/`.

A passing baseline establishes only that this simple installed path works.
It does not establish execution-client ownership, artifact composition, project
evaluation or factory behavior. If the baseline passes and the full suite fails,
report both observations and the failed stage. Do not remove capabilities from
the fixture or weaken enforcement to make its result green.
Keep every repeated probe's evidence: mixed passing/failing runs are an
intermittent failure, not a qualified baseline.

For an upstream handoff, include the source commit, exact package pins, baseline
and full-suite reports, selected host-tool configuration and the full suite's
failed stage. Reports distinguish the application-default executable from an
explicit `JIG_EXECUTABLE` selection. Review its privately retained command output
before sharing; never share prepared transaction files or tickets. A generic
review error does not identify a faulty capability or establish a root cause.

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

Reports identify the failed stage and preserve known public codes, including
`PROJECT_EVALUATOR_LAUNCH`. That refusal says no Flow started; it does not prove
the underlying host cause. Reports and raw failure details are retained privately under
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
