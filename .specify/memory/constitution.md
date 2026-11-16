<!--
Sync Impact Report
- Version change: 3.2.0 → 4.0.0 (MAJOR: Principles II, III and V are redefined and Principle I
  gains exceptions to rules it stated absolutely)
- Why MAJOR: Governance reserves MAJOR for redefining a principle. V no longer says "only pinned
  standards are validated"; it now admits a workbench authoring format (Tessera) beside them.
  III no longer says one rule set judges one document; it separates document, complete-set and
  reader findings. II no longer says export is the only output; a derived standard export now
  sits beside the byte-exact one. I no longer says every route needs a sign-in or that bearer
  tokens exist only on the agent API, and it narrows "no disclosure about unreadable resources".
  A MINOR bump would hide that existing plans and tests were written against the old wording.
- Modified principles:
  - I. Local and Server Modes: published means an immutable default-branch snapshot in both modes
    and agents plan only from it; push limited to published history; MCP person connections with
    workbench-issued tokens bound to the browser session; the unauthenticated authorization
    endpoints; no outbound client-metadata fetch; local endpoint capability token; delegated
    autonomous administration with browser approval for irreversible deletion; the narrow
    dependent-disclosure exception for provider Stewards and Admins; content given to an agent
    reaches that agent's model.
  - II. Byte-Exact Source Preservation: standard Ossie export is a derived output beside the
    byte-exact export, never a replacement.
  - III. One Validation Rule Set: schema selection by marker, set-level validation of compilation
    units, and the split into document, complete-set and reader-specific findings.
  - IV. Atomic, Hash-Checked File Persistence: aggregated identity-free usage counters as a
    separate opt-in store; durable hashed connection tokens; operation records and receipts;
    guarded Git operations on a shared working copy.
  - V. Pinned Official Standards (title unchanged): Tessera as a strict superset of a pinned Ossie
    version with namespaced additions; compiled output must pass the pinned schema, refuse
    unsupported translations and report every loss; how a released Ossie base is adopted.
  - VI. Verification Gate: new decision logic and the authorization matrix cover the compiler,
    published-snapshot selection, connection scopes and every MCP tool beside its HTTP twin.
  - VII. Honest Claims: how Tessera and the compiler are described, qualified base claims, and
    the limits the README must state about unpublished work, local MCP, retries and counters.
- Added principles: none
- Removed principles: none
- Modified sections: Technical Constraints (MCP tools dispatch through the one authorization
  boundary; cross-project references resolve only through a declared import)
- Unchanged: VIII, Development Workflow and Quality Gates, Governance
- Decisions not written into the constitution (they belong in specs and plans): address grammar,
  proposal lifecycle and branches, dependency manifest format, department and organization
  compile targets, export status filtering, governance migration, attribute editing, compatibility
  rules, query-count import, audit and replay design, protocol and client matrix, resource and
  prompt state, whole-workbench inventory, ACP, roadmap order, product naming, upstream proposals
- Templates requiring updates: .specify/templates/plan-template.md, spec-template.md and
  tasks-template.md (✅ no change needed: the Constitution Check reads this file at plan time);
  constitution-template.md (✅ scaffold only)
- Docs requiring follow-up (not changed here, because this change writes only this file):
  README.md (⚠ local-mode promise and the sentence on content reaching an external agent's model;
  Tessera and compiler wording; outbound-call list; usage counters), ARCHITECTURE.md (⚠ published
  snapshot, schema selection by marker, compiler, MCP authorization boundary, new durable
  stores), docs/server-mode.md and docs/configuration.md (⚠ connection tokens, the authorization
  endpoints, client registration, counters and retention), docs/agent-runtime.md (⚠ published-only
  planning for every agent), docs/user-guide.md (⚠ publication step in local mode, standard
  export beside exact export); specs/003-authn-authz and specs/005-observability keep their
  Constitution Checks against the earlier versions; new specs check against 4.0.0
