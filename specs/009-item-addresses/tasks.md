# Tasks: Item Addresses

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Prerequisites**: none for steps 1 to 4. Steps 5 and 6 (Phases 6 and 7) need the Principle IV and V
amendments on the constitution branch (task T040).

**Proof**: each task names how its change is shown to work: a test file, a mutant, a browser check
or a capture. A task is not done without its proof. Browser captures are taken by Codex from a fresh
worktree of the updated `main`, as the owner's instructions require; this session reads the result.

**Format**: `[ID] [P] [Story] Description. Proof: ...`. `[P]` means it can run in parallel with
other `[P]` tasks of the same phase (different files, no dependency).

## Phase 1: Foundations (adoption step 1, part 1)

- [x] T001 [P] Write the seeded generator in `tests/helpers/seeded-random.ts` (seed from
  `ADDRESS_TEST_SEED` or the clock, printed on failure; helpers for hostile names and sibling
  shuffles). Proof: `tests/seeded-random.test.ts` shows the same seed gives the same sequence.
  (FR-025)
- [x] T002 [P] Write `tests/fixtures/addresses/conformance.json` with valid, invalid and hostile
  cases: every escape class, `:` `.` `#` `/` `@` `%`, spaces, emoji, empty name, lowercase hex,
  escaped unreserved byte, unknown kind, trailing separator, over-long, over-deep, relative forms,
  snapshot on a relative form. Proof: loaded by T005; the file's own schema test checks every entry
  has the fields in `data-model.md`. (FR-026)
- [x] T003 [P] Write `src/shared/core/address-kinds.ts`: the closed kind registry with parent
  rules, name field and named/positional flag, exactly as in `contracts/address-grammar.md`.
  Proof: `tests/item-address.test.ts` asserts every `ItemKind` of
  `src/shared/edit/item-model.ts` maps to a registry kind and every registry row appears in the
  contract table (the test reads the table). (FR-002, FR-011, FR-014)

## Phase 2: User Story 1, the grammar (Priority: P1)

**Goal**: any address can be formatted, parsed, resolved from a relative form and displayed, with
no ambiguity.

**Independent test**: `bun test tests/item-address.test.ts tests/item-address-properties.test.ts`.

- [x] T004 [US1] Write the types, the escaping rule and `formatAddress` in
  `src/shared/core/item-address.ts` (canonical uppercase hex, rejects empty names, lone surrogates,
  empty slug in an absolute address, dot path parts, over-limit length and depth). Proof:
  `tests/item-address.test.ts` format cases from the fixtures. (FR-001 to FR-005, FR-008, FR-004)
- [x] T005 [US1] Write `parseAddress` (length checked first, single linear scan, closed failure
  reasons, never throws, rejects non-canonical text). Proof: every conformance entry passes;
  `tests/item-address.test.ts` has a 4,096-character timing case under 10 ms. (FR-003, FR-008,
  FR-045; SC-004)
- [x] T006 [US1] Add relative resolution (`resolveAddress`), prefix operations (`hasPrefix`,
  `replacePrefix` on whole segments), and `displayName`. Proof: unit cases for the three forms, a
  relative form without a base, `Customer` not matching `CustomerGroup`, a snapshot kept through a
  prefix replacement. (FR-006, FR-007, FR-021, FR-030)
- [x] T007 [US1] Write `tests/item-address-properties.test.ts`: round trip both ways over at least
  10,000 generated items per run, canonical uniqueness (injective), rejection of every mutation of
  a canonical text that makes it non-canonical, relative resolution, prefix replacement keeps the
  suffix. Proof: the file itself; the seed is printed on failure (SC-001). (FR-025; SC-001)
- [x] T008 [P] [US1] Write `tests/item-address-purity.test.ts`: the shared address modules import
  only each other, `iri.ts` and type-only model imports, and no `node:*`, `fetch` or `Date` use
  appears in them. Proof: the test. (FR-022, FR-046)
- [x] T009 [US1] Add grammar mutants in `scripts/address-mutants.ts` and register them in
  `scripts/mutation-tests.ts`: widen the unreserved set, accept lowercase hex, drop the length
  check, off-by-one on the depth limit, string-prefix instead of segment-prefix match, drop the
  position leading-zero rule. Proof: `bun run test:mutation` detects every one. (SC-011)

**Checkpoint**: step 1 can ship. Nothing else changes.

## Phase 3: User Stories 2 and 5, derive and resolve (adoption step 2)

