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

### Ossie 0.3.0 draft base

Ossie 0.3.0 is not released. The workbench supports its development version `0.3.0.dev0` as a
**draft base**, labelled "Ossie 0.3.0 draft". Upstream says this schema may change before 0.3.0 is
released. The files come unmodified from Apache Ossie commit
`34e4d3752b8bc35cb5d6afbfa079bf89cffccb72` (`main`, 2026-11-26), retrieved on 2026-11-26:

| Upstream path | File | SHA-256 |
| --- | --- | --- |
| `core-spec/ossie-schema.json` | `ossie-0.3.0.dev0.json` | `b833534b1da935e373cb75517f8b983dff9d57b399283bac5f78870c928ca1bb` |
| `core-spec/spec.yaml` | `ossie-spec-0.3.0.dev0.yaml` | `dbde39599e51339ad3918609dedf51f512ae70e67d4ea0fbe52de93ae7f8f829` |
| `ontology/ontology.json` | `ossie-ontology-0.3.0.dev0.json` | `4e4732da74596b03a8ecc10f01fb98c612ce5c75c0e050619b16283c27689923` |
| `ontology/mapping.json` | `ossie-mapping-0.3.0.dev0.json` | `dfeb28d3be05d1bd0645dfdd42924155c17c3b5ab6ad10ae297e6e8c8f7909bd` |

`tests/tessera/pinned-schema-hashes.test.ts` fails when a byte of these files differs from this
table. When upstream releases 0.3.0, the released files replace these. The table then gains the
release identifier, and the label drops "draft". What changed from 0.2.0.dev0, and the test for
each change, is in [the 0.3 inventory](../docs/ossie-0.3-inventory.md).

The Agent Client Protocol schema `acp-1.32.0.json` is the unmodified `schema/v1/schema.json` of the
protocol's release `schema-v1.32.0` (Apache-2.0), retrieved on 2026-11-17. It is an external
protocol, not a definition standard. The server uses it to validate every frame of the agent panel;
the browser does not load it. See [the agent panel guide](../docs/agent-panel.md#protocol-record).

## Application schemas

These schemas describe workbench storage conventions, not additions to the upstream standards:

| File | Describes |
| --- | --- |
| `semantic-workbench-metric-v1.json` | Governed metric attributes |
| `semantic-workbench-mapping-v1.json` | Metric-to-concept bindings |
| `semantic-workbench-repository-v1.json` | Multi-project repository manifest |
| `semantic-workbench-access-v1.json` | Roles, grants, projects, agents and server settings |
| `tessera-ontology-2-ossie-0.2.0.dev0.json` | Tessera revision 2 ontology workbench schema on the same pinned Ossie base |
| `tessera-ontology-1-ossie-0.2.0.dev0.json` | Tessera revision 1 ontologies on the Ossie 0.2.0.dev0 base. A workbench schema, not part of the Ossie standard |
| `tessera-ontology-{1,2,3}-ossie-0.3.0.dev0.json`, `tessera-part-3-ossie-0.3.0.dev0.json` | The same Tessera schemas derived from the pinned Ossie 0.3.0 draft ontology schema |

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
`agents.json`, `deactivated.json`, `settings.json` and `programs.json` (the agent programs that
people may connect; an older repository without it reads as no programs). This is the versioned administration
repository, separate from definition projects and their Git histories.

## The Tessera schema

The revision 1 and revision 2 schemas are generated by `bun scripts/derive-tessera-schema.ts`. The script derives them from the pinned `ossie-ontology-0.2.0.dev0.json` and the registry of Tessera additions
(`src/shared/tessera/registry.ts`): it changes the identifier, requires the marker `tessera` and adds
each registered property where it is allowed, and changes nothing else. `bun scripts/derive-tessera-schema.ts --check`
exits 1 when the checked-in file is out of date, and `tests/tessera/schema-derivation.test.ts` checks
the same. The provenance of the pinned base is unchanged. A base that already defines a property
whose name starts with `tessera_` cannot be registered (`src/shared/tessera/bases.ts`).

Revision 2 adds `tessera_attributes` on concepts and `tessera_ai_context` and
`tessera_governance` on concepts and relationships. The validator also checks ordering
references and deprecation rules. Standard ontology output drops all three properties.

## Updating validators

`bun run schemas:compile` writes `src/generated/validators.js` for the 0.2.0.dev0 base and
`src/generated/validators-0.3.js` for the 0.3.0 draft, which the browser loads only for a file that
declares the draft.

```sh
bun run schemas:compile
bun test tests/validation.test.ts tests/validation-ossie-0.3.test.ts
bun run build
```

Keep upstream snapshots unchanged unless intentionally updating the supported version and its
provenance. Publish an incompatible application-schema change under a new versioned filename.
Update parser/schema tests, generated browser validators and the current usage/configuration
references together. Historical design drafts under `specs/` explain earlier decisions; they do
not replace the active schema files.

The access schema also defines `programsFile` for `admin/programs.json`: pre-registered public
agent programs, exact HTTPS or loopback redirect addresses and offered scopes. Unknown fields,
duplicate ids, custom redirect schemes and the reserved administration scope are refused.
The revision 3 workbench schemas distinguish ontology roots from headerless parts. The root schema
allows an empty ontology list when the root declares parts. The dependency manifest has its own
version 1 schema for recording resolved providers. Regenerate the derived ontology schemas before
compiling the standalone validators.


Revision 3 selects either the Tessera ontology root schema or the part schema. The root
declares part paths, exports and imports. The dependency manifest schema validates the
project's `tessera-dependencies.json` independently of definition files.
