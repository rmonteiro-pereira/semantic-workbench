# Item address grammar

`src/shared/core/item-address.ts` exports `parseAddress`, `formatAddress`, `resolveAddress`, `hasPrefix`,
`replacePrefix` and `displayName`. The application-defined `sw1` format is a locator, not an official Ossie or ODCS
format. It is never written into those documents automatically. Metric-extension `dataset.field` references are
interpreted through the compatibility adapter without rewriting source text; ambiguous matches are refused. The closed
registry and parent rules live in `src/shared/core/address-kinds.ts`.

An absolute item locator looks like `sw1:sales/orders.yaml#model:Orders/dataset:orders`. `sw1:/orders.yaml#model:Orders`
omits the project; `sw1:#model:Orders` omits the project and file. Relative resolution needs an absolute base. Names and
path parts use canonical uppercase UTF-8 percent escapes outside `A-Z a-z 0-9 - . _ ~`. Names are not
Unicode-normalized. Empty names, lone surrogates and dot path parts are rejected. The limits are 4,096 characters and 32
item segments. Unknown kinds and noncanonical encodings fail parsing with a named reason. An absolute address may carry
an opaque `@snapshot` suffix; relative forms cannot. Positional children use `kind:#0`; these locators are volatile
across sibling reordering. Prefix replacement compares complete segments and preserves descendant segments and
snapshots.

Run the portable fixtures and randomized properties with:

```sh
bun test tests/seeded-random.test.ts tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-purity.test.ts
ADDRESS_TEST_SEED=9721 bun test tests/item-address-properties.test.ts
```

`ADDRESS_TEST_SEED` accepts an integer. A failing property includes its seed for replay. The fixtures are in
`tests/fixtures/addresses/conformance.json`. The mapping canvas uses resolved scope addresses for cards and rows.
Synthetic built-ins and unresolved evidence rows keep explicit non-address UI keys. Graph selection and neighborhood
centers use addresses in memory; persisted grouping keys are converted after a verified backup. ODCS lineage derives
addresses from actual schema objects, nested properties and array-item definitions, without parsing dotted display
labels. Dataset fields and metrics use their resolved model scopes. External stubs remain synthetic.

## Kinds and stability

The registry contains **17 kinds**. The portable conformance corpus contains **43 fixtures**: 10 valid, 16 invalid and
17 hostile-name cases.

| Kind | Allowed parent | Segment value |
| --- | --- | --- |
| ontology | root | name when usable; positional otherwise |
| model | root, mapping | name when usable; positional otherwise |
| mapping | root, ontology | name when usable; positional otherwise |
| contract | root | id when usable; positional otherwise |
| concept | ontology | concept when usable; positional otherwise |
| relationship | concept | name when usable; positional otherwise |
| role | relationship | positional |
| concept-mapping | mapping | concept when usable; positional otherwise |
| object-mapping | concept-mapping | positional |
| link-mapping | concept-mapping | positional |
| dataset | model | name when usable; positional otherwise |
| field | dataset | name when usable; positional otherwise |
| join | model | name when usable; positional otherwise |
| metric | model | name when usable; positional otherwise |
| object | contract | name when usable; positional otherwise |
| property | object, property | name when usable; positional otherwise |
| foreign-key | contract | positional |

| Change | Locator behavior |
| --- | --- |
| Named sibling reordered | Stable within the same parent and document |
| Unnamed item or ancestor reordered | Volatile; never stored as migration history |
| Named item renamed or moved | Old locator needs an explicit recorded prefix change |
| External edit or branch switch | No inferred rename; consumers show remove/add |
| Duplicate name under the same parent | Ambiguous; never choose the first match |
| Deleted locator reused | Current resolution is fresh; prior history stays behind its tombstone |
| Declared IRI | Identity can survive a location change; the name-based locator itself promises none |

Consumers parse and format through the shared API, resolve relative forms against an explicit absolute base, and keep
labels separate from locators. Use the result's found/ambiguous/missing status explicitly. Never persist a volatile
locator as history, guess identity from matching names, or pass an unfiltered history to an untrusted reader.
File-stored references cannot contain snapshot suffixes. RDF/SHACL and built-ins remain outside this structured-format
grammar.

## Structured definitions

`addressesOfModel(document, location)` derives locators for Ossie ontology, semantic-model and mapping documents and
ODCS contracts, including embedded and legacy layouts. Nested `properties` lists and array-item schemas are covered.
Array-item schemas use the `property` kind. `location` contains the project slug and document path parts; without it the
locators are document-relative. `resolveInModel` returns found, ambiguous or missing and never selects the first
duplicate. `itemIdentity` returns a declared expanded IRI or null, independently of a name-based locator.

Every item uses its usable name when present and `kind:#<index>` otherwise. The index counts siblings of the same kind
under the same parent, including named siblings. Positional ancestors make every descendant volatile, so those locators
must not be persisted as history. RDF/SHACL resources and implicit built-in concepts have no address in this feature.
Unsupported depth or length reports the source path.

