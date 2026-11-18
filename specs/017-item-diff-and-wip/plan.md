# Implementation Plan: Item Diff and Work-in-Progress Overlay

**Branch**: `016-format-specs` (documents) | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

## Summary

Add one pure comparison of two states of a project, one read operation that serves it, a graph and
detail overlay that draws the result greyed, a branch control on items that reuses the existing branch
operations, a publication review in the publish step, and a flag for non-approved metrics in the browser
planner view.

1. **Pure comparison** in a new `src/shared/item-diff/` folder: takes two lists of addressed items (from
   `addressesOfModel`) plus the recorded address migrations and returns item changes. No I/O.
2. **A server module** `src/server/projects/item-diff-sides.ts` that reads one named side (`published`,
   `working`, `branch:<name>`, `commit:<id>`) into documents, and a route `src/server/routes/item-diff.ts`
   that serves `GET /api/projects/:slug/item-diff?from=<side>&to=<side>` through the operation boundary.
3. **Interface**: one hook that loads the diff of `published` against `working`, a mark component and one
   optional `change` field on graph node and edge data, an overlay control, a branch control in the details
   panels, and a review list in the publish step.

## Technical Context

**Language/Version**: TypeScript on Bun 1.4, React 19.

**Primary Dependencies**: none new. Existing: `addressesOfModel` (`src/shared/core/model-addresses.ts`),
`readAddressMigrations` (`src/server/projects/address-migrations.ts`), `createGit` with `lsTree` and
`catFileBatch` (`src/server/projects/git.ts`), `createSnapshotIndexes` and the published snapshots
(`src/server/projects/snapshot-index.ts`, `published-snapshot.ts`), `@xyflow/react` graph.

**Storage**: each project carries its address migration history in Git. Diffs are computed per request.

**Testing**: `bun test tests/item-diff/` (new), `tests/auth/item-diff-parity.test.ts`, the existing
`tests/auth/operation-inventory.test.ts`, one browser check `scripts/item-diff-browser-check.ts`, mutants in
`scripts/item-diff-mutants.ts`.

**Constraints**: nothing changes for an agent; nothing changes with the overlay off; no push; Git-backed
address history; text never clipped; files near 400 lines, functions near 40.

**Scale/Scope**: about 12 new source files, 10 test files, 1 contract.

## Defaults and where they come from

None came from a measurement unless the table says so.

| Name | Default | Source |
|------|---------|--------|
| Document size read per side | 2,000,000 bytes | existing (`SNAPSHOT_LIMITS.documentBytes`) |
| Files read per side | 10,000 | existing (`SNAPSHOT_LIMITS.projectFiles`) |
| Total bytes read per side | 64,000,000 | existing (`SNAPSHOT_LIMITS.totalBytes`) |
| Items in one answer | 2,000 | assumed; a page of changes a person can scroll |
| Value length shown per field | 500 characters | assumed |
| Bytes in one answer | 2,000,000 | existing: the response limit used for large reads |
| Address migrations read | 50,000 | existing (`ADDRESS_MIGRATION_LIMIT`) |
| Diff time target | 1 second for 2,000 items per side | assumed; recorded by task T040 |
| Overlay cost target | at most 10 percent over graph time | assumed; recorded by task T040 |
| Overlay refresh | on save, on branch switch, on publish | assumed |
| Contrast | 4.5 to 1 text, 3 to 1 outlines | WCAG 2.1 AA |

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Both modes. Published means the committed snapshot of the default branch. `working` is the person's own copy: the project folder in local mode, the personal copy on a server. No network call. No push. |
| II. Byte-Exact Source Preservation | The comparison reads and writes no source. Branch start uses the existing operations. |
| III. One Validation Rule Set | Items come from the shared parser and `addressesOfModel`, the same code as the editor and agents. A file that does not parse is listed, not guessed. |
| IV. Atomic, Hash-Checked File Persistence | No state is added. |
| V. Pinned Official Standards | Nothing about Ossie schemas changes. Tessera additions are read through the shared reader and never become items. |
| VI. Verification Gate | New decisions (side choice, address matching, authorization of sides) get mutants. A new route gets an inventory row, a matrix case and a parity test. Browser check for the interface. The feature runs its own tests, `check` and `build`; the batch gate runs the rest. |
| VII. Honest Claims | Docs say the overlay is a display aid and not access control, that unpublished work stays in the workbench by application guarantee, and that renames outside the workbench are remove plus add. |
| VIII. Readable Code | One folder per concept, domain names, no spec IDs in comments. |
| Technical Constraints | One operation boundary: the route is in the inventory. No new dependency. |

