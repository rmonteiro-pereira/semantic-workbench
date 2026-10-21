# Metrics Layer Proposal

**Feature**: [spec.md](./spec.md) (User Story 1 and FR-001 to FR-016)
**Status**: Proposal; storage decided by the criteria below during planning
**Date**: 2026-10-20

## Recommendation in brief

1. **Ossie metrics stay the core.** Every KPI is an Apache Ossie metric in a semantic model:
   `name`, `expression` (per dialect), `description`, `datatype`, `ai_context`. Formulas live only
   there.
2. **Metrics-layer attributes go into Ossie's extension mechanism first.** What Ossie 0.2.0.dev0
   does not define (metric type, additivity, time grain, breakdowns, filters, unit, ontology
   concepts, targets, ownership, status) is stored in a `custom_extensions` entry with
   `vendor_name: SEMANTIC_WORKBENCH` on the metric itself, validated against a pinned schema.
3. **Fallback: a separate `*.metrics.yaml` file** with a pinned schema, referencing Ossie metrics
   by name, if the extension approach fails the decision criteria below.
4. **Explain, never execute.** For each KPI the workbench shows how it is computed: composition
   tree, expressions, inputs down to ODCS properties, filters, grain, additivity rules, the
   ontology concepts involved, and the planner's SQL as a read-only preview. No query is run, no
   data source is registered and no value is stored.
5. **Portable by construction.** Because KPIs are Ossie metrics and the extension is a standard
   Ossie extension entry, other Ossie tools read the formulas and ignore the workbench entry.

## Why metrics are the center

```
ODCS contract (physical data, quality rules, SLA)
      │  dataset.source = schema object physical name; field expression = property
      ▼
Ossie semantic model (datasets, joins, metrics + workbench extension)   ◄── formulas live here
      │  metric references, governed dependencies
      ▼
Metrics layer (type, grain, additivity, filters, targets, owner)
      │  concept / of / dimensions named by ontology roles
      ▼
Ontology (business vocabulary: what is measured, of what, by what)
      navigates to KPIs, explains them, constrains valid breakdowns
```

The ontology is how a person or an agent finds a KPI ("occupancy of a mall unit by month"), the
metrics layer says exactly how it is defined and judged, and the ODCS contract says where the data
comes from and which quality rules and SLA apply to it.

## Prior art compared

| Approach | Metric types | Time and grain | Filters | Targets / thresholds | Ownership / lifecycle | Ontology link | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Apache Ossie 0.2.0.dev0** (formerly Open Semantic Interchange) | One kind: an aggregate expression per dialect; may span datasets | Only `dimension.is_time` on fields | None on metrics | None | None (`ai_context`, `custom_extensions` only) | Separate Ossie ontology mappings | The open standard the workbench already validates and plans against; needs an extension for KPI metadata |
| **dbt MetricFlow** | simple, ratio, cumulative, derived, conversion | Grain on the time dimension; rollup chosen at query time | `filter` with Jinja `Dimension()` / `Entity()` templates | None | `config.meta`, `group`, `tags` | None | Source of the type taxonomy; Jinja filters and dbt project layout do not fit a standalone editor |
| **Cube** | count, sum, avg, min, max, count_distinct, `number` (derived), rolling windows | Time dimensions with granularities | Measure `filters`, segments | None | `meta` | None | Filtered measures and segments as first-class variants |
| **LookML** | sum, count, average, `number` (derived), percent of total… | `dimension_group` timeframes | Filtered measures | None | Folders and labels | None | Symmetric aggregates against fan-out; proprietary |
| **Malloy** | Measures as composable aggregate expressions | Time truncation in expressions | `{ where: }` on measures | None | None | None | Clean composition; a language rather than an interchange file |
| **ODCS 3.1 quality / SLA** | Data-quality metrics (`nullValues`, `rowCount`, …, custom SQL) with operators | SLA properties (latency, frequency, retention) | n/a | Operators (`mustBeLessThan`, `mustBeBetween`, …) | Contract team and roles | `authoritativeDefinitions` | Threshold vocabulary; quality and SLA shown as trust indicators on KPI inputs |

Taken from each: Ossie for formulas and portability; MetricFlow's type taxonomy and grain chosen
at query time; filtered metrics from Cube, LookML and Malloy; fan-out protection (already in the
planner); ODCS operator names for thresholds.

## Definition model

