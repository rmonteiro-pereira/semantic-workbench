# Handoff: attributes, agent context and governance

Worktree `/home/rodrigo/projetos/semantic-workbench-wt/016-attributes-and-governance`, branch `016-attributes-and-governance`. Nothing is pushed. `bun install --frozen-lockfile` has been run; `node_modules` is not tracked.

## Tasks

Done and ticked: T001 to T028 except those listed below. Ticks are in `tasks.md`.

Not done:
- T029: the script `scripts/attributes-governance-browser-check.ts`, `test:attributes` in `package.json` and `scripts/gate-suites.ts` exist and are committed, but the run does not pass yet. Left unticked.
- T030 ([CODEX]): not started, waits for the integrated batch.
- T031 (mutants in `scripts/tessera-mutants.ts` and `scripts/attributes-mutation-cases.ts`): not started.
- T032 (docs: README, ARCHITECTURE.md, CHANGELOG, `docs/user-guide.md`, `docs/agent-runtime.md`, `docs/item-addresses.md`, `docs/development.md`, `schemas/README.md`): not started. Hooks asked for ARCHITECTURE.md code-map entries for `src/shared/attributes`, `src/app/attributes`, `src/app/agent-context`, `src/app/governance`.
- T033: waits for the MCP server on main.
- T034, T035, T036: last, not started. Also remember the list of existing tests changed (below).

## AttributeRow annotations slot

Exists since commit `c540ff4a` ("Add the attribute row with a slot for marks from other features"), file `src/app/attributes/AttributeRow.tsx`, prop `annotations`.

## Departures from plan.md

- `isAttribute(relationship, lookup)` has no `concept` parameter (it was unused). `attributesOf(concept, concepts, lookup)` takes the concept list for inheritance.
- Details panel wiring needed three files the plan does not list: `src/app/main.tsx`, `src/app/workspace/DetailsPanel.tsx` and a new `src/app/workspace/ItemSections.tsx`; one prop `sections` is threaded down. `src/app/workspace/hooks/useItemEditing.tsx` also changed (built-in relationship targets).
- Ontology items reuse the metric guard path: `GuardedChange.metric` describes the item and `itemKind` marks it; new guard kinds `item-status` and `item-body`; the policy engine sees them as `approveMetric` on docType metric. Classification reuses `classification` and `protected-property`.
- Governance schema checks only types and lengths; status words, extra keys, empty entry and deprecation rules are semantic findings, so one mistake gives one finding. `tessera_ai_context` schema uses `type: [string, object]`, not `oneOf`, for the same reason.
- `replaced_by` of a relationship must name a relationship of the same concept; of a concept, a concept of the document.
- Agent view renames `tessera_ai_context` to `ai_context` and gives each governed item a `governance` object (`status` or `not set`, plus replacement and reason when deprecated). Plans gain `governance` (concepts and governed metrics) and explanations `conceptGovernance`, both absent when empty.
- Relationship rename pre-ticks every found reference in the item editor, and refuses the save when a mapping reference is ambiguous between concepts.
- Path matrix for ontology guards: HTTP cases for the five save paths, delete, move and new-project import; every other operation name (pull, revert, restore, import, switch, publish) is covered at guard level only, not with git fixtures.
- Section writes are blocked while the Source tab has unsaved changes (note shown), because a section save would overwrite them.
- Browser check covers local mode only; no steward or author role split in server mode.
- Reviewer note: an approved item whose status is removed in a save is not guarded, the same as metrics today.

## Existing tests changed (list in the PR description)

`tests/tessera/registry.test.ts`, `validation.test.ts`, `loss-report.test.ts` (report version 2, reserved name `tessera_imports`), `schema-derivation.test.ts`, `tests/helpers/tessera-refusals.ts`, `tests/tessera/agent-and-access.test.ts` (T024), `tests/tessera/tessera-repository.test.ts` (added cases), fixtures `revision-2.yaml` renamed `revision-3.yaml`, `reserved-governance.yaml` renamed `reserved-imports.yaml`, golden `loss-report.json` regenerated (compiler 1.1.0). `specs/011-tessera-format/contracts/loss-report-and-manifest.md` has a note.

## Proofs run (local) and results

- `bun test tests/tessera/` : 492 pass, 0 fail (before later additions).
- `bun test tests/attributes tests/governance` : 121 pass, 0 fail; later added `section-states`, `details-mount`: pass.
- `bun test tests/agent-context-kinds.test.ts tests/agent-runtime.test.ts tests/metric-extension.test.ts tests/model-addresses.test.ts tests/agent-sources.test.ts` : 87 pass, 0 fail.
- `bun test tests/auth/guards.test.ts tests/auth/guard-messages.test.ts tests/auth/guard-inventory.test.ts tests/auth/guards-client.test.ts` : 27 pass.
- `bun --bun run check` : clean at the last code commit. `bun --bun run build` : built (one run, after the mounting commit).
- `git diff --stat 23127bd1 -- src/app/graph` : empty.
- Browser check on midgard (`sw-midgard-run`, vite on port 5421, stopped; no run of mine is active): the desktop 1440 px flow passes through attributes (add, move, edit and rename, remove), governance and context. It fails at 360 px in `attributeFlow`: `dialog.getByLabel('Name')` matches two fields because at phone width the details panel itself is `role="dialog"` and the query hits it too. Fix: scope the query to the Modal, for example `page.locator('dialog[open]').last()`, or `.getByRole('textbox', { name: 'Name', exact: true })`. Then re-run; the revision flow and the 200-concept timing after it have not run yet. Run command: `sw-midgard-run -- bash -c 'bun x vite-plus dev --host 127.0.0.1 --port 5421 --strictPort > /tmp/sw016-vite.log 2>&1 & VITE=$!; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:5421 && break; sleep 1; done; SW_BASE_URL=http://127.0.0.1:5421 bun scripts/attributes-governance-browser-check.ts; STATUS=$?; kill $VITE; exit $STATUS'`. Label queries on selects do not work here; the script uses `fieldOf`.

## Shared-file blocks added

`registry.ts` (three entries in `ADDITIONS`), `reserved-names.ts` (three lines removed), `format.ts` (`SUPPORTED_REVISIONS` `[1, 2]`, `COMPILER_VERSION` 1.1.0), `validate.ts` (import and one call), `bases.ts` (validator 2), `compile-schemas.ts` (schema 2), generated validators and `schemas/tessera-ontology-2-ossie-0.2.0.dev0.json`, `loss-report.ts` (version 2, `statusCounts`), `compile-document.ts` and `compile-unit.ts` (status list), `meaning-check.ts` (attribute check), `guards.ts` (item changes call, demotion), `src/server/auth/guards.ts` (texts), `item-model.ts` (IRI, built-in targets), `references.ts`, `relationship-references.ts`, `ItemEditor.tsx`, `DeleteItem.tsx`, `ValidationPanel.tsx`, `EntityDetails.tsx`, `RelationshipDetails.tsx`, `CatalogView.tsx`, `catalog.css`, `package.json` and `scripts/gate-suites.ts` (one line each). `docs/operations.md` unchanged (no route added); `tests/auth/operation-inventory.test.ts` not yet run (T035).

## Half-designed

- Statuses of items in `status-choices.ts` use the `approveMetric` permission; the owner rule is skipped in local mode.
- `AgentContextPreview` always shows the working-copy wording.

## Exact next task

Fix the 360 px locator in `scripts/attributes-governance-browser-check.ts`, re-run it on midgard until it prints `PASS`, record the measured 200-concept time, tick T029. Then T031, T032, T034, T035, T036; T030 and T033 wait.
