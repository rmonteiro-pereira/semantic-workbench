# Quickstart: Item Addresses

How to see the feature work once it is built, and how a developer adds a consumer.

## Try the grammar

```sh
bun test tests/item-address.test.ts tests/item-address-properties.test.ts
```

The property tests print their seed on failure; re-run one with `ADDRESS_TEST_SEED=<seed>`.

## Try rename and migration

1. Start the workbench with a copy of the sample project (`DATA_DIR` set to a temporary folder).
2. Open a concept with relationships, rename it in the item editor, tick the references and save.
3. Read the migration file: `data/state/address-migrations/<project>.json` holds one `item` record
   whose `from` and `to` are the concept's old and new addresses.
4. Run `bun test tests/address-migration.test.ts` to see an old stored address resolve to the new
   one, and an undone rename leave stored addresses alone.

## Add a consumer

1. Build an address: `formatAddress({ ... })`; never concatenate text.
2. Parse stored text with `parseAddress`; treat a failure as corrupt state, not as a guess.
3. Resolve with `resolveInModel`; on `missing` call `migrateAddress` with the project's records,
   then resolve again.
4. Load `tests/fixtures/addresses/conformance.json` in your tests.
5. Check `contracts/address-grammar.md` section "What a consumer must do".

## Verify no visible change (adoption steps 2 to 4)

```sh
bun test && bun --bun run check && bun --bun run build
bun run test:graph && bun run test:lineage && bun run test:metrics && bun run test:ui
```
