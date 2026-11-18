# Contract: units, parts, exports and imports in a Tessera ontology (revision 3)

Format revision 3 adds the following to the registry. Names follow the prefix rule of feature 011.
Revision 3 also accepts everything of revisions 1 and 2.

## Root properties (ontology root only)

| Property | Value | Compiler disposition |
| --- | --- | --- |
| `tessera_includes` | non-empty list of relative paths, unique, at most 200 | translate: the parts are merged into the root's output |
| `tessera_exports` | non-empty list of concept names, unique | drop, reported as a loss (the standard has no place for it) |
| `tessera_imports` | list of import entries, at most 50 | translate: imported concepts are written into the output |

## Part marker

A part is a document with the marker `tessera: 3` and the property `tessera_part: true`. A part holds
only the properties `tessera`, `tessera_part` and `ontology` (a list of concepts exactly as in an
Ossie ontology). Disposition of `tessera_part`: translate (the part file does not appear in the output).
A part that has any other top-level property is refused with the finding `tessera-part-shape`.

## Import entry

```yaml
tessera_imports:
  - project: finance          # stable name of the provider project in this workbench
    ontology: ontology.yaml   # optional; the provider document, needed only when it has several exporting roots
    alias: fin                # local spelling; letters, digits, underscore; unique in the unit
    concepts: [Invoice, Currency]   # allow-list; non-empty, unique, each an exported concept
    version: latest           # "latest" (default) or { pin: "<40- or 64-hex commit>" } or { pin: "<release tag>" }
```

A qualified reference is `<alias>.<Concept>` wherever an ordinary concept reference is allowed.

## Finding codes

| Code | Meaning |
| --- | --- |
| `tessera-part-shape` | a part holds something other than concepts |
| `tessera-include-missing` | a listed file does not exist |
| `tessera-include-escape` | a listed path leaves the project folder or is not a plain relative path |
| `tessera-include-cycle` | a root lists itself, another root or a part twice |
| `tessera-include-not-part` | a listed file is not a part |
| `tessera-duplicate-owner` | a file is listed by more than one root |
| `tessera-orphan-part` | a part that no root lists (warning) |
| `tessera-duplicate-concept` | a concept name used twice in a unit |
| `tessera-mixed-version` | a part or provider with another Ossie version or base |
| `tessera-export-unknown` | `tessera_exports` names a concept the unit does not define |
| `tessera-export-open` | an exported concept needs a concept that is not exported |
| `tessera-import-alias` | alias used twice, or one provider imported twice |
| `tessera-import-allow` | empty or repeated allow-list |
| `tessera-import-unexported` | a name is not an exported concept of the provider (same answer for a missing concept) |
| `tessera-import-use` | a qualified reference to a concept that is not in the allow-list |
| `tessera-import-pin` | a pin that is not published history or a release tag resolving to it |
| `tessera-import-bound` | a limit of FR-012 or FR-024 was reached |

Messages name the files and the property. Each class has a fixture under
`tests/fixtures/tessera/mesh/refusals/`.

## Output rules

- The compiled root holds its own concepts, then each part's concepts in list order, then imported
  concepts sorted by owner and name.
- An imported concept is written as `<owner>.<Concept>` where `<owner>` is the provider project's stable name.
  Every reference to it in the source, whatever the alias, becomes that name.
- A name that would collide after qualification fails the compile.
