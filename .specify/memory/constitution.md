<!--
Sync Impact Report
- Version change: 3.1.0 → 3.2.0 (MINOR: Principle I materially expanded with opt-in, server-mode
  operational telemetry)
- Reason: operators of a server need traces, metrics and logs to run it. Principle I forbade every
  outbound call beyond the identity provider and Git remotes, so a server could not report its own
  health to Azure Monitor. The amendment allows exactly that, and nothing else.
- Modified principles: I. Local and Server Modes. Server mode may send operational telemetry to
  Application Insights when an operator sets a connection string; local mode still makes no network
  call and loads no telemetry code. The sentence that bars document content from leaving the
  machine now also names telemetry. Everything else in I is unchanged.
- Added principles: none
- Removed principles: none
- Modified sections: none outside I. Principle VII already requires the README to list every
  outbound call of server mode, so telemetry is documented there; the dependency rule in
  Technical Constraints is satisfied because the new libraries make the call Principle I now allows
- Templates requiring updates: .specify/templates/plan-template.md (✅ no change needed: its
  "Constitution Check" lists every principle from this file); spec-template.md and
  tasks-template.md (✅ no change needed); README.md (✅ gains "Logging and telemetry");
  specs/005-observability/plan.md (✅ Constitution Check written against 3.2.0)
- Approval: approved by the owner on 2026-10-23, as part of choosing Azure Monitor telemetry for
  release v0.5.0
- Follow-up TODOs: none
- Earlier: 3.0.1 → 3.1.0 (MINOR, principle VIII added and the quality gate expanded; the 3.x line
  was drafted on a base without the 2.2.0 amendment, so rebasing feature 003 onto 002 merged the two
  lines), 3.0.0 → 3.0.1 (PATCH, wording: second directory read for group display names; roles and
  access grants instead of role mappings and assignments), 2.1.0 → 3.0.0 (MAJOR, drafted on branch
  003: Principle I redefined into local and server modes; "single-user, no authentication layer"
  removed), 2.1.0 → 2.2.0 (Readable Code), 2.0.1 → 2.1.0 (clone), 1.0.0 → 2.0.0 (Principle IV
  redefined), 2.0.0 → 2.0.1 (wording)
-->

# Semantic Workbench Constitution

## Core Principles

### I. Local and Server Modes

The workbench runs in exactly one of two modes, chosen at start.

**Local mode** (default):

- The API and the frontend MUST bind to loopback (`127.0.0.1`) only. The API MUST reject
  cross-origin requests from origins other than the local frontend and API, and requests
  addressed to non-loopback host names. Local mode MUST refuse to bind to any other address.
- There is no sign-in. One implicit principal with the Admin role is used for every
  authorization decision, through the same decision boundary as server mode.
- Remote Git operations use the machine's own Git installation and credential configuration; the
  workbench never stores, prompts for or transmits credentials itself.

**Server mode**:

- Every route except sign-in callbacks and health endpoints MUST require an authenticated
  principal, signed in through OpenID Connect (authorization code with PKCE, the server acting as
  a confidential client). Browsers hold only an HttpOnly, Secure, SameSite session cookie; tokens
  MUST stay on the server. Bearer tokens are accepted only on the agent API.
- The server MUST refuse to start without a complete identity provider configuration and valid
  policies, and MUST serve the frontend and the API from one origin.
- Outbound network calls are limited to the configured identity provider (including its
  directory API, used only to resolve membership of configured groups and to read their display
  names, and its token endpoint,
  used to obtain tokens on behalf of the signed-in person), to Git remotes and their hosts'
  token endpoints, only when a person explicitly triggers a remote operation or connects an
  account, and to operational telemetry as described below. Remote operations use that person's own delegated credential, passed to Git for one
  command only; credentials MUST NOT be stored in plain text and MUST NOT be written to Git
  configuration.
- Adding or changing a remote address and cloning are Admin actions, limited to an allow-list of
  hosts.
