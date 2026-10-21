<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0 (MAJOR: Principle IV redefined; SQLite becomes a cache)
- Modified principles: I. Local-Only Operation (data layout under data/, workbench limited to
  data/projects/, explicit Git remote rule); II. Byte-Exact Source Preservation (file on disk is
  the source); III. One Validation Rule Set (file store wording, validation of files arriving by
  Git or external edits); IV. Transactional, Revision-Checked Persistence → Atomic, Hash-Checked
  File Persistence (redefined); VI. Verification Gate (new mutant areas); VII. Honest Claims
  (data layout and Git network use documented)
- Added principles: none
- Removed principles: none
- Modified sections: Technical Constraints (store of record, Git requirement)
- Templates requiring updates: .specify/templates/plan-template.md (✅ no change needed: its
  "Constitution Check" gate reads this file); spec-template.md (✅ no change needed);
  tasks-template.md (✅ no change needed)
- Source: specs/001-workbench-improvements/constitution-amendment-proposal.md (approved)
- Follow-up TODOs: none
-->

# Semantic Workbench Constitution

## Core Principles

### I. Local-Only Operation

- The API and the frontend MUST bind to loopback (`127.0.0.1`) only. The API MUST reject
  cross-origin requests from origins other than the local frontend and API.
- The application MUST NOT fetch remote documents, `owl:imports`, schemas or referenced files.
  Every schema it validates against is a file shipped in the repository.
- The application MUST NOT call a hosted LLM or any other hosted service. Agent-facing endpoints
  supply deterministic context and planning; language interpretation and query execution belong
  to the caller.
- User data stays on this machine, under `data/`: project folders in `data/projects/`,
  application state in `data/state/`, the trash in `data/trash/`. All paths are relative to the
  configured data root (`data/` by default; tests use an isolated temporary root). The workbench
  MUST NOT open project folders or repositories outside `data/projects/`, and MUST NOT write
  outside the data root. No feature may send document content
  off the machine, except Git remote operations (fetch, pull, push, sync) that the user triggers
  explicitly, against a remote the user configured for that project. These use the machine's
  own Git installation and credential configuration; the workbench never stores, prompts for or
  transmits credentials itself, and never contacts a remote automatically or in the background.

Rationale: users load confidential data contracts and models; the product promise is "your
definitions stay local".

### II. Byte-Exact Source Preservation

- The file on disk is the exact text the user imported or last saved. Export MUST return those
  bytes unchanged, including comments, key order, whitespace, line endings and
  unknown fields.
- Form-based or item-level edits MUST change only the edited item. YAML edits MUST retain
  comments and unknown fields; JSON edits MUST retain JSON syntax and SHOULD retain the original
  formatting outside the edited value. RDF serializations are edited as source text.
- Unsaved drafts, including invalid drafts, MUST remain exportable so work can be recovered.
- Derived views (graph, catalog, overview, mappings, layout positions, grouping corrections)
  MUST NOT rewrite the source document.

Rationale: the workbench is an editor for standards documents that live in other systems; silent
reformatting breaks diffs, reviews and downstream tooling.

### III. One Validation Rule Set

- The browser, the inspector, the file store and the HTTP save endpoint MUST apply the same
  validation rules from the same shared modules. A document the editor reports as valid MUST be
  accepted by the API, and vice versa.
- Invalid documents MUST be rejected before any file is written. Import batches MUST be
  preflighted, and invalid files MUST be repairable before they are saved. Files that arrive by
  Git (pull, branch switch) or external edits are validated on scan and shown as invalid, never
  silently rewritten.
- Findings MUST carry a JSON-pointer path and, when reliable, a line/column location; findings
  without a reliable location stay document-level instead of pointing at a guessed line.
- Validation algorithms MUST stay bounded (size limit, alias limits, linear-time graph checks) so
  that hostile or very large inputs cannot hang the browser or the API.

### IV. Atomic, Hash-Checked File Persistence

- Project files on disk are the only source of truth. Each save MUST write a temporary file and
  atomically rename it over the original, then reindex.
- Every save MUST carry the content hash of the file version it was based on; if the file's
  current hash differs, the save MUST be rejected and the difference shown. No write may
  silently overwrite newer content, whether it came from another tab, an external editor or Git.
- Operations that touch several files (project delete, restore, clear, multi-file saves,
  migration) MUST be journaled so that an interrupted operation is completed or rolled back on
  the next start.
- Application state that must survive (project registry, view settings, grouping corrections,
  rejected suggestions, drafts, trash log) MUST be kept in durable state files written
  atomically, never only in the cache.
