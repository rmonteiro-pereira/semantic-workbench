# Data Model: v0.3.0 (002-lineage-and-ux)

Only new or changed entities. Everything else keeps the v0.2.0 model
([001 data model](../001-workbench-improvements/data-model.md)).

## Derived (browser, never stored)

### LineageGraph (`src/odcs/lineage.ts`)

| Field | Type | Notes |
| --- | --- | --- |
| `contract` | string | contract file path in the project |
| `cards` | `Map<CardId, LineageCard>` | all assets of the project that connect to the contract |
| `edges` | `LineageEdge[]` | column to column |
| `revision` | string | joined content hashes of the project files; memo key |

`CardId` = `object:<file>#<name>` · `dataset:<file>#<model-key>/<name>` ·
`metric:<file>#<model-key>/<name>` · `external:<reference>`.

### LineageCard

| Field | Type | Notes |
| --- | --- | --- |
| `id` | CardId | |
| `kind` | `object` · `dataset` · `metric` · `external` | legend kind |
| `label`, `file`, `detail` | string | detail = physical name, dataset `source` or metric expression |
| `columns` | `LineageColumn[]` | ordered as declared; empty for metrics and externals |
| `group` | string? | current Group by group (card tint) |

### LineageColumn

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `<cardId>/<path>` |
| `path` | string | property path (`parent.child`) or field name |
| `type` | string? | logical / physical type |
| `badges` | `{pk, fk, required, unique, classification?}` | same source as the Properties table |

### LineageEdge

| Field | Type | Notes |
| --- | --- | --- |
| `from`, `to` | column id or card id (metrics) | direction = left to right |
| `kind` | `foreign-key` · `reads` · `aggregates` · `uses` · `transform` | legend style: foreign-key dashed; others "feeds" |
| `source` | `{file, path}` | definition the edge comes from (inspector, Edit) |
| `ambiguous` | boolean? | dataset `source` matched by name and by physical name |

Validation rules: a card appears once; composite keys pair by position, unequal arity gives no
edge (existing finding); external references produce a stub card, never a fetch.

### MappingGraph (`src/mappings/mapping-graph.ts`)

Built from the agent context. Reuses `LineageCard`/`LineageColumn`/`LineageEdge` with card kinds
`concept` · `dataset` · `metric` and edge kinds `object` · `referent` · `link` · `measures` ·
`of`. Each edge carries `binding` (resolver id), `evidence` (`{documentId, path}`) and
`findings[]`; rows carry `identifying` and `unmapped` flags. Card ids: `concept:<name>`,
`dataset:<model>/<name>`, `metric:<model>/<name>`.

### ExpansionState (`src/graph/expansion.ts`, shared by Neighborhood and lineage)

| Field | Type | Notes |
| --- | --- | --- |
| `center` | id | |
| `sets` | `ExpansionSet[]` | ordered; Undo pops, Forward re-applies |
| `positions` | `Map<id, {x,y}>` | placed nodes; never moved by an expansion |

`ExpansionSet` = `{id, kind: 'expand'|'pierce', from: id, direction: 'out'|'in'|'both',
relationship?: string, nodes: id[], edges: id[], frontier: Map<id, hiddenCount>, total: number,
budget: number}`. A node is removed by Collapse only when no remaining set owns it (reference
count). The center cannot be collapsed.

### WalkStep (extended, `src/graph/walk.ts`)

Adds optional `kind: 'center' | 'expand'` (absent = `center`, v0.2.0 compatible) and
`set?: string` (expansion set id). `MAX_STEPS` stays 100.

### SqlRegion (`src/sql/regions.ts`)

| Field | Type | Notes |
| --- | --- | --- |
| `pointer` | JSON pointer | e.g. `/metrics/3/expression/dialects/0/expression` |
| `dialect` | string | Ossie dialect, ODCS server type, or `ANSI` |
| `style` | `block-literal` · `block-folded` · `plain` · `single` · `double` · `json` | scalar style |
| `text` | string | the value as parsed |
| `offsets` | `Int32Array` | file offset of each value character (+1 for end) |
| `checked` | boolean | false for non-SQL dialects |

### SqlFinding

An `Issue` (existing type) with `severity: 'warning'`, `code: 'sql-syntax'`, the region pointer,
and `line`/`column` from `offsets`; message `SQL syntax (<dialect>): <parser message>`.

### AutosaveState (`src/projects/autosave.ts`)

States: `clean` → (edit) `pending` → (1 s idle, valid) `saving` → `saved` | `stale` (paused) |
`failed`; (1 s idle, invalid) `invalid` (draft kept). Fields: `fileId`, `baseHash`,
`queuedText?`, `errors`, `lastSavedAt`. Transitions are pure and unit/mutation tested; one
`saving` per file.

## Stored

### Registry entry (`data/state/projects.json`, `formatVersion` stays 1)

| Field | Change | Notes |
| --- | --- | --- |
| `slug`, `name`, `createdAt`, `origin` | unchanged | `origin` adds `clone` |
| `folder` | new, optional | path under `data/projects/`; default = `slug` |
| `repo` | new, optional | repository folder under `data/projects/`; default = `slug` |
| `remoteAddress` | new, optional | address the project was cloned from (redacted on display) |

Rules: `folder` and `repo` pass `projectPath`; `folder` equals `repo` or lies inside it; no two
entries' folders nest; v0.2.0 files load unchanged (missing fields default).

### Repository manifest (`<repo>/.semantic-workbench.json`, user content, committed by the user)

Schema `semantic-workbench/repository/v1`, pinned at `schemas/semantic-workbench-repository-v1.json`
(copy in [contracts/repository-manifest.schema.json](./contracts/repository-manifest.schema.json)).
`{schema, projects: [{path, name?}]}`; read only; written only on explicit "Save as manifest".

### Trash entry (`data/trash/<entry>/entry.json`)

Adds kind `subproject`: `{kind, project, repo, folder, files, deletedAt}`; restore moves the
folder back if free (otherwise offers a free name) and re-registers the project.

### Repository Git config (inside `<repo>/.git/config`)

`user.name`, `user.email` written repository-locally from the identity dialog; `core.autocrlf
false`, `core.safecrlf false` set on clone (as on init today).

### Metric (unchanged storage)

Ossie metric + optional `SEMANTIC_WORKBENCH` extension (v1) + binding in `kpi_bindings`
(historical key name). API summary adds `governed: boolean`; metrics without the extension are
listed with `governed: false`.
