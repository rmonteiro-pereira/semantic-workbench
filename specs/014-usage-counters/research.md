# Research: Usage Counters

The governing decisions (E20, E21, E6) are not reopened. This file settles how to carry them out.
"Evidence" names the code at the base commit (5597ae52).

## R1. Where a request is counted

**Evidence.** `operate` in `src/server/auth/operation-boundary.ts` selects the row, authorizes,
runs the handler and has the final `Response` and the operation's inventory entry. It already
records metrics after the response (`recordOperation`). The request surface is attached by
`attachRequestSurface` in `src/server/auth/request-surface.ts`: `browser` or `agent`; every
protocol caller is `agent`.

**Decision.** Add one optional dependency to `createOperationBoundary`: a `UsageRecorder`. After the
response exists and only when its status is 2xx and the operation's inventory entry carries a `usage`
field, `operate` hands the recorder the operation id, origin, project (from the route match), surface,
and a clone of the response. The recorder is a no-op object when counters are off.

**Rejected.** Counting inside each handler (three route files, easy to forget for MCP tools).
Counting in the HTTP middleware (MCP twins bypass it). Reading the audit log (E20 forbids).

## R2. How items are derived from an answer

**Evidence.** The context answer (`src/server/agent/context-types.ts`) carries `bindings`, `fields`,
`metrics`, `concepts`, `datasets`, each with an `evidence` of `documentId`, `filename`, `revision` and a
model `path`. `addressAtModelPath` (`src/shared/core/model-addresses.ts`) turns a document model and
a path into an address; `absoluteItemAddress` adds the project and document. The plan answer names
concepts and metrics resolved for the query. The explain route names one metric.

**Decision.** One pure extractor per counted operation, in `src/server/usage/usage-items.ts`,
reads the cloned JSON and the models of the documents named by evidence, and returns distinct
canonical addresses sorted, cut at the cap. Documents are the same published documents the answer
came from (the response carries `X-Workbench-Snapshot`; `workspace.published` serves them). The
contract `contracts/counted-operations.md` fixes which entries of each answer count.

**Rejected.** Counting positional ids (rename breaks them). Re-running the planner to learn items
(double work). Counting every item of the document set (a context request would then add to
everything).

**Cost bound.** Parsing a clone of a bounded response. Responses over 4,000,000 bytes are not counted
(a test and a log line). The chosen cap is 500 items per request.

## R3. What a "successful" request is

**Decision.** Status 2xx and, when the inventory entry names an outcome classifier, an outcome of `ok`
or `degraded`. A plan that answers 200 with a refusal body would otherwise count.

## R4. Store layout and write path

**Evidence.** Durable state is atomic JSON under `layout.state` (`src/server/projects/paths.ts`);
`atomicWrite` in `src/server/projects/atomic.ts`; the address migration store uses one file per
project (`address-migrations/<project>.json`). Shutdown calls `workspace.close()`
(`src/server/index.ts`).

**Decision.** One file per project and day: `state/usage/<project>/<yyyy-mm-dd>.json`. An in-memory
map holds today's increments per project; a flush every 30 seconds merges them into the day's file
with `atomicWrite`, and `close()` flushes. Reads merge file and memory. Expired day files are deleted
at start and once a day.

**Loss window.** After an unclean stop at most 30 seconds of counts are lost. After a clean stop none.
Documented. 30 seconds is assumed (no measurement); it bounds writes to one per project per half
minute under any request rate.

**Rejected.** Writing on every request (disk work on the request path, FR-019). A SQLite table (the
database is a rebuildable cache; counters are durable). One file per project (rewrites grow with the
retention). An append-only log (unbounded between compactions, harder to migrate).

## R5. Following address migrations

**Evidence.** `readAddressMigrations(layout, project, reader)` and `migrateAddress`/`deletesAddress` in
`src/shared/core/address-migration.ts`; records are append-only, uncompacted and replay is idempotent
(`docs/item-addresses.md`, "Pure migration API").

**Decision.** Each day file stores `migratedThrough`, the id of the last migration record applied.
`rekey(day, records)` is a pure function applying records after that marker with `migrateAddress` and
dropping deleted items, summing counts that land on one address. Reads apply it in memory without
writing; the flush and the daily compaction write the result and the new marker. Because the records
are idempotent, applying them twice gives the same result.

**Rejected.** Rewriting counters inside the rename journal (couples the counter store to every save).
Keying by IRI (not every item has one; E6 says names do not promise identity).

## R6. Reader filtering

**Evidence.** `Reader` and `AccessView.canRead(project, path)` (`src/server/projects/reader.ts`,
`requestReader`). Agent routes already filter by readable files.

**Decision.** The address carries the document path. The read operation drops every counter whose
document the reader cannot read before any sum, and computes totals from what remains. The "other
items" total (FR-018) is dropped when the project has any unreadable file, because it cannot be split
by file; the answer then omits it for everybody with partial access.

## R7. Configuration

**Decision.** `SW_USAGE_COUNTERS` (`on` or absent) and `SW_USAGE_RETENTION_DAYS` (integer 1 to 365,
default 30), validated in `src/server/config.ts` with the existing problem list; invalid values stop
the start, like other settings. The 365 ceiling is assumed. Documented in `docs/configuration.md`.

## R8. The read operation

**Decision.** `GET /api/projects/:slug/usage?days=N` with action `read` on the project, inventory id
`usage.read`, effects `read`, exposure `never` for MCP in this release (reason recorded). The answer is
described in `contracts/usage-read-api.md`. It is a project route so that the existing project read
authorization and hidden-equals-missing behaviour apply with no new action.

**Rejected.** A new Cedar action (nothing to distinguish it from reading the project).

## R9. Interface

**Evidence.** Graph options are in `src/app/graph/GraphOptions.tsx` and toolbar controls of
`FullGraph.tsx` and `NeighborhoodToolbar.tsx`; card nodes in `FullGraphNodes.tsx`; edges in
`RelationshipEdge.tsx`; legend in `LineageLegend.tsx` and `legend.css`; details in
`EntityDetails.tsx` and `RelationshipDetails.tsx`; tokens in `src/shared/theme/theme.css`.

**Decision.** Traffic is a view option beside the existing ones, stored with the other per-person
view options. Intensity is a class on the existing node and edge elements that changes only a token
based outline and a thin bar, never the card size (the full graph keeps fixed-size cards for
measurement reuse, `docs/graph-design.md`). The count is also written as text so colour is not the
only carrier. With the option off no class, node, request or legend is added.

**Rejected.** Heat rings on cards of the full graph (changes measured card geometry). A separate page
(hides the data from the graph where curators work).

## R10. What "attributes" means on this base

**Evidence.** There is no attribute presentation (E18) in `src/app`; relationships and dataset fields
are shown as rows in the details panel.

**Decision.** One shared component, `TrafficBadge`, renders a count for any row. It is used for
relationship rows and dataset field rows now and is the component the attribute rows use when E18 is
built.

## R11. Cost of counting

**Decision.** Chosen bound (assumed, to be measured in task T040 on the named fixture): counting adds
at most 5 percent to the median time of a counted request over the in-process benchmark
(`scripts/boundary-benchmark.ts`), and no disk work happens on the request path.
