# Tasks: Attributes, Agent Context and Governance in Tessera

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/revision-2-additions.md](./contracts/revision-2-additions.md)

**Prerequisites**: feature 011 (on the base). Nothing else must land first.

Format: `- [ ] ID [P] [Story] Description (paths). Proof: what shows it works.` `[P]` means the task
touches different files from its neighbours. `[CODEX]` means the task is screenshot or browser capture
work handed to Codex. Every task that changes code ends with its targeted test green and the formatter
applied (`bun run fmt` on touched files). No task edits an existing test only to make it pass; each
change to an existing test is listed in the pull request description.

**Process (owner-approved 2026-11-17)**: run only this feature's tests, `bun --bun run check` and
`bun --bun run build`. The full unit suite, mutation tests, every browser suite, the UI regression
comparison and the architecture review run once on the integrated batch (T036). Heavy runs use
`sw-midgard-run -- <command>`.

## Phase 1: Fixtures

- [x] T001 [P] [US7] Write fixture documents in `tests/fixtures/tessera/additions/`: `attributes/` (valid order list, entry not an attribute, repeated entry, list on a relationship, list at revision 1), `ai-context/` (string, object, empty object, text too long, on the ontology root), `governance/` (each status, no status, unknown status, empty object, extra key, `replaced_by` without `deprecated`, missing replacement, a metric with two workbench entries, which the adapter reads as the first), each with a README line naming the expected finding code. Proof: each file parses; `bun test tests/tessera/additions-r2.test.ts` (written in T006) reads the README table.
- [x] T002 [P] [US4] Write the all-additions fixture project in `tests/fixtures/tessera/additions/project/`: one ontology with every addition at every allowed place (order list, context on a concept, a relationship and an attribute, governance with four different statuses and one item with none), a semantic model with a metric in each legacy status, and a mapping naming two relationships. Extend `tests/helpers/tessera-repository.ts` so it can commit this project. Proof: `bun test tests/tessera/tessera-repository.test.ts` shows the commit holds exactly these bytes.

## Phase 2: Format at revision 2 (blocks the rest)

- [x] T003 [US7] Create `src/shared/tessera/additions/attributes.ts`, `ai-context.ts` and `governance.ts` (entries as in the contract, `since: 2`, disposition `drop`, owner "attributes and governance"), add them to `ADDITIONS` in `src/shared/tessera/registry.ts`, remove the three names from `src/shared/tessera/reserved-names.ts`, set `SUPPORTED_REVISIONS` to `[1, 2]` in `src/shared/tessera/format.ts`. The revision number follows the merge order with feature 018 (see plan). Proof: `bun test tests/tessera/registry.test.ts` passes, including the load-time check that no name is both registered and reserved (FR-001 to FR-004).
- [x] T004 [US7] Extend `src/shared/tessera/schema-derivation.ts` and `scripts/derive-tessera-schema.ts` to emit `schemas/tessera-ontology-2-ossie-0.2.0.dev0.json` (additions with `since` at most 2), keep the revision-1 file, wire the new validator in `scripts/compile-schemas.ts`, run `bun run schemas:compile`, commit `src/generated/validators.js` and `validators.d.ts`. Proof: `bun test tests/tessera/schema-derivation.test.ts` regenerates both files in memory and equals them byte for byte; `bun scripts/derive-tessera-schema.ts --check` exits 0.
- [x] T005 [US7] Create `src/shared/tessera/semantic-checks.ts` (order list entries are attributes, distinct and present; `replaced_by` only with `deprecated` and naming an existing item of the same kind; `reason` only with `deprecated`) and call it from `src/shared/tessera/validate.ts` with the codes of the contract. Add fix hints for the new codes in `src/app/validation/ValidationPanel.tsx`. Proof: `bun test tests/tessera/validation.test.ts tests/tessera/validation-panel.test.tsx` cover every fixture of T001 with code, path and position; no file gives two findings for one mistake (FR-007, FR-022).
- [x] T006 [US7] Write `tests/tessera/additions-r2.test.ts`: revision-1 document with a revision-2 name gets the "needs revision 2" finding; revision-2 empty document is valid; the 011 fixtures keep their findings; places per FR-003; the strict-superset test of 011 runs at revision 2. Proof: the test passes together with `tests/tessera/superset.test.ts` and `standard-unchanged.test.ts`.

