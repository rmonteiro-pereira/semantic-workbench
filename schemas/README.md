# Schema snapshots and application extensions

Schemas are checked in so parsing and validation do not fetch remote definitions at runtime.
The browser uses generated standalone Ajv validators; the server uses the same supported schema
snapshots. See [validation coverage](../docs/user-guide.md#validation-coverage-and-limits) for the
boundary between schema checks, structural checks and reasoning that is not implemented.

## Standards provenance

The original snapshots were retrieved on 2026-10-15:

- [ODCS 3.1.0](https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json)
- [Apache Ossie 0.2.0.dev0](https://github.com/apache/ossie/blob/main/core-spec/ossie-schema.json)

Both projects are Apache-2.0 licensed. Ossie 0.2.0.dev0 is an unreleased, mutable upstream draft;
this repository pins its own snapshot rather than following upstream changes at startup. A
companion schema check does not certify complete semantic conformance with the standard.
Other contract versions currently receive structural coverage rather than the 3.1.0 schema.

Mapping/ontology snapshots come from Apache Ossie commit
`64a1ae44035f5360dcd53401a29bcd900fdce349`, retrieved on 2026-10-16:

- `ontology/mapping.json` → `ossie-mapping-0.2.0.dev0.json`
- `ontology/ontology.json` → `ossie-ontology-0.2.0.dev0.json`
- `core-spec/ossie-schema.json` → `ossie-0.2.0.dev0.json` (same pinned snapshot)

Remote `$ref` identifiers resolve to these local files. The earlier core semantic snapshot
`ossie-0.2.0.dev0.json` is shared by semantic imports and mapping dependencies because both pinned
upstream paths contain identical schema bytes. Versioned ontologies use the pinned ontology
schema; unversioned compatibility layouts retain their documented structural profile.

## Application schemas

These schemas describe workbench storage conventions, not additions to the upstream standards:

| File | Describes |
| --- | --- |
| `semantic-workbench-metric-v1.json` | Governed metric attributes |
| `semantic-workbench-mapping-v1.json` | Metric-to-concept bindings |
| `semantic-workbench-repository-v1.json` | Multi-project repository manifest |
| `semantic-workbench-access-v1.json` | Roles, grants, projects, agents and server settings |

Metric attributes are JSON in an Ossie `custom_extensions` entry with
`vendor_name: SEMANTIC_WORKBENCH`. Bindings live in the mapping root, or the semantic model inside
a consolidated file, and preserve the stored key `kpi_bindings`. Other Ossie tools can ignore
these application extensions. See
[metric storage](../docs/user-guide.md#metrics-and-governed-definitions).

The repository manifest uses schema ID `semantic-workbench/repository/v1` and is stored as
`.semantic-workbench.json` at the repository root. It identifies subfolders as separate projects;
it does not change their file formats or create a separate standards layer.

Access configuration uses schema ID `semantic-workbench/access/v1`. Files in `DATA_DIR/admin/`
validate against their corresponding `$defs`: `roles.json`, `grants.json`, `projects.json`,
`agents.json`, `deactivated.json` and `settings.json`. This is the versioned administration
repository, separate from definition projects and their Git histories.

## Updating validators

```sh
bun run schemas:compile
bun test tests/validation.test.ts
bun run build
```

Keep upstream snapshots unchanged unless intentionally updating the supported version and its
provenance. Publish an incompatible application-schema change under a new versioned filename.
Update parser/schema tests, generated browser validators and the current usage/configuration
references together. Historical design drafts under `specs/` explain earlier decisions; they do
not replace the active schema files.
