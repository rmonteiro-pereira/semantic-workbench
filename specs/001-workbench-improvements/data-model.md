# Phase 1 Data Model: Workbench Improvements

**Feature**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Three storage classes, per constitution IV (2.0.0):

| Class | Location | Authority | Lost if deleted? |
| --- | --- | --- | --- |
| Project content | `data/projects/<slug>/` (Git working trees) | Source of truth | Yes (use trash, Git remotes, backups) |
| Application state | `data/state/` JSON files, `data/trash/` | Durable | Yes |
| Cache | `data/cache.sqlite` | Derived | No (rebuilt by rescan) |

## Layout on disk

```text
data/
├── projects/<slug>/            # Git working tree, files at any depth, .gitignore honoured
├── state/
│   ├── projects.json           # project registry
│   ├── views/<slug>.json       # view settings + grouping corrections per path
│   ├── suggestions.json        # rejected grouping suggestions
│   ├── drafts/<slug>/<pathHash>.json
│   ├── journal/<opId>.json     # in-progress multi-file operations
│   └── legacy-ids.json         # v0.1.0 document id → {project, path}
├── trash/<entryId>/            # payload/ (file or whole project folder incl. .git) + entry.json
├── backup/workbench-<ts>.sqlite
└── cache.sqlite
```

## Entities

### Project
| Field | Type | Rules |
| --- | --- | --- |
| `slug` | string | `^[a-z0-9][a-z0-9-]{0,62}$`, unique, folder name under `data/projects/` |
| `name` | string | 1–200 chars; display name; unique per workspace (case-insensitive) |
| `createdAt` | ISO time | |
| `origin` | `import` \| `example:<id>` \| `migration` \| `restore` | |
| `branch`, `remote`, `ahead`, `behind` | derived from Git | not stored |

Rename changes `name` only; the slug is stable. Registry entry and folder are created in one
journaled operation.

### Document (file)
Identified by `(project, path)`; `path` is POSIX, relative, no `..`, not under `.git/`.

| Field | Source |
| --- | --- |
| `bytes`, `hash` (SHA-256 of bytes) | file on disk |
| `serialization` | extension + sniffing: yaml, json, turtle, ntriples, n3, rdfxml, gitignore, unsupported |
| `docType` | ODCS, Ossie ontology, Ossie semantic, Ossie mapping, Ossie consolidated, RDF, OWL, SHACL, gitignore |
| `layout` | Ossie only: `split` or `embedded (deprecated)` |
| `valid`, `findings` | shared validation (cached) |
| `visible` | false for `unsupported` and Git-ignored paths |
| `gitState` | from `git status`: clean, modified, added, deleted, renamed, untracked, conflicted |

### Draft
| Field | Rules |
| --- | --- |
| `project`, `path` | target document |
| `baseHash` | hash of the file the draft started from; save rejected if current hash differs |
| `text` | editor text (line breaks normalized) |
| `patches` | ordered source-range patches against the base bytes (authoritative for save) |
| `updatedAt` | |

State: `editing → saving → saved` (draft deleted) or `editing → stale` (base hash mismatch →
diff shown → user rebases or discards).

### Grouping suggestion
| Field | Rules |
| --- | --- |
| `fileRef` | `(project, path)` of the separately imported file |
| `targetProject` | slug |
| `evidence[]` | `{kind: ossie-ref-name \| shared-iri \| odcs-physical-name, detail, otherFile}` |
| `state` | `open` (cache) → `accepted` (file moved, journaled) or `rejected` (stored in `suggestions.json` by file hash + target) |

### Trash entry (`data/trash/<entryId>/entry.json`)
| Field | Rules |
| --- | --- |
| `entryId` | ULID |
| `kind` | `file` \| `project` |
| `project`, `path`, `projectName` | original location |
| `deletedAt`, `hash` (file) | |
| `undoUntil` | `deletedAt + 10 s` |
| `batchId` | groups entries created by Clear |

Transitions: `active → trashed` (move, journaled) → `restored` (move back if target free and
unchanged; otherwise user picks a new name/location) or `purged` (permanent delete, confirmed).