- Approval: decision E23 of the Tessera and MCP design decisions, 2026-11-16
- Follow-up TODOs: none
- Earlier: 3.1.0 → 3.2.0 (MINOR, opt-in server-mode operational telemetry, approved 2026-10-23),
  3.0.1 → 3.1.0 (MINOR, principle VIII added and the quality gate expanded; the 3.x line
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
- The local MCP endpoint additionally requires a random per-installation capability. The stdio
  bridge reads it automatically; it travels only in an authentication header or protected process
  configuration, never in a URL, tool argument or log. The endpoint keeps the loopback binding,
  exact Host check and bounded JSON parsing, and refuses browser-origin requests. The capability
  stops casual access by other users; it is not isolation from a process running as the same
  operating-system user, and the README MUST NOT call a local installation a multi-user sandbox.
- Remote Git operations use the machine's own Git installation and credential configuration; the
  workbench never stores, prompts for or transmits credentials itself.

**Server mode**:

- Every route except sign-in callbacks, health endpoints and the MCP discovery and token
  endpoints named below MUST require an authenticated principal, signed in through OpenID Connect (authorization code with PKCE, the server acting as
  a confidential client). Browsers hold only an HttpOnly, Secure, SameSite session cookie; tokens
  MUST stay on the server. Bearer tokens are accepted only on the agent API and the MCP endpoint;
  the MCP endpoint ignores cookies and never falls back to them when a bearer token is invalid.
- The server MUST refuse to start without a complete identity provider configuration and valid
  policies, and MUST serve the frontend and the API from one origin.
- Outbound network calls are limited to the configured identity provider (including its
  directory API, used only to resolve membership of configured groups and to read their display
  names, and its token endpoint,
  used to obtain tokens on behalf of the signed-in person), to Git remotes and their hosts'
  token endpoints, only when a person explicitly triggers a remote operation or connects an
  account, and to operational telemetry as described below. The server MUST NOT fetch a client metadata
  document or any other URL supplied by a caller; MCP clients are registered by an Admin, and a
  later fetch needs an amendment that states its host allow-list, size, time, redirect and
  address-range limits. Remote operations use that person's own delegated credential, passed to Git for one
  command only; credentials MUST NOT be stored in plain text and MUST NOT be written to Git
  configuration.
- Adding or changing a remote address and cloning are Admin actions, limited to an allow-list of
  hosts.
- **Agent connections.** A person connects an external agent through the workbench acting as the
  authorization server for its own MCP resource, behind the organization sign-in:
  - Access and refresh tokens are opaque random values stored only as keyed hashes. Authorization
    codes are single-use, PKCE S256 is required, redirect addresses match a client registered in
    the administration repository exactly, tokens are bound to client and resource, the person
    gives explicit consent, refresh tokens rotate and a replayed one revokes the connection.
  - Each connection is bound to the browser session that authorized it. Logout, session expiry,
    deactivation or revocation ends it; agent traffic never extends the browser session; current
    grants are rechecked on every call. A headless client may start from one single-use
    credential created in the browser and bound to the person, client, scopes and session. No
    long-lived personal access token exists.
  - Only these endpoints answer without a principal: protected-resource and authorization-server
    metadata, the token endpoint (which authenticates its caller by code, PKCE or refresh token)
    and the bearer challenge on the MCP endpoint. They accept bounded, rate-limited input, set no
    cookie, return no document content and give the same answer for unknown and invalid clients.
    Dynamic client registration is not exposed.
  - Default scopes are read, edit, validate and commit to the authoring branch. Remote
    operations, publication and administration each need a scope the person selects. Scopes only
    narrow what the person's roles allow, and the consent screen names what each scope can do,
    including use of the person's delegated Git credential. Application grants keep their
    present meaning until an Admin reviews a wider capability.
  - An Admin may delegate an administration scope. The agent may then propose, dry-run and commit
    reversible administration changes without a browser confirmation for each. Permanent purge,
    destruction of a workspace or history and any equivalent irreversible deletion need a separate
    browser approval bound to the exact targets and versions. Receipts bind the actor and
    connection and are used once.
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

- **Published** means the committed snapshot of the configured default branch, read from
  immutable Git objects, in both modes. Dirty files, personal branches and proposal branches are
  unpublished. Advancing the published ref needs publication authorization and validation.
  Agent-facing context, plans, metric explanations and consumer resources use only published
  snapshots for every caller, including an author's own agent. Authoring tools may read and edit
  authorized unpublished work and return findings, but never an unpublished plan. A project
  without a published commit cannot supply production context, plans, imports or standard
  exports, and never falls back to files on disk.
- The workbench MUST NOT push personal or proposal branches or serve their content through a
  published export or consumer API; push is limited to published history and approved release
  refs. This is an application guarantee, not an operating-system boundary.
- Serving an authorized caller is not a workbench model call. When a person connects an external
  agent, that agent receives what the person is authorized to read and may send it to its own
  model provider; the workbench does not control that onward use and the README and the
  connection consent MUST say so.
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
  off the machine or container, and operational telemetry never carries any, except answers to a caller the person is authorized
  to act as (an agent connection, as described above) and Git remote
  operations (clone, fetch, pull, push, sync)
  that a person triggers explicitly, against a remote configured for that project. A clone is
  created only in a new folder inside `data/projects/`, and the address entered becomes that
  project's configured remote. The workbench never contacts a remote automatically or in the
  background.
- The server MUST NOT send a person any file, path, event, derived view or count about a resource
  that person may not read. One exception: a provider department's Stewards and Admins may see,
  for each published project that imports its exports, the project's name and domain, the public
  items imported and the resolved or pinned version, without access to that project. The list
  comes only from published declarations, never from proposals or usage, and the author of an
  import is told before publishing it. Usage counters follow Principle IV and are shown only
  within normal read permissions.

Rationale: users load confidential data contracts and models. Locally the promise is "your
definitions stay on your machine, and the workbench itself sends them nowhere; an agent you
connect may pass what you let it read to its own model provider"; on a server it is "your
definitions reach only the people allowed to read them, and leave only through a Git action
someone took or an agent connection they authorized".

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
- Standard Ossie output produced by the compiler is a derived output beside the byte-exact
  export, never a replacement. Ordinary export and compilation never rewrite or replace source
  files, and generated bundles live outside scanned source directories. Converting a document to
  standard form is a separate, reviewed operation with a backup and a hash check.

Rationale: the workbench is an editor for standards documents that live in other systems; silent
reformatting breaks diffs, reviews and downstream tooling.

### III. One Validation Rule Set

- The browser, the inspector, the file store and the HTTP save endpoint MUST apply the same
  validation rules from the same shared modules. A document the editor reports as valid MUST be
  accepted by the API, and vice versa.
- The schema for a document is chosen by its marker: an unmarked document is validated against
  the pinned standard schema, a marked document against the matching Tessera root, part or
  composition schema. A marked document MUST NOT fall back to an unvalidated generic path, and an
  unknown marker revision is rejected.
- Findings come in three kinds. Document findings depend on one file's bytes. Complete-set
  findings depend on a compilation unit and a dependency snapshot. Reader views depend on what
  the reader may see. A set-dependent save or publication MUST require read access to the whole
  unit and a resolvable dependency snapshot, and fails identically for a missing and an
  unreadable dependency. Set errors block every publication path, including remote-follow. A
  published public interface compiles without its private implementation parts. Caches keep
  document findings apart from set and reader findings, key the latter by dependency snapshot and
  authorization version, and never reveal a finding the reader may not see.
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
  rejected suggestions, drafts, trash log, sessions, agent connections, operation records and
  receipts, audit log) MUST be kept in durable state files written atomically (the audit log
  append-only), never only in the cache. Connection tokens are stored only as keyed hashes.
  Access configuration (policies, roles, access grants, project access, registered MCP clients)
  MUST live in the administration Git repository, one commit per change.
