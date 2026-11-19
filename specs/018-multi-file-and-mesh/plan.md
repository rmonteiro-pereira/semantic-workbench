# Implementation Plan: Multi-File Ontology Units and the Ontology Mesh

**Branch**: `018-multi-file-and-mesh` (documents only; the feature's own branch is created when implementation starts) | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-multi-file-and-mesh/spec.md`

## Summary

The Tessera format (feature 011) gets revision 3. A root ontology may list **part** files, may
**export** concepts and may **import** concepts from other projects of the same workbench. The work
has five parts.

1. **Pure format code** in `src/shared/tessera/`: registry entries for the new properties, the part
   marker, the unit structure checks (includes, cycles, escapes, duplicate ownership), export closure
   and interface hash, import alias and allow-list checks, the dependency manifest, and the
   qualification rewrite. No I/O, so the browser, the server and the command line share it.
2. **Unit and set reading** in the workbench: a unit reads as one ontology for the graph, catalog,
   inspector and agent context; set findings are computed per reader and never shared.
3. **Resolution and publication**: a server module resolves imports to provider commits and interface
   hashes, writes `tessera-dependencies.json` on "Update dependencies", and a publication check refuses
   a stale, unreadable or non-atomic dependency state.
4. **Dependents and mesh**: a derived dependents registry, five routes through the operation boundary,
   and the Mesh view, the Imports section and the Used by list in the interface.
5. **Compile**: `compile-unit` merges parts, pulls in imports from the manifest's provider snapshots,
   qualifies imported concepts by owner, extends the meaning check with an address map and writes
   bundle manifest version 2.

Reasoning is in the spec's "Decisions made while specifying".

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server, command line, shared code); React 19 for the interface.

**Primary Dependencies**: none new. The `yaml` library, Ajv and `scripts/compile-schemas.ts`, the Git
helper `src/server/projects/git.ts`, the snapshot index `src/server/projects/snapshot-index.ts`, `bun:test`.

**Storage**: one committed file per consumer (`tessera-dependencies.json`) and one derived state file
(`state/mesh/dependents.json`) written with `atomicWrite` (`src/server/projects/atomic.ts`) under the
data layout (`src/server/projects/paths.ts`). Set findings are held in memory only. No change to the SQLite
cache schema, so `CACHE_VERSION` in `src/server/projects/cache.ts` does not change.

**Testing**: `bun test tests/mesh/` (new), existing tests that name shared modules touched
(`tests/tessera/`, `tests/validation*.test.ts`, `tests/model-addresses.test.ts`, `tests/agent-*.test.ts`,
`tests/auth/operation-parity.test.ts`, `tests/auth/operation-inventory.test.ts`), one browser check
(`scripts/mesh-browser-check.ts`), mutants (`scripts/mesh-mutants.ts`).

**Target Platform**: unchanged. Local and server mode both; partial reading exists in server mode only.

**Project Type**: web service plus single-page app.

**Performance Goals** (assumed, not measured; the scale task records the measurement): the dependents
answer for 50 importers in 200 ms; a compile of 200 parts, 20 imports and 20 MB in 30 seconds.

**Constraints**: no change to any result for a one-file ontology; fail closed everywhere access or a
pinned object is missing; output is a pure function of its inputs; hidden and missing give identical
answers; no network; files near 400 lines and functions near 40; no spec IDs in comments.

