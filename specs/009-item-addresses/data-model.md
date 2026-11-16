# Data Model: Item Addresses

All types are plain data. The functions that operate on them are pure and live in
`src/shared/core/`; the one stateful piece is the migration store in `src/server/projects/`.

## Address

```ts
type ItemKind = 'ontology' | 'model' | 'mapping' | 'contract' | 'concept' | 'relationship' | 'role'
  | 'concept-mapping' | 'object-mapping' | 'link-mapping' | 'dataset' | 'field' | 'join'
  | 'metric' | 'object' | 'property' | 'foreign-key';   // closed registry, version 1

type ItemSegment =
  | { kind: ItemKind; name: string }          // named
  | { kind: ItemKind; position: number };     // positional, volatile

type Address = {
  grammar: 1;
  form: 'absolute' | 'project-relative' | 'document-relative';
  project?: string;            // present only in the absolute form
  document?: string[];         // path parts, unescaped; absent in document-relative form
  chain: ItemSegment[];        // empty for a project or document address
  snapshot?: string;           // absolute forms only
};
```

Validation (all at the parse and format boundary):

- `name` is a non-empty string with no lone surrogate. `position` is an integer at least 0.
- `document` parts are non-empty and never `.` or `..`.
- `chain.length` is at most 32 and the formatted text at most 4,096 characters.
- A relative form has no `snapshot`; a document-relative form has a non-empty `chain`.

## Derived items

```ts
type AddressedItem = {
  address: Address;            // absolute, no snapshot
  kind: ItemKind;
  path: (string | number)[];   // location in the parsed document (what the editor uses)
  volatile: boolean;           // true when any segment is positional
  ambiguous: boolean;          // true when a same-kind sibling has the same name
};

type Resolution =
  | { status: 'found'; item: AddressedItem }
  | { status: 'ambiguous'; items: AddressedItem[] }
  | { status: 'missing' };

type ItemIdentity = { iri: string } | null;   // expanded IRI, or none
```

`Entity` and `Relationship` in `src/shared/core/model.ts` gain `address: Address` (derived
after parsing). `Entity.id` stays as the in-document React key; no new code may use it as a
reference.

## Migration record

```ts
type MigrationKind = 'item' | 'scope' | 'document' | 'reconciliation' | 'deleted';

type MigrationRecord = {
  id: string;                // derived from the operation id and the record index
  kind: MigrationKind;
  from: string;              // canonical absolute address text, no snapshot
  to?: string;               // absent for 'deleted'
  at: string;                // ISO 8601 UTC
  commit: string;            // branch head when saved; empty when the project has no commits
};

type MigrationFile = { formatVersion: 1; records: MigrationRecord[]; compactedBefore?: string };
```

Constraints: `from !== to`; both parse and share the record's project (a cross-project document
move appears in both projects' files); `deleted` has no `to`; count at most 50,000 per file.

State changes: append (inside a journaled operation), compact (at write when the oldest record
passes retention or the file nears its bound), delete with the project.

## Declared migration (request body)

The save and save-batch request bodies gain an optional list:

```ts
type DeclaredMigration = { kind: 'item' | 'scope'; from: string; to: string };
```

At most 64 entries. The server parses both addresses, checks FR-049, stamps `id`, `at` and
`commit`, and writes `MigrationRecord`s. A body without the list behaves exactly as today.

## Conformance fixture entry

```ts
type FixtureEntry =
  | { text: string; parsed: Address; canonical: string }       // valid
  | { text: string; reason: string };                           // invalid
```

## Relationships between the pieces

```text
parsed document --addressesOfModel--> AddressedItem[] --format--> canonical text
canonical text  --parse-------------> Address --resolveInModel--> Resolution
stored text + Resolution(missing) + MigrationRecord[] --migrateAddress--> text (or unchanged)
IRI declared on item --itemIdentity--> ItemIdentity (identity), independent of the address
```
