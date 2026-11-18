# Implementation Plan: Usage Counters

**Branch**: implementation branch chosen when taken up | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-usage-counters/spec.md`

## Summary

A small server module, `src/server/usage/`, owns the counters. The operation boundary calls one
recorder after an authorized, successful, counted request; the recorder extracts item addresses from the
answer, increments an in-memory map and flushes it every 30 seconds to one day file per project under
`data/state/usage/`. Reads rekey counts through the existing address migration records, filter by
reader and serve one new project operation, `usage.read`. The browser adds a **Traffic** option to
the graph options that shades entities, relationships and rows, adds a count to the details panels and
lets lists sort. Everything is off by default: with counters off the recorder is a no-op and the
interface shows nothing new. Operators enable counters with two environment variables.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server); React 19 (interface).

**Primary Dependencies**: none new. `atomicWrite`, the address migration functions, the operation
boundary, `bun:test`, the existing mutation harness and browser-check pattern.

**Storage**: `data/state/usage/<project>/<yyyy-mm-dd>.json`, written atomically. No database table.

**Testing**: `bun test tests/usage/` (new folder), `tests/auth/usage-read-parity.test.ts`,
`tests/address-key-inventory.test.ts` extended, one browser check `scripts/usage-traffic-browser-check.ts`
(`bun run test:usage-traffic`), mutants `scripts/usage-mutants.ts` and `scripts/usage-mutation-cases.ts`.

**Target Platform**: unchanged: local mode and one server container.

**Project Type**: web service plus single-page app.

**Performance Goals**: see "Defaults and where they come from"; chosen here and measured by T040.

**Constraints**: no identity in the store; no read of audit; no disk work on the request path; with
counters off, no file, no memory map and no change to any screen; files of about 400 lines at most,
functions about 40.

**Scale/Scope**: tens of people, tens of projects, thousands of counted requests per day.

## Buildable now and needs 006

| Part | On this base | Needs 006 |
| --- | --- | --- |
| Recorder, store, migration, retention, read operation, configuration | yes | no |
| Counting application-client requests (HTTP) | yes | no |
| Counting MCP tool calls | the hook is origin-neutral and tested with a twin caller built by the test | live tools (`get_mapping_context`, `plan_query`, `explain_metric`) exist only in 006 |
| Counting ACP calls | accepted as soon as the origin vocabulary has `acp` (feature 015) | no |
| Interface | yes | no |

## Defaults and where they come from

None of these came from a measurement unless the Source column says measured. "Existing" means equal to
a constant already in the repository.

| Name | Default | Source |
| --- | --- | --- |
| Counters enabled | off | decision E20 and Principle IV |
| Retention | 30 days | decision E20 |
| Retention range | 1 to 365 days | assumed; a year is the longest period a curator would compare |
| Flush interval | 30 seconds | assumed; bounds writes to two per project per minute and bounds loss after a crash |
| Items counted per request | 500 | assumed; a mapping context names tens of items, the cap only stops hostile or generated sizes |
| Largest response parsed | 4,000,000 bytes | existing: twice the 2,000,000-byte document limit |
| Addresses per project and day | 50,000 | existing: `ADDRESS_MIGRATION_LIMIT` in `src/server/projects/address-migrations.ts` used as the size precedent |
| Day boundary | UTC | assumed; any fixed standard works |
| Read refresh in the browser | once per minute while Traffic is on | assumed |
| Cost of counting | at most 5 percent over the median counted request | assumed; measured by T040 on the benchmark of `scripts/boundary-benchmark.ts` and recorded |
| Intensity levels drawn | 5 | assumed; five steps are distinguishable by outline weight in both themes |

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1.

| Principle | How the plan complies |
| --- | --- |
| I. Local and Server Modes | No outbound call. Counters are identity-free and shown only within normal read permissions: the read operation filters by the reader at file level and answers as for a missing project when the project is unreadable. Published content only: unpublished items are never counted. Same behaviour in both modes. |
| II. Byte-Exact Source Preservation | No definition file is read for writing or changed. Counts are not part of export or compiler output. |
| III. One Validation Rule Set | Untouched. |
| IV. Atomic, Hash-Checked File Persistence | Day files are written atomically; a damaged file affects only itself; the store is registered in the persisted-key inventory; it is off unless enabled, separate from audit, identity-free, keeps 30 days unless configured and loses only counts when deleted. |
| V. Pinned Official Standards | Untouched. No schema file is added for the store; a typed parser validates it. |
| VI. Verification Gate | New decision logic (who is counted, what an item is, retention, migration, reader filter) has mutants (FR-043). The new read route and its inventory entry join the authorization matrix and parity table. A browser check covers the interface. UI geometry assertions are part of it. The full gate runs once on the integrated batch. |
| VII. Honest Claims | Labels say "requests through this workbench". The README and the new guide state what is stored, that browser views are excluded, the loss window, and that a small team may infer who asked. A test compares documented and stored fields. |
| VIII. Readable Code | One module per concept under `src/server/usage/`; pure functions for items, rekeying and retention; comments say why; no spec IDs in comments. |
| Technical Constraints | The read operation goes through the operation boundary with an inventory entry and a parity case; counting is a boundary hook, not a route-level decision of access. No new dependency. |

Complexity Tracking: none. The recorder is an interface with two implementations (real and no-op), which
exists because counters are off by default; no other pattern is added.

## Design

### Modules (new, under `src/server/usage/`)

| Module | Concept |
| --- | --- |
| `usage-settings.ts` | Parsed `SW_USAGE_COUNTERS` and `SW_USAGE_RETENTION_DAYS` |
| `usage-recorder.ts` | The recorder the boundary calls; no-op when off; memory map; counting rules |
| `usage-items.ts` | Pure extraction of canonical addresses from an answer, per item rule |
| `usage-store.ts` | Day files: read, merge, atomic write, damaged-file handling |
| `usage-migration.ts` | Pure `rekey(file, records)` over address migration records |
| `usage-retention.ts` | Pure expiry decisions and the daily compaction |
| `usage-read.ts` | Reading a period for a reader: merge, rekey, filter, totals |
| `usage-counted-operations.ts` | Typed parser of `policies/usage-counted-operations.json` |

`src/server/routes/usage.ts` is the HTTP route of `usage.read`. The recorder is created with the
workspace in `src/server/handler.ts` and closed with it.

### Flow of one counted request

1. The boundary authorizes and runs the handler (unchanged).
2. After the response, `operate` asks `recorder.record({ operationId, origin, surface, project,
   response })`. The recorder returns at once unless on, 2xx, counted, and not browser.
3. It clones the response, parses it (bounded), calls the item rule, and increments the memory map. No
   awaiting on disk.
4. A timer flushes; `close()` flushes.

### Flow of one read

`GET /api/projects/:slug/usage` goes through the boundary as any project read, reaches `usage-read.ts`,
which reads day files and memory, rekeys with `readAddressMigrations`, filters addresses by
`requestReader`, totals, and returns the contract answer.

### Interface

Follows the visual language of the existing graph toolbar and details panels: the same tokens
(`--color-accent`, `--color-accent-soft`, `--color-border`, `--color-text-muted`, status tokens only
for errors), the same `GraphOptions` and `OptionGroup` control style, the same legend pattern as
`LineageLegend.tsx`. Intensity is an outline weight and a thin bar built from tokens plus the count
as text, so no meaning rests on colour. Card sizes do not change. Components:

- `src/app/usage/use-usage.ts`: loads and refreshes the answer, exposes states (off, loading, error,
  empty, ready, partial).
- `src/app/usage/TrafficToggle.tsx`: the option; explains the off state.
- `src/app/usage/TrafficBadge.tsx`: the one component that renders a count with its label, used by
  graph cards, edges' labels, detail rows and lists.
- `src/app/usage/TrafficLegend.tsx`: measure, operations, period.
- `src/app/usage/usage.css`: layout only, tokens for colour; wraps, never clips.
- `src/app/usage/usage-intensity.ts`: pure mapping from count to one of five levels.

States: off (Admin sees "Counters are off. An operator turns them on with SW_USAGE_COUNTERS."; others
"Not collected"), empty ("No requests counted yet in the last D days."), loading (a stable placeholder
of the same height), error (message and Retry, graph stays usable), partial (days unavailable are named),
ready. Long names wrap in the badge and legend; the phone layout stacks the legend below the graph and
folds the option into the existing compact controls panel (`CompactControls.tsx`). Light and dark come
from the tokens. The option state is remembered in the browser with the other graph options
(`workbench:traffic:<model>`, read and written in `try`, like `hidden-kinds.ts`).

How "off equals unchanged" is proven: with the option off the components return null and add no class,
node, request or legend; the browser check compares the DOM structure of every graph and detail view
with a recorded baseline taken before the change, and the batch's UI regression comparison against the
last release must show no difference on any screen of the full journey (the `ui-regression-gate` skill).
The first request for counts is made only when the option is switched on.

### Patterns used

- **Null object** (no-op recorder). Problem: counters are off by default and the boundary should not
  branch on a flag at every call site.
- **Pure function core** for items, rekey and retention, with disk work at the edge in `usage-store.ts`.

## Files this feature owns

```text
src/server/usage/usage-settings.ts, usage-recorder.ts, usage-items.ts, usage-store.ts,
  usage-migration.ts, usage-retention.ts, usage-read.ts, usage-counted-operations.ts
