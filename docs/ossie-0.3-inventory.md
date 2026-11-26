# Ossie 0.3.0 inventory

## Status: draft base, not a release

On 2026-11-26 Apache Ossie still has no 0.3.0 release. Its releases list is empty, and its only tag
is `osi-0.1.1-rc1`. Upstream `main` declares `version: 0.3.0.dev0` and warns that the schema may
change before 0.3.0 is released.

The workbench adopts that development version as a **draft base**, pinned to one upstream commit:

| | |
| --- | --- |
| Repository | [apache/ossie](https://github.com/apache/ossie) |
| Commit | `34e4d3752b8bc35cb5d6afbfa079bf89cffccb72` (`main`, 2026-11-26) |
| Declared version | `0.3.0.dev0` |
| Previous pin | `64a1ae44035f5360dcd53401a29bcd900fdce349` (0.2.0.dev0, retrieved 2026-10-16) |
| Commits between the pins | 154 |

`core-spec/ossie-schema.json` and `core-spec/spec.yaml` last changed at `1b1ebb62` (2026-11-20).
`ontology/ontology.json` and `ontology/mapping.json` changed in the same range.

Every place that names this base calls it a draft. That covers the base table (`draft: true`),
the label "Ossie 0.3.0 draft", `schemas/README.md` and the user documents.

Two pieces of work wait for the real 0.3.0 release:

- storing the released schemas with their release identifier;
- a base entry without "draft" and with `draft: false`.

When upstream releases 0.3.0, the follow-up is to replace the pinned files and update the hash
test, flip the label and the draft flag, and rerun the tests listed here. If upstream changes one
of the forms below before the release, its row is reviewed again.

## What changed that the workbench reads

Each row names the upstream change, where the workbench reads that form today, and the test that
covers it. Every test is new unless it says "extend".

### Core semantic model (`core-spec/ossie-schema.json`, `spec.yaml`)

| # | Upstream change | Workbench readers today | Test |
| --- | --- | --- | --- |
| C1 | `version` const is `0.3.0.dev0` | `src/shared/validation/validation.ts` treats any version but `0.2.0.dev0` as Not validated | `tests/validation-ossie-0.3.test.ts`: a 0.3.0.dev0 model gets the 0.3 schema and no Not validated notice. A 0.2.0.dev0 model keeps the 0.2 schema |
| C2 | `custom_extensions` is renamed `nonportable_extensions` on the model, datasets, fields, relationships and metrics | `src/shared/metrics/extension.ts`, `src/shared/edit/item-model.ts`, `src/shared/governance/item-governance.ts`, `src/shared/governance/guards.ts`, `src/server/agent/context-assembly.ts` | `tests/metric-extension-0.3.test.ts`: metric attributes are read from `nonportable_extensions` in a 0.3 model. A 0.2 model still reads `custom_extensions`. A 0.3 model that uses `custom_extensions` fails the schema |
| C3 | Extension `data` is an object, no longer a JSON string | The same readers, which run `JSON.parse(data)` | Same file: object `data` is read without parsing. A string `data` in a 0.3 model is a schema error. Writes into a 0.3 model store an object |
| C4 | `Expression.sql`, a primary portable expression in OSSIE_SQL_2026. `dialects` becomes optional (`anyOf` sql or dialects). `sql` wins over an OSSIE_SQL_2026 dialect entry | `src/shared/validation/validation.ts:339` (requires `dialects`), `src/server/agent/query-plan.ts:122` (`ansiSqlExpression`), `src/shared/metrics/deps.ts:209`, `src/shared/core/model.ts:269`, `src/shared/sql/regions.ts:62` | `tests/validation-ossie-0.3.test.ts`: a `sql`-only expression is valid, and an expression with neither is an error. `tests/agent-query-plan-0.3.test.ts`: the planner uses `sql`, which wins over a dialect entry. `tests/metric-deps-0.3.test.ts`: dependencies are found in a `sql` expression |
| C5 | `Dialect` is a free non-empty string, no longer an enum | No reader checks the enum. The SQL lint already leaves unknown dialects unchecked | `tests/validation-ossie-0.3.test.ts`: a vendor dialect name passes, an empty one fails |
| C6 | `datasets[].metrics`, dataset-scoped metrics that reference their own fields by unqualified name. Field and metric names share one namespace per dataset | `src/shared/core/model.ts` and `src/server/agent/query-plan.ts` read only model-scoped `metrics` | `tests/validation-ossie-0.3.test.ts`: a duplicate field/metric name in one dataset is an error, and a qualified reference to another dataset in a dataset metric is an error. `tests/agent-query-plan-0.3.test.ts`: a dataset metric plans against its own dataset |
| C7 | `AGG(dataset.metric)` in model metrics, and `AGG(source.measure)` in dataset metrics over a measure source. `AGG` anywhere else is reserved | No reader knows `AGG` (only the metric wizard's help text) | `tests/validation-ossie-0.3.test.ts`: `AGG` outside a metric is an error, and `AGG(orders.total)` naming an unknown dataset metric is an error. `tests/agent-query-plan-0.3.test.ts`: `AGG(orders.total_revenue)` expands to the dataset metric's expression |
| C8 | `METRIC(...)` is reserved in OSSIE_SQL_2026 expressions, in every capitalization | None | `tests/validation-ossie-0.3.test.ts`: `METRIC(SUM(x))` and `metric(...)` in an OSSIE_SQL_2026 expression are errors. The same text in a vendor dialect is not |
| C9 | `primary_key` and each `unique_keys` entry have `uniqueItems`. Extension `vendor_name` and dialect `expression` have `minLength: 1` | `src/shared/validation/validation.ts:295` checks key columns against fields | Schema-driven. `tests/validation-ossie-0.3.test.ts`: a repeated key field is an error |

### Ontology (`ontology/ontology.json`)

| # | Upstream change | Workbench readers today | Test |
| --- | --- | --- | --- |
| O1 | `version` const is `0.3.0.dev0` | `src/shared/tessera/bases.ts` (one base), the mapping and ontology validators | `tests/tessera/bases.test.ts` (extend): two bases, the new one labelled "Ossie 0.3.0 draft" with `draft: true`. `tests/tessera/standard-unchanged.test.ts` (extend): the 0.2 fixtures are unchanged |
| O2 | `annotations`, an open object on the ontology, components, relationships and roles | None. The Tessera collision check covers only `tessera_` names | `tests/tessera/schema-derivation.test.ts` (extend): the checked-in revision 1-3 schemas of both bases equal a fresh derivation; `tests/tessera/bases.test.ts` registers both bases through the collision check. `tests/tessera/compile-0.3.test.ts`: standard output keeps a source document's `annotations` |
| O3 | `uniqueItems` on `requires`, `derived_by`, `extends`, `identify_by` and `verbalizes`. `minLength: 1` on names and IRIs | Schema-driven only | `tests/validation-ossie-0.3.test.ts`: a repeated `extends` entry and an empty concept name are errors in 0.3 and not in 0.2 |

### Mapping (`ontology/mapping.json`)

| # | Upstream change | Workbench readers today | Test |
| --- | --- | --- | --- |
| M1 | `version` const is `0.3.0.dev0`, and `custom_extensions` is renamed `nonportable_extensions` | `src/shared/mappings/mapping-schema.ts` (strict, one version) | `tests/validation-ossie-0.3.test.ts`: a 0.3 mapping validates against the 0.3 schema. Mappings stay strict: an unknown version is still an error, not Not validated |

### Compile and conversion

| # | Change in the workbench | Test |
| --- | --- | --- |
| K1 | The compiler keeps the declared version and labels output with the new base. The compiler logic does not change; the base table drives the label and the schema | `tests/tessera/compile-0.3.test.ts`: golden files in `tests/fixtures/ossie-0.3/compile-golden/` for a 0.3.0.dev0 Tessera ontology with the standard 0.3.0.dev0 sales files |
| K2 | Explicit conversion of a document from 0.2.0.dev0 to 0.3.0.dev0: rename C2, object `data` C3, version O1/M1. Preview of every change, base hashes, a clean committed file as backup, nothing applied without confirmation | `tests/compile/base-conversion.test.ts`: preview, confirm, stale hash, dirty file |
| K3 | Metric payload conversion: a `SEMANTIC_WORKBENCH` entry moves from a JSON string to an object under `nonportable_extensions`. Other vendors' entries and `kpi_bindings` stay. Legacy `draft` maps to `proposed`, never to `approved` | `tests/compile/metric-conversion.test.ts`: every status, one mapping binding, two vendors in one file, and a refusal when the result would approve |
| K4 | One compile has one base. A unit whose documents declare different Ossie versions is refused with a finding that names each file and its version. Mixing would give a loss report with two bases | `tests/tessera/compile-0.3.test.ts`: a unit mixing 0.2.0.dev0 and 0.3.0.dev0 is refused, and a unit of one version is not |

K2 starts from the existing convert dialog (`src/app/compile/ConvertDialog.tsx`). It gets one new option, "Convert to Ossie 0.3.0 draft", shown only for a 0.2.0.dev0 document. This is the one intended difference in the UI comparison. The server side reuses `src/server/tessera/convert-service.ts`: the same clean-file check, base hash, preview and ordinary save.

### Pinned files

| # | Change in the workbench | Test |
| --- | --- | --- |
| P1 | The four upstream files are stored unmodified in `schemas/` as `ossie-0.3.0.dev0.json`, `ossie-spec-0.3.0.dev0.yaml`, `ossie-ontology-0.3.0.dev0.json` and `ossie-mapping-0.3.0.dev0.json`. `schemas/README.md` gives the source address, commit, retrieval date and SHA-256 of each | `tests/tessera/pinned-schema-hashes.test.ts`: each file's SHA-256 equals the one in `schemas/README.md`, so changing one byte fails the test. On release, only the release identifier is added |

### Editor and validators

| # | Change in the workbench | Test |
| --- | --- | --- |
| E1 | The editor has no JSON-schema language association. Its diagnostics come from `validateStructured` (`src/app/editor/lint.ts`), which runs the generated validators. `scripts/compile-schemas.ts` adds separate 0.3 outputs, because upstream gives both versions the same remote `$id`. A 0.3 mapping's `$ref` then resolves to the 0.3 core schema, never to 0.2. The validator is chosen from the file's declared `version`. Unknown versions keep the Not validated notice and the write gate | `tests/validation-ossie-0.3.test.ts`: the same text with `version: 0.3.0.dev0` gets 0.3 findings, with `0.2.0.dev0` gets 0.2 findings, and with `0.4` gets Not validated. `tests/editor-lint-0.3.test.ts`: the editor's lint source shows a 0.3-only error (`custom_extensions` in a 0.3 model) at the right line |
| E2 | New files stay 0.2.0.dev0. The New file dialog does not offer 0.3 while it is a draft base | Existing `tests/new-file.test.ts` stays unchanged |

### Dataset-scoped metrics in the browser

`src/shared/core/model.ts` lists each `datasets[i].metrics[j]` as a `Metric` item at that path, with edges to its dataset. Metrics in the graph, the catalog, the Neighborhood view and the item editor then appear without an app change. The item editor already treats any item under a `metrics` list as a metric (`src/shared/edit/item-model.ts`). The Metrics view builds its list in `src/server/agent/explain.ts`, which reads only model-scoped `metrics`. Until that file lists dataset metrics, the Metrics view leaves them out. `docs/compile.md` and the user guide name that limit. Test: `tests/core-model-0.3.test.ts` lists a dataset metric with its path and dataset edge. A 0.2 model's items are unchanged.

## Not changed for the workbench

- The new prose documents (`relational_semantics.md`, `wide_table_semantics.md`, `spec_layers.md`)
  describe query semantics that the workbench does not run. It never executes a metric.
- `core-spec/grammar/OssieExpression.g4` is a reference grammar. The workbench keeps its own
  structural expression rules and does not parse the grammar. C7 and C8 are the only rules it adds.
- Removing the named dialect list does not change the SQL lint, which already treats unknown
  dialects as unchecked.

## Decisions for review

1. **The vendored files.** The brief names `ossie-schema.json` and `spec.yaml`. The ontology and
   mapping schemas changed in the same range (O1-O3, M1), and the Tessera schemas derive from the
   ontology schema. The plan therefore vendors all four at the same commit, each with its SHA-256.
2. **The label.** The document's `version` stays `0.3.0.dev0`, because that is what files declare.
   The base label reads "Ossie 0.3.0 draft", as decided, and `schemas/README.md` gives the full
   development version and commit.
3. **Two forms side by side.** A 0.2 document keeps `custom_extensions` with string `data`. A 0.3
   document uses `nonportable_extensions` with object `data`. The shared readers accept the form
   that matches the declared version. Nothing is converted silently; K2 and K3 are the only paths.

## Guarantees for 0.2 documents

- A 0.2.0.dev0 document reads, validates, saves and compiles byte for byte as before. The existing
  0.2 tests stay unchanged, and `tests/tessera/standard-unchanged.test.ts` checks the bytes.
- Saving a 0.2 file keeps `custom_extensions` with `data` as a JSON string. Only the explicit
  conversion (K2, K3) turns a file into 0.3.
- The shared readers handle both forms, so no browser screen changes. The whole-journey UI
  comparison on 0.2 data shows no difference.
- The generated validators in `src/generated/` come only from `bun run schemas:compile`.

## Status on 2026-11-26

Every row above is implemented on the draft base with its test, except storing the *released*
schemas with a release identifier and a base without "draft", which wait for the 0.3.0 release.
Rows added during the work:

| # | Change in the workbench | Test |
| --- | --- | --- |
| A1 | A metric's address may sit under a dataset, so a dataset metric has its own durable address | `tests/model-addresses-0.3.test.ts` |
| A2 | The approved-metric guard and the attribute schema check cover dataset metrics | `tests/governance/guards-0.3.test.ts`, `tests/validation-ossie-0.3.test.ts` |
| A3 | Rename and delete find bindings and attribute values in 0.3 object data; 0.2 lists are unchanged | `tests/references-0.3.test.ts` |
| A4 | The draft validators load only for a file that declares the draft | `tests/draft-validators-loading.test.ts` |
| A5 | The compile dialog names the base the report declares | `tests/compile/compile-dialog-base.test.tsx` |
| A6 | The Metrics view governs model metrics only; a dataset metric's status is set in the item editor | `tests/metrics-view-0.3.test.ts` |

Where a dataset metric is and is not listed, and the other limits of the draft base, are in
[Ossie 0.3.0 draft: limits](compile.md#ossie-030-draft-limits).
