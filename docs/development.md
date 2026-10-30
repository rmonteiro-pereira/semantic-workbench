# Development and verification

Use Bun for the API, scripts, installation and tests. Use Node 24.11+ on PATH for isolated Vite
launches in the complete gate. The runtime/build dependencies and pinned observer patch are
listed in [the README stack](../README.md#technology-stack).

All commands below run from the repository root. Tests must use temporary workspaces, loopback
identity fixtures and local remotes, never a person's real `data/` or a real Azure/Entra tenant.

## Install and run

```sh
bun install --frozen-lockfile
bun run dev
```

The dev launcher waits for the API on port 4310 before starting Vite on 5173. It owns both child
processes and shuts them down together. For a browser-only frontend on a separate port, use a
second terminal:

```sh
bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5180
```

Before running browser-backed tests, install Chromium:

```sh
bun x playwright install chromium
```

Linux environments may also need Playwright's system dependencies:

```sh
bun x playwright install --with-deps chromium
```

Then point workspace suites at the frontend:

```sh
SW_BASE_URL=http://127.0.0.1:5180 bun run test:projects
```

PowerShell:

```powershell
$env:SW_BASE_URL = "http://127.0.0.1:5180"
bun run test:projects
```

`SW_BASE_URL` defaults to `http://127.0.0.1:5173`; `UI_URL` is a legacy fallback. Browser drivers
route API requests to their temporary fixtures. They must not point a mutation or write scenario
at an unisolated production workspace.

## Fast checks

```sh
bun run fmt
bun run check
bun test
bun run build
```

- `fmt` runs Oxfmt on source, scripts, tests and generated validators. Markdown, fixtures and
  other excluded trees are not reformatted by that command.
- `check` runs TypeScript with no emit, formatting checks, Oxlint and comment/theme/brand checks.
- `tests/action-recorder.test.ts` and `tests/action-history.test.ts` cover the Back and Forward
  history without a browser; `test:back-history` covers it in Chromium.
- `test` includes logic, handler, integration and some Chromium-backed component checks. It is
  not exclusively a browser-free unit command.
- `build` runs `schemas:compile` and then the production browser build. The Bun server runs
  TypeScript directly; this is not a separate compiled backend output.

Generated standalone schema validators are checked in and formatted with the project rules.
Regenerate with `bun run schemas:compile`; tests verify reproducible output. The browser uses these
validators without eval under the CSP. Do not edit pinned upstream schemas to make a fixture pass.

## Complete quality gate

```sh
bun run ci:validate
```

This needs Chromium, Node 24.11+, Git, Docker or Podman, and image-scanning support. A missing
container runtime fails its stage rather than silently skipping it. The gate can take more than
an hour; keep the tree unchanged while it runs.

| Step | Work |
| --- | --- |
| `verify` | Static checks, the complete Bun test suite and production build |
| `mutation` | Focused faults and browser mutants against temporary copies/pages |
| `browser` | Canonical suites, each with an isolated frontend/API arrangement |
| `image` | Image build, vulnerability/secret scan and SPDX bill of materials |
| `container` | Built-frontend browser checks plus image API/persistence checks |
| `pipeline` | Offline schema/rules lint and PR/main/tag pipeline expansion |

Target only the necessary stages during development:

```sh
bun run ci:validate -- --step verify --step pipeline
bun run ci:validate -- --step browser --suite test:projects
```

`--step` is repeatable; `--suite` chooses a browser script, and `--keep-going` continues after a
failed step. Results are written as JUnit XML and `out/ci/summary.json`. Failures name their stage
and exit nonzero. Browser screenshots are collected per suite when supported.

`SW_CONTAINER_PORT` selects the container-check base port; its successor must also be free:

```sh
SW_CONTAINER_PORT=4315 bun run ci:validate
```

It configures validation containers, not the application's `SW_PORT` default. An explicit
`test:container --port` takes precedence. Avoid an owner's running dev ports.

The gate's Entra-shaped mock is local. Its passing result does not prove real tenant consent,
conditional access, Graph permissions, Azure DevOps identity attribution or cloud rollback.
Those belong to [operator acceptance](../deploy/trial-runbook.md).

## Browser suites

The canonical inventory is `scripts/gate-suites.ts`. `test:auth`, `test:two-editors`, `test:admin`
and `test:brand` build/serve their own frontend instead of requiring a running Vite. Other workspace
suites use `SW_BASE_URL`. The full runner supplies fresh frontend processes as needed.

| Script | Main coverage |
| --- | --- |
| `test:ui` | Imports, downloads, exports, model counts and complete UI workflows |
| `test:responsive` | Viewport/theme tours, geometry, text, focus and raw resize errors |
| `test:edges` | Rendered edge endpoints during movement and zoom |
| `test:grouping-validation` | Grouping transitions, attachment, provenance and repair |
| `test:overview-areas` | Group menu only in Graph, Overview grouping note, cards packed into columns and capped at eight with Show all, Catalog area filter ending on leaving Catalog or changing file |
| `test:examples:ui` | Example loading, mappings and governed metric presentation |
| `test:projects` | Project tree, external changes, stale saves, cache rebuild and export |
| `test:trash` | Delete warnings, Undo, restore, suggestions, row actions and Clear |
| `test:sidebar` | Sidebar footer visibility and project list fill at short heights, resize and delete |
| `test:metrics` | Metric list, definitions, explanations and graph navigation |
| `test:graph` | Whole graph, neighborhood walk, expansion, scale and response budget |
| `test:editor` | Serialization colors, located findings, byte preservation and typing |
| `test:item-edit` | Forms, new items, rename/delete and metric wizard |
| `test:rdf-edit` | Resource-local RDF edits, graph difference and refusal behavior |
| `test:validation` | Bundled files report nothing, shapes run against a data file, an unknown Ossie version is not validated |
| `test:scm` | Stage/commit, branches, conflicts, local remotes and history |
| `test:odcs` | Contract/table sections and byte-preserving property edits |
| `test:lineage` | Expected dependency edges, row handles, paths, hops and resizing |
| `test:autosave` | Valid saves, invalid drafts, conflicts and commit behavior |
| `test:sql` | Embedded SQL coloring, warning locations and unchanged bytes |
| `test:git-setup` | Identity, remotes, sparse folders, clone and credential guidance |
| `test:monorepo` | Shared repository registration, workspace removal and folder deletion |
| `test:dialogs` | Fit, keyboard focus and return across six viewport sizes |
| `test:telemetry` | Bounded error/timing reports, redaction and export-off behavior |
| `test:terminology` | Metric/table naming across the interface and current guides |
| `test:mappings-layout` | Binding presentation, geometry and selected-document Source |
| `test:clipping` | Nothing cut on Mappings, header and entity details at 1280 and 390 px; Commit tooltip; no sideways scroll in details (Admin: `tests/admin-clipping.test.tsx`) |
| `test:mapping-graph` | Every displayed mapping line against resolver evidence |
| `test:back-history` | Back and Forward undo and redo every click action, in the app and the browser |
| `test:theme` | Theme choice, token propagation, contrast and viewport tours |
| `test:auth` | Entra-shaped mock, sessions, grants, agents and content guards |
| `test:two-editors` | Personal worktrees, authorship, isolation and publication |
| `test:admin` | Reviewed access changes, policies, audit, routing and geometry |
| `test:brand` | Built-server brand assets, sanitization, naming and color overrides |

The usual capture matrix is 390×844, 1280×720, 1440×900 and 2560×1440. Some layout suites add
1366×768 and 1024×768. Geometry checks retain their own explicit limits; a passing screenshot
capture is not a reason to weaken them.

Additional checks:

- `bun run test:examples` validates shipped files, upstream hashes, contract lineage and synthetic
  query verification. It is not another browser-suite inventory entry.
- `bun scripts/large-graph-browser-check.ts` checks the large graph; `EXPAND_ALL=1` exercises every
  area. `bun scripts/ubl-browser-check.ts` adds UBL serialization/navigation coverage.
- `bun run test:auth:keycloak` starts a digest-pinned Keycloak 26.4 fixture through Docker/Podman.
  It is optional compatibility coverage, outside the normal gate and delivery pipeline.
- Older exploratory browser scripts can contain stale selectors; use package scripts and the
  canonical inventory rather than assuming every file in `scripts/` is a current gate.

## Focused component checks

The administration harness uses canned API-shaped responses rather than reimplementing policy.
Client/presentation checks are separate from Chromium-backed dialog/geometry checks:

```sh
bun test tests/admin-client.test.ts tests/admin-presentation.test.tsx
bun test tests/admin-dialogs.test.tsx
SW_SCREENSHOT_DIR=/tmp/admin-shots bun test tests/admin-geometry.test.tsx
```

Use a genuinely invalid draft for tests that require text to remain unsaved; a valid comment can
autosave before another action occurs. Assert the draft and unchanged disk version before a
loss-warning scenario. Await actual example-load completion before choosing a tab, rather than
racing the loader's own initial-document selection.

## Mutation and rendering safeguards

```sh
bun run test:mutation
```

The runner mutates temporary source copies and browser pages. Unmodified baselines must pass;
each targeted fault must be caught. Coverage includes parsing, file/journal behavior, Git safety,
exports, access/governance, authentication, working copies, Admin review, examples, theming,
branding, deployment decisions and observability.

Do not remove a failed assertion, increase its budget or exclude an error to make a release pass.
Use a targeted reproducer, preserve failure evidence and rerun on the corrected frozen state.
Important current limits include 30 ms mean editor keystroke time, 500 ms finding latency and
100 ms graph main-thread tasks in their defined scenarios.

Graph, lineage, grouping and responsive checks record raw resize-loop events as well as relevant
console/page errors. All responsive page creation paths must register the same collector. The
React Flow dependency patch delays observer-driven updates without cancelling their error events.
Its behavior tests cover node batches, latest measurements, pane sizing and cleanup after refs
are cleared. A dependency upgrade must preserve those guarantees or replace the patch with a
verified upstream fix.

## Visual capture

With a frontend on port 5180:

```sh
SW_BASE_URL=http://127.0.0.1:5180 bun run polish:capture /tmp/local-shots
SW_BASE_URL=http://127.0.0.1:5180 SW_THEME=dark bun run polish:capture /tmp/local-dark-shots
```

Server captures build/use their own isolated API and loopback mock provider:

```sh
bun run build
bun run polish:capture:server /tmp/server-shots
SW_THEME=dark bun run polish:capture:server /tmp/server-dark-shots
```

`SW_ONLY` is a screen-name substring filter, not a regular expression. Filtering to a screen not
in that tool's inventory produces no evidence for that screen. The server tool defaults to the
fixture administrator; its optional final username selects another fixture identity. Administrator
captures reject skipped screens. Both tools reject uncaught errors and measured geometry failures.

`SW_SCREENSHOT_DIR` selects output for supporting suites. Older drivers retain their documented
`/tmp/workbench-*.png` locations. Capture collection must check timestamps so an old successful
image is not mistaken for evidence from a newer failed run.

Keep source, formatting and builds frozen throughout capture; schema generation can reload Vite.
Review native-resolution images. Saved release manifests retain dimensions and source/output
hashes; image conversion must not silently crop or resize the viewport.

## Mock identity provider

```sh
bun run mock-oidc -- --port 8081 --shape entra --layout entra
```

The fixture prints its issuer and Graph stand-in. The development client is
`semantic-workbench` with secret `semantic-workbench-test-secret`. Redirect defaults are for
loopback port 4310; `--redirect` and `--post-logout` select other addresses. These are test
credentials, not a production template.

Fixture identities exercise Editors, Steward, Viewer, Admin, no-grant and unverified guests,
custom roles and directory group overage. See `tests/helpers/auth-identities.ts` and
`tests/fixtures/auth-workspace/README.md` for the current set. The same MSAL/provider abstraction
is exercised by mock Entra tests; no real identity service is contacted.

## Images and offline pipeline checks

```sh
bun run image:build
bun run image:scan
bun run image:sbom
bun run test:container -- --image semantic-workbench:dev
bun run pipeline:lint
bun run pipeline:dry-run -- --run pr
bun run pipeline:dry-run -- --run main
bun run pipeline:dry-run -- --run tag:v0.5.1
```

Image build chooses an installed engine and tags a commit build plus `dev`; explicit engine/tag
options are available. Dirty source gets a dirty revision and is refused by publication commands.
Scanning writes JSON/SARIF; the SPDX bill of materials is under `out/image/`. A fixed HIGH/CRITICAL
finding fails the gate. Exceptions require a real reason and an unexpired UTC date.

Container checks use temporary bind mounts, host networking and a non-root runtime. Workspace
browser suites exercise the built frontend with their disposable API fixtures; separate image
checks verify actual startup, readiness, persistence, ownership and server-mode authentication.
Select a local/server group or one supported script with `--suite`, and free base ports with
`--port`. Every successful or failed run should clean up its own containers and temporary roots.

Pipeline lint and normal dry-run are offline validation. A printed Azure command is a plan, not a
real deployment. `pipeline:dry-run --execute` can execute local gate steps and fake Azure scenarios;
it is not equivalent to the read-only plan. Real image publication and deployment/rollback belong
to [the target runbook](../deploy/README.md), with its explicit credentials and approvals.

## Example generation

```sh
bun run examples:generate
bun run test:examples
```

`examples:generate` regenerates billing and shopping-center artifacts, not every example set.
Other generators are explicit:

```sh
bun scripts/commerce-example.ts
python3 scripts/extract-ubl.py
bun scripts/ubl-example.ts
```

UBL extraction uses Python's standard library and fetches published upstream schemas; regeneration
is an intentional network action, not normal application startup. Preserve upstream licenses,
provenance and hashes. Do not hand-edit a generated file without updating its owning generator.

## Dependencies worth knowing

`shacl-engine` runs SHACL shapes, SPARQL constraints included. It is the maintained JavaScript SHACL
engine that supports SPARQL constraints, and it runs in the browser with no network. It loads only
when a user runs a shapes check, inside a worker (`src/app/validation/shacl.worker.ts`) that the app
stops after 30 seconds. In `bun run build` its own chunk is about 54 kB, its SPARQL runtime chunk
about 1.2 MB and the worker wrapper about 284 kB; none of them is part of the main bundle.
A test in `tests/validation-honesty.test.ts` checks that a `SERVICE` clause makes no network request.

## Contribution rules

- Read [architecture](../ARCHITECTURE.md), the owning module and neighboring tests first.
- Extend existing domain modules and shared controls rather than adding parallel configuration,
  routing, authorization or dialog implementations.
- Run the configured formatter on changed code; it wraps at 200 columns. Keep one statement and
  declaration per line, descriptive names and small functions/components. Avoid nested ternaries and long JSX handlers.
- Explain why in plain-English comments. Keep task identifiers and process history out of code;
  traceability belongs in commits and review descriptions.
- Update current configuration, usage and architecture references with the behavior they describe.
  Keep historical verification evidence under `specs/` rather than appending it to onboarding docs.
- `no-nested-ternary` is an error in `bun run lint`, so `check` fails on a ternary inside a ternary.
  Run `bun run lint:full` for the remaining readability warnings. The ordinary `check` remains the
  required static gate. `.git-blame-ignore-revs` identifies mechanical formatting commits; run
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` once per clone so `git blame` skips them.

For API work, maintain the action inventory and relevant HTTP/configuration contracts. The actual
handlers, schemas and tests remain authoritative when an older design contract describes an
unimplemented or superseded detail.