The inspector exposes `StructuredEntity` and `StructuredRelationship` with required `address` fields, while retaining
internal identifiers. `isStructuredEntity` narrows mixed results; RDF and built-in entities have no address. An unnamed
ontology root derives `ontology:#0`; missing, empty, non-string or malformed names derive positional segments rather
than invented names. An array-item node follows declared child properties in the same parent's property sibling order.
`addressAtModelPath` derives one displayed item's locator without enumerating unrelated children.

`adaptItemKey` reads older concept, dataset, field, join and metric labels against a loaded model. It accepts a key only
when exactly one definition matches. Dotted field collisions are ambiguous; alias-qualified text requires an explicit
document-local resolver. Reading a key never rewrites the source document. Canonical locators should be parsed and
resolved through the shared API.
For repeated reads, `itemKeyLookup` prepares canonical and legacy indexes for one unchanged model value.
Validation builds the index lazily and reuses it within that call; callers recreate it after edits.
Canonical keys take precedence over colliding legacy labels.

## Pure migration API

`migrateAddress(address, records, resolved)` leaves a resolving locator unchanged. Otherwise it applies distinct record
IDs once in append order, using whole-segment prefixes and preserving descendants and the opaque snapshot suffix.
Deleted markers stop further replay. `validateDeclaredMigrations(value, project, writtenDocuments)` accepts at most 64
item/scope declarations, requiring canonical absolute, snapshot-free, non-positional locators within the request's
project and files. It returns typed declarations or a closed validation reason.

Migrations remain uncompacted because collapsing interleaved ancestor and descendant rewrites can change replay results.
The store must refuse writes exceeding 50,000 records atomically. `migrationRetentionCut(instant, days)` is a pure
calculation and does not delete history. The server store stages uncompacted appends in the owning journal.
Operation-derived record IDs make replay idempotent, and conflicting reuse of an operation ID is refused.

```sh
bun test tests/address-migration.test.ts
```

## UI adoption boundary

The mapping and lineage canvases use canonical keys in memory and read labels from definitions, never from address
separators. Legacy center preferences are read through `legacyMappingKey` and `legacyLineageKey` during verified
conversion; new stable structured preferences use canonical locators. Volatile locators are not written. Built-in
mapping cards keep their unaddressable legacy UI keys. The standard source bytes stay untouched.

`test:addresses` selects a graph card through its canonical address, reloads and selects the same item again without
changing source bytes. `selectionAddress` and `selectionId` translate at the renderer boundary, so an in-memory
selection follows a named item through sibling reordering. RDF and built-in selections explicitly retain unaddressable
renderer keys. Walk translation preserves unchanged step references so Back and Forward retain their existing
reconciliation.

## Persisted-key inventory

| Store or field | Meaning and conversion |
| --- | --- |
| Shared and personal `views/<project>.json` | `files` keys locate documents; only grouping `assignments` keys are entity locators. `mode` and group `names` retain their meaning. |
| Grouping corrections | Convert stable structured assignment keys; keep and report RDF, built-in, volatile or unresolved keys. Group IDs and display names stay unchanged. |
| Graph layout hints | Node coordinates and layout caches are held in memory. There is no durable item-keyed layout file. |
| Personal and shared drafts | `project` and `path` locate documents; `baseHash`, `text` and `patches` preserve authoring content. They contain no separate entity key to convert. |
| Rejected suggestions | `project`, `path` and `target` are document/project locations; `hash` and `rejectedAt` describe the decision. They contain no item key. |
| File trash metadata | `view` holds the deleted file's grouping value. Its `assignments` keys need the same conversion; document metadata remains document metadata. |
| Project and personal trash views | Archived `view.json` and `views/<project>.json` use the same view shape; archived definitions supply conversion context. |
| Browser mapping/lineage center preferences | Uniquely matched stable card keys convert with a backup; unconvertible values stay unchanged. Other navigation preferences contain no item keys. |
| Browser action history | Selection/centers use addresses in memory; serialized history holds a session/cursor. Reload does not restore a recording. |

Shared views live at `state/views/<project>.json`; personal views live at
`state/users/<owner>/views/<project>.json`. Browser center keys are `workbench:mapping-center:*`
and `workbench:lineage-center:*`. Hop counts, hidden-kind flags, sidebar sizes and theme preferences
contain no item keys.

The inventory test checks the fields of each durable type so a new field requires a conversion decision.

At startup, `state/address-key-conversion.json` marks completed server-side conversion. Before installation, each
affected view is backed up beneath `backup/address-keys-<operation>/` with its original relative path and SHA-256.
Source and store hashes are rechecked before a single journal installs the converted views and completion marker. A
failure leaves the existing stores untouched. Unknown grouping shapes stop conversion; missing, ambiguous, volatile, RDF
and built-in keys are retained in the completion report. Personal views use their owner's working-copy definitions where
present. The grouping API still returns renderer keys, while stable structured assignments are stored as absolute
locators.