## Phase 3: Rules for attributes and governance (US1, US2)

- [x] T007 [P] [US1] Create `src/shared/attributes/attribute-rule.ts`: `isAttribute` and `attributesOf` with a `lookup` parameter for concept types (document value types and the eight built-ins from `src/shared/mappings/ossie-builtins.ts`), plus inherited attributes through `extends` with cycle protection. Proof: `bun test tests/attributes/attribute-rule.test.ts` also checks that an attribute's item address equals its relationship's address (FR-006), and covers one role to a value type, to a built-in, to an entity type, two roles, a missing target, an inherited attribute and an `extends` cycle (FR-005, FR-013).
- [x] T008 [P] [US1] Create `src/shared/attributes/attribute-order.ts`: ordered view (listed first, others in file order), and the keep-in-step functions for add, rename and remove that return the new list. Proof: `bun test tests/attributes/attribute-order.test.ts` includes remove and rename updating the list and a document without a list (FR-008, FR-012).
- [x] T009 [P] [US2] Create `src/shared/governance/item-governance.ts`: `governanceOf` and `withGovernance` for ontology items; the metric adapter reading `custom_extensions` through `src/shared/metrics/extension.ts` (read side, first entry wins, a second entry is reported to the section); `statusLabel` with "not set", "draft (older value)" and "unknown value". Proof: `bun test tests/governance/item-governance.test.ts` includes a metric file whose bytes are unchanged after a read, and the three label cases (FR-020, FR-021, FR-029 to FR-031).
- [x] T010 [US2] Create `src/shared/governance/ontology-guards.ts` and call it from `applyGuards` in `src/shared/governance/guards.ts`: approval and deprecation, and a change of owner or steward on an approved item, need an approver; self-approval refused with the case-insensitive owner rule; changing or removing an approved concept, relationship or attribute (except description and notes) refused or demoted; classification and protected-level rules as for data-contract properties. Add the new guard kinds to `GUARD_TEXT` in `src/server/auth/guards.ts`. Proof: `bun test tests/governance/ontology-guards.test.ts` runs the table of `tests/auth/guard-cases.ts` as twin cases for ontology items and both tables give equal outcomes (FR-023 to FR-025; SC-003).
- [x] T011 [US2] Write `tests/governance/ontology-guard-paths.test.ts`: the same unauthorized change through save, batch save, item edit, import, pull, revert, restore, move, publish and an application save is refused, the authorized change succeeds, and the refusal for an unreadable file names neither item nor kind. Use `tests/auth/guard-sources.test.ts` as the model. Proof: the test passes; removing the call added in T010 fails it (FR-026; SC-002).

## Phase 4: Editing defects of decision E18 (US6)

- [x] T012 [P] [US6] Fix `newItem` for kind `concept` in `src/shared/edit/item-model.ts` so a supplied IRI is saved. Proof: `bun test tests/attributes/concept-iri.test.ts` creates a concept with an IRI and reads it back (FR-040).
- [x] T013 [P] [US6] Offer the built-in concepts after the declared ones in the `Choices` used by the relationship target field (`src/shared/edit/item-model.ts`, where `Choices` is built in `src/app/edit/AddItem.tsx` and `ItemEditor.tsx`) and accept them on save. Proof: `bun test tests/attributes/builtin-target.test.ts` saves a relationship to `String` and validates it (FR-041).
- [x] T014 [US6] Extend relationship rename in `src/app/edit/references.ts` (and `relationship-references.ts`) to every reference a person could write: `identify_by`, `requires` and `derived_by` expressions, mapping `relationship` keys through the resolved owner, and the order list of T008. When a reference cannot be rewritten, refuse the save naming it; never touch an unrelated item with the same name. Proof: `bun test tests/attributes/relationship-rename.test.ts` covers each reference kind, a same-name relationship on another concept, and the refusal case (FR-042).

## Phase 5: Attribute editor (US1)

