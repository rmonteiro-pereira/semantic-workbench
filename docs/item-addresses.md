# Item address grammar

`src/shared/core/item-address.ts` exports `parseAddress`, `formatAddress`, `resolveAddress`,
`hasPrefix`, `replacePrefix` and `displayName`. The application-defined `sw1` format is a locator,
not an official Ossie or ODCS format. It is never written into those documents automatically.
The closed registry and parent rules live in `src/shared/core/address-kinds.ts`.

An absolute item locator looks like `sw1:sales/orders.yaml#model:Orders/dataset:orders`.
`sw1:/orders.yaml#model:Orders` omits the project; `sw1:#model:Orders` omits the project and file.
Relative resolution needs an absolute base. Names and path parts use canonical uppercase UTF-8
percent escapes outside `A-Z a-z 0-9 - . _ ~`. Names are not Unicode-normalized. Empty names,
lone surrogates and dot path parts are rejected. The limits are 4,096 characters and 32 item
segments. Unknown kinds and noncanonical encodings fail parsing with a named reason.
An absolute address may carry an opaque `@snapshot` suffix; relative forms cannot.
Positional children use `kind:#0`; these locators are volatile across sibling reordering.
Prefix replacement compares complete segments and preserves descendant segments and snapshots.

Run the portable fixtures and randomized properties with:

```sh
bun test tests/seeded-random.test.ts tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-purity.test.ts
ADDRESS_TEST_SEED=9721 bun test tests/item-address-properties.test.ts
```

`ADDRESS_TEST_SEED` accepts an integer. A failing property includes its seed for replay.
The fixtures are in `tests/fixtures/addresses/conformance.json`. UI selection, model derivation
and persisted-key migration have not adopted this API yet.

## Structured definitions

`addressesOfModel(document, location)` derives locators for Ossie ontology, semantic-model and
mapping documents and ODCS contracts, including embedded and legacy layouts. `location` contains
the project slug and document path parts; without it the locators are document-relative.
`resolveInModel` returns found, ambiguous or missing and never selects the first duplicate.
`itemIdentity` returns a declared expanded IRI or null, independently of a name-based locator.

An embedded mapping uses its name when present and `mapping:#<index>` otherwise. Positional
ancestors make every descendant volatile, so those locators must not be persisted as history.
RDF/SHACL resources and built-in concepts have no address in this feature. Unsupported depth or length reports the source path.
