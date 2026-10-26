# Architecture

Semantic Workbench is a file-first definition editor with a React browser application and a Bun
HTTP API. Git-backed project folders are authoritative; SQLite is a disposable derived index.
The application parses metadata to explain metrics and produce query previews. It does not
execute those previews, connect to warehouses or perform standards reasoning.

The [README stack](README.md#technology-stack) lists the current libraries and versions.
[User workflows](docs/user-guide.md), [server operation](docs/server-mode.md),
[configuration](docs/configuration.md) and [development](docs/development.md) own their detailed
contracts. This document describes responsibilities, data flow and boundaries rather than
repeating every control, endpoint or release result.

## C4 level 3: backend components

[The README](README.md#c4-level-1-system-context) contains the system-context and runtime-container
views. This view opens the Bun application container. Each box is a responsibility inside one
server process, not a separately deployed service. Data stores and external integrations remain
outside that component boundary. The diagrams use standard Mermaid flowcharts with C4-style
labels; they do not require a C4-specific renderer.

```mermaid
flowchart TB
    Client["Browser workspace or agent client<br/>[External to this container]"]

    subgraph Bun["Bun application container"]
        HTTP["HTTP boundary<br/>[Component]<br/>handler, request parsing and static files"]
        Access["Identity and access boundary<br/>[Component]<br/>sessions, grants and Cedar"]
        Routes["Resource routes<br/>[Component]<br/>typed requests and dispatch"]
        Workspace["Workspace services<br/>[Component]<br/>files, Git, journals and events"]
        Models["Definition model and validation<br/>[Component]<br/>parsers, schemas and guards"]
        Planner["Agent and metric planner<br/>[Component]<br/>filtered metadata and SQL previews"]
        Admin["Access administration<br/>[Component]<br/>review, replay and versioned activation"]
        Audit["Security audit<br/>[Component]<br/>durable hash-chained records"]
        Diagnostics["Operational diagnostics<br/>[Component]<br/>logs, metrics and optional export"]
    end

    Files[("Projects and durable state<br/>[File/Git data stores]")]
    Cache[("SQLite index<br/>[Embedded data store]")]
    Provider["Identity provider / directory<br/>[External systems]"]
    Remote["Git hosting<br/>[External system]"]
    Monitor["Azure Monitor<br/>[External system]"]

    Client -->|HTTP| HTTP
    HTTP --> Access
    Access --> Routes
    Routes --> Workspace
    Routes --> Planner
    Routes --> Admin
    Workspace --> Models
    Planner --> Models
    Admin --> Access
    Access --> Audit
    HTTP --> Diagnostics
    Workspace --> Files
    Workspace --> Cache
    Admin --> Files
    Audit --> Files
    Access -. Configured server identity .-> Provider
    Workspace -. Explicit Git subprocess actions .-> Remote
    Diagnostics -. Opt-in server export .-> Monitor
    Workspace -->|Filtered SSE| Client
```

Public probe/brand/authentication responses have explicit boundary rules; the main request path
shown above applies access enforcement before workspace dispatch. Static serving does not turn
protected documents into public assets.

Local mode binds loopback and supplies an implicit Admin. Server mode resolves a person or an
eligible agent identity and enforces a filtered view before a workspace service runs. The same
file/model/governance logic is reused; local mode is an explicit path, not a missing permission
check that happens to succeed.

## Code map

### HTTP, startup and ownership

- `src/server/` contains the Bun-only runtime, grouped under the same source root as the browser
  application. `src/server/index.ts` composes startup, storage, authentication, brand, telemetry and
  the listener; browser modules must not import server modules.
  `src/server/config.ts` is the typed runtime configuration boundary. Startup diagnostics live in
  `src/server/startup-log.ts`; signal and hot-reload cleanup live in `src/server/shutdown.ts`.
- `src/server/handler.ts` composes health/static handling and route dispatch.
  `src/server/request.ts` owns bounded body/path parsing. `src/server/serve-options.ts` owns listener
  behavior, and `src/server/routes/http.ts` maps typed failures to HTTP responses.
- `src/server/routes/` parses resource-specific requests and calls owning services. It must not
  implement Git subprocesses, filesystem transactions or independent authorization rules.
- `src/server/static.ts` serves `dist/` with path confinement and security policy.
  `src/server/routes/health.ts` exposes liveness/readiness without workspace inspection.
- `src/server/projects/data-root.ts` probes writable storage. `instance-lock.ts` owns the exclusive
  lease and revision handover. Recovery, migration, scanning and access-service initialization
  follow ownership; a waiting instance must not initialize another writer's workspace.

### Filesystem, Git and personal working copies

- `src/server/projects/workspace.ts` is the workspace composition root. It wires registration,
  reads/saves, scanning, Git, journals, trash, working copies, publishing and event delivery.
- `paths.ts` owns data layouts and path validation; `state.ts` owns the registry and persistent
  state; `reader.ts` defines the caller's filtered view, owner and content guard.
- `atomic.ts` replaces files without modifying untouched bytes. `journal.ts` coordinates
  multi-file/folder/registry changes. `migration.ts` reads legacy databases through protected
  copies and stages the file-store migration.
- `scanner.ts`, `cache.ts` and `watcher.ts` maintain derived models/findings and detect disk
  changes. Cache rows are not another authoritative copy of the definitions.
- `git.ts` is the subprocess boundary for Git; `scm.ts` owns Source Control behavior and converts
  project-relative paths to repository paths. Commands are serialized per underlying repository,
  including all of its worktrees.
- `repositories.ts` and `repository-projects.ts` interpret the multi-project manifest.
  `sparse-folder.ts` owns partial/sparse checkout steps; `project-folder.ts` coordinates a reviewed
  local move into a repository folder.
- `working-copies.ts` selects published versus personal read/write locations. `worktrees.ts`
  owns Git worktree/branch transitions. `publishing.ts`, `published-checkout.ts` and
  `unpublished-work.ts` coordinate default-branch publication, recovery and retained local work.
- `trash.ts`, `personal-state.ts` and `suggestions.ts` own deletion/restore, owner-specific state
  moves and explicit-evidence grouping suggestions.
- `project-export.ts` selects permitted files/history and checks limits before streaming;
  `zip.ts` writes the archive. Export logic must not bypass a Reader's permissions.

### Identity, authorization, governance and administration

- `src/server/auth/authentication.ts` composes provider identity, sessions, directory membership and
  the single administration repository. It does not depend on provider-specific protocol details.
- `sign-in-provider.ts` selects a provider interface implementation: `msal-provider.ts` for
  Entra, `oidc.ts` for Keycloak/generic. `managed-identity.ts`, `id-token.ts` and
  `sign-in-error.ts` share token/assertion validation and safe failures.
- `sessions.ts` and `attempts.ts` own encrypted/revocable sessions, provider indexes and replay
  protection. `principal.ts` normalizes trusted claims; `directory.ts` performs bounded directory
  lookups; `bearer.ts` accepts the restricted agent-token path.
- `grants.ts`, `role-compiler.ts`, `cedar.ts` and `authorize.ts` resolve scoped role membership,
  build policy entities, compile/load Cedar policies and make access decisions.
  `policies/` holds the baseline, built-in roles and replay matrix.
- `route-actions.ts`, `middleware.ts` and `request-scope.ts` map requests to actions/resources,
  resolve identity once and attach the filtered scope. Unmapped protected routes fail closed.
- `write-access.ts`, `git-access.ts` and `project-creation.ts` authorize concrete write targets,
  repository-wide actions and new-project domains before mutation.
- `src/governance/guards.ts` contains shared pure content rules and classification levels. Server
  `auth/guards.ts` binds them to a principal. Browser `src/auth/guards-client.ts` explains the
  controls but cannot authorize a write.
- `admin-repo.ts`, `access-admin.ts`, `dry-run.ts`, `admin-guard.ts`, `policies.ts` and
  `change-summary.ts` own versioned access documents, reviewed proposals, replay, last-Admin
  protection and activation. Requested rollback is a new reviewed commit.
- `remote-hosts.ts`, `remote-credentials.ts` and `github-oauth.ts` choose permitted remote hosts
  and command-scoped credentials. `server/bin/sw-askpass` is the final host-specific credential
  boundary; Git filters and local merge steps must not inherit remote tokens.

### Parsing, editing, metrics and agent planning

- `src/core/model.ts` projects supported definitions into entities and relationships.
  `src/validation/` owns input checks, diagnostics and RDF parsing; `src/odcs/foreign-keys.ts`
  resolves contract relationships. These modules are reused by browser and server logic.
- `src/mappings/` owns mapping schemas, built-ins and the mapping explorer. `src/core/` holds the
  shared model, document references and export projection.
- `schemas/` contains pinned standards and application schemas. `scripts/compile-schemas.ts`
  produces checked-in standalone browser validators under `src/generated/schema-validators/`;
  browser CSP does not need runtime evaluation to compile schemas.
- `src/editor/` owns CodeMirror configuration, serialization/embedded-language highlighting,
  findings and byte-range patches. `documentMode.ts`, `viewportYaml.ts`, `largeYaml.ts` and
  `yamlIndentation.ts` keep large-document work within its highlighting budget.
- `src/edit/` owns item models, source fragments, insertion/deletion and serialization-aware
  patch construction. RDF edits additionally verify the intended graph difference.
- `src/metrics/`, `src/mappings/` and `src/sql/` own definition presentation, authoring,
  binding traversal and supported SQL syntax. They do not access a data source.
- `src/server/agent/explain.ts`, `runtime.ts` and `sql.ts` produce filtered catalog/context,
  definition-preserving metric explanations and governed query plans. They never execute a plan or
  call an LLM. Synthetic example execution belongs only to verification scripts/tests.

### Browser shell and graph rendering

- `src/main.tsx` composes the application. `src/app/` separates workbench state/effects from
  `Workspace*` presentation and dialogs. Stable event handlers call the latest committed logic;
  source text stays synchronous rather than being deferred back into the editor.
- `src/projects/api.ts` is the browser HTTP boundary. `useEvents.ts` owns SSE delivery and
  connection readiness. `autosave.ts` coordinates validation, drafts, version checks and saving.
  `Sidebar.tsx` and `tree-viewport.ts` keep the selected file and whole-row viewport reachable.
- `src/scm/` owns Source Control, diffs, branch/commit/remote/clone dialogs and personal-credential
  prompts. `src/projects/Modal.tsx`, `Menu.tsx`, `WizardStepper.tsx`, `EmptyState.tsx` and
  `src/shared/ScrollStrip.tsx` provide shared interaction and layout behavior.
- `src/shared/` contains UI and small utilities used by multiple domains; `src/theme/` owns theme
  tokens, runtime palettes and browser preference. The root of `src/` is reserved for the entry,
  global stylesheet and browser type declarations.
- `src/auth/` consumes server-reported identity and capabilities. `src/admin/` proposes/reviews
  access changes through its typed client. Admin URL hashes select sections; no general routing
  framework computes authorization in the browser.
- `src/graph/` owns whole-model and neighborhood views, traversal, grouping projection, layout,
  workers, controls, name wrapping and shared edge appearance. `overview.ts` and `communities.ts`
  decide display grouping, not standard semantics.
- `src/odcs/lineage.ts` builds declared column dependencies; `LineageCanvas.tsx`, `LineageCard.tsx`
  and `LineageColumnList.tsx` draw row ports, selection and windowed column lists. Mapping canvases
  reuse this infrastructure with resolver-derived cards/lines.
- `docs/graph-design.md` describes ELK versus headless fCoSE, worker routing, card measurement,
  viewport fitting and the pinned React Flow observer patch. No WebGL/Sigma renderer is active.

### Branding, observability and delivery

- `src/theme/theme.css` defines semantic light/dark tokens; `theme-palette.ts` is the runtime group
  palette. `theme-preference.ts`, `src/app/ThemeControl.tsx` and `public/theme-init.js` own browser
  choice.
- `public/brand/` is the default bundle. `src/server/brand/` loads and sanitizes it once at startup;
  `src/brand/` consumes the known public assets. Product identity must not be duplicated in view
  components. `docs/theme.md` owns deployment/customization details.
- `src/server/observability/` owns typed settings, redaction, request context, explicit spans/metrics,
  logs, browser report recording and optional exporter loading. SDK/exporter imports stay behind
  `telemetry.ts`; ordinary application code uses the no-op-capable OpenTelemetry API.
- `src/observability/` owns bounded browser reporting to the workbench API. No browser exporter
  contacts an external ingestion host. `src/server/auth/audit.ts` remains a separate durable security
  record, with integrity verification described in `docs/audit-tamper-evidence.md`.
- `Dockerfile`, `compose.yaml`, `scripts/image.ts` and `container-*.ts` own image construction and
  local validation. `scripts/ci-validate.ts` orchestrates the canonical gate/suite inventories.
- `scripts/deploy.ts` owns delivery decisions behind real/fake Azure clients. Pipeline lint and
  dry-run interpret the shipped YAML offline. `deploy/` owns target setup, release hand-over and
  real acceptance; those operations do not happen during application startup.

## Request and state flow

### Opening and editing a definition

1. The browser obtains identity/capabilities, project registration and readable document bytes.
2. Parsing creates a view model; worker validation produces located findings during editing.
3. An item or Source edit becomes an exact text/byte-range change against a known base hash.
4. Middleware resolves the Reader, route action and concrete write targets. Services authorize
   every target and apply content guards before staging any mutation.
5. A valid save is hash-checked, atomically replaced and reindexed. A multi-file change uses the
   journal. Invalid text remains a personal draft rather than replacing the definition.
6. Filtered live events trigger readable clients to refresh. A stale save remains refused until
   the person explicitly resolves the version conflict.

### Shared-server writes and publication

1. Reads use the published checkout unless the caller may edit and already has a personal copy.
2. The first authorized write is judged against published content before creating that copy.
3. Edits and commits remain in the caller's branch; other readers are not silently moved to it.
4. Publication checks exact commits and compare-and-swaps the default branch. Recovery finishes
   an interrupted checkout update. Publication is separate from remote Push.
5. All worktrees of a repository share its serialized Git queue. Sparse paths, multi-project
   ownership and protected content apply to both direct changes and incoming Git content.

### Access administration

1. A typed proposal is validated and replayed against configured cases, recent audit and known
   identities, without changing live policy.
2. The dry-run receipt is bound to proposal content and base version. An edit or stale version
   requires a new review; client checks supplement the same server requirement.
3. Confirmation makes an Admin-authored versioned commit, reloads access and closes affected
   sessions/streams as required. Failed validation/last-Admin checks do not mutate live state.
4. Policy reload failures are logged with the committed version; existing policy remains active
   until a subsequent reload rather than pretending the commit never happened.

## Invariants and dependency limits

- **Definition ownership:** project files and durable state are authoritative. Rebuildable indexes
  never become another source of truth. Stop the app before removing a cache or taking a backup.
- **Byte preservation:** untouched content, serialization and line endings remain unchanged.
  Saves carry a base version; conflicts are not automatically overwritten.
- **One owner:** exactly one active writer owns a data root. Lease handover and journals support
  interrupted operations, not arbitrary multi-replica writes. Shared-host lease expiry needs
  synchronized clocks.
- **Path confinement:** operations stay inside permitted data/repository roots, reject ambiguous
  case variants and do not follow project symlinks. Git identity changes are never global.
- **Filtered derived data:** model search, metric/agent resolution, history, export, suggestions,
  SSE delivery and replay use the same Reader boundaries. Hidden references stay unresolved.
- **Guarded writes:** direct saves, import, move, restore, revert and incoming Git content all
  pass target authorization and content guards. Non-typed access bypasses must not be invented.
- **Personal state:** server drafts, view corrections, worktrees and unpublished work remain
  owner-scoped. Removal events snapshot current readers before the project disappears.
- **Credentials:** provider/remote tokens remain server-side and encrypted; a remote credential
  is available only to its permitted host and command. Public brand/probe responses carry no
  workspace data.
- **No analytic execution:** production code only explains and plans. Example verification may
  run isolated synthetic SQL, never a user's warehouse or workspace database as an analytic source.
- **Controlled rendering:** node measurements may be reused only with compatible identity/type/
  dimensions or row/port topology. Observer-driven layout publication runs outside delivery and
  pending work is cancelled on unmount. Browser tests record raw resize events, not only JS throws.
- **Optional export:** local mode and missing telemetry configuration never load an exporter
  pipeline or open an ingestion connection. Operational logs, audit and telemetry have distinct
  retention/redaction and failure contracts.

## Where to change a behavior

| Behavior | Starting point |
| --- | --- |
| Runtime setting | `src/server/config.ts`, then `docs/configuration.md` |
| Route/resource | `src/server/routes/` and `auth/route-actions.ts` |
| Access decision | `auth/authorize.ts`, Cedar policies and grant/compiler modules |
| Content protection | `src/governance/`, then server/client bindings |
| Definition syntax | `src/core/model.ts`, `src/validation/`, `src/odcs/` and pinned schemas |
| Byte-preserving item edit | `src/edit/` and `src/editor/patch.ts` |
| Metrics/bindings/plans | `src/metrics/`, `src/mappings/`, `src/server/agent/` |
| Graph layout/routing | `FullGraph.tsx`, `src/graph/`, `src/odcs/` |
| Git/repository behavior | `src/server/projects/git.ts`, `scm.ts`, working-copy modules |
| Theme/brand | Tokens and `public/brand/`; server sanitation under `src/server/brand/` |
| Diagnostics/export | `src/server/observability/`, browser report schema and recorder |
| Quality gate | `scripts/gate-suites.ts`, container suites and `ci-validate.ts` |

Use [the development guide](docs/development.md) for command syntax, fixture rules and validation.
Keep configuration/API/operation details in their canonical guides instead of appending release
history or per-control instructions to this architecture map.
