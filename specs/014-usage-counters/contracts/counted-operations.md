# Contract: counted operations

The checked-in table `policies/usage-counted-operations.json` and this page say the same thing; a
test compares them with each other and with the `usage` field of the operation inventory.

## When a request is counted

All must hold: counters are on; the response status is 2xx; if the inventory entry names an outcome
classifier its outcome is `ok` or `degraded`; the operation is in the table; the request surface is
not `browser`; the answer's snapshot is a published snapshot (the response carries
`X-Workbench-Snapshot`).

## Table

| Operation | Route | Counts, once each | Does not count |
| --- | --- | --- | --- |
| `agent.context.read` | `GET /api/agent/context` | the mapping, its ontology concepts and relationships used by bindings, the semantic model, datasets, fields and metrics named in the context answer | findings, documents, the project, unresolved references |
| `agent.plan` | `POST /api/agent/plan` | the concepts and metrics the plan resolved, and the fields and datasets its steps name | names that did not resolve, the query text |
| `metrics.explain` | `GET /api/projects/:slug/files/*/explain/:metric` (agent surface only) | the metric and the fields and datasets its explanation names | the file |
| `agent.catalog.read` | `GET /api/agent/catalog` | nothing (a listing is not a request about items) | all |
| `agent.projects.list` | `GET /api/agent/projects` | nothing | all |

MCP tools `get_mapping_context`, `plan_query` and `explain_metric` are
twins of the three counted routes and are counted through them with origin `mcp`. ACP calls that
dispatch the same twins are counted with origin `acp`. No other tool is counted, including file reads.

## Item rules

- `context-items`, `plan-items`, `metric`: pure functions `(answer, documents) -> addresses`, in
  `src/server/usage/usage-items.ts`.
- An item is counted under `absoluteItemAddress(addressAtModelPath(model, path), document)`.
- Duplicates are removed; the list is sorted by address text; the first 500 are kept.
- An item that has no addressable form (positional-only, built-in) is skipped.
- An item of a file the answer's own reader could not read does not appear in the answer, so it cannot
  be counted.

## Not counted, by rule

Browser surface requests (including the authoring preview routes `/api/preview/*` and the explain
route called by the browser), refused requests, failed requests, requests before a first published
commit (`not_published`), and any request while counters are off.

## Bounds

Response bodies over 4,000,000 bytes are not parsed. A request counts at most 500 items. Counting never
alters the response, its headers or its timing beyond the bound in the plan.
