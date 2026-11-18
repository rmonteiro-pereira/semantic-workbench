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

## Operation phase blocked by migration provenance

The operation cannot select migrations that happened **between the requested sides** using this
base's recorded history. The plan permits no new durable state and proposes reading the existing
project history directly. That history is neither branch-scoped nor versioned alongside definitions.

Concrete reproduction: `bun test tests/item-diff/migration-scope.test.ts` passes with 6 assertions.
A workbench rename on `work/comparison` writes a migration. Restore the original bytes, create
`work/outside` at the same HEAD, and save identical renamed bytes without declaring a migration.
Both branches now have the same before/after definition bytes, the same HEAD and the same migration
history, although only the first branch performed a recorded rename. The required result is one
changed item for the first branch and remove plus add for the second. Ancestry cannot distinguish
these cases because the record names their shared pre-edit HEAD.

Relevant existing code:

- `src/server/projects/workspace/document-save.ts`: `saveMigrations` reads `localCommit` before saving;
  `saveFile` appends the records using the global workspace layout, regardless of the working copy.
- `src/server/projects/workspace.ts`: `localCommit` returns `git.head`, not a resulting saved version.
- `src/server/projects/address-migrations.ts`: `addressMigrationFile` keys only by project;
  `readAddressMigrations` filters endpoint visibility but has no side or branch provenance.
- `src/shared/core/address-migration.ts`: `MigrationRecord` holds id, kind, endpoints, time and commit;
  it has no branch, copy or resulting content version.

The pure comparison accepts an already-selected migration list. No route should pass the entire
project history to it: that would misclassify outside renames after branch switches. T010–T018 are
left unticked and the operation phase is stopped, as required for a specification/base contradiction.
The dependent overlay, branch journey, publication review and their browser proofs remain pending.
The independent planner status flag can proceed.

Resolution needed: agree a durable provenance contract for saved and committed migrations across
branches and working copies, including historical comparisons and legacy records. This changes the
plan's no-new-state constraint and requires changes to the existing migration writers, outside its
listed file ownership. Do not weaken the no-similarity or outside-rename rule to bypass this gap.

## Independent planner proof

- T031: `bun test tests/item-diff/planner-flag.test.tsx`: 3 pass, 0 fail, 7 assertions.
- `scripts/item-diff-planner-browser-check.ts` passed on the development server at 1440×900
  and 360×800, light and dark, for approved, proposed, legacy draft, deprecated and absent status.
  Geometry, clipped text and contrast checks passed. This checks only the independent planner
  change; it does not replace the pending overlay browser check.
- The browser fixture supplies authenticated same-origin metadata when intercepting the preview
  context request. Without it the existing browser-only route correctly refuses the test client.