Complexity Tracking is empty.

## Design

### Modules

| Module | Concept | Holds |
| --- | --- | --- |
| `src/shared/item-diff/sides.ts` | The names of sides | `parseSide`, `SIDE_NAMES`, a registry that 012 extends with `proposal` |
| `src/shared/item-diff/item-change.ts` | The answer types | `ItemChange`, `ItemDiff`, `FieldChange` |
| `src/shared/item-diff/compare-items.ts` | Pairing and state | match by address, apply migrations, ambiguous, added, removed, changed |
| `src/shared/item-diff/field-changes.ts` | What changed in one item | compares item data without comments, key order or whitespace; bounded values; Tessera additions named as fields |
| `src/shared/item-diff/attribute-kind.ts` | Attribute or relationship | the one rule of decision E18 for display |
| `src/shared/item-diff/bounds.ts` | Limits | item, byte and value limits and the "not shown" count |
| `src/server/projects/item-diff-sides.ts` | Reading a side | resolves a side to documents and a version label; reuses published snapshots, the working copy reader and `lsTree`/`catFileBatch` |
| `src/server/projects/item-diff.ts` | The service | reads both sides, parses with the shared parser, reads migrations, calls the comparison |
| `src/server/auth/item-diff-access.ts` | Who may read a side | composes the reader's file view and `branchShownTo`; one answer for hidden and missing |
| `src/server/routes/item-diff.ts` | The route | parses the query, calls the service, returns the contract answer |
| `src/app/item-diff/use-item-diff.ts` | Loading | loads `published` against `working`, states, refresh on save, switch and publish |
| `src/app/item-diff/ChangeMark.tsx` | The mark | text label, dashed outline, grey treatment, from tokens |
| `src/app/item-diff/OverlayControl.tsx` | The control | on and off, branch name, published commit, counts |
| `src/app/item-diff/ChangeList.tsx` | The list | grouped by kind, with changed fields, wrapped text |
| `src/app/item-diff/BranchControl.tsx` | The branch action | shows the branch, starts and switches through the existing dialogs |
| `src/app/item-diff/PublicationReview.tsx` | The review | counts and list inside the publish step |
| `src/app/item-diff/item-diff.css` | Layout | tokens only |

### Flow of one diff

1. The browser calls `GET /api/projects/:slug/item-diff?from=published&to=working`.
2. The boundary authorizes it as a project read, as `git.diff` is, and runs the handler.
3. `item-diff-access.ts` resolves each side. A personal branch of someone else, an unreadable side and a
   missing side give the same refusal (`404`, same body).
4. `item-diff-sides.ts` reads the documents of each side, limited by the snapshot limits, filtered by the
   reader's file view. Items of unreadable files are never read.
5. `item-diff.ts` parses each document with the shared parser, takes addresses with `addressesOfModel`, reads
   `readAddressMigrations`, and calls `compareItems`.
6. The answer holds the version used for each side and the changes, in the contract's order.

### Patterns used

- **Registry of sides**: one table of side names and their readers. Problem: feature 012 adds
  `proposal:<id>` and must not edit the comparison.
- **Functional core, I/O at the edge**: the comparison is a pure function over items; Git and files are read
  only in `src/server/projects/`. Problem: the same comparison must run in the server and in tests, and
  later in an agent tool.

### Interface

The visual language is the existing one: tokens `--color-accent`, `--color-border`, `--color-text-muted` and
the status tokens used for errors only, the graph options and compact controls styles, the legend pattern of
`src/app/graph/LineageLegend.tsx`.

- **Mark**: a dashed outline (2px, token border colour that meets 3 to 1 on both themes), a lowered
  saturation of the card (a grey surface token, never an opacity that lowers text contrast), and a text label
  "Not published: added", "Not published: changed" or "Not published: removed" shown as a small row inside
  the card for entities and attributes and as the edge label suffix for relationships. The outer size of a
  card does not change: the label takes a fixed strip inside the card (`reservedNameHeight` in
  `src/app/graph/full-node-data.ts` gains one case), so the name of a marked card may use a smaller font
  size, as it already does for cards with a hint row. Labels wrap in details panels.
