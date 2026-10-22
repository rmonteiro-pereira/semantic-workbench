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
| `Dockerfile`, `compose.yaml` | Non-root image, local profile and owner-only Keycloak profile | Secrets |
| `scripts/container-*.ts` | Docker/Podman image checks and browser suite groups | Delivery pipeline |
| `scripts/gate-suites.ts` | Canonical browser gate suites and explicit exclusions | Process spawning |
| `scripts/ci-validate.ts` | Gate selection, command plans, JUnit summaries and process lifecycle | Azure deployment |
| `scripts/image.ts` | Image metadata, runtime/scanner commands, vulnerability exceptions and registry push | Pipeline-only build logic |
| `scripts/pipeline-lint.ts`, `scripts/pipeline-dry-run.ts` | Offline schema/rules validation and template/condition planning | Real Azure execution |
| `scripts/deploy.ts` | Preflight, release ordering, revision recording, digest deployment and recovery orchestration | Direct Azure process calls |
| `scripts/deploy-azure.ts`, `scripts/deploy-fake.ts` | One injected client interface: CLI I/O and offline call recording | Deployment decisions |
| `scripts/deploy-smoke.ts` | Pure smoke predicates and bounded HTTP/discovery checks | Authenticated browser sessions |
| `scripts/deploy-version.ts` | Release precedence and read-only registry version guard | Version promotion or deployment |
| `deploy/azure-devops/`, `azure-pipelines.yml` | Target pipeline templates, pinned upstream schema and placeholder variables | GitHub automation or secrets |
| `server/config.ts` | Reads and checks the environment once: `readConfig()` returns the typed configuration of local or server mode, or refuses to start naming each variable at fault | Reading `process.env` anywhere else for these settings |
| `server/bin/sw-askpass` | The askpass program Git runs in server mode; it answers from the environment of that one command, for its host only | Stored credentials |
| `server/routes/` | One file per resource (`projects`, `files`, `git`, `clone`, `repos`, `trash`, `metrics`, ...): parse and check the request, call the workspace, shape the response | File or Git operations |
| `server/projects/workspace.ts` | `openWorkspace()`, the composition root: registry, saves, imports, moves, scans, events, and the wiring of the services below | HTTP parsing |
| `server/projects/` (other) | One service per concern: `git.ts` (the only place Git runs), `scm.ts` (Source Control), `clone.ts`, `journal.ts` (all-or-nothing renames), `trash.ts`, `repositories.ts` (which folders of a repository are projects: the `.semantic-workbench.json` manifest and detection) and `repository-projects.ts` (registering them), `scanner.ts` and `cache.ts` (the index), `state.ts` (registry, drafts, view settings), `paths.ts` (every path check), `events.ts` (server-sent events), `watcher.ts` | Browser code |
| `server/auth/sessions.ts`, `server/auth/attempts.ts` | Encrypted session persistence, revocation and signed single-use sign-in attempts | Provider protocol |
| `server/auth/oidc.ts` | OIDC discovery, code exchange, signature checks, refresh and client authentication | Grant decisions |
| `server/auth/directory.ts` | App-only group membership requests with bounded batches, and the short-lived group-name cache with bounded concurrent lookups | Role assignments |
| `server/auth/sign-in-error.ts` | Safe typed sign-in failure reasons | Display text or provider secrets |
| `server/auth/csrf.ts` | Public-origin, request-header and logout-form checks | Session persistence |
| `server/auth/remote-hosts.ts` | Pure decisions on remote addresses: allowed hosts, canonical addresses, one host per remote, and which credential a host takes | I/O |
| `server/auth/remote-credentials.ts` | Server-mode remote Git: Azure DevOps on-behalf-of and GitHub consent tokens kept in the session, and the credential for one command | Running Git |
| `server/auth/github-oauth.ts` | GitHub's OAuth consent address and token requests | Session storage |
| `server/auth/authentication.ts` | Composition of sessions, provider identity, directory resolution and existing grants; owns the one administration repository and reloads policy after its commits; records users through `ws.state` | HTTP route dispatch |
| `src/auth/` | Once-per-page identity hook, person menu with native CSRF sign-out form, and the Connected accounts dialog | Provider tokens or grant decisions |
| `scripts/auth-*.ts` | Sign-in orchestration, disposable environments, mock lifecycle checks, Keycloak compatibility and server container checks | Shared browser assertions or generic process lifecycle |
| `scripts/helpers/sign-in.ts` | Shared identity, storage, native sign-out and responsive browser assertions | Provider startup |
| `scripts/helpers/processes.ts` | Command execution, loopback ports, bounded readiness and once-only signal cleanup | Suite selection or provider configuration |
| `server/routes/auth.ts`, `server/routes/me.ts` | Minimal identity-only pages and current identity responses | Provider tokens in responses |
| `server/auth/actions.ts` | Action names, built-in role ids and classification levels | Policy evaluation, I/O |
| `server/auth/resource.ts` | Resource and decision types, boundary path normalization | Policy evaluation, I/O |
| `server/auth/principal.ts` | Trusted claim normalization and stable principal keys | Provider roles, I/O |
| `server/auth/bearer.ts` | Agent clients' bearer tokens: the agent-API-only rule, signature, issuer, audience and expiry checks against the provider's cached keys | Grants, HTTP responses |
| `server/auth/grants.ts` | Pure grant matching and role-holder scope expansion | Policy evaluation, I/O |
| `server/auth/role-compiler.ts` | Pure role validation and Cedar policy generation | Cedar engine, I/O |
| `server/auth/role-requirements.ts` | The "Requires …" text `/api/me` gives for each action, in configured role names | Policy decisions |
| `server/auth/access-config.ts` | Administration schema validation and typed configuration | Access decisions |
| `server/auth/path-rules.ts` | Restricted POSIX globs and Cedar wildcard rule classes | Access decisions |
| `server/auth/cedar.ts` | Validated policy loading, entity graphs and the Cedar engine | HTTP handling |
| `server/auth/authorize.ts` | The access-decision boundary, filtered views and request memoisation | HTTP handling |
| `server/auth/route-actions.ts`, `server/auth/middleware.ts` | Route inventory, request scopes, identity resolution and audited HTTP decisions | Resource-specific business logic |
| `server/auth/audit.ts` | Durable monthly audit records, hash chains and retention | Secrets or document contents |
| `src/governance/guards.ts`, `src/governance/levels.ts` | The shared, pure governance rules: what a file change touches (metric status, approved-metric edits, ODCS classification, critical data elements, team, roles, protected properties), demotion to proposed, owner matching and owner choices, classification levels | Policy evaluation, I/O |
| `server/auth/guards.ts` | Binds those rules to a request: `guardFor(scope)` builds the guard that decides each guarded change with `approveMetric` or `editGuarded` and throws `GuardedChangeError`; re-exports the shared rules | Reading or writing files |
| `server/auth/write-access.ts` | `authorizeWrite` for write targets; re-exports `WriteAccessError` | Content rules |
| `server/auth/write-access-error.ts` | `WriteAccessError`, apart so the guards can extend it without a cycle | Request scope |
| `server/routes/people.ts` | `GET /api/projects/:slug/people`, the owner choices of a project: people who may read it, with verified identities | Owner matching rules |
| `src/auth/guards-client.ts` | Approve/Deprecate state and protected-property checks for the browser, using `src/governance/` | Saving |
| `server/auth/admin-repo.ts`, `server/auth/admin-guard.ts` | Validated Git versions of administration documents and the last human Admin invariant | HTTP parsing |
| `server/auth/access-admin.ts`, `server/auth/change-summary.ts` | Administration saves: proposals, dry-run receipts, last-Admin and bootstrap checks, one commit per change with its message, affected streams | HTTP parsing |
| `server/auth/policies.ts`, `server/auth/dry-run.ts` | Admin rule templates and validation; decision replay and "what changes for whom" | Persistence |
| `server/routes/admin.ts`, `server/routes/audit.ts` | The `/api/admin/*` and `/api/audit*` contract: input checks and response shapes | Access decisions of their own |
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
| `src/scm/` | Source Control panel, Commit dialog, Git setup dialogs (`GitSetup.tsx` opens them from anywhere), and the server-mode connect prompt that resumes a remote action (`RemoteConnectPrompt.tsx`) | Git commands; they run on the server |
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
and can be cancelled. In server mode the route first asks `auth/remote-credentials.ts` for the
caller's credential for the remote's host (the service is attached to each request by
`handler.ts` through `auth/request-scope.ts`); a missing account answers 428 before Git runs.

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
- Local mode never asks for, stores or sends credentials; Git's helpers and SSH handle them.
  Server mode passes each person's own token to one Git command through `sw-askpass` and that
  command's environment, never through `.git/config` or files, and keeps it only in the
  encrypted session. Hosts are checked when an address is stored and before every command, and
  redirects are not followed, but the last guard is `sw-askpass` itself: it answers only a
  prompt naming exactly the credential's host, so a token never reaches another host.

