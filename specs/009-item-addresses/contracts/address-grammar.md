# Contract: the `sw1` address grammar

Status: version 1. A change to anything below needs a new prefix (`sw2`), a decision in the design
decisions document, and a conversion for stored addresses.

## Syntax

```text
address        = "sw1:" [ project ] [ "/" location ] [ "#" chain ] [ "@" snapshot ]
project        = 1*segment-char                   ; project slug, escaped
location       = part *( "/" part )               ; project-relative file path, each part escaped
part           = 1*segment-char                   ; never "." or ".."
chain          = item *( "/" item )               ; at most 32 items
item           = kind ":" ( name / "#" position )
kind           = 1*( %x61-7A / "-" )              ; closed registry below
name           = 1*segment-char
position       = "0" / ( %x31-39 *DIGIT )         ; zero-based, no leading zeros
snapshot       = 1*( ALPHA / DIGIT / "." / "_" / "-" )
segment-char   = unreserved / pct-encoded
unreserved     = ALPHA / DIGIT / "-" / "." / "_" / "~"
pct-encoded    = "%" UPHEX UPHEX                  ; uppercase hex, never of an unreserved byte
```

Total length at most 4,096 characters.

### Forms

| Form | Shape | Allowed where |
| --- | --- | --- |
| Project | `sw1:<project>` | stores, MCP |
| Document | `sw1:<project>/<path>` | stores, MCP |
| Item, absolute | `sw1:<project>/<path>#<chain>` | stores, audit, MCP, usage, migrations |
| Item, project-relative | `sw1:/<path>#<chain>` | pointers in a file that name another file of the project |
| Item, document-relative | `sw1:#<chain>` | pointers in a file that name an item of the same file |

A snapshot suffix is allowed on the first three forms and forbidden on the relative forms.

### Escaping

Encode the UTF-8 bytes of a project, path part or name. Every byte outside
`A-Z a-z 0-9 - . _ ~` becomes `%XX` with uppercase hex. Text that is not this exact encoding fails
to parse, so each name has one spelling. No Unicode normalization or case folding is applied.

## Kind registry (version 1)

| Kind | Names | Parent kinds | Name field | Named |
| --- | --- | --- | --- | --- |
| `ontology` | an ontology document | document root | `name` | yes |
| `model` | a semantic model (standalone, legacy list entry, or embedded) | root, `mapping` | `name` | yes |
| `mapping` | a standalone mapping, or an embedded `ontology_mappings` entry | root, `ontology` | `name` | when present; position otherwise |
| `contract` | an ODCS data contract | root | `id` | yes |
| `concept` | an ontology concept | `ontology` | `concept` | yes |
| `relationship` | a relationship of a concept (an attribute is one) | `concept` | `name` | yes |
| `role` | a role of a relationship | `relationship` | none | position |
| `concept-mapping` | a concept mapping | `mapping` | `concept` | yes |
| `object-mapping` | an object mapping of a concept mapping | `concept-mapping` | none | position |
| `link-mapping` | a link mapping of a concept mapping | `concept-mapping` | none | position |
| `dataset` | a dataset | `model` | `name` | yes |
| `field` | a field of a dataset | `dataset` | `name` | yes |
| `join` | a model relationship between datasets | `model` | `name` | yes |
| `metric` | a metric | `model` | `name` | yes |
| `object` | an ODCS schema object | `contract` | `name` | yes |
| `property` | an ODCS property, nested to any depth up to the segment limit | `object`, `property` | `name` | yes |
| `foreign-key` | an ODCS foreign key | `contract` | none | position |

The registry is code, in one table, and the parent column is enforced when an address is resolved
against a model (a parsed address may name a parent kind that does not hold the child; it then
resolves to missing). A kind is added with a registry version bump and a changelog line.

## Stability promise

| Event | Address of the item | Identity (IRI) | What the workbench does |
| --- | --- | --- | --- |
| Reorder siblings, insert, delete others | same | same | nothing |
| Edit any property but the name fields | same | same | nothing |
| Positional item, reorder or delete a sibling | may change | none | volatile, never stored as history |
| Rename the item in the workbench | changes | same | rewrite ticked references, record a migration |
| Rename an ancestor in the workbench | changes | same | one prefix migration for the subtree |
| Rename the document's own name | changes | same | one scope migration |
| Move or rename the file in the workbench | changes | same | one document migration |
| Rename or move outside the workbench | changes | same | nothing; removal plus addition until reconciled |
| Rename the project's display name | same | same | nothing |
| Delete, then create at the same address | same text | different | deletion marker prevents inherited history |

## Pure API (names are indicative; `plan.md` fixes them)

- `parseAddress(text)` returns `{ ok: true, address }` or `{ ok: false, reason }`; never throws.
- `formatAddress(address)` returns the canonical text; throws on an invalid structure.
- `resolveAddress(relative, base)` returns an absolute address or a failure.
- `displayName(address)` returns text for people; not parseable.
- `addressesOfModel(model, document)` lists `{ address, kind, volatile, ambiguous, path }`.
- `resolveInModel(model, address)` returns `found`, `ambiguous` or `missing`.
- `itemIdentity(item, document)` returns an expanded IRI or none.
- `migrateAddress(address, records, resolved)` returns the address unchanged when `resolved` is
  true, and otherwise applies each record once in order.
- Failure reasons are a closed list: `prefix`, `length`, `depth`, `empty`, `escape`, `encoding`,
  `kind`, `position`, `form`, `snapshot`, `trailing`.

## Conformance fixtures

`tests/fixtures/addresses/conformance.json` holds `valid` (text, parsed structure, canonical text),
`invalid` (text, reason) and `hostile` (text, reason or canonical text) lists. Consumers of the
grammar load it in their own tests so the grammar is tested once and reused.

## What a consumer must do

1. Build addresses with the formatter, never by concatenation.
2. Store the absolute form outside files and a relative form inside them.
3. Never store a positional address as history.
4. Apply migrations only to an address that does not resolve (`migrateAddress`).
5. Treat `ambiguous` as unresolved and report it.
6. Never put an address, a slug, a path or an item name in a log line or telemetry label.
7. Never answer differently for a hidden address and a missing one.
