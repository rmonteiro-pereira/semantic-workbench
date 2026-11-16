# Item address grammar

`src/shared/core/item-address.ts` exports `parseAddress`, `formatAddress`, `resolveAddress`,
`hasPrefix`, `replacePrefix` and `displayName`. The application-defined `sw1` format is a locator,
not an official Ossie or ODCS format. It is never written into those documents automatically.
Metric-extension `dataset.field` references are interpreted through the compatibility adapter without rewriting source text; ambiguous matches are refused.
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
The fixtures are in `tests/fixtures/addresses/conformance.json`. The mapping canvas uses resolved scope addresses for cards and rows. Synthetic built-ins and
unresolved evidence rows keep explicit non-address UI keys. Graph selection and neighborhood centers use addresses in memory; persisted-key conversion
is not adopted yet. ODCS lineage derives addresses from actual schema
objects, nested properties and array-item definitions, without parsing dotted display labels.
Dataset fields and metrics use their resolved model scopes. External stubs remain synthetic.

## Structured definitions

`addressesOfModel(document, location)` derives locators for Ossie ontology, semantic-model and
mapping documents and ODCS contracts, including embedded and legacy layouts. Nested `properties`
lists and array-item schemas are covered. Array-item schemas use the `property` kind. `location` contains
the project slug and document path parts; without it the locators are document-relative.
`resolveInModel` returns found, ambiguous or missing and never selects the first duplicate.
`itemIdentity` returns a declared expanded IRI or null, independently of a name-based locator.

Every item uses its usable name when present and `kind:#<index>` otherwise. The index counts
siblings of the same kind under the same parent, including named siblings. Positional
ancestors make every descendant volatile, so those locators must not be persisted as history.
RDF/SHACL resources and implicit built-in concepts have no address in this feature. Unsupported depth or length reports the source path.

The inspector exposes `StructuredEntity` and `StructuredRelationship` with required `address`
fields, while retaining internal identifiers. `isStructuredEntity` narrows mixed results; RDF
and built-in entities have no address. An unnamed ontology
root derives `ontology:#0`; missing, empty, non-string or malformed names derive positional
segments rather than invented names. An array-item node follows declared child properties in
the same parent's property sibling order.
`addressAtModelPath` derives one displayed item's locator without enumerating unrelated children.

`adaptItemKey` reads older concept, dataset, field, join and metric labels against a loaded model.
It accepts a key only when exactly one definition matches. Dotted field collisions are ambiguous;
alias-qualified text requires an explicit document-local resolver. Reading a key never rewrites
the source document. Canonical locators should be parsed and resolved through the shared API.

## Pure migration API

`migrateAddress(address, records, resolved)` leaves a resolving locator unchanged. Otherwise it
applies distinct record IDs once in append order, using whole-segment prefixes and preserving
descendants and the opaque snapshot suffix. Deleted markers stop further replay.
`validateDeclaredMigrations(value, project, writtenDocuments)` accepts at most 64 item/scope
declarations, requiring canonical absolute, snapshot-free, non-positional locators within the
request's project and files. It returns typed declarations or a closed validation reason.

Migrations remain uncompacted because collapsing interleaved ancestor and descendant rewrites
can change replay results. The store must refuse writes exceeding 50,000 records atomically.
`migrationRetentionCut(instant, days)` is a pure calculation and does not delete history. These APIs do not append history or change save routes yet.

```sh
bun test tests/address-migration.test.ts
```

## UI adoption boundary

The mapping and lineage canvases use canonical keys in memory and read labels from definitions,
never from address separators. During the first adoption steps, center preferences are still
serialized through `legacyMappingKey` and `legacyLineageKey`; volatile locators are not written.
The adapters preserve existing store shapes until explicit persisted-key conversion. Built-in
mapping cards keep their unaddressable legacy UI keys. The standard source bytes stay untouched.

`test:addresses` selects a graph card through its canonical address, reloads and selects the same
item again without changing source bytes. `selectionAddress` and `selectionId` translate at the
renderer boundary, so an in-memory selection follows a named item through sibling reordering.
RDF and built-in selections explicitly retain unaddressable renderer keys. Walk translation
preserves unchanged step references so Back and Forward retain their existing reconciliation.

## Persisted-key inventory

| Store or field | Meaning and conversion |
| --- | --- |
| Shared `state/views/<project>.json` and personal `state/users/<owner>/views/<project>.json` | `files` keys are document paths. Each grouping value contains `mode`, `assignments` and `names`; only `assignments` keys are entity locators. Group names and grouping-mode values retain their meaning. |
| Grouping corrections | `assignments` maps an inspector entity ID to a group ID. Stable structured entities can be converted; RDF, built-ins, volatile and unresolved keys must be kept and reported. `names` maps group IDs to display names, not item addresses. |
| Graph layout hints | Node coordinates and layout caches are held in memory. There is no durable item-keyed layout file. |
| Personal and shared drafts | `project` and `path` locate documents; `baseHash`, `text` and `patches` preserve authoring content. They contain no separate entity key to convert. |
| Rejected suggestions | `project`, `path` and `target` are document/project locations; `hash` and `rejectedAt` describe the decision. They contain no item key. |
| File trash metadata | `view` holds the deleted file's grouping value. Its `assignments` keys need the same conversion; document metadata remains document metadata. |
| Project and personal trash views | Archived `view.json` and `views/<project>.json` use the same view shape; archived definitions supply conversion context. |
| Browser `workbench:mapping-center:*` and `workbench:lineage-center:*` | Values are card keys. A uniquely matched stable card can be converted, retaining a backup of the original value. Unconvertible values stay unchanged. Hop counts, hidden-kind flags, sidebar sizes and theme preferences contain no item keys. |
| Browser action history | Selection and neighborhood centers use addresses in memory. Browser history entries contain a session/cursor, not serialized item keys; reload does not restore an action recording. |

The inventory test checks the fields of each durable type so a new field requires a conversion decision.
