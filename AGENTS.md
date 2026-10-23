# Factory

## Purpose

Build a file-native, Kanban-based software factory. Agents choose and adapt
development techniques; deterministic boundaries keep work under operator control.

## Ownership

- `src/` owns the application controller, filesystem reconciliation and CLI.
  Pure analysis consumes captured facts; observation never creates state.
- `flows/` owns independently executable, bounded FLOW methods. Each importing
  code Flow declares its SDK/runtime dependencies and lock in its own package;
  application-root dependencies do not supply a Flow's execution closure.
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
- `status` is read-only, including identity and private-state initialization.
  `reconcile` assigns intake identities under the mutation lock; `run` includes
  that step without requiring a separate per-task command. Reconciliation
  diagnoses the board after releasing its temporary lock. Requeue never
  suppresses task or decision revision mismatches in board diagnosis.
- Hard rules have deterministic enforcement owners. Soft guidance leaves
  technique selection to the working agent; do not hardcode task-type pipelines.
- Persist the complete Jig `Prepared` value together with the captured task
  before submission. Tickets and task input stay out of diagnostics and argv.
- Owner-connection loss revokes foreground work. Observation and result export
  do not resume it. Never automatically replay uncertain work.
- Generated capabilities remain proposals until separate review and admission.
- Factory execution requires explicit human acceptance and performs no automatic
  Git mutation, merge or release.
- Keep source, tests and living guidance synchronized. Record transient
  experiments under ignored `.tmp/`, not as product contracts.

## Work guidance

- Prefer the smallest complete consumer workflow over speculative frameworks.
- Keep board state, execution facts and acceptance decisions distinct.
- Report mock/unit evidence separately from installed-host and live-Agent checks.
- Do not remove Jig's old example until the replacement is complete.
- Development closeout: slice completed work into coherent commits and push the
  topic branch to the source remote after relevant verification. Do this by
  default, using native SSH without transport overrides or another permission
  question. Non-`main` topic branches may be force-pushed after rebasing, using
  `--force-with-lease` bound to the freshly verified remote head. Never force-push
  `main`. This does not authorize landing on shared branches or releasing; it
  does not grant Git authority to the running factory.

## Verification

The package scripts own repeatable tests and type checking. Host qualification
is separate and must use installed public packages on a supported host.
CI runs `format:check`, `check` and `test`; it does not qualify the installed host.

- `bun run typecheck` checks controller, Flow and qualification source.
- `bun run test` checks application behavior with labelled test doubles.
- `bun run qualify` checks the installed host; it is not a live-Agent test.
- `bun run qualify:probe` checks the unmodified installed greeting template;
  passing that baseline does not qualify artifacts, evaluation or Agent work.

----------------------------

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

This root owns `src/`, `flows/`, `bindings/`, `recipes/`, `test/`, `docs/`,
`.github/` and root development tooling. Their responsibilities are listed above.
The qualification subtree has additional public-host evidence requirements.

- [qualification/AGENTS.md](qualification/AGENTS.md) — Installed public-client
  host qualification, distinct from unit mocks and live-Agent evidence.