**Goal**: every item of every layout has an address, siblings reorder without effect, and an
address says whether it is ambiguous or volatile.

**Independent test**: `bun test tests/model-addresses.test.ts`.

- [x] T010 [US2] Write `addressesOfModel` in `src/shared/core/model-addresses.ts` for ontology and
  standalone model documents (root scope segment, concepts, relationships, concept mappings,
  datasets, fields, joins, metrics). Proof: `tests/model-addresses.test.ts` against the sample
  project documents. (FR-011, FR-012, FR-014, FR-023)
- [x] T011 [US5] Extend it to the consolidated layout, the legacy `semantic_model` list and ODCS
  (objects, nested properties with one segment per level, foreign keys as positional segments).
  Add fixture documents with dotted, colon and hash names. Proof: SC-008 test resolving every
  derived address of every layout back to its item; dotted ODCS property case. (FR-013, FR-014,
  FR-015; SC-008)
- [x] T012 [US2] Write `resolveInModel` (`found`, `ambiguous`, `missing`; parent-kind rule) and
  `itemIdentity` (expanded IRI through `src/shared/validation/iri.ts`, none otherwise; no generated
  ids). Proof: tests for duplicate same-kind siblings returning both matches, a dataset and a join
  with one name, an IRI kept across a rename, a field with no identity. (FR-016, FR-017, FR-018,
  FR-024)
- [x] T013 [US2] Add the model-level property tests: reorder invariance over 1,000 shuffles per
  sample project, uniqueness of non-ambiguous addresses per document, positional segments flagged
  volatile. Proof: `tests/model-addresses.test.ts`. (FR-019, FR-025; SC-002, SC-003)
- [x] T014 [P] [US2] Add mutants: ignore the kind when matching, choose the first of ambiguous
  matches, treat positional as stable, skip the parent-kind rule. Proof: `bun run test:mutation`.
  (SC-011)
- [x] T015 [US2] Add `address` to `Entity` and `Relationship` in `src/shared/core/model.ts`, derived
  in `inspect()`; leave `id` as it is. Proof: the existing model tests unchanged and passing; a new
  test that every sample project entity has a unique address; the timing check shows under 5%
  extra on the largest sample (SC-013). (FR-020, FR-023; SC-002, SC-013)

**Checkpoint**: step 2 can ship. Behaviour is unchanged.

## Phase 4: User Story 4, existing consumers (adoption steps 3 and 4)

**Goal**: graph selection, mapping, lineage and agent context share the grammar and nothing visible
changes.

**Independent test**: each consumer's tests plus the named browser suites.

- [x] T016 [US4] Write `src/shared/core/item-key-adapters.ts`: read `concept:C/R`, `dataset:D/F`,
  `field:d.f`, `dataset.field`, `join:J`, `metric:M` into addresses against a model, refusing
  alias-qualified or QName text unless a resolver turns it into a name, and refusing ambiguous
  dotted forms instead of guessing. Proof: `tests/item-key-adapters.test.ts` including the cases
  that were ambiguous in the old notations. (FR-009, FR-041)
- [x] T017 [US4] Move the mapping canvas to addresses in `src/app/mappings/mapping-graph.ts`
  (`conceptId`, `datasetId`, `metricId`, `fieldId` become calls to the formatter; their callers
  receive addresses). Proof: `tests/` for mapping graph pass unchanged apart from key text; a
  field named `a/b` and a dataset named `a` stay distinct. (FR-038, FR-039)
- [x] T018 [P] [US4] Move ODCS lineage ids to addresses in `src/app/odcs/lineage.ts` and
  `src/app/odcs/*` consumers. Proof: lineage tests; a dotted property name case. (FR-014, FR-038)
- [x] T019 [US4] Move graph selection and neighbourhood state to addresses
  (`src/app/workspace/WorkspaceCanvas.tsx`, `src/app/graph/`), keeping `Entity.id` only as the
  React key. Proof: `scripts/item-address-browser-check.ts` (new, `test:addresses`) selects a node
  by address, reloads, and shows the same card; existing `test:graph`, `test:lineage`, `test:ui`
  pass. (FR-038, FR-039)
- [x] T020 [US4] Regression gate for steps 3: run the `ui-regression-gate` comparison of the whole
  journey against the last good release, delegated to Codex, covering every graph state stage
  (overview, neighbourhood, full graph, lineage, mapping). Proof: the capture folder and a
  findings file with every difference classified; every unrequested change fixed or reverted. (FR-039;
  SC-007)
