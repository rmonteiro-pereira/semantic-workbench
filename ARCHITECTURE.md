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
| `server/request.ts` | Reads JSON bodies within a byte limit, decodes path segments and marks hidden responses; the one place a malformed escape becomes a 400 | Routing or access decisions |
| `server/serve-options.ts` | The listener's options: no development mode, one error answer, idle timeout (the event stream opts out per request) | Routing |
| `server/routes/health.ts` | Public liveness/readiness and startup traffic gating | Workspace inspection |
| `server/static.ts` | Built frontend, SPA fallback, path confinement and security headers | API routing |
| `server/projects/instance-lock.ts` | Lease decisions, atomic acquisition, heartbeat and revision hand-over | Workspace recovery |
| `server/projects/data-root.ts` | Writable-root startup probe with path and uid errors | Workspace writes |
| `server/startup-log.ts` | Operator diagnostics after initialization | Startup decisions |
| `server/observability/` | Everything about watching the running server. `settings.ts` reads `SW_LOG_LEVEL`, the connection string and sampling for `config.ts`; `redaction.ts` removes secrets, content and locations by field name and by value; `log.ts` is the one logger (JSON lines in server mode, readable lines in local mode, level filter, sinks); `request-context.ts` carries the request id and the actor pseudonym through `AsyncLocalStorage`; `http-request.ts` wraps each request in a context, span, metric and log line (the middleware passes it the route template from `auth/route-actions.ts`); `tracing.ts` and `metrics.ts` are the only places that touch the OpenTelemetry API; `git-command.ts`, `workspace-work.ts` and `browser-report-recorder.ts` measure Git, scans, validation and browser reports; `telemetry.ts` decides whether export is on, keeps the allow-list of log fields that may leave the server, and loads `pipeline.ts` (SDK providers) and `azure-backends.ts` (Azure Monitor exporters) by dynamic import only when it is | Business rules, access decisions, audit records, any import of the SDK or exporter outside `telemetry.ts` |
| `server/routes/browser-reports.ts` | `POST /api/telemetry/browser`: 404 while telemetry is off, then rate limit, size limit and strict schema check of the browser's error and timing reports | Recording logic (it calls `observability/browser-report-recorder.ts`) |
| `src/observability/` | The browser's reporting: `browser-report.ts` is the schema, limits and budgets shared with the server, `reporter.ts` the bounded queue and batching, `page-reporting.ts` the page listeners, the sender and `timeOperation` | Calls to any host but the workbench API; clicks, keystrokes or file content |
| `server/shutdown.ts` | Signal cleanup shared with hot reload | Workspace logic |
| `Dockerfile`, `compose.yaml` | Non-root image, local profile and owner-only Keycloak profile | Secrets |
| `scripts/dev.ts`, `scripts/api-readiness.ts` | Development launcher: starts the API, waits for `/readyz`, then starts Vite, and stops both together | Production serving |
| `scripts/container-*.ts` | Docker/Podman image checks and browser suite groups | Delivery pipeline |
| `scripts/container-hardening.ts` | The read-only, no-capability run flags shared by the container checks and mirrored in `compose.yaml` | Image build logic |
| `src/theme.css`, `src/theme-palette.ts` | Every colour token, light and dark; the colours data picks at run time | Colour literals anywhere else (`bun run check` fails on them) |
| `public/brand/`, `server/brand/`, `src/brand/` | The brand bundle. `public/brand/` holds the default `logo.svg`, `logo-mark.svg`, `favicon.svg`, `brand.json` and `brand.css`. `server/brand/` loads them once at start (`bundle.ts`, with the operator's `SW_BRAND_DIR` laid over the defaults), cleans each file (`sanitize-svg.ts`, `sanitize-css.ts`, the manifest schema from `src/brand/manifest.ts`) and serves them from memory at `/brand/*` (`route.ts`, called from `server/static.ts`); `css-values.ts` is the one list of forbidden CSS values both cleaners use; `active-brand.ts` is the bundle the sign-in pages read (it throws until start-up sets it). `src/brand/` reads `/brand/brand.json` in the browser (`BrandContext.tsx`: product name, document title) and draws the logo (`BrandLogo.tsx`). `src/control-characters.ts` is the control-character check shared with `src/scm/repository-folder.ts`, and `scripts/helpers/walk-files.ts` is the file walker shared by `check-brand` and `check-theme`. `scripts/check-brand.ts` fails `bun run check` on a hard-coded product name or logo | The product name or logo written anywhere else; reading a brand file at request time |
| `scripts/theme-codemod.ts`, `scripts/check-theme.ts`, `scripts/helpers/color-literals.ts` | Moving literals into tokens, failing on literals outside the theme files, and the shared literal scanner | Token values |
| `scripts/gate-suites.ts` | Canonical browser gate suites and explicit exclusions | Process spawning |
| `scripts/ci-validate.ts` | Gate selection, command plans, JUnit summaries and process lifecycle | Azure deployment |
| `scripts/image.ts` | Image metadata, runtime/scanner commands, vulnerability exceptions and registry push | Pipeline-only build logic |
| `scripts/pipeline-lint.ts`, `scripts/pipeline-dry-run.ts` | Offline schema/rules validation and template/condition planning | Real Azure execution |
| `scripts/deploy.ts` | Preflight, release ordering, revision recording, digest deployment and recovery orchestration | Direct Azure process calls |
| `scripts/deploy-azure.ts`, `scripts/deploy-fake.ts` | One injected client interface: CLI I/O and offline call recording | Deployment decisions |
| `scripts/deploy-smoke.ts` | Pure smoke predicates and bounded HTTP/discovery checks | Authenticated browser sessions |
| `scripts/deploy-version.ts` | Release precedence, the tagged-commit-on-main guard and the read-only registry version guard | Version promotion or deployment |
| `deploy/azure-devops/`, `azure-pipelines.yml` | Target pipeline templates, pinned upstream schema and placeholder variables | GitHub automation or secrets |
| `server/config.ts` | Reads and checks the environment once: `readConfig()` returns the typed configuration of local or server mode, or refuses to start naming each variable at fault | Reading `process.env` anywhere else for these settings |
| `server/bin/sw-askpass` | The askpass program Git runs in server mode; it answers from the environment of that one command, for its host only | Stored credentials |
| `server/routes/` | One file per resource (`projects`, `files`, `export`, `drafts`, `git`, `clone`, `repos`, `trash`, `suggestions`, `metrics`, `kpis` (the older path of `metrics`), ...): parse and check the request, call the workspace, shape the response | File or Git operations |
| `server/projects/workspace.ts` | `openWorkspace()`, the composition root: registry, saves, imports, moves, scans, events, and the wiring of the services below | HTTP parsing |
| `server/projects/` (other) | One service per concern: `git.ts` (the only place Git runs), `scm.ts` (Source Control), `clone.ts`, `journal.ts` (all-or-nothing renames), `trash.ts`, `repositories.ts` (which folders of a repository are projects: the `.semantic-workbench.json` manifest and detection) and `repository-projects.ts` (registering them), `scanner.ts` and `cache.ts` (the index), `state.ts` (registry, drafts, view settings), `paths.ts` (every path check, including the refusal of a name that differs from an existing one only in letter case, for volumes that ignore case), `events.ts` (server-sent events), `watcher.ts`, `worktrees.ts` (server-mode working copies: `git worktree`, branch holders, the compare-and-swap publish, the merge from the default branch), `working-copies.ts` (which copy a request reads and writes, per-person index, Source Control and idle release, the copy shown in the project listing), `publishing.ts` (publishing, and the default branch following a fetch), `unpublished-work.ts` (unpublished work kept in the trash and counted for a delete), `published-checkout.ts` (brings the published checkout back to a clean state at start-up in server mode), `project-export.ts` (which files a project's zip export holds: Git-ignored and unreadable files are left out and counted, the size limit is checked and the optional Git bundle is made before anything is sent) and `zip.ts` (the store-only zip writer that streams one entry at a time), `reader.ts` (the `Reader` and `CopyAccess` types that carry a person's view, state owner, guard and copy into every service), `event-access.ts` (which events a connection may receive), `suggestions.ts` (grouping suggestions from explicit references), `migration.ts` (the one-time move of the v0.1.0 database into project folders) and `atomic.ts` (UTF-8-preserving writes through a temporary file and rename), `sparse-folder.ts` (the Git steps that keep a project in one folder of a larger repository: cone-mode sparse checkout, folder checks on a revision, the file contents a judged pull needs) and `project-folder.ts` (the previewed move of a project into a folder, or to another folder, recorded as one commit and never rewriting history) | Browser code |
| `server/auth/sessions.ts`, `server/auth/attempts.ts` | Encrypted session persistence, revocation, the provider-session index front-channel logout uses (HMAC keys, never the raw `sid`), and signed single-use sign-in attempts with `safeReturnTo` | Provider protocol |
| `server/auth/sign-in-provider.ts` | The sign-in provider interface (login URL, callback, refresh, logout with the session's `logout_hint`, application token, on-behalf-of) and the choice of library by `SW_OIDC_PROVIDER`: Entra → MSAL, Keycloak and generic → openid-client | Protocol details of either library |
| `server/auth/msal-provider.ts` | Entra through MSAL Node: authorization code with PKCE, the per-session token cache plugin (the cache lives only in the encrypted session record), silent refresh, sign-out URL, certificate, secret or managed-identity credential, Graph and on-behalf-of application tokens; the Entra authority and discovery checks | Session persistence or grant decisions |
| `server/auth/oidc.ts` | openid-client path for Keycloak and generic providers: OIDC discovery, code exchange, refresh, on-behalf-of token exchange and client authentication | Grant decisions |
| `server/auth/managed-identity.ts` | The platform's federated assertion for `SW_OIDC_CLIENT_ASSERTION=managed-identity`, used by both libraries | Token requests to the provider |
| `server/auth/id-token.ts` | Provider signing keys, ID-token signature checks and the claims a session keeps for sign-out (`sid`, `login_hint`), shared by both libraries | Claim mapping |
| `server/auth/directory.ts` | App-only group membership requests with bounded batches, and the short-lived group-name cache with bounded concurrent lookups | Role assignments |
| `server/auth/sign-in-error.ts` | Safe typed sign-in failure reasons, the provider's OAuth code (the only provider text the log gets), and the mapping of failures both libraries share | Display text or provider secrets |
| `server/auth/csrf.ts` | Public-origin, request-header and logout-form checks (the form body is read only up to 4096 bytes) | Session persistence |
| `server/auth/rate-limit.ts` | Per-source-address token buckets for requests and sign-in routes, and the gate that bounds anonymous audit records | Audit storage |
| `server/auth/source-address.ts` | Which address counts as the client for those limits: the socket peer, or the entry `SW_TRUSTED_PROXY_HOPS` places from the right of `X-Forwarded-For` (IPv6 by its /64) | Network policy rules, which always use the socket peer |
| `server/auth/remote-hosts.ts` | Pure decisions on remote addresses: allowed hosts, canonical addresses, one host per remote, and which credential a host takes | I/O |
| `server/auth/remote-credentials.ts` | Server-mode remote Git: Azure DevOps on-behalf-of and GitHub consent tokens kept in the session, and the credential for one command | Running Git |
| `server/auth/github-oauth.ts` | GitHub's OAuth consent address and token requests | Session storage |
| `server/auth/authentication.ts` | Composition of sessions, provider identity, directory resolution and existing grants; front-channel logout (ends the sessions a provider session started); owns the one administration repository and reloads policy after its commits; records users through `ws.state` | HTTP route dispatch |
| `src/auth/` | Once-per-page identity hook, person menu with native CSRF sign-out form, and the Connected accounts dialog | Provider tokens or grant decisions |
| `scripts/auth-*.ts` | Sign-in orchestration, disposable environments, mock lifecycle checks, Keycloak compatibility and server container checks | Shared browser assertions or generic process lifecycle |
| `scripts/examples/agent-client.ts` | Runnable example of an agent client that gets its Entra token with MSAL and reads the agent catalog | Anything the server imports |
| `scripts/helpers/sign-in.ts` | Shared identity, storage, native sign-out and responsive browser assertions | Provider startup |
| `scripts/polish-capture.ts`, `scripts/polish-capture-server.ts` (`bun run polish:capture`, `polish:capture:server`) | Photograph the screen tour at the four sizes in local mode and in server mode (mock administrator sign-in), using an expanded temporary access fixture for section and property dialogs; server folder moves capture the explicit refusal. Print the measured problems of each screen and reject skipped administrator screens | Assertions of the suites |
| `src/projects/examples.ts` | The registry of example sets: which files each one loads, its first tab and its message | Reading the files |
| `scripts/*-example.ts`, `scripts/*-metrics.ts`, `scripts/billing-contract.ts`, `scripts/helpers/example-metrics.ts` | Generators of the commerce, UBL, billing and mall examples; the governed metrics of an example are declared in its `*-metrics.ts` and written with the helper that renders the extension and binding text as the metric wizard does (the commerce, UBL and billing generators share it; mall writes its own text) | Browser checks |
| `scripts/example-metric-checks.ts`, `scripts/example-metric-mutants.ts` | What every example set must show (counts, one simple, one composed and one cross-table metric, owner, status, concept bindings, contract lineage, an unexecuted SQL preview), clean validation and untouched upstream hashes; the faults that drop a metric, binding or contract from a set | Browser steps |
| `scripts/helpers/auth-page-geometry.ts` | Loaded brand images, settled and centered graph/calculation content, bounded headers and persistent browser-error recording for authentication captures | Identity flows |
| `scripts/helpers/examples-tour.ts` | The metric screens of every example for the responsive suite and the browser steps that check one metric of each kind | Suite selection |
| `scripts/helpers/edit-tour.ts`, `scripts/helpers/odcs-tour.ts` | The editing, metrics, mapping and data contract screens and dialogs as screens of the responsive suite | Suite selection |
| `scripts/helpers/graph-options.ts` | Opens the Controls panel of a phone toolbar and the options dialog of a graph toolbar so browser checks drive its controls | Assertions about the controls |
| `scripts/helpers/graph-tour.ts`, `scripts/helpers/graph-canvas-geometry.ts`, `scripts/helpers/graph-paint-geometry.ts` | The whole-model graph and neighborhood screens, and their measurement: names and detail lines on screen, overlapping cards and headings, painted edge contrast and width, paths crossing unrelated cards, card containment, popup anchoring, the toolbar and a phone canvas | Suite selection |
| `scripts/helpers/sync-dialog.ts`, `scripts/helpers/dialog-geometry.ts`, `scripts/helpers/project-dialog-tour.ts`, `scripts/helpers/dialogs-tour.ts`, `scripts/helpers/page-layout.ts` | Driving the Source control Sync and remote dialogs from the browser suites; the fit, text-size and collision assertions for an open dialog, and the standard every dialog must meet (width, padding, main action last, readable disabled button); the Source control and project dialogs, each drawn over the project it is about, as screens of the responsive suite; the file dialogs; and the layout promises of the overview, catalog, mappings and Source control pages. `authGeometry` in `sign-in.ts` takes the element whose text it measures | Suite selection |
| `scripts/helpers/text-geometry.ts` (with `lowDisabledContrastProblems`), `scripts/helpers/control-geometry.ts` (form controls drawn with theme colours), `scripts/helpers/shell-tour.ts` (header, tab strip, sidebar tree and content width), `scripts/helpers/screen-tour.ts` | Browser measurement of text below the 12 px minimum and of text covered by other elements; the list of screens and dialogs that the responsive suite and `scripts/polish-capture.ts` walk | Suite selection |
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
| `server/auth/audit.ts` | Durable monthly audit records, one hash chain across months, month-end anchors for the mirror, the chain check that `scripts/audit-verify.ts` runs ([docs](docs/audit-tamper-evidence.md)), and retention | Secrets or document contents |
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
| `server/agent/` | Metric explanations and the SQL preview (`explain.ts`, `runtime.ts`), and the restricted SQL parser and renderer they share (`sql.ts`) | Query execution |
| `src/admin/` | The Admin page: `AdminHost` swaps it in for the workspace (which stays mounted, hidden) while the URL hash names a section (`admin-route.ts`, sections in `admin-sections.ts`); `AdminPage` holds the section navigation and one `*Section` per area (`RolesAccessSection` serves grants and roles); editors take the list's place as an `AdminPane`; the only dialogs are `AdminConfirmation`s, used by the review-and-confirm step (`ReviewChange`, whose dry-run preview opens in one) and by confirmations; version history and the typed client (`api.ts`). It proposes and reviews; every decision stays on the server | Authorization or policy evaluation |
| `src/main.tsx`, `src/app/` | The app shell: `useWorkbench` and the other hooks hold state and handlers; `Workspace*` and `*Dialogs` components lay it out | Parsing or validation rules |
| `src/model.ts`, `src/validation.ts`, `src/rdf*.ts`, `src/odcs.ts` | Parse a file into `Entity` and `Relationship`, and validate it; pure functions shared with the server | React, fetch |
| `src/overview.ts`, `src/communities.ts` | Group by: modes, communities, Auto | Rendering |
| `src/edit/` | Item editors and the patch builders that keep untouched bytes exact | Network calls |
| `src/editor/` | The CodeMirror source editor (`useCodeMirror`, extensions, navigation) | Saving logic |
| `src/odcs/` | Contract pages (`ContractOverview.tsx`, `DatasetPage.tsx`, `PropertiesTab.tsx`, with the property edit dialog in `PropertyEditors.tsx`) and the column-level lineage canvas (`lineage.ts` builds the graph and decides which rows a card shows, `LineageCanvas.tsx` draws it, `LineageCard.tsx` and `LineageColumnList.tsx` draw a card and its scrolling column list, `lineage-view.ts` picks the cards of the first view, `edge-labels.ts` and `edge-route.ts` place line labels and draw routed lines, `ForeignKeyHops.tsx` shows the hop row and the list of foreign keys, `SelectedPath.tsx` lists the highlighted path as a side panel or, on a narrow window, a dialog) | |
| `src/graph/`, `src/FullGraph.tsx`, `src/NeighborhoodGraph.tsx` | Entity graph views, layout and routing; `GraphOptions.tsx` (the options dialog every graph toolbar uses for its secondary controls) and `ZoomButtons.tsx` (zoom in the toolbar, never over the canvas), `FarZoom.tsx` (the zoom level at which cards drop detail lines for a larger name; `.zoom-far` in `src/style.css`), `CompactControls.tsx` (folds a toolbar's secondary controls behind one button on a phone), `overview-capacity.ts` (how many entities of the whole-model graph read at 12 px in a pane, and the text sizes that keep names readable when zoomed out) and `graph-canvas.css` (the rules of those two) | |
| `src/metrics/`, `src/mappings/`, `src/sql/` | Metrics tab (list rules in `metric-filters.ts`, table in `MetricsTable.tsx`, filters in `MetricFiltersDialog.tsx`) and wizard, mapping views and the query composer (fields grouped by dataset in `field-groups.ts`), SQL regions and lint | |
| `src/projects/` | Client API (`api.ts`), autosave, project tree, delete and trash dialogs, the repository's projects dialog, shared dialog chrome (`Modal.tsx`) and the step navigation of multi-step wizards (`WizardStepper.tsx`: a compact line with a menu below 1200 px, a state-marked list above) | |
| `src/scm/` | Source Control panel (`BranchPicker` shows who holds a branch, `SyncDialog` the remote and its Fetch, Pull, Push and Sync actions, with `DefaultBranchActions` for the Pull, Publish and Push buttons of the default branch and a confirmation before Publish), Commit dialog, Git setup dialogs (`GitSetup.tsx` opens them from anywhere), and the server-mode connect prompt that resumes a remote action (`RemoteConnectPrompt.tsx`); `FolderField.tsx` and `FolderConfirmation.tsx` (the Folder in repository field of the Clone and Remote dialogs and what a folder change will do), `repository-folder.ts` (the folder path check the server runs too) and `repository-location.ts` (the panel header's remote, branch and folder) | Git commands; they run on the server |
| `schemas/` | Pinned JSON Schemas (ODCS, Ossie, the workbench extensions) | Edits to upstream schemas |
| `public/examples/` | Shipped example projects; each ships governed metrics in its semantic model, bindings in a mapping root and a data contract. Files from upstream standards stay byte-identical; every file added only to carry metrics, bindings or a contract (not just those next to upstream files) starts with `# Workbench addition` | Test fixtures, edits to upstream files |
| `tests/` | Unit and handler tests (`bun test`), always on temporary data roots; `tests/helpers/mock-oidc.ts` is a loopback OpenID provider with Entra, Keycloak and generic claim shapes, an optional Entra endpoint layout that drives the MSAL path (`tests/helpers/entra-provider.ts` starts it for tests), and a Microsoft Graph stand-in; `tests/fixtures/auth-workspace/` is the access test workspace and `tests/helpers/auth-identities.ts` its people and groups | Calls to a real identity provider |
| `scripts/` | Browser checks (Playwright against an isolated API), the mutation suite, example generators, `dev.ts` | |

The mapping page owns its concept-list scroll. When no bindings exist, it summarises unbound
concepts until a search requests individual ones. Source actions carry the selected mapping
document ID into `WorkspaceCanvas`, which resolves it before opening the shared Source tab.
Dataset quality uses the same Source navigation. Graph labels are placed only inside the
card-layout bounds; labels without room remain available on hover. The compact wizard stepper
shows the count once and names the step in its menu.

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

A project can also live in one folder of a team repository that is checked out only there. The
registry records it like any subfolder project (`folder` inside `repo`), and the repository is a
partial clone with a cone-mode sparse checkout, so only that folder, plus the files at the root
and directly inside its parents, reach the disk. `sparse-folder.ts` runs the sparse steps and
`scm.ts` keeps staging and commits inside the folder, refuses a branch without it and downloads
the contents a judged pull will read, with the person's credential, before reading them. In server
mode each working copy is made without a checkout and limited to the same folder through its own
configuration (`extensions.worktreeConfig`). Moving an existing project into a folder
(`project-folder.ts`) renames its files and swaps the registry in one journal operation, then
commits the move; confirming again finishes a move that stopped before its commit. Authorized
server requests receive a bad-request response explaining that they must clone the folder instead;
unreadable projects retain the concealed not-found response.

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
- Files from an upstream standard example are never edited. Metrics for such an example live in
  extra files labelled as workbench additions (for Flights: its own semantic model, mapping and
  contract), and `scripts/example-metric-checks.ts` fails when an upstream hash changes.
- Local mode never asks for, stores or sends credentials; Git's helpers and SSH handle them.
  Server mode passes each person's own token to one Git command through `sw-askpass` and that
  command's environment, never through `.git/config` or files, and keeps it only in the
  encrypted session. Hosts are checked when an address is stored and before every command, and
  redirects are not followed, but the last guard is `sw-askpass` itself: it answers only a
  prompt naming exactly the credential's host, so a token never reaches another host.

## Cross-cutting concerns

The metric wizard overrides the item drawer placement through its existing shared dialog class: it
keeps content height and viewport centering. ScrollStrip hides partial tab labels while preserving
the controls in the focus order and retaining the space and cues needed to scroll to them.

`scripts/helpers/strip-geometry.ts` measures shared strip cues and clipping independently of tours.
`scripts/helpers/admin-page-geometry.ts` checks whole Admin tables, visible scroll affordances,
built-in role headings, action prerequisites and the shared navigation strip. Admin content owns vertical scrolling;
its direct children retain their natural height. The shared strip also hides clipped Admin links.

Graph attribution uses the shared small-text and muted tokens and participates in the ordinary
interface legibility checks.

The sidebar tree snaps rows flush to its border and uses a scrollbar instead of text fades.
At short heights, its footer pairs Examples and Import in the existing action grid.

The metrics split view retains Unit and hides Type first when space is tight. Phone cards use
inline labels for values and let type/status chips explain themselves. Source Control keeps a
page margin and places its visibly labelled commit counts below branch actions. The current
branch holder wraps below the branch selector instead of being cut inside its selected option.

Neighborhood action buttons retain 24 px screen targets and 12 px icons at fitted zoom.
Zoom compensation runs before paint; unreadable metric badges stay hidden in compact cards.
Mapping graph footers distinguish reachable assets from the total graph inventory.

Neighborhood relationship labels use the same discrete zoom compensation as card names.
`RelationshipEdge` uses React Flow's `EdgeLabelRenderer` above the paths and scales each label
with its opaque background; `placeLabels`
reserves those scaled bounds before painting. The graph browser matrix measures canvas and label screen
transforms, label size, and clearance from cards and other labels. Admin geometry also checks
empty grants, session guidance, remote-host policy values, and scope-specific preview actions.

Displaced relationship labels have solid leaders to the nearest point on their route.
Labels that would cross the canvas boundary stay hidden until panning brings them fully inside.
The shared label layer stays above every relationship path.

At zoom below 1, Neighborhood shows readable relationship labels on hover or selection.
View options explains that all labels appear after zooming in; dense overviews avoid detached
labels around the cards. The all-label browser view uses detail zoom explicitly.

The whole-model graph reserves two compensated heading lines above entity cards. Names grow
to preserve a full 12 px floor in compact views; default edges keep their screen width and at
least 3:1 painted contrast against the canvas. Focus still dims unrelated edges.
The whole-model graph keeps its 12 px detail lines only at zoom 1 or higher. Small header counts and badges
share that threshold; names use the existing zoom compensation. The browser measures detail
font size multiplied by the actual viewport scale, and a targeted mutant guards the cutoff.

Delete confirmation separates the project/history scope from its counted list of files.
Mapping empty states name the source-file bindings needed before query preview can run. The
phone layer summary uses two columns so concepts remain in the first view. Import guidance names
definitions rather than assuming an ontology, and folder help explains the server restriction
before submission.

`ScrollStrip` reserves cue margins before revealing the selected tab and repeats that reveal
when its contents or size change. Native dialogs are excluded from ODCS content-width caps;
the shared dialog geometry check verifies viewport centring. Relationships shares the other
ODCS sections’ readable width.
Catalog title tooltips and current-step fills are checked by the edit tour at all four sizes.
`helpers/all-tours.ts` keeps the normal browser tours and the complete capture screen list together.
Local capture explicitly loads mapped commerce for its real mapping document.
Capture-only coverage reuses Admin navigation and adds real mapping and full-screen graph views;
it does not duplicate the responsive suite’s Admin matrix. The in-process last-Admin browser
fixture loads the shipped brand just like server startup and asserts its manifest response.

- **Text size and colour**: `src/style.css` defines `--text-small` (12 px, the smallest text the
  interface shows) and `--text-muted` (the softest text colour, at least 4.5:1 contrast on white).
  Stylesheets use the two variables instead of literal small sizes or pale greys. The responsive
  suite fails when any screen of its tour shows text under 12 px.
- **Colour**: `src/theme.css` holds every colour of the interface as a semantic custom property
  (`--color-surface`, `--color-accent`, `--color-edge-feeds` and so on). Stylesheets and
  components refer to the names and hold no colour literal. `scripts/theme-codemod.ts` moves
  literals into tokens; `scripts/helpers/color-literals.ts` finds literals and is shared with the
  codemod and with `scripts/check-theme.ts`, which `bun run check` runs and which fails for any
  literal outside `src/theme.css` and `src/theme-palette.ts` (the group colours data picks at run
  time). The sign-in pages of `server/routes/auth-stylesheet.ts` are served the same tokens.
  Dark is a second value set of the same tokens (`:root[data-theme='dark']` and the system
  `prefers-color-scheme` block). `src/theme-preference.ts` reads and stores the choice,
  `src/app/ThemeControl.tsx` is the control in the sidebar footer, and `public/theme-init.js`
  applies the stored choice before the first paint.
- **Brand**: the product name, the logo, the favicon and the accent come from one bundle. The
  browser asks for `/brand/brand.json`, `/brand/logo.svg`, `/brand/logo-mark.svg`,
  `/brand/favicon.svg` and `/brand/brand.css`; `index.html` links the favicon and, last in the
  body, `brand.css` so its token overrides come after the theme stylesheet. The server answers
  `/brand/*` from the bundle `server/brand/bundle.ts` loaded at start: the shipped files in
  `public/brand/` with any file of `SW_BRAND_DIR` laid over them. Only the five known names are
  read, each is capped (256 KiB for images, 64 KiB for `brand.json` and `brand.css`), SVG is rebuilt
  from an allow-list of drawing elements, CSS keeps only custom properties under the theme
  selectors, and a symlink out of the folder is refused. A file that fails is logged by name and
  the default stays. Every response carries `nosniff` and a policy by file type
  (`default-src 'none'; style-src 'unsafe-inline'; sandbox` for SVG, `default-src 'none'; sandbox`
  for the JSON and CSS). In the Vite development server the same files come from `public/brand/`;
  `SW_BRAND_DIR` applies to the Bun server only. The server-side sign-in pages read the active
  bundle for their title and mark. The committer identity of server commits is a technical
  identity and does not follow the brand; `SW_COMMITTER_NAME` changes it. `scripts/check-brand.ts`
  lists the few places allowed to name the product.
- **Configuration**: start-up uses `readConfig()` in `server/config.ts` once for mode, host,
  port, data root, cache root and build identity. Every server-mode variable is listed once, with its default and what start-up checks, in `specs/003-authn-authz/contracts/configuration.md`. Server mode requires issuer discovery and
  a valid administration policy set before serving workspace traffic. The writable-root probe precedes lock acquisition; recovery,
  migration, scanning and access middleware initialization happen only after ownership.
  `openWorkspace({ root, cacheDir })` accepts explicit paths for isolated tests.
- **Authentication**: server requests follow cookie → session → principal → grants → boundary.
  `createSignInProvider` picks the sign-in library once at start-up. `authentication.ts` imports
  neither library: it sees the provider interface and `SignInError`, whose `providerCode` each
  provider fills from its own errors, so both libraries share the attempt cookie, sessions,
  claim mapping, directory lookups, front-channel logout and audit. With Entra, MSAL's token cache of a session travels in
  `SessionTokens.tokenCache` and is encrypted with the rest of the session record.
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
- **Logging and telemetry**: all operational output goes through `observability/log.ts`; no
  other server module writes to the console (the audit log's own mirror and failure line, which
  are a security record, and `sw-askpass` are the exceptions). `createAccessMiddleware` wraps each
  request with `observeRequest`, which gives it an id (the `X-Request-Id` header), a server span, a
  duration metric and one `http.request` line naming the route template from the route inventory.
  Application code depends only on `@opentelemetry/api`, which does nothing until a provider is
  registered. `telemetry.ts` registers one only in server mode with a valid connection string, by
  importing `pipeline.ts` and `azure-backends.ts` on demand, so a server with telemetry off never
  loads the SDK (a test walks the static imports of `server/index.ts` and runs a subprocess to
  prove it). A person appears in logs and telemetry only as the HMAC pseudonym from
  `request-context.ts`. Browser reports arrive at `routes/browser-reports.ts`, are checked against the
  schema in `src/observability/browser-report.ts` and become the same metrics and log lines; the
  route answers 404 unless telemetry is on, and `/api/me` tells the page whether to send.
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
  `PathError`, `InputError`, `SignInError`); `server/routes/http.ts` maps them to status codes in one place, including the safe sign-in page and attempt-cookie clearing. A `BadRequestError` is the caller's mistake and answers 400 with its message; in server mode any other error answers 500 `Internal error.` and is logged, redacted, with the request id. The handler passes that mapping into the access middleware, so `server/auth/` never imports `server/routes/`.
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
| The folder a project lives in | `src/scm/repository-folder.ts` (the path check, shared with the server), `server/projects/sparse-folder.ts` (the Git steps), `project-folder.ts` (moving an existing project) |
| How a file kind is parsed or validated | `src/model.ts`, `src/validation.ts`, `schemas/` |
| The product name, logo, favicon or brand colours | the files in `public/brand/` for the default; an operator's `SW_BRAND_DIR` folder for a deployment (see White-labelling in the README) |
| A colour | `src/theme.css` (a token, with its light and its dark value); a colour data picks at run time goes in `src/theme-palette.ts` |
| A view | the folder named after it in `src/` (`odcs/`, `metrics/`, `mappings/`, `graph/`) |
| A dialog | the module it belongs to; shared chrome is `src/projects/Modal.tsx`: two widths (`narrow` 480 px, `wide` 880 px), one padding, a footer with the dismissing button before the main action (Cancel, Close or Done, as the comment in `Modal.tsx` defines) and a `footerNote` that says why the main action is off. A panel with nothing to show uses `src/projects/EmptyState.tsx`. The stale-save and import-repair dialogs (`StaleSave.tsx`, `ValidationPanel.tsx`) still draw their own `<dialog>` and are not yet on this standard. A dialog opened from another dialog hides its parent's panel (`.workbench-dialog:has(dialog[open])` in `src/style.css`) so only one layer shows |

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

The header composes `src/auth/PersonMenu.tsx` and the Admin launcher through `WorkspaceHeader`'s optional account slot. `WorkspaceHeader` groups its controls as file actions, save state with Commit, and account; `src/app/WorkspaceHeader.css` owns the header layout, including the two-row phone layout, and sets one control height for all of them. `scripts/helpers/header.ts` (`headerProblems`) measures that layout in the browser suites, in local and server mode. `src/ScrollStrip.tsx` is the one scrolling strip (view tabs, graph toolbars, Admin sections): it reveals the selected item and draws a chevron cue beside each edge that has more items, anchored to the strip with CSS anchor positioning so a cue never covers an item; `src/app/WorkspaceSidebar.css` owns the tree's scroll cues and the footer buttons; `--content-max-width` in `src/style.css` is the one width of text pages on wide windows. The sidebar's Examples button is `src/app/ExampleMenu.tsx`, a `MenuButton` from `src/projects/Menu.tsx` that opens upward (`placement="above"`), so its keyboard behaviour is the shared menu's. Every menu (header New, person, Examples, the project and file row menus, Admin tables) is that one `MenuButton`: it draws its popup in the window (a portal to `document.body`, or to the open dialog that holds the button), with `position: fixed`, one opaque surface and a z-index above the tree, canvas and drawer, so no scrolling or masked list clips it. `src/projects/menu-position.ts` decides the side (it flips up or down when there is no room) and keeps the menu inside the window.
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
and narrows it to each connected principal's view. An Editor's count is computed over their own
copy's files where they have one (`personalIndex()` in `workspace.ts`), so unpublished work
suggests groupings to its author only. A failure for one person is logged and does
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

### Working copies in server mode

A person who may edit a project works in their own `git worktree` of its repository,
`worktrees/<userKey>/<repo>/`, on `work/<handle>`. `server/projects/working-copies.ts` decides the
place of each request: `readPlace()` returns the person's copy when it exists and they may still
change the project, otherwise the published state (`projects/<repo>/`, detached at the default
branch); `writePlace()` sends every change a person makes to their copy, whichever role allowed
it, creating the copy on first use after the route has authorized every target. Reads, including
Source Control reads, never create a copy. `copyLayout()` in `paths.ts` maps a
copy to a `DataLayout` whose `projects` folder is the person's, so every path helper, the scanner,
Source Control and trash work unchanged inside it. Local mode and Viewers always get the published
place, so local behaviour is the v0.3.0 behaviour.

The cache keys files and findings by copy, project and path (the published state is copy `''`)
and entities by blob hash and file name, so a file with the same bytes in several copies is
parsed once. Each active copy has its own watcher, released after 30 minutes without use
(`IDLE_RELEASE_MS` in `working-copies.ts`); its files, index rows and drafts stay. Events about a
copy carry the `copy` tag and reach only its owner's streams. Trash entries from a copy record it:
`readableTrash()` shows them to their owner alone, and a restore goes back into that copy.

`server/projects/worktrees.ts` runs the Git side. The Git queue keys a copy on its base
repository, so all copies of one repository are serialized. Publishing refuses a changed
published checkout, checks that the copy contains the default branch tip, moves the branch with
`git update-ref <ref> <new> <old>` (a compare-and-swap) and force-moves the published checkout;
anything else is `NotFastForwardError` (409). `server/projects/publishing.ts` then rescans the
published state and emits `published`. When the workspace opens, `repairBase()` finishes a
publish that stopped between the two moves, and a failed checkout runs it at once. A fetch in a
copy moves the default branch forward through the same `moveDefault()` when the remote is
ahead, only for someone `mayPublish()` (in `git-access.ts`) allows and with the same
`judgePublish()` guard check as a publish; otherwise the fetch reports `follow.followed: false`
with the reason. Push <default> sends the default branch with the person's credential, needs
`publish` and runs on the published place, so it never creates a copy.
The worktree list is cached per repository until a copy is created or removed, switches
branch, or the default branch moves; a project listing reads the default branch once per
repository. An Admin's manifest goes through `writePlace()` like any change: it is written and
committed in their copy, then published; a copy in the middle of a merge refuses it before the
registry changes. Pull from the default branch is `scm.pullDefault()`,
the same blocker, conflict and rewritten-bytes handling as a pull around `mergeDefault()`.
Publishing never pushes: it moves the local default branch, and Push stays a separate action.
Remote commands run in the person's copy with their credential; a guarded pull fetches with it,
judges the fetched commit and merges that commit locally (`guardedPull()` in `scm.ts`). Pull from
the default branch never reaches a remote.
Publish and Pull from the default branch run the content guards on the exact commits they move
or merge (`changesBetween()` and `guardMerge()` in `scm.ts`). `writePlace()` takes a precheck
that judges a first write against the published state before the copy is created, so a refused
write leaves no copy.
Branch holders come from `git worktree list --porcelain` joined with the users registry; the
default branch is held by the published state. A `work/<handle>` branch is personal: `scm.ts` lists
and accepts only the caller's own, so another person's is neither offered nor switchable, whether
or not a copy holds it, while any other branch held by a copy is listed with its holder. Commits pass the person
as author through `authorship()` in `git.ts`: the service is the committer and a
`Signed-in-user` trailer names the person. Deleting a repository's project archives each
person's unpublished work into the trash entry as a binary patch before the copies are removed.
Deleting a subproject (`CopyRemoval` in `trash.ts` names its folder) archives a patch limited to
that folder and removes the folder from every copy, leaving the rest of each copy alone.

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
(`setRemote`). Publishing needs `publish` on the default branch for the same projects, and
in server mode checking out a protected branch needs it too, because a copy that holds a branch
changes it by committing. A target denial returns
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

The page is reached through the URL hash (`#/admin/<section>`), read with `useSyncExternalStore`
so Back, Forward and reload follow it; the app has no other router. `AdminHost` wraps the
workspace in `main.tsx`: a person without the `admin` capability stays on the workspace whatever
the hash says.

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

`createBearerValidator` in `auth/bearer.ts` is built by the sign-in provider (`auth/msal-provider.ts`
for Entra, `auth/oidc.ts` otherwise) from the discovered
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

The model graph initially uses Layered layout and retains ELK route vertices while they match live
handles. Moving a card falls back to live routing. Fully collapsed areas are packed compactly rather
than stretched into a layered chain. Neighborhood row spacing includes full-detail card height.

The release screenshot manifest in `specs/004-ui-polish/screenshots/after/manifest.json` records
the capture commit, original dimensions and source/output hashes. Conversion preserves the native
viewport without cropping or resizing. Capture runs freeze source and builds because schema
generation causes Vite reloads. The standalone large-graph and UBL browser checks supplement the
29 canonical suites in `scripts/gate-suites.ts`; they use the same isolated API boundary.

Resize observers in the shared strip and whole-model graph queue layout-changing publication
for the next animation frame. The graph commits pane state synchronously inside that frame, so
React cannot defer it into a later observer delivery. Pending frames are cancelled on cleanup;
unchanged pane sizes preserve state identity. This avoids changing an ancestor during the
browser's resize delivery. Other size hooks retain their existing measurement behavior.
Both release capture tools reject uncaught browser errors as well as geometry problems.

The authorization read-route matrix distinguishes access decisions from supported operations.
An allowed server folder preview must return its exact clone-instead refusal; denied targets
retain their authorization status. Both paths still pass through hidden-content response scanning.

The public GET/HEAD brand inventory entry precedes the protected workspace-page entry. It
terminates through `server/brand/route.ts`, whose filename allowlist, sanitization, MIME and
strict content policy remain authoritative. The outer server boundary preserves that policy.
`scripts/helpers/auth-page-geometry.ts` owns settled-content, decoded-brand and bounded-header
assertions for authentication captures. The shared header reserves title width while its action
group yields room for long refusal messages.

Account/connection dialog screenshots delegate to the shared authentication capture helper;
separate drivers must not bypass theme, settled-content, geometry or browser-error assertions.

The release audit combines 864 workspace-tour images with 168 authentication images across both
themes. Eighteen independent reports account for all 1,032 originals. Authentication screenshots
share the same capture contract, including remote dialogs. Header geometry excludes top-layer
native-dialog descendants while whole-page layout assertions retain their control bounds.
