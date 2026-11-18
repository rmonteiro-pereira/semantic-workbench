# Implementation evidence

## Base and prerequisites

- The implementation base includes the attribute rule and annotation slot from attributes and governance.
- Research, data-model and quickstart documents are absent from this feature directory. The available
  implementation documents are the specification, plan, task list and operation contract.
- The formatter excludes fixtures and Markdown; changed TypeScript uses the repository Oxfmt configuration.
- `scripts/commit_cadence.py` is absent from this base.

## Task departures

- T005 is unnecessary as written: `src/shared/attributes/attribute-rule.ts` already owns `isAttribute`
  and `conceptKindLookup`. The comparison will import that rule instead of adding a duplicate
  `src/shared/item-diff/attribute-kind.ts`. Its targeted proof is retained in
  `tests/item-diff/attribute-kind.test.ts` and covers the five requested predicates.

## Proofs

- T001: `bun test tests/item-diff/repository.test.ts`: 2 pass, 0 fail, 36 assertions.
  The semantic fixture uses the standard model format; Tessera markers on semantic models are refused
  by this base. Both committed fixtures pass the shared inspector.
- T002: baseline recording on the development server completed with six rendered structures and three
  consumer answers; `bun test tests/item-diff/baseline.test.ts`: 1 pass, 0 fail, 5 assertions, both
  locally and on the development server. The recorded full graph includes the built-in String card.
  DOM recording excludes transient coordinates, SVG ids and selection classes; it retains element
  hierarchy, classes, labels and text. No source changes preceded recording.
- T003: `bun test tests/item-diff/sides.test.ts`: 3 pass, 0 fail, 15 assertions.
- T004: `bun test tests/item-diff/bounds.test.ts`: 3 pass, 0 fail, 11 assertions.

- T008 adds `src/shared/item-diff/model-items.ts` to extract addressed comparison inputs in one
  reusable pure module. Container child collections are excluded to avoid reporting a concept edit
  as an ontology edit too; relationship roles remain a relationship field. This seam is also the
  server service's extraction input. The plan named no extraction module.
- T006: field changes, 3 pass, 0 fail, 11 assertions.
- T007: address comparison, 6 pass, 0 fail, 12 assertions.
- T008: serialization and Tessera proofs on the development server, 3 pass, 0 fail, 36 assertions.
  The examples test uses a 60-second timeout because the server run took 13.85 seconds.