**Scale/Scope**: one format revision, five new properties and one marker, about 30 new source files,
about 30 test files, 3 contracts.

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1. The constitution already covers units, imports,
generated standard output and the dependency-disclosure exception, so no amendment is needed.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Imports resolve inside the workbench from published snapshots only, never from files on disk and never over the network. Local mode has one person, so reader filtering is trivially complete. A project with no published commit cannot be resolved by others. The dependents list is the narrow disclosure exception, shown to people who may publish the provider and announced to the import author before publication. |
| II. Byte-Exact Source Preservation | Form edits write only the file that holds the item. The manifest is written only by the explicit update action and is committed like any file. Parts and roots keep their bytes outside edited ranges. Compile writes to a bundle outside the source tree. |
| III. One Validation Rule Set | Unit and import rules live in `src/shared/tessera/` and run in the browser, the scan, the saves, the publication check and the compiler. Set findings use one function. Every refusal class has a finding code. A marked document never takes an unvalidated path. |
| IV. Atomic, Hash-Checked File Persistence | The manifest and the registry use `atomicWrite`; the manifest has a base-hash check on update. Publication stays one atomic move, now with the dependency check inside it. |
| V. Pinned Official Standards | The pinned Ossie snapshots are not edited. New derived schemas are generated from the registry. Imports of another base are refused. Output keeps the "valid against" label. |
| VI. Verification Gate | New decisions (alias mapping, pin acceptance, manifest checking, reader filtering, qualification) get mutants. A browser check covers the interface. New routes get inventory entries, route-action rows, parity and matrix cases. The feature runs its own tests, `check` and `build`; the batch gate runs once. |
| VII. Honest Claims | Docs say what the dependents list shows and to whom, that compatibility is "not judged", that links, composition and organization targets are later, and that same-workbench imports only are supported. |
| VIII. Readable Code | One folder per concept, domain names, functions near 40 lines, comments in plain English with no IDs. |
| Technical Constraints | The operation boundary is the one place for the new routes; no new dependency; the 2,000,000-byte document limit applies to every file of a unit. |
| Development Workflow | Docs change with the code in the same change. |

Complexity Tracking is empty. Patterns are named below with the problem each solves.

## Design

### Modules

| Module | Concept | Holds |
| --- | --- | --- |
| `src/shared/tessera/additions/includes.ts`, `exports.ts`, `imports.ts`, `part.ts` | The four new registry entries | name, revision 3, places, value schema, disposition |
| `src/shared/tessera/unit-structure.ts` | A unit's shape | `readUnitStructure(files)`: roots, parts, orphans, duplicate ownership, cycles, escapes, one version |
| `src/shared/tessera/unit-model.ts` | A unit read as one ontology | `combineUnit(structure)` returns one ontology object plus an item-to-file map |
| `src/shared/tessera/export-closure.ts` | The public interface | `closureOf(exports, model)`, `interfaceHash(closure)`, open-export findings |
| `src/shared/tessera/imports.ts` | Import checks | alias table, allow-list, qualified reference scan, import findings |
| `src/shared/tessera/dependency-manifest.ts` | The manifest file | schema, parse, canonical print, `manifestIsCurrent(manifest, imports)` |
| `src/shared/tessera/qualify.ts` | Naming imported concepts | owner-qualified names and the reference rewrite |
| `src/shared/tessera/set-validation.ts` | Findings of a complete set | `setFindings(unit, providers)` and `readerView(findings, visibleFiles)` |
| `src/shared/tessera/document-kind.ts` (existing) | File classification | adds `tessera-part` and `dependency-manifest` kinds |
| `src/shared/tessera/compile-unit.ts` (existing) | Compile | merge parts, include providers, qualify, address map, manifest 2 |
| `src/shared/tessera/meaning-check.ts` (existing) | Output checks | uses the address map |
| `src/server/mesh/unit-reader.ts` | Reading a unit with a reader | root, parts and visibility for one caller; identical failure for hidden and missing |
| `src/server/mesh/provider-resolution.ts` | Finding a provider version | published commit of a provider, pin validation, closure read from a snapshot |
| `src/server/mesh/dependency-update.ts` | "Update dependencies" | resolve all imports, summarize interface changes, write the manifest |
| `src/server/mesh/dependency-check.ts` | The publication check | manifest current, objects readable, same-repository hashes, access now |
| `src/server/mesh/set-findings-store.ts` | Set findings in memory | key: file hashes, dependency snapshot, access identity; never shared between readers |
| `src/server/mesh/dependents-registry.ts` | Who imports from whom | derive from a published snapshot, update on publication and removal, rebuild |
| `src/server/mesh/mesh-graph.ts` | The mesh read | projects, domains, published imports, hidden ends |
| `src/server/routes/mesh.ts` | The routes | the five operations of `contracts/mesh-operations.md` |
| `src/app/mesh/` | The interface | `MeshView.tsx`, `ProjectTile.tsx`, `MeshDetails.tsx`, `DependentsList.tsx`, `ImportsSection.tsx`, `ImportEditor.tsx`, `PartPicker.tsx`, `DisclosureNotice.tsx`, `use-mesh.ts`, `api.ts`, `mesh.css` |

