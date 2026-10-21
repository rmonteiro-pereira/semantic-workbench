# Schema snapshots

Downloaded 2026-10-15 from the standards' official repositories:

- ODCS v3.1.0: https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json
- Apache Ossie 0.2.0.dev0: https://github.com/apache/ossie/blob/main/core-spec/ossie-schema.json

Both projects are Apache-2.0 licensed. These checked-in files are local snapshots; Ossie 0.2.0.dev0 is an unreleased, mutable draft. No schema is fetched at runtime. The upstream standards take precedence over companion schema errors. Other contract versions currently receive structural checks only.

Mapping support adds immutable snapshots from Apache Ossie commit `64a1ae44035f5360dcd53401a29bcd900fdce349` (retrieved 2026-10-16): `ontology/mapping.json`, `ontology/ontology.json`, and `core-spec/ossie-schema.json` (the mapping dependency snapshot). Remote `$ref`s resolve to these local files; validation never fetches schemas. The original core semantic snapshot remains in use for existing semantic imports, so mapping support does not silently change their schema version. Versioned ontologies now use the pinned ontology schema; earlier unversioned examples retain the compatibility profile.

## Application schemas (not part of any standard)

`semantic-workbench-metric-v1.json` and `semantic-workbench-mapping-v1.json` are Semantic Workbench's own schemas for the JSON it stores in Ossie `custom_extensions` entries with `vendor_name: SEMANTIC_WORKBENCH`: KPI attributes on a metric, and KPI-to-concept bindings on the root of a mapping document (or of the semantic model embedded in a consolidated file). They are application choices, not Apache Ossie semantics; other Ossie tools ignore these entries. Drafts live in `specs/001-workbench-improvements/contracts/`; a change to an application schema is published as a new versioned file.