- [x] T021 [US4] Build agent context labels from the formatter in
  `src/server/agent/context-assembly.ts` and the keys in `explain.ts` and `query-plan.ts`. Proof:
  `tests/agent-context-kinds.test.ts` and the plan snapshots unchanged except the documented
  labels; a test that two fields whose dotted names would collide now differ. (FR-038, FR-039)
- [x] T022 [US4] Read the metric extension's `dataset.field` through the adapter in
  `src/shared/metrics/extension.ts` readers; write nothing back. Proof: a byte-exact test that
  opening and saving a metric file leaves it identical and contains no `sw1:` text. (FR-010,
  FR-041)
- [x] T023 [US4] Write `tests/address-consumer-contract.test.ts`: a toy diff, a toy usage counter
  and a toy pointer, built only from the public functions and the conformance fixtures, to show a
  later consumer needs no change to the grammar. Proof: the test. (FR-042)

**Checkpoint**: steps 3 and 4 can ship. Stored state is untouched.

## Phase 5: User Story 3, part 1, the pure migration (adoption step 6, pure part)

**Goal**: a stored address follows a recorded rename, safely.

**Independent test**: `bun test tests/address-migration.test.ts`.

- [x] T024 **Compaction dropped by the integrator (2026-11-16): interleaved subtree rewrites change replay results. Remaining pure replay/validation is implemented; bounded uncompacted storage belongs to T029.** [US3] Write `src/shared/core/address-migration.ts`: record types, `migrateAddress`
  (resolved input returns unchanged; each record applied once in order; terminates), compaction,
  `validateDeclaredMigrations` (FR-049 rules), retention cut. Proof: `tests/address-migration.test.ts`
  with chains, rename back, segment boundary, snapshot kept, a record where `from` equals `to`
  refused. (FR-029, FR-030, FR-031, FR-037, FR-047, FR-049)
- [x] T025 [P] [US3] Property tests for migration: any record list terminates; migrating twice
  equals migrating once when the first result resolves; prefix migration keeps the suffix. Proof:
  `tests/address-migration.test.ts`, seeded. (FR-025, FR-031)
- [x] T026 [P] [US3] Mutants: apply records out of order, apply a record twice, ignore the
  resolved flag, string-prefix match, accept a record outside the project. Proof:
  `bun run test:mutation`. (SC-011)

## Phase 6: Persisted keys (adoption step 5; needs the amendments)

- [x] T027 [US4] Inventory every persisted key shape that holds an entity id or an item name (view
  state, grouping corrections, layout hints, drafts, suggestions, trash log). Proof:
  `tests/address-key-inventory.test.ts` fails on an unknown shape; the inventory is listed in
  `docs/item-addresses.md`. (FR-040)
- [x] T028 [US4] Write `src/server/projects/address-key-conversion.ts`: one-time conversion with a
  backup of the previous store, a hash check of every converted file against its original bytes, a
  stop without changes on any failure, and a report of unconvertible keys that are kept. Follow
  the conventions of `src/server/projects/migration.ts`. Proof:
  `tests/address-key-conversion.test.ts` with 1,000 old keys (converted plus reported equals 1,000),
  restore from the backup gives the original bytes, a failing hash leaves the store untouched.
  (FR-040; SC-010)

## Phase 7: User Story 3, part 2, store, rename and move (adoption step 6)

**Goal**: a rename or move made in the workbench records one migration, atomically with the files.

**Independent test**: `bun test tests/address-migration-store.test.ts` and the rename browser check.

- [x] T029 **Compaction and the associated retention setting are dropped: ordered history is never pruned; the hard bound remains.** [US3] Write `src/server/projects/address-migrations.ts`: read, append inside a journal
  step, compaction by retention and bound, ids derived from the operation id; add the
  `SW_ADDRESS_MIGRATION_RETENTION_DAYS` setting (default 365) to `src/server/config.ts`. Proof:
  `tests/address-migration-store.test.ts` including retry idempotency and the 50,000 bound. (FR-029,
  FR-034, FR-035, FR-037)
- [x] T030 [US3] Interrupted-operation tests: interrupt a three-file rename at every journal step
  (before each file, after each file, before and after the store step) using the journal's crash
  hook, then recover twice. Proof: SC-006 test; the store and files are all new or all old, and the
  second recovery adds nothing. (FR-034; SC-006)