## Cross-cutting concerns

- **Configuration**: start-up uses `readConfig()` in `server/config.ts` once for mode, host,
  port, data root, cache root and build identity. Server mode requires issuer discovery and
  a valid administration policy set before serving workspace traffic. The writable-root probe precedes lock acquisition; recovery,
  migration, scanning and access middleware initialization happen only after ownership.
  `openWorkspace({ root, cacheDir })` accepts explicit paths for isolated tests.
- **Authentication**: server requests follow cookie → session → principal → grants → boundary.
  Expired provider credentials trigger refresh before claims and directory membership are normalized
  again. Sessions are AES-256-GCM encrypted on disk and revocable; ending a session closes its live
  streams. Anonymous pages redirect to the provider, while signed-in people without access see
  an identity-only No access page. The Signed out page never initiates sign-in.
- **Access**: health probes remain public. Local static frontend files are answered before the
  local Host/Origin check; server static files pass through the same boundary as workspace pages. Every `/api` and `/auth` request goes through
  `server/auth/middleware.ts` when serving; startup and hand-over gate application traffic with 503.
  Server-mode hashed assets use `private, max-age=31536000, immutable`; HTML and API responses
  use `no-store`. Local-mode cache headers are unchanged. Shared caches cannot retain gated files.
  Routes never decide access.
  `auth/route-actions.ts` maps each HTTP entry point to an action and resource, including the
  server GET/HEAD page row. `handler.ts` mounts `/auth/*`, `/api/me` and `/api/events` in its
  ordinary route list; the event route binds server streams to their session. The middleware
  creates one request scope through `auth/authorize.ts`, fails closed for unmapped routes, and
  attaches the scope for route filtering. Local mode uses the implicit Admin; server startup injects the cookie session resolver. Server non-GET requests require `X-SW-Request: 1` and an `Origin`
  equal to `HandlerOptions.publicOrigin`, derived from `SW_PUBLIC_URL`; without that configured
  origin they are refused. The logout form requires its session token instead of the header.
