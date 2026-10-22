# Architecture

This document is the map of the code. It describes what rarely changes; the details live in the
code. Read it before your first change.

## Bird's-eye view

Semantic Workbench is a local editor for semantic definitions: ODCS data contracts, Ossie
ontologies, semantic models and mappings, and RDF (OWL, SHACL, Turtle). Projects are plain
folders under `data/projects/`, each a Git repository, and those files are the only copy of the
user's work. A Bun API (`server/`) owns the folders, Git and a rebuildable SQLite index. A React
app (`src/`) parses each file in the browser into one model of entities and relationships, then
shows it as graphs, lineage, catalogs, metrics and a byte-preserving source editor. Edits travel
back as patches against the bytes the browser loaded, so text the user did not touch stays
exactly as it was. Nothing runs queries: SQL is coloured, linted and previewed, never executed.

## Code map

| Module | What lives here | What must not live here |
|---|---|---|
| `server/index.ts`, `server/handler.ts` | Start-up and the HTTP entry point: host and origin checks, then the route list | Workspace logic |
| `server/routes/health.ts` | Public liveness/readiness and startup traffic gating | Workspace inspection |
| `server/static.ts` | Built frontend, SPA fallback, path confinement and security headers | API routing |
| `server/projects/instance-lock.ts` | Lease decisions, atomic acquisition, heartbeat and revision hand-over | Workspace recovery |
| `server/projects/data-root.ts` | Writable-root startup probe with path and uid errors | Workspace writes |
| `server/startup-log.ts` | Operator diagnostics after initialization | Startup decisions |
| `server/shutdown.ts` | Signal cleanup shared with hot reload | Workspace logic |
| `Dockerfile`, `compose.yaml` | Non-root image and local host-networking profile | Secrets |
| `scripts/container-*.ts` | Docker/Podman image checks and browser suite groups | Delivery pipeline |
| `scripts/gate-suites.ts` | Canonical browser gate suites and explicit exclusions | Process spawning |
| `scripts/ci-validate.ts` | Gate selection, command plans, JUnit summaries and process lifecycle | Azure deployment |
| `scripts/image.ts` | Image metadata, runtime/scanner commands, vulnerability exceptions and registry push | Pipeline-only build logic |
| `scripts/pipeline-lint.ts`, `scripts/pipeline-dry-run.ts` | Offline schema/rules validation and template/condition planning | Real Azure execution |
| `scripts/deploy-version.ts` | Release precedence and read-only registry version guard | Version promotion or deployment |
| `deploy/azure-devops/`, `azure-pipelines.yml` | Target pipeline templates, pinned upstream schema and placeholder variables | GitHub automation or secrets |
| `server/config.ts` | Reads and checks the environment once: `readConfig()` returns the typed configuration of local or server mode, or refuses to start naming each variable at fault | Reading `process.env` anywhere else for these settings |
| `server/routes/` | One file per resource (`projects`, `files`, `git`, `clone`, `repos`, `trash`, `metrics`, ...): parse and check the request, call the workspace, shape the response | File or Git operations |
| `server/projects/workspace.ts` | `openWorkspace()`, the composition root: registry, saves, imports, moves, scans, events, and the wiring of the services below | HTTP parsing |
| `server/projects/` (other) | One service per concern: `git.ts` (the only place Git runs), `scm.ts` (Source Control), `clone.ts`, `journal.ts` (all-or-nothing renames), `trash.ts`, `repositories.ts` (which folders of a repository are projects: the `.semantic-workbench.json` manifest and detection) and `repository-projects.ts` (registering them), `scanner.ts` and `cache.ts` (the index), `state.ts` (registry, drafts, view settings), `paths.ts` (every path check), `events.ts` (server-sent events), `watcher.ts` | Browser code |
| `server/auth/actions.ts` | Action names, built-in role ids and classification levels | Policy evaluation, I/O |
| `server/auth/resource.ts` | Resource and decision types, boundary path normalization | Policy evaluation, I/O |
| `server/auth/principal.ts` | Trusted claim normalization and stable principal keys | Provider roles, I/O |
| `server/auth/grants.ts` | Pure grant matching and role-holder scope expansion | Policy evaluation, I/O |
| `server/auth/role-compiler.ts` | Pure role validation and Cedar policy generation | Cedar engine, I/O |
| `server/auth/access-config.ts` | Administration schema validation and typed configuration | Access decisions |
| `server/auth/path-rules.ts` | Restricted POSIX globs and Cedar wildcard rule classes | Access decisions |
| `server/auth/cedar.ts` | Validated policy loading, entity graphs and the Cedar engine | HTTP handling |
| `server/auth/authorize.ts` | The access-decision boundary, filtered views and request memoisation | HTTP handling |
| `server/auth/route-actions.ts`, `server/auth/middleware.ts` | Route inventory, request scopes, identity resolution and audited HTTP decisions | Resource-specific business logic |
| `server/auth/audit.ts` | Durable monthly audit records, hash chains and retention | Secrets or document contents |
| `server/auth/admin-repo.ts`, `server/auth/admin-guard.ts` | Validated Git versions of administration documents and the last human Admin invariant | HTTP parsing |
| `server/agent/` | Metric explanations and the SQL preview (`explain.ts`, `runtime.ts`) | Query execution |
| `src/main.tsx`, `src/app/` | The app shell: `useWorkbench` and the other hooks hold state and handlers; `Workspace*` and `*Dialogs` components lay it out | Parsing or validation rules |
| `src/model.ts`, `src/validation.ts`, `src/rdf*.ts`, `src/odcs.ts` | Parse a file into `Entity` and `Relationship`, and validate it; pure functions shared with the server | React, fetch |
| `src/overview.ts`, `src/communities.ts` | Group by: modes, communities, Auto | Rendering |
| `src/edit/` | Item editors and the patch builders that keep untouched bytes exact | Network calls |
| `src/editor/` | The CodeMirror source editor (`useCodeMirror`, extensions, navigation) | Saving logic |
| `src/odcs/` | Contract pages and the column-level lineage canvas (`lineage.ts` builds the graph, `LineageCanvas.tsx` draws it) | |
| `src/graph/`, `src/FullGraph.tsx`, `src/NeighborhoodGraph.tsx` | Entity graph views, layout and routing | |
| `src/metrics/`, `src/mappings/`, `src/sql/` | Metrics tab and wizard, mapping views, SQL regions and lint | |
| `src/projects/` | Client API (`api.ts`), autosave, project tree, delete and trash dialogs, the repository's projects dialog, shared dialog chrome (`Modal.tsx`) | |
| `src/scm/` | Source Control panel, Commit dialog, Git setup dialogs (`GitSetup.tsx` opens them from anywhere) | Git commands; they run on the server |
| `schemas/` | Pinned JSON Schemas (ODCS, Ossie, the workbench extensions) | Edits to upstream schemas |
| `public/examples/` | Shipped example projects | Test fixtures |
| `tests/` | Unit and handler tests (`bun test`), always on temporary data roots; `tests/helpers/mock-oidc.ts` is a loopback OpenID provider with Entra, Keycloak and generic claim shapes and a Microsoft Graph stand-in; `tests/fixtures/auth-workspace/` is the access test workspace and `tests/helpers/auth-identities.ts` its people and groups | Calls to a real identity provider |
| `scripts/` | Browser checks (Playwright against an isolated API), the mutation suite, example generators, `dev.ts` | |