src/server/routes/usage.ts
src/app/usage/use-usage.ts, TrafficToggle.tsx, TrafficBadge.tsx, TrafficLegend.tsx, usage.css, usage-intensity.ts
policies/usage-counted-operations.json
tests/usage/*.test.ts
tests/auth/usage-read-parity.test.ts
tests/fixtures/usage/ (day files, migration records, answers)
scripts/usage-traffic-browser-check.ts, scripts/usage-mutants.ts, scripts/usage-mutation-cases.ts
docs/usage-counters.md
```

## Shared files it touches

| File | Change | Also touched by |
| --- | --- | --- |
| `src/server/auth/operation-boundary.ts` | optional recorder dependency; one call after the response | 006 (audit and outcome edits in the same function), 013 (caller connection data), 015 (origin) |
| `src/server/handler.ts` | create the recorder, pass it to the boundary, register the route, close it | 006, 012, 013, 015 |
| `src/server/config.ts` and `docs/configuration.md` | two variables | 013 (token keys), 015, 012 (none expected) |
| `src/server/auth/route-actions.ts` | one row `GET /api/projects/:slug/usage` | 012, 013, 015 (contiguous block each) |
| `policies/operation-inventory.json`, `schemas/semantic-workbench-operations-v1.json` | entry `usage.read`; optional `usage` flag on three entries (schema gains the optional field) | 012, 013, 015 |
| `policies/matrix-cases.json`, `tests/auth/route-actions.ts` examples | cases for the new row | all |
| `docs/operations.md` | regenerated by `bun scripts/operation-inventory-table.ts` | all |
| `src/server/projects/paths.ts` | `usage` folder in `DataLayout` | 012, 013 (state folders) |
| `src/server/projects/trash.ts`, `trash-restore.ts` | move `state/usage/<slug>/` with a trashed project | 012 (none expected) |
| `src/server/projects/address-key-stores.ts`, `tests/address-key-inventory.test.ts`, `docs/item-addresses.md` | register the store | none |
| `src/shared/observability/operation.ts` | none; reads `CALLER_ORIGINS` and accepts `acp` when present | 015 adds `acp` |
| `src/server/index.ts` | none (close through the workspace) | 013 |
| `src/app/graph/GraphOptions.tsx`, `FullGraph.tsx`, `FullGraphNodes.tsx`, `NeighborhoodGraph.tsx`, `NeighborhoodToolbar.tsx`, `RelationshipEdge.tsx`, `CompactControls.tsx`, `legend.css` | Traffic option and shading hooks | none of the four; the Tessera attribute work later |
| `src/app/workspace/EntityDetails.tsx`, `RelationshipDetails.tsx`, `CatalogView.tsx`, `MetricsPanel.tsx` | `TrafficBadge`, list sorting | none of the four |
| `src/app/admin/SettingsSection.tsx` | read-only counter status | 013 (client registration section nearby), 012 (none) |
| `src/app/projects/api.ts` | `fetchUsage` | 012, 013, 015 (own calls) |
| `src/app/style.css` | one import of `usage.css` if the repository imports feature styles there | all UI features |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts`, `scripts/ci-validate.ts` | `test:usage-traffic`, suite entry, mutant wiring | all |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/user-guide.md`, `docs/server-mode.md`, `docs/development.md` | text | all |

## Overlaps with the other features

- **015 (agent panel)**: adds origin `acp` to the shared vocabulary and to audit filters. 014 only
  reads the vocabulary. Merge order: either; a test in 014 uses a synthetic origin value from the
  vocabulary, never a literal `acp`.
- **013 (person sign-in)**: changes `handler.ts`, `config.ts` and the operation boundary's caller
  fields. 014 passes no caller fields to the recorder, so there is no logical overlap, only textual.
- **012 (shared proposals)**: adds routes and `DataLayout` entries. Proposal branches are
  unpublished and never counted; nothing to reconcile except the contiguous-block rule for rows.
- **006 (MCP server)**: counting its tools needs no change here; its `docs/mcp-contract.md` should
  list the three counted tools after both merge (note for 006's documentation, done in T047).
- **Tessera format (011)**: none.

## Project Structure

### Documentation (this feature)

```text
specs/014-usage-counters/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── counted-operations.md
│   ├── counter-store.md
│   └── usage-read-api.md
├── checklists/requirements.md
├── checklists/analysis.md
└── tasks.md
```

## Delivery phases (tasks.md splits them)

1. Settings, counted-operation table and the pure functions.
2. Store, recorder and boundary hook.
3. Migration, retention and trash.
4. Read operation and authorization.
5. Interface.
6. Documentation, mutants and hand-off to the batch gate.

## Complexity Tracking

No violations.
