# Official Apache Ossie examples

All five files in the upstream `examples/` directory are snapshotted unchanged from Apache Ossie
commit `64a1ae44035f5360dcd53401a29bcd900fdce349`, also the upstream main HEAD when verified on
2026-10-16. The `manifest.json` file records immutable URLs and SHA-256 hashes. The source files
retain their ASF license headers.

- `flights.ontology.yaml`, `flights.semantic_model.yaml`, `flights.mapping.yaml`: separate ontology,
  semantic model and standalone mapping.
- `flights.yaml`: ontology with the deprecated embedded semantic model/mappings.
- `tpcds_semantic_model.yaml`: retail semantic model with five datasets and eight metrics,
  including window expressions.

`bun run test:examples` imports all five through the HTTP handler into a temporary file
workspace, verifies byte-exact exports/hashes, and resolves both Flights mapping forms
(60 bindings each, two conditional bindings). Separate verification code executes two mapped
airport projections on a synthetic SQLite mirror. The test adapter changes only the SQL catalog
prefix `DATABASE.SCHEMA` to `flights`; original inputs and previews remain unchanged. The
application itself never executes these queries.

TPC-DS declares `ss_ticket_number` as a primary-key column but does not expose it in the logical
field list. This is a coverage warning, not a syntax/schema rejection: physical key metadata and
the public logical field list need not coincide. The model still imports unchanged, with
13 graph nodes and 17 links. Its advanced window expressions are preserved, inspected and
exported; **their query execution is not claimed**. The upstream example does not include an
ontology mapping or physical warehouse data.

## Workbench additions

Choose **Examples → Load Ossie Flights** in the sidebar. Alongside the upstream Flights files,
this loads three workbench additions. They are not listed in the upstream `manifest.json`;
each starts with `# Workbench addition`:

- `flights.metrics.semantic.yaml`: a semantic model of the Flights tables the metrics read:
  `FLIGHT`, `CARRIER`, `ROUTE` and `AIRPORT`. It declares their joins, which are absent from the
  upstream model, and seven governed metrics: flights, total distance, departure delay, arrival
  delay, delay recovered (derived), average arrival delay and average flight distance (ratios).
  Each has an owner and a status, and supports breakdowns by carrier or departure airport.
- `flights.metrics.mapping.yaml`: binds those metrics to Flights concepts.
- `flights.odcs.yaml`: a data contract for the four tables, so the metrics' lineage reaches a
  contract.

`bun run test:examples` checks the upstream files against the hashes in `manifest.json` and fails
if one changes. The TPC-DS file is not loaded by an example and gets no additions.

Flights' conditional population mappings are preserved and reported; they are not silently
applied as query-wide filters. With the development server running, `bun run test:examples:ui`
checks imports, graph rendering, mapping/context inspection, exports and the generated billing
model. Its test code also executes SQL previews on the synthetic mirror, outside the application.