- [x] T031 [US3] Extend the save and save-batch bodies (`src/server/routes/kpis.ts`,
  `src/server/routes/files.ts`, `src/server/projects/workspace.ts` `saveFiles`) with the optional
  declared migrations; validate at the boundary into typed objects; refuse the whole request when a
  declaration breaks FR-049; a body without the field behaves as before. Proof: route tests
  (valid, cross-project, file not in request, over 64 entries, field absent), and the existing
  authorization matrix entries for both routes gain a declared-migration case. (FR-027, FR-049)
- [x] T032 [US3] Client side: build the declared migration on an item rename (subtree prefix) and
  on a document-name change; send it with `api.save` and `api.saveBatch`
  (`src/app/projects/api.ts`, `src/app/edit/ItemEditor.tsx`, `src/app/edit/references.ts`). Include
  the relationship-target reference rewrite that E18 names as missing, with its own test. Proof:
  editor tests; `scripts/item-address-browser-check.ts` renames a concept, ticks references, saves,
  and reads the store (`test:addresses`); `test:item-edit` passes. (FR-027, FR-028; SC-005)
- [x] T033 [P] [US3] Record a `document` migration in the file-move module used by `moveFile`
  (explicit move and suggestions), including a move to another project (both stores), and carry the
  store with the project through trash and restore like view state. Proof:
  `tests/address-migration-store.test.ts` cases for move, cross-project move, trash and restore.
  (FR-028, FR-035)
- [x] T034 [P] [US3] Write deleted markers from item delete (`src/app/edit/DeleteItem.tsx`) and
  file delete, and refuse inheriting history at a reused address without a reconciliation. Proof:
  tests delete then create at the same address. (FR-043)
- [x] T035 [US3] Reconciliation: a server function that records a `reconciliation` record only for
  someone allowed to save the file that holds the new address and refuses an unreadable project's
  address. Proof: `tests/address-migration-store.test.ts` and authorization cases for readable,
  unreadable and guarded files; the interface is left to the item diff feature. (FR-032, FR-048)
- [x] T036 [P] [US3] External changes: a Git pull and a branch switch that rename an item record
  nothing, and an undone rename leaves resolving stored addresses unchanged. Proof: tests using
  the SCM fixtures; the diff-style toy consumer from T023 shows remove plus add, then one rename
  after a reconciliation. (FR-033, FR-047; SC-005)

## Phase 8: User Story 6, hidden equals missing (adoption step 6)

- [x] T037 [US6] Write the server resolver `resolveForCaller` in
  `src/server/projects/address-resolution.ts`: unreadable project returns the missing result
  without opening project data; migration reads filtered by the reader. Proof:
  `tests/address-hidden-missing.test.ts` comparing responses and the set of files opened (a spy on
  the store and the file reads) for readable, unreadable, guarded and absent projects. (FR-044;
  SC-009)
- [x] T038 [P] [US6] Telemetry and log guard: a test that a save with declared migrations, a
  resolution and a migration read produce no log line, span name or metric label containing an
  address, slug, path or item name. Proof: `tests/observability/address-redaction.test.ts`.
  (FR-036)
- [x] T039 [P] [US6] Mutants: resolver returns `forbidden` for unreadable, resolver reads project
  data before the check, a retried operation appends a second record, log field includes the
  address. Proof: `bun run test:mutation`. (SC-011)

## Phase 9: Constitution, documentation and retirement

- [x] T040 Confirm the Principle IV and V amendments are merged on the constitution branch before
  starting Phases 6 and 7; record the version in the plan's Constitution Check. Proof: the plan
  line updated with the version. (Constitution)
- [x] T041 [P] Write `docs/item-addresses.md`: the grammar, the three forms, escaping, kinds table,
  the stability table, the migration rules, limits, what a consumer must do, and the persisted-key
  inventory. Counts (kinds, fixtures) are asserted by `tests/item-address-docs.test.ts`, which
  reads the registry and fixture file. Proof: the test. (FR-010, FR-017, FR-020, FR-042; SC-012)
- [x] T042 **The retention environment variable is dropped with compaction; document the bounded uncompacted store instead.** [P] Update `README.md` (a short Item addresses section: what an address is, what it
  promises, what it does not, the retention setting), `docs/configuration.md`
  (`SW_ADDRESS_MIGRATION_RETENTION_DAYS`, the `state/address-migrations/` folder),
  `docs/user-guide.md` (rename and move behaviour and the external-change limit),
  `docs/development.md` (test commands, `ADDRESS_TEST_SEED`, `test:addresses`) and `CHANGELOG.md`.
  Proof: the docs-sync check passes; a reviewer reads the claims against the tests. (FR-020;
  SC-012)