| Attribute | Meaning |
| --- | --- |
| `label` | Display name (the Ossie `name` stays the identifier) |
| `type` | `simple`, `ratio`, `derived`, `cumulative`, `filtered` |
| `numerator`, `denominator` / `inputs` / `window` | Declared composition; must agree with the Ossie expression (checked, see FR-004) |
| `additivity` | `additive`, `semi_additive` (with `non_additive_over: time` and `period_aggregation`: last, first or average), `non_additive`. Encodes rules that today live only in prose, such as the shopping center model's instruction never to sum area across months |
| `time` | `dimension` (a semantic field with a time role), `min_grain`, `allowed_grains` |
| `dimensions` | Allowed breakdowns (semantic field references), optionally named by ontology role |
| `filters` | Structured conditions `{field, operator, value}`; no free SQL |
| `unit`, `format` | e.g. `percent`, `currency:BRL`, `m2`; display format |
| `concept`, `of` | IRI of the ontology concept the KPI measures, and of the concept it is about |
| `targets` | Per grain: `value` or `range`, `direction` (`higher_is_better`, `lower_is_better`, `in_range`), `thresholds` using ODCS operator names. Declarative only; nothing is evaluated |
| `owner`, `steward` | Person or team |
| `status`, `replaced_by` | `draft` → `proposed` → `approved` → `deprecated` |

Derived, not authored: lineage to ODCS objects and properties, and the explanation.

## Storage, primary: Ossie `custom_extensions`

### What Ossie defines

The pinned schema `schemas/ossie-0.2.0.dev0.json` defines each extension entry as:

```json
"CustomExtension": {"type": "object", "description": "Vendor-specific attributes for extensibility",
  "properties": {"vendor_name": {"$ref": "#/$defs/Vendor"},
                 "data": {"type": "string", "description": "JSON string containing vendor-specific data"}},
  "required": ["vendor_name", "data"], "additionalProperties": false}
```

The core specification text says the same: "Custom extensions allow vendors to add
platform-specific metadata without breaking core compatibility. Each extension includes a vendor
name and arbitrary JSON data", with the schema comment `data: string  # JSON string containing
vendor-specific data`. `vendor_name` is free-form ("allowing any vendor or organization to define
custom extensions without requiring changes to the core specification"). `custom_extensions` is
allowed on the semantic model root, datasets, relationships, fields and metrics; it is not
available on dimensions, expressions, AI context, or in the Ossie ontology schema.

So `data` cannot be a nested YAML mapping: it must be a string holding JSON. The official TPC-DS
example (`public/examples/ossie/tpcds_semantic_model.yaml`) writes it as a YAML literal block
scalar (`data: |`) containing pretty-printed JSON, which keeps it readable and line-diffable.

### Proposed representation

- One entry per metric, `vendor_name: SEMANTIC_WORKBENCH`, `data` as a YAML literal block
  (`|`) holding pretty-printed JSON with one attribute per line and a fixed key order.
- The JSON carries `"schema": "semantic-workbench/metric/v1"`; its content is validated against
  a pinned JSON Schema in `schemas/`, and findings are mapped back to line and column inside the
  YAML file.
- Model-wide defaults (default owner, default time dimension) go in one entry on the semantic
  model root, with `"schema": "semantic-workbench/model/v1"`.
- In JSON-serialized semantic models, `data` is necessarily a single escaped string line.
- The workbench edits only the `data` scalar of the metric being changed; all other bytes stay
  identical.

Illustrative only (names follow the shipped shopping center model; values are examples):

```yaml
metrics:
  - name: occupancy_rate
    description: Occupied over total gross leasable area.
    expression:
      dialects:
        - dialect: ANSI_SQL
          expression: occupied_gla / NULLIF(total_gla, 0)
    custom_extensions:
      - vendor_name: SEMANTIC_WORKBENCH
        data: |
          {
            "schema": "semantic-workbench/metric/v1",
            "label": "Occupancy rate",
            "type": "ratio",
            "numerator": "occupied_gla",
            "denominator": "total_gla",
            "additivity": "non_additive",
            "time": {"dimension": "occupancy_snapshots.month", "min_grain": "month", "allowed_grains": ["month", "quarter", "year"]},
            "dimensions": ["units.floor", "units.segment"],
            "unit": "percent",
            "format": "0.0%",
            "concept": "kpi:OccupancyRate",
            "of": "asset:Unit",
            "targets": [{"grain": "month", "direction": "higher_is_better", "value": 0.95,
                         "thresholds": {"warning": {"mustBeLessThan": 0.92}, "critical": {"mustBeLessThan": 0.88}}}],
            "owner": "Leasing",
            "status": "approved"
          }
