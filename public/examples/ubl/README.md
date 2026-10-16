# UBL 2.3 procurement-to-payment

45 business entities, 277 named aggregate relationships, derived from OASIS UBL 2.3 XSDs. The selected business documents are Order, Invoice, DespatchAdvice, ReceiptAdvice and CreditNote; shared aggregates include Party, Item, Shipment, Consignment, TaxTotal, PaymentMeans and FinancialAccount.

Source: https://docs.oasis-open.org/ubl/UBL-2.3.html
Schemas: https://docs.oasis-open.org/ubl/os-UBL-2.3/xsd/

## Artifacts

- ubl.ontology.yaml: Ossie ontology; source role names and occurrence counts retained.
- ubl.owl.ttl: 45 OWL classes and 277 domain/range object properties, with schema provenance.
- ubl.shacl.ttl: projected aggregate-role cardinality and target-class constraints.
- ubl.odcs.yaml: 169 normalized tables, basic fields, surrogate IDs and repeatable-role bridge tables.
- ubl.semantic.yaml: matching datasets, 401 joins and three count metrics.
- model-map.json: extracted references and cardinalities for auditing and regeneration.

This is an application-specific projection of an established business model, not an official OASIS OWL/SHACL or relational standard. UBL components outside the selected subset are not expanded. SHACL covers selected aggregate roles, not complete XML conformance. Analytical keys, normalization and primitive-type mappings are explicit application choices. Repeating XML basic fields become arrays.

Regenerate from the project root: python3 scripts/extract-ubl.py then bun scripts/ubl-example.ts.
