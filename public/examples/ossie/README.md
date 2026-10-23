# Official Apache Ossie examples

All five files in the upstream `examples/` directory are snapshotted unchanged from Apache Ossie commit `64a1ae44035f5360dcd53401a29bcd900fdce349` (also the upstream main HEAD when verified on 2026-10-16). `manifest.json` records immutable URLs and SHA-256 hashes. The source files retain their ASF license headers.

- `flights.ontology.yaml`, `flights.semantic_model.yaml`, `flights.mapping.yaml`: separate ontology, semantic model and standalone mapping.
- `flights.yaml`: ontology with the deprecated embedded semantic model/mappings.
- `tpcds_semantic_model.yaml`: retail semantic model with five datasets and eight metrics, including window expressions.

`bun run test:examples` imports all five through the HTTP handler into isolated SQLite, verifies byte-exact exports and hashes, and resolves both Flights mapping forms (60 bindings each, two conditional bindings). Two mapped airport projections execute on a synthetic SQLite mirror. The test adapter changes only the SQL catalog prefix `DATABASE.SCHEMA` to `flights`; original inputs and previews remain unchanged.

TPC-DS declares `ss_ticket_number` as a primary-key column but does not expose it in the logical field list. This is a coverage warning, not a syntax/schema rejection: physical key metadata and the public logical field list need not coincide. The model still imports unchanged (13 graph nodes, 17 links). Its advanced window expressions are preserved, inspected, and exported; **their query execution is not claimed**. The upstream example does not include an ontology mapping or physical warehouse data.

## Workbench additions

**Load Ossie Flights** also loads three files that are not part of the upstream examples and are not listed in `manifest.json`. Each starts with `# Workbench addition`:

- `flights.metrics.semantic.yaml`: a semantic model that repeats the Flights tables the metrics read (`FLIGHT`, `CARRIER`, `ROUTE`, `AIRPORT`), declares the joins between them (the upstream model declares none) and defines seven governed metrics: flights, total distance, departure and arrival delay, delay recovered (derived), average arrival delay and average flight distance (ratios). Each has an owner and a status, and can be broken down by carrier or by departure airport.
- `flights.metrics.mapping.yaml`: binds those metrics to Flights concepts.
- `flights.odcs.yaml`: a data contract for the four tables, so the metrics' lineage reaches a contract.

`bun run test:examples` checks the upstream files against the hashes in `manifest.json` and fails if one changes. `tpcds_semantic_model.yaml` is not loaded by an example and gets no additions.

Flights' conditional population mappings are preserved and reported; they are not silently applied as query-wide filters. `bun run test:examples:ui` exercises imports, graph rendering, mapping/context inspection, actual SQL preview execution on the synthetic mirror, exports, and the generated billing model.