### Flow: reading and saving a unit

1. The scanner indexes each file as today. A root is `Ossie ontology` with format `tessera`; a part is
   `Ossie ontology` with format `tessera` and role `part`, so access rules written against that type still
   apply (feature 011, decision 12).
2. Callers that need an ontology as a whole (graph, catalog, inspector summary, agent context, compile) call
   `readUnitStructure` and `combineUnit`. A file-level `inspect` is unchanged. T002 lists every caller
   first so none is missed.
3. `src/server/mesh/unit-reader.ts` reads the files of the unit as the person's reader. If any file of the
   unit or any provider interface is not readable, the set is "not checked for you": single-file findings are
   returned for the readable files and no set finding.
4. A save of a unit file calls the set precondition (FR-035) before the proposed change is parsed. The
   refusal is one error type with one message, whatever the cause.
5. Set findings are computed once per (file hashes, dependency snapshot, access identity) and held in
   `set-findings-store.ts`. The access identity is the policy engine's current configuration (found in
   `src/server/auth/authorize.ts`, `synchronize`); a change in it misses the key.

### Flow: resolving and publishing

1. "Update dependencies" (`mesh.dependencies.update`) reads each provider's published pointer
   (`src/server/projects/published-pointer.ts`), lists its snapshot with `snapshot-index.ts`, computes
   the closure and interface hash, validates pins (published history through `isAncestor`, or tags that
   resolve into it), and writes `tessera-dependencies.json` to the working copy with a base-hash check.
2. For a provider in the same repository no commit is recorded; the interface hash is recorded.
3. The publication check (`dependency-check.ts`) is added to `publicationChecks()` in
   `src/server/projects/publication-checks.ts`, so every publication path and feature 012's promotion run
   it. It reads the candidate snapshot, compares manifest and imports, reads pinned objects with the
   publishing person's access, and for same-repository providers compares the interface hash with the
   candidate's own files.
4. After the ref and pointer move, `dependents-registry.ts` rewrites the consumer's entry. It also runs when
   a project is removed (`src/server/projects/trash.ts` calls the same function).

### Flow: compile

1. The unit source (the `UnitSource` seam of feature 019, `src/server/tessera/unit-source.ts`) supplies the
   files of the unit and, from the manifest, the provider snapshots. If 019 has not landed, this feature
   creates the file with the single-folder reader and the dependency extension; 019 then adopts it.
2. `compile-unit` classifies files, runs unit structure checks, merges parts into each root, reads
   providers' closures, rejects more than one version of a provider, qualifies imported concepts by owner,
   rewrites references, drops `tessera_exports` with a loss entry and validates every output with the
   pinned schema.
3. The meaning check uses the address map to confirm that each source item names the same item in the output.

### Patterns used

- **Registry** (existing): one entry per new property. Problem: four places that would otherwise each hold
  the list.
- **Pure core, I/O at the edges**: the shared code never touches Git or the disk; `src/server/mesh/` does.
  Problem: the same checks must run in the browser, the server and the command line.
- **One precondition type** for "cannot read the whole set". Problem: two error shapes would make hidden and
  missing distinguishable.
- **Derived state with rebuild**: the dependents registry. Problem: a second source of truth that could drift
  from published snapshots.

### Interface

All new screens follow the existing tokens (`src/app/style.css`, `docs/theme.md`), the modal and button
styles of `src/app/projects/Modal.tsx`, the sidebar and details patterns of `src/app/workspace/`, and the card
and legend patterns of `src/app/graph/`. Text wraps everywhere; nothing is clipped or ellipsized; meaning never
rests on colour alone.

