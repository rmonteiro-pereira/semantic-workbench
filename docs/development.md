# Development and verification

Use Bun for the API, scripts, installation and tests. Use Node 24.11+ on PATH for isolated Vite
launches in the complete gate. The runtime/build dependencies and pinned observer patch are
listed in [the README stack](../README.md#technology-stack).

All commands below run from the repository root. Tests must use temporary workspaces, loopback
identity fixtures and local remotes, never a person's real `data/` or a real Azure/Entra tenant.
Set `TMPDIR` to an existing isolated directory when all test scratch files must share one root.
Git fixture subprocesses pass their isolated environment explicitly; Bun's default synchronous spawn
environment does not include variables changed after startup.

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
The mapping graph check reloads the restored mapping and verifies that the injected resolver
finding clears before testing navigation.

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

## The tessera command

`bun run tessera compile` and `bun run tessera check` compile a project folder of a Git repository
to standard Ossie; see the [README](../README.md#tessera-an-authoring-format-that-compiles-to-standard-ossie)
for the options and exit statuses (0 success, 1 refused, 2 loss needs acceptance, 64 misuse).

- `bun test tests/tessera/` runs the feature's own tests. The command-line tests start the command as a
  child process against a temporary Git repository built by `tests/helpers/tessera-repository.ts`.
- `bun run test:tessera` is the browser check (`scripts/tessera-browser-check.ts`); it runs on an
  isolated API and never touches the real workspace.
- `bun scripts/derive-tessera-schema.ts` regenerates `schemas/tessera-ontology-1-ossie-0.2.0.dev0.json`
  and `bun scripts/derive-tessera-schema.ts --check` verifies it; run `bun run schemas:compile` after a
  change. The script generates both revision schemas. Add an addition by following the header of
  `src/shared/tessera/registry.ts`.
- `bun test tests/attributes tests/governance` checks attribute editing and the governance rules.
  `bun run test:attributes` exercises the details panels, the revision confirmation and the time
  to open the details of a concept in a 200-concept document.
- `bun scripts/mutation-tests.ts --attributes` checks the targeted faults for the revision additions.
  The integrated mutation gate runs these cases with the rest of its inventory.
- `bun scripts/item-diff-planner-browser-check.ts` checks metric status labels, geometry and contrast
  in the query composer at phone and desktop widths in both themes, using an isolated API.
- `bun scripts/record-item-diff-baseline.ts` records six rendered workbench structures, with the
  Unpublished work overlay switched off, and the published context, plan and explanation responses,
  against isolated published and unpublished definitions. The browser check compares the same
  overlay-off structures.
  Start an isolated frontend and set `SW_BASE_URL` first. `bun test tests/item-diff/baseline.test.ts`
  compares the consumer responses without a browser.
- `bun scripts/record-standard-baseline.ts` records what the unchanged code does with every example
  and fixture file (`tests/fixtures/tessera/standard-baseline.json`); `tests/tessera/standard-unchanged.test.ts`
  compares against it. Run it only when a change to ordinary Ossie handling is intended.
- Golden compiler output is in `tests/fixtures/tessera/golden/`. After a deliberate change to the
  compiler or its version, regenerate it with `UPDATE_TESSERA_GOLDEN=1 bun test tests/tessera/determinism.test.ts`.
- The mutation gate has a `tessera` category (`scripts/tessera-mutants.ts`, `scripts/tessera-mutation-cases.ts`).
- Scale: `tests/tessera/compile-scale.test.ts` compiles 200 documents and about 20 MB (60 Tessera
  ontologies, 60 standard ontologies, 40 semantic models and 40 data contracts). Measured on the
  shared development server it took 20 s (limit 30 s), and 6 s on a workstation. Validating one
  1,000-concept ontology with the marker took between 1.0 and 1.1 times as long as without it.

## Compile in the browser and over HTTP

The compile routes, the unit source and the browser dialog are described in [compile](compile.md).
`bun run test:compile` covers review, exact acceptance, download, unpublished check and one-file
conversion on desktop and phone widths against an isolated API. It also compares the shared digest
with Bun SHA-256 and browser Web Crypto. Start the frontend on a free test port and set `SW_BASE_URL`;
the check supplies its own temporary backend and cleans it up.


- `bun test tests/compile/ tests/auth/compile-parity.test.ts` runs the feature's own tests. The
  helper `tests/helpers/compile-workspace.ts` builds a published workspace with Tessera and standard
  files, a project that was never published and a folder only some people may read.
- The golden bundle in `tests/fixtures/compile/golden/` is what `bun run tessera compile` writes for that
  workspace. After a deliberate change to the compiler, regenerate it with `UPDATE_GOLDEN=1 bun test tests/compile/golden.test.ts`.
- Scale: `tests/compile/compile-scale.test.ts` publishes 200 documents and about 20 MB (60 Tessera
  ontologies and 140 standard ones), then reads the snapshot, compiles and builds the zip. Measured on the
  shared development server it took 20 s (limit 30 s), and 8 s on a workstation.

## Profiling the React UI

For Azure configuration, enable/disable procedures, viewing signals and costs, see
[observability operations](openwiki/observability-operations.md).

Normal production builds do not enable React profiling. For a temporary diagnostic build:

```powershell
bun run build --mode profile
```

For the container, pass `--build-arg SW_PROFILE_UI=1` to the image build. This is a build-time
choice, not an App Service runtime setting. Rebuild normally to remove profiling overhead.

Record a browser DevTools Performance trace while reproducing the slowdown. The User Timing
track contains `sw.react.<area>.<phase>` for app, sidebar, canvas, details and dialogs. Each span
runs from React's render start to its commit timestamp, including scheduling delays; its detail
contains `actualDurationMs` (CPU time rendering that update) and `baseDurationMs` (React's estimate
without memoization). These are not DOM commit durations or paint timings. Nested areas overlap;
do not sum them with the app total. React DevTools can also profile this production build.

Browsers supporting Event Timing also record `sw.ui.interaction`: event latency through the next
paint, including input delay, event handling and presentation delay. Events shorter than 16 ms
are not observed. These samples are not a calculation of the page's INP score. Neither observer
captures input values, DOM targets, document names or component props.

The latest measurement per area/phase and the latest interaction remain available through
`performance.getEntriesByType('measure')`; the DevTools recording captures the full timeline.
Local measurements work even when server telemetry is off. When the server enables browser
reports through Application Insights, React samples are exported at most once per second per
area/phase within the existing queue and 100-report page-session limit. They appear as
`browser.react-render` logs and `sw.browser.react.render.duration` / `sw.browser.react.base.duration`
histograms; interactions over 200 ms use `browser.slow-operation`. Normal telemetry consent,
same-origin transport and schema validation still apply.

Verify the production build with `SW_EXPECT_UI_PROFILE=1` and `test:telemetry`, pointing
`SW_BASE_URL` at a preview of the profiling build. Omit the flag for a normal production build.

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
| `test:item-diff` | Unpublished comparison, graph marks and branch and publication journeys in an isolated workspace |
| `test:published-snapshot` | Published status, local Publish and Adopt, migration notice, Mappings preview label and published export in both modes |
| `test:overview-areas` | Group menu only in Graph, Overview grouping note, cards packed into columns and capped at eight with Show all, Catalog area filter ending on leaving Catalog or changing file |
| `test:examples:ui` | Example loading, mappings and governed metric presentation |
| `test:projects` | Project tree, external changes, stale saves, cache rebuild and export |
| `test:trash` | Delete warnings, Undo, restore, suggestions, row actions and Clear |
| `test:sidebar` | Sidebar footer visibility and project list fill at short heights, resize and delete |
| `test:metrics` | Metric list, definitions, explanations and graph navigation |
| `test:addresses` | Canonical selection, reload, unchanged source bytes and declared rename with ticked references |
| `test:mcp:browser` | An agent's save through the local endpoint refreshing an open editor, the person's unsaved draft kept, and agent records with their tool in the Admin audit view |
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
| `test:dialogs` | Fit, keyboard focus and return across six viewport sizes. A five-second workspace-readiness failure includes the page state and pending and failed requests. |
| `test:telemetry` | Bounded error/timing reports, redaction and export-off behavior |
| `test:attributes` | Attribute editing, agent context, governance and revision confirmation |
| `test:tessera` | The Tessera format in the browser: format label, finding and fix |
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
SW_SCREENSHOT_DIR=out/admin-shots bun test tests/admin-geometry.test.tsx
```

Use a genuinely invalid draft for tests that require text to remain unsaved; a valid comment can
autosave before another action occurs. Assert the draft and unchanged disk version before a
loss-warning scenario. Await actual example-load completion before choosing a tab, rather than
racing the loader's own initial-document selection.

## Mutation and rendering safeguards

```sh
bun run test:mutation
```

The mutation runner checks that each target still exists before starting. The authorization mutant
removes custom rules from the inputs to policy preparation. The Git push mutation
exercises the remote-effect check alongside the Git dispatch.

Browser mutants require the Vite development server because they intercept source modules.
The runner mutates temporary source copies and browser pages. Unmodified baselines must pass;
each targeted fault must be caught. Coverage includes parsing, file/journal behavior, Git safety,
exports, access/governance, authentication, working copies, Admin review, examples, theming,
branding, deployment decisions and observability.

Shared proposals have their own suite, `bun run test:proposals`, with unit and route tests
(`tests/proposals-*.test.ts`, `tests/work-in-progress-push.test.ts`, `tests/auth/proposal-*.test.ts`),
browser component tests and `scripts/proposals-browser-check.ts`. The `proposals` mutant category
(`scripts/proposals-mutants.ts`) runs under `bun run test:mutation`. The restore-limit case allows ten seconds to
create every filler proposal before asserting the same limit refusal.

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
SW_BASE_URL=http://127.0.0.1:5180 bun run polish:capture out/local-shots
SW_BASE_URL=http://127.0.0.1:5180 SW_THEME=dark bun run polish:capture out/local-dark-shots
```

Server captures build/use their own isolated API and loopback mock provider:

```sh
bun run build
bun run polish:capture:server out/server-shots
SW_THEME=dark bun run polish:capture:server out/server-dark-shots
```

`SW_ONLY` is a screen-name substring filter, not a regular expression. Filtering to a screen not
in that tool's inventory produces no evidence for that screen. The server tool defaults to the
fixture administrator; its optional final username selects another fixture identity. Administrator
captures reject skipped screens. Both tools reject uncaught errors and measured geometry failures.
Server capture preparation adopts its committed contract additions before starting the tour and
opens Mappings in the project that owns the mapping fixture. File actions target the selected
sidebar row so repeated file names in different projects remain unambiguous. The sidebar capture
opens the fixture ontology Overview first so its background does not depend on prior navigation.
The graph capture includes expanded areas, open controls, additional neighbors, hover labels,
zoomed labels and full-screen views.

`SW_SCREENSHOT_DIR` selects screenshot output; the graph, lineage, metrics, item-edit, UI, responsive and edge suites also honor `TMPDIR` when it is unset. Older drivers retain their documented
`workbench-*.png` files in the system temporary directory. Capture collection must check timestamps so an old successful
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

`@modelcontextprotocol/server` 2.4.0 (Apache-2.0) speaks the Model Context Protocol for the local
`POST /api/mcp` endpoint. It needs `@modelcontextprotocol/core` 2.4.0 and `zod`, which Bun installs with it.
Measured on disk: 7.0 MB, 1.4 MB and 8.2 MB. It is server-only and never part of the browser bundle, and it
makes no network request of its own. `@modelcontextprotocol/client` 2.4.0 is a development dependency that the
conformance tests and the acceptance script use as the reference client; it is not shipped.

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

## Agent endpoint

`bun test tests/mcp` runs the endpoint's tests: the tool contract and route inventory comparisons, the request gate, the capability file, protocol conformance for the current and earlier protocol eras, body caps, the read, write, commit and receipt tools, the authorization matrix for every test identity, audit records and the outbound-call check. `bun run test:mcp` is the scripted acceptance run with the reference client; it runs in the verify step after `bun test`. `docs/mcp-acceptance.md` records its result and the client versions. Agent endpoint mutants live in `scripts/mcp-mutants.ts` with their assertions in `scripts/mcp-mutation-cases.ts`.

## Usage counters

`bun test tests/usage/ tests/auth/usage-read-parity.test.ts` covers counting, the store, migration, retention,
the read operation and privacy; `tests/usage-*.test.ts*` and `tests/admin-settings-usage.test.tsx` cover the Traffic
display. `bun run test:usage-traffic` drives the display in a browser against a mocked usage answer. Its
`--record` option rewrites `tests/fixtures/usage/dom-baseline.json`, the structure of every view with
Traffic off. The Traffic switch sits in the closed Show menu and adds no element, so the recorded
structure is the one these views have without the Traffic option; record it again only when a view's
structure changes on purpose. Usage mutants run with
`bun scripts/mutation-tests.ts --only usage`.
`bun scripts/usage-benchmark.ts` measures what counting adds to 5,000 counted requests, with counters off and on.

## Operation boundary

Connection effects narrow allowed decisions; they preserve existence-hiding refusals and the
existing distinction between hidden-trash denials and unaudited missing entries.

`bun scripts/boundary-benchmark.ts` measures 5,000 in-process HTTP requests with isolated temporary data and prints median and 95th-percentile durations.

`bun scripts/dry-run-latency.ts 20` measures the Admin dry-run POST through a loopback socket on
port 5461, using disposable authorization fixture data and a custom-role grant removal. Each
matrix size has one warm-up followed by 20 sequential requests; the JSON output includes median
and p95 wall time through response consumption. The default sizes are 115 cases × 9 principals
(1,035 cells) and twice those cases (2,070 cells). Duplication changes only the script's in-memory
matrix; it does not change the checked-in matrix or expected answers. An optional run count and
case multipliers select shorter probes, for example `bun scripts/dry-run-latency.ts 3 1`.
`--profile` reports time and call count inside Cedar's WASM authorization entry point. For sampled
stacks, use `bun --cpu-prof --cpu-prof-dir=out/dry-run scripts/dry-run-latency.ts --profile 3 1`.
Keep profiling separate from the uninstrumented 20-run latency measurement.

Bun 1.4 measurements compare `84642cb0` with lazy replay indexes at `0236adb6`. Each row uses one
warm-up and 20 sequential POSTs on the named host. Compare results within a host.

| Measurement host | Matrix cells | Before median / p95 (ms) | After median / p95 (ms) |
| ---------------- | -----------: | -----------------------: | ----------------------: |
| Local machine    |        1,035 |      2,466.99 / 3,106.11 |         239.62 / 262.02 |
| Local machine    |        2,070 |      1,976.19 / 2,190.76 |         247.78 / 263.01 |
| Dev server       |        1,035 |      7,028.60 / 7,219.57 |         859.63 / 950.51 |
| Dev server       |        2,070 |      7,010.38 / 7,149.47 |         859.18 / 993.39 |

The instrumented dev-server baseline spent 6,394.51 ms per POST in 4,702 Cedar calls, against a
7,131.65 ms median POST. Repeated decisions dominated: matrix replay and people summaries asked
equivalent action questions, including repeated readability checks. The corresponding optimized
probe spends 706.86 ms in 463 Cedar calls, with an 889.83 ms median POST. The local optimized probe
spends 202.70 ms in those 463 calls, with a 263.05 ms median POST. Instrumented probes use three
requests after warm-up and are separate from the timing table.

Validated policies own role-, principal-type- and resource-type-aware action classes, built on
the first replay. Replay scopes reuse equivalent decisions and their readability checks;
ordinary request scopes retain exact action keys. Prospective project creation has a separate
key because it searches domain scopes. Before/after scopes can be shared only when the relevant
principal, grants, custom roles, project visibility and client entry agree. Deactivated principals
use separate replay scopes because Cedar still evaluates group ancestry. Arbitrary Cedar
admin rules keep separate scopes and exact action classes. Policy preparation is reused only
when the validated roles and admin rules match. Decision results remain confined to a scope,
with refresh invalidation; there is no global request-result cache. Both sides of a comparison
use the same default context, captured once from the active control. The scope factory takes that
control and the proposal. Both sides use independent controls with the project list and context
captured at the start, so a live policy reload cannot change an in-flight replay.

The Admin browser wait is six seconds. The doubled-matrix dev-server p95 is 993.39 ms; the Admin
browser suite at `0236adb6` observed a 4,336 ms peak on the conservative arbitrary-rule path,
leaving about 1.7 seconds for rendering. That suite passed with a five-second wait before the
additional headroom was added. Arbitrary-rule proposals are outside the subsecond grant-removal
measurement above.

Ordinary-path controls alternate the original and optimized sources in three paired rounds:
original/optimized, optimized/original, original/optimized. Each boundary run uses the existing
5,000-request benchmark and its 150 warm-ups. Each listing run uses the existing 30 requests per
path after one warm-up at each project count. Both controls use isolated temporary data.
The tables report the median of the three independently reported medians and p95s, rather than
a percentile pooled across processes.

| Measurement host | Boundary before median / p95 (ms) | Boundary after median / p95 (ms) |
| ---------------- | --------------------------------: | -------------------------------: |
| Local machine    |                     2.644 / 5.405 |                    2.614 / 5.326 |
| Dev server       |                    8.728 / 18.542 |                   8.709 / 17.918 |

| Measurement host | Projects | HTTP before → after median / p95 (ms) | Boundary before → after median / p95 (ms) | Tool before → after median / p95 (ms) |
| ---------------- | -------: | ------------------------------------: | ----------------------------------------: | ------------------------------------: |
| Local machine    |       10 |                 6.1 / 7.9 → 6.3 / 8.7 |                     5.7 / 7.1 → 6.0 / 7.5 |                 5.7 / 7.2 → 5.9 / 7.4 |
| Local machine    |      100 |             49.6 / 57.5 → 47.4 / 52.8 |                 47.1 / 56.7 → 46.1 / 53.8 |             47.7 / 53.7 → 47.4 / 56.2 |
| Local machine    |      120 |             55.5 / 63.6 → 55.0 / 65.2 |                 56.6 / 67.1 → 56.3 / 63.2 |             57.8 / 65.2 → 57.0 / 66.9 |
| Local machine    |      200 |         109.7 / 118.4 → 105.4 / 115.7 |             106.5 / 116.2 → 102.9 / 114.5 |         106.7 / 115.2 → 108.1 / 115.2 |
| Dev server       |       10 |             12.2 / 16.8 → 13.6 / 22.2 |                 13.1 / 20.1 → 12.6 / 20.1 |             12.5 / 17.5 → 12.8 / 17.9 |
| Dev server       |      100 |          98.5 / 127.6 → 103.3 / 124.2 |              98.1 / 124.7 → 109.0 / 141.5 |         102.4 / 125.5 → 106.2 / 131.3 |
| Dev server       |      120 |         126.7 / 170.5 → 122.6 / 146.1 |             129.2 / 160.0 → 118.6 / 143.4 |         126.7 / 159.6 → 126.4 / 160.4 |
| Dev server       |      200 |         236.9 / 265.2 → 236.9 / 286.8 |             230.8 / 275.5 → 244.5 / 268.8 |         226.8 / 258.5 → 233.2 / 254.6 |

Listing controls vary across runs: one local optimized 200-project HTTP run reached a 345.4 ms
median and 704.3 ms p95, while the three-run HTTP median is 105.4 ms. Some listing cells and tails
are higher after the change, so these controls do not establish a uniform listing speedup.
A separate 200-project probe wraps `statefulIsAuthorized` and `policyToJson` before dynamically
importing the listing script. Both versions make 93 Cedar decisions across 93 requests. Cedar
sums 72.65 → 74.06 ms locally and 196.14 → 212.55 ms on the dev server. Ordinary requests make no
`policyToJson` calls in either the original or final version. Building the replay index eagerly
requires 18 such calls at construction, costing 4.99 ms locally and 16.36 ms on the dev server.
Lazy construction keeps that work outside ordinary access boundaries.

Cedar can emit simultaneous forbid IDs in different orders. Repeating the original replay at
`84642cb0` with the last Admin removed produced five rule-array order differences, with identical
decisions and rule IDs. Dry-run reports sort rule IDs lexicographically. The whole-matrix parity
test compares rule IDs as multisets and all other response fields byte for byte against the original
replay algorithm. Existing fixtures retain their original contents.

`bun test tests/auth/http-characterization.test.ts` compares the original recorded route cases and audit records; preserve its fixture unchanged.
The comparison asserts and removes only the additive published identity on project listings. New publication and preview routes have separate parity cases.
For new operations, regenerate `policies/matrix-cases.json` with `bun scripts/generate-access-matrix.ts` and record the new HTTP cases with
`bun scripts/record-http-characterization.ts`. Preserve all existing caller/route records when adding the new cases.
Review `tests/fixtures/dry-run/baseline.json` for the new inventory decisions and matrix count, preserving every existing decision and people result.

Trusted adapters use `buildTwinRequest(operationId, { params, query, body, signal })`; parameter
keys match the route template, including `*` for a splat. The builder rejects non-dispatchable
routes and bodies above the operation's existing byte limit.

HTTP body limits are exported from `src/server/request.ts`; route handlers and the operation inventory use those same constants.

`buildTwinRequest` reports malformed parameters and non-JSON bodies with `BadRequestError`, so
adapters can return a client error without treating caller mistakes as server failures.

Twin requests carry the authenticated caller's session reference. Remote credentials use that
reference, including an explicit absent session, before considering cookie-based session lookup.

The pure `routeVerdict(scope, row, mode, target)` owns admission for both invocation and listing.
Listing supplies candidate targets of the route's actual resource kind; a workspace-only row
cannot acquire permission through a project grant. File probes reuse `projectResources` from the
dry run. The listing invariant checks every fixture caller and inventory row, including unlisted
operations, client rows, local mode, deactivation and connection effects.

`handler.boundary.operate({ caller, request, operationId })` accepts one optional inventory id;
the request must resolve to that exact operation. Only HTTP and MCP origins are supported.
The in-process boundary exposes invocation and operation listing.

`handler.boundary.availableOperations(caller)` returns sorted inventory ids using current policy,
route passes and connection effects, without running handlers or writing audit records. Listing is
advisory: invocation always checks the actual target again. File probes cover custom path and
document-type conditions; body routes retain the existing project-level pass before target checks.

The operation inventory is validated by `schemas/semantic-workbench-operations-v1.json` through
the same Ajv setup as access configuration. Route rows own actions, client actions and initial
resource kinds; the inventory adds public ids, effects, limits, exposure, dispatch and handler-check
coverage. Reviewed internal steps keep snapshot reads, pointer advance and abandoned intent inside
the admitted operation’s authorization and single audit outcome. Startup reconciliation and first-pointer
adoption are registered lifecycle work with no transport dispatch; clone and repository-registration
connections also require its local-write and publication effects. Classifier names are keys of `operationClassifiers`; calls cannot override the selected
classifier. Agent plan bodies have their own
`AGENT_PLAN_REQUEST_LIMIT` (64,000 bytes), independent of the Git request limit.

Address-history recovery tests use the journal's `crashBefore` and `crashAfter` hooks to interrupt every
definition/store rename, then recover twice. Run `bun test tests/address-migration-store.test.ts tests/journal.test.ts`
for both forward completion and rollback proofs.


Item locator conformance, properties and documentation checks run with `bun test tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-docs.test.ts`.
Set `ADDRESS_TEST_SEED` to an integer to replay a property run; a failure reports its seed.
Use `bun run test:addresses` for the real selection/rename browser proof and `bun scripts/mutation-tests.ts`
for grammar, model, replay and permission mutants. The browser suite is included in the shared gate inventory and pipeline matrix.
Use `bun test tests/item-address-operations.test.ts tests/address-operation-parity.test.ts` for inventoried
address reads, HTTP/twin reconciliation replay and save/move/delete history parity.
Run `bun scripts/mutation-tests.ts --address-history` for the focused side-difference and compile-input
exclusion mutations. The integrated mutation gate also runs these cases.


Correctness cases that load and save the mall metric fixture use a 30-second execution budget
on capped development CPUs. This framework timeout is separate from explicit graph/view timing
assertions, which retain their existing limits.

Published snapshot measurements use `scripts/published-snapshot-performance-fixture.ts` and
`scripts/published-snapshot-performance.ts`. Browser suites and the mutation step run through
`bun scripts/ci-validate.ts --step browser --suite <script>` and `--step mutation`, which start and stop
their own frontend.
The edge suite budgets 30 seconds for its initial model readiness on a cold frontend; its
attachment and geometry checks retain their own limits.


## Agent panel checks

`bun test tests/acp/` covers protocol parsing, relay authentication, virtual paths, versioned
file requests, authorization parity, session endings, audit and browser event reduction.
`bun run build && bun run test:acp` serves the built frontend on loopback port 5418 against an
isolated temporary workspace and the scripted `reference-agent` version 1.0.0. It checks actual
conversation, edits, Undo, conflict, permission focus and cancellation in both themes at phone,
tablet and desktop widths. `bun run test:acp -- --closed-only` checks that default screens make no
panel requests. Waiting, conversation and permission screenshots are written to `out/acp/`.
The script closes its browser, relay and server before exiting.

`bun scripts/acp-reference-agent.ts <script.json>` runs the deterministic standard-input reference
agent. Its turns contain message, task-list, read, write, permission, sleep and exit steps.
`bun scripts/acp-mutants.ts` runs only the panel's fault candidates through the shared mutation
case dispatcher; the full mutation suite includes the same candidates. Screenshots and the full
integrated gate are separate from these feature checks.

Browser sign-in checks measure from the first authentication navigation to the callback response.
The callback must arrive in under five seconds. The server is already running and workspace
readiness is checked separately.

### Ontology mesh checks

Run focused mesh tests with `bun test tests/mesh`. The isolated browser journey is
`bun run test:mesh`. List the focused mutation cases with `bun scripts/mesh-mutants.ts --list`.

The development server compiled the 200-part, 20-import, 20 MB fixture in 4,383 ms
(`bun test tests/mesh/compile-scale.test.ts`). The test checks the measured compile time
and validates the generated bundle.
