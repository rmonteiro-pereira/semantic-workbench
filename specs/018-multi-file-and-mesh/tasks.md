# Tasks: Multi-File Ontology Units and the Ontology Mesh

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/](./contracts/)

**Prerequisites**: feature 011 (on this branch's base). Revision numbers follow merge order; this feature
proposes revision 3 (feature 016 proposes 2). No constitution amendment is needed (4.0.1).

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task touches
different files from its neighbours and may run in parallel. `[CODEX]` marks screenshot and visual-comparison work
that is handed to Codex (see the global instruction; the brief names the output folder and forbids touching real
data). Every task that changes code ends with its own targeted test green and the formatter applied
(`bun run fmt` on touched files). A change to an existing test is listed in the pull request description.

**Process (owner-approved 2026-11-17)**: during implementation run only the feature's own tests, `bun --bun run check`
and `bun --bun run build`. The full unit suite, mutation tests, every browser suite, the UI regression comparison
against the last release and the architecture review run once on the integrated batch (T063). Heavy runs (the build,
the scale test) use `sw-midgard-run -- <command>`.

## Phase 1: Setup and fixtures (before any change under `src/`)

- [x] T001 [US1] Confirm the one-file baseline: run `bun test tests/tessera/standard-unchanged.test.ts` on the base and add `tests/fixtures/tessera/mesh/README.md` naming every fixture of this feature and the finding each refusal fixture must give. Proof: the test passes before any change; the README lists each file.
- [x] T002 [US1] Write `specs/018-multi-file-and-mesh/callers.md`: every caller of `inspect`, `validateStructured`, the scanner entity index, `src/server/agent/context-assembly.ts`, `src/app/workspace/parsedDocument.ts` and the graph builders that treats an ontology document as the whole ontology, each marked "per file" or "per unit". Proof: a search for `inspect(` over `src/` finds no caller missing from the list.
- [x] T003 [P] [US1] Write unit fixtures in `tests/fixtures/tessera/mesh/units/`: `three-parts/` (root `ontology.yaml` plus `orders.yaml`, `returns.yaml`, `customers.json`), `one-file-twin/` (the same ontology in one file), `empty-root/` (all concepts in parts). Proof: each file parses; `three-parts` and `one-file-twin` hold the same concepts.
- [x] T004 [P] [US8] Write one refusal fixture per finding code of `contracts/unit-and-parts.md` in `tests/fixtures/tessera/mesh/refusals/` (duplicate owner, self-include, root-in-list, escape by `..`, absolute path, backslash, link, missing file, not a part, part with header, mixed version, duplicate concept, open export, alias twice, provider twice, empty and repeated allow-list, unexported name, unlisted use, bad pin, bound reached). Proof: each parses; the README of T001 names the expected code.
- [x] T005 [US2] Write `tests/helpers/mesh-workspace.ts`: builds a temporary workspace with providers `finance` and `units` and consumers `retail`, in both shapes (all in one repository, and each in its own), publishes them, and can publish a provider change, add an uncommitted import and add a personal branch. Proof: `bun test tests/mesh/mesh-workspace.test.ts` shows both shapes publish and the published commits differ from the working trees.
- [x] T006 [P] [US6] Write the access fixture `tests/fixtures/tessera/mesh/access/` (access settings that hide one part of a unit from one role, and a project with no domain). Proof: `bun test tests/mesh/mesh-workspace.test.ts` reads the unit as both roles and shows the hidden part is absent for one.

## Phase 2: Foundational format code (blocks every story)

- [x] T007 Add `src/shared/tessera/additions/{includes,exports,imports,part}.ts` per `contracts/unit-and-parts.md`, add them to `ADDITIONS` in `src/shared/tessera/registry.ts`, remove `tessera_imports` from `src/shared/tessera/reserved-names.ts`, and raise `SUPPORTED_REVISIONS` in `src/shared/tessera/format.ts` (revision 3, renumber if feature 016 merged first). Proof: `bun test tests/tessera/registry.test.ts tests/mesh/registry-additions.test.ts` covers names, places, revision, dispositions and the revision-1 and -2 refusal of each new name (FR-060, FR-061).
- [x] T008 Derive the schemas: extend `src/shared/tessera/schema-derivation.ts` and `scripts/derive-tessera-schema.ts` to emit `schemas/tessera-ontology-3-ossie-0.2.0.dev0.json` and `schemas/tessera-part-3-ossie-0.2.0.dev0.json` (a part holds only `tessera`, `tessera_part`, `ontology`), add `schemas/tessera-dependencies-v1.json`, wire all three into `scripts/compile-schemas.ts`, run `bun run schemas:compile`. Proof: `bun test tests/tessera/schema-derivation.test.ts` equals the checked-in files byte for byte; `bun scripts/derive-tessera-schema.ts --check` exits 0.
- [x] T009 [P] Extend `src/shared/tessera/document-kind.ts` with kinds `tessera-part` and `dependency-manifest` and keep `readMarker` unchanged for roots. Proof: `bun test tests/mesh/document-kind.test.ts` classifies the fixtures of T003, T004 and a manifest file.
- [x] T010 Create `src/shared/tessera/unit-structure.ts` (`readUnitStructure(files)`): roots, parts, orphans, duplicate ownership, include cycles, path escapes (absolute, `..`, backslash, control characters, links given by the caller), missing and non-part files, one Ossie version, the part and import bounds, with the finding codes of the contract. Proof: `bun test tests/mesh/unit-structure.test.ts` runs every fixture of T004 that concerns structure and checks code, files named and that no fixture gives two findings for one mistake (FR-001 to FR-006, FR-012, FR-024).
- [x] T011 [P] Create `src/shared/tessera/unit-model.ts` (`combineUnit`): one ontology object in the order of FR-051 plus a map from each item address to its file. Proof: `bun test tests/mesh/unit-model.test.ts` compares the combined `three-parts` with `one-file-twin` for concepts, edges and entity ids (SC-002), and that references resolve across parts (FR-008).
- [x] T012 [P] Create `src/shared/tessera/export-closure.ts`: closure of an export list over parents, role players, identifiers and constraint references; `tessera-export-open` and `tessera-export-unknown` findings; `interfaceHash` over canonical JSON. Proof: `bun test tests/mesh/export-closure.test.ts` covers an open export, a closed export, a re-exported import, a hash that changes with a constraint and does not change with a private concept (FR-014, FR-015).
- [x] T013 [P] Create `src/shared/tessera/imports.ts`: alias table, one provider per unit, allow-list checks, scan of qualified references (`alias.Concept`) wherever a concept reference is allowed, findings `tessera-import-*`. Proof: `bun test tests/mesh/imports.test.ts` covers FR-016 to FR-020 including different aliases in two units for one provider and the same finding for an unexported and a missing name.
- [x] T014 [P] Create `src/shared/tessera/dependency-manifest.ts`: parse and validate against `schemas/tessera-dependencies-v1.json`, canonical print, `manifestIsCurrent(manifest, imports)`. Proof: `bun test tests/mesh/dependency-manifest.test.ts` covers shape errors, key order and bytes, stale and current cases (FR-025, FR-031).
- [x] T015 [P] Create `src/shared/tessera/qualify.ts`: owner-qualified names and the reference rewrite for any alias; fails on a collision after qualification. Proof: `bun test tests/mesh/qualify.test.ts` covers two providers with one concept name, two aliases for one provider across units, and a rewrite of parents, roles and identifiers. The task first checks that a dot in a concept name does not break `src/shared/mappings/relationship-reference.ts`, which splits names on dots; if it does, the task picks another separator, records it in `contracts/unit-and-parts.md` and the proof covers it (FR-053, FR-054).
- [x] T016 Create `src/shared/tessera/set-validation.ts`: `setFindings(unit, providerInterfaces)` and `readerView(findings, visibleFiles)` that returns single-file findings only plus a "set not checked" flag, naming nothing hidden. Proof: `bun test tests/mesh/set-validation.test.ts` shows a hidden file's name, path and count never appear in `readerView` and that the view of a missing file equals the view of a hidden one (FR-034, FR-036, SC-006).

**Checkpoint**: units, imports, manifests and sets can be judged as pure functions. The workbench does not call them yet.

## Phase 3: User Story 1 - An author splits one ontology over several files (P1)

**Independent Test**: `bun test tests/mesh/workbench-units.test.ts`.

- [x] T017 [US1] In `src/shared/validation/validation.ts` handle the part kind: a part is validated as a fragment with the derived part schema, root properties of the unit are checked with the revision-3 schema, one-file ontologies take the old path. Proof: `bun test tests/mesh/workbench-units.test.ts tests/tessera/standard-unchanged.test.ts` pass; the second shows zero changes (FR-013, SC-001).
- [x] T018 [US1] In `src/shared/core/model.ts` and `src/server/projects/scanner.ts` give a part `docType` "Ossie ontology", index unit files, and let the graph, catalog and inspector callers listed in T002 read `combineUnit`. Proof: `bun test tests/mesh/workbench-units.test.ts` compares graph entities and edges of `three-parts` and `one-file-twin`; scanner records the parts with the root's type (FR-009).
- [x] T019 [US1] In `src/shared/edit/item-model.ts`, `src/app/edit/AddItem.tsx`, `src/app/edit/references.ts` and `src/server/projects/workspace/file-move.ts` let an add choose its file, save an edit to the file that holds the item, and record an address migration when a concept moves between files. Proof: `bun test tests/mesh/workbench-units.test.ts` shows only one file's bytes change on an edit, a duplicate name is refused with both files named, and a move records a migration that `src/shared/core/address-migration.ts` follows (FR-010, FR-011).
- [x] T020 [P] [US1] In `src/server/agent/context-assembly.ts` and `context-documents.ts` read a unit as one ontology for published context, plans and explanations; no part marker or include appears in them. Proof: `bun test tests/agent-*.test.ts tests/mesh/agent-context.test.ts` show equal answers for `three-parts` and `one-file-twin` (FR-062).
- [x] T021 [US1] Show units: `src/app/mesh/PartPicker.tsx`, the "Part of" and "Root with N parts" lines and the orphan notice in `src/app/workspace/SourceView.tsx` and `DetailsPanel.tsx`, with `src/app/mesh/mesh.css`. Text wraps; no ellipsis. Proof: `bun test tests/mesh/part-picker.test.tsx` renders empty, long-name and orphan states.
- [ ] T022 [US1] Add `tests/mesh/workbench-units.test.ts` cases for saving through `createWorkspace`, the browser path and the operation boundary (`files.save`, `documents.save`, `files.saveBatch`) with a unit file, extending `tests/auth/operation-parity.test.ts` or `tests/auth/mesh-parity.test.ts`. Proof: the table passes; removing the unit branch from the validator makes the invalid case fail.

**Checkpoint**: units work for authors in the workbench. MVP of the feature.

## Phase 4: User Story 2 - A department imports concepts from another department (P1)

- [ ] T023 [US2] Create `src/server/mesh/provider-resolution.ts`: for a provider project and optional ontology, find the exporting root, read the published snapshot through `src/server/projects/snapshot-index.ts` and `published-pointer.ts`, return the closure and interface hash, refuse when the person cannot read the provider (same answer as missing). Proof: `bun test tests/mesh/provider-resolution.test.ts` (network access blocked in the test) covers both repository shapes, a provider with no published commit, a hidden provider and a missing one giving identical errors (FR-016, FR-021, FR-022).
- [ ] T024 [US2] Validate imports against resolved providers in the workbench path: `src/shared/validation/validation.ts` receives provider interfaces from the caller, `src/shared/core/model.ts` marks imported concepts with owner and version, `src/app/edit/references.ts` rewrites alias uses on a rename. Proof: `bun test tests/mesh/workbench-imports.test.ts` covers scenarios 1 to 5 and 7 of User Story 2.
- [ ] T025 [US2] Create `src/server/routes/mesh.ts` with `mesh.providers.list` and `mesh.dependencies.read` and register it in `src/server/handler.ts`; add rows to `src/server/auth/route-actions.ts`, entries to `policies/operation-inventory.json` and `schemas/semantic-workbench-operations-v1.json` if a new handler check is needed, cases to `policies/matrix-cases.json`. Proof: `bun test tests/auth/operation-inventory.test.ts tests/auth/mesh-parity.test.ts` pass; a hidden provider is absent from the list.
- [ ] T026 [US2] Create `src/app/mesh/ImportsSection.tsx`, `ImportEditor.tsx`, `use-mesh.ts`, `api.ts` and mount the section in `src/app/workspace/DetailsPanel.tsx`: list of imports, picker of readable exporting projects, alias, concept check list, version choice, the "Not published" label, states per the plan. Proof: `bun test tests/mesh/imports-section.test.tsx` renders empty, loading, error, long names and a phone-width layout class.
- [ ] T027 [P] [US2] Show an imported concept: owner and version on cards and details through the `imported` field in `src/app/graph/full-node-data.ts`, `FullGraphNodes.tsx`, `NeighborhoodGraph.tsx`, `EntityDetails.tsx`; imported concepts cannot be edited here. Proof: `bun test tests/mesh/imported-concept.test.tsx` covers the card text, no colour-only meaning and the read-only details.
- [ ] T028 [US2] Add `tests/mesh/workbench-imports.test.ts` cases for a provider that is moved, renamed or trashed (the manifest names the project by stable identity; the update flow offers the new place). Proof: the test passes.

## Phase 5: User Story 3 - An import means the same thing until it is updated (P1)

- [ ] T029 [US3] Create `src/server/mesh/dependency-update.ts` and the `mesh.dependencies.update` route: resolve every import again, summarize interface changes (concepts added, removed, changed by hash, "not judged"), validate pins (published history through the Git helper's ancestor check, release tags), write `tessera-dependencies.json` with a base-hash check. Proof: `bun test tests/mesh/dependency-update.test.ts` covers latest, pin to history, pin to an object-store-only commit (refused), a tag, two versions of one provider through two paths (refused), a pin on a same-repository provider (refused) (FR-026 to FR-029, FR-030).
- [ ] T030 [US3] Create `src/server/mesh/dependency-check.ts` and add it to `publicationChecks()` in `src/server/projects/publication-checks.ts`: manifest present and current, pinned objects readable with the publishing person's access, same-repository hashes equal the candidate's provider files, set errors block (FR-031, FR-032, FR-039). Proof: `bun test tests/mesh/dependency-check.test.ts tests/publication-checks.test.ts` cover stale, missing, unreadable, lost access, a mismatched hash and a set error on the publication that follows a remote.
- [ ] T031 [US3] Prove atomicity: provider and consumer in one repository change together and either both publish or neither (use the promotion path of feature 012 when it is on the base; otherwise the existing publish path), and two projects that import each other publish and compile. Proof: `bun test tests/mesh/atomic-publication.test.ts` passes for both repository shapes and the cycle case (FR-023, FR-030).
- [ ] T032 [US3] Prove freezing: after a provider publishes a change, the consumer's compile, graph, catalog and agent context are byte-identical until "Update dependencies" (SC-007). Proof: `bun test tests/mesh/freeze.test.ts` passes.
- [ ] T033 [US3] Interface: "Update available" and the interface change summary in `src/app/mesh/ImportsSection.tsx`, an "Update dependencies" action that shows the summary before it writes, and the refusal finding with the action offered in `src/app/scm/DefaultBranchActions.tsx`. Proof: `bun test tests/mesh/imports-section.test.tsx` covers update available, nothing changed, failure and the refusal text.
- [ ] T034 [US3] Add `tests/mesh/dependency-failures.test.ts`: a provider that is trashed or loses the person's access, a pinned object that is gone, and a manifest naming a concept the provider no longer exports each fail closed with their finding and never fall back to current state (FR-032). Proof: the test passes.

## Phase 6: User Story 4 - The compiler produces one self-contained standard ontology (P1)

- [ ] T035 [US4] Create or extend `src/server/tessera/unit-source.ts` (the seam of feature 019; create it with the single-folder reader if 019 is not on the base) so a unit source returns the files, the manifest and the provider snapshots named in it, read from published history only. Proof: `bun test tests/mesh/unit-source.test.ts` covers a unit with no imports (equal to feature 011), a unit with imports in the same repository and in another repository, and a missing object (FR-058).
- [ ] T036 [US4] Extend `src/shared/tessera/compile-unit.ts`: merge parts into each root in the fixed order, include provider closures from the manifest, reject one provider at two versions, qualify and rewrite, drop `tessera_exports` with a loss entry, validate every output with the pinned schema. Proof: `bun test tests/mesh/compile-mesh.test.ts` covers User Story 4 scenarios 1 to 8 on the fixture mesh (FR-051 to FR-056).
- [ ] T037 [US4] Extend `src/shared/tessera/meaning-check.ts` and `src/shared/tessera/loss-report.ts` for the address map and the new report entries, and write bundle manifest version 2 (units, providers, address map) in `src/shared/tessera/compile-unit.ts` and `src/server/tessera/bundle-writer.ts`. Proof: `bun test tests/tessera/meaning-check.test.ts tests/tessera/loss-report.test.ts tests/mesh/compile-mesh.test.ts` pass; an injected change of one imported concept fails the check (FR-054, FR-057).
- [ ] T038 [US4] In `scripts/tessera.ts` and `scripts/tessera-arguments.ts` refuse a project with imports from another repository unless `--data-root` is given, and read same-repository providers from the same commit. Proof: `bun test tests/tessera/cli.test.ts tests/mesh/cli-mesh.test.ts` pass, with the refusal message naming the option (FR-058).
- [ ] T039 [US4] Write golden bundles in `tests/fixtures/tessera/mesh/golden/` and `tests/mesh/determinism.test.ts`: 100 shuffled compiles from different folders give one bundle; every output validates with no notice; compiling a unit without parts or imports equals feature 011's result. Proof: the test passes; changing `COMPILER_VERSION` without regenerating the goldens fails it (SC-003, SC-004).
- [ ] T040 [US4] Write `tests/mesh/compile-refusals.test.ts`: a private dependency, another Ossie base, an undefined translation, a collision after qualification and a changed meaning each fail with no acceptance able to release them. Proof: the test passes and each case fails when its check is removed (FR-054, SC-005).
- [ ] T041 [US4] Scale: `tests/mesh/compile-scale.test.ts` with 200 parts, 20 imports and 20 MB. Proof: `sw-midgard-run -- bun test tests/mesh/compile-scale.test.ts` passes, and the measured time is written into `docs/development.md` (SC-009).

## Phase 7: User Story 5 - A provider's Steward sees who depends on it (P2)

- [ ] T042 [US5] Create `src/server/mesh/dependents-registry.ts` and `state/mesh` in the data layout of `src/server/projects/paths.ts`: derive entries from a published snapshot, update after publication (hook in `src/server/projects/publishing.ts`), remove on project removal (`src/server/projects/trash.ts`), rebuild from published snapshots. Proof: `bun test tests/mesh/dependents-registry.test.ts` covers publish, removal, deletion of the state file followed by rebuild with equal result, and that a proposal or branch import is never listed (FR-041, FR-042, FR-045).
- [ ] T043 [US5] Add `mesh.dependents.read` to `src/server/routes/mesh.ts` with the `publish` action on the provider, an answer identical to a missing page without it, a page of 50 rows, and no counts; add the inventory entry, matrix cases and parity case. Proof: `bun test tests/auth/mesh-parity.test.ts tests/mesh/dependents-read.test.ts` pass for Steward, Admin, Editor and Viewer, including a consumer the Steward cannot read, and a consumer with no domain, and records the measured time for 50 importers in `docs/development.md` against the assumed 200 ms target (FR-043, SC-008, scenarios 1 to 7).
- [ ] T044 [US5] Create `src/app/mesh/DependentsList.tsx` and `DisclosureNotice.tsx`; show the notice in the import editor and in the publish confirmation in `src/app/scm/DefaultBranchActions.tsx`; record in the existing audit record that it was shown. Proof: `bun test tests/mesh/dependents-list.test.tsx` covers empty, loading, error, long names and the notice text (FR-044, FR-046).
- [ ] T045 [US5] Add `tests/mesh/importer-visibility.test.ts`: the dependents answer holds no count, person or request time; no module under `src/server/usage/` (feature 014) reads `state/mesh/`, and no module under `src/server/mesh/` reads the usage store. Proof: the test scans imports and a fixture answer and passes (FR-042; feature 014 FR-030).

## Phase 8: User Story 6 - An author who cannot read the whole set (P2)

- [ ] T046 [US6] Create `src/server/mesh/unit-reader.ts` and `src/server/mesh/set-findings-store.ts`: read a unit as a reader, key set findings by file hashes, dependency snapshot and the access identity from `src/server/auth/authorize.ts`, never share across readers. Proof: `bun test tests/mesh/unit-reader.test.ts tests/mesh/set-findings-store.test.ts` cover a full reader, a partial reader, an access change that misses the key, and no reuse between two people (FR-037, SC-006).
- [ ] T047 [US6] Add the set precondition to `src/server/projects/workspace/document-save.ts` and the publication path: refuse before examining the change, one error type, identical answer for hidden and missing, private draft kept. Proof: `bun test tests/mesh/partial-reader.test.ts tests/auth/mesh-parity.test.ts` show byte-identical answers for hidden and missing parts across read, save, batch save and publish (FR-035, FR-040, SC-006).
- [ ] T048 [US6] Show the reader view: the "set not checked for you" notice in `src/app/validation/ValidationPanel.tsx` and the details, with no hidden name or count. Proof: `bun test tests/mesh/reader-view.test.tsx` covers the notice and the absence of any hidden name.
- [ ] T049 [US6] Prove the provider interface path: a consumer is compiled from the provider's published interface and never receives the provider's private files; access removed in between is applied on the next read (FR-038). Proof: `bun test tests/mesh/interface-access.test.ts` passes.

## Phase 9: User Story 7 - The mesh is visible as a whole (P2)

- [ ] T050 [US7] Create `src/server/mesh/mesh-graph.ts` and the `mesh.graph` route: readable projects with their domain (from the access settings; "No domain" otherwise), published imports between them, hidden ends as unnamed tiles identical to missing ones. Proof: `bun test tests/mesh/mesh-graph.test.ts tests/auth/mesh-parity.test.ts` pass for people with different access (FR-047, FR-048).
- [ ] T051 [US7] Create `src/app/mesh/MeshView.tsx`, `ProjectTile.tsx`, `MeshDetails.tsx`: tiles by domain, labelled arrows, list alternative, selection details with imports and (when allowed) dependents, keyboard use, text alternative; open it from `src/app/workspace/WorkspaceToolbar.tsx`. Proof: `bun test tests/mesh/mesh-view.test.tsx` covers empty, loading, error, partial, long text and keyboard selection (FR-049, FR-050).
- [ ] T052 [US7] Write `scripts/mesh-browser-check.ts` and `"test:mesh"` in `package.json` and `scripts/gate-suites.ts`: with the isolated API helper (`scripts/helpers/isolated-api.ts`), open the unit, add an import, update dependencies, open Mesh and Used by, and assert no layout overlap, no clipped text and no ellipsis at three widths. It never touches the real workspace. Proof: `sw-midgard-run -- bun run test:mesh` passes.
- [ ] T053 [US7] [CODEX] Capture the screens of the Imports section, the import editor, the part picker, the Mesh view, Used by and the disclosure notice in every state, at 1280, 768 and 390 pixels, light and dark, from a fresh worktree of the current main, with a temporary data folder and a spare port. Deliver screenshots, a manifest and a findings file. Proof: the findings file lists no clipped text, no ellipsis and no colour-only meaning; the folder is indexed.
- [ ] T054 [US7] Judge the screenshots of T053 and fix every finding in `src/app/mesh/mesh.css` and the components. Proof: a second Codex capture of the fixed states shows the findings closed.

## Phase 10: User Story 8 - Refusals (P2)

- [ ] T055 [US8] Write `tests/mesh/refusals.test.ts`: every fixture of T004 through the browser validator, the save path, the scanner and the compiler, checking code, path and files named, and that none reaches "not validated". Proof: the test passes and each class fails when its check is removed (SC-005).

## Phase 11: Gate and documentation

- [ ] T056 Mutants: `scripts/mesh-mutants.ts` and `scripts/mesh-mutation-cases.ts` for unit resolution, alias mapping, pin acceptance, manifest checking, reader filtering and qualification; wire into `scripts/mutation-tests.ts`. Proof: `bun scripts/mesh-mutants.ts --list` names every case; the full mutation run is the batch gate's (SC-011).
- [ ] T057 [P] Operation inventory: confirm five new entries, matrix cases and parity cases; regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts` last. Proof: `bun test tests/auth/operation-inventory.test.ts` passes and `git diff --exit-code docs/operations.md` after regeneration.
- [ ] T058 [P] Update `README.md` and `ARCHITECTURE.md`: units, imports, exports, manifest, dependents, Mesh view, `src/server/mesh/`, what is not built (links, composition, organization targets, compatibility, releases). Proof: `bun test tests/mesh/docs-paths.test.ts` finds every path named in the docs.
- [ ] T059 [P] Update `docs/user-guide.md`, `docs/server-mode.md` (partial readers, dependents access), `docs/development.md` (commands, measured scale), `docs/item-addresses.md` (unit addresses, migration on move), `docs/agent-runtime.md` (units as one ontology) and `schemas/README.md`. Proof: the commands in the docs are the ones in `package.json`.
- [ ] T060 [P] Add `CHANGELOG.md` entries under Unreleased naming only behaviour covered by tests. Proof: each entry names a test file.
- [ ] T061 [P] Write the note for the 006 owner (in the pull request description, because `docs/mcp-contract.md` is not on this branch's base): tools read units as files, `validate_text` on a part gives single-file findings and the "set not checked" notice, the five mesh operations are marked "later increment". Proof: the note lists each tool checked and the test that proves it.
- [ ] T062 Run this feature's own proofs: `bun test tests/mesh/ tests/tessera/`, `bun --bun run check`, `sw-midgard-run -- bun --bun run build`, `scripts/check-comments.ts` and the readable-code checker on every changed file. Proof: all exit 0; changed existing tests are listed in the pull request description.
- [ ] T063 Hand off to the batch gate: record that the full unit suite, `bun run test:mutation`, `bun run test:mesh`, `bun run test:tessera`, every other browser suite, the UI regression comparison against the last release (Codex) and the `architecture-reviewer` run once on the integrated batch, who runs each, and that revision numbers and shared files (see the plan) were reconciled with features 016 and 019 at merge. Proof: the pull request description names each item; none is run here.

## Dependencies and order

- Phase 1: T001 and T002 first; T003 to T006 together afterwards.
- Phase 2 follows Phase 1. T007 first; T008 after T007; T009 to T015 in parallel after T007; T010 before T011 and T016; T012 before T016. Phase 2 blocks everything below.
- Phase 3: T017 then T018; T019 after T018; T020, T021 parallel after T018; T022 last.
- Phase 4 follows T018: T023 first, T024 after T013 and T023; T025 after T023; T026 after T025; T027 after T024; T028 last.
- Phase 5 follows Phase 4: T029 after T014 and T023; T030 after T029; T031 after T030 (needs 012's promotion path for its full proof, with the fallback stated); T032 after T030; T033 after T029; T034 last.
- Phase 6 needs T015, T029 and T030: T035 first (extends feature 019's seam when present); T036 after T035; T037 after T036; T038 after T035; T039, T040 after T037; T041 after T039.
- Phase 7 needs T030: T042 first; T043 after T042 and T025; T044 after T043; T045 after T042.
- Phase 8 needs T016: T046 first; T047 after T046; T048 after T047; T049 after T023.
- Phase 9 needs T025 and T043: T050 first; T051 after T050; T052 after T051; T053 after T052; T054 after T053.
- Phase 10 needs Phases 3, 4 and 6.
- Phase 11: T056 after the code exists; T057 after T043 and T050; documentation after Phase 9; T062 and T063 last.

## Parallel execution examples

- After T007: T009, T011 (after T010), T012, T013, T014, T015 together.
- Phase 3 after T018: T020 and T021 together.
- Documentation T058 to T061 together after Phase 9.

## Implementation strategy

1. **MVP**: Phases 1 to 3. Authors split ontologies over files. Stop and review.
2. Add Phases 4, 5 and 6 together: imports are not releasable without the manifest, the publication check and a compile that handles them.
3. Phases 7 to 9 add dependents, partial readers and the Mesh view; Phase 8 can run beside Phase 7.
4. Phase 10 and 11 close the feature and hand the batch to the gate.

## Traceability

| Decision | Requirements | Tasks |
| --- | --- | --- |
| E3: parts need a root, marked documents never take an unvalidated path | FR-001 to FR-004, FR-060, FR-061 | T007 to T010, T017, T055 |
| E10: set validity, partial readers, interface compile | FR-034 to FR-040 | T016, T046 to T049 |
| E11: frozen dependencies, pins, one version, same-repository atomicity, fail closed | FR-025 to FR-033 | T014, T029 to T034 |
| E12: self-contained output, refuse semantic loss | FR-051 to FR-059 | T015, T035 to T041 |
| E13 (self-contained part only) | FR-052, FR-053 | T015, T036 |
| E19: dependents | FR-041 to FR-046 | T042 to T045 |
| E26: allow-list, aliases, include authority, rejects | FR-001 to FR-006, FR-016 to FR-020 | T010, T013, T024 |
| Mesh view and units in the interface | FR-047 to FR-050, FR-064 | T021, T026, T027, T050 to T054 |
| E27 extension point | Out of scope list | T029 ("not judged") |
| Verification gate and process note | SC-005 to SC-012, FR-063 | T052, T055 to T063 |
