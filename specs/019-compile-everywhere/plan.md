# Implementation Plan: Compile Everywhere

**Branch**: `019-compile-everywhere` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-compile-everywhere/spec.md`

## Summary

Feature 011 built the compiler as pure functions in `src/shared/tessera/` and a command line that
reads a committed snapshot. This feature puts that same core behind the operation boundary so the
browser, HTTP and MCP can use it, adds one reviewed source rewrite (convert to standard), and prepares
the base table for Ossie 0.3.0.

1. **A compile service** in `src/server/tessera/` that reads a unit through one seam (`UnitSource`),
   calls `compileUnit`, and returns results. It is the only new server logic.
2. **Four routes** (`src/server/routes/compile.ts`) registered in the route table and the operation
   inventory: `compile.check`, `compile.run`, `compile.bundle` (zip), `compile.convert`.
3. **A browser dialog** (`src/app/compile/`) reached from the existing export dialog and the
   validation panel.
4. **Two MCP tools** in feature 006's registry, twins of the first two operations.
5. **A conditional group** for Ossie 0.3.0 that starts only when the release exists. It has not been
   released on 2026-11-17 (upstream lists no 0.3.0 release or tag; the only tag is `osi-0.1.1-rc1`).

No change is made to the compiler, the loss report format or the manifest.

## Technical Context

**Language/Version**: TypeScript on Bun 1.4; React 19 for the dialog.

**Primary Dependencies**: none new. Existing: the shared Tessera modules, the snapshot reader
(`src/server/projects/published-snapshot.ts`), the zip writer (`src/server/projects/zip.ts`), the save
pipeline (`src/server/projects/workspace/document-save.ts`), the operation boundary
(`src/server/auth/operation-boundary.ts`), `bun:test`.

**Storage**: none. Compile is deterministic and nothing is cached or stored. The zip is streamed.

**Testing**: `bun test tests/compile/`, the existing parity and inventory tests that name the touched
files, one browser check (`scripts/compile-browser-check.ts`), mutants (`scripts/compile-mutants.ts`).

**Target Platform**: local and server mode; the MCP tools only where the endpoint is mounted.

**Project Type**: web service plus single-page app.

**Performance Goals** (tagged): 200 documents and 20 MB compile in 30 s on the development server
(source: feature 011, assumed and not measured; the scale task records the measurement). A check of a
fixture project answers within 2 s on the development server (assumed).

**Constraints**: no network; no write into a source tree, working copy or data folder except the single
saved file of a conversion; fail closed on hidden files; no unpublished content in any compile output;
files of about 400 lines, functions of about 40, no spec identifiers in comments.

**Scale/Scope**: about 9 new source files, 1 new route file, 2 tools, 7 interface files, 12 test files.

## Constitution Check

Checked against `.specify/memory/constitution.md` 4.0.1.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Compile reads the published snapshot in both modes; check may read the caller's working copy and is labelled unpublished. No outbound call. |
| II. Byte-Exact Source Preservation | Only conversion writes a source file, one file, as an ordinary save with a version check; the bundle is a derived download. |
| III. One Validation Rule Set | Check and compile call the shared validator through `compileUnit`; findings equal the browser's and the command line's. |
| IV. Atomic, Hash-Checked File Persistence | Conversion uses the existing save path; nothing else persists. |
| V. Pinned Official Standards | Bases enter only through the table; released schemas are stored unmodified with provenance and a hash test. Draft label unchanged. |
| VI. Verification Gate | New decisions (acceptance matching, snapshot selection, completeness, conversion preconditions, paging) get mutants. New routes get matrix and parity cases. |
| VII. Honest Claims | Docs say accepting loss is not approval; the command line is not an authorization boundary and the HTTP entry points are; nothing claims 0.3.0 support before release. |
| VIII. Readable Code | One folder per concept, domain names, small functions. |
| Technical Constraints | One operation boundary: every route has an inventory row and a route-action row; the MCP tools are twins. |

Complexity Tracking is empty.

## Design

### Modules

| Module | Concept | Holds |
|---|---|---|
| `src/server/tessera/unit-source.ts` | Where a unit comes from | `UnitSource` (`published`, `working`), reads files, labels the source, refuses unreadable files identically to missing ones |
| `src/server/tessera/compile-service.ts` | The three read operations | `check`, `run`, `bundle` over `UnitSource` and `compileUnit`; acceptance matching; part reads |
| `src/server/tessera/convert-service.ts` | The reviewed rewrite | preconditions, recompute, save through the document-save pipeline |
| `src/server/tessera/accept-loss.ts` | Acceptance | digest or inline policy against a report; pure |
| `src/server/tessera/output-part.ts` | Paged output | bounded part with commit, version and next offset; pure |
| `src/server/routes/compile.ts` | HTTP | four routes, body parsing, status mapping |
| `src/server/mcp/tools/standard-output.ts` | MCP | `check_standard`, `compile_standard` |
| `src/app/compile/` | Interface | `CompileDialog.tsx`, `LossPreview.tsx`, `ConvertDialog.tsx`, `use-compile.ts`, `api.ts`, `compile.css` |
| `src/shared/tessera/bases.ts` | Bases (conditional) | the 0.3.0 entry after release |

`accept-loss.ts` and `output-part.ts` are pure so that decisions sit apart from I/O.
`src/server/tessera/snapshot-source.ts` and `disk-source.ts` stay as feature 011 left them; the command
line keeps its own sources and the new `UnitSource` wraps the workbench's readers.

### The unit seam (feature 018)

`UnitSource.read(kind)` returns `{ files: UnitFile[], label, commit? }`. Today the files are one project
folder. Feature 018 widens the same return to parts and the dependency snapshots of imports without
changing callers. This feature owns the seam definition; 018 owns the widening.

### Flow of a compile

1. The route authorizes `export` on the project and resolves the reader.
2. `UnitSource` pins the published snapshot (`snapshots.withPin`), lists the project folder, checks the
   limits, reads every file the reader may read, and fails with the missing-file answer when any file
   of the unit is unreadable.
3. `compileUnit` runs; `accept-loss` compares the digest or policy.
4. `released` streams the zip (`bundle`) or, for tools, returns the manifest and a part.
5. The boundary writes one audit record.

### Flow of a conversion

1. Route authorizes `edit` on the file and `authorizeWrite`.
2. `convert-service` checks: Tessera ontology, file clean against the commit of the caller's branch,
   history present.
3. It reads the working-copy unit, recomputes input hashes and the loss digest, and compares with the
   request.
4. It compiles the unit with this file standard, takes the compiled bytes of that file and calls the
   ordinary save with the request's `baseHash`. Guards and audit run inside the save.

### Patterns used

- **Seam with two implementations** (`UnitSource` published and working): the same compile runs on two
  sources, and feature 018 needs a third shape.
- **Functional core**: acceptance and paging are pure functions.

No other pattern.

### Interface

Follows the visual language of the export dialog (`src/app/projects/export-dialog.css`): the same
`Modal`, tokens (`--color-accent`, `--color-border`, `--color-text-muted`, status tokens for errors only)
and button styles. New files: `CompileDialog.tsx` (source choice, states), `LossPreview.tsx` (groups by
property, counts first, each group opens a list of document and item address, digest in a monospace
block that wraps), `ConvertDialog.tsx` (loss preview, existing `DiffView` before and after, plain
warning, confirm). Entry points: a "Standard Ossie" option in `ExportDialog.tsx` that opens
`CompileDialog`, and two buttons ("Check as standard Ossie", "Convert to standard") in
`ValidationPanel.tsx` shown only for Tessera documents.

States: unavailable (no snapshot, or no permission, with the reason in words), loading (stable
placeholder), nothing to do (no Tessera document), refused (findings list with paths), loss needs
acceptance (preview and an explicit accept action), released (download button and the digest),
error (message and Retry). Status is always text plus an icon shape, never colour alone. Long names
wrap; groups stack on phone width; the accept action and download stay reachable without horizontal
scroll. Light and dark follow the tokens.

### Contracts

- [contracts/http-operations.md](./contracts/http-operations.md)
- [contracts/mcp-tools.md](./contracts/mcp-tools.md)

## Defaults and where they come from

| Name | Default | Source |
|---|---|---|
| Output part size | 32,768 bytes | existing: MCP text limit in `docs/mcp.md` |
| Compile project limits | 64,000,000 bytes, 10,000 files, 2,000,000 per file | existing: `SNAPSHOT_LIMITS` and feature 011 |
| Export size ceiling | 64,000,000 bytes | existing: `EXPORT_LIMIT_BYTES` in `src/server/routes/export.ts` |
| Compile scale target | 200 documents, 20 MB, 30 s | feature 011, assumed |
| Check answer time target | 2 s on the fixture | assumed |
| MCP call limits | 20 per second, 4 at once, 30 s | existing: `docs/mcp.md` |
| Concurrent compiles per caller | none added | decision: the existing call limits and request limits apply |

## Project Structure

### Documentation (this feature)

```text
specs/019-compile-everywhere/
├── spec.md
├── plan.md
├── tasks.md
└── contracts/
    ├── http-operations.md
    └── mcp-tools.md
