# Commerce example workspace

Fictional order-to-cash domain. These are illustrative models, not production or external reference data.

- commerce.odcs.yaml: contract for four warehouse tables, types, keys, ownership and business-definition IRIs.
- sales.ossie.yaml: four datasets, three joins, six governed metrics with owner, status and breakdowns (revenue and order count, their ratio, units sold and line revenue by product or customer, and revenue per unit); sources exactly match contract physical names. Regenerate with `bun scripts/commerce-example.ts`; the metrics are declared in `scripts/commerce-metrics.ts`.
- sales.mapping.yaml: binds those metrics to the business concepts below. It only carries bindings and says so in its first line.
- commerce-business.ossie.yaml: eight business concepts using the same IRIs as OWL.
- commerce.owl.ttl / commerce.owl: same OWL ontology in Turtle / RDF/XML, with classes, properties, inverse property and an existential restriction.
- commerce.shacl.ttl: required email, nonnegative order amount, required order lines.
- commerce-data.ttl: readable eight-resource order lifecycle.
- commerce-scale.ttl: 1,000 synthetic business resources, 5,000 explicit business links, plus type and label triples. It is a navigation benchmark, not a claim of validated business rules.

Contract-to-semantic links are physical source names. Ontology links are shared IRIs. The app preserves these definitions; it does not automatically infer cross-document equivalence or execute OWL reasoning / SHACL validation.

## Explicit mapping and agent example

The **Mapped commerce** example imports three additional, independent documents: `commerce.mapped-ontology.yaml`, `commerce.mapped-semantic.yaml`, and `commerce.mapping.yaml`. The mapping references the other two by logical name and local filename. Nested object/referent/link mappings connect Customer and Order to fields; Revenue and OrderCount point to existing governed metrics. Metric formulas occur only in the semantic model. The mapped semantic model carries four governed metrics (gross revenue, order count, their ratio and active customers), each broken down by `customers.region`; `commerce.odcs.yaml` is part of this example so their lineage reaches the contract. Ontology business meaning and ontology-level AI instructions remain in the ontology.

In Mappings, choose all concepts, open **Compose a query…**, select `gross_revenue` and `customers.region`, and preview a newly composed revenue-by-region query. This is not a predefined query; the runtime follows mappings and uses the declared many-to-one join and primary key. See [agent runtime](../../../docs/agent-runtime.md) for HTTP tools, provenance, supported query composition and limits.