- [x] T015 [US1] Create `src/app/attributes/AttributeRow.tsx` and `attributes.css`: name, type, reading, multiplicity, description, inherited mark, and an `annotations` slot rendered after the text. Wrap all text; no ellipsis. Proof: `bun test tests/attributes/attribute-row.test.tsx` renders long names, an empty slot and a filled slot, and checks no `text-overflow`, no `line-clamp` and no fixed label width (FR-045, FR-047).
- [x] T016 [US1] Create `src/app/attributes/AttributeList.tsx` and `AttributeForm.tsx`: list, add, edit, rename, reorder (move up, move down buttons), remove, using the existing item editor save path; default reading sentence suggestion; read-only state with the reason; empty, loading and error states; the delete confirmation in `src/app/edit/DeleteItem.tsx` says that a concept's attributes go with it. Proof: `bun test tests/attributes/attribute-editor.test.tsx` runs create, rename, reorder and remove against a fixture and compares the saved bytes and the delete confirmation text (FR-009, FR-010, FR-043, FR-049).
- [x] T017 [P] [US1] Create `src/app/attributes/ValueTypeUsage.tsx`: on a value type's details, the attributes that use it with links to their concepts; and the inherited attributes block on a concept. Proof: `bun test tests/attributes/value-type-usage.test.tsx` (FR-011, FR-013).
- [x] T018 [US1] Add the revision confirmation: reordering in a revision-1 document asks to move it to revision 2, and only after consent raises `tessera` and writes the list in one save; refusal leaves the file unchanged. Also the same step for governance and context on an unmarked document, which first offers to mark it Tessera 2. Proof: `bun test tests/attributes/revision-confirmation.test.tsx` (FR-014; US1 scenario 5).

## Phase 6: Governance editor (US2, US5)

- [x] T019 [US2] Create `src/app/governance/GovernanceSection.tsx`, `GovernanceFields.tsx`, `StatusMark.tsx`, `governance.css`: status, owner, steward, classification, deprecation (replacement picker and reason); status control shows only what the person may do; the status mark is a word plus a shape and meets AA in both themes; the edit controls are enabled only while `ONTOLOGY_GUARDS_ACTIVE`, a flag exported beside the rules in `src/shared/governance/ontology-guards.ts`, is true, and otherwise the section is read only with an explanation; `tests/governance/ontology-guard-paths.test.ts` fails if the flag is true while any case of T011 fails (FR-027, FR-046). Proof: `bun test tests/governance/governance-section.test.tsx` covers each status, long reasons, read only and the disabled case.
- [x] T020 [US5] Metric view in the same section: read through the adapter, edit through the existing metric extension writer and the existing guards; viewing writes nothing. Proof: `bun test tests/governance/metric-governance-section.test.tsx` compares file bytes before and after viewing and after one status edit (FR-029, FR-030).

## Phase 7: Agent output (US3)

- [x] T021 [US3] In `src/server/agent/context-assembly.ts` and `context-types.ts`, add `tessera_ai_context` of concepts and relationships as context entries at their item addresses, and a `governance` field (status, replacement, reason) on the items the answer uses. Read only the published snapshot used by the request. Never read owner, steward, classification or notes. Proof: `bun test tests/tessera/agent-context-r2.test.ts` publishes the T002 project, edits the context without publishing, and compares answers before and after for equality (FR-017, FR-037, FR-038; SC-006).
- [x] T022 [US3] Carry the governance flag into `src/server/agent/explain.ts` and `src/server/agent/query-plan.ts` for the concepts and metrics they use, flagging and never excluding non-approved published items. Proof: `bun test tests/tessera/agent-context-r2.test.ts` includes proposed and deprecated items in a plan and an explanation, each with its flag, and an unmarked twin whose output equals the old output apart from the new field (FR-037, FR-039).
- [x] T023 [US3] Create `src/app/agent-context/AgentContextSection.tsx` and `AgentContextPreview.tsx`: three separate fields, a preview of the entry as an agent receives it and the note that only published text reaches agents; the working-copy preview keeps its existing label. Proof: `bun test tests/attributes/agent-context-section.test.tsx` (FR-016, FR-018).
- [x] T024 [US3] Update `tests/tessera/agent-and-access.test.ts` so that it checks notes and the order list never appear in agent output, and add the case that context and the status flag do appear from the published snapshot only. List this change in the pull request description. Proof: the test passes; adding a `tessera_notes` read to `context-assembly.ts` fails it (FR-019).