- Each mutation is repeatable, protected by a precondition, or backed by a receipt. A
  nonrepeatable one needs a caller-bound idempotency key, rejects a reused key with different
  arguments, and returns an explicit uncertain outcome when a remote effect cannot be
  established. Staging, committing, switching, merging and publishing a person's working copy MUST
  carry the expected branch, HEAD, paths, content hashes and index state, so that no actor's
  operation silently includes another actor's staged or draft work.
- Usage counters are off unless an operator enables them. They live in a separate store of
  aggregated, identity-free counts that is never derived from the audit log, carry no document
  content, exclude ordinary browser views and are kept 30 days unless the operator configures
  otherwise. Deleting the store loses only counts.
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
  Schema selection and the compiler are parametrized by the pinned base. A released Ossie base is
  adopted by pinning its exact released schemas and extending extraction, expression and planner
  support and conversion before further extension work. Until then, a draft base is labelled as
  a draft and no unqualified current-standard compatibility is claimed.
- Tessera is the workbench's authoring format: a strict superset of one pinned Ossie version that
  adds properties only under a reserved workbench prefix and a marker naming its own revision.
  Unmarked files stay standard Ossie and pass the unchanged pinned schema; governance for models,
  datasets, fields, joins, metrics and mappings stays in the standard vendor-extension slot. A
  new base that collides with a Tessera property fails until an explicit migration resolves it.
  Tessera schemas are workbench schemas, versioned and labelled as such, never edited into a
  pinned snapshot.