- **Audit**: denied decisions, allowed writes (including local draft saves), and allowed reads on
  explicitly audited agent rows are flushed to monthly JSON Lines under `state/audit/`. Records
  include the principal, action, resource, decision, outcome, previous-line hash, and response's
  `X-Request-Id`; secrets and document contents are excluded. Retention defaults to 400 days.
  Authentication records `signIn`, `signOut` and `sessionEnded`; directory failures use
  `directoryLookup` with outcome `degraded`, including during refresh, and the request id.
  The sign-in audit is written before session creation; a failed write returns 503 without
  creating a session. Local mode does not mirror to stdout. Failed denial audits refuse the request; audit failures
  after an operation write one `audit-failure` JSON line to stderr (request id, action and, for
  administration changes, the version) and preserve the response to avoid retrying writes.
  Administration documents live in `admin/`, with validated atomic writes and one Git commit
  per change; failed writes restore the committed tree, while requested rollbacks create new commits.
- **Guards**: `requestReader(request)` carries the principal's content guard (`guardFor(scope)`)
  for every signed-in principal, agent clients included; only local mode's `LOCAL_READER` has
  none. A server `Reader` must carry a guard, and write methods take the reader without a
  default, so an unguarded server write does not compile. The guarded writes are `saveFile`,
  `saveFiles`, `saveDocument`, `importInto`, `importBatch`, `revertFile`, `moveFile` (across
  projects), `scm.pull`/`sync`/`switchBranch`, and `trash.deleteFile`, `undo` and `restore`.
  `importBatch` judges a new project's files as created in the domain the route chose, before
  the project exists. The workspace calls the guard under the project lock with each file's text
  before and after (and the committed text, whose owner also counts for self-approval), before
  anything is validated or staged; it returns the text to write (an edited approved metric
  demoted to `proposed`) or throws, which the middleware audits as `guarded:<kind>` and answers
  with the guarded pointers. Operations that bring in text the person did not type name
  themselves (pull, revert, delete, restore, import, move, switch) so a refusal tells the person
  to ask a Steward, and they never demote. A pull is fetched, checked between the merge base and
  the fetched tip, and that checked commit is merged (not a second fetch); a switch is checked
  between the current commit and the target branch; a move is judged as removing the file from
  its project and creating it in the target. A restore's files are judged as created.
  `tests/auth/guard-inventory.test.ts` requires every route beyond a plain read to be covered by
  a guard case or listed as exempt with its reason, and agent clients to be admitted only on read
  rows. `applyGuards` in `src/governance/guards.ts` is the pure entry point.