```

### Files this feature owns

```text
src/server/tessera/unit-source.ts, compile-service.ts, convert-service.ts, accept-loss.ts, output-part.ts
src/server/routes/compile.ts
src/server/mcp/tools/standard-output.ts
src/app/compile/CompileDialog.tsx, LossPreview.tsx, ConvertDialog.tsx, use-compile.ts, api.ts, compile.css
tests/compile/*.test.ts, tests/auth/compile-parity.test.ts, tests/mcp/standard-output.test.ts
tests/fixtures/compile/
scripts/compile-browser-check.ts, scripts/compile-mutants.ts, scripts/compile-mutation-cases.ts
docs/compile.md
```

Conditional (after the release): `schemas/ossie-ontology-<version>.json`, `schemas/ossie-semantic-model-<version>.json`,
`schemas/ossie-mapping-<version>.json` as the released files are named, `schemas/tessera-ontology-<revision>-ossie-<version>.json`,
`tests/fixtures/ossie-0.3/`, `docs/ossie-0.3-inventory.md`.

### Shared files it touches

| File | Change | Also touched by |
|---|---|---|
| `src/server/auth/route-actions.ts` | four rows in one block | 012, 013, 014, 015, 017, 018 (own blocks) |
| `policies/operation-inventory.json`, `schemas/semantic-workbench-operations-v1.json` | four entries; no new vocabulary | 012, 013, 014, 015, 017, 018 |
| `policies/matrix-cases.json`, `tests/auth/route-actions.ts` | cases for the rows | all server features |
| `docs/operations.md` | regenerated by `bun scripts/operation-inventory-table.ts` | all |
| `src/server/handler.ts` | register `compileRoutes` | 006, 012, 013, 014, 015, 017, 018 |
| `src/server/projects/workspace.ts` | expose the snapshot pin and the working-copy reader to the compile service | 006, 012, 014 |
| `src/server/mcp/tool-registry.ts`, `docs/mcp.md`, `docs/mcp-contract.md`, the 006 contract test | two tools, two rows, one disposition row; tool count in the page changes from 21 to 23 | 006 owns; 013 and 015 may edit nearby |
| `src/app/projects/ExportDialog.tsx` | one option and one entry | none |
| `src/app/validation/ValidationPanel.tsx` | two buttons for Tessera documents | 016 (governance findings hints) |
| `src/app/projects/api.ts` | none; the dialog keeps its own `src/app/compile/api.ts` | none |
| `src/shared/tessera/bases.ts`, `schemas/README.md`, `scripts/compile-schemas.ts`, `scripts/derive-tessera-schema.ts`, `src/generated/validators.js` | the 0.3.0 entry (conditional) | 016 and 018 (derived schema per revision) |
| `src/shared/validation/validation.ts`, `src/shared/validation/ossie-versions` modules, mapping validators | 0.3.0 rules (conditional) | 016 (governance checks) |
| `src/shared/metrics/extension.ts`, `schemas/semantic-workbench-*.json` | metric payload conversion (conditional) | 016 (adapter) |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts` | `test:compile` suite, mutants | all |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/user-guide.md`, `docs/development.md`, `docs/operations.md` | text | all |

## Overlaps with the other features

- **011 (format and compiler, base of this branch)**: reads `compileUnit`, the loss report and manifest
  as they are. No edit to `src/shared/tessera/compile-*.ts`. Starts after 011 is on the branch base
  (it is).
- **016 (attributes, context, governance)**: adds `statusCounts` to the loss report. The preview and the
  MCP summary show it when present. 016 also extends governance guards that the metric conversion
  and a conversion save run through. Merge order free; the metric-payload conversion waits for 016's
  adapter.
- **017 (item diff and overlay)**: no shared file except `route-actions.ts` and the inventory (separate
  rows). The conversion review reuses `DiffView`, not 017's item diff. If 017 is merged first, the
  review may offer its item diff as a later improvement.
- **018 (multi-file and mesh)**: widens `UnitSource` and `compileUnit`'s input. 019 builds its seam to
  take that without change; the compile of a project with imports needs the dependency snapshots that
  018 resolves. Until 018 lands, a project with parts or imports is refused by 011's rules.
- **012 (shared proposals)**: no overlap in behaviour; shared rows in route actions and inventory.
  Proposals are never compiled (compile reads the published snapshot only).
- **013 (person sign-in)**: adds connection scopes. The tools are read-only; the compile tool needs the
  `export` authority. 013 must list the tools in its scope table, and until its follow-ups the endpoint
  is not mounted in server mode (spec FR-036).
- **014 (usage counters)**: its hook counts agent context, plan and explanation requests. Compile and
  check are not counted. Add them to its counted-operations list only if the owner asks.
- **015 (agent panel)**: it works on files, not compile. The panel must not offer conversion.
- **006 (MCP server)**: owns the registry, the contract tables and tests. 019 adds two tool entries,
  three table rows and the tool count. If 006 merges first, this feature edits those files; if
  019 merges first, the rows wait for 006 and the tasks list them as the 006 owner's.

## Start now, and what waits

| Group | Starts | Waits for |
|---|---|---|
| Fixtures, accept-loss, output-part (pure) | now | nothing |
| Unit source, compile service, routes, inventory, parity | now | nothing |
| Browser dialog, export entry | after the routes' answer shapes (contracts exist) | nothing else |
| Convert service and dialog | after the compile service | nothing else |
| MCP tools and contract rows | after the compile service; 006 on the main branch for the registry edit | 006 merged |
| Loss report status counts in the preview | after 016's loss report change | 016 (optional) |
| Multi-file units | when 018 lands | 018 |
| Ossie 0.3.0 group | after the release | the release; metric conversion also waits for 016 |

## Process (owner-approved 2026-11-17)

During implementation this feature runs only its own tests, `bun --bun run check` and
`bun --bun run build`. The full unit suite, mutation tests, every browser suite, the UI regression
comparison against the last release and the architecture review run once on the integrated batch.
Heavy runs use `sw-midgard-run -- <command>`. Screenshot and visual-comparison tasks are marked
[CODEX] and handed to Codex under the screenshots rule.

## Complexity Tracking

No violations.
