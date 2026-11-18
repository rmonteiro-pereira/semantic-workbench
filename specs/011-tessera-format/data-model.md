# Data Model: Tessera Format and Compiler

Types are described by what they hold. Names are those the code will use. Nothing here is stored
durably: Tessera adds no database column, no state file and no cache entry. Documents are files;
bundles are folders the command writes once.

## Format definition (`src/shared/tessera/`)

| Type | Fields | Rules |
| --- | --- | --- |
| `TesseraNames` | `product`, `markerKey`, `propertyPrefix` | One definition; every other module imports it. Values: `Tessera`, `tessera`, `tessera_`. |
| `SupportedBase` | `version`, `label`, `draft`, `ontologySchema`, `derivedSchemas` (revision to schema) | One entry per pinned Ossie base. Registering one runs the collision check. |
| `AdditionEntry` | `name`, `since`, `places`, `value`, `disposition`, `owner` | `name` starts with the prefix; `since` is a revision; `places` is a list of `root`, `concept`, `relationship`; `disposition` is `drop`, `translate` or `refuse`; names are unique. |
| `ReservedName` | `name`, `owner` | Not present in the registry; removed from this list when its feature registers it. |
| `TesseraMarker` | `revision` | A whole number of at least 1. |
| `DocumentFormat` | `family`, `revision?`, `base?` | `standard`, or `tessera` with revision and base. Returned by `inspect` beside `kind`. |

## Findings

`Issue` is the existing finding type (`src/shared/validation/diagnostics.ts`). Tessera adds codes
only (see `contracts/tessera-format.md`). No new field.

## Compilation (`src/shared/tessera/`)

| Type | Fields | Rules |
| --- | --- | --- |
| `UnitFile` | `path`, `bytes` | Path relative to the project folder, `/` separators. At most 10,000 files, 64,000,000 bytes in all, 2,000,000 per file. |
| `FileTreatment` | `compiled`, `copied`, `not-included` | Chosen from the file's kind: Tessera ontology, standard Ossie, other. |
| `CompileOptions` | `lossPolicy?` | Part of the loss report's identity. |
| `LossEntry` | `document`, `item`, `property`, `pointer`, `bytes`, `sha256` | The value itself is never stored. |
| `LossReport` | see `contracts/loss-report-and-manifest.md` | Canonical JSON; `digest` over the rest. |
| `LossPolicy` | `policy`, `allow` | `policy` equals 1; `allow` is a list of registered property names. |
| `Manifest` | see the same contract | Stands alone; repeats inputs and outputs. |
| `CompileResult` | `outputs`, `report`, `manifest`, `failures` | `failures` is empty exactly when `outputs` may be released (subject to acceptance). |
| `CompileFailure` | `code`, `document?`, `message` | Codes: `invalid-source`, `output-schema`, `meaning`, `translation`, `limit`, `path-collision`, `serialization`. Never acceptable. |

## Source reading (`src/server/tessera/`)

| Type | Fields | Rules |
| --- | --- | --- |
| `SnapshotSource` | `kind`, `branch`, `commit`, `projectFolder`, `files` | `kind` is `published-snapshot` for `compile`. The commit is a full identifier on the default branch's history. |
| `DiskSource` | `kind: 'files-on-disk'`, `folder`, `files` | `check` only. |
| `BundleTarget` | `folder` | Absent or empty; not inside the repository folders or the data root's project and working-copy folders. |

## Relationships

- A `SupportedBase` owns the pinned ontology schema and one derived schema per revision.
- A derived schema is a function of one base and the registry at one revision.
- A `CompileResult` holds one `LossReport` and one `Manifest`; the manifest repeats the report's
  digest and inputs.
- A `LossEntry` points at a document and an item address (`src/shared/core/item-address.ts`).

## State transitions

None. A compile is one pass: read, validate, compile, check, report, release or refuse, write.
