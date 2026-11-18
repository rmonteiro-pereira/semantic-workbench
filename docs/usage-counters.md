# Usage counters

Usage counters tell a curator which definitions agents and application clients actually ask about.
They are off unless an operator turns them on. They count requests through this workbench. They do
not count queries run in a warehouse, use in production or the popularity of data.

## What they are, and are not

- A count is one request through this workbench that named an item in its answer: a mapping context,
  a query plan or a metric explanation read by an application client, an MCP client or an agent panel.
- Browser views do not add to any count. Opening a graph, a catalog or a details panel counts nothing,
  and neither do authoring previews or the metric explanation the browser asks for.
- Only the published snapshot is counted. An unpublished item has no count, and counting never reads
  or reveals unpublished work.
- Counts hold no person, client, connection, session, request id, source address, file text or query
  text. They are kept apart from the audit log and from telemetry, and are never computed from either.
- Counters do not make anyone anonymous. In a small team, a count of one on a rarely asked item may let
  people infer who asked. Treat low counts accordingly, and do not present counters as private.
- Nothing is sent outside the workbench; the list of outbound connections is unchanged.

Deleting a project invalidates only recordings for that project, including answers still being decoded.
Historical model reads use the counted project’s repository.

Each UTC day has a 64 MiB serialized limit. Counts beyond the byte or address limit contribute
to the day's unaddressed `other` total.

## Turning counters on

| Variable | Default | Meaning |
| --- | --- | --- |
| `SW_USAGE_COUNTERS` | unset (off) | `on` starts counting requests through the workbench |
| `SW_USAGE_RETENTION_DAYS` | `30` | Whole number of days from 1 to 365 that counts are kept |

Any other value stops the start and names the variable. Both modes read the same variables. While
counters are off no folder is created, no timer runs and no count is kept in memory, and every screen
shows what it showed before, apart from the Traffic switch, which says "Not collected" (an Admin is
told how to turn counters on). Admin Settings shows whether counters are on and the retention, read only.

## What is counted

A request is counted when counters are on, the request was authorized and answered successfully, its
answer came from the published snapshot, it did not come from the browser, and it asked for one of
these operations. Each counted request adds one to every distinct item its answer names, up to 500 items
(the first 500 in address order). An item without a stable address, such as an unnamed positional one
or a built-in concept, is skipped. The table of counted operations is checked in as
`src/shared/usage/counted-operations.json`, and a test compares it with this page.

| Operation | Route | Counts, once each |
| --- | --- | --- |
| `agent.context.read` | `GET /api/agent/context` | the mapping, its ontology and semantic model, the concepts and relationships its bindings use, and the datasets, fields and metrics named in the answer |
| `agent.plan` | `POST /api/agent/plan` | the concepts, metrics, fields and datasets the plan resolved |
| `metrics.explain` | `GET /api/projects/:slug/files/*/explain/:metric` | the metric and the datasets and fields its explanation names (agent surface only) |

Recording admits up to 16 active requests. Additional requests are answered normally without counts.
The recorder reads at most 4,000,000 bytes of an answer for counting, and refuses a stored day over
64 MiB, over 50,000 addresses, or with an operation outside the counting registry.

Listings such as the catalog and the project list count nothing, because a listing is not a request
about an item. MCP tools and agent panel calls that reach these operations through the operation
boundary are counted under their own origin.

## What is stored

One file per project and day, `state/usage/<project>/<yyyy-mm-dd>.json`, written atomically. Days are
UTC calendar days, so a restart or a change of time zone never splits or merges a day.

| Field | Meaning |
| --- | --- |
| `formatVersion` | Always 1 |
| `project` | The project slug; equals the folder name |
| `day` | The UTC day; equals the file name |
| `migratedThrough` | Id of the last address migration record applied to the file, or null |
| `counts` | For each canonical item address: the count for each measure, operation and origin |
| `other` | Optional: counts that did not fit the 50,000 addresses a day may hold, with no address |

Under each address a count is held for one `measure` (always `workbench-requests`), one `operation`
(an id from the table above) and one `origin` (`http`, `mcp` or the agent panel's origin). Nothing else is
stored.

## When counts are written, kept and lost

- Counting happens in memory. Every 30 seconds, and when the server stops cleanly, memory is merged into
  the day's file. On a clean stop, the recorder refuses new recordings and drains those already
  admitted before its final flush and workspace close. After a crash, power loss or kill, up to 30 seconds of
  counts are lost and nothing older.
- A failed write keeps the counts in memory, logs one warning an hour without content and retries.
- Counts older than the retention are removed at start and once a day. A lower retention removes more at
  the next start.
- Counting never makes a request fail or wait, and never changes an answer, its status or its headers.
- Deleting the whole `state/usage/` folder loses only counts. Nothing else depends on it.
- Counts are not part of a project export, a workbench export or compiler output.
- A project moved to the trash takes its counts with it, restoring it under the same name brings them
  back, and purging it removes them. Trash flushes pending counts before moving the day files and
  discards unfinished recordings that could belong to the removed project. A failed flush leaves the
  project in place so trash can be retried. Restoring under another name starts without counts.

## Renames and deletions

Usage follows renames whose saved edits are present in a published commit. The workbench matches
the working copy and branch and verifies the committed bytes before binding a declaration to the
commit. Reads and compaction replay the committed changes in order, including chains and deletions.
An item that later reuses a deleted address starts with its own counts. A declaration for another
branch or a save whose exact byte transition cannot be matched does not transfer counts. A squash or
rebase gives the edits new commits that no declaration is bound to, so the renamed items start
again from zero and their old counts are dropped as deletions. Publication itself does not depend
on this usage history.

A day already rewritten with an unverified marker is reported partially unavailable when it also
has fresh counts. The original day is preserved separately as `<day>.unverified.json` until expiry
and moves with the project on trash and same-name restore. If the same day loses its verified
history again, the next copy is numbered (`<day>.unverified.1.json`) instead of replacing the first.

## Who sees counts

`GET /api/projects/:slug/usage?days=N` is a project read with its own inventory entry, `usage.read`. A
caller who may not read the project gets the answer for a project that does not exist. Every item is
resolved in the pinned published model and filtered through the caller's read access to its file before any sum, so an unreadable file leaves no
trace in items, totals or the unaddressed total. An answer never includes another project, and it holds
no identity. A day whose file is damaged is named in `unavailableDays` and the others are still shown; if
the address history cannot be read, no counts are shown and every day is named unavailable.

## In the interface

While Traffic is off, its displays skip address lookup and relationship traversal. The neighborhood
graph builds its regular nodes and edges without creating per-item Traffic subscriptions. Edges
without label text also skip label measurement and viewport tracking.

The graph options of the full graph and the neighborhood have a **Traffic** switch, off by default and
remembered for each model in the browser. Switched on, it asks the server once and then at most once a
minute. Items that were asked about get a heavier outline and a longer bar, in five steps relative to
the busiest item shown, and the count is also text for screen readers. Intensity never relies on colour
alone. The legend names the measure, the operations and the period. The details of an entity, a
relationship and a dataset field say, for example, "1,200 requests through this workbench in the last 30
days" with the split by operation. The entity catalog and the metrics list can be sorted busiest first.
The switch explains each state: counters off, loading, failed with Retry, nothing counted yet, and days
whose counts are unavailable.

## Later: imported query counts

The `measure` field exists so a later increment can add counts imported from a warehouse as a second
series with its own label. Series are never summed together, and no import format exists yet.