- **Errors**: services throw specific errors (`server/projects/errors.ts`, `GitError`,
  `PathError`, `InputError`, `SignInError`); `server/routes/http.ts` maps them to status codes in one place, including the safe sign-in page and attempt-cookie clearing. The handler passes that mapping into the access middleware, so `server/auth/` never imports `server/routes/`.
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

The header composes `src/auth/PersonMenu.tsx` through `WorkspaceHeader`'s optional slot.
`useMe` keeps the `/api/me` promise in memory once per page, including React effect remounts; rejected requests are discarded so a later mount can retry.
Local mode renders no person menu. The API returns the session's form CSRF token, never its
provider credentials; the form posts it to `/auth/logout`. `src/projects/api.ts` owns the
`X-SW-Request` marker and the single reload allowed after a 401. All frontend fetches use that
wrapper, including grouping and mapping requests; EventSource uses the session cookie.

Authentication browser checks share `signIn`, `signOut` and `signInChecks` across mock,
Keycloak and container targets. Provider startup stays at the edges. Environment construction,
container arguments, discovery/readiness predicates, bounded waits and parsed identity assertions
have offline unit tests. The gate builds the auth frontend without starting Vite; the server
container group exercises the image itself. Keycloak remains outside the delivery gate.

`server/auth/request-scope.ts` owns the scope the middleware attaches to each request:
`requestScope()` returns it and `requestReader()` derives the required `Reader` from it, so
routes and resource helpers never import the HTTP middleware. The reader carries the request's
view, personal state owner and content guard. Every workspace
service that reads or writes on a person's behalf requires it, including grouping views, legacy
document saves and clones; local and internal operations explicitly pass `LOCAL_READER`.
Omitting a reader must fail compilation, never grant unrestricted access. Derived agent and metric services receive only filtered
documents and cannot resolve hidden references. Workspace modules import the scope type
`AccessScope` from `auth/authorize.ts`, never from the HTTP middleware.

Every `events.emit` call requires tags: either `{ audience: 'all' }` for a payload safe for
every connected reader, or explicit `projects`/`paths`. Ownership and working-copy tags further
restrict delivery. Tags alone determine readability; publishers must tag every resource named
in the payload. Resource-list payloads are reduced to their readable tagged items. Live delivery
and replay apply the same filter with `scope.view()` evaluated at delivery time. Identity events
tag the projects sharing their repository; recovery broadcasts contain no resource names.

A removed project has no grants left to evaluate at delivery. Publishers of removals (deleting a
project, Clear, and taking a project out of the workspace) therefore call
`events.withCurrentReaders()` before the registry write. It records, per project, the connected
principals who can read it then, and delivery uses that list instead of the live view. A person
who could not read the project never receives its slug. Clients that reconnect refetch
everything, so a missed removal is not lost.