```

## Storage, fallback: `*.metrics.yaml`

A project file `kind: MetricsLayer`, `apiVersion: semantic-workbench/metrics/v1`, with
`semantic_model_ref` and `ontology_ref` (same identity rules as Ossie mapping references) and a
`metrics` list keyed by Ossie metric name carrying the attributes above as plain YAML. It is
validated by a pinned schema with the same shared rules as every other format.

## Decision criteria: when the extension "does not work well"

Evaluated during planning on the shipped billing, commerce and shopping center models, with a
prototype of the extension schema and item editor. Any failed criterion selects the fallback file.

| # | Criterion | Passes when |
| --- | --- | --- |
| 1 | Readability in Source | In YAML models, each metric's extension is one contiguous block of pretty-printed JSON; the source editor colors the embedded JSON as JSON and the YAML around it as YAML |
| 2 | Clean Git diffs | In YAML models, changing one attribute changes only that attribute's line(s) in the diff; adding a KPI adds only its own lines |
| 3 | Schema validation with locations | Every schema finding in extension content points to the correct line and column of the YAML file (and to the `data` line in JSON models), with the same messages as other findings |
| 4 | Round-trip byte preservation | Open and save without edits is byte-identical; editing one KPI changes bytes only inside that metric's `data` scalar; block style, chomping and indentation are kept |
| 5 | Editing ergonomics | Every attribute can be edited through the item editor without touching JSON; a target or owner change takes no more steps than with the fallback file |
| 6 | Coverage | Every KPI in the shipped examples is representable; in particular a KPI whose inputs come from two semantic models can be expressed (an Ossie metric cannot reference another model's metrics, so this is the most likely failure) |
| 7 | Interoperability | Files with extensions still pass the pinned Ossie schema unchanged and export byte-identically; the agent runtime and planner ignore or use the extension consistently |
| 8 | JSON-serialized models | A single escaped `data` line is acceptable to the owner for JSON models, or JSON models are a small enough share that criterion 2 is judged on YAML only |

## Binding rules

- **ODCS → semantic**: a dataset whose `source` equals an ODCS schema object's physical name, and
  a field whose expression is a single column equal to a property's physical name, link to that
  object and property. Other expressions are shown as computed, with their source columns.
- **Semantic → metric**: dependencies come from the syntax-tree analysis already used by the agent
  runtime, not text search.
- **Metric → ontology**: `concept` / `of` IRIs plus existing Ossie concept mappings whose bindings
  reference the metric. Dimensions named by ontology roles are offered as breakdowns.
- **Quality and SLA**: ODCS quality rules and SLA properties on a KPI's inputs are shown as
  declared trust indicators; they are not evaluated.

## Explanation: "How it is calculated"

For each KPI the workbench shows, without executing anything:
- the composition tree: ratio numerator and denominator, derived inputs, cumulative window,
  fixed filters, down to base metrics;
- each base metric's expression per dialect, the datasets and fields it reads, and the ODCS
  properties behind them, with join paths the planner would use;
- time dimension, allowed grains, allowed breakdowns and filters;
- additivity rules in plain language ("not summed across months; month-end value is used");
- how division by zero and missing values are handled by the expression, or a flag if they are
  not;
- the ontology concepts and roles involved;
- the SQL the existing planner would generate for a chosen grain and breakdown, labelled
  "preview, not executed". Previews that violate additivity are refused with the reason.

There are no expected-value tests: checking a value requires running a query, which the
workbench does not do. Consistency checks that need no execution stay (declared type versus
expression, references, cycles, grains).

## Authoring workflow in the UI

1. **Find**: Metrics view lists KPIs grouped by ontology concept or owner; search by name, label
   or synonym; filter by status, unit or dataset. Concepts in graph views show KPI badges.
2. **Create** (wizard, validated at each step):
   1. What does it measure? Pick or create the ontology concept (`concept`, `of`).
   2. From which data? Pick ODCS properties or semantic fields; the wizard proposes the dataset.
   3. How? Choose the type; for `simple` choose an aggregation; for `ratio`, `derived`,
      `cumulative` or `filtered` pick input metrics. The Ossie expression is generated from these
      choices and stays editable.
   4. Time and breakdowns: time dimension, grains, allowed dimensions, filters, additivity
      (suggested from type and unit).
   5. Judging: unit, format, direction, target, thresholds.
   6. Governance: owner, steward, status `draft`.
   7. Review the explanation and the SQL preview.
3. **Save**: minimal edits to the semantic model (metric and its extension entry, or the fallback
   file); the changes appear in Source Control.
4. **Review**: status `proposed`; the reviewer reads the explanation and the diff, sets
   `approved`, commits.
5. **Change and deprecate**: editing an approved KPI returns it to `proposed`; deprecation needs
   `replaced_by` or a reason; dependents are listed before any change.

## Sources

- Apache Ossie core specification: https://github.com/apache/ossie/blob/main/core-spec/spec.md
- Apache Ossie incubator proposal: https://cwiki.apache.org/confluence/spaces/INCUBATOR/pages/430408796/OssieProposal
- dbt metrics overview: https://docs.getdbt.com/docs/build/metrics-overview
- Cube measures reference: https://docs.cube.dev/reference/data-modeling/measures
- LookML measure types: https://cloud.google.com/looker/docs/reference/param-measure-types
- Malloy fields: https://docs.malloydata.dev/documentation/language/fields
- ODCS v3.1.0 JSON schema: https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json