- **Operational telemetry** is opt-in and exists only in server mode:
  - It is off unless the operator sets an Application Insights connection string. The server MUST
    accept only Microsoft's Application Insights ingestion hosts in that string, and MUST NOT
    load the telemetry libraries, open a connection or make any network call for telemetry while
    it is off.
  - It carries facts about the running service: build identity, route templates (never raw
    paths), status codes, durations, counts, Git subcommand and option names, error names with
    redacted messages, and a keyed pseudonym of the person or client. It MUST NOT carry document
    content, file names, paths, project names, query strings, tokens, cookies, secrets, credentials,
    or any name, address or identifier of a person other than that pseudonym.
  - Browsers MUST NOT call any telemetry service. A signed-in browser may send JavaScript errors
    and timings, and nothing else, to the workbench API in size-limited, rate-limited, schema-
    checked reports. The server forwards them like its own telemetry, and only while telemetry is
    on.
  - Telemetry is operational and sampled; it never replaces or feeds the audit log, which stays on
    the data root.

**Both modes**:

- The application MUST NOT fetch remote documents, `owl:imports`, schemas or referenced files.
  Every schema it validates against is a file shipped in the repository.
- The application MUST NOT call a hosted LLM or any other hosted service beyond those listed
  above. Local mode MUST NOT send operational telemetry. Agent-facing endpoints supply deterministic context and planning; language
  interpretation and query execution belong to the caller.
- User data stays under the configured data root (`data/` by default; in server mode the
  container's mounted storage; tests use an isolated temporary root): project repositories in
  `data/projects/`, per-person working copies in `data/worktrees/`, the administration
  repository in `data/admin/`, application state in `data/state/`, the trash in `data/trash/`.
  The workbench MUST NOT open repositories outside `data/projects/`, `data/worktrees/` and
  `data/admin/`, and MUST NOT write outside the data root. No feature may send document content
  off the machine or container, and operational telemetry never carries any, except Git remote
  operations (clone, fetch, pull, push, sync)
  that a person triggers explicitly, against a remote configured for that project. A clone is
  created only in a new folder inside `data/projects/`, and the address entered becomes that
  project's configured remote. The workbench never contacts a remote automatically or in the
  background.
- The server MUST NOT send a person any file, path, event, derived view or count about a resource
  that person may not read.

Rationale: users load confidential data contracts and models. Locally the promise is "your
definitions stay on your machine"; on a server it is "your definitions reach only the people
allowed to read them, and leave only through a Git action someone took".

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
- Access control MUST NOT redact a document: a person receives a file's exact bytes or nothing.

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
  rejected suggestions, drafts, trash log, sessions, audit log) MUST be kept in durable state
  files written atomically (the audit log append-only), never only in the cache. Access
  configuration (policies, roles, access grants, project access) MUST live in the
  administration Git repository, one commit per change.
- In server mode drafts, view state, grouping corrections and trash entries MUST be owned by a
  person and served only to that person (trash entries also to people allowed to restore them).
  Each person edits only their own Git working copy of a repository; no operation of one person
  may change another person's files, branch, index or drafts.
- The SQLite database is a rebuildable cache (hashes, entities, diagnostics, suggestions).
  Deleting it MUST lose nothing; it MUST be rebuilt by rescanning project folders.
- Git MUST be invoked with argument lists (never a shell string), an explicit working directory
  inside the data root's repository folders, terminal prompts disabled (a configured credential
  helper may show its own window in local mode) and timeouts, serialized per repository across
  every working copy of it. Managed repositories MUST disable line-ending conversion so committed
  bytes equal saved bytes. Delete operations MUST NOT rewrite Git history.
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
  recovery, trash restore without overwrite, Git argument handling, remote operations, clone
  included, only on explicit action, deletion, version diffing, graph filtering, planning,
  authorization decisions, list and event filtering, guarded-field checks, session and token
  validation) MUST add targeted mutants to `scripts/mutation-tests.ts`. The unmodified
  baseline MUST pass and every mutant MUST be detected.
- An authorization test matrix MUST call every route with every test role and scope (readable,
  unreadable, guarded) and compare each answer with the expected decision; any byte of an
  unreadable file in a response or event fails it. Every new route MUST be added to the matrix.
