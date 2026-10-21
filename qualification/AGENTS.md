# Public-host qualification

## Purpose

Test installed public Jig/FLOW boundaries independently of unit-test doubles.

## Ownership

- `client.ts` exercises preparation, duplicate/conflicting submission, ownership
  loss, retained results and export against `project/`.
- `project/` contains synthetic, credential-free qualification Flows and recipes.
  These test execution mechanics, not real Agent judgment or factory quality.

## Local contracts

- Import only public package exports; never inspect private Jig state.
- Persist full Prepared values before submission. Never log tickets or requests.
- A host refusal is a failed qualification, not permission to substitute mocks.
- Keep reports and execution state under ignored `.tmp/` or `.jig/`.
- Never enable weaker containment or retry an uncertain execution.

## Work guidance

- Keep deterministic unit evidence, installed-host evidence and live-Agent
  evidence separate.

## Verification

Run `bun run qualify` on a supported host after installing the pinned packages
and the qualification project's locked dependencies.

## Child DOX index

None.
