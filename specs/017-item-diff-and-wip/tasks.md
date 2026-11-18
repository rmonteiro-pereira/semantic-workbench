# Tasks: Item Diff and Work-in-Progress Overlay

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/items-diff.md](./contracts/items-diff.md)

**Prerequisites**: feature 011 (Tessera format) is on the base. Feature 009 (item addresses) and 010 (operation
boundary) are on the base. Nothing waits for 012, 014 or 016; see "What can start now" in the plan.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task touches
different files from its neighbours and may run in parallel. `[CODEX]` means the task is screenshot or
visual-comparison work handed to Codex. Every task that changes code ends with its own targeted test green and
the formatter applied (`bun run fmt` on touched files). No task edits an existing test only to make it pass; a
change to an existing test is listed in the pull request description.

**Process (owner-approved 2026-11-17)**: during implementation run only the feature's own tests,
`bun --bun run check` and `bun --bun run build`. The full unit suite, mutation tests, every browser suite, the
UI regression comparison against the last release and the architecture review run once on the integrated batch
(T042). Heavy runs use `sw-midgard-run -- <command>`.

## Phase 1: Record the base and build fixtures (before any change under `src/`)

- [x] T001 [P] [US1] Write `tests/helpers/item-diff-repository.ts` and fixtures in `tests/fixtures/item-diff/`: a temporary Git repository with a project holding one ontology (concepts, relationships, two attributes), one semantic model and address migration records; a builder for the second state with each change of User Story 1 (added concept, workbench rename, outside rename, changed attribute target, removed concept, comment-only edit, key reorder, CRLF change, unparsable file, ambiguous name). Proof: `bun test tests/item-diff/repository.test.ts` shows both states hold the intended bytes.
- [x] T002 [US2] Record the baseline before any change under `src/`: add `scripts/record-item-diff-baseline.ts`, run it on unchanged code to write `tests/fixtures/item-diff/baseline.json` holding (a) the rendered DOM structure of the full graph, neighbourhood graph, entity details, relationship details, catalog and publish step for the fixture project, and (b) the agent context, plan and explanation answers for the fixture with unpublished definitions. Commit it alone. Proof: `bun test tests/item-diff/baseline.test.ts` passes on the base commit.

## Phase 2: The comparison (pure, blocks everything below) (FR-001 to FR-011)