## Phase 8: Compile and loss (US4)

- [x] T025 [US4] Change `src/shared/tessera/loss-report.ts` to report version 2 with `statusCounts` under the contract, in the digest, absent when no governance is lost; update `contracts/loss-report-and-manifest.md` of 011 with a note pointing here. Proof: `bun test tests/tessera/loss-report-status.test.ts` covers four statuses, no governance, a changed status changing the digest, and no value text in the report (FR-034, FR-035).
- [x] T026 [US4] Add to `src/shared/tessera/meaning-check.ts` the comparison that every attribute relationship is equal in source and output; set the new `COMPILER_VERSION` in `src/shared/tessera/format.ts` and regenerate `tests/fixtures/tessera/golden/`. Proof: `bun test tests/tessera/compile.test.ts tests/tessera/determinism.test.ts` pass with the T002 project; an injected change to an attribute fails the compile and no acceptance overrides it (FR-032, FR-033; SC-004, SC-005).

## Phase 9: Mounting, states and browser check

- [x] T027 [US1] Mount the three sections in `src/app/workspace/EntityDetails.tsx`, `RelationshipDetails.tsx` and `CatalogView.tsx`; leave the graph files untouched (FR-048). Proof: `bun test tests/attributes/details-mount.test.tsx` renders the panels; `git diff --stat src/app/graph` is empty.
- [x] T028 [P] [US1] Write the states and clipping tests for the three sections in `tests/attributes/section-states.test.tsx` (empty, loading, error, read only, long text, phone width class, no ellipsis), following `tests/admin-clipping.test.tsx`. Proof: the test passes (FR-043 to FR-046).
- [x] T029 [US1] Write `scripts/attributes-governance-browser-check.ts` and add `test:attributes` to `package.json` and `scripts/gate-suites.ts`: with the isolated API helper, create, rename, reorder and remove an attribute, set governance in local mode, exercise author and approver permissions through the HTTP guard cases, write agent context, confirm the revision change, at 360 px and desktop, light and dark; assert no overlap, no horizontal page scroll. Use a fixture of 200 concepts for SC-008 and record the measured time. Proof: `bun run test:attributes` passes on the dev server with Vite running.
- [x] T030 [CODEX] [US1] (captured and judged, see captures/findings.md; the reading sentence and input frames are fixed, the comparison with the last release runs in the 021 batch gate) Capture screenshots of the three sections and the attribute flow (empty, populated, error, long text, read only, deprecated item) at desktop and 360 px, light and dark, from a fresh worktree of the current main, and compare the existing screens of the full journey against the last release with the `ui-regression-gate` skill. Deliver an index page and a findings file. Proof: the findings file lists zero unrequested differences (SC-007, SC-010). Runs on the integrated batch, not before.

## Phase 10: Gate, documentation and handoffs

- [x] T031 [P] Add mutants to `scripts/tessera-mutants.ts` and `scripts/attributes-mutation-cases.ts` for: the attribute rule (target type, role count), the revision check, self-approval, approval authority, the demotion rule, the published-only context rule and the status counts; wire in `scripts/mutation-tests.ts`. Proof: `bun scripts/mutation-tests.ts --attributes` runs the new candidates and their cases on the dev server. Every mutant is detected (SC-009). The full mutation run belongs to the batch gate.
- [x] T032 [P] Update `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/user-guide.md` (attributes, agent context, governance, status words), `docs/agent-runtime.md` (context and status flag, published only), `docs/item-addresses.md` (attributes share relationship addresses), `docs/development.md`, `schemas/README.md`. State that classification is a declaration, that accepting loss is not approval and that standard output has no status. Proof: `bun test tests/tessera/docs-paths.test.ts` passes for the files; each documented finding code exists in the contract (FR-050, FR-051, FR-036).
- [x] T033 [US3] Hand off to feature 006 once it is on main: update `docs/mcp.md` and `docs/mcp-contract.md` so the published-context, plan and explanation tools say they carry agent context and the status flag, and run the 006 tool tests with the T002 project. Proof: a tool test returns context entries from the published snapshot only and no owner, steward, classification or note text.
  Done in feature 021: `docs/mcp.md` and `docs/mcp-contract.md` name the fields; `bun test ./tests/mcp/agent-context-tools.test.ts` (4 pass) publishes the T002 project through the tools and finds no owner, steward, classification or note in the context, plan or explanation answers. No leak found.
