# Implementation Plan: Attributes, Agent Context and Governance in Tessera

**Branch**: implementation branch chosen when taken up | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/016-attributes-and-governance/spec.md`. Base: feature 011 (Tessera format, on this
branch's base). Features 012 to 015 and 006 are not on the base.

## Summary

Three registry modules under `src/shared/tessera/additions/` make the reserved names real at
revision 2. One pure module decides what an attribute is. One governance module gives ontology items
and metrics a single domain view. The guard code that protects metrics gains the twin rules for
ontology items before the editor is enabled. The agent context assembler reads the published
snapshot's `tessera_ai_context` and the governance flag. The editors are three sections on the
existing details panels and catalog, built from one row component that other features decorate.
The loss report moves to version 2 with status counts. No route or operation is added.

## Technical Context

**Language/Version**: TypeScript on Bun 1.4; React 19.

**Primary Dependencies**: none new. Existing: `yaml` document API, Ajv and `scripts/compile-schemas.ts`,
the item editor (`src/shared/edit/`), the guards (`src/shared/governance/guards.ts`,
`src/server/auth/guards.ts`), `bun:test`.

**Storage**: none new. The additions live in the ontology file.

**Testing**: `bun test tests/attributes/ tests/governance/ tests/tessera/` plus the existing tests named
in T034; one browser check `scripts/attributes-governance-browser-check.ts`; mutants in
`scripts/tessera-mutants.ts` and a new case file.

**Target Platform**: unchanged.

**Project Type**: web service plus single-page app.

**Performance Goals**: none claimed. Validation of a revision-2 document is measured against the same
document at revision 1 by T034 and the figure recorded; no target is assumed.

**Constraints**: revision-1 documents and unmarked documents unchanged; fail closed; unpublished text
never reaches an agent; files of about 400 lines, functions of about 40; no spec IDs in comments; text
never clipped.

**Scale/Scope**: 3 addition modules, 2 shared domain modules, 1 guard module, about 14 interface files,
about 20 test files, 1 contract.

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | No outbound call. Agent output reads the immutable published snapshot in both modes. Unpublished context appears only in the labelled browser preview. |
| II. Byte-Exact Source Preservation | Attribute and governance edits go through the existing patch-based item editor; other bytes stay. Viewing a metric writes nothing. Revision change is a separate confirmed edit. |
| III. One Validation Rule Set | Registry-driven schema plus semantic checks in `src/shared/tessera/validate.ts`, shared by browser, scan, save and agents. Findings have paths and codes. |
| IV. Atomic, Hash-Checked File Persistence | Saves unchanged. No new state. |
| V. Pinned Official Standards | Pinned schemas untouched; the derived revision-2 schema is generated and drift-checked. Output stays valid against the pinned base; all additions are dropped and reported; schema and meaning failures are never acceptable. |
| VI. Verification Gate | Mutants for the attribute rule, revision check, governance rules, published-only context and status counts. Own tests, `check`, `build` per feature; the batch gate runs the rest once. |
| VII. Honest Claims | Docs say classification is a declaration, accepting loss is not approval, standard output carries no status, agent context is published-only. |
| VIII. Readable Code | New folders named for concepts (`attributes`, `governance`); small files; plain comments. |
| Technical Constraints | No route added, so the operation inventory is unchanged. No dependency added. |

Complexity Tracking: none.

## Design

### Modules

| Module | Concept | Holds |
|---|---|---|
| `src/shared/tessera/additions/attributes.ts` | the order list | registry entry, place `concept` |
| `src/shared/tessera/additions/ai-context.ts` | agent context | entry; schema reuses the standard `AIContext` shape |
| `src/shared/tessera/additions/governance.ts` | governance | entry and value schema |
| `src/shared/attributes/attribute-rule.ts` | what an attribute is | `isAttribute(concept, relationship, lookup)`, `attributesOf(concept, lookup)`; the lookup is a parameter so imports can extend it |
| `src/shared/attributes/attribute-order.ts` | display order | `orderedAttributes`, keep-in-step helpers for add, rename, remove |
| `src/shared/governance/item-governance.ts` | one governance view | `governanceOf(item)`, `withGovernance(item, entry)` for ontology items; adapter to the metric extension; `statusLabel` |
| `src/shared/governance/ontology-guards.ts` | the twin rules | guarded changes for ontology items; called from `applyGuards` |
| `src/shared/tessera/semantic-checks.ts` | semantic findings | order list, deprecation and duplicate checks |
| `src/shared/tessera/loss-report.ts` | report version 2 | `statusCounts` |
| `src/server/agent/context-assembly.ts` | context | `tessera_ai_context` as context entries; status flag per item |

### Flow of an attribute edit

1. The person opens a concept. `AttributeList` asks `attributesOf` for rows, inherited ones marked.
2. The form builds a relationship with `newItem` (now with the shared field list) and the save goes
   through the existing item editor, patch writer, validation and hash check.
3. Rename: `src/app/edit/references.ts` computes all references, including the order list, and the
   save is refused with the blocking reference named if one cannot be rewritten.
4. Reordering writes `tessera_attributes`. If the document is revision 1, a confirmation raises the
   marker to 2 in the same patch set.

### Flow of a governance edit

1. The section reads `governanceOf`. The status control offers only what the person may do (the
   client guard from `src/shared/governance/guards.ts`).
2. The save runs the same shared guard on the client and `guardFor` on the server on every path that
   `GuardOperation` lists; refused changes come back with the metric-style text.
3. Demotion: a body change to an approved item is offered as "return to proposed" through the existing
   demotion mechanism.

### Flow of agent context

`context-assembly.ts` already reads one published commit per request. It adds, per concept and
relationship, an entry with the item address from `tessera_ai_context`, and a `governance` field with
status, replacement and reason. `explain.ts` and `query-plan.ts` copy the flag onto the items they
use. Owner, steward, classification and notes are never read. The browser preview uses the working
copy source and its existing label.

### Compile

The registry's `drop` disposition already removes the three names and records losses. The loss report
builder counts lost governance entries by status. The meaning check gains one comparison: every
relationship that `isAttribute` accepts is equal in source and output.

### Patterns used

- **Registry** (011): one entry per addition. Problem: four consumers must agree on the list.
- **Adapter**: `item-governance.ts` presents two storage places as one model. Problem: metrics keep
  their extension and ontology items cannot have one.
- **Row with a slot**: `AttributeRow` takes `annotations` children. Problem: three features decorate
  the same row and none should edit another's component.

### Interface

Sections on `EntityDetails.tsx`, `RelationshipDetails.tsx` and `CatalogView.tsx`: **Attributes**,
**Agent context**, **Governance**. They use `edit.css` tokens and the existing form controls. States:
empty ("No attributes yet" with an add button), loading (stable placeholder), error (message, retry),
read only (reason), long text (wrap). Phone width: sections stack and forms use full width. Status is a
word with a shape (filled, outlined or struck) and meets contrast AA in both themes. The graph canvas
is unchanged. Screenshots are taken by Codex ([CODEX] tasks).

### Contracts

[contracts/revision-2-additions.md](./contracts/revision-2-additions.md).

## Defaults and sources

| Name | Default | Source |
|---|---|---|
| Revision of the three additions | 2 | decision of this plan; renumbered at merge if 018 merges first |
| Statuses | proposed, approved, deprecated | decision E17 |
| Order list size | 200 | assumed |
| Owner, steward, classification length | 200 characters | assumed |
| Deprecation reason length | 2,000 characters | assumed |
| Context text length | 10,000 characters | existing: the notes limit of 011 |
| Report version | 2 | this feature |
| Compiler version | 1.1.0 | assumed; set when golden files are made |
| Narrowest width checked | 360 px | existing responsive checks |

## Project Structure

```text
specs/016-attributes-and-governance/{spec.md, plan.md, tasks.md, contracts/revision-2-additions.md}
```

### Files this feature owns

```text
src/shared/tessera/additions/{attributes,ai-context,governance}.ts
src/shared/tessera/semantic-checks.ts
src/shared/attributes/{attribute-rule,attribute-order}.ts
src/shared/governance/{item-governance,ontology-guards}.ts
src/app/attributes/{AttributeList,AttributeRow,AttributeForm,ValueTypeUsage}.tsx, attributes.css
src/app/governance/{GovernanceSection,GovernanceFields,StatusMark}.tsx, governance.css
src/app/agent-context/{AgentContextSection,AgentContextPreview}.tsx, agent-context.css
schemas/tessera-ontology-2-ossie-0.2.0.dev0.json                      (generated)
tests/attributes/*.test.ts, tests/governance/*.test.ts, tests/tessera/{additions-r2,loss-report-status,agent-context-r2}.test.ts
tests/fixtures/tessera/additions/{attributes,ai-context,governance}/
scripts/attributes-governance-browser-check.ts, scripts/attributes-mutation-cases.ts
```

### Shared files this feature touches

| File | Change | Also touched by |
|---|---|---|
| `src/shared/tessera/registry.ts` | add three entries to `ADDITIONS` | 018 (adds its entries beside) |
| `src/shared/tessera/reserved-names.ts` | remove three names | 018 (removes `tessera_imports`) |
| `src/shared/tessera/format.ts` | `SUPPORTED_REVISIONS` to `[1, 2]`; `COMPILER_VERSION` | 018 (`[1, 2, 3]`), 019 |
| `src/shared/tessera/validate.ts` | call `semantic-checks.ts` | 018 |
| `src/shared/tessera/schema-derivation.ts`, `scripts/derive-tessera-schema.ts`, `scripts/compile-schemas.ts` | one more derived file per revision | 018, 019 (new base) |
| `src/shared/tessera/loss-report.ts`, `compile-unit.ts`, `meaning-check.ts` | status counts; attribute equality | 018 (multi-file), 019 (convert) |
| `src/shared/governance/guards.ts` | call `ontology-guards.ts` from `applyGuards` | 019 (metric conversion) |
| `src/server/auth/guards.ts` | refusal text for new guard kinds | none |
| `src/shared/edit/item-model.ts` | concept form IRI fix; target choices include built-ins; attribute helpers | 017 (diff reads kinds), 018 |
| `src/app/edit/references.ts`, `relationship-references.ts` | relationship rename coverage | none |
| `src/app/edit/AddItem.tsx`, `ItemEditor.tsx` | attribute form entry, built-in options | none |
| `src/app/workspace/EntityDetails.tsx`, `RelationshipDetails.tsx`, `CatalogView.tsx` | mount the three sections | 014 (TrafficBadge), 017 (ChangeMark) |
| `src/app/validation/ValidationPanel.tsx` | fix hints for new codes | none |
| `src/server/agent/{context-assembly,context-types,explain,query-plan}.ts` | context entries, status flag | 006 (tools return these), 014 (counts items from the answer) |
| `tests/tessera/agent-and-access.test.ts` | the "no addition in agent output" test is narrowed to notes and order | none |
| `tests/fixtures/tessera/golden/` | regenerated for the new compiler version | 018, 019 |
| `docs/*.md`, `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `schemas/README.md` | text | all |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts` | one suite, one script | all |

## Overlaps with the other features

- **011**: this feature extends 011's registry, revisions, compiler, loss report and tests. The loss
  report version and golden files change; one 011 test changes (listed in the pull request).
- **012 (shared proposals)**: none in code. A proposal that changes governance is judged by the same
  guards when promoted, through `publish`.
- **013 (person sign-in)**: none in code. The owner comparison uses the identity values the guard
  already receives; richer identities improve matching without edits here.
- **014 (usage counters)**: `TrafficBadge` goes in `AttributeRow`'s annotation slot and on the same
  details panels and catalog. 014's plan assumes this row exists; build `AttributeRow` first (T015) so 014 can
  use it, or 014 uses its plain rows until this lands. No logical overlap: 014 counts requests, this
  feature never counts.
- **015 (agent panel)**: none in code. An agent's save of governance goes through the same guards.
- **006 (MCP server)**: the published-context, plan and explain tools return what the shared modules
  return, so they gain context entries and the status flag without code. Tool descriptions and
  `docs/mcp.md` must mention it (T033). `save_file` and `validate_text` meet the new findings and guards.
- **017 (item diff and overlay)**: the diff compares ontology items including the three additions; it
  uses `attributesOf` to name attributes. `ChangeMark` goes in the row's annotation slot. Merge is
  textual in the details panels.
- **018 (multi-file and mesh)**: also registers revision-2/3 names, edits the same registry files and
  the derived-schema script. Revision numbers follow merge order; the second to merge renumbers.
  `attributesOf` takes a type lookup so imported value types can be added.
- **019 (compile everywhere)**: consumes the loss report with status counts in its browser preview and
  HTTP answers, and later converts metric payloads using the adapter's read side.

## Start now and wait

- **Start now** (nothing outside 011 is needed): T001 and T002 (fixtures); T003 to T006 (format);
  T007 to T011 (rules and guards); T012 to T014 (E18 defects, independent of the rest); T015 to T026
  (interface pieces, agent output, compile); T027 to T029 once the pieces they mount exist.
- **Waits**: the revision number in T003 follows the merge order with 018; T033 (MCP handoff) waits for
  006 on the main branch; marks from 014 and 017 in the row slot need no work here whichever lands first;
  T030 ([CODEX] capture and comparison) waits for the integrated batch; T036 is last.
- **Parallel groups**: {T001, T002}; {T003, T007, T012, T013}; {T008, T009, T010}; {T015, T021, T025}; {T019, T022, T023};
  {T031, T032}.

## Process (owner-approved 2026-11-17)

During implementation a feature runs only its own tests, `bun --bun run check` and `bun --bun run build`.
The full unit suite, mutation tests, every browser suite, the UI regression comparison against the last
release and the architecture review run once on the integrated batch. Tasks name a targeted proof each and
the last task hands off. Heavy runs use `sw-midgard-run -- <command>`. Screenshot and visual comparison tasks
go to Codex.

## Delivery phases

1. **Format** (revision 2 entries, schema, findings). 2. **Rules** (attribute rule, governance view,
guards). 3. **Compile** (report version 2, meaning check). 4. **Agent output**. 5. **Interface**.
6. **Defects of E18**. 7. **Gate, documentation, handoffs**.