- [x] T003 [P] [US1] Create `src/shared/item-diff/sides.ts`: `SIDE_NAMES`, `parseSide(text)` for `published`, `working`, `branch:<name>`, `commit:<id>` (full id only), and a registry function so a later feature registers one more side (FR-013, FR-035). Proof: `bun test tests/item-diff/sides.test.ts` covers each side, an unknown name (refused with the list), an abbreviated commit id, an empty branch name, a branch name with `..`, and a registered extra side.
- [x] T004 [P] [US1] Create `src/shared/item-diff/item-change.ts` (types) and `src/shared/item-diff/bounds.ts` (item, byte and value limits from the plan's defaults table, with the "omitted" count) (FR-011). Proof: `bun test tests/item-diff/bounds.test.ts` covers cutting at the item limit, the byte limit and a long value, and that the count of omitted items is exact.
- [ ] T005 [P] [US1] Create `src/shared/item-diff/attribute-kind.ts`: one function that says whether a relationship is an attribute (one other role, target a value type or a built-in) (FR-003). Proof: `bun test tests/item-diff/attribute-kind.test.ts` covers a value-type target, a built-in target, an entity target, two roles and a relationship without roles.
- [x] T006 [US1] Create `src/shared/item-diff/field-changes.ts`: compare two item data objects ignoring comments, key order, whitespace and line endings; name each changed field; bound values; name a changed Tessera addition as a field of its item (FR-006, FR-007). Proof: `bun test tests/item-diff/field-changes.test.ts` covers each ignored difference (zero fields), a changed description, a changed `tessera_notes`, and a changed `extends`.
- [x] T007 [US1] Create `src/shared/item-diff/compare-items.ts`: pair items by address, apply recorded migrations (one changed item with `previousAddress`), report ambiguous addresses without matching, add, remove, change; sort by file path, kind, address (FR-001, FR-004, FR-005, FR-008, FR-010). Proof: `bun test tests/item-diff/compare-items.test.ts` covers every state, a recorded rename (one changed), an unrecorded rename (remove plus add), a move between documents, ambiguous names, nameless items by position, and that no pairing uses name similarity.
- [x] T008 [US1] Write `tests/item-diff/no-noise.test.ts` and `tests/item-diff/tessera-items.test.ts`: every ontology, model and contract under `public/examples/` compared with a copy whose comments, key order, whitespace and line endings are changed gives zero changes (SC-003); a Tessera document and its additions give no item for an addition (FR-007). Proof: both tests pass.
- [x] T009 [US1] Write `tests/item-diff/determinism.test.ts`: the same two states presented in shuffled file order give byte-identical answers, 100 times. Proof: the test passes (SC-001, FR-010).

**Checkpoint**: two item lists can be compared as a pure function.

## Phase 3: The operation (FR-012 to FR-016)

- [x] T010 [US1] Create `src/server/projects/item-diff-sides.ts` for `published` (through the published snapshots and `SNAPSHOT_LIMITS`) and `working` (through the working copy reader; the project folder in local mode, the personal copy on a server). Return documents, the version label and files that could not be read. Proof: `bun test tests/item-diff/sides-published-working.test.ts` covers no published commit, a moved published commit (the answer names the commit it used), an over-limit file (refused before contents are read) and unsaved drafts being absent.
- [x] T011 [US3] Extend `src/server/projects/item-diff-sides.ts` for `branch:<name>` and `commit:<id>` using `lsTree` and `catFileBatch` with the same limits, a commit that is an object of the repository only through a branch the caller may see. Proof: `bun test tests/item-diff/sides-branch-commit.test.ts` covers a visible branch, a commit on it, a commit reachable only from someone else's personal branch (treated as missing), and a branch deleted between two calls.
- [x] T012 [US1] Create `src/server/auth/item-diff-access.ts`: decide whether the caller may read a side (own personal branch or default branch through `branchShownTo`, file view of the reader), one outcome for hidden, unreadable and missing; drop items of unreadable files without trace (FR-014, FR-015). Proof: `bun test tests/item-diff/access.test.ts` covers each outcome and that the refusal bytes are equal for hidden and missing.
- [x] T013 [US1] Create `src/server/projects/item-diff.ts`: read both sides, parse with the shared parser, `addressesOfModel`, `readAddressMigrations`, call `compareItems`, add `notCompared` and the versions (FR-009, FR-016). Proof: `bun test tests/item-diff/service.test.ts` runs every change of the T001 repository and checks the answer against `tests/fixtures/item-diff/expected/`.
- [ ] T014 [US1] Create `src/server/routes/item-diff.ts` for the contract: query parsing, refusals (`400` unknown side, `404` hidden/unreadable/missing), the answer. Proof: `bun test tests/item-diff/route.test.ts` covers the contract's answer shape and every refusal.
- [ ] T015 [US1] Add the inventory and authorization rows: `src/server/auth/route-actions.ts` (one row, action `history`, read source `editing`), `policies/operation-inventory.json` and `schemas/semantic-workbench-operations-v1.json` (entry `items.diff`, dispatch browser-only, exposure never with the reason in the contract), `policies/matrix-cases.json`, `tests/auth/route-actions.ts`; regenerate `docs/operations.md` with `bun scripts/operation-inventory-table.ts`. Proof: `bun test tests/auth/operation-inventory.test.ts` passes and `git diff --exit-code docs/operations.md` is clean after regeneration.
- [ ] T016 [US1] Register `itemDiffRoutes` in `src/server/handler.ts`. Proof: `bun test tests/item-diff/route.test.ts` runs through the handler.
- [ ] T017 [US1] Write `tests/auth/item-diff-parity.test.ts`: the route over HTTP and through `operate` compare status, normalized body and audit record for a reader, an editor, a role without read of one file, and a person without project access. Proof: the table passes; removing the file-view filter makes the unreadable-file case fail.
- [ ] T018 [US5] Write `tests/item-diff/application-caller.test.ts`: an application (agent) caller is refused, no agent answer changes (`tests/fixtures/item-diff/baseline.json` part b equals the recomputed answers with unpublished definitions on a branch) (FR-012, FR-030, SC-007). Proof: the test passes; making the route available to applications makes it fail.

**Checkpoint**: the diff can be read over HTTP. MVP of the data.

## Phase 4: User Stories 1 and 2, the overlay (FR-017 to FR-023, FR-033, FR-034, FR-036)

**Independent Test**: `bun scripts/item-diff-browser-check.ts` against the isolated API helper.

- [ ] T019 [US2] Add `fetchItemDiff` to `src/app/projects/api.ts` and create `src/app/item-diff/use-item-diff.ts`: loads `published` against `working`, states (off, loading, error, empty, ready, partial), refresh on save, branch switch and publish, first request only when the existing source-control status says the branch has unpublished changes or the person turns the overlay on; with no published state the overlay stays off until turned on and then marks every item as added. Proof: `bun test tests/item-diff/use-item-diff.test.tsx` covers each state and that no request is made when off.
- [ ] T020 [P] [US2] Create `src/app/item-diff/ChangeMark.tsx` and `src/app/item-diff/item-diff.css`: text label, dashed outline, grey surface from tokens, wrapping text, light and dark. Import the stylesheet where feature styles are imported (`src/app/style.css`). Proof: `bun test tests/item-diff/change-mark.test.tsx` checks the three labels, the dashed class, that the label is text, and returns null for no change.
- [ ] T021 [US2] In `src/app/graph/full-node-data.ts` add the optional `change` field to node data and one case to `reservedNameHeight`; create (or reuse, when 016 has landed) the annotation slot on entity cards in `FullGraphNodes.tsx` and `NeighborhoodGraph.tsx` (FR-036). Proof: `bun test tests/item-diff/graph-data.test.ts` checks that data without `change` is byte-equal to the T002 baseline and that the outer card size does not change.
- [ ] T022 [US2] Wire the overlay into the full graph and the neighbourhood graph: marks on cards, removed items drawn at their published place with their edges, nothing hidden or disabled (`src/app/graph/FullGraph.tsx`, `NeighborhoodGraph.tsx`, `useNeighborhoodNodes.ts`, `useFullGraphLayout.ts`) (FR-018, FR-019, FR-022). Proof: `bun test tests/item-diff/graph-overlay.test.tsx` covers added, changed and removed cards and that all published items and actions remain.
- [ ] T023 [US2] Mark relationship edges: dashed route style and label suffix in `src/app/graph/RelationshipEdge.tsx` and `src/app/graph/edge-styles.ts`. Proof: `bun test tests/item-diff/edge-overlay.test.tsx` checks the label text and the dashed style for each state.
- [ ] T024 [US2] Mark detail panels and lists: `src/app/workspace/EntityDetails.tsx`, `RelationshipDetails.tsx` (attribute rows use these until 016 adds its row component; when 016 has landed, place the mark in its annotation slot), `CatalogView.tsx` (FR-018). Proof: `bun test tests/item-diff/details-overlay.test.tsx` covers entity, relationship, attribute and list rows.
- [ ] T025 [US2] Create `src/app/item-diff/OverlayControl.tsx` and mount it in `src/app/graph/GraphOptions.tsx` and `CompactControls.tsx`: on and off, branch followed, published commit, counts, explanation when nothing is unpublished (FR-023). Proof: `bun test tests/item-diff/overlay-control.test.tsx` covers all states, that the branch name changes after a switch and that a moved or removed branch is reported in words.
- [ ] T026 [US1] Create `src/app/item-diff/ChangeList.tsx` and open it from the overlay control: grouped by kind, changed fields as "field: before, after", the "N more items are not shown" line, files not compared (FR-033). Proof: `bun test tests/item-diff/change-list.test.tsx` covers empty, loading, error with retry, partial, long text and the omitted line.

## Phase 5: User Story 3, branching (FR-024 to FR-027)

- [ ] T027 [US3] Create `src/app/item-diff/BranchControl.tsx` and mount it in `EntityDetails.tsx` and `RelationshipDetails.tsx`: the current branch name, and for editors "Start a branch for this item", which opens the create dialog of `src/app/scm/BranchPicker.tsx` with a suggested name made from the item name and the existing switch operation (FR-024, FR-025). Proof: `bun test tests/item-diff/branch-control.test.tsx` covers editor, read-only person, invalid and used names (message in words, input kept), and a branch held by another copy.
- [ ] T028 [US3] Let the `BranchPicker` create dialog take a suggested name without changing its other behaviour (`src/app/scm/BranchPicker.tsx`). Proof: the existing `BranchPicker` test, named in the pull request description, passes unchanged, and a new case covers the suggestion.
- [ ] T029 [US3] Write `tests/item-diff/no-push.test.ts`: starting and switching a branch from the control issues no push request and the overlay recomputes after a switch (FR-025, FR-027). Proof: the test passes; adding a push call to the control makes it fail.
- [ ] T030 [US3] Add the branch journey to `scripts/item-diff-browser-check.ts` (see T034): start a branch from an entity, a relationship and an attribute, edit, read the overlay, switch back. Proof: covered by T034's run.

## Phase 6: User Stories 4 and 5, review and planner

- [x] T031 [P] [US5] In `src/app/mappings/QueryComposer.tsx` show "Not approved" with the status for a governed metric whose status is not approved, and "Status not set" when absent, read from the metric definition already in the runtime context; no server change (FR-031). Proof: `bun test tests/item-diff/planner-flag.test.tsx` covers approved, proposed, draft, deprecated and absent status.
- [ ] T032 [US4] Create `src/app/item-diff/PublicationReview.tsx` and mount it above the confirm control in `src/app/scm/DefaultBranchActions.tsx`: counts by kind, the list, empty text, a notice for files not compared, bounded list; publishing unchanged (FR-028, FR-029). Proof: `bun test tests/item-diff/publication-review.test.tsx` covers changes, none, a comparison failure (publish still enabled) and a large change.
- [ ] T033 [US5] Write `tests/item-diff/agent-unchanged.test.ts`: with unpublished definitions on a branch and the overlay on, agent context, plan and explanation answers equal the T002 baseline byte for byte (FR-030, SC-007). Proof: the test passes.

## Phase 7: Browser, visual and mutation proofs

- [ ] T034 [US2] Write `scripts/item-diff-browser-check.ts` and add `"test:item-diff"` to `package.json` and `scripts/gate-suites.ts`. It uses `scripts/helpers/isolated-api.ts`, never touches the real workspace, and checks: overlay off equals the T002 DOM baseline; overlay on shows the three labels; no colour-only mark, no clipped text, no overlap; light, dark, phone width; the branch journey; the publish review. Proof: `sw-midgard-run -- bun run test:item-diff` passes.
- [ ] T035 [CODEX] [US2] Capture screenshots of the overlay (added, changed, removed, empty, loading, error, long names) in light, dark and phone width, and of the branch control and the publication review, from a fresh worktree of this branch with a temporary data folder and a spare port; write them with a manifest and a findings file. Do not touch the real `data/` or running ports. Proof: Codex's result file lists every state; the findings are read here and fixed or recorded.
- [ ] T036 [P] [US1] Create `scripts/item-diff-mutants.ts` and `scripts/item-diff-mutation-cases.ts` for side selection, address matching, migration handling and the authorization of sides, and wire them in `scripts/mutation-tests.ts`. Proof: `bun scripts/item-diff-mutants.ts` is runnable; the full run is the batch gate's.
- [ ] T037 [P] [US2] Add a contrast test `tests/item-diff/contrast.test.ts` that computes the contrast of every mark colour pair from the theme tokens in both themes (SC-006). Proof: the test passes at 4.5 to 1 for text and 3 to 1 for outlines.

## Phase 8: Documentation and hand-off

- [ ] T038 [P] Write `docs/item-diff.md` (sides, answer, limits, the display-aid statement, renames, what is not compared) and update `docs/user-guide.md` (overlay, change list, branch control, publication review), `docs/graph-design.md` (the mark and the annotation slot), `docs/item-addresses.md` (diff uses recorded migrations), `docs/development.md` (`test:item-diff`). Proof: `bun test tests/item-diff/docs-paths.test.ts` checks that every path and command in the docs exists.
- [ ] T039 [P] Update `README.md`, `ARCHITECTURE.md` and `CHANGELOG.md` (Unreleased, Added). State that the overlay is not access control and that an agent-facing diff does not exist. Proof: the entries name only behaviour covered by tests.
- [ ] T040 Measure and record: the diff of a 2,000-item fixture and the overlay overhead on a 500-entity graph with `sw-midgard-run -- bun scripts/item-diff-measure.ts` (new, small), and write the measured numbers in `docs/item-diff.md` next to the assumed ones (SC-008). Proof: the script prints both numbers; the doc names them as measured with the date and machine.
- [ ] T041 Run the feature's own proofs: `bun test tests/item-diff/ tests/auth/item-diff-parity.test.ts tests/auth/operation-inventory.test.ts`, `bun --bun run check`, `sw-midgard-run -- bun --bun run build`, `scripts/check-comments.ts` and the readable-code checker on every changed file. Proof: all exit 0; the changed existing tests (T028) are in the pull request description.
- [ ] T042 Hand off to the batch gate: record in the pull request description that the full unit suite, `bun run test:mutation`, `bun run test:item-diff`, every other browser suite, the UI regression comparison against the last release (Codex, full journey including every graph stage) and the `architecture-reviewer` run once on the integrated batch; list for feature 012 the follow-up that registers `proposal` in `src/shared/item-diff/sides.ts` and swaps its review to `ChangeList`; list for feature 006 the `items.diff` not-exposed row. Proof: the description names each gate item and who runs it; none is run here.

## Dependencies and order

- T001 and T002 first. T002 is committed alone before any change under `src/`.
- Phase 2: T003, T004, T005 in parallel; T006 needs T004 and T005; T007 needs T003, T004, T006; T008 and T009 need T007.
- Phase 3: T010 needs T003; T011 needs T010; T012 needs T003; T013 needs T007, T010, T011, T012; T014 needs T013; T015 and T016 need T014; T017 and T018 need T015 and T016.
- Phase 4: T019 needs T016; T020 can start with Phase 2; T021 needs T020; T022 needs T019, T021; T023 needs T020 and T019; T024 needs T020 and T019; T025 needs T019; T026 needs T019.
- Phase 5: T027 needs T019, T025; T028 before T027; T029 needs T027.
- Phase 6: T031 has no dependency; T032 needs T019 and T026; T033 needs T018.
- Phase 7: T034 needs Phases 4 to 6; T035 needs T034; T036 needs Phase 3; T037 needs T020.
- Phase 8: T038 and T039 after the behaviour is stable (after T034); T040 needs T022; T041 and T042 last.

## Parallel execution examples

- After T002: T003, T004, T005 and T020, T031 together (different files).
- After T014: T015 with T019.
- After Phase 4: T036, T037, T038 together.

## Implementation strategy

1. **MVP**: Phases 1 to 3. The diff is readable over HTTP and proven. Stop and review.
2. Phase 4 next: the overlay is the owner's main request. Phase 5 and Phase 6 follow in either order.
3. Phase 7 and 8 close the feature and hand the batch to the gate.

## Traceability

| Decision or requirement | Requirements | Tasks |
| --- | --- | --- |
| E6: addresses and migrations decide renames | FR-001, FR-004, FR-005 | T007, T013 |
| E18: attributes are relationships | FR-003 | T005, T024 |
| E5: agents see only published | FR-012, FR-030 | T002, T018, T033 |
| E7: no push of unpublished work | FR-025, FR-027 | T029 |
| E16 and owner: planner may show non-approved metrics | FR-031 | T031 |
| Display aid, not access control | FR-022, FR-032 | T022, T038 |
| Hidden branch equals missing | FR-014, FR-015 | T011, T012, T017 |
| Overlay readable, not colour alone | FR-018, FR-020, FR-033 | T020, T034, T035, T037 |
| Off equals unchanged | FR-021 | T002, T021, T034 |
| Publication review | FR-028, FR-029 | T032 |
| Side extension for 012 | FR-035 | T003, T042 |
| Shared annotation slot | FR-036 | T021, T024 |
| Bounded answer | FR-011 | T004, T014 |
| Branch UI on items | FR-024, FR-026 | T027, T028 |
| Interface states | FR-033, FR-034 | T019, T026, T034 |