### Operation journal (`data/state/journal/<opId>.json`)
`{opId, kind: delete|restore|clear|move|kpi-save|migration|import, steps: [{action: rename|write|gitInit|gitCommit, from?, to?, expectedHash?, done}], startedAt}`. Recovery rules in research R7.

### KPI (metrics-layer entry)
Stored as the `SEMANTIC_WORKBENCH` custom extension of an Ossie metric (research R1). The Ossie
metric supplies `name`, `expression`, `description`, `datatype`, `ai_context`.

| Field | Type | Rules |
| --- | --- | --- |
| `schema` | const `semantic-workbench/metric/v1` | required |
| `label` | string | |
| `type` | simple \| ratio \| derived \| cumulative \| filtered | required; must agree with expression (finding otherwise) |
| `numerator`, `denominator` | metric names | ratio only; must exist in the same model |
| `inputs` | metric names | derived/filtered/cumulative |
| `window` | `{kind: rolling\|to_date\|all, length?, grain?}` | cumulative only |
| `additivity` | additive \| semi_additive \| non_additive | ratio ⇒ non_additive |
| `non_additive_over`, `period_aggregation` | `time`; last \| first \| average | semi_additive only |
| `time` | `{dimension, min_grain, allowed_grains[]}` | dimension is a semantic field with time role; grains ⊆ day, week, month, quarter, year and ≥ min_grain |
| `dimensions[]` | semantic field refs `dataset.field` | must exist |
| `filters[]` | `{field, operator, value}` | operator ∈ equals, not_equals, in, not_in, gt, gte, lt, lte, between, is_null, is_not_null |
| `unit`, `format` | strings | |
| `targets[]` | `{grain, period?, direction, value? \| range?, thresholds?}` | threshold operators use ODCS names |
| `owner`, `steward` | strings | |
| `status` | draft \| proposed \| approved \| deprecated | approved → any edit → proposed; deprecated requires `replaced_by` or `deprecation_reason` |
| `replaced_by`, `deprecation_reason` | | |

Derived (never stored): dependency graph (syntax-tree analysis from the agent runtime), lineage
(KPI → metrics → fields → datasets → ODCS objects/properties), explanation (spec FR-011–FR-014).

### KPI binding (mapping document root extension, research R12)
| Field | Type | Rules |
| --- | --- | --- |
| `metric` | metric name | must exist in the semantic model named by the mapping's `semantic_model_ref`; unique |
| `measures` | concept name, IRI or declared QName | required; must resolve in the referenced ontology |
| `of` | concept name, IRI or declared QName | optional; must resolve in the referenced ontology |

Stored as `{"schema": "semantic-workbench/mapping/v1", "kpi_bindings": [...]}`, one binding per
line, sorted by `metric`. In a consolidated file: the embedded `semantic_model` root extension.

### KPI explanation (derived)
`{kpi, tree: Node, inputs: [{metric, expression, dialect, datasets, fields, odcs: [{contract,
object, property}]}], time, dimensions, filters, additivityText, divisionByZero: handled|unhandled|n/a,
concepts: [{iri, role}], sqlPreview?: {grain, dimensions, sql} | {refused: reason}}`.

### Neighborhood walk (UI state)
`{steps: [{center, via?: relationshipId}], index}`; `push` truncates forward history.

### Cache tables (`data/cache.sqlite`, schema version in `PRAGMA user_version`)
`files(project, path, hash, serialization, doc_type, valid, visible, git_state, indexed_at)`,
`entities(project, path, id, name, kind)`, `findings(project, path, severity, code, json_path,
line, column, message)`, `suggestions(file_project, file_path, target, evidence_json)`. Any
version mismatch or corruption ⇒ delete and rebuild.

## Validation rules summary
- File writes: only under `data/projects/<slug>/`, never `.git/`; temp file + rename; base-hash
  check (FR-081).
- Import: shared validation preflight; supported files with errors can be imported only via the
  repair flow; `.gitignore` is accepted as plain text.
- Git paths passed only after `--` and validated as relative project paths.
