# Factory

A file-native, Kanban-based software factory built as an independent consumer
of Jig and FLOW.

Write a task in Markdown. Authorize it by moving it to `ready`. A working agent
chooses which reviewed techniques to apply, observes their results, and changes
approach within a bounded episode. The controller retains evidence and presents
the result for human review. It never merges or releases code.

**Initial implementation:** one local operator, one foreground controller,
one active task, selected UTF-8 source files, and a reviewed Bun/TypeScript
evaluation recipe. Unit tests are not installed-host or live-Agent qualification.
This is not yet a completed replacement for Jig's old factory example.

## Install

Use Bun 1.3.3+ and a host supported by Jig. All SDK/host dependencies are pinned
public packages; no sibling checkout or private Jig API is used.

```sh
bun install --frozen-lockfile --backend copyfile --ignore-scripts
bun run typecheck
bun run test
```

`copyfile` avoids external hardlink aliases in Bun's shared installation cache:
Jig's contract importer rejects those aliases. Default hardlinked installation
was not qualified. Imported contract bundles are included, not regenerated on
startup.

Select the Agent client/model in `bindings/agent.ts` and authenticate it outside
this repository. The supplied client selection is Codex, not a platform default.
Inspect `bindings/factory.ts` and `recipes/typescript/` before granting authority.
The recipe compiles `src/**/*.ts` and runs `test/project.test.ts`; customize and
review it for your project. Recipe directories contain configuration and locks,
not installed `node_modules`.

```sh
bunx --no-install jig review --yes --allow-authority-changes
bun run factory init ./workspace
```

Jig requires its supported native containment. If Bubblewrap is installed outside
its normal tool locations, configure `JIG_BWRAP_PATH` with the operator-selected
absolute executable. Never disable containment to make review succeed.

## Select project input once

Edit `workspace/factory.json`. `project` is this reviewed Jig application.
`source` is the repository being worked on. Paths are relative to the workspace;
absolute paths are also supported for these two directories.

```json
{
  "project": "..",
  "source": "../../my-project",
  "selection": ["src/main.ts", "test/project.test.ts"],
  "target": "binding:factory",
  "durationMs": 300000
}
```

Select exact files deliberately; source capture does not detect secrets.
The initial agent context limit is 512 KiB of UTF-8 candidate text. Native
evaluation has its own tighter phase/time limits. New files can be proposed in
the disposable candidate, but the host repository is never writable.

## Submit and run

Create `workspace/board/inbox/fix-export.md`:

```markdown
# Fix empty CSV exports

An account with no transactions produces an invalid CSV.
Keep the normal header and return no transaction rows.
Preserve behavior for accounts with transactions.
```

Then:

```sh
bun run factory status ./workspace
mv workspace/board/inbox/fix-export.md workspace/board/ready/
bun run factory run ./workspace
bun run factory status ./workspace
```

`status` assigns identities to new inbox/ready cards and reports discrepancies.
The controller claims one ready card in filename order. It is deliberately a
one-episode command, not a background watcher or automatic retry service.

Techniques are **not** a mandatory pipeline. The working agent can investigate,
revise, evaluate, ask, or finish; it cannot invent targets or enlarge its grants.
Add a technique's declared slot, reviewed configuration, and description to
extend the available set. Input/output adapters currently use the local
candidate/observation convention; this is not a new FLOW-wide protocol.

## Review, accept, or recover

Review packets and execution observations live beneath
`workspace/.factory/attempts/<application-attempt-id>/`. Keep this directory
private and out of Git: transaction files contain complete prepared requests
and captured task text. Do not paste those files into diagnostics.

`review` means a packet is available for human inspection, **not** that tests
passed or correctness was independently established. Candidate-authored tests
are not an independent acceptance oracle. Inspect the candidate and evidence
and apply your project's independent checks before accepting.

```sh
bun run factory accept ./workspace CARD_ID "Reviewed candidate and evidence; accepted this outcome"
bun run factory requeue ./workspace CARD_ID "Authorize a new bounded attempt after review"
bun run factory cancel ./workspace CARD_ID
bun run factory recover ./workspace
```

Acceptance only records a human decision and moves the unchanged card to
`done`. Apply patches, verify integration, merge, and release separately.

Ctrl-C closes the foreground owner and requests revocation. `cancel` can run
from another terminal without taking over the controller. `recover` only
observes retained work, exports evidence and reconciles completed transitions.
It **never submits**, resumes execution, or automatically issues a new ticket.
Unknown or cleanup-unresolved work blocks new execution. Explicit `requeue`
authorizes a new attempt only after the prior attempt is accounted for.

See [architecture and boundaries](docs/architecture.md) and
[qualification](docs/qualification.md).