## Data flow

Opening and editing a file:

1. The browser loads `/api/projects` and each file's text (`src/projects/api.ts`).
2. `src/model.ts` parses the text into a model; a worker validates it while the user types.
3. Views read the model. An edit becomes a patch against the loaded text (`src/edit/`).
4. Autosave sends valid text with the hash of the version it started from
   (`PUT /api/projects/:slug/files/...`). Invalid text is kept as a draft, never written.
5. `workspace.saveFile` checks the hash, writes atomically, rescans, and emits a `files` event.
   Every open tab refreshes from that event.

A project is a folder under `data/projects/`. Usually the folder is also a Git repository; a
team repository can instead hold several projects in subfolders. The registry records each
project's `folder` and `repo`, and `paths.ts` resolves both. Projects of one repository share
its Git queue, watcher and Source Control: Git sees repository paths, the browser sees paths
inside a project, and `scm.ts` converts between them. Every Git action rescans all projects of
the repository.

Git actions run only from explicit requests: `routes/git.ts` → `scm.ts` → `git.ts`. Remote
commands (fetch, pull, push, clone) need an explicit flag in `git.ts`, run with a 10-minute limit
and can be cancelled.

The workspace shell memoizes its sidebar, toolbar, header and status footer. Display props carry
booleans, counts and save status instead of the editor text. `src/app/useStableHandler.ts`
keeps control callbacks stable while calling the latest committed handler; handlers that produce
rendered content retain explicit React dependencies. Stable React setters are passed directly.
The stable handler is called only from event handlers or passive effects, never during render
or child layout effects, which run before its parent publishes the committed handler.
`src/editor/documentMode.ts` owns the size threshold and chooses the highlighting budget when a
document opens (mount or a different document ID). Typing and external replacements of the same
document retain that choice. The status-bar switch overrides it until another document opens.
`embeddedLanguages.ts` shares SQL paths and extension detection between full parsing and
`viewportYaml.ts`, which reconstructs visible YAML with sparse ancestor and sibling context.
`yamlIndentation.ts` caches indentation summaries on CodeMirror's persistent text branches:
initial indexing reads the lines once, and edits reuse unchanged branches. `largeYaml.ts`
parses embedded values only in visible ranges, debounces edits, and provides indentation folding.
Source updates remain synchronous so the
editor never receives an older deferred value as an external replacement.

## Rules that must hold

- Bytes the user did not edit are written back unchanged; every save is a patch or a full text
  checked against the version it was based on.
