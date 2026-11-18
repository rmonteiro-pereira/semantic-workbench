# Implementation Plan: Tessera Format and Compiler

**Branch**: `011-tessera-format` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-tessera-format/spec.md`

## Summary

Tessera is an Ossie ontology with the marker `tessera: 1` and properties under the prefix
`tessera_`. Revision 1 defines the marker, one addition (`tessera_notes`), four reserved names, and
the machinery that lets later features add more safely: a single registry, a Tessera schema derived
from the pinned Ossie schema, a table of supported Ossie bases and a revision rule.

The plan has three parts.

1. **Pure format code** in a new `src/shared/tessera/` folder: names, registry, bases, marker
   detection, validation findings, schema derivation, the document compiler, the loss report and the
   unit compiler. It has no I/O, so the browser, the server and the command line share it.
2. **Hooks into the existing read path.** `validateStructured` and `inspect` select the Tessera
   rules by the marker. That is the only change on the path used by the editor, the file scan, the
   save endpoints and agent context, so no route changes and no operation is added. The interface
   names the format in the validation panel.
3. **A command line** (`scripts/tessera.ts`) with `compile` and `check`. A small server-side layer
   (`src/server/tessera/`) reads a committed snapshot from Git objects, enforces the output folder
   rules and writes the bundle atomically.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server, command line and shared code). React 19 for
the one interface change.

**Primary Dependencies**: none new. The `yaml` library (document API) for printing, Ajv and the
existing schema compiler (`scripts/compile-schemas.ts`) for validators, the existing Git helper
(`src/server/projects/git.ts`) for snapshot reads, `bun:test`.

**Storage**: none. No state file, database column or cache entry. Bundles are folders the command
writes once. The derived schema is a checked-in JSON file.

**Testing**: `bun test tests/tessera/` (new folder), the existing tests that name shared modules
touched (`tests/validation*.test.ts`, `tests/model-addresses.test.ts`, `tests/agent-*.test.ts`,
`tests/auth/operation-parity.test.ts`), one browser check (`scripts/tessera-browser-check.ts`),
mutants (`scripts/tessera-mutants.ts`).

**Target Platform**: unchanged. The command line needs Bun and Git on the machine.

**Project Type**: web service plus single-page app; this feature adds a shared module, a small
server module, a script and an interface label.

**Performance Goals** (chosen here, not measured; the scale task records the measurement): a project
folder with 200 documents and 20 MB compiles within 30 seconds on the development server;
validating one Tessera document costs no more than 10% over the same document unmarked.

**Constraints**: no change to any result for an unmarked document; fail closed (a marked document
never takes an unvalidated path); output is a pure function of input, options and compiler version;
bounded input (2,000,000 bytes per document, snapshot limits, alias limit); no network; no write
inside the repository; files of about 400 lines, functions of about 40, no spec IDs in comments.

**Scale/Scope**: one pinned base, one revision, one addition. About 12 new source files, 14 test
files, 3 contracts.

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1. The constitution already names Tessera, the
compiler and loss acceptance, so no amendment is needed.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Published means the committed snapshot of the default branch: `compile` reads Git objects only, never files on disk, and refuses a project with no commit. `check` of files on disk is labelled unpublished and writes nothing. With a data root, the commit must equal the workbench's published commit. No network call. The command line is an operator tool and is documented as not being an authorization boundary. Agent-facing output ignores additions. |
| II. Byte-Exact Source Preservation | Source files are never rewritten. Standard files are copied byte for byte. Saves and form edits keep the marker and additions as they are. The bundle is a derived output outside the source tree, in a folder that must not be inside the repository. There is no "convert to standard" operation here. |
| III. One Validation Rule Set | The marker is handled in `validateStructured` and `inspect`, the one path of browser, scanner, save and agents. Schema selection is by marker. A marked document with an unknown revision or base is rejected, never "not validated". Findings carry paths and lines. Complete-set findings are not introduced (single-file documents only). Limits and aliases apply. |
| IV. Atomic, Hash-Checked File Persistence | Saves are unchanged. The bundle is written to a temporary folder and renamed. No new durable state. |
| V. Pinned Official Standards | The pinned snapshots are not edited. The Tessera schema is a labelled workbench schema derived from the snapshot by a script and checked for drift. Support for a base is a table entry; a base that collides with the prefix fails to register. Output is labelled "valid against the bundled Ossie 0.2.0.dev0 draft". Every loss is reported; output is released only for an exactly accepted report; schema, reference, size and semantic failures are never acceptable. |
| VI. Verification Gate | New decision logic (schema selection, compilation, loss acceptance, published-snapshot selection) gets mutants in `scripts/tessera-mutants.ts`. A browser check covers the interface change. No new route, so no authorization-matrix row; parity cases for the save operations with a Tessera document are added. The feature runs its own tests, `check` and `build`; the batch gate runs once before the merge. |
| VII. Honest Claims | Docs call Tessera "an authoring format that compiles to standard Ossie", never an Ossie edition. They state the draft base, that comments may not survive, that accepting loss is not approval, that the command is not an authorization boundary and what the command does not do. Counts in docs come from tests. |
| VIII. Readable Code | One folder per concept; files named for domain terms; functions near 40 lines; plain-English comments with no IDs. `scripts/check-comments.ts` and the formatter run on every touched file. |
| Technical Constraints | No route or operation is added, so the one operation boundary is untouched. No new dependency. No network at runtime. The 2,000,000-byte limit applies. |
| Development Workflow | Gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `test:mutation`, the browser suites; the batch gate runs them once. Docs updated in the same change. |

Complexity Tracking is empty. Patterns are named below with the problem each solves.

## Design

### Modules

| Module | Concept | Holds |
| --- | --- | --- |
| `src/shared/tessera/format.ts` | The name and its constants | `TesseraNames`, `SUPPORTED_REVISIONS`, `COMPILER_VERSION` |
| `src/shared/tessera/registry.ts` | The one list of additions | `ADDITIONS`, lookups by name and place |
| `src/shared/tessera/additions/notes.ts` | One addition | the `tessera_notes` entry |
| `src/shared/tessera/reserved-names.ts` | Names kept for later features | the list of four |
| `src/shared/tessera/bases.ts` | Supported Ossie bases | table, labels, collision check |
| `src/shared/tessera/marker.ts` | Reading the marker | `readMarker(data)` returns standard, tessera or invalid |
| `src/shared/tessera/validate.ts` | Tessera findings | `tesseraIssues(data, source)`; registry checks and schema selection |
| `src/shared/tessera/schema-derivation.ts` | The derived schema | `deriveTesseraSchema` |
| `src/shared/tessera/compile-document.ts` | Compiling one ontology | removes marker and additions by disposition; returns data and losses |
| `src/shared/tessera/serialize.ts` | Printing output | YAML and JSON printing with fixed options; reparse self-check |
| `src/shared/tessera/meaning-check.ts` | Output checks | reparse equality, same items and addresses, same name index |
| `src/shared/tessera/loss-report.ts` | The report | entries, counts, canonical JSON, digest, policy, acceptance |
| `src/shared/tessera/compile-unit.ts` | Compiling a project folder | classify files, validate, compile, check, report, manifest |
| `src/server/tessera/snapshot-source.ts` | Reading a committed snapshot | commit resolution, limits, blob reads |
| `src/server/tessera/disk-source.ts` | Reading a folder for `check` | bounded folder read |
| `src/server/tessera/bundle-writer.ts` | Writing a bundle | output folder rules, temporary folder and rename |
| `scripts/tessera.ts`, `scripts/tessera-arguments.ts` | The command line | argument parsing, text and JSON output, exit statuses |
| `scripts/derive-tessera-schema.ts` | Schema generation | writes `schemas/tessera-ontology-*.json` |

### Flow of reading a document in the workbench

1. Text arrives (editor, scan, save, agent read). `inspect` parses it and calls `validateStructured`.
2. `validateStructured` calls `readMarker`. Without a marker, nothing changes.
3. With a marker, it skips the "not validated" logic and runs `tesseraIssues`: marker value,
   revision, kind, base, registry checks. It then runs the structural checks it always runs and the
   derived schema for the declared revision and base.
4. `inspect` returns the same entities and edges as for a standard ontology, `kind: 'Ossie ontology'`
   and a new `format` field. The scanner stores `docType` from `kind`, so access rules are unchanged.
5. A save that fails validation throws the existing input error before any write; findings are the
   browser's findings.

### Flow of `compile`

1. Parse arguments. Resolve the branch, the commit and, when a data root is given, check the pointer.
2. `snapshot-source` lists the tree at the commit, checks the limits, reads the blobs of the project
   folder.
3. `compile-unit` classifies each file: Tessera ontology, standard Ossie, other. It validates every
   Ossie document with the shared validator.
4. It compiles each Tessera ontology, prints it, and runs the meaning check. Standard files are
   copied.
5. It builds the loss report and manifest. With loss and no acceptance, it stops with status 2.
6. `bundle-writer` checks the output folder, writes a temporary folder and renames it.

### Patterns used

- **Registry**: one list of additions that validation, schema derivation, compilation and reporting
  all read. Problem: four places that would otherwise each hold the list and drift.
- **Table-driven bases**: schema, label and draft flag per base. Problem: the roadmap adopts a new
  Ossie base soon, and nothing may hard-code the current one.
- **Functional core, I/O at the edges**: the compiler works on bytes and data; Git and the file
  system are touched only in `src/server/tessera/`. Problem: the same compile must run in tests,
  CI and later in HTTP and MCP.

No other pattern is introduced.

### Interface change

`ValidationPanel` receives the document's `format` and prints it in its summary line, for example
"Tessera 1 on Ossie 0.2.0.dev0 · 0 errors · 0 warnings". It shows no "Not validated" notice and no
"Validate as" button for a Tessera document. Fix hints for the Tessera finding codes are added to
the panel's hint table. No control is added.

### Contracts

- [contracts/tessera-format.md](./contracts/tessera-format.md): marker, revisions, bases, registry,
  finding codes, derived schema and the extension rule.
- [contracts/loss-report-and-manifest.md](./contracts/loss-report-and-manifest.md): the report, the
  policy file, the acceptance rule, the manifest and the bundle layout.
- [contracts/compiler-cli.md](./contracts/compiler-cli.md): commands, options, exit statuses and
  limits.

## Project Structure

### Documentation (this feature)

```text
specs/011-tessera-format/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tessera-format.md
│   ├── loss-report-and-manifest.md
│   └── compiler-cli.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
schemas/
└── tessera-ontology-1-ossie-0.2.0.dev0.json     # new: derived, checked in, labelled workbench schema
src/shared/tessera/
├── format.ts  registry.ts  reserved-names.ts  bases.ts  marker.ts           # new
├── validate.ts  schema-derivation.ts                                         # new
├── compile-document.ts  serialize.ts  meaning-check.ts                       # new
├── loss-report.ts  compile-unit.ts                                           # new
└── additions/notes.ts                                                        # new
src/shared/validation/validation.ts          # marker branch in validateStructured
src/shared/core/model.ts                     # format field on the inspection result
src/server/tessera/
├── snapshot-source.ts  disk-source.ts  bundle-writer.ts                      # new
src/generated/validators.js, validators.d.ts # regenerated by schemas:compile
src/app/validation/ValidationPanel.tsx       # format label and fix hints
src/app/workspace/hooks/useValidation.tsx    # passes the format to the panel
scripts/
├── tessera.ts  tessera-arguments.ts  derive-tessera-schema.ts                # new
├── tessera-browser-check.ts  tessera-mutants.ts  tessera-mutation-cases.ts   # new
├── compile-schemas.ts  mutation-tests.ts  mutation-case.ts  gate-suites.ts   # wired
tests/tessera/
├── standard-unchanged.test.ts  validation.test.ts  schema-derivation.test.ts
├── bases.test.ts  workbench-documents.test.ts  operation-parity.test.ts
├── compile.test.ts  meaning-check.test.ts  loss-report.test.ts  determinism.test.ts
├── snapshot-source.test.ts  bundle-writer.test.ts  cli.test.ts
├── compile-scale.test.ts  mutant-anchors.test.ts
tests/fixtures/tessera/                      # documents, repositories, golden bundles
tests/fixtures/ossie-next-base/              # pinned development schema of the next base, or synthetic
docs/user-guide.md, docs/development.md, docs/item-addresses.md, docs/agent-runtime.md
schemas/README.md, README.md, ARCHITECTURE.md, CHANGELOG.md                   # updated
package.json                                 # scripts: tessera, test:tessera
```

**Structure Decision**: pure format code goes in `src/shared/`, where validation and addresses
already live, in one folder named for the concept. Git and file-system code goes in a small
`src/server/tessera/`, matching `src/server/projects/`. The command line is a script like
`scripts/audit-verify.ts`. Tests follow `tests/auth/` with a `tests/tessera/` folder. Nothing is
added under `src/server/routes/` or `src/server/auth/`.

## Delivery phases (tasks.md splits them further)

1. **Record**: capture today's validation, inspection, address and agent-context results for every
   example and fixture, before any source change.
2. **Format core**: names, registry, bases, marker, findings, derived schema, validators.
3. **Workbench reading**: the hooks in `validateStructured` and `inspect`, the interface label, save
   parity, addresses, agent context.
4. **Compiler**: document compile, printing, checks, loss report, unit compile.
5. **Command line**: snapshot and disk sources, bundle writer, arguments, commands.
6. **Gate and documentation**: mutants, browser check, scale check, docs, handoff to the MCP
   feature, hand-off to the batch gate.

## Process (owner-approved 2026-11-17)

During implementation a feature runs only its own tests, `bun --bun run check` and
`bun --bun run build`. The full unit suite, all mutation tests, every browser suite and the
architecture review run once on the integrated batch before the merge. Tasks therefore name a
targeted proof each, and the last task hands off to the batch gate. Heavy runs, such as the scale
test and the build, use `sw-midgard-run -- <command>` on the development server.

## Handoff to the MCP feature (006)

Feature 006 is not on this branch's base. Its tools reach documents through the same shared modules,
so most need no change. The final phase of `tasks.md` lists the checks to run once 006 is on the
main branch: validation, source and structure tools with a Tessera fixture; published context and
plan tools with notes present; tool descriptions that mention the marker; inventory exposure. If 011
merges first, those tasks go to the 006 owner as written. No Tessera-specific tool is added.

## Later features and the extension points they use

| Later feature | Uses | Needs from here |
| --- | --- | --- |
| Item diff and work-in-progress overlay | Document reader, item addresses | `format` on inspection; address equality across compile (FR-025) |
| Attributes, item-level agent context, governance | Registry, revisions, dispositions | Registry modules, reserved names, `translate` disposition and meaning check |
| Multi-file units and the mesh | Unit, marker rules, manifest | `compile-unit` classification, manifest v1; new schemas for parts and composition roots |
| Shared proposals, sign-in, counters, ACP | None | Nothing |
| HTTP, browser and MCP export; convert to standard | Compiler core, report, manifest | `compile-unit` as a pure function |
| Released Ossie base | Base table, derivation, collision check | `bases.ts`, `schema-derivation.ts` |

## Complexity Tracking

No violations.
