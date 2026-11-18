# Contract: the Tessera format, revision 1

This is the document format that the validator accepts and the compiler reads. The names in code
come from one definition (`src/shared/tessera/format.ts`); the words below are the current values.

## Marker

```yaml
tessera: 1          # YAML
version: 0.2.0.dev0 # the Ossie base, as in any Ossie ontology
name: Retail
ontology:
  - concept: Order
    type: entity
    tessera_notes: Ask finance before adding a Return concept.
```

```json
{ "tessera": 1, "version": "0.2.0.dev0", "name": "Retail", "ontology": [] }
```

- The marker is the top-level key `tessera`. It is a whole number of at least 1 and names the
  revision of the Tessera rules the document uses.
- It is read only on documents that have a top-level `ontology` array. On any other Ossie document
  or on ODCS it is a finding (`tessera-kind`). On RDF files it has no meaning and is never read.
- A document declares the revision of the newest addition it uses, or any higher revision that the
  workbench supports. Revision 1 is the only revision today.

## Bases

| Base (`version`) | Label in output | Draft | Pinned schema | Derived schema |
| --- | --- | --- | --- | --- |
| `0.2.0.dev0` | valid against the bundled Ossie 0.2.0.dev0 draft | yes | `schemas/ossie-ontology-0.2.0.dev0.json` | `schemas/tessera-ontology-1-ossie-0.2.0.dev0.json` |

A Tessera document without a `version`, or with another value, is invalid (`tessera-base`).

## Registry of additions

| Name | Since | Places | Value | Compiler | Owner |
| --- | --- | --- | --- | --- | --- |
| `tessera_notes` | 1 | ontology root, each `ontology[]` concept, each `relationships[]` entry of a concept | non-empty string, at most 10,000 characters | drop, reported as a loss | this feature |

"Drop" means the property is removed from the output and listed in the loss report. The other
dispositions a later feature may choose are **translate** (the compiler writes a standard Ossie
construct; it must define the exact rewrite and its meaning check) and **refuse** (the compile
fails when the property is present).

## Reserved names (not available in revision 1)

`tessera_ai_context`, `tessera_governance`, `tessera_attributes`, `tessera_imports`.

Using one gives `tessera-reserved`. Any other property starting with `tessera_` gives
`tessera-property`. A registered name in a place that is not listed gives `tessera-location`.
A registered name used by a document that declares a lower revision than the entry's gives
`tessera-revision`.

## Finding codes

| Code | Severity | When | Path |
| --- | --- | --- | --- |
| `tessera-marker` | error | marker is not a whole number of at least 1 | `/tessera` |
| `tessera-revision` | error | revision above the supported ones, or an addition needs a higher revision | `/tessera` or the property |
| `tessera-base` | error | `version` missing or not a supported base | `/version` |
| `tessera-kind` | error | marker on a document that is not an ontology | `/tessera` |
| `tessera-property` | error | unregistered `tessera_` property | the property |
| `tessera-reserved` | error | reserved name | the property |
| `tessera-location` | error | registered property in a place not listed | the property |
| `schema` | error | the derived schema rejects a value (empty notes, too long, wrong type) | as the schema reports |

Every finding message names the property, says what is allowed and, for revisions, lists the
supported ones. No Tessera finding is a notice: a Tessera document is never "not validated".

## Derived schema

`deriveTesseraSchema(base, registry, revision)` returns the pinned ontology schema with only these
differences:

1. `$id` names the revision and the base.
2. The root property `tessera` is required and has the constant revision list `[1]`.
3. Each registry entry becomes a property at each of its places with its value shape.

The result is written to `schemas/tessera-ontology-<revision>-ossie-<base>.json` with a header
comment field `$comment` that says it is a workbench schema derived from the pinned snapshot, and
compiled into the browser validators by `bun run schemas:compile`.

## Strict superset

For revision 1: if D is valid under the pinned schema then D plus `tessera: 1` is valid under the
derived schema; and if T is valid under the derived schema then T without the marker and without
every addition is valid under the pinned schema. The two directions are tested on every example
ontology in `public/examples/` and on the fixtures in `tests/fixtures/tessera/`.

## Extension rule

A later feature adds a property by: one module under `src/shared/tessera/additions/`, one line in
`src/shared/tessera/registry.ts`, removal of the name from `src/shared/tessera/reserved-names.ts`,
a revision number above the current highest, a disposition, regenerated derived schemas, fixtures
and a mutant. It does not change marker parsing, the reader or the report format.
