# Published snapshot evidence

## Scope ledger

- The existing Git boundary enforces repository roots, argument lists, per-repository serialization and timeouts.
- Immutable object reads add bounded blob access without reading or changing the working tree.
- Snapshot routes must authorize project readability before reporting availability.
- Local migration must preserve commits, refs, staged bytes, unstaged bytes and untracked files on a copy of a pre-change root.

## Git primitives

`bun test tests/git-objects.test.ts tests/git.test.ts`: 10 pass, 0 fail, 43 expect() calls.
The real repositories cover Unicode and spaces, binary bytes, missing and oversized objects,
aggregate byte refusal, annotated and lightweight tags, ancestry and unborn HEAD.
Object reads disable Git lazy fetching so missing objects cannot initiate a network request.

## Publication fixtures

`bun test tests/git-fixtures.test.ts`: 4 pass, 0 fail, 14 expect() calls.
The fixtures assert published history, a separate authoring tip, a foreign personal tip,
an unborn default ref, an outside fast-forward and an outside reset using real Git queries.

## Snapshot error contract

`bun test tests/api-validation.test.ts`: 16 pass, 0 fail, 51 expect() calls.
The HTTP entry point preserves 409 and the complete contract body for all three absence reasons,
and 422 for unreadable candidates. Snapshot refusals bypass the legacy local 400 conversion.

## Durable pointer

`bun test tests/published-pointer.test.ts`: 13 pass, 0 fail, 22 expect() calls.
The targeted mutation runner used the registered snapshot-pointer case with the baseline and
with divergence classified as a fast-forward: baseline exit 0, mutant exit 1.
The full mutation gate is also running; its final result is recorded separately.

## Ordered publication checks

`bun test tests/publication-checks.test.ts`: 5 pass, 0 fail, 8 expect() calls.
Registered mutants skipping ancestry, skipping bounded reads and executing guards before bounds
all fail their focused cases; each unmodified baseline passes.

## Full mutation attempt

`bun scripts/mutation-tests.ts` detected the registered pointer mutant and completed the module
and askpass mutations, then failed its UI-mutant setup: the default frontend URL was unavailable.
The browser stage needs `SW_BASE_URL` pointed at the assigned frontend port and a running dev server.
This run is not a passing full gate.

## Immutable indexes

`bun test tests/snapshot-index.test.ts tests/published-pointer.test.ts tests/publication-checks.test.ts`:
24 pass, 0 fail, 41 expect() calls.
The index cases cover byte-exact blobs despite dirty files, tracked ignored files, absent untracked
files, all three build limits, case collisions and twenty concurrent callers sharing one build.
The registered working-file substitution mutant exits 1; its baseline exits 0.

## Pinned resolver

`bun test tests/published-snapshot.test.ts`: 4 pass, 0 fail, 66 expect() calls.
Pins preserve committed bytes across pointer changes, fifty publication moves stay within the
current/previous/live-pin retention bound, registry folder changes rebuild, and history reads
rebuild or refuse missing blobs. Returned byte buffers are copies.
All three registered resolver mutants fail their focused cases, with passing baselines:
ignoring the request pin, retaining every index and omitting the folder digest from the key.

## Interim request surface

The operation boundary is not present on this branch. `surfaceFromCredential` is the one interim
classification seam; the existing middleware calls `attachRequestSurface` after credential resolution.
A validated server session is browser; bearers remain agents, including when a cookie is also sent.
Local requests need same-origin or same-site Fetch Metadata and an origin accepted by the existing
local boundary. Missing Fetch Metadata fails closed. Replace this seam when integrating the operation boundary.

`bun test tests/request-surface.test.ts`: 9 pass, 0 fail, 27 expect() calls.
The missing-Fetch-Metadata-as-browser mutant exits 1; its baseline exits 0.

## First-start initialization and copied-root upgrade

`bun test tests/published-initialization.test.ts tests/auth/published-checkout.test.ts tests/auth/worktrees.test.ts`:
21 pass, 0 fail, 134 expect() calls.
The upgrade fixture starts without published state, stages one source, leaves another unstaged,
adds an untracked file and then copies the entire root before opening it twice. Both opens preserve
all refs, HEAD bytes, index bytes, staged content and working content. The first pointer names the
pre-upgrade default tip; server initialization preserves source output; an unborn default records no pointer.

The existing startup called `repairBase` in local mode too. Persisting the local default name would
make that path destructive on restart. Recovery of the detached base now runs only for the existing
server-startup option. The default-name lookup now follows recorded, remote default, checked-out,
as required; the old implementation put checked-out before remote default.

## Checked publication and interrupted intent recovery