- [x] T043 [P] Update `ARCHITECTURE.md`: code-map rows for the new shared modules and the store, a
  line in "Where to change a behavior" (adding an item kind), and the invariant that no code builds
  an address by concatenation. Proof: docs-sync check. (SC-012)
- [ ] T044 Retire the private key builders (`conceptId`, `datasetId`, `metricId`, `fieldId`,
  context label builders) and add a lint-style test that fails when a template string builds one of
  the old key shapes outside the adapters. Proof: `tests/item-address-no-private-keys.test.ts`;
  `bun --bun run check`. (FR-038)
- [ ] T045 Run the full gate: `bun test`, `bun --bun run check`, `bun --bun run build`,
  `test:addresses`, `test:graph`, `test:lineage`, `test:metrics`, `test:item-edit`, `test:ui`,
  `test:responsive`, `test:edges`, `test:auth`, `test:mutation`, and the regression comparison of
  T020 re-run on the final build. Proof: the gate output recorded in the feature's verification
  note when the feature is released. (SC-007, SC-011)

## Dependencies and order

- Phase 1 then Phase 2 (steps 1). Phase 3 needs Phase 2. Phase 4 needs Phase 3. Phase 5 needs
  Phase 2 only and can run beside Phases 3 and 4.
- Phases 6 and 7 need Phase 4 and T040. Phase 8 needs Phase 7. T044 comes last.
- Parallel opportunities: T001 to T003; T008 with T009; T014 with T013; T018 with T017; T025 and
  T026; T033, T034, T036; T038 and T039; T041 to T043.

## Traceability

| Source | Requirements | Tasks |
| --- | --- | --- |
| E6: versioned locator grammar, separately escaped segments | FR-001 to FR-009 | T002 to T007, T009 |
| E6: name-based locator promises no identity; IRI is identity | FR-017 to FR-021 | T006, T012, T015, T041 |
| E6: nested ODCS and embedded layouts as locators | FR-012 to FR-016 | T003, T010, T011, T012 |
| E6: renames update references and record migrations | FR-027 to FR-031, FR-034, FR-035, FR-049 | T024, T029 to T033 |
| E6: ambiguous external changes become remove/add | FR-016, FR-032, FR-033, FR-047, FR-048 | T012, T035, T036 |
| E6: snapshot version for history | FR-005, FR-007 | T004, T005, T006 |
| E6: A1 is M, not S; order of adoption | FR-038 | T015 to T023, T044 |
| E6: no persistent ids for every field | FR-018 | T012 |
| Evaluation A1: parse and format used by consumers | FR-022 to FR-026, FR-038, FR-041 | T001, T008, T016 to T023 |
| Evaluation: two notations | FR-001, FR-041 | T016, T017, T021, T022 |
| Ossie Fable M1: kind segment, escaping, same-name documents | FR-002, FR-003, FR-012 | T003 to T005, T010 |
| Ossie Fable M1: nested ODCS, embedded layout, legacy wrapper | FR-013, FR-014 | T011 |
| Ossie Fable M1: settle together with 006 | FR-042 | T023, T041 |
| Ossie Astra 5: identity, location, display separated | FR-017 to FR-021 | T006, T012, T041 |
| Ossie Astra 5: alias scope and project identity | FR-006, FR-009 | T006, T016 |
| Ossie Astra 5: stability across reorder; counters migrate | FR-019, FR-027 to FR-031 | T013, T024, T032 |
| Validation: join and dataset scopes differ | FR-011 | T003, T010, T012 |
| E17, E18: governance pointers, relationship rename gap | FR-041, FR-042 | T022, T023, T032 |
| E20: counters apply address migrations, identity-free | FR-029, FR-042 | T023, T024, T029 |
| M16: authoring versus published identity | FR-007 | T004, T006 |
| MCP review: hidden and missing indistinguishable | FR-044; SC-009 | T037, T039 |
| Constitution I | FR-036, FR-044, FR-046 | T008, T037, T038 |
| Constitution II | FR-010, FR-041 | T022 |
| Constitution III | FR-008, FR-022 | T005, T008 |
| Constitution IV | FR-034, FR-035, FR-040 | T028, T029, T030 |
| Constitution VI, R2 | SC-011 | T009, T014, T026, T039, T045 |
| Constitution VII, R2 | SC-012 | T041 to T043 |
| Requirements without a decision source (design choices) | FR-037, FR-039, FR-043, FR-045, SC-013 | T015, T017 to T021, T029, T034, T005 |