- The API writes only inside the data folder, never follows a symbolic link in a project, and
  never writes the user's global Git configuration.
- Changes that move folders or the registry run through `journal.ts`, so a stop at any point is
  rolled forward or back at the next start.
- The index (`cache.sqlite`) can be deleted at any time; the folders and `state/*.json` are the
  truth.
- No query is executed anywhere. SQL is only parsed, coloured, linted and previewed.
- The app never asks for, stores or sends credentials; Git's helpers and SSH handle them.

## Cross-cutting concerns

- **Configuration**: start-up uses `readConfig()` in `server/config.ts` once for mode, host,
  port, data root, cache root and build identity. Server mode validates its settings but is not
  available in this build yet. The writable-root probe precedes lock acquisition; recovery,
  migration, scanning and access middleware initialization happen only after ownership.
  `openWorkspace({ root, cacheDir })` accepts explicit paths for isolated tests.
- **Access**: health probes and static frontend files are answered before the local Host/Origin
  check because they hold no workspace data. Every `/api` and `/auth` request goes through
  `server/auth/middleware.ts` when serving; startup and hand-over gate application traffic with 503.
  Routes never decide access.
  `auth/route-actions.ts` maps each HTTP entry point to an action and resource. The middleware
  creates one request scope through `auth/authorize.ts`, fails closed for unmapped routes, and
  attaches the scope for route filtering. Local mode uses the implicit Admin; server mode requires
  an injected principal resolver. Server non-GET requests require `X-SW-Request: 1` and an `Origin`
  equal to `HandlerOptions.publicOrigin`; without that configured origin they are refused.
- **Audit**: denied decisions, allowed writes (including local draft saves), and allowed reads on
  explicitly audited agent rows are flushed to monthly JSON Lines under `state/audit/`. Records
  include the principal, action, resource, decision, outcome, previous-line hash, and response's
  `X-Request-Id`; secrets and document contents are excluded. Retention defaults to 400 days.
  Local mode does not mirror to stdout. Failed denial audits refuse the request; audit failures
  after an operation log the request id to stderr and preserve its response to avoid retrying writes.
  Administration documents live in `admin/`, with validated atomic writes and one Git commit
  per change; failed writes restore the committed tree, while requested rollbacks create new commits.
- **Errors**: services throw specific errors (`server/projects/errors.ts`, `GitError`,
  `PathError`, `InputError`); `server/routes/http.ts` maps them to status codes in one place.
- **Events**: the server emits `files`, `projects`, `git`, `clone`, `identity` and others
  through `events.ts`; the browser listens with `useEvents` and refetches.
- **Testing**: `bun test` for logic and handlers; `scripts/*-browser-check.ts` for the UI against
  an isolated API; `bun run test:mutation` checks that the tests catch deliberate faults.
- **Style**: Oxfmt and Oxlint (`bun run check`); comments explain why, in plain English, without
  spec or task numbers.

## Where to change things

| To change | Go to |
|---|---|
| A new API route | `server/routes/<resource>.ts`, then a method on the owning service in `server/projects/` |
| A Git operation | `server/projects/git.ts` (the command), `scm.ts` (the Source Control behaviour) |
| How a file kind is parsed or validated | `src/model.ts`, `src/validation.ts`, `schemas/` |
| A view | the folder named after it in `src/` (`odcs/`, `metrics/`, `mappings/`, `graph/`) |
| A dialog | the module it belongs to; shared chrome is `src/projects/Modal.tsx` |

The runtime image copies `src/` because server imports span parsing, validation, metrics, SQL,
RDF and project models with transitive dependencies across those modules. Keeping that tree
intact avoids silently dropping a runtime import; the browser itself is served only from `dist/`.
The lock's short exclusive claim directory serializes concurrent acquisition, with abandoned
claims expiring after 30 seconds. A breaker renames a stale claim to a unique path before
removing it, then retries on its next tick. Each start generates an instance UUID nonce; ownership
uses only that nonce, so containers with the same host, PID and revision remain distinct.
Acquisition re-reads the record before opening services to fence a replaced claim.
A data root shared across hosts requires synchronized clocks for lease expiry.
A hand-over replica reports ready so the orchestrator stops the old one; traffic receives 503
with `Retry-After: 10` meanwhile. Malformed lock records stop startup rather than risking two
writers. A waiting instance only reads the lock; it never initializes workspace or audit services.

Static responses restrict resources to the same origin, with blob workers and data/blob images.
Scripts are restricted to self without eval; objects and framing are forbidden, and base URLs
and form actions are restricted to self. Inline styles support the graph and editor.
HSTS is reserved for an HTTPS public URL. `scripts/compile-schemas.ts` uses Ajv standalone
code to generate the pinned browser validators in `src/generated/schema-validators/`.
Generated modules are checked in so tests and development work immediately; `build` and `check`
regenerate them, and a test verifies identical bytes. Only server access configuration keeps
runtime Ajv compilation, outside the browser CSP.
