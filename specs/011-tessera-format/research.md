# Research: Tessera Format and Compiler

Each entry gives the decision, the reason and what was rejected. Decisions of the design file
(E1 to E27, M1 to M19, R1, R2) are taken as given and are cited by number.

## R1. Where Tessera meets the existing code

**Decision.** Every consumer already reaches a document through `inspect` in
`src/shared/core/model.ts`, which calls `validateStructured` in
`src/shared/validation/validation.ts`. The browser editor and its lint worker use
`validateInput` (`src/shared/validation/input.ts`). The file scan (`src/server/projects/scanner.ts`)
and the save path (`src/server/projects/workspace/document-save.ts`) call `indexBytes`, which calls
`validateInput`. Agent context (`src/server/agent/context-documents.ts`) and address resolution
(`src/server/projects/address-resolution.ts`) call `inspect`. The marker is therefore handled in
`validateStructured` and `inspect`, and nowhere else.

**Reason.** Principle III asks for one rule set in the browser, the inspector, the file store and the
save endpoint. One hook point gives that for free and leaves routes untouched.

**Rejected.** A separate Tessera reader beside `inspect` (two rule sets, drift) and a pre-pass that
strips additions before validation (it would hide additions from the validator and from findings).

## R2. Why the pinned ontology schema cannot be used as it is

**Finding.** `schemas/ossie-ontology-0.2.0.dev0.json` sets `additionalProperties: false` on the
root, on `OntologyComponent` and on `Relationship`, and has no extension slot on any of them. A
document with `tessera: 1` fails it. Standard Ossie's `custom_extensions` slot exists only in the
semantic model schema.

**Decision.** Decision E3 applies: marked documents use a separately defined schema. It is derived
from the pinned schema by a script, so it can never drift from the base.

**Rejected.** Editing the pinned snapshot (forbidden by Principle V); hand-writing a second schema
(drifts); putting additions in an extension slot (the ontology has none).

## R3. How the derived schema is built

**Decision.** `deriveTesseraSchema(base, registry, revision)` returns the pinned ontology schema
with these changes only: a new `$id` that names the revision and the base; a required `tessera`
property with a constant equal to the revision list; and, for each registry entry, its property at
each allowed place. Everything else is a deep copy. A generated file is checked in as
`schemas/tessera-ontology-1-ossie-0.2.0.dev0.json` and is compiled into the browser validators by
`scripts/compile-schemas.ts` like the other schemas.

**Reason.** The same function backs the test that regenerates and compares bytes (FR-016) and the
collision check (FR-012), which reads the pinned schema for names starting with the prefix.

**Open detail.** The marker is `const` per revision. When revision 2 exists the schema for
revision 1 documents stays as it was, and a revision 2 document uses a revision 2 schema. Each
revision therefore has its own derived file per base.

## R4. Friendly findings before schema findings

**Decision.** A registry check runs before schema validation and reports unregistered names,
reserved names, wrong places and too-new revisions with their own finding codes. Schema findings of
the keyword `additionalProperties` for a `tessera_` name that the registry check already reported
are dropped so the author sees one finding per mistake.

**Reason.** A bare "must NOT have additional properties" for `tessera_governance` would not tell the
author that the name is reserved for a later feature.

## R5. Where the marker is read

**Decision.** `tessera` is a marker only as a top-level key of an ontology document. The detection
is a pure function over parsed data. A key named `tessera` inside any nested object, including a
`SEMANTIC_WORKBENCH` payload, is ordinary data.

**Reason.** Decision E2 limits additions to ontology documents. Metric payloads are free-form JSON
inside an extension entry and must never be read as Tessera.

## R6. How compiled output is serialized

**Decision.** For YAML, parse with the `yaml` library's document API (already used by
`src/shared/edit/yaml-patch.ts`), delete the marker and the added nodes, and print with fixed
options (no line folding, LF, one final newline). Scalars keep their original spelling, so `1e3`,
quoted numbers and long strings do not change type. For JSON, parse, delete, and print with two
spaces. After printing, the compiler parses its own output text and checks that it equals the
expected data. This catches every coercion, such as a large integer that JSON cannot hold exactly.

**Reason.** Printing from `toJS` loses scalar spelling and anchors; the document API keeps both.
The self-check makes the guarantee independent of the printer.

**Rejected.** Text surgery with line numbers (fragile with flow style and multi-line strings).
Comments of retained nodes are kept by the library on a best-effort basis; the spec promises only
values and key order (FR-038).

## R7. The meaning check

**Decision.** After compiling, the compiler checks, for each Tessera document: (1) the reparsed
output equals the source data with the marker and additions removed; (2) `inspect` of the output
gives the same entities, edges and document-relative addresses as `inspect` of the source (items
come from the same code path, so any extra or missing item shows up); (3) the index of ontology and semantic-model names to document paths is the same in the output set
as in the source set, and every mapping document is copied unchanged. Mappings resolve their
ontology and model by logical name and filename (`resolveReference` in
`src/server/agent/context-assembly.ts`), so an equal index means equal resolution.

