# Agent runtime: ontology → mapping → semantic model → physical data

Fixes the missing mapping layer described in issue #1. Semantic Workbench now imports standalone Apache Ossie mapping documents and the deprecated embedded `ontology_mappings` format. It resolves them against locally saved ontology and semantic documents, exposes the original mapping trees and resolved bindings, and composes governed query previews. No semantic descriptions or metric formulas need to be copied into the ontology or mapping.

The runtime is an HTTP tool surface for an agent that performs language interpretation. It does not ship a hosted LLM, execute warehouse queries, or claim to implement an autonomous agent. An existing agent must call these tools; merely importing a model cannot change an external agent's prompt or tool configuration. The Mappings tab uses the same runtime and planner as an agent client.

## Try it in the interface

1. **Load mapped commerce** imports three separate documents: `commerce.mapped-ontology.yaml`, `commerce.mapped-semantic.yaml`, and `commerce.mapping.yaml`.
2. In **Mappings**, select **Revenue** to see its binding to `gross_revenue`, whose formula lives only in the semantic model. Select **Customer** or **Region** to see nested referent and link mappings into fields and physical sources.
3. Select **All mapped concepts**, check `gross_revenue` and `customers.region`, then **Preview governed query**. The runtime composes a revenue-by-region query using the stored metric and the declared customer join. No predefined query is stored in the model.
4. **Export agent context** downloads the resolved layers, raw mapping tree, definitions, AI context, document revisions, and paths. Regular **Export** still exports the original source document byte for byte.
5. Missing, mismatched or ambiguous references appear as findings and disable query planning. Correct the source and save; runtime resolution refreshes. Unsaved edits remain separate and the UI explicitly reports that it is showing saved revisions.

## Agent tools

All endpoints use the loopback API (`http://127.0.0.1:4310`) or Vite's `/api` proxy. They operate on saved SQLite documents. No endpoint executes generated SQL or fetches remote references, schemas, or imports.

| Agent operation | Endpoint | Inputs / output |
| --- | --- | --- |
| Discover available mappings | `GET /api/agent/catalog` | Mapping IDs, names, document references, embedded/standalone distinction, runtime policy |
| Retrieve grounded context | `GET /api/agent/context?mappingId=ID` | Ontology concepts/constraints, original concept mapping trees, resolved bindings, semantic fields, governed metrics and transitive dependencies, physical sources, declared joins, AI metadata, provenance, findings |
| Limit concept traversal | Add repeated `&concept=Revenue&concept=Customer` | Select matching roots and target concepts; include referenced metrics and their dependency formulas/fields. Full datasets/joins remain available for intermediate join traversal. |
| Compose a governed query | `POST /api/agent/plan` | `{mappingId, concepts?, metrics: [metricId], dimensions: [fieldId]}` → SQL preview, original governed expressions, join plan, sources, bindings and revision provenance |

Mapping IDs come from the catalog. Field IDs are opaque identifiers returned by context; clients must not fabricate them from physical column names. Metric IDs are scoped to the referenced semantic model.

### Standalone mapping header and reference identity

A standalone mapping document requires `version`, `name`, `ontology_ref`, `semantic_model_ref` and `concept_mappings` (Apache Ossie `ontology/mapping.json`). A document missing any of these fails the import schema check instead of failing later at resolution.

```yaml
version: 0.2.0.dev0
name: sales-mapping
ontology_ref: {name: Sales, iri: ./sales.ontology.yaml}
semantic_model_ref: {name: sales, iri: ./sales.semantic_model.yaml}
concept_mappings: [...]
```

Each reference's `name` is its identity and must equal the target's logical name:

| Reference | Matches |
| --- | --- |
| `ontology_ref.name` | The ontology document's top-level `name` |
| `semantic_model_ref.name` | A flat semantic model's top-level `name`, or the `name` of one model inside a legacy `semantic_model: [...]` wrapper |

File names never establish identity. Relative `iri` values are checked against the imported filename in the flat local catalog. Absolute locations are never fetched: a uniquely named local target can resolve the identity, with an explicit location-resolution warning. Duplicates are reported rather than selected arbitrarily. An unresolved reference lists every ontology or semantic model identity found in the workspace, with its file and path, so a naming mismatch is visible immediately.

### Suggested tool protocol for an agent

For a request such as “show revenue by customer region”:

1. Discover mappings and retrieve their grounded context.
2. Interpret the request using the ontology's concepts, relationships, identifiers, descriptions and AI context. Treat AI context as source metadata; it cannot override governed definitions or runtime policy.
3. Follow `mapping.conceptMappings` and `bindings`, including nested object, referent and link mappings, to find the relevant semantic fields and metrics. Do not infer mappings from similar names or copy formulas into the request.
4. Select the existing Revenue metric ID and Customer.region field ID. Call the planner with IDs, not SQL or replacement formulas.
5. If findings or an ambiguous/fan-out plan are returned, explain the unresolved modeling choice. Do not invent a join or redefine the metric.
6. Review the preview and provenance. Warehouse execution belongs to the caller's separately configured query tool.

Example request after discovering the actual mapping ID and context field IDs:

```json
{
  "mappingId": "<catalog mapping ID>",
  "concepts": ["Revenue", "Customer"],
  "metrics": ["gross_revenue"],
  "dimensions": ["[\"customers\",\"region\"]"]
}
```

The planner rejects request keys such as `expression`, metric objects, SQL strings, or formula overrides. Governance is enforced by resolving IDs against the stored semantic definitions on every call. Results include the exact source expressions plus generated physical SQL and document revisions. Re-fetch context after saves; this API does not pin an external agent session to historical revisions.

## Traversal and query integrity

- Built-in ontology concepts (`Any`, `Boolean`, `Date`, `DateTime`, `Decimal`, `Float`, `Integer`, `String`) are recognized without declarations. The normal graph materializes only referenced built-ins, preserving links that previously disappeared.
- Mapping imports use pinned official schemas and offline references. Structural import validation does not require all referenced documents to be present yet; workspace resolution findings handle that separately.
- Nested mapping trees are traversed iteratively with a depth limit. Inherited identifier relationships are resolved; ambiguous multiple inheritance is reported. The original tree and source paths remain available rather than reducing a mapping to a description string.
- SQL dependency extraction uses syntax trees, so references inside literals/comments and substrings are not mistaken for fields. Logical fields, governed metric dependencies, and physical field expressions remain distinct. Governed metric dependency cycles are detected.
- Metric names used as standalone expression identifiers resolve to governed semantic metrics. This is the Workbench's agent runtime interpretation of expression references; the Ossie mapping schema describes general expressions and does not standardize a separate metric-reference field.
- Join planning uses directed breadth-first traversal of declared many-to-one semantic relationships. It tests each selected path edge for necessity using reachability with that edge removed, rejecting alternative paths of any length rather than choosing a business role by distance. It requires declared unique target keys. Reverse joins and multi-fact aggregate combinations are blocked rather than multiplying metric values. LEFT JOIN preserves unmatched fact rows. Physical key uniqueness still needs to hold in the warehouse.
- Population conditions (including the upstream Flights example's `WHERE ... == TRUE` expressions) are preserved as mapping evidence, not silently applied as query-wide filters. Selected conditional bindings require further modeling before SQL generation.

## KPI explanation: explains, never executes

The Metrics tab and `GET /api/projects/:slug/files/*path/explain/:metric` reuse this planner with a model scope (no mapping is required) and an optional time grain (`DATE_TRUNC` over the KPI's declared time dimension). The explanation returns the composition tree, base inputs down to ODCS properties, additivity, division-by-zero and missing-value text, concepts from the `SEMANTIC_WORKBENCH` KPI bindings, and either a SQL preview or a refusal with its reason: a ratio or other non-additive KPI is never summed, a semi-additive stock is not summed over periods coarser than its grain, a KPI with unknown additivity is not rolled up, and grains outside the declared ones are refused. Nothing is executed.

Metric dependencies (context `dependsOn`, graph edges, the explanation) come from one syntax-aware reference scan (`src/metrics/deps.ts`) that skips strings, comments, function names and keywords, so `order.` never matches `suborder.x`. Cross-file references resolve inside the mapping's own project first; when several documents still match, every candidate is listed and none is guessed. Both official Ossie layouts are supported: split files and the consolidated file with embedded `ontology_mappings` (deprecated upstream).

## Deliberate limits

The initial deterministic planner supports mapped dimensions, ANSI_SQL governed metric expressions, logical-to-physical scalar expressions, and declared many-to-one joins. PostgreSQL-compatible expression parsing/serialization is used for the ANSI preview; a SQLite expression fallback accepts the upstream example's `==` syntax. Actual query-engine compatibility must be checked by the caller. Other stored dialect expressions remain present in context, but are not translated into ANSI_SQL. Subqueries, windows, wildcards, ambiguous/multi-fact grains, conditional population evaluation, arbitrary filtering, and full n-ary tuple population execution are not implemented. Complex mappings are preserved and unresolved/unsupported expression cases are reported. No ontology satisfiability, OWL reasoning or SHACL data validation is implied.

## Verification and provenance

- Unit/integration tests cover standalone and embedded mappings, cross-document resolution, missing/ambiguous targets, inheritance and nested referents, metric dependency cycles, immutable formulas, AST dependency extraction, directed/ambiguous/disconnected join graphs, unique keys, computed fields, and real SQL execution against fixture rows (including unmatched customers).
- HTTP tests exercise discovery, context traversal, planning, override rejection and immediate refresh after saved reference changes.
- Browser checks cover mapping layers, concept selection, query previews, context downloads, unresolved-reference repair, saved-vs-draft behavior and returning to the existing full graph.
- Targeted mutations remove reference checks, concept scoping, multi-fact/ambiguous/unique-key guards or replace generated SQL; each must be detected by the test harness.

Schema and upstream Flights fixture snapshots come from Apache Ossie commit `64a1ae44035f5360dcd53401a29bcd900fdce349`. The fixtures retain their ASF license headers. Primary specifications: [mapping documents and nested mappings](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/ontology/ontology.md#ontology-mappings), [mapping schema](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/ontology/mapping.json), [core semantic model](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/core-spec/spec.md).