- Layout and UI work MUST include geometry assertions (no overlapping controls, contained panels)
  across the viewport matrix of the responsive suite.

### VII. Honest Claims

- The README and docs MUST describe only behaviour that is implemented and tested. Limits
  (what is not validated, executed, reasoned or fetched) MUST be stated as plainly as features.
- Counts quoted in documentation (entities, relationships, bindings, checks, mutants) MUST be
  produced by the code or tests, and updated when they change.
- Performance or scale claims MUST name the fixture and the check that measures them.
- The README MUST document both modes; the folder layout under `data/`; which Git operations
  (clone, fetch, pull, push, sync) contact a network; where credentials come from in each mode
  (the machine's Git configuration locally, the person's delegated credential on a server); the
  roles and what each can see and do; every outbound call of server mode; and its single-instance
  limit.

### VIII. Readable Code

- Layout is decided by the formatter (Oxfmt, configured in `.oxfmtrc.json`): 100-column lines,
  2-space indentation, semicolons, trailing commas. `bun run fmt:check` MUST pass; unformatted code
  fails the gate.
- One statement per line and one variable per declaration. No line over 100 characters except a
  string or URL that cannot be split.
- Names describe what a thing is, in words; single letters only for loop indexes and tiny lambdas.
  Functions do one thing (about 40 lines); React components stay around 150 lines; long inline
  handlers are named functions; no nested ternaries.
- Comments are plain English that a developer new to the repository understands without the
  spec. They explain why or a non-obvious constraint, one idea per sentence, about three lines per
  block. Every module starts with a one- or two-sentence header; exported functions, components and
  types carry a short JSDoc. Comments MUST NOT contain spec, task or research IDs (FR-, SC-, T0xx,
  R12, US3, phase numbers) or process notes; traceability belongs in commit messages and specs.
  `scripts/check-comments.ts` enforces the ID rule.
- Test names are plain sentences describing behaviour.

Rationale: the code is read far more often than it is written, by people who have not read the
planning documents.

## Technical Constraints

- Frontend: React 19 + TypeScript + Vite+ in `src/`. API: Bun HTTP server in `server/`; project
  folders under `data/projects/` are the store of record; SQLite (`bun:sqlite`) is a rebuildable
  cache; the machine's Git is required for Source Control features.
- Every route and every server-side derivation MUST obtain its access decision from the one
  authorization boundary (`authorize` / `filter`), backed by policies evaluated in-process with no
  network call; no route decides access by itself, and invalid policies stop the server. In local
  mode the loopback binding and origin check remain the outer boundary and MUST be preserved by
  every new endpoint.
- Server mode runs as a single instance per data root (in-process locks, event buffer and cache);
  running more than one instance requires an amendment.
- Input size limit: 2,000,000 UTF-8 bytes per document, enforced in the browser and the API.
- Heavy computation (layout, routing, large validation) runs off the main thread where it would
  otherwise block typing or interaction.
- New runtime dependencies MUST be justified in the plan (bundle size, licence, maintenance) and
  MUST NOT introduce network calls at runtime other than those Principle I allows. This includes
  the policy engine and the OpenID Connect and token libraries.

## Development Workflow and Quality Gates

- Work happens on feature branches; `main` only receives reviewed merges. Releases are tagged
  (`v0.1.0` is the first).
- A change is complete when: `bun test`, `bun --bun run check` (TypeScript, `fmt:check`, Oxlint and
  the comment check) and `bun --bun run build` pass;
  the relevant browser suites (`test:ui`, `test:responsive`, `test:edges`,
  `test:grouping-validation`, `test:examples:ui`) pass against the dev server; `test:mutation`
  detects every mutant; and the README reflects the new behaviour.
- Destructive operations (deleting documents, projects, the workspace, or history) MUST be
  reachable from the UI with an explicit user action by the role that holds them; maintenance
  scripts are never the only way to perform a user task.
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

**Version**: 3.2.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-23
