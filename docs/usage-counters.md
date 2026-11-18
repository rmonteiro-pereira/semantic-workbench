# Usage counters

Usage counters tell a curator which definitions agents and application clients actually ask about.
They are off unless an operator turns them on.

## Turning counters on

| Variable | Default | Meaning |
| --- | --- | --- |
| `SW_USAGE_COUNTERS` | unset (off) | `on` starts counting requests through the workbench |
| `SW_USAGE_RETENTION_DAYS` | `30` | Whole number of days from 1 to 365 that counts are kept |

Any other value stops the start and names the variable. Both modes read the same variables.

## What is counted

A request is counted when counters are on, the request was authorized and answered successfully, and
it asked for one of these operations. Each counted request adds one to every distinct item its answer
names. The list is checked in as `policies/usage-counted-operations.json`; a test compares it with this page.

| Operation | Route | Counts, once each |
| --- | --- | --- |
| `agent.context.read` | `GET /api/agent/context` | the mapping, its ontology and semantic model, the concepts and relationships its bindings use, and the datasets, fields and metrics named in the answer |
| `agent.plan` | `POST /api/agent/plan` | the concepts, metrics, fields and datasets the plan resolved |
| `metrics.explain` | `GET /api/projects/:slug/files/*/explain/:metric` | the metric and the datasets and fields its explanation names (agent surface only) |

Listings such as the catalog and the project list count nothing, because a listing is not a request
about an item.
