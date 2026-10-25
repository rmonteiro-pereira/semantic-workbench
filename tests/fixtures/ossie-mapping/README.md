# Pinned Apache Ossie fixtures

The five upstream example files are unchanged snapshots from Apache Ossie commit
`64a1ae44035f5360dcd53401a29bcd900fdce349`, verified on 2026-10-16. `manifest.json` records their
immutable source URLs and SHA-256 hashes. Preserve the files and ASF license headers exactly;
do not repair an upstream example to satisfy a test.

The public [Ossie example guide](../../../public/examples/ossie/README.md) explains the layouts,
coverage warning, conditional mappings and separately labelled workbench additions. Those added
metric/contract files are not part of this upstream fixture manifest.

`bun run test:examples` imports these fixtures through the handler into a temporary file workspace,
checks source/export hashes and resolves both Flights mapping forms. Separate verification code
runs two airport projections on a synthetic SQLite mirror. It changes only the generated SQL's
catalog prefix for that test; source definitions and original previews remain unchanged.

TPC-DS must retain its documented physical-key coverage warning and advanced window expressions.
Its query execution is not claimed. Conditional Flights bindings remain evidence rather than
silently becoming query-wide filters. The application does not execute the fixture SQL.