`bun test tests/publishing.test.ts`: 4 pass, 0 fail, 15 expect() calls.
`bun test tests/auth/publish-safety.test.ts tests/auth/working-copy-routes.test.ts`:
12 pass, 0 fail, 43 expect() calls.
The registered pointer-before-checks mutant fails its focused refusal case; baseline passes.
Publication operations serialize per repository so one intent cannot overwrite another active move.
Existing published events continue to come from publishing.ts.

T010's wording puts intent before checks, while plan.md puts checks before intent. The latter order
is necessary: a persisted recoverable intent must represent a validated candidate. Checks run first,
then intent, ref compare-and-swap, pointer, resolver supersede and checkout refresh. Only this ordering
fragment of the task was corrected; its restart proof runs at all three requested interruption points.
The existing publishing safety tests live under tests/auth/, rather than the flat path named by the task.

## Read-source inventory

`bun test tests/auth/route-actions.test.ts`: 7 pass, 0 fail, 358 expect() calls.
Content-producing inventory rows explicitly declare their source. The registered mutant deleting
the catalog declaration fails the focused inventory assertion; its baseline passes.

## Agent handler extraction

`bun test tests/agent-api.test.ts tests/agent-context-kinds.test.ts tests/agent-paths.test.ts`:
16 pass, 0 fail, 248 expect() calls, with those test files unchanged.
The catalog/context/plan implementation now lives in routes/agent.ts and receives a document-source
callback. The callback encloses the entire deterministic operation, allowing a later published
source to retain its request pin until the response is built. The extraction preserves editing reads.

## Existing mutation coverage after extraction

The `read-agent` mutation now exercises the extracted route with an attached authorized scope;
its baseline passes and the unfiltered-document mutant fails. The two `export-access` cases keep
the new source declaration in their anchors; both baselines pass and both mutants fail.
The initial full mutation retry stopped at these two orphaned anchors, before executing mutants.

## Scoped architecture review and fixes

The independent architecture review covered completed foundation work only, not the remaining stories.
Its ranked findings were corrected and the reviewer confirmed no remaining blocker in that scope:

- Unknown detached defaults keep the workspace usable without a snapshot.
- Publication refuses an outside ref move before guards, retaining the durable commit as validation baseline.
- Server startup validates dirty local state before any forced checkout repair.
- Registry layouts are captured per pin; later pins see changes and prior pins keep their original scope.
- Snapshot parsing reuses the current copy's matching cache entry before checking other copies.

`bun test tests/published-initialization.test.ts tests/published-snapshot.test.ts tests/publishing.test.ts tests/snapshot-index.test.ts tests/auth/published-checkout.test.ts`:
28 pass, 0 fail, 152 expect() calls.
The resolver cases also prove eviction across publications with no reads and no-Git refusal
when a durable pointer already exists. The focused mutation runner passes every baseline and detects
all registered snapshot mutants, including the review fixes.

All registry writers were inspected: import, clone, project/folder registration, rename and trash
changes settle through the existing registry lock. Its completion refreshes the resolver's in-memory
registry; taking a pin does not read the registry file.

## Validation tooling

`bun --bun run check`: exit 0; all TypeScript, formatting, lint, comments, theme and brand checks pass.
`bun --bun run build`: exit 0; `✓ built in 2.50s`. The existing large-chunk warning remains.
The readability checker and documentation-sync checker exit 0 for the changed implementation.
`python3 scripts/commit_cadence.py .` cannot run because this checkout has no such script.
The public documentation leak scan passes README, architecture, changelog, server-mode and
agent-runtime pages. The configuration page retains its existing documented cache-path example,
which the scanner classifies as a local path; that pre-existing example was not removed.

`bun test`: 2134 pass, 0 fail, 131043 expect() calls;
`Ran 2134 tests across 294 files. [359.26s]`.
The preceding run also passed (2132 tests); this fresh run includes the two latest resolver cases.

## Implementation boundary

Completed: T001–T012. T013–T048 remain unchecked and unimplemented; none was discarded as
unnecessary. This is not full-feature completion. Agent routes still use the editing document
source. Local authoring-branch switching, local Publish, preview routes, status/adoption UI,
historical route enforcement, published export and the feature-specific browser/performance
proofs remain pending. The existing-suite results do not replace those proofs.

An outside default-ref move is already refused by publication until the ref is restored or the
pending adoption flow is implemented. Do not integrate this checkpoint as the complete feature.

### Implementation commits