- **Removed items** are drawn from the published side's layout with a dashed outline and the label;
  their edges to existing items are drawn dashed.
- **Overlay control** sits in `GraphOptions.tsx` and in `CompactControls.tsx` on phone width. It names the
  branch, the published commit and the counts, in words.
- **Change list**: grouped by kind; each row shows the item name, the label, the address and the changed
  fields as "field: before, after" in wrapped text. States: empty ("Nothing is unpublished on this branch."),
  loading (a placeholder of the same height), error with Retry, partial (files not compared are named), and a
  "N more items are not shown" line.
- **Branch control**: in `EntityDetails.tsx` and `RelationshipDetails.tsx` (attribute rows use the
  relationship details), a line "On branch <name>" and a button "Start a branch for this item" that opens the
  existing create-branch dialog of `BranchPicker.tsx` prefilled with a suggested name made from the item name.
- **Publication review**: a section above the confirm control in `DefaultBranchActions.tsx`.
- **Planner flag**: `QueryComposer.tsx` shows "Not approved" with the status next to a governed metric whose
  status is not approved; "Status not set" when absent.
- Long names wrap. Phone width stacks the list under the graph. Light and dark come from tokens.

How "off equals unchanged" is proven: with the overlay off or no change, the components return null and add no
class, node, request or legend. The first request is made only when the existing source-control status says the branch has unpublished
changes, or when the person turns the overlay on. The browser check compares the DOM structure with a recorded baseline taken before the change,
and the batch's UI regression comparison against the last release covers the journey.

### Contract

[contracts/items-diff.md](./contracts/items-diff.md): query, sides, answer shape, refusals, ordering, limits.

## Project Structure

### Documentation (this feature)

```text
specs/017-item-diff-and-wip/
├── spec.md
├── plan.md
├── tasks.md
└── contracts/items-diff.md
```

### Source Code (repository root)

```text
src/shared/item-diff/{sides,item-change,compare-items,field-changes,attribute-kind,bounds}.ts
src/server/projects/{item-diff-sides,item-diff}.ts
src/server/auth/item-diff-access.ts
src/server/routes/item-diff.ts
src/app/item-diff/{use-item-diff.ts,ChangeMark.tsx,OverlayControl.tsx,ChangeList.tsx,BranchControl.tsx,PublicationReview.tsx,item-diff.css}
scripts/{item-diff-browser-check,item-diff-mutants,item-diff-mutation-cases}.ts
tests/item-diff/*.test.ts, tests/auth/item-diff-parity.test.ts
tests/helpers/item-diff-repository.ts
tests/fixtures/item-diff/   # two-state projects, migration records, expected answers
```

## Files this feature owns

The provenance phase also owns the existing address history store and its callers in document
save, file move, reconciliation, trash and restore, and the SCM paths that settle records with
definition changes, and the export check for hidden endpoints. See [the provenance decision](research.md).

Every path in the block above, plus `docs/item-diff.md`.

## Shared files it touches

| File | Change | Also touched by |
|---|---|---|
| `src/server/auth/route-actions.ts` | one row `GET /api/projects/:slug/item-diff` with action `history` and `readSource: 'editing'` | 012, 013, 014, 015 (a block each) |
| `policies/operation-inventory.json`, `schemas/semantic-workbench-operations-v1.json` | entry `items.diff`, `dispatch` browser-only, exposure `never` with a reason | 012, 013, 014, 015, 019 |
| `policies/matrix-cases.json`, `tests/auth/route-actions.ts` | cases for the new row | all |
| `docs/operations.md` | regenerated by `bun scripts/operation-inventory-table.ts`, never merged by hand | all |
| `src/server/handler.ts` | register `itemDiffRoutes` | 006, 012, 013, 014, 015, 018, 019 |
| `src/app/projects/api.ts` | `fetchItemDiff` and its types | 012, 013, 014, 015, 018, 019 |
| `src/app/graph/full-node-data.ts`, `FullGraphNodes.tsx`, `FullGraph.tsx`, `NeighborhoodGraph.tsx`, `NeighborhoodToolbar.tsx`, `RelationshipEdge.tsx`, `GraphOptions.tsx`, `CompactControls.tsx`, `legend.css` | optional `change` field, mark, overlay control | 014 (`traffic` field and Traffic option in the same files), 016 (attribute rows) |
| `src/app/workspace/EntityDetails.tsx`, `RelationshipDetails.tsx`, `CatalogView.tsx` | mark, branch control, branch name | 014 (`TrafficBadge`), 016 (attribute row, governance) |
| `src/app/scm/BranchPicker.tsx`, `DefaultBranchActions.tsx` | the create dialog takes a suggested name; the publication review sits above confirm | 012 (proposals section nearby, no function overlap) |
| `src/app/mappings/QueryComposer.tsx` | status flag on governed metrics | none |
| `src/app/style.css` | one import of `item-diff.css` if the repository imports feature styles there | all UI features |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts`, `scripts/ci-validate.ts` | `test:item-diff`, suite entry, mutant wiring | all |
| `deploy/azure-devops/templates/validate-jobs.yml` | one browser matrix row mirroring the suite registry | all |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/user-guide.md`, `docs/graph-design.md`, `docs/item-addresses.md`, `docs/development.md` | text | all |

