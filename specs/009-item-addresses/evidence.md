# Item address evidence

## Foundations

- Checklist: 16 checked, 0 unchecked. No extension hooks are configured.
- `bun test tests/seeded-random.test.ts tests/item-address.test.ts`: 5 pass, 0 fail, 367 expect() calls.
- The kind registry matches the grammar contract and covers every structured editor kind.

## Integration follow-ups

- Feature 008: snapshot suffixes remain opaque text; no published-snapshot lookup is introduced.
- Feature 010: migration appends must initially use the existing save and batch-save boundaries.

## Pure grammar

- `bun test tests/seeded-random.test.ts tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-purity.test.ts`: 12 pass, 0 fail, 61,989 expect() calls (the randomized assertion count varies with the seed).
- The property run covers 10,000 generated items; boundary tests accept exactly 4,096 characters and 32 segments.
- `bun --bun run check`: passed TypeScript, formatter, lint, comment, theme and brand checks.
- `bun --bun run build`: built in 2.55s; existing large-chunk warning remains.

## Phase 3 blocked: missing derivation contracts

The kind registry says mapping is named, with `name` required for its address. The pinned
`OntologyMap` schema makes that field optional. Removing `ontology_mappings[0].name` from the
Flights fixture and calling `inspect()` succeeds with 55 entities. There is no name to use for
the required mapping scope. Inventing a name or changing the registry to positional would change
the agreed grammar/stability contract.

The mandatory `address: Address` fields in T015 also cover RDF entities and relationships returned
by `inspect()`. Calling it on a Turtle resource with a blank-node object returns `Blank node` and
`RDF resource` entities. The contract supplies no RDF scope/child rules, and structured ontology
inspection also adds built-in concepts that have no source-document path. A required locator
cannot be added to all these typed results without a new contract or a narrower type.

Phase 3 and its dependent adoption phases remain pending, with no boxes marked complete.
The requested clarification offers either a structured-only contract or explicit RDF derivation
rules. The unnamed embedded mapping also needs a named-versus-positional decision before T011.
No UI, persisted-key conversion or migration-store behavior is claimed by this delivery.