- `d0032ab4` feat: add bounded immutable Git object reads
- `fa439574` test: add isolated publication history fixtures
- `f0d902ec` feat: preserve snapshot refusal responses at the HTTP boundary
- `449ceced` feat: persist and reconcile published commit pointers
- `23d6eaa7` feat: define ordered publication checks
- `b325ba9f` feat: build bounded snapshot indexes from Git blobs
- `c6aaea3e` feat: resolve immutable published snapshots under request pins
- `cc8ed124` feat: classify browser and agent request surfaces at access middleware
- `b9afc42d` feat: adopt existing default tips without changing local work
- `1914a92e` feat: recover checked publications through durable intents
- `23ed1290` feat: declare definition sources in the route inventory
- `07d57970` refactor: extract agent handlers behind a document source
- `c9ecdca5` test: preserve access mutants after agent route extraction
- `a3ee14b3` fix: preserve snapshot integrity across registry and default-ref changes

## Existing-suite completion checks

`bun scripts/mutation-tests.ts` (through `bun --bun run test:mutation`): exit 0;
`680/680 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`
`bun --bun run test:ui`: exit 0; `20 UI checks passed`.

`bun --bun run test:responsive`: exit 1, in
`examples: 1280×720 mall Graph toolbars keep the canvas height they had as dialogs`.
The assertion reports `mall.odcs.yaml canvas height`, expected >= 421 px, received 407 px.
No frontend or shared source file differs from the starting implementation commit, but no baseline
comparison has established the cause. This remains an unresolved gate failure, not a passing run.
`bun --bun run test:edges`: exit 0; `6 edge attachment UI checks passed`.
`bun --bun run test:grouping-validation`: exit 0; `8 grouping and validation UI checks passed`.

