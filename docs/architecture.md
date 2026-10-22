# Adaptive methods, controlled consequences

The stable structure is files for intent, Kanban lanes for work disposition,
Flows for techniques, and Jig for admitted execution. Methodology is not a
controller state machine.

## Owners

| Owner | Responsibility |
| --- | --- |
| Operator | Source selection, providers, grants, reviewed recipes, method admission |
| Application controller | Board identity, claims, private transactions, recovery, human acceptance |
| Conductor Flow | Bounded agent-directed choices among reviewed techniques |
| Technique Flow | Its investigation or revision procedure |
| Jig | Exact execution, artifact rights, foreground ownership, fencing and cleanup |
| Human | Independent assessment, acceptance, integration, merge and release |

The application imports `@jigging/jig/client`; methods import `@jigging/flow`.
No code imports a sibling checkout, the old factory example or Jig internals.
Pure board diagnosis and intake planning live in `src/analysis.ts`; they consume
captured facts without filesystem, host or mutation capabilities. These remain
ordinary functions until independently reusable method packaging earns its cost.
Filesystem adapters observe and commit; the controller owns execution and authority.

## Board and execution facts are different

`board/{inbox,ready,doing,review,blocked,done}` is the only lane index.
Cards have a controller-assigned identity comment, but no status field.
Users may edit ordinary Markdown. An edit creates new intent; it cannot alter
the input already captured by an attempt.

Private attempt records retain historical facts, not a second current status:
captured task, full Prepared, claim, dispatch intent, host receipts,
observations, disposition decisions, acceptance and requeue authorizations.
Attempt sequence numbers order history independently of wall-clock timestamps.
A physical manual move does not prove execution, cancellation or acceptance.
`status` only observes: it never creates state, assigns IDs, acquires the mutation
lock or contacts Jig. It reports unidentified Markdown with `id: null` and remains
available while a work episode owns the controller lock. Diagnosis receives a
minimal projection of attempt facts, never prepared tickets or captured task text.
Observations are not an atomic snapshot across editor and controller writes;
incomplete or changing records may require another observation, never a replay.

`reconcile` explicitly assigns identities to nonempty inbox/ready cards under
the mutation lock. It validates the full intake plan before writes and rechecks
each captured card digest before assignment. Its returned diagnosis runs after
that temporary lock is released, so it does not report itself as an active owner.
Reconciliation is repeatable but not a multi-card transaction.
`run` includes the same intake step before claiming
work, so users do not need a new per-task ceremony. Neither analysis nor intake
grants execution or acceptance. Uncertain attempts must be recovered first.
The current implementation reports invalid manual moves rather than silently
repairing or interpreting every possible drag-and-drop command.

Requeue can clear the prior-attempt attention only when the captured task and
decision digests match the current card. A later edit remains visible as a
revision mismatch even while the card stays in ready.

## Durable boundary

1. Lock one workspace controller.
2. Reconcile intake, then read a stable ready card and approved operator configuration.
3. Inspect the exact target and prepare immutable input without dispatch.
4. Persist full Prepared and task snapshot in one exclusive durable record.
5. Record claim intent, move to doing, and record the committed claim.
6. Persist dispatch intent, then submit the unchanged canonical request.
7. Keep the foreground owner until settlement; closing it revokes work.
8. Read retained results and export independently of execution.
9. Record the application decision before its lane transition.

Records use fully written, synced temporary inodes and exclusive publication.
Lane rename and receipt publication are separate ordered writes, not a
multi-file atomic transaction. Interrupted writes/claims fail closed or can
be reconciled through the original prepared ticket. The local lock is
cooperative; this does not defend against a malicious administrator or another
malicious process under the same OS identity.

Jig lookup cannot pump execution or restore the lost owner's lifetime.
Recovery never re-submits. Unknown dispatch and unresolved cleanup remain
visible. Retained history/bytes have bounded lifetimes; application exports
are needed for longer evidence custody.

## Hard and soft boundaries

Hard boundaries are enforced by code or the host:

- reviewed exact targets and grants;
- bounded source/context/artifacts and maximum decisions;
- one active controller/task;
- stable task revision, receipt and decision binding;
- no host-repository or board write authority inside methods;
- no automatic replay, merge, release or capability promotion;
- explicit human acceptance of the unchanged revision.

Soft guidance includes investigation style, decomposition, technique choice,
whether more evidence is useful, and how to explain a result.
The controller never maps bug/feature/documentation labels to fixed pipelines.

## Evidence and evolution

Conductor choices cite their motivation and preserve actual returned evidence.
Held artifacts, not paths/digests in domain JSON, delegate candidate access.
Evaluation results may report nonzero compile/test exits while their invocation
successfully completes. Neither that success nor an agent's confidence proves
acceptance. The initial production acceptance owner is a human, not a universal
automated oracle.

Checkpoints preserve the latest completed trace and candidate within a Run.
They do not preserve unfinished scratch or resume an interrupted agent.
Agent transcripts are not durable authority; later work gets captured input and
retained primary evidence rather than assuming a conversational session survived.

New capabilities are source proposals. They require separate review/admission
and subsequent execution, never silent expansion of active authority.
There is no self-modification or create-flow implementation in this slice.

## Explicit initial limits

- One trusted local operator/controller; no distributed coordination.
- One bounded foreground episode per command; no background watcher.
- Filename-order selection, not a general scheduler or dependency graph.
- UTF-8 candidate text, no binary-source editing or file deletion technique.
- Reviewed Bun/TypeScript evaluation, not arbitrary toolchains.
- No Git mutations, automatic integration, external tracker or release powers.
- No completed replacement claim until installed-host and live-Agent workflows
  have been qualified.