Trash events use one rule with the trash listing: `readableTrash()` in `projects/trash.ts`
requires every original path to be readable and the restore action to be allowed.
`restoreAction()` in the same module is the only place that picks it: `restoreOwn` when the
entry's `deletedBy` is the caller, `restoreOthers` otherwise, including entries without one.
An entry without original paths, such as a deleted empty project, falls back to the project:
it is visible to whoever may restore that project, in listings and events.

Suggestion counts are per person in server mode. The workspace always sends a payload-free
`suggestions` trigger; the event hub debounces it, builds one unrestricted file index per round
and narrows it to each connected principal's view. A failure for one person is logged and does
not stop the others. Each person receives a count only when it changes. Clients without a
personal scope (local mode) share one count, also announced only when it changes.
Without server sessions (local mode), every access reload closes the live-update streams and
reloads every open tab. With sessions, an administration change closes only the streams of the
people its dry run lists as affected (see Administration below). A new project is announced
before its domain is committed, when only Admins can read it, so the domain assignment announces
it again after its commit and the people of that domain see it without a reload.

`state.forOwner()` exposes only `PersonalState`: drafts, grouping views and suggestion dismissals
under `state/users/`. Local state paths are unchanged. File saves, imports that replace a file,
reverts, moves, deletions and restores journal changes for every owner's personal state,
including owners without active sessions. `projects/personal-state.ts` owns those journal steps.
A move never replaces a draft that already exists at the destination, shared or personal.
Keep-both moves and imports choose the new name among the names the reader can see and the
names already taken in the same batch. They refuse a name the reader cannot open or one that
exists on disk out of the reader's sight, before anything is written. Trash metadata records
`deletedBy` and the original paths. In server mode the middleware resolves a targeted trash
entry once and authorizes its original target; local mode leaves trash lookups to the route.
Hidden-resource errors use the same 404 body as missing items, but only hidden denials receive
denial audit records.

Git content checks apply even when a requested path has disappeared from the working tree.
Repository ownership always uses the longest matching project prefix. History reads use one
`git log --name-only -z` invocation, exposing readable commits and a hidden-commit count;
local history retains its array response.

### Write authorization and UI capabilities

The route inventory authorizes each request before dispatch. Rows marked `targets: 'body'`
resolve their actual resources in the owning route and call `authorizeWrite` in
`server/auth/write-access.ts`, which reads the scope through `requestScope()`. Write checks
accept decision context such as the branch being pushed. The shared write helper owns the sole
local-mode write bypass.

All targets are checked before mutation: both ends of moves, every batch or metric output file,
legacy documents, suggestions, and restore destinations. Grouping views are personal state, so
their row uses `viewOwnState` and the route refuses a document the reader cannot open.
Restoration checks the original target and the destination with the action `restoreAction()`
picks. A hidden write target answers 404 like a missing one, before the workspace looks at it.
`server/auth/git-access.ts` maps repository paths to projects and checks
every project sharing a repository before switch, fetch, pull, sync, push or a remote change
(`setRemote`). A target denial returns
through middleware for one audit record and a 403/404 response without changing workspace bytes.

`server/auth/project-creation.ts` validates domain selection through Cedar and persists the
assignment in the administration repository. Cedar judges a project that does not exist yet as
the resource `newProjectIn(domain)` from `server/auth/resource.ts`: the entity builder in
`server/auth/cedar.ts` gives it the requested domain, so no policy is recompiled. An unknown domain
answers 404 like a hidden one.

The process holds one administration repository instance, created and owned by
`server/auth/authentication.ts` and handed to the routes as `administration`. Its writes are
serialized within that instance, and after each commit it reloads the live policy through
`access.reload`. If that reload fails, the write still succeeds because the commit exists; the
failure is logged with the new version and decisions keep the previous policy until the next
commit or restart loads it. A handler built without server authentication opens its own instance with the
same reload. A stale assignment reloads and retries once; failure moves the new projects to
trash. An unassigned creation removes stale slug metadata and commits nothing when there is none.
Clones assign domains only after successful cloning, and a multi-project clone assigns every
project's domain in one commit; if that commit fails, all of the clone's projects go to the trash
and the clone reports failure.