Browser canvas centers are converted only when the loaded graph gives the old value one stable meaning. The original
value is retained in the adjacent `:before-item-addresses` storage entry and read back for exact verification before
replacement. Volatile and unaddressable values remain unchanged. Later center choices store canonical stable addresses;
built-in mapping cards retain their explicit unaddressable preference keys. Storage failures keep navigation usable and
report the failure through the existing message/alert surface.

## Declaring a rename when saving

`PUT /api/projects/:project/files/*` accepts optional `declaredMigrations` beside `baseHash` and `source` or `patches`.
`POST /api/projects/:project/save-batch` accepts it beside `files`. Each entry is `{kind: "item" | "scope", from, to}`
with canonical absolute locators. Both endpoints must be stable, snapshot-free, in the request's project, and in files
written by that request. At most 64 entries are accepted. Invalid declarations reject the whole request; omitting the
field preserves existing save behavior. File authorization and content guards still apply to every write.

The server derives record IDs from its journal operation ID and records the current local HEAD (or an empty commit
without Git). History staging and journal execution are synchronous with no intervening await, so concurrent operations
in one workspace process cannot lose an append. Recovery reuses staged records. This does not add client operation keys
or make separate processes sharing one data root supported. These requests enter the shared operation boundary as
`files.save` and `files.saveBatch`; the boundary owns authorization, effect restrictions and audit, not durable receipts
or stable client operation keys. A lost save reply retried against the old base remains a stale save.

The structured item editor declares a stable item's subtree rename in the same single/batch request as ticked reference
rewrites. Source autosave declares named document and embedded scope changes; named-root reordering declares nothing.
Positional or ambiguous scopes/items never enter history. Save acknowledgements must identify the requested files in
order, contain valid SHA-256 hashes, and report HTTP 200 completion before the editor accepts a new base.

File moves, including accepted move suggestions, append document-prefix records with the file move. Cross-project moves
stage the same record in both stores. Project deletion archives the store beside view state; restoration returns it in
the same journal, preserving every historical endpoint byte-for-byte. Restoring under a different slug carries the
history file to the restored project but does not rewrite old locators or infer identity at a reused project address.

Deletion markers cut history through the last matching item or document deletion, using `historySinceDeletion` before
replay. Recreating a locator never restores prior history implicitly; a later explicit reconciliation remains visible
after the cut. A deletion reached while following an older alias stops that alias from resolving to a reused item.
`deletedItemAddresses` derives minimal stable prefixes for explicit workbench deletes and omits positional/ambiguous
items.

Explicit item-deletion saves send optional `deletedItems` beside `declaredMigrations`. Entries are absolute stable item
prefixes in files written by the same request; the server checks that each is a minimal prefix actually removed from the
guarded result. Duplicate, foreign, volatile and unchanged declarations are refused. The item-delete dialog derives
these prefixes for the selected item and removed dependents. A file delete records a document tombstone in its existing
delete journal. Creating an item/file later at the same locator is allowed, but its previous history remains behind the
tombstone.

`POST /api/projects/:slug/item-addresses/reconcile/*` is the `itemAddresses.reconcile` operation. Its JSON body is
`{operationId, from, to}`; the wildcard is the target file path and must match `to`. It requires the same edit
authority as saving the target file, both locators readable, the old locator missing and the new locator unique. It
preserves guarded source text and records only history. The caller supplies a stable operation key; replay returns the
original record and conflicting reuse is refused. Both addresses must be canonical absolute item locators in `:slug`;
volatile or snapshot-qualified reconciliation endpoints are refused. The connection must permit `localWrite`.

`POST /api/projects/:slug/item-addresses/resolve` is the `itemAddresses.resolve` operation. It accepts `{address}` with
a canonical absolute item locator in `:slug` and returns `found`, `ambiguous` or `missing`. It requires project read
access and the connection effect `read`; hidden and absent items both return `{status: "missing"}`. Both routes bound
JSON bodies at `ITEM_ADDRESS_REQUEST_LIMIT` (64,000 bytes) and reject unknown fields with 400. HTTP and trusted
in-process twins share the same handlers and security audit; resolution reads are explicitly audited. No MCP transport
is added. Trusted adapters use `buildTwinRequest` and `handler.boundary.operate`, never direct workspace dispatch.

The workspace resolver returns the same missing result for unreadable and absent items. It checks project and path
visibility before opening definitions or history, resolves current items before applying history, and follows only
visible migration endpoints. Cross-project replay resumes after the move marker shared by both stores, preserving
arrival order even when a document moves back. Deletions follow the history-cut rule above. Snapshot suffixes remain
opaque and are preserved during prefix replacement; until published-snapshot integration, this resolver reads the
current definition and makes no historical-version claim.