`bun --bun run test:examples:ui`: exit 0;
`19 example UI checks passed; no browser runtime errors.`
`bun --bun run test:auth`: exit 0; its final check is
`PASS Git history is refused for a person who cannot read every file`.

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 RESPONSIVE_ONLY=examples: bun scripts/responsive-ui-tests.ts`:
exit 1; the focused repetition reproduces the same canvas-height assertion, 407 px against >= 421 px.
No threshold or frontend layout was changed. The remaining responsive checks after this assertion
were not reached. The full feature-specific browser script, release comparison and performance
measurements are also still absent, as their task checkboxes show.

All browser suites ran serially. The temporary frontend used port 5321 with its API proxy pointed
only at port 5322; isolated browser harnesses owned their ephemeral API listeners. No push, merge,
tag, deployment, owner checkout mutation or external service was performed.

## Resumed scope ledger

- Agent handlers already authorize project readability before invoking their document source.
- Snapshot reads are identity-free and pinned; the route adds caller filtering after loading them.
- Browser previews retain the editing source and existing request validation and context algorithms.
- The delta changes production definition selection and provenance; it does not change query semantics.

## Published agent routes

`TMPDIR=/tmp/sw-008 bun test tests/agent-sources.test.ts`: 2 pass, 0 fail, 34 expect() calls.
Local browser/programmatic calls and server person/application calls use the same pinned commit;
unpublished edits and a new WIP mapping are excluded. The source mutant baseline exits 0 and
substituting editing documents exits 1. Existing agent suites also pass: 16 pass, 0 fail, 248 assertions.

## Main responsive comparison

A fresh `git fetch origin main` resolved `origin/main` to `655df094b1783aa9fc40570cb3d40d51949da481`;
that is the reference tested, rather than assuming the supplied `e8b7d69` was its current value.
A temporary worktree was created from that ref, with the same installed dependencies and Vite on
5321. `TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 RESPONSIVE_ONLY=examples: bun scripts/responsive-ui-tests.ts`
exited 1 at the identical `mall.odcs.yaml canvas height` assertion: expected >= 421, received 407.
This establishes the failure as pre-existing to this feature. The canvas and assertion were not
changed; the lineage-toolbar layout is owned by the separate UI fix. The temporary frontend was
stopped and the worktree removed after the comparison.

## Availability authorization matrix

`TMPDIR=/tmp/sw-008 bun test tests/auth/matrix.test.ts --test-name-pattern "snapshot availability"`:
1 pass, 0 fail, 270 assertions. All fixture roles compare unknown and unreadable projects across
catalog, context and plan; readable projects without pointers return the exact 409 contract.
The mutant loading availability before project authorization is detected (baseline 0, mutant 1).

## Metrics read surface

`TMPDIR=/tmp/sw-008 bun test tests/metrics-surface.test.ts tests/metrics-api.test.ts tests/kpi-save.test.ts tests/explain.test.ts`:
16 pass, 0 fail, 331 assertions. The new case proves both metric listing and explanation use editing
definitions for browser calls and committed definitions otherwise, with no agent snapshot header.
The always-editing mutant is detected (baseline 0, mutant 1). Existing UI-oriented HTTP fixtures
now explicitly send browser fetch metadata rather than depending on the old implicit source.

## Snapshot request logging

`TMPDIR=/tmp/sw-008 bun test tests/observability/request-log.test.ts tests/observability/redaction.test.ts`:
26 pass, 0 fail, 62 assertions. The finished request carries the header commit and the exact existing
field set plus `snapshotCommit`; no content, path or project name is added.

## Application grant compatibility

`TMPDIR=/tmp/sw-008 bun test tests/auth/matrix.test.ts tests/auth/audit.test.ts --test-name-pattern application`:
2 pass, 0 fail, 15 assertions. A fixed allowlist contains projects, catalog, context and plan only;
other application routes retain their existing refusal statuses. The successful agent audit keeps
its exact field shape and action `agentRead`. Tasks referring to `tests/audit.test.ts` use the
existing `tests/auth/audit.test.ts` instead; no parallel audit suite was introduced.

## Local publication primitive

`TMPDIR=/tmp/sw-008 bun test tests/local-publication.test.ts`: 7 pass, 0 fail, 25 assertions.
Real Git fixtures cover creating/reusing authoring, staged and unstaged bytes, dirty publication,
unborn default creation, one concurrent winner, detached/diverged refusals and an outside CAS race.
Both registered local mutants are detected: destructive reset and omission of the CAS old value.
`bun --bun run check`: exit 0. Phase-three matrix/audit/inventory: 32 pass, 0 fail, 41866 assertions.

The local commit wiring must include existing automatic writers, not just the SCM HTTP route:
imports, project-folder moves and manifest commits also commit through Git. Legacy data migration
runs before snapshot initialization and establishes the existing history adopted on upgrade.
The extension keeps those existing writers and uses one authoring preparation function.

## Local SCM commit wiring

`TMPDIR=/tmp/sw-008 bun test tests/local-commit-branch.test.ts tests/commit-availability.test.ts tests/local-publication.test.ts`:
11 pass, 0 fail, 42 assertions. The HTTP commit path reports `work/local` and `movedFrom` only when
moving from the default; another selected branch remains selected, and the default tip is unchanged.
The mutant omitting local commit preparation is detected (baseline 0, mutant 1).
`bun --bun run check`: exit 0. Automatic local commit writers are the remaining part of this step.

## Automatic local commits

`TMPDIR=/tmp/sw-008 bun test tests/local-commit-branch.test.ts tests/import-commit.test.ts tests/project-folder.test.ts`:
22 pass, 0 fail, 142 assertions. New imports leave the default unborn and remember its name before
the first authoring commit. Imports into an upgraded root keep its published ref. Folder moves and
manifest writes reuse the same preparation. In-progress merge imports retain their existing
written-but-not-committed result. The existing explicit pull path uses the remembered default for
`work/local` without an upstream; no network listener was added. Fixture publication now keeps
existing commits rather than adding empty commits and represents published roots explicitly.

## Local publication HTTP and audit

`TMPDIR=/tmp/sw-008 bun test tests/publishing.test.ts tests/auth/audit.test.ts tests/auth/matrix-write.test.ts`:
28 pass, 0 fail, 2292 assertions. First local publication is authorized through the existing publish
route, keeps dirty authoring source unchanged and emits `published` after the pointer settles.
Both local and server publication audit records contain the old and new full commit ids. A local
principal is allowed while the server Viewer refusal remains unchanged.
`bun --bun run check`: exit 0.

## Published status and notice

`TMPDIR=/tmp/sw-008 bun test tests/scm-published-status.test.ts tests/auth/route-actions.test.ts`: 11 pass, 0 fail, 380 assertions. Status distinguishes all unavailable reasons, authoring distance and pending movement. Explicit acknowledgement persists only in personal view state; refs and index remain byte-identical. The HTTP adapter nests pending details as the HTTP contract specifies while retaining the resolver’s flat internal status. `bun --bun run check`: exit 0.

## Publication controls

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/published-snapshot-browser-check.ts`: 2 published snapshot browser checks passed. Mocked publication responses cover local Publish, both modes’ Adopt and notice acknowledgement; all six responsive sizes keep the new row inside the viewport without horizontal overflow. The Adopt client is wired for the later adoption endpoint. Capture comparison remains scheduled with the complete journey. `bun --bun run check`: exit 0.

## Remote default status