`src/auth/can.ts` consumes `/api/me.can`, `requires` and project `actions`; it never interprets
grants as permission rules. `server/auth/role-requirements.ts` derives role explanations from the
built-in definitions, names custom roles when they are the person's sole source, and uses the
same role names `/api/me` lists in `roleNames`. `Capabilities.tsx` supplies
actions to nested controls. Creating components own their domain selection through
`src/projects/useProjectDomain.tsx` and pass the chosen domain to their API call. The client shows
a chooser whenever the server offers more than one choice. Only the server automatically assigns
a sole domain to non-Admins; local creation remains unrestricted.

## Administration

Administration has one owner per side: `server/auth/access-admin.ts` decides and commits,
`src/admin/` proposes and reviews. Authorization stays on the server; the panel never computes
a decision itself.

### Server

`server/routes/admin.ts` parses `/api/admin/*` requests into typed inputs and calls the service;
The access middleware decides once which projects' audit records a request may read (all for an
Admin, a Steward's own projects otherwise) and stores them with the request scope
(`auditProjects()` in `request-scope.ts`). `server/routes/audit.ts` reads that set, and
`queryAudit` also drops records of paths the reader may not `read`, before paging or export.
The route inventory fails closed for unknown administration paths.

`server/auth/access-admin.ts` validates each proposal, issues dry-run receipts bound to the
proposal and the current version, runs the last-Admin and bootstrap guards and makes the single
administration commit. A rollback is a proposal too: `{rollbackTo}` restores an earlier version's
files, passes the same checks, and its save needs the receipt of that dry run. Group names of a
grants proposal are looked up before the save waits for the write lock, through a cache in
`directory.ts` that the users and grants routes share. The last-Admin guard in `admin-guard.ts`
loads the proposed configuration into a separate access boundary and requires a recent Admin or a
bootstrap identity to be allowed `admin`. `admin-repo.ts` owns complete-tree replacement, validation, the settings
defaults and Git recovery. `change-summary.ts` turns the difference between the active and the
proposed documents into the one-line commit message. The service writes through the one
administration repository the handler receives as `administration`, so its commit reloads the
shared access boundary like every other administration write. It then closes the live-update
streams of the people the dry run lists as affected, updates session limits and writes an
`adminChange` audit entry.

`server/auth/policies.ts` owns rule annotations, raw validation and the structured templates;
the panel gets template text only from `POST /api/admin/policies/template`. Rule text whose
`forbid` covers every action or names `admin` is refused there.
Disabled rules must still parse and validate before saving, and Cedar's baseline forbids stay in
every proposed set. `server/auth/dry-run.ts` evaluates a separate boundary for the proposal and
leaves the live one untouched until activation. Its shipped matrix is generated from
`tests/auth/route-actions.ts` by `scripts/generate-access-matrix.ts`; audit snapshots and known
people and agent clients add replay cases and per-project action changes. The audit snapshots
come from `audit.recent()`, which reads month files from the newest backwards; audit queries read
only the months in their time range. `authorize.ts` also
owns the access-check explanation and who-can. The clock and the direct peer address enter at
the server composition boundary.

Receipts, the group-name cache and the save lock live in the server process. The workbench
therefore runs as exactly one replica (see `deploy/README.md`); a second replica would accept
receipts it never issued and save without the other's lock.

### Panel

`AdminLauncher` shows the **Admin** button from the identity's `can.admin` capability (or local
mode) and opens one `Modal`-based dialog per area. `api.ts` is the only administration HTTP
boundary: it uses `src/projects/api.ts` for the session and CSRF header, checks the shape of
each response, and splits every document response into the document and its `version`. That
`version` is the `baseVersion` of the next save of that document, so a concurrent change is
refused as stale instead of overwritten. `problemText` turns a refusal into the sentence a
dialog shows. The types in `types.ts` reuse the access-configuration types without importing
server runtime code.

