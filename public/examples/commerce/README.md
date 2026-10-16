# Commerce example workspace

Fictional order-to-cash domain. These are illustrative models, not production or external reference data.

- commerce.odcs.yaml: contract for four warehouse tables, types, keys, ownership and business-definition IRIs.
- sales.ossie.yaml: four datasets, three joins, three metrics; sources exactly match contract physical names.
- commerce-business.ossie.yaml: eight business concepts using the same IRIs as OWL.
- commerce.owl.ttl / commerce.owl: same OWL ontology in Turtle / RDF/XML, with classes, properties, inverse property and an existential restriction.
- commerce.shacl.ttl: required email, nonnegative order amount, required order lines.
- commerce-data.ttl: readable eight-resource order lifecycle.
- commerce-scale.ttl: 1,000 synthetic business resources, 5,000 explicit business links, plus type and label triples. It is a navigation benchmark, not a claim of validated business rules.

Contract-to-semantic links are physical source names. Ontology links are shared IRIs. The app preserves these definitions; it does not automatically infer cross-document equivalence or execute OWL reasoning / SHACL validation.