**Reason.** Decision E12 requires semantic checks beyond schema validity. For revision 1 the
compile is deletion only, so these checks are cheap and catch printer faults and future additions
that translate rather than drop.

**Open detail.** All three checks are pure and live in the shared layer. A later feature that
renames or moves documents during compilation must replace check 3 with the real resolver.

## R8. The compile sees the committed snapshot only

**Decision.** `compile` reads blobs through `lsTree` and `catFileBatch` of `src/server/projects/git.ts`,
with `SNAPSHOT_LIMITS` from `src/server/projects/snapshot-index.ts`, at a full commit identifier
resolved with `commitOf`. It never lists the working tree. The Git helper requires a `projectsRoot`;
the command sets it to the repository's parent folder. The command's branch rule is: `--branch`,
else the branch named by `refs/remotes/origin/HEAD`, else `main`. With `--data-root` it reads
`state/published.json` through `parsePublishedState`
(`src/server/projects/published-pointer.ts`) and requires the commit to equal the recorded one.

**Reason.** Principle I: published means the committed snapshot of the default branch, never
files on disk, and a project without a commit supplies no export. The pointer check stops the
command from reading an outside move the workbench has not validated yet (spec 008).

**Rejected.** Reusing `createPublishedSnapshots` (it needs the workbench's registry, state and
cache; the command is meant to run in CI with only a repository) and shelling out to `git show`
per file (slower and no size bounds).

## R9. Why `check` exists

**Decision.** A second command lists findings and the loss report for any source and writes
nothing. Authors need to see what a compile would drop before they publish, and the constitution
forbids a standard export of unpublished work.

**Rejected.** A `--working-tree` flag on `compile` (it would make a releasable-looking bundle from
unpublished files).

## R10. Loss report, digest and acceptance

**Decision.** The report is canonical JSON: keys sorted, arrays sorted by (document, pointer),
two-space indent, LF. The digest is the SHA-256 of the report with its own digest field removed.
The report contains the SHA-256 of every input and output document, the compiler version, the
options and the base label, so a changed note, option or compiler version changes the digest. A
policy file is `{ "policy": 1, "allow": ["tessera_notes"] }`. A digest and a policy may both be
given; a loss is accepted if the digest matches or every loss kind is on the list. Options that
affect acceptance (`--loss-policy` content hash) are part of the manifest, not the report.

**Reason.** Decision E15 binds acceptance to the exact input manifest, compiler version and options.

**Rejected.** Timestamps in the report (non-deterministic); storing lost values (leaks notes to
anyone who can read a bundle).

## R11. The next Ossie base fixture

**Decision.** Decision E22 wants a pinned development fixture of 0.3 to prove the table is
parametric. At task time, fetch the upstream development schema once, store it under
`tests/fixtures/ossie-next-base/` unmodified with its source commit and SHA-256, and use it in
tests only. If no such schema exists then, use a synthetic base: a copy of the pinned schema with a
different version and one `tessera_`-prefixed property, which also exercises the collision check.
The task records which was used in this file.

**Reason.** The application must not fetch remote schemas at runtime (Principle I), but a developer
may pin one by hand.

## R12. Registry layout for parallel feature work

**Decision.** Each addition is one module under `src/shared/tessera/additions/` exporting one entry.
`src/shared/tessera/registry.ts` lists them in one array. Reserved names live in one list in
`src/shared/tessera/reserved-names.ts`. A later feature adds one file, one line in each list and
fixtures.

**Reason.** The later features (attributes, agent context, governance, imports) can then be built
in parallel with few merge conflicts.

## R13. Document type and access rules

**Decision.** `inspect` keeps `kind: 'Ossie ontology'` for a Tessera ontology and adds a separate
`format` field: `{ family: 'standard' }` or `{ family: 'tessera', revision, base }`. The scanner keeps
storing `docType` from `kind`. Roles written against "Ossie ontology" (`src/server/auth/role-compiler.ts`)
therefore still apply.

**Rejected.** A new document type (existing role conditions would stop matching and a Tessera file
would escape its rules).

## R14. No new operation

**Decision.** The command line reads Git directly. The HTTP and browser export is a later feature
(decision E14), so there is no new route, no inventory entry and no authorization row. Parity cases
are added for the save operations with a Tessera document, because they now run a new validation
path through the boundary.

## R15. Alias and size limits in the compiler

**Decision.** The compiler calls the existing envelope check (`validateEnvelope` in
`src/shared/validation/diagnostics.ts`) and the same `maxAliasCount` as `inspect`, per document.
A document over the limit fails the compile with the same finding the editor shows.