- The SQLite database is a rebuildable cache (hashes, entities, diagnostics, suggestions).
  Deleting it MUST lose nothing; it MUST be rebuilt by rescanning project folders.
- Git MUST be invoked with argument lists (never a shell string), an explicit working directory
  inside `data/projects/`, terminal prompts disabled (a configured credential helper may show
  its own window) and timeouts, serialized per repository. Managed
  repositories MUST disable line-ending conversion so committed bytes equal saved bytes. Delete
  operations MUST NOT rewrite Git history.
- Migrations of stored content MUST back up the previous store, verify every migrated file's
  hash against its original bytes, and stop without changes if any verification fails.

### V. Pinned Official Standards

- ODCS, Apache Ossie (core, ontology, mapping) and other standards are validated against pinned
  official schema snapshots stored in `schemas/`, with their source commit or version recorded.
- Upstream examples used as fixtures MUST be stored unmodified and hash-checked.
- Supporting a new standard version means adding a new pinned schema, not editing an existing one.
- Workbench-specific interpretations (display groupings, metric references, project grouping)
  MUST be labelled as application choices, never presented as standard semantics.

### VI. Verification Gate (Tests, Browser Checks, Targeted Mutations)

- Every behaviour change MUST ship with automated tests: unit/integration tests under `tests/`
  (`bun test`), type checking (`bun --bun run check`) and a production build
  (`bun --bun run build`).
- Every user-visible change MUST be covered by a browser check under `scripts/` that runs against
  a mocked API or an isolated in-memory store. Browser checks MUST NOT modify the user's real
  workspace; read-only live inspection is the only exception.
- New decision logic (validation rules, persistence guards, base-hash rejection, journal
  recovery, trash restore without overwrite, Git argument handling, remote operations only on
  explicit action, deletion, version diffing, graph filtering, planning) MUST add targeted
  mutants to `scripts/mutation-tests.ts`. The unmodified
  baseline MUST pass and every mutant MUST be detected.
- Layout and UI work MUST include geometry assertions (no overlapping controls, contained panels)
  across the viewport matrix of the responsive suite.

### VII. Honest Claims

- The README and docs MUST describe only behaviour that is implemented and tested. Limits
  (what is not validated, executed, reasoned or fetched) MUST be stated as plainly as features.
- Counts quoted in documentation (entities, relationships, bindings, checks, mutants) MUST be
  produced by the code or tests, and updated when they change.
- Performance or scale claims MUST name the fixture and the check that measures them.
- The README MUST document the folder layout under `data/`, which Git operations contact a
  network, and that credentials come from the machine's Git configuration.

## Technical Constraints

- Frontend: React 19 + TypeScript + Vite+ in `src/`. API: Bun HTTP server in `server/`; project
  folders under `data/projects/` are the store of record; SQLite (`bun:sqlite`) is a rebuildable
  cache; the machine's Git is required for Source Control features.
- Single-user, local workstation application. There is no authentication layer, so the loopback
  binding and origin check are the security boundary and MUST be preserved by every new endpoint.
- Input size limit: 2,000,000 UTF-8 bytes per document, enforced in the browser and the API.
- Heavy computation (layout, routing, large validation) runs off the main thread where it would
  otherwise block typing or interaction.
- New runtime dependencies MUST be justified in the plan (bundle size, licence, maintenance) and
  MUST NOT introduce network calls at runtime.

## Development Workflow and Quality Gates

- Work happens on feature branches; `main` only receives reviewed merges. Releases are tagged
  (`v0.1.0` is the first).
- A change is complete when: `bun test`, `bun --bun run check` and `bun --bun run build` pass;
  the relevant browser suites (`test:ui`, `test:responsive`, `test:edges`,
  `test:grouping-validation`, `test:examples:ui`) pass against the dev server; `test:mutation`
  detects every mutant; and the README reflects the new behaviour.
- Destructive operations (deleting documents, projects, the workspace, or history) MUST be
  reachable from the UI with an explicit user action; maintenance scripts are never the only way
  to perform a user task.
- Spec Kit artefacts live in `specs/<NNN-feature>/`. Plans MUST include a Constitution Check that
  lists each principle and how the plan complies, or justifies a documented exception.

## Governance

- This constitution supersedes conflicting practices in the repository. Plans, task lists and
  reviews MUST check compliance with every principle.
- Amendments are made by pull request that edits this file, states the version bump and its
  reason, and updates affected templates or docs in the same change.
- Versioning: MAJOR for removing or redefining a principle; MINOR for adding a principle or
  materially expanding guidance; PATCH for wording fixes.
- Exceptions MUST be recorded in the feature's plan under "Complexity Tracking" with the reason
  and the simpler alternative that was rejected.

**Version**: 2.0.1 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