- [x] T034 Run the tests that name the shared modules touched and record them in the pull request description: `bun test tests/validation.test.ts tests/tessera/ tests/attributes/ tests/governance/ tests/auth/guards.test.ts tests/agent-context-kinds.test.ts tests/agent-runtime.test.ts tests/metric-extension.test.ts tests/model-addresses.test.ts`. Also record the measured validation time of a revision-2 document against revision 1. Proof: all pass and every change to an existing test is listed with its reason in evidence.md.
- [x] T035 Check that route rows are unchanged and the ontology approval binding matches the generated operation reference (`bun test tests/auth/operation-inventory.test.ts`, `bun scripts/operation-inventory-table.ts && git diff --exit-code docs/operations.md`), then `bun --bun run check` and `sw-midgard-run -- bun --bun run build`, and run `scripts/check-comments.ts` and the readable-code checker on changed files. Proof: all exit 0.
- [x] T036 Hand off to the batch gate: record in the pull request description that the full unit suite, `bun run test:mutation`, `test:attributes`, `test:tessera`, `test:validation`, `test:editor`, `test:item-edit`, `test:addresses`, `test:auth`, the remaining browser suites, T030 and the `architecture-reviewer` run once on the integrated batch, and list T033 as open for the 006 owner. Proof: the handoff names each gate item and who runs it. The lane runs only the targeted proofs, check and build authorized for this feature.

## Dependencies and order

- T001 and T002 first (T002 needs T003 to be useful for compile; write it early).
- T003 then T004, T005, T006. Phase 2 blocks Phases 7 and 8; Phases 3 and 4 do not depend on T004.
- T007, T008, T009 are independent. T010 needs T009. T011 needs T010.
- T012, T013 independent. T014 needs T008.
- T015 first in Phase 5; T016 needs T007, T008, T012, T013, T014, T015; T017 needs T007; T018 needs T016.
- T019 needs T009, T010, T011. T020 needs T009.
- T021 needs T003. T022 needs T021. T023 needs T015 only for styles. T024 needs T021.
- T025 needs T003, T009. T026 needs T025, T007, T002.
- T027 needs T016, T017, T019, T023. T028 needs T015, T019, T023. T029 needs T027.
- T030 needs the integrated batch. T031 needs the code it mutates. T032 after commands and codes are stable. T033 needs 006. T034, T035 and T036 last.

## Parallel examples

- After T003: T007, T008, T009, T012 and T013 together.
- After T010: T019 beside T021 to T022.
- T031 and T032 together after Phase 8.

## Implementation strategy

1. MVP: Phases 1 to 3 and 5 (attributes editable, rules in place). Stop and review.
2. Phase 6 only after T011 passes: the editor never ships before its rules (FR-027).
3. Phases 7 and 8 together: agents and standard output change in one release.
4. Phase 4 can ship first as a bug fix if wanted.

## Traceability

| Decision or finding | Requirements | Tasks |
|---|---|---|
| E17 governance, guards before editor | FR-020 to FR-031 | T009, T010, T011, T019, T020 |
| E18 attributes, defects | FR-005 to FR-014, FR-040 to FR-042 | T007, T008, T012 to T018 |
| E5 published-only agents; E16 flags | FR-015 to FR-019, FR-037 to FR-039 | T021 to T024 |
| E15 loss and status counts; E12 no folding | FR-032 to FR-036 | T025, T026 |
| 011 registry, revisions | FR-001 to FR-004 | T003 to T006 |
| UI rules | FR-043 to FR-049 | T015, T016, T019, T027 to T030 |
| Documentation | FR-050, FR-051 | T032 |
| MCP handoff | FR-037 | T033 |
