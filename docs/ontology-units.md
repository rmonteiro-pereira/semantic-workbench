# Ontology unit validation

A file opened on its own is checked for syntax and rules that can be decided from its
contents. The scanner uses the same single-file checks. Set rules are checked with the
whole unit. Publication also checks that the committed dependency lock resolves against
the candidate snapshot and published Git history. Compile reuses those checks for its
own inputs and checks the names and transformations it is about to write.

Each row identifies the check responsible for the rule. A diagnostic from a set check
requires the caller to be able to read its inputs. For incomplete sets, a reader gets
the same answer for a restricted part and a missing part.

| What is refused | Responsible check | Regression test in `tests/mesh/` |
| --- | --- | --- |
| Revision 3 opened by a revision 2 reader | Single-file format marker | `registry-additions.test.ts` |
| An illegal part header, nested includes or missing ontology list (`tessera-part-shape`) | Single-file part schema | `refusals.test.ts` |
| A part declares its own Ossie version (`tessera-mixed-version` in set diagnostics) | Single-file part schema | `refusals.test.ts` |
| An absolute path, parent path, backslash, control character or symbolic link (`tessera-include-escape`) | Set structure and path confinement | `unit-structure.test.ts` and `dependency-check.test.ts` |
| A listed file is unavailable (`tessera-include-missing` under complete inspection) | Set availability | `unit-structure.test.ts` and `partial-reader.test.ts` |
| A root lists itself, another root or the same part twice (`tessera-include-cycle`) | Set structure | `unit-structure.test.ts` |
| A listed file lacks the part marker (`tessera-include-not-part`) | Set structure | `unit-structure.test.ts` |
| More than one root owns a part (`tessera-duplicate-owner`) | Set structure | `unit-structure.test.ts` |
| More than one file defines a concept (`tessera-duplicate-concept`) | Set structure | `workbench-units.test.ts` |
| The root declares more than 200 parts or 50 imports (`tessera-import-bound` in set diagnostics) | Single-file list bounds | `refusals.test.ts` |
| A name listed as a public export is unknown (`tessera-export-unknown`) | Set export closure | `export-closure.test.ts` |
| A public export needs a private prerequisite (`tessera-export-open`) | Set export closure | `export-closure.test.ts` |
| An alias or resolved provider root is repeated (`tessera-import-alias`) | Set import declarations | `imports.test.ts` |
| An allow-list is empty or repeats a name (`tessera-import-allow` in set diagnostics) | Single-file import schema | `refusals.test.ts` |
| A source reference uses an alias member outside its allow-list (`tessera-import-use`) | Set import references | `imports.test.ts` |
| An import or re-export names an item outside the provider's public exports (`tessera-import-unexported`) | Set public-interface resolution | `imports.test.ts` and `reexports.test.ts` |
| A pin is outside published history, a tag cannot resolve to it, or a same-repository import pins a version (`tessera-import-pin`) | Dependency version resolution | `dependency-update.test.ts` |
| The lock is absent, invalid, stale, or disagrees with the atomic provider snapshot (`tessera-dependencies`) | Publication candidate dependency check | `dependency-check.test.ts` |
| A locked provider is unavailable or unreadable (`tessera-dependencies`) | Publication candidate dependency check | `dependency-check.test.ts` |
| The dependency closure selects different versions of one provider (`tessera-import-version-conflict`) | Dependency version consistency | `dependency-update.test.ts` |
| The closure exceeds eight providers along one path or contains a re-export cycle (`tessera-dependencies`) | Publication dependency traversal | `atomic-publication.test.ts` and `reexports.test.ts` |
| A resolved provider uses another Ossie base | Compile scope check | `compile-refusals.test.ts` |
| Owner qualification collides with a local name | Compile namespace check | `compile-refusals.test.ts` |
| A supplied provider definition needs a missing concept or contains an unsupported translation | Compile closure and translation check | `compile-refusals.test.ts` |

A part with no owning root gives a set warning (`tessera-orphan-part`). It is excluded
from the composed unit. The root's declared parts are the only files composed into the
root, so address history and dependency lock metadata can coexist beside it.
