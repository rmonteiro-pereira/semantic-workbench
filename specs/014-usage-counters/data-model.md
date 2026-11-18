# Data Model: Usage Counters

Types are described by what they hold. Field names are those the code and the documentation use.

## Counter day file

`state/usage/<project>/<yyyy-mm-dd>.json`

| Field | Meaning |
| --- | --- |
| `formatVersion` | 1 |
| `project` | Project slug; equals the folder name |
| `day` | UTC calendar day, `yyyy-mm-dd`; equals the file name |
| `migratedThrough` | Id of the last address migration record applied to this file, or null |
| `counts` | Map from canonical item address (no snapshot suffix) to a map from `measure` to a map from `operation` to a map from `origin` to a whole number of at least 1 |
| `other` | Optional whole number: requests' item counts dropped by the per-day entry cap (FR-018); no address |

Rules: at most 50,000 addresses per day file (assumed; equals the existing migration record limit).
Addresses are absolute: they carry the project and the document path, so a reader filter can decide by
file. Values are integers up to 2^31 - 1; an increment that would exceed it saturates.

Vocabularies: `measure` is `workbench-requests`. `operation` is an inventory id from the counted table
(`agent.context.read`, `agent.plan`, `metrics.explain`). `origin` is `http`, `mcp` or `acp` (the
caller origin vocabulary; `acp` exists once the agent panel adds it).

There is no field for a person, client, connection, request, source address, document text, query text
or snapshot.

## Counter settings

| Field | Meaning |
| --- | --- |
| `enabled` | Boolean from `SW_USAGE_COUNTERS` |
| `retentionDays` | Integer 1 to 365 from `SW_USAGE_RETENTION_DAYS`, default 30 |

## Counted operation (checked-in table, `policies/usage-counted-operations.json`)

| Field | Meaning |
| --- | --- |
| `operation` | Inventory id |
| `items` | Name of the item rule: `context-items`, `plan-items`, `metric` |
| `measure` | `workbench-requests` |

Each counted operation's inventory entry also carries `usage: true`; a test compares the two.

## Usage series (read answer)

| Field | Meaning |
| --- | --- |
| `measure` | `workbench-requests` (a later item adds `imported-query-counts` as another series) |
| `label` | The text shown to people: "requests through this workbench" |
| `from`, `to` | First and last day covered |
| `days` | Requested period, at most the retention |
| `items` | List of `{ address, total, byOperation, byOrigin }`, sorted by address |
| `total` | Sum over the readable items |

Full shape in `contracts/usage-read-api.md`.

## State transitions

- Request counted: memory map increments (no disk).
- Flush: memory merged into the day file, `migratedThrough` advanced, file written atomically.
- Compaction (daily): expired files deleted; migrated keys of retained files rewritten.
- Project trashed: the project's usage folder moves with the trash entry; restore moves it back; purge
  deletes it.
