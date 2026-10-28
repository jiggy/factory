# Public-host qualification

## Purpose

Test installed public Jig/FLOW boundaries independently of unit-test doubles.

## Ownership

- `client.ts` exercises preparation, duplicate/conflicting submission, ownership
  loss, retained results and export against `project/`.
- `probe.ts` creates, reviews and runs the installed host's unmodified code-only
  greeting template. It isolates baseline host behavior from the factory fixture.
- `diagnostics.ts` preserves known safe public failure codes without forwarding
  raw subprocess text to reports.
- `project/` contains synthetic, credential-free qualification Flows and recipes.
  These test execution mechanics, not real Agent judgment or factory quality.

## Local contracts

- Import only public package exports; never inspect private Jig state.
- Persist full Prepared values before submission. Never log tickets or requests.
- A host refusal is a failed qualification, not permission to substitute mocks.
- Keep reports and execution state under ignored `.tmp/` or `.jig/`.
- Recipe compiler configuration follows the native fixed file policy. Declare
  Bun test types in the recipe's locked development dependencies.
- Strict candidate compilation skips locked dependency declaration checks,
  matching the application recipe; all candidate test assertions still run.
- Never enable weaker containment or retry an uncertain execution.
- Keep baseline template success separate from full client/evaluation success.
  Do not remove a failing fixture capability to manufacture a passing result.
- Export collision checks use an unrelated existing directory and preserve its
  sentinel. Repeating an already delivered export is not collision evidence.

## Work guidance

- Keep deterministic unit evidence, installed-host evidence and live-Agent
  evidence separate.
- Preserve passing and failing repetitions. Do not select a green baseline
  result while discarding intermittent failures of the same public source.

## Verification

Run `bun run qualify` on a supported host after installing the pinned packages
and the qualification project's locked dependencies.
Use `bun run qualify:probe` for a minimal public reproduction. It permits
resolution of the generated public template's pinned dependencies; it does not
select an Agent or access application task data.

## Child DOX index

None.