## Overlaps with the other features

- **011 (Tessera format)**: on this branch's base. The comparison reads documents through `inspect`, so a
  marker and additions are never items; a change to an addition is reported on its item (FR-007). No file of
  011 is edited. Fixtures reuse `tests/fixtures/tessera/documents/`.
- **012 (shared proposals)**: its review view shows files and `DiffView`. This feature supplies `items.diff`
  and the side registry; 012's follow-up adds `proposal:<id>` by one registration in `sides.ts` and swaps its
  review to `ChangeList`. Both edit `src/app/scm/` (012 mounts `ProposalsSection` in `SourceControl.tsx`; this
  feature edits `BranchPicker.tsx` and `DefaultBranchActions.tsx`): textual only. 012 refuses pushes of
  managed branches; this control never pushes.
- **013 (person sign-in)**: none beyond the shared row, inventory and `handler.ts` blocks.
- **014 (usage counters)**: both draw on the same graph cards. 014 adds `traffic` data and `TrafficBadge`;
  this feature adds `change` data and `ChangeMark`. Both marks go in the annotation slot that 016 defines for
  rows and that the card components expose; until 016 lands the slot is a plain child area of the card that
  this feature creates and 014 reuses. The merge is textual, not logical. The two features must not share a
  field name. 014 reads counts by `requestReader`; the overlay reads no counts.
- **015 (agent panel)**: an agent that edits through the panel changes the person's working copy, which the
  overlay shows. Nothing else.
- **016 (attributes and governance)**: attribute rows and governance fields. The comparison already names
  governance and agent-context additions as changed fields (FR-007). The attribute mark needs 016's row
  component; until then the mark appears on relationship rows.
- **006 (MCP server)**: no tool is added. `docs/mcp-contract.md` must list `items.diff` as not exposed, with
  its reason; the inventory row carries it.
- **018 (multi-file and mesh)**: multi-file units add item addresses in parts. The comparison works on
  documents, so it follows once parts are documents of the unit. Imports are not items of the consumer.
- **019 (compile everywhere)**: none in code. The convert action needs a clean file; the change list can tell
  a person whether the file has unpublished changes.

## What can start now and what waits

- **Start now**: the pure comparison and its fixtures (T001 to T009), the contract, the side readers
  for `published`, `branch` and `commit` (T010 to T013), the route and its inventory rows (T014 to T018), the
  planner flag (T031).
- **Start now, with a stub**: the overlay (T019 to T026) and the branch control (T027 to T030), with the card
  annotation slot created here if 016 has not landed.
- **Wait for 016**: the attribute-specific display rows (T024), and the check that governance and agent-context
  changes show as fields (T008 uses a synthetic addition until then).
- **Wait for 014 or any order**: no task waits; the merge of shared graph files is done by the integrator.
- **Wait for 012**: the `proposal` side and the review swap are 012's follow-up, not tasks here.

## Process (owner-approved 2026-11-17)

During implementation a feature runs only its own tests, `bun --bun run check` and `bun --bun run build`. The
full unit suite, all mutation tests, every browser suite, the UI regression comparison against the last
release and the architecture review run once on the integrated batch before the merge. Tasks name a targeted
proof each, and the last task hands off to the batch gate. Heavy runs use `sw-midgard-run -- <command>`.
Screenshot and visual-comparison tasks are marked `[CODEX]` and handed to Codex.

## Complexity Tracking

No violations.