- **Imports section** (`ImportsSection.tsx`, `ImportEditor.tsx`): in the details of an ontology root. Lists each
  import with provider, alias, allowed concepts, version in use, update status and a "Not published" label when
  the import is only in the working copy. The editor is a form: provider picker (only readable exporting
  projects), alias, concept check list, version choice. It shows the disclosure notice. States: empty ("This
  ontology imports nothing yet"), loading (placeholder of the same height), error with retry, long names wrap,
  phone width stacks the form fields and turns the list into cards.
- **Part picker and unit display** (`PartPicker.tsx`; changes in `AddItem.tsx` and `SourceView.tsx`): "In file"
  choice on add; the inspector says "Part of <root>" or "Root with N parts". Orphan parts show a notice.
- **Mesh view** (`MeshView.tsx`): tiles grouped by domain, arrows drawn with a text label of owner, concepts
  and version; a list alternative below the picture (the picture is not the only way to read it); selection opens
  `MeshDetails.tsx`. Unnamed tile text: "A project you cannot open". States: empty, loading, error, partial
  (too many projects: grouped with counts), long text. At phone width the picture is replaced by the list.
- **Used by** (`DependentsList.tsx`): in `MeshDetails.tsx` for a provider the person may publish. Rows: name,
  domain, concepts, version, "Update available". Empty: "No published project imports from this one."
- **Disclosure notice** (`DisclosureNotice.tsx`): in the import editor and in the publish confirmation
  (`src/app/scm/DefaultBranchActions.tsx`). It names who will see what.
- Screenshots: the browser check records each state at 1280, 768 and 390 pixels in both themes. Capture and
  visual comparison are handed to Codex (tasks marked `[CODEX]`).

### Contracts

- [contracts/unit-and-parts.md](./contracts/unit-and-parts.md): properties, part marker, import syntax, finding
  codes and output rules.
- [contracts/dependency-manifest.md](./contracts/dependency-manifest.md): the manifest, the bundle manifest
  additions and the registry state file.
- [contracts/mesh-operations.md](./contracts/mesh-operations.md): the five operations.

## Defaults and where they come from

| Name | Default | Source |
|------|---------|--------|
| Parts per root | 200 | assumed |
| Imports per unit | 50 | assumed |
| Import chain depth | 8 | assumed |
| Rows per dependents page | 50 | assumed |
| Files per unit, bytes per unit, bytes per document | 10,000, 64,000,000, 2,000,000 | existing (`UNIT_LIMITS`, `SNAPSHOT_LIMITS`) |
| Dependents answer for 50 importers | 200 ms | assumed |
| Compile of 200 parts, 20 imports, 20 MB | 30 s | assumed, same as feature 011 |
| Random shuffled compiles in the determinism test | 100 | existing (feature 011 SC-002) |

## Files this feature owns

```text
src/shared/tessera/additions/{includes,exports,imports,part}.ts
src/shared/tessera/{unit-structure,unit-model,export-closure,imports,dependency-manifest,qualify,set-validation}.ts
src/server/mesh/{unit-reader,provider-resolution,dependency-update,dependency-check,set-findings-store,dependents-registry,mesh-graph}.ts
src/server/routes/mesh.ts
src/app/mesh/{MeshView,ProjectTile,MeshDetails,DependentsList,ImportsSection,ImportEditor,PartPicker,DisclosureNotice}.tsx
src/app/mesh/{use-mesh.ts,api.ts,mesh.css}
schemas/tessera-ontology-3-ossie-0.2.0.dev0.json, schemas/tessera-part-3-ossie-0.2.0.dev0.json
schemas/tessera-dependencies-v1.json
scripts/mesh-browser-check.ts, scripts/mesh-mutants.ts, scripts/mesh-mutation-cases.ts
tests/mesh/*.test.ts, tests/auth/mesh-parity.test.ts
tests/helpers/mesh-workspace.ts
tests/fixtures/tessera/mesh/ (units, providers, manifests, refusals, golden bundles)
```

## Shared files it touches

| File | Change | Also touched by |
|---|---|---|
| `src/shared/tessera/registry.ts`, `reserved-names.ts`, `format.ts` (`SUPPORTED_REVISIONS`) | four entries; remove `tessera_imports`; add revision 3 | 016 (revision 2, three names), 019 (none expected) |
| `src/shared/tessera/document-kind.ts`, `compile-unit.ts`, `meaning-check.ts`, `serialize.ts` | part and manifest kinds; merge, qualify, address map | 016 (dispositions), 019 (wraps `compile-unit`) |
| `src/shared/tessera/loss-report.ts` | report entries for `tessera_exports` | 016 (status counts) |
| `scripts/compile-schemas.ts`, `scripts/derive-tessera-schema.ts` | derived schemas for revision 3 and the part | 016 (revision 2), 019 (second base) |
| `src/shared/validation/validation.ts` | part and unit-aware single-file checks (part kind, import references) | 016 (attributes checks) |
| `src/shared/core/model.ts`, `src/shared/core/model-addresses.ts` | imported-concept entity kind and owner; item-to-file map | 014, 016, 017 (read these) |
| `src/shared/edit/item-model.ts`, `src/app/edit/AddItem.tsx`, `src/app/edit/references.ts` | file choice on add; references through aliases; move between parts records a migration | 016 (attribute editing and the same reference rewrite) |
| `src/server/projects/scanner.ts` | classify the manifest and parts | 011 |
| `src/server/projects/publication-checks.ts`, `publishing.ts`, `trash.ts` | dependency check; registry update hooks | 012 (reuses publication checks for promotion) |
| `src/server/projects/workspace/document-save.ts` | set precondition | 006 (calls it through the twin), 015 |
| `src/server/agent/context-assembly.ts`, `context-documents.ts` | read a unit as one ontology | 014 (counted operations read the same answers) |
| `src/server/auth/route-actions.ts`, `policies/operation-inventory.json`, `policies/matrix-cases.json`, `schemas/semantic-workbench-operations-v1.json`, `docs/operations.md` | five rows and entries; regenerate the table last | 012, 013, 014, 015, 019 |
| `src/server/handler.ts`, `src/server/projects/workspace.ts`, `src/server/projects/paths.ts` | register routes; compose the registry; `mesh` state folder | 006, 012, 013, 014, 015 |
| `src/server/tessera/unit-source.ts`, `scripts/tessera.ts` | dependency-aware source; command line refusal without data folder | 019 owns the seam; 011 owns the script |
| `src/app/workspace/SourceView.tsx`, `DetailsPanel.tsx`, `WorkspaceToolbar.tsx`, `src/app/scm/DefaultBranchActions.tsx` | unit display, mount Imports, open Mesh, disclosure notice | 014, 016, 017 |
| `src/app/graph/full-node-data.ts`, `FullGraphNodes.tsx`, `NeighborhoodGraph.tsx` | an `imported` flag and owner text on a card | 014 (traffic), 017 (change mark), 016 (rows) |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts`, `scripts/ci-validate.ts` | `test:mesh`, wiring | all |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/user-guide.md`, `docs/server-mode.md`, `docs/development.md`, `docs/item-addresses.md`, `docs/agent-runtime.md`, `schemas/README.md` | text | all |

## Overlaps with the other features

- **011 (format, on the base)**: this feature extends its registry, document kinds, unit compile, meaning check and
  bundle manifest. The one rule that changes is "revision 1 allows no part or composition marker"; revision 3 adds
  the part marker, and 011's refusal tests for revision 1 stay valid. Bundle manifest version rises to 2; a manifest
  without units reads as before.
- **012 (shared proposals)**: promotion is one atomic repository move that reuses the publication checks. This
  feature puts its dependency check inside `publicationChecks()`, so promotion gets it without any change in 012.
  Same-repository imports rely on that atomicity. Proposal imports are never in the registry (a proposal is not
  published). Textual conflict: none expected; both add routes and inventory rows in separate blocks.
- **013 (person sign-in)**: no direct use. The dependents read uses the existing `publish` action; person tokens
  that 013 adds are judged by the same action. Textual conflict in the shared route and inventory files only.
- **014 (usage counters)**: both touch the graph card files. 014 adds `traffic`, this feature adds `imported`;
  neither edits the other's component. Importer visibility: 014 never returns counts for importers (014 FR-030) and
  must not read `state/mesh/dependents.json`; this feature shows no counts. An imported concept's address belongs to
  the provider project, so 014's reader filter decides whether its count is shown. A test in T045 checks that
  neither store reads the other.
- **015 (agent panel)**: edits files through guarded save, so it meets the set precondition. No change to 015.
- **016 (attributes, agent context, governance)**: revision numbering and `reserved-names.ts` (see the coordination
  rule: the later merge renumbers). Governance and agent context of an imported concept are shown from the provider
  read-only. When compiled, the provider's Tessera additions on a copied concept are dropped with a loss entry that
  names the provider document. The attribute row component from 016 is reused for imported concepts without edit.
  016 also raises the loss report to version 2 (status counts) and regenerates the golden files that this feature
  extends with the bundle manifest version 2; whichever merges second regenerates them again.
- **017 (item diff and overlay)**: units change what a document is, so the diff reads a unit as the combined model.
  A concept moved between parts is a recorded migration (changed, not removed and added). Imports and exports are
  shown by the diff as document-level changes (a later improvement can add item kinds). The unpublished mark on an
  import in the editor reuses 017's label text.
- **019 (compile everywhere)**: owns `src/server/tessera/unit-source.ts` and the operations `compile.check`,
  `compile.run`, `compile.convert`. This feature adds dependencies to the unit source. If 019 is first, T035 extends
  its seam; if this feature is first, T035 creates the seam as 019 specified it. Convert-to-standard of a root with
  parts or imports must write the merged ontology and is refused when imports are present and not yet resolved; 019
  adds that case when this lands.
- **006 (MCP server)**: tools read and write single files and are unchanged. `validate_text` for a part gives
  single-file findings and the "set not checked" notice; no tool is added. The inventory rows of this feature say
  exposure is "later increment". The note for the 006 owner about `docs/mcp-contract.md` is task T061.

## Which tasks start now and which wait

- **Start now (no other feature needed)**: the baseline and fixtures (T001 to T006), the pure format code (T007 to
  T016), the unit work in the workbench (T017 to T022), the manifest and publication check (T029 to T034) and the
  compile changes (T036 to T041). They need only 011, which is on the base.
- **Start now, merge carefully**: registry, `reserved-names.ts`, `SUPPORTED_REVISIONS` and the derived schema script
  are shared with 016; revision numbers are decided at merge.
- **Wait for 019 or create its seam**: T035.
- **Wait for 012 only for its proof**: the promotion case in T031 runs when 012 is on the base; the task states a
  fallback proof with the existing publish path.
- **Ordered after the pure code, no other feature needed**: provider resolution and imports in the workbench (T023
  to T028), dependents (T042 to T045), partial readers (T046 to T049), the Mesh view (T050 to T054).
- **Documentation and gate hand-off** come last.

## Process (owner-approved 2026-11-17)

During implementation this feature runs only its own tests, `bun --bun run check` and `bun --bun run build`.
The full unit suite, mutation tests, every browser suite, the UI regression comparison against the last release
and the architecture review run once on the integrated batch. Tasks name a targeted proof and the last task hands
off. Heavy runs use `sw-midgard-run -- <command>`. Screenshot and visual-comparison tasks go to Codex.

## Project Structure

### Documentation (this feature)

```text
specs/018-multi-file-and-mesh/
├── spec.md
├── plan.md
├── callers.md            (written by the first tasks)
├── contracts/
│   ├── unit-and-parts.md
│   ├── dependency-manifest.md
│   └── mesh-operations.md
└── tasks.md
```

**Structure Decision**: pure code in `src/shared/tessera/` beside the format it extends; server code in a new
`src/server/mesh/` named for the concept, as `src/server/tessera/` is for the compiler; routes in
`src/server/routes/mesh.ts` like the other route files; interface in `src/app/mesh/`; tests in `tests/mesh/`.

## Complexity Tracking

No violations.
