# Factory

## Purpose

Build a file-native, Kanban-based software factory. Agents choose and adapt
development techniques; deterministic boundaries keep work under operator control.

## Ownership

- `src/` owns the application controller, filesystem reconciliation and CLI.
- `flows/` owns independently executable, bounded FLOW methods.
- `bindings/` and `jig.ts` own operator-reviewed execution configuration.
- `recipes/` owns captured evaluation configuration and locked development dependencies.
- `test/` owns application tests. `qualification/` owns public-client host checks.
- `docs/` owns current architecture, boundaries and operating instructions.
- A workspace's `board/` is its visible work interface. Its private `.factory/`
  directory retains attempt transactions and evidence, never a second lane index.

## Local contracts

- This is an independent consumer of public Jig/FLOW packages. Never import
  sibling checkouts, Jig internals, or the old software-factory example.
- Pin public dependencies and commit the generated lockfile. Do not assume a
  merge is a published release or an installed-host qualification.
- Users may submit plain Markdown. Directory lanes express work disposition;
  file contents cannot authorize additional powers or fabricate acceptance.
- Hard rules have deterministic enforcement owners. Soft guidance leaves
  technique selection to the working agent; do not hardcode task-type pipelines.
- Persist the complete Jig `Prepared` value together with the captured task
  before submission. Tickets and task input stay out of diagnostics and argv.
- Owner-connection loss revokes foreground work. Observation and result export
  do not resume it. Never automatically replay uncertain work.
- Generated capabilities remain proposals until separate review and admission.
- Human acceptance is explicit. No automatic Git mutation, merge or release.
- Keep source, tests and living guidance synchronized. Record transient
  experiments under ignored `.tmp/`, not as product contracts.

## Work guidance

- Prefer the smallest complete consumer workflow over speculative frameworks.
- Keep board state, execution facts and acceptance decisions distinct.
- Report mock/unit evidence separately from installed-host and live-Agent checks.
- Do not remove Jig's old example until the replacement is complete.

## Verification

The package scripts own repeatable tests and type checking. Host qualification
is separate and must use installed public packages on a supported host.

- `bun run typecheck` checks controller, Flow and qualification source.
- `bun run test` checks application behavior with labelled test doubles.
- `bun run qualify` checks the installed host; it is not a live-Agent test.

## Child DOX index

- [qualification/AGENTS.md](qualification/AGENTS.md) — Installed public-client
  host qualification, distinct from unit mocks and live-Agent evidence.