`ReviewChange` binds a dry-run result to the serialized proposal and base version and requires
explicit confirmation; any edit discards the review. **History** shows the same dry-run result
for a rollback before **Confirm rollback**. Pure functions in `change-review.ts`,
`policy-templates.ts` and `version-diff.ts` hold proposal identity, the mapping of template form
fields to the server's template request (including time windows past midnight) and diff
presentation. `GrantForm` is shared by users, roles and grants. `RolePermissions` follows
the action groups and condition applicability of the policy model. The raw policy editor reuses
`src/editor/CodeEditor.tsx` and history reuses `src/scm/DiffView.tsx`. Small shared pieces:
`SelectField` labels a select by reference (a select inside its label would take the chosen
option into its name), `identifiers.ts` makes grant, role and rule IDs without
`crypto.randomUUID` (missing on plain-HTTP pages), and `when.ts` formats timestamps.

### Tests

`tests/auth/admin-api.test.ts` and `tests/auth/dry-run.test.ts` cover the service and routes.
`tests/admin-client.test.ts` mocks the fetch edge; `tests/admin-presentation.test.tsx` covers
pure presentation decisions. `tests/admin-dialogs.test.tsx` and `tests/admin-geometry.test.tsx`
load `tests/harness/admin-harness.tsx` in Chromium against `tests/helpers/admin-api-mock.ts`,
whose canned responses follow the HTTP contract; the mock only answers requests and
reimplements no server rule. `scripts/admin-browser-check.ts` runs the panel against the real
API with the existing authentication fixtures; `scripts/helpers/admin-browser.ts` holds its
geometry check, area list and time limit.

### Agent clients (bearer path)

An agent client calls `/api/agent/*` with a client-credentials token instead of a session cookie.
`auth/middleware.ts` looks at the `Authorization` header before anything else in server mode. A
bearer header outside `/api/agent/*` (`acceptsBearer` in `auth/bearer.ts`) is refused with 401
without validating the token. On the agent routes the token replaces the cookie, so a signed-in
browser cannot widen or rescue a client call, and the cross-site check is skipped because it
protects only cookies a browser sends on its own.

`createBearerValidator` in `auth/bearer.ts` is built by `auth/oidc.ts` from the discovered
`jwks_uri`, with its own jose remote key set: unknown key ids reload the keys at most once every
five minutes, while the sign-in key set reloads at once so rotation never ends sessions. It
accepts RS256 and ES256, checks issuer, the `SW_API_AUDIENCE` list, expiry and not-before with
five minutes of skew, and refuses everything when no audience is configured. The pinned issuer
admits Entra v2 access tokens only. `clientFromToken` in `auth/principal.ts` accepts an
application token (`idtyp=app`, no `scp`) of the configured tenant and returns `client:<azp>`.
It builds the principal with `clientPrincipal`, the only client constructor, which the Admin
panel's simulator and dry runs use too. Sign-in refuses application tokens, so a session is always
a person.

Token refusals are recorded with an anonymous principal, because nothing in a refused token is
trusted. Their reason is `token-invalid`, `tenant-mismatch` or `bearer-scope` (wrong route), all
answered 401, or `provider-unreachable`, answered 503 without a bearer challenge: any failure to
fetch or read the provider's keys counts as the provider's, while a key id the set lacks stays
the token's. Refusals after validation carry the client principal.

Each route row says whether a client may use it: the three agent rows declare
`clientAction: 'agentRead'` in `auth/route-actions.ts`. The middleware decides a client by that
action instead of the row's own, refuses it with 403 `bearer-scope` on a row without one, and
with 404 `unmapped-route` where no row matches (`clientRouteRefusal` and `clientRow`). A client is
granted projects, never the workspace, so `routeDecision` passes a workspace row for it when one
readable project allows the action, and answers 403 `no-grant` otherwise. The audit records the
project the decision passed through, so a policy dry run replays the call against it. The
client's principal carries the name of its `agents.json` entry, which the audit and the Admin
panel show.

The client's only authorization is its `agents.json` entry. `auth/authorize.ts` gives a client no
grants, and Cedar's entity builder in `auth/cedar.ts` turns the entry into the client's project
list, so `B8-agent`, `F4-bearer-scope` and `F6-restricted` in `policies/baseline.cedar` decide
the rest. The client's view uses `agentRead`, so the agent routes in `handler.ts`, which build
catalog, context and plan from `ws.documentsFor(requestReader(req))`, never resolve a reference
into a project the client cannot read. The agent rows are marked `audited`, so every allowed call
is recorded as well as every refusal.