`TMPDIR=/tmp/sw-008 bun test tests/local-publication.test.ts tests/git-remote.test.ts`: 16 pass, 0 fail, 117 assertions. A real bare remote populates the tracking ref; after replacing its address with an HTTP listener, startup, watcher and repeated status reads make zero network calls. Status reports the last fetched remote default ahead of the durable snapshot. No existing network-listener test matching the task description exists; this case provides the requested proof. The existing pull/sync case now explicitly chooses work/local before pulling and verifies pushing that authoring branch. `bun --bun run check`: exit 0 before the fixture-only correction; repeated below with the next test additions.

## Request interleaving

`TMPDIR=/tmp/sw-008 bun test tests/published-snapshot-stress.test.ts`: 1 pass, 0 fail, 601 assertions. Two hundred HTTP agent calls cross twenty real publications. Each group pauses after its request pins and resumes after the next publication; every complete catalog equals the catalog of the commit in its header. All five focused resolver mutants are detected (baseline 0, mutant 1), including replacing the request pin on each read. Remote-status final `bun --bun run check`: exit 0.

## Published revision provenance

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-provenance.test.ts`: 2 pass, 0 fail, 46 assertions. Real SHA-1 and SHA-256 repositories accept full historical ids and an inside-history tag; abbreviated ids, branch names, personal/proposal-only commits, blob ids and outside tags all refuse identically through both resolver entry points. Both added provenance mutants are detected, along with the five existing resolver mutants (each baseline 0, mutant 1).

## Registry changes and eviction

`TMPDIR=/tmp/sw-008 bun test tests/published-snapshot.test.ts tests/snapshot-provenance.test.ts`: 9 pass, 0 fail, 124 assertions. Adding, removing and moving project folders affects new pins without changing old pins or restarting. After eviction, deleting a historical blob makes that revision unavailable; current content still serves. `bun --bun run check`: exit 0.

## Object failures and build limits

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-index.test.ts`: 9 pass, 0 fail, 19 assertions. Each configured bound and a case collision fail closed. Deleting a real loose blob produces no partial index, repeated failures are retryable, and restoring the object permits a complete build. A real sleeping Git executable times out twice without retaining an unfinished build.

## Browser-only preview routes

`TMPDIR=/tmp/sw-008 bun test tests/auth/matrix.test.ts tests/auth/route-actions.test.ts tests/auth/guard-inventory.test.ts`: 29 pass, 0 fail, 43401 assertions. Catalog/context/plan previews use the existing source-injected handlers, require the browser surface, have no snapshot header, and preserve the application allowlist. Sessions and marked local requests pass; applications and unmarked local requests match unknown-route answers. The surface-guard mutant is detected (baseline 0, mutant 1). The inventory also now documents acknowledgement as personal-state-only, correcting its previously missing content-guard exemption.

## Preview client and local guardrail

`TMPDIR=/tmp/sw-008 bun test tests/request-surface.test.ts tests/agent-paths.test.ts`: 12 pass, 0 fail, 37 assertions. Browser URLs point to preview; unmarked local requests receive 404 while marked requests, including the allowed dev origin, succeed. `TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/published-snapshot-browser-check.ts`: 2 published snapshot browser checks passed. Both modes display the preview label and published commit and plan an unpublished expression containing `+ 17`. The frontend and isolated API use different ports. Chromium adds fetch metadata after interception, so the existing write forwarder now reconstructs missing metadata from the actual page/request origins; production surface enforcement remains unchanged. `bun --bun run check`: exit 0.

## Pending movement cache

`TMPDIR=/tmp/sw-008 bun test tests/scm-published-status.test.ts tests/published-pointer.test.ts`: 18 pass, 0 fail, 47 assertions. Ref identity is compared on each status request, while ancestry/count results are cached for the observed ref and pointer. Git events invalidate and refresh that result. This reconciles the task’s status-comparison and cache-until-event requirements without hiding external changes when watching is disabled. All eight resolver mutants are detected, including serving the outside ref while pending (baseline 0, mutant 1).

## Adoption endpoint

`TMPDIR=/tmp/sw-008 bun test tests/adopt-published.test.ts tests/auth/matrix-write.test.ts tests/auth/guard-inventory.test.ts`: 17 pass, 0 fail, 1554 assertions. A local HTTP adoption preserves dirty source and index, records previous/new commits and emits only after settlement. Empty/diverged moves return the exact conflicts. The route uses publication authorization across the repository; Viewer and guarded approval cases remain refused. Server adoption first refuses a dirty base and refreshes only the validated commit. `bun --bun run check`: exit 0.

Both adoption mutants are detected independently: skipping the content guard and accepting a non-descendant default ref (each baseline 0, mutant 1). The tests reuse the real Git publication fixture and assert that the durable pointer stays at the old commit after each refusal.
