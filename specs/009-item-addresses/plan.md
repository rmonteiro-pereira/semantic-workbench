# Implementation Plan: Item Addresses

**Branch**: `009-item-addresses` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-item-addresses/spec.md`

## Summary

Add one versioned address grammar (`sw1`) as a pure module in `src/shared/core/`, derive an address
for every parsed item, and adopt it in the existing consumers in seven shippable steps. Record
address migrations for renames and moves made through the workbench in a small durable store that
is written inside the same journaled operation as the files. Consumers that do not exist yet (item
diff, governance pointers, usage counters, MCP resources, mesh) get a contract, a fixture set and
the migration function, so they can adopt the grammar without changing it.

The address is a locator. The only persistent identity is an IRI the item declares. A name-based
address is promised stable across reordering and edits, and promised to change on rename and move.

## Technical Context

**Language/Version**: TypeScript on Bun (server) and React 19 (browser), unchanged.

**Primary Dependencies**: none added. The module uses the existing IRI expansion
(`src/shared/validation/iri.ts`), the parsed model (`src/shared/core/model.ts`), the journal and
atomic JSON helpers (`src/server/projects/journal.ts`, `atomic.ts`).

**Storage**: one new durable state file per project,
`<data root>/state/address-migrations/<slug>.json` (contract: `contracts/migration-store.md`). No
cache table, no change to the SQLite cache, no change to user files.

**Testing**: `bun test` (unit, property, store and crash tests), the authorization matrix for the
resolver, `test:mutation` for new mutants, browser checks for selection and rename.

**Target Platform**: browser and the existing server, both modes.

**Project Type**: web service plus single-page app (unchanged); the new grammar module is shared.

**Performance Goals**: parse or format one address in under 10 ms at the 4,096-character limit
(SC-004); derivation for the largest sample project adds under 5% to `inspect()` time, measured by
the existing example timing check.

**Constraints**: no network call, no runtime dependency; addresses never in logs or telemetry; no
change to what any user sees (SC-007); no rewrite of user files by adoption.

**Scale/Scope**: documents up to 2,000,000 bytes; a few thousand items per document; migration
files up to 50,000 records.

## Constitution Check

Checked against constitution 4.0.0, amended 2026-11-16. Principles IV and V include the durable
address migration store and versioned application formats; persisted adoption may proceed.

| Principle | How the plan complies |
| --- | --- |
| I. Local and Server Modes | No outbound network call. Inventoried item-address HTTP twins reuse the shared operation boundary. Addresses contain project and file names, so they never enter logs or telemetry labels (a redaction test and a mutant cover it); the server resolver gives hidden and missing addresses the same answer (FR-044) and migration reads use the project's read boundary. Local mode behaves the same through the implicit Admin principal. |
| II. Byte-Exact Source Preservation | Adoption never rewrites a file. The `dataset.field` notation in metric extensions and every name in a file are read through adapters (FR-041). Rename edits only the edited item and the references the user ticked, as today. Migration records live outside the files. |
| III. One Validation Rule Set | One parser and one formatter in `src/shared/`, used by the browser and the server. The declared-migration check on save is the same function the browser uses before sending. The parser is bounded: length checked first, linear scan, depth limit 32. |
| IV. Atomic, Hash-Checked File Persistence | The migration store is durable state, written atomically, and updated as one more step of the journaled operation that writes the renamed files, so recovery completes both or neither. Conversion of persisted keys backs up the old store, checks every converted file's hash against its original and stops on any failure (FR-040). Saves still carry base hashes; the new request field changes none of that. **Amendment**: name the migration store in the list of durable state files. |
| V. Pinned Official Standards | No pinned schema is edited. The grammar is an application choice, labelled as such in docs and the contract (FR-010). Nothing is written into a standard Ossie or ODCS file. **Amendment**: add application-defined formats (`sw1`) to the list of workbench interpretations that must be labelled and versioned. |
| VI. Verification Gate | Unit and property tests with a seeded generator; conformance fixtures; store and interrupted-operation tests; an authorization test for hidden-equals-missing (no new route, so the route inventory is unchanged; the save and save-batch bodies are extended and their existing matrix entries gain a case); targeted mutants (SC-011); browser checks for graph, mapping, lineage and rename; unchanged geometry suites run as the no-visible-change proof. |
| VII. Honest Claims | The README and docs state that names do not survive renames made outside the workbench, that positional addresses are volatile, and that migrations exist only for workbench renames. Counts quoted (kinds, fixtures, records) come from tests. |
| VIII. Readable Code | One module per concept (grammar, kinds, model addresses, migration, store, key adapters); functions about 40 lines; no spec IDs in comments; header comment and JSDoc on every export. |
| Technical Constraints | No dependency. Every server decision stays behind the existing boundary; the store is read by server code that already has a caller and a reader. Document size limit unchanged. Heavy work: derivation is linear and runs in the existing parse path. |
| Development Workflow | Gate: `bun test`, `bun --bun run check`, `bun --bun run build`, the named browser suites, `test:mutation`, README and docs updated in the same change. |

No exception is needed. Complexity Tracking is empty.

### Constitution amendments this feature needs

Two small additions, drafted on the amendment branch and referenced here by principle, not by
version:

1. **Principle IV**: the address migration store is a durable state file; migrations of
   address-keyed stores follow the existing backup-and-hash rule.
2. **Principle V**: application-defined formats such as the address grammar and the Tessera format
   are versioned, labelled as application choices, and never presented as part of a pinned
   standard.

Neither blocks the first adoption steps (1 to 4). Steps 5 and 6 wait for them.

## Decisions

The reasoning and rejected alternatives are in [research.md](./research.md) (D1 to D10). In short:
locator not identity; one string with a kind on every segment and percent-encoding; absolute and
relative forms from one function; positional segments for unnamed items, flagged volatile;
migrations as prefix records applied only when an address no longer resolves; file moves recorded
by the server, item renames declared by the client and validated; per-project store inside the
journal; hidden equals missing; a seeded generator instead of a library.

## Project Structure

### Documentation (this feature)

```text
specs/009-item-addresses/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── address-grammar.md
│   └── migration-store.md
├── checklists/requirements.md
└── tasks.md
```

### Source code

```text
src/shared/core/
├── item-address.ts           # types, parse, format, escaping, display, relative resolution, prefix operations
├── address-kinds.ts          # the closed kind registry and parent rules
├── model-addresses.ts        # addressesOfModel, resolveInModel, itemIdentity (read the parsed model)
├── address-migration.ts      # record types, migrateAddress, declared-migration validation
└── item-key-adapters.ts      # read the older notations (concept:C/R, field:d.f, dataset.field) into addresses
src/server/projects/
├── address-migrations.ts     # the per-project store: read, bounded uncompacted append inside the journal
└── address-key-conversion.ts # one-time conversion of persisted keys, with backup and hash check
tests/
├── item-address.test.ts
├── item-address-properties.test.ts
├── model-addresses.test.ts
├── address-migration.test.ts
├── address-migration-store.test.ts
├── address-key-conversion.test.ts
├── address-hidden-missing.test.ts
├── helpers/seeded-random.ts
└── fixtures/addresses/conformance.json
scripts/
├── address-mutants.ts                   # registered in scripts/mutation-tests.ts
└── item-address-browser-check.ts        # npm script test:addresses
docs/item-addresses.md                   # the grammar and the stability promise, for developers and stewards
```

Edited files, in adoption order:

| Step | Files |
| --- | --- |
| 2 Derived addresses | `src/shared/core/model.ts` (add `address` to `Entity` and `Relationship`) |
| 3 Graph, mapping, lineage | `src/app/mappings/mapping-graph.ts`, `src/app/odcs/lineage.ts`, `src/app/workspace/WorkspaceCanvas.tsx`, graph selection state in `src/app/graph/` |
| 4 Agent context, metrics | `src/server/agent/context-assembly.ts`, `src/server/agent/explain.ts`, `src/server/agent/query-plan.ts` keys, `src/shared/metrics/extension.ts` reader |
| 5 Persisted keys | `src/server/projects/state.ts` (view state), grouping corrections, `src/server/projects/migration.ts` conventions |
| 6 Rename and move | `src/app/edit/references.ts`, `src/app/edit/ItemEditor.tsx`, `src/app/edit/DeleteItem.tsx`, `src/app/projects/api.ts`, `src/server/routes/kpis.ts`, `src/server/routes/files.ts`, `src/server/projects/workspace.ts`, the file-move module, `src/server/projects/journal.ts` (step for the store) |
| 7 Retire | the private key builders replaced in steps 3 and 4 |

**Structure decision**: the grammar and everything that reads a parsed model are shared pure code in
`src/shared/core/`, next to `model.ts`, because the browser, the server and later the compiler all
need them. The only I/O is the store, kept in `src/server/projects/` beside the other durable state
and the journal it uses.

## Adoption order and gates

| Step | What ships | Gate before the next step |
| --- | --- | --- |
| 1 Module and tests | Grammar, kinds, fixtures, property tests, mutants, docs page | `bun test`, `check`, mutation; nothing else changes |
| 2 Derived addresses | `address` on entities and edges, uniqueness check over every sample project and fixture layout | SC-002, SC-008 |
| 3 Selection | Mapping canvas, lineage and graph selection use addresses | graph, lineage, mapping and responsive browser suites unchanged (SC-007) |
| 4 Context and metrics | Context labels from the formatter; metric `dataset.field` adapter | context snapshots unchanged except labels; metrics suite |
| 5 Persisted keys | One-time conversion with backup | SC-010; amendment for Principle IV in place |
| 6 Rename and move | Migration store, declared migrations, `moveFile` records, deleted markers, reconciliation record | SC-005, SC-006, SC-009; amendments in place |
| 7 Retire | Remove the old builders; a test fails if one reappears | `check` |

Steps 1 to 4 are read-only with respect to stored state and can ship alone. A step can be reverted
without data loss because steps 1 to 4 store nothing, step 5 keeps the backup, and step 6 only adds
a file.

## Dependencies and ordering with parallel work

- **006 MCP**: resource addresses wrap this grammar. 006 needs steps 1 and 2 first and must not
  define its own. The hidden-equals-missing resolver (FR-044) is provided here and reused there.
- **008 published snapshot**: defines the `@<snapshot>` token. Until it lands, the suffix is parsed
  and formatted as opaque text and no resolver returns published content for it.
- **010 operation boundary**: main includes the boundary; the declared-migration check and store append run
  inside the operation it defines. Until then they run in the existing save and batch save.
- **Constitution amendments** (Principles IV and V): needed before steps 5 and 6.
- **Item diff (roadmap row 4)**, **governance (row 5)**, **usage counters (row 12)**, **mesh and
  Tessera (rows 8 and 9)**: later consumers; they use the contract and own their adoption tasks.

## Risks

- **Persisted key shapes are not fully known.** Mitigation: step 5 starts with an inventory task
  and a test that fails on an unknown key shape.
- **A client declares a migration it did not perform.** Mitigation: FR-049 and the boundary check;
  worst case the server refuses the save.
- **Relationship renames do not rewrite references today** (`references.ts:190`). Mitigation: the
  rename task includes the E18 fix for relationship targets it depends on, covered by a test,
  and does not widen beyond that.
- **Dotted or odd names in existing fixtures expose latent bugs in the old key builders.**
  Mitigation: they are the first conformance cases; failures there are expected and fixed in step 3.

## Complexity Tracking

Empty.