- Every schema, document and feature is labelled standard or Tessera. Workbench-specific
  interpretations (display groupings, metric references, project grouping) MUST be labelled as
  application choices, never presented as standard semantics.
- The compiler turns a complete, authorized compilation unit into standard Ossie that MUST pass
  the pinned schema, preserve the meaning of the exported dependency closure, and fail rather
  than guess when a translation is unsupported or needs a private definition. Every loss of
  metadata or links is reported in a machine-readable report, and output is released only after
  that exact report is accepted. Schema, reference, access, size and semantic failures can never
  be accepted.

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
  validation, schema selection, compilation and loss acceptance, published-snapshot selection,
  connection scopes and revocation, receipts and idempotency, dependent disclosure) MUST add targeted mutants to `scripts/mutation-tests.ts`. The unmodified
  baseline MUST pass and every mutant MUST be detected.
- An authorization test matrix MUST call every route with every test role and scope (readable,
  unreadable, guarded) and compare each answer with the expected decision; any byte of an
  unreadable file in a response or event fails it. Every new route, and every MCP tool beside its
  HTTP twin, MUST be added to the matrix.
- Layout and UI work MUST include geometry assertions (no overlapping controls, contained panels)
  across the viewport matrix of the responsive suite.

### VII. Honest Claims

- The README and docs MUST describe only behaviour that is implemented and tested. Limits
  (what is not validated, executed, reasoned or fetched) MUST be stated as plainly as features.
- Counts quoted in documentation (entities, relationships, bindings, checks, mutants) MUST be
  produced by the code or tests, and updated when they change.
- Performance or scale claims MUST name the fixture and the check that measures them.
- Tessera is described as "an authoring format that compiles to standard Ossie", and the compiler
  as the Tessera compiler. The product MUST NOT call Tessera an Ossie edition or imply upstream
  endorsement. Compiler output states the pinned base it was validated against.
- Documentation MUST NOT claim more than the guarantee provides: unpublished work is kept inside
  the workbench by the application, not by the operating system; the local MCP capability is not
  a sandbox; retries are never exactly-once; counters count workbench requests, not queries, and
  are not promised to be unattributable in a small team; client compatibility is claimed only for
  clients that were tested; accepting a loss report is not approval of the exported content.
- The README MUST document both modes; the folder layout under `data/`; which Git operations
  (clone, fetch, pull, push, sync) contact a network; where credentials come from in each mode
  (the machine's Git configuration locally, the person's delegated credential on a server); the
  roles and what each can see and do; every outbound call of server mode; how agent connections,
  their scopes and their lifetime work and that connected agents may forward content to their
  model provider; what usage counters collect; and its single-instance limit.

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
- Every MCP tool is dispatched as an in-process twin of an HTTP request through the same route
  selection, authorization, handler, refusal and audit path with the already authenticated
  caller. The MCP gate authenticates and bounds input but grants no workspace action itself; a
  tool without a twin gains a shared operation and its authorization before it is exposed.
- A reference from one project to another resolves only through a declared import with an
  explicit allow-list of concepts, against the provider's published snapshot recorded in the
  importer's dependency manifest. Pins accept only published history or release tags, never an
  arbitrary commit. Resolution never searches other projects by name or path and fails closed
  when the pinned snapshot or the caller's access is unavailable.
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

**Version**: 4.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-11-16
