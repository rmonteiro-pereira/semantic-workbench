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

`TMPDIR=/tmp/sw-008 bun test tests/scm-published-status.test.ts tests/auth/route-actions.test.ts`: 11 pass, 0
fail, 380 assertions. Status distinguishes all unavailable reasons, authoring distance and pending movement.
Explicit acknowledgement persists only in personal view state; refs and index remain byte-identical. The HTTP
adapter nests pending details as the HTTP contract specifies while retaining the resolver’s flat internal
status. `bun --bun run check`: exit 0.

## Publication controls

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/published-snapshot-browser-check.ts`: 2
published snapshot browser checks passed. Mocked publication responses cover local Publish, both modes’ Adopt
and notice acknowledgement; all six responsive sizes keep the new row inside the viewport without horizontal
overflow. The Adopt client is wired for the later adoption endpoint. Capture comparison remains scheduled with
the complete journey. `bun --bun run check`: exit 0.

## Remote default status

`TMPDIR=/tmp/sw-008 bun test tests/local-publication.test.ts tests/git-remote.test.ts`: 16 pass, 0 fail, 117
assertions. A real bare remote populates the tracking ref; after replacing its address with an HTTP listener,
startup, watcher and repeated status reads make zero network calls. Status reports the last fetched remote
default ahead of the durable snapshot. No existing network-listener test matching the task description exists;
this case provides the requested proof. The existing pull/sync case now explicitly chooses work/local before
pulling and verifies pushing that authoring branch. `bun --bun run check`: exit 0 before the fixture-only
correction; repeated below with the next test additions.

## Request interleaving

`TMPDIR=/tmp/sw-008 bun test tests/published-snapshot-stress.test.ts`: 1 pass, 0 fail, 601 assertions. Two
hundred HTTP agent calls cross twenty real publications. Each group pauses after its request pins and resumes
after the next publication; every complete catalog equals the catalog of the commit in its header. All five
focused resolver mutants are detected (baseline 0, mutant 1), including replacing the request pin on each
read. Remote-status final `bun --bun run check`: exit 0.

## Published revision provenance

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-provenance.test.ts`: 2 pass, 0 fail, 46 assertions. Real SHA-1 and
SHA-256 repositories accept full historical ids and an inside-history tag; abbreviated ids, branch names,
personal/proposal-only commits, blob ids and outside tags all refuse identically through both resolver entry
points. Both added provenance mutants are detected, along with the five existing resolver mutants (each
baseline 0, mutant 1).

## Registry changes and eviction

`TMPDIR=/tmp/sw-008 bun test tests/published-snapshot.test.ts tests/snapshot-provenance.test.ts`: 9 pass, 0
fail, 124 assertions. Adding, removing and moving project folders affects new pins without changing old pins
or restarting. After eviction, deleting a historical blob makes that revision unavailable; current content
still serves. `bun --bun run check`: exit 0.

## Object failures and build limits

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-index.test.ts`: 9 pass, 0 fail, 19 assertions. Each configured
bound and a case collision fail closed. Deleting a real loose blob produces no partial index, repeated
failures are retryable, and restoring the object permits a complete build. A real sleeping Git executable
times out twice without retaining an unfinished build.

## Browser-only preview routes

`TMPDIR=/tmp/sw-008 bun test tests/auth/matrix.test.ts tests/auth/route-actions.test.ts
tests/auth/guard-inventory.test.ts`: 29 pass, 0 fail, 43401 assertions. Catalog/context/plan previews use the
existing source-injected handlers, require the browser surface, have no snapshot header, and preserve the
application allowlist. Sessions and marked local requests pass; applications and unmarked local requests match
unknown-route answers. The surface-guard mutant is detected (baseline 0, mutant 1). The inventory also now
documents acknowledgement as personal-state-only, correcting its previously missing content-guard exemption.

## Preview client and local guardrail

`TMPDIR=/tmp/sw-008 bun test tests/request-surface.test.ts tests/agent-paths.test.ts`: 12 pass, 0 fail, 37
assertions. Browser URLs point to preview; unmarked local requests receive 404 while marked requests,
including the allowed dev origin, succeed. `TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun
scripts/published-snapshot-browser-check.ts`: 2 published snapshot browser checks passed. Both modes display
the preview label and published commit and plan an unpublished expression containing `+ 17`. The frontend and
isolated API use different ports. Chromium adds fetch metadata after interception, so the existing write
forwarder now reconstructs missing metadata from the actual page/request origins; production surface
enforcement remains unchanged. `bun --bun run check`: exit 0.

## Pending movement cache

`TMPDIR=/tmp/sw-008 bun test tests/scm-published-status.test.ts tests/published-pointer.test.ts`: 18 pass, 0
fail, 47 assertions. Ref identity is compared on each status request, while ancestry/count results are cached
for the observed ref and pointer. Git events invalidate and refresh that result. This reconciles the task’s
status-comparison and cache-until-event requirements without hiding external changes when watching is
disabled. All eight resolver mutants are detected, including serving the outside ref while pending (baseline
0, mutant 1).

## Adoption endpoint

`TMPDIR=/tmp/sw-008 bun test tests/adopt-published.test.ts tests/auth/matrix-write.test.ts
tests/auth/guard-inventory.test.ts`: 17 pass, 0 fail, 1554 assertions. A local HTTP adoption preserves dirty
source and index, records previous/new commits and emits only after settlement. Empty/diverged moves return
the exact conflicts. The route uses publication authorization across the repository; Viewer and guarded
approval cases remain refused. Server adoption first refuses a dirty base and refreshes only the validated
commit. `bun --bun run check`: exit 0.

Both adoption mutants are detected independently: skipping the content guard and accepting a non-descendant
default ref (each baseline 0, mutant 1). The tests reuse the real Git publication fixture and assert that the
durable pointer stays at the old commit after each refusal.

## Refused adoption audit

`TMPDIR=/tmp/sw-008 bun test tests/auth/audit.test.ts tests/auth/audit-chain.test.ts
tests/adopt-published.test.ts`: 23 pass, 0 fail, 1082 assertions. Empty/diverged adoption outcomes record
their bounded refusal reason without a successful-publication object. The real appended chain verifies, and
existing guard reasons remain owned by the authorization audit path. `bun --bun run check`: exit 0.

## Interrupted publication and outside movement

`TMPDIR=/tmp/sw-008 bun test tests/publishing.test.ts tests/published-initialization.test.ts`: 19 pass, 0
fail, 107 assertions. The nine recovery scenarios are the original three stop points plus both outside
movement classes at each stop. When the external ref differs from both intent and settled commit, existing
reconciliation retains the intent as evidence and reports an outside move, as research D10 prescribes; it does
not infer that the intent completed. Server checkout repair now targets the settled pointer rather than the
unadopted ref. Local copied-root upgrade safety remains covered. `bun --bun run check`: exit 0.

## History provenance

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-history.test.ts tests/snapshot-provenance.test.ts
tests/git-status.test.ts`: 9 pass, 0 fail, 129 assertions. Through HTTP, Bob reads his own commit, Alice
cannot read it by full id, and Alice’s own HEAD/history and published commits remain readable. Versions has no
revision parameter in the existing API: its HEAD log entries are checked individually rather than adding an
unrequested selector. The provenance predicate is bound to the project repository, so publication in another
repository cannot widen it. The skipped-show-check mutant is detected (baseline 0, mutant 1). Log and Diff are
unchanged. `bun --bun run check`: exit 0.

## Foreign history authorization matrix

`TMPDIR=/tmp/sw-008 bun test tests/auth/matrix.test.ts -t "history source matrix"`: 1 pass, 0 fail, 60
assertions. Every fixture identity receives identical status/body for a foreign personal id and a missing id
through Show; Versions ignores that unsupported selector and returns only its normal readable HEAD history.
Neither response exposes the foreign payload.

## Published ZIP source

`TMPDIR=/tmp/sw-008 bun test tests/snapshot-export.test.ts tests/project-export.test.ts
tests/auth/project-export-access.test.ts`: 15 pass, 0 fail, 71 assertions. Published ZIP paths and bytes equal
Git blobs, omit saved/untracked drafts, and reject history. Default and explicit editing archives stay
byte-identical before and after the published download. The existing planner accepts pinned byte entries;
streaming retains those bytes after releasing the pin. The working-files-for-published mutant is detected
(baseline 0, mutant 1). `bun --bun run check`: exit 0.

## Published export option

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/published-snapshot-browser-check.ts`: 2
published snapshot browser checks passed. In both modes the option appears only with a snapshot, disables
history, downloads the published ZIP and excludes the unpublished expression that appears in the preview plan.
The option is absent when status has no commit. `bun --bun run check`: exit 0.

## Gate corrections for local authoring

The first broad unit run exposed old branch expectations and selected-path validation running after authoring
preparation. Selected paths and merge state are now validated before a branch switch through the existing
selection logic. `TMPDIR=/tmp/sw-008 bun test tests/files-api.test.ts tests/git-commit-api.test.ts
tests/route-security.test.ts tests/local-commit-branch.test.ts`: 26 pass, 0 fail, 196 assertions. An
additional assertion confirms a refused path does not change the selected branch:
`tests/git-commit-api.test.ts`, 5 pass, 0 fail, 43 assertions. `bun --bun run check`: exit 0.

### Final documentation review

README, architecture, configuration, server and agent guides and the Unreleased migration table now describe
the settled snapshot and local publication. The independent documentation reviewer returned PASS after
narrowing the response-header claim to catalog/context/plan and correcting the server storage description.
`docs_sync.py --worktree .` exited 0. Existing fixture alignment: 40 pass, 0 fail, 423 assertions across five
files; the copy-publish mutation baseline also exited 0.

## Final review corrections

The full architecture review identified and prompted fixes for registration-time initialization, the agent
response header during registry changes, remote-follow publication audit identifiers, adoption refusal audit
identifiers and publication availability without history permission. The corrections reuse existing
initialization, request audit and project-list boundaries. Proof: agent source tests 3 pass / 37 assertions;
clone and migration targeted run 42 pass / 311 assertions; audit, remote and adoption tests 18 pass / 1,084
assertions; export access 6 pass / 29 assertions. `bun --bun run check` exited 0. The snapshot browser check
passed both modes and all six publication geometries, including Published export while history requests return
403. The command is registered in package.json, the shared gate list and the pipeline matrix.

## Complete mutation gate

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/mutation-tests.ts`: **694/694 targeted
mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.** All named
snapshot faults and the nine visual faults were detected. Earlier concurrent broad runs exceeded short harness
deadlines; the final run was serialized against the other heavy suites and required no timeout changes.

## Broad completion checks

`DATA_DIR=/tmp/sw-008/unit-gate bun test` (through the suite runner):

```text
2186 pass
0 fail
134675 expect() calls
Ran 2186 tests across 304 files. [383.70s]
```

`bun --bun run check`: exit 0. Formatter: `All matched files use the correct format.` Comment check: `Comments
are free of specification and task IDs.` Final brand check: `No product name or logo is hard-coded outside
public/brand.`

`bun --bun run build`: `✓ built in 1.50s` (exit 0; existing large-chunk advisory only).

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 SW_SCREENSHOT_DIR=/tmp/sw-008/captures/snapshot-controls
bun scripts/published-snapshot-browser-check.ts`: `2 published snapshot browser checks passed.` The reviewed
native phone capture prompted singular commit wording; the repeated browser run passed and replaced the
supplemental images.

The final documentation reviewer returned accuracy PASS after registration, audit and no-history metadata
corrections. Three new prose lines were wrapped to meet the width rule. The full architecture reviewer
returned PASS after the guarded refusal audit correction. The marker will be recorded at the final committed
head.

## Reserved authoring name scope ledger

Local commit preparation already preserves arbitrary non-default authoring branches and staged files. Git
permits a repository default itself to be named `work/local`; the fixed fallback name must not turn that
default into an ordinary authoring target. A focused HTTP case will exercise this valid existing-root
configuration and, if necessary, require a refusal before a commit and successful recovery by choosing another
authoring branch. No ref rename or migration rewrite is authorized or needed.

The reserved-name HTTP test first failed because the request returned 200 and advanced the default. Commit
preparation now refuses that collision before staging or committing. The same entry-point test selects another
authoring branch, commits successfully without moving the snapshot, then explicitly publishes it. Targeted
proof: 13 pass, 0 fail, 59 assertions. The mutation baseline exits 0; deleting the reserved-name check exits 1
with the expected missing-rejection assertion. That mutant is registered for the complete gate.

## Final unit, static and build verification

The complete rerun includes the reserved-default-name regression and the aligned SCM browser fixture.
`DATA_DIR=/tmp/sw-008/unit-gate-final bun test` ran through the suite runner:

```text
2187 pass
0 fail
134686 expect() calls
Ran 2187 tests across 304 files. [401.57s]
```

`bun --bun run check`: exit 0; `All matched files use the correct format.`; `Comments are free of
specification and task IDs.`; `No product name or logo is hard-coded outside public/brand.`
`bun --bun run build`: exit 0, `✓ built in 1.59s`, with the existing large-chunk advisory.
The final documentation review returned PASS at `6eab45fa`, including the reserved-name migration case.
`docs_sync.py --worktree .` exited 0. The requested `python3 scripts/commit_cadence.py "$PWD"` cannot run:
this checkout does not contain that script (exit 2). No substitute tooling was added.

## Browser completion checks

All browser suites ran serially with `TMPDIR=/tmp/sw-008` and `SW_BASE_URL=http://127.0.0.1:5321`.
The package commands used `bun --bun run`; responsive follow-ups used the same script with
`RESPONSIVE_ONLY` selecting groups after the inherited failure.

| Command | Summary | Exit |
|---|---|---:|
| `test:ui` | `20 UI checks passed` | 0 |
| `test:edges` | `6 edge attachment UI checks passed` | 0 |
| `test:grouping-validation` | `8 grouping and validation UI checks passed` | 0 |
| `test:examples:ui` | `19 example UI checks passed; no browser runtime errors.` | 0 |
| `test:scm` | `18 source-control checks passed` | 0 |
| `test:mappings-layout` | `7 mapping layout checks passed` | 0 |
| `test:projects` | `8 project checks passed` | 0 |
| `test:published-snapshot` | `2 published snapshot browser checks passed.` | 0 |
| `test:auth` | Final assertion: `PASS Git history is refused for a person who cannot read every file` | 0 |
| `test:responsive` | `mall.odcs.yaml canvas height`: expected >= 421 px, received 407 px | 1 |

The responsive failure was reproduced unchanged in a temporary worktree from freshly fetched
`origin/main` (`655df094`), then that worktree and its frontend were removed. The user assigned the
lineage-toolbar fix to the UI branch and instructed that neither canvas nor assertion change here.
This is an explicit inherited failure, not a passing full responsive run. Focused follow-ups passed:
dark theme 5 checks, graph controls 5, shell 5, examples at 1440 px 2, loading 2 and examples at 2560 px 2.
The full run passed its preceding groups before reaching the known assertion.

An initial frontend transport interruption invalidated later browser attempts. A fresh frontend and
serial reruns supplied the successful results above; those interrupted attempts are not acceptance proof.

The full public-document scan reports only seven pre-existing `/tmp/` command examples in configuration
and development documentation. Those usage commands are preserved. Scanning all added public-document
lines separately exits 0 with no hits; the confidential-only internal evidence scan also exits 0.

## Final complete mutation gate

`TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/mutation-tests.ts` printed the complete summary:

```text
695/695 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.
```

This supersedes the earlier 694-mutant run and includes the reserved-default-name predicate. All nine visual
mutants were detected. No mutant was excluded, made equivalent or accepted because of an invalid import or
syntax error. The full run completed before either final capture journey started.

The long-lived launcher subsequently reported exit 143 rather than a verified zero exit. The summary
proves all mutant assertions ran, but does not by itself prove a clean process exit. A detached suite-runner
repeat will supply the final exit status after the serial capture journeys.

## Complete server capture selector

The file-move tour opens a file before locating its action menu. The server fixture contains the same
ontology filename in two projects, so a filename-only menu locator violates strict selection. A focused
release capture reproduced the identical two-element failure on v0.6.1. The tour now locates the already
selected sidebar file row and its existing menu; no UI or geometry assertion changed. The same driver
adjustment is applied to the ignored release source. `TMPDIR=/tmp/sw-008 SW_ONLY=file-move
bun scripts/polish-capture-server.ts ...`: four native viewports, four `problems=0` measurements, exit 0.
The failed full server output is retained separately and will not enter the final comparison inventory.

## Deterministic sidebar capture scope

The sidebar tour previously opened only the sidebar, leaving its background dependent on the fixture's
previous document and asynchronous lineage layout. The paired native view exposed one loading-only
background. Capture preparation now opens the fixture ontology Overview before the sidebar; normal browser
tours and all geometry assertions remain unchanged. Focused local and server captures replace all four
sidebar widths on both revisions. The rest of each completed 232-image journey remains unchanged.

## Native visual comparison

[Comparison index](comparison-index.md), [findings](visual-findings.md) and
[hashed manifest](capture-manifest.json) cover 464 pairs: 928 PNGs, both modes, 58 states and four native
viewports. Each complete journey produced 232 zero-problem measurements and exited 0. All pairs are
classified; no unrequested product regression remains. The sidebar's asynchronous background and duplicate
filename selector were corrected in the capture preparation, with focused proof on both revisions.

```sh
TMPDIR=/tmp/sw-008 SW_BASE_URL=http://127.0.0.1:5321 bun scripts/polish-capture.ts <local-output>
TMPDIR=/tmp/sw-008 bun scripts/polish-capture-server.ts <server-output>
```

Both commands ran on v0.6.1 and the feature source. Each log ends with
`MEASURE admin-access-check 2560 problems=0`; all 232 measurements in each log report zero problems.
Focused sidebar recaptures report four `MEASURE sidebar-projects ... problems=0` lines per revision/mode.
Server commands ran in isolated subprocess sessions with their actual return codes recorded in files,
confirming zero after earlier direct-launcher signal statuses. The inherited 407/421 responsive failure
remains documented separately and is not described as a passing assertion.

The complete native inventory classifies 171 identical, 94 subthreshold raster-only, 8 publication-control,
20 preview-label, 16 export-source, 50 fixture-metadata, 37 randomized-graph and 68 dialog-background pairs.
The only loading-only sidebar background was replaced after explicit Overview preparation. A release Vite
dependency reload interrupted its first image; separate temporary cache directories and a warm-up supplied
the final native capture. Neither change touches application layout or a browser assertion.
Independent architecture review confirmed that adoption detaches the existing shared base while a person's
write still creates their personal branch. No product source changed after `bab84471`.

## Remote completion and fixture environment

The local completion rerun was externally stopped during shared-host memory exhaustion and has no final
result. Heavy commands now run only through the user-supplied `sw-midgard-run` wrapper; its scratch push and
capped unprivileged execution are explicitly authorized. No GitHub remote or owner checkout is changed.

Fixture scope: `isolateGit` already writes a test identity and changes `process.env`; production Git calls
and the shared fixture Git helper already pass that environment explicitly. Some raw synchronous test
commands omitted it. A two-case Bun probe confirmed that an environment variable added after startup is
absent from a default `spawnSync` child and present with `env: process.env`. Remote Git reported an unknown
author, masking merge setup and breaking six recovery cases plus merge fixtures. Only those test command
edges now receive the existing isolated environment; production behavior and isolation policy are unchanged.
`GIT_CONFIG_GLOBAL=/dev/null bun test tests/publishing.test.ts`: 13 pass, 0 fail, 80 assertions, 3.83 s.

The published-fixture helper had the same omission and now passes the same isolated environment. Focused
checks with `GIT_CONFIG_GLOBAL=/dev/null` passed: Git commit paths 5 tests / 14 assertions; imports 6 / 35;
commit HTTP 5 / 43; agent sources 3 / 37. The publishing recovery file passed 13 / 80. No host Git
configuration was changed, and no new isolation mechanism was introduced.

The server working-copy test helper also used the startup environment and now passes the existing isolated
configuration explicitly. A pre-existing deployment-fixture assertion hard-coded `/tmp/`, while the real
adapter already uses `tmpdir()`. Its expectation now follows that same directory, preserving the credential
isolation check. These are test portability corrections exposed by the required remote execution, not
changes to production migration or deployment. Focused empty-global trash tests and custom-TMPDIR deployment
tests passed without a host configuration change.

The worktree mutation baseline contained one equivalent raw commit call. It now receives the same fixture
environment. `GIT_CONFIG_GLOBAL=/dev/null bun scripts/mutation-case.ts
"$PWD/src/server/projects/worktrees.ts" copy-worktrees` exited 0 in the focused baseline, with all original
assertions retained. This prepares that baseline for the host without a configured personal Git identity.

The first remote `bun test` completed with 2163 pass, 24 fail, 134542 assertions, 304 files, 1245.42 s.
Twenty-one failures traced to the startup-environment Git identity dependency, one to the hard-coded
temporary-directory expectation and two to the five-second default execution deadline. A final restore
fixture had silently ignored failed raw Git commits; it now reuses the existing checked `sh` fixture edge.
Its empty-startup-global focused case passes. The complete rerun uses `bun test --timeout 30000` under the
same remote caps. No assertion, explicit test deadline or production behavior is relaxed.

Remote browser preparation reuses the existing CI `bun x vite-plus` launch and exported `stopVite` cleanup
with a detached process group. This stops the owned frontend and its child processes together. The existing
CI-runner test file passed 8 tests, 32 assertions; no new process-management implementation was added.
The final local `bun --bun run check` exited 0, and `bun --bun run build` exited 0 (`✓ built in 5.92s`).

## Complete remote unit gate

`sw-midgard-run -- bun test --timeout 30000`: exit 0.

```text
2187 pass
0 fail
134686 expect() calls
Ran 2187 tests across 304 files. [1168.81s]
```

The final run retains every assertion. The isolated Git environment fixes, platform temporary-directory
expectation and bounded remote execution deadline address all 24 first-run failures. No test was skipped.
The serial browser/mutation command started only after this wrapper returned zero. Its pre-push content
check reported `97 unpushed commits checked, 0 findings`; the architecture marker was updated before that
authorized scratch push. No GitHub push occurred.

## First remote mutation baseline

The remote snapshot browser baseline exited 0 (`2 published snapshot browser checks passed.`), and the
full UI baseline exited 0 (`20 UI checks passed`). The mutation command stopped before introducing faults:
`Baseline failed (secrev-scm-case)` reported unknown Git author in its standalone Source Control fixture.
That helper now passes the existing isolated environment, matching the test-helper correction.
`GIT_CONFIG_GLOBAL=/dev/null bun scripts/mutation-case.ts "$PWD/src/server/projects/scm.ts"
secrev-scm-case` exited 0. No mutant, assertion or candidate behavior changed. The failed gate is retained
separately; the existing CI process-group cleanup stopped its frontend before the repeat.

## Remote example baseline deadline

The second remote run passed both browser baselines, then stopped at the unmodified `example-registry`
baseline with empty stderr. Its isolated remote command, `sw-midgard-run -- bash -c
'time bun scripts/mutation-case.ts "$PWD/src/shared/projects/examples.ts" example-registry'`, exited 0
in 17.234 s. The mutation runner previously killed it after 10 s. Only that category now has a bounded
30 s deadline, shared by its original and mutated candidates. All assertions and other category deadlines
remain unchanged. This is a remote execution-speed correction, not a surviving mutant or an exclusion.

## Completion gate and handoff

The final serial wrapper command exited 0 at `c73807e4`:

```sh
sw-midgard-run --pull out/008-remote-gate -- bun specs/008-published-snapshot/remote-mutation-gate.ts
```

```text
snapshot-browser: exit 0
ui-browser: exit 0
mutation: exit 0
2 published snapshot browser checks passed.
20 UI checks passed
695/695 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.
```

The wrapper exit file and each stage exit file contain zero. All nine visual mutants were detected.
No mutant was excluded, survived or declared equivalent. The pulled `mutation-error.log` retains its
15:08 UTC timestamp from the earlier failed run; the final run produced no stderr. The final stdout and
exit file were written at 15:46 UTC. Historical stderr is not evidence of a failure in the successful run.

Together with the complete unit result above, the final gates are: `bun test --timeout 30000`, 2187 pass,
0 fail, 134686 assertions, 304 files; `bun --bun run check`, exit 0; `bun --bun run build`,
`✓ built in 5.92s`, exit 0; and the full mutation result above. The affected browser and authentication
suites passed as recorded in verification. The sole exception is the unchanged 407/421 responsive assertion
reproduced on `origin/main` (`655df094`) and explicitly assigned elsewhere by the user. No task is skipped.

Architecture and documentation reviewers both returned PASS at `c73807e4`; no ranked finding remains.
The final architecture marker is recorded after this evidence-only commit. Public documentation additions
passed the leak scanner with zero hits; required internal proof files passed its confidential-content check.
The requested `scripts/commit_cadence.py` is absent (exit 2); no replacement tool was introduced.

The original handoff called for replacing the interim `surfaceFromCredential` function when
operation-boundary metadata arrived. The integration section below records that replacement as complete. The local
migration adopts existing default-branch commits without rewriting them; the copied pre-change data-root
test proves preservation of commits, refs, index and staged, unstaged and untracked contents across restart.
No production source changed after the native visual comparison. The final owned frontend was stopped by
the remote driver's cleanup; local ports 5321 and 5322 have no listener. No GitHub push, tag, merge or deploy
was performed. The wrapper's authorized scratch push is the only remote publication.

## Architecture correction scope ledger

Existing Git compare-and-swap and atomic pointer writes preserve outside-writer detection and durable commits.
The correction removes checkout-based default guessing, duplicate publication writers and independent queues.
Pinned reads must keep the captured registry and current reader visibility; personal notices must stay out of file views.
Tests exercise migration, publish-route failure, cross-entry-point serialization and pinned metric responses.

Default selection now prefers existing configured initial/main/master refs after remembered and remote names,
without publishing an arbitrary feature checkout. The local upgrade tests pass (8 tests, 38 assertions),
including feature-x with and without main. Typed personal notices migrate legacy synthetic file entries;
status tests pass (7 tests, 35 assertions), preserving other per-file state and explicit acknowledgement.

The single publication module now owns checks, intent, compare-and-swap, completion and supersession.
Local Publish/Adopt and server Publish/follow/Adopt use its repository queue, including base repair.
The publish-route failed-swap/restart proof passed with the publication recovery file (14 tests, 84 assertions).
Local publication tests passed (8 tests, 33 assertions); server publish safety passed (6 tests, 16 assertions).
A separate cross-entry-point race proves local Publish and server Adopt wait behind remote follow.
Publication validation now calls `snapshots.validate`, reusing the resolver's index construction boundary.

Pinned agent and metric reads now share `readableDocuments`; both return the same immutable commit header.
Removing the registry project before loading documents still produces the pinned response (4 route tests,
42 assertions). A later pin refuses the removed project. The resolver's registry cache follows the registry
file version, with no registry concern in the generic lock. Initialization only visits newly seen repositories;
registration does not re-adopt a repository after its initial attempt (9 upgrade tests, 40 assertions).
The request surface is attached by one setter to a request symbol. `readSource` is explicitly an inventory;
export is `by-query`. The shared resolver cache proof passed (8 tests, 79 assertions).

The three executable TypeScript proof drivers moved from the specification directory to `scripts/`:
`published-snapshot-performance-fixture.ts`, `published-snapshot-performance.ts` and
`published-snapshot-remote-gate.ts`. Imports and documented commands follow their executable home.
The repository formatter and complete local check passed after the moves. No runtime dependency changed.

The follow-up architecture review identified two remaining semantic gaps before the gate. A ref swap race
now has its own error, distinct from an ancestry refusal, so adoption preserves the `changed` response.
A local HTTP adoption race against a second fast-forward returns 409 and clears intent (3 tests,
17 assertions). Candidate validation now holds an active pin until the publication writer settles;
success promotes its index to the current generation, while refusal releases it. The first agent read
performs no second blob build, and a failed later candidate leaves retention unchanged (15 publication
tests, 91 assertions). The complete local check passed after both corrections.

The architecture reviewer returned PASS at `0e363ec2` after confirming adoption race classification and
candidate retention. Remote focused baselines for default selection, the writer, guarded adoption,
publication ordering and the shared queue all exited 0. The same command also passed the existing
working-copy baseline. Existing mutations follow their predicates into the single writer; none is removed.
New faults cover checked-out-feature preference, configured-default precedence, abandoned intent and queue
bypass, plus export inventory accuracy. The local check passes with these registered cases.

The first full remote unit attempt did not start tests: the wrapper's scratch Git transfer could not
connect to the remote SSH port and exited 128. Heavy commands remain remote-only; a wrapper retry follows.
Inspection of the existing journal writers found that replacing file-view settings could drop the newly
separate notice. Those writes now preserve personal metadata, and whole-project restore brings it back.
The existing move/delete/restore entry-point case passes with notice assertions for both owners (1 test,
36 assertions, 17 unrelated cases filtered); the complete local check also passes.

A read-only preflight found one older export mutation still anchored to the inventory's former `editing`
label. Its anchor now follows `by-query`, preserving the same audit-removal fault. All 686 source mutation
anchors are present. The active remote unit attempt uses its original transferred tree. Its first failures exposed outdated
fixture assumptions, so the complete unit/browser/mutation gate will restart with the corrected test tools.
No production source changed after these observations.


The remote unit attempt exposed three stale test assumptions: the stress barrier wrapped `documents`
rather than the new `readableDocuments` entry point; the metric test expected no published header; and
the reserved-name fixture relied on the checked-out branch implicitly becoming the default. The barrier
now wraps the actual shared read, releases and joins every request in `finally`, and still verifies 200
responses across 20 publications under its original 60-second deadline. Its focused run passes 601
assertions in 1.78 s. Metric list/explanation headers now assert the exact pinned commit (1 test,
11 assertions). The reserved-name fixture explicitly configures its default, retaining the refusal and
recovery checks (5 tests, 27 assertions). The complete local check passes; no assertion is removed.

The first transferred unit run printed: 2195 pass, 3 fail, 134126 assertions, 305 files, 1234.29 s.
Its timed-out barrier kept the process alive after that summary; no verified unit exit 1 is claimed.
The wrapper eventually exited 255 during its artifact-transfer connection failure.
All three failures are the fixture updates above; it did not enter the browser or mutation stages.
The next serial remote gate includes those fixes and the corrected export anchor. The published-controls
browser proof now checks both notice layouts and the unknown-default prompt across six viewport sizes,
retains captures, and explicitly acknowledges the new notice. Both full current capture journeys also run
in the gate; each suite has its own process group and the existing CI cleanup. The original native release
comparison remains labeled with its actual source revision, separately from the architecture corrections.


The unit summary was mistaken for process completion when starting its retry. That retry was stopped;
its local wrapper returned 143. Cleanup ran only through the authorized remote wrapper and selected test
processes by the exact checkout cwd, dev uid and `bun test --timeout` argv. It terminated the one matching
process (3336963) and exited 0. No other checkout or service was selected. The multiline inline cleanup
attempt first failed in wrapper quoting before executing; the successful one-line argument avoided that
unsupported shell form. The next heavy command starts only after verified wrapper completion.
The stress barrier now reuses the existing bounded `waitUntil` helper, so a missed hook fails inside five
seconds and reaches `finally` instead of leaving the test promise active after the suite summary.

The corrected remote unit gate passed: `2198 pass`, `0 fail`, `134740 expect() calls`,
`Ran 2198 tests across 305 files. [1221.61s]`; `unit.exit` is 0. The publication, general UI,
edge and grouping browser suites then exited 0. The examples suite failed while the previous billing
model was still selected five seconds after requesting the mall import. Its browser check now awaits
that import's HTTP response and asserts status 200 before the unchanged title assertion. No production
code, canvas assertion or assertion timeout changed. The wrapper completed with exit 1 and transferred
its logs before the next remote command. All browser stages and mutation are rerun serially below.

### Remote availability prevents the remaining correction gate

Three serial retries of `sw-midgard-run --pull out/008-review-gate -- bun
scripts/published-snapshot-remote-gate.ts` could not start tests. Verified wrapper exits were 255, 128 and
255, with SSH connection timeouts and rsync connection closures. Each wrapper completed before the next
started. The last failure occurred while copying the changed browser check, before the execution command.
The production correction is complete; the updated example synchronization remains browser-unverified.
`verification.md` now distinguishes the confirmed corrected-source unit/check/build and four browser
passes from the pending remaining browser, capture and 700-mutant gate. No earlier mutation result is
claimed for the corrections, no heavy local fallback ran, and no responsive assertion changed.

## Resumed remote browser gate

The wrapper now reuses one shared SSH connection. The working tree was clean on resumption:
the example-response synchronization and its evidence were already committed in `378537fe`.
`sw-midgard-run --pull out/008-review-gate -- bun scripts/published-snapshot-remote-gate.ts`
ran the following suites serially at source revision `a3419c2d`. Every listed suite exited 0:

| Command | Summary line |
| --- | --- |
| `bun run test:published-snapshot` | `2 published snapshot browser checks passed.` |
| `bun run test:ui` | `20 UI checks passed` |
| `bun run test:edges` | `6 edge attachment UI checks passed` |
| `bun run test:grouping-validation` | `8 grouping and validation UI checks passed` |
| `bun run test:examples:ui` | `19 example UI checks passed; no browser runtime errors.` |
| `bun run test:scm` | `18 source-control checks passed` (followed by its isolated temporary root) |
| `bun run test:mappings-layout` | `7 mapping layout checks passed` (followed by its isolated temporary root) |
| `bun run test:projects` | `8 project checks passed` (followed by its isolated temporary root) |
| `bun run test:auth` | `PASS Git history is refused for a person who cannot read every file` (last check; suite exit 0) |

The updated mall-import synchronization is browser-verified. The driver then stopped at the first local
capture state because `.workspace-toggle` was absent. No image had yet been captured. The auth stage had
rebuilt generated validators while Vite was running; this is an observed reload, not an established cause.
The local capture is retried alone with a fresh frontend; no geometry assertion or production code changed.
The original nine suite results remain valid. Mutation and the capture/responsive stages are still pending.

The isolated local capture completed with exit 0: `232` `MEASURE` lines, every one ending
`problems=0`; final line `MEASURE admin-access-check 2560 problems=0`. Its output contains 232 PNGs.
It used `sw-midgard-run --pull out/008-review-gate -- bash -c ...` to start a fresh Vite frontend on
5481, run `SW_BASE_URL=http://127.0.0.1:5481 bun scripts/polish-capture.ts
out/008-review-gate/capture-local`, and stop that owned frontend's process group on exit.
The earlier startup failure did not recur; no source, assertion or timeout changed for this retry.
The 34 publication-control PNGs are present. Native inspection of the 390 px known-default notice,
unknown-default notice and server Adopt state found readable text, accessible buttons, and no horizontal
clipping or overlap. The measured six-width publication checks already passed in both modes.

The isolated server journey also exited 0: `232` `MEASURE` lines, all `problems=0`, and 232 PNGs;
final measurement `MEASURE admin-access-check 2560 problems=0`. It ran remotely as
`bun scripts/polish-capture-server.ts out/008-review-gate/capture-server`. Both current full journeys
therefore contain 464 images, in addition to 34 focused publication captures. Native review of the local
and server Source Control captures at 1280 px found the publication status, branch and history readable.

### Remote responsive baseline comparison

`bun scripts/responsive-ui-tests.ts` through the wrapper exited 1 twice at its first assertion:
`Expected: > 503.99999999999994`, `Received: 481` at `scripts/responsive-ui-tests.ts:334`.
The assertion and all canvas code are unchanged. A temporary archive of the exact main/base revision
`655df094` was extracted under the remote checkout's `out/008-review-gate/main-baseline`; its identical
responsive suite and the already installed Vite executable reproduced the exact same values at the exact
same line, exit 1. The archive and its owned frontend were removed by the command's exit trap. This is
an additional pre-existing failure in the remote environment, not a passing full responsive gate.
The first baseline launch used `bun x` from the archive and selected a mismatched tool version; it failed
before browser navigation and is not comparison evidence. The successful comparison used the installed
`node_modules/vite-plus/bin/vp` executable. No dependency or source change was made.
The previously demonstrated main 407/421 mall failure remains separately documented above. Targeted
responsive groups continue below so the earlier remote failure does not hide their results.

The targeted dark-theme run passed its four named checks (390, 1280, 1440 and 2560 px), then exited 1
while preparing a subsequent page outside the selected checks: its UBL title was not present within
five seconds. No theme assertion failed. The remaining targeted groups are retried against the built
frontend, with the same scripts and assertions, avoiding development-module reloads.

The first resumed mutation wrapper lost its local session with SIGTERM. A wrapper-only process audit
confirmed the original remote test was still running; no second test was started. Monitoring that run
found exit 141 before any mutation summary, consistent with SIGPIPE from its `tee` output after the
connection closed. The retry writes directly to its remote log so test output does not depend on SSH.
That full retry exited 1 at the unmodified `admin-proposals` baseline, with empty assertion stderr.
An isolated remote measurement of the same original module passed: `admin-proposals baseline: exit 0,
16732ms`. Its ten-second harness deadline therefore cannot accommodate this measured remote runtime.
Only that category now shares the existing 30-second example-category deadline, equally for original
and mutated candidates. All assertions, mutation anchors and other deadlines remain unchanged.
The complete mutation gate must pass after this harness correction; the interrupted attempts are not
reported as killed mutants or as successful gates.

The next complete mutation attempt passed `admin-proposals` but stopped at the unmodified
`secrev-trash-routes` baseline, again without assertion stderr. Its isolated remote retry passed:
`secrev-trash-routes baseline: exit 0, 4810ms`. This does not justify extending that category's deadline,
so its ten-second bound remains. The harness now prints each successful baseline duration and names an
expired deadline in the error, instead of returning empty stderr on a timer kill. The complete gate is
rerun with these diagnostics; no baseline failure is counted as a detected mutant.

## Complete correction mutation gate

`sw-midgard-run --pull out/008-review-gate -- bash -c ...` ran
`SW_BASE_URL=http://127.0.0.1:5481 bun scripts/mutation-tests.ts` with its own frontend and direct log
redirection. At source revision `06ce59e6`, both the mutation result and wrapper exited 0:

`700/700 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`

All 686 source mutants, five askpass mutants and nine visual mutants were detected. No mutant was removed,
excluded or classified as equivalent. The log explicitly detects configured-default precedence,
checked-out-feature preference, omitted `pointers.abandon(repository)` and bypassed publication ordering.
Successful baseline timings include `BASELINE admin-proposals: 13962ms` and
`BASELINE secrev-trash-routes: 4840ms`. The measured administration deadline is necessary; the trash-route
category remains within its original ten-second deadline. The nine browser baselines already passed above.
Its owned frontend was stopped by the exit trap before the wrapper returned zero.
The remaining responsive groups now run serially against the built frontend, served by the application
on 5481 with a separate temporary data root. No source or check was changed for that run.

## Verification after disk repair

The resumed worktree is clean at `fc9b406e`. All 498 locally retained correction images were checked
against the committed capture index: `missing=0; hash mismatches=0`. No lost temporary log is used as
new evidence. Earlier unit, browser, capture and 700-mutant results remain available in their committed
entries above. Responsive results that had not been committed are rerun individually on midgard, and
each completed step is committed before the next. Full logs and new artifacts remain on the remote;
only small result summaries are copied back.

`bun --bun run check` after repair exited 0: TypeScript, formatter, lint, comments, theme and brand checks
all passed. Its final summary is `No product name or logo is hard-coded outside public/brand.`

### Responsive dark theme after repair

Remote `SW_BASE_URL=http://127.0.0.1:5481 RESPONSIVE_ONLY="dark theme:"
bun scripts/responsive-ui-tests.ts` against the built frontend exited 0:
`PASS no uncaught browser errors`; `5 responsive UI checks passed`.
The wrapper also exited 0. Full logs remain in `out/008-review-gate/restored-dark*.log` on midgard;
only `out/008-review-summary/dark-theme.txt` was pulled. The owned application server was stopped.

### Responsive graph canvases after repair

Remote `RESPONSIVE_ONLY="graph canvases:" bun scripts/responsive-ui-tests.ts` against the built
frontend exited 0: `PASS no uncaught browser errors`; `5 responsive UI checks passed`.
The wrapper exited 0. Only `out/008-review-summary/graph-canvases.txt` was pulled; complete logs remain
on midgard. The owned application server was stopped before starting another suite.

### Responsive shell after repair

Remote `RESPONSIVE_ONLY="shell screens:" bun scripts/responsive-ui-tests.ts` against the built
frontend exited 0: `PASS no uncaught browser errors`; `5 responsive UI checks passed`.
The wrapper exited 0. Only `out/008-review-summary/shell.txt` was pulled; full logs remain on midgard.
The owned application server was stopped.

### Responsive examples at 1440 px after repair

Remote `RESPONSIVE_ONLY="examples: 1440" bun scripts/responsive-ui-tests.ts` against the built
frontend exited 0: `PASS no uncaught browser errors`; `2 responsive UI checks passed`.
The wrapper exited 0. Only `out/008-review-summary/examples-1440.txt` was pulled; full logs remain on
midgard. The owned application server was stopped.

### Responsive examples at 2560 px after repair

Remote `RESPONSIVE_ONLY="examples: 2560" bun scripts/responsive-ui-tests.ts` against the built
frontend exited 0: `PASS no uncaught browser errors`; `2 responsive UI checks passed`.
The wrapper exited 0. Only `out/008-review-summary/examples-2560.txt` was pulled; full logs remain on
midgard. The owned application server was stopped.

### Responsive phone drawer after repair

Remote `RESPONSIVE_ONLY="sidebar: the phone drawer" bun scripts/responsive-ui-tests.ts` against the
built frontend exited 0: `PASS no uncaught browser errors`; `2 responsive UI checks passed`.
The wrapper exited 0. Only `out/008-review-summary/phone-drawer.txt` was pulled; full logs remain on
midgard. The owned application server was stopped. The six restored responsive groups total 21 passing
checks; none of their scripts or assertions changed.

### Remote mall canvas after repair

Remote `RESPONSIVE_ONLY="examples: 1280" bun scripts/responsive-ui-tests.ts` exited 1 after
`PASS examples: 1280×720 metric screens readable, no overlaps`. The unchanged assertion reported
`mall.odcs.yaml canvas height`, `Expected: >= 421`, `Received: 389`. This remote built-frontend value
is kept distinct from the earlier local 407 px reproduction. The wrapper exited 1; only the small
`out/008-review-summary/mall-1280.txt` failure summary was pulled. No canvas, assertion or timeout changed.
A matching build of the exact main/base revision is compared next; this failure is not reported as a pass.

### Matching remote mall baseline after repair

A fresh temporary archive of exact main/base commit `655df094` was built on midgard with the installed
Vite executable. Its unchanged `RESPONSIVE_ONLY="examples: 1280" bun scripts/responsive-ui-tests.ts`
reported the identical failure: `mall.odcs.yaml canvas height`, `Expected: >= 421`, `Received: 389`.
Both feature and baseline first passed `examples: 1280×720 metric screens readable, no overlaps` and
then exited 1 at the same height assertion. The baseline wrapper exited 1. Only the small
`out/008-review-summary/main-mall-1280.txt` result was pulled; full logs and builds stayed on midgard.
The temporary source archive, data root and owned application server were removed by the exit trap.

This establishes the remote 389/421 failure as pre-existing, independently of the earlier local
407/421 proof from a temporary origin/main worktree. The separate remote first-canvas 481/>504
comparison was already committed above. No canvas, responsive assertion, acceptance threshold or
runtime source changed to accommodate these failures. No complete responsive pass is claimed.
The six additional responsive groups all passed again after disk repair, with 21 checks in total.
The architecture reviewer reconfirmed PASS at `cc9ba64d`; production and harness code remain unchanged
from the already reviewed and tested revisions. No requested application task was skipped.

### Final cleanup and consolidation

The wrapper-only remote audit exited 0 and reported:
`{"baseline_data_exists": false, "baseline_source_exists": false, "owned_runtime_processes": []}`.
It checked only runtime processes owned by the remote dev user with this checkout as their working
root. No other checkout, process or service was stopped. New heavy outputs stayed on midgard; only
small summaries were pulled after disk repair. The local readable-code check for the changed harness,
example test and stress test, the docs-sync check and `git diff --check` all exited 0.
The repository formatter explicitly excludes `specs/**` and Markdown; new documentation paragraphs
are wrapped within its 200-column convention. The final verification table now distinguishes every
passing core gate from the proven pre-existing responsive failures. Architecture PASS was reconfirmed
at `cc9ba64d`; the final documentation reconciliation is reviewed before handoff.

The final documentation review returned PASS: the table separates successful core gates from responsive
exits 1, keeps all three environment-specific height measurements distinct, and contains no stale pending
claim in the latest status. Confidential-content scans of the four evidence/capture-index files exited 0;
docs-sync and whitespace checks exited 0. Local ports 5321 and 5322 have no listeners.
`python3 scripts/commit_cadence.py "$PWD"` was attempted again and exited 2 because the repository does
not contain that script; no replacement tooling was introduced. Every completed post-repair gate step
was committed separately, and no large artifact was written or pulled locally during this resumption.

## Operation-boundary integration scope ledger

The operation boundary already authenticates minted callers, admits inventory rows and preserves HTTP refusals and audit outcomes.
Published snapshots already pin immutable Git bytes and serialize publication without rewriting author commits.
The integration replaces credential-derived surfaces with caller metadata and routes publication/read operations through that existing boundary.
Inventory/parity cases must prove HTTP and trusted invocation preserve snapshot choice, permissions and publication races.
The branch is rebased onto origin/main `a153c20f` under constitution 4.0.1; the frozen HTTP characterization remains unchanged.


### Operation-boundary rebase and caller surface

Rebased all feature commits onto `origin/main` `a153c20f`, retaining the 010 middleware, caller mint,
request limits, audit outcome handling and mutation timeout verdicts. Publication audit metadata now
travels through that boundary rather than restoring the old middleware. The pre-rebase commits remain
reachable through `refs/backup/008-before-operation-boundary`.

The interim `surfaceFromCredential` seam is removed. The HTTP adapter mints browser metadata only
after its existing authentication and origin checks; the operation boundary attaches that caller
metadata to requests. MCP requests always use the consumer surface. Adoption, personal publication
notice acknowledgment and browser previews now have inventory entries. Following the remote default
requires both remote and publication connection effects.

Focused proof: `bun test tests/request-surface.test.ts tests/auth/operation-inventory.test.ts`:
`13 pass, 0 fail, 247 expect() calls; Ran 13 tests across 2 files. [760.00ms]`.

The installed remote wrapper still force-pushes its scratch ref. Integration gates use a worktree-local
copy with `--force` removed and a new scratch namespace, preserving its shared SSH connection,
unprivileged execution and resource limits. No GitHub push or existing remote ref rewrite is involved.


### Internal publication steps and protocol parity

The inventory now names pointer advance, abandoned intent, snapshot reads and the startup upgrade.
`operation-execution.ts` carries the admitted operation’s allowed steps, so domain code cannot run
a pointer transition from a snapshot-read operation. Internal steps share the enclosing route’s
authorization and audit outcome rather than introducing endpoints for partial publication. The
trusted startup upgrade is registered separately with no transport dispatch and is rejected as a
protocol operation id. The existing single per-repository queue remains the publication writer.

Focused proof: `bun test tests/auth/published-operation-parity.test.ts`: `3 pass, 0 fail,
23 expect() calls; Ran 3 tests across 1 file. [2.57s]` before the additional startup refusal case.
The remote pre-integration parity diagnostic passed all 22 parity cases. Its frozen HTTP check
found 65 extra captures because the current route probe list includes five new rows for 13 callers;
the recording itself remains unchanged. Its input driver is being limited to the recorded rows,
with new rows covered separately by publication parity cases.

Final focused proof for this step: `bun test tests/auth/published-operation-parity.test.ts
tests/auth/operation-inventory.test.ts`: `11 pass, 0 fail, 258 expect() calls; Ran 11 tests across 2 files. [2.39s]`.


### Review corrections for lifecycle and byte reads

The independent architecture review found three integration gaps, all corrected: clone and
repository registration now declare initialization’s local-write/publication connection effects;
the parser rejects owners that omit lifecycle effects; published ZIPs check the snapshot step at
the shared pinned-file entry; startup intent reconciliation runs in the registered lifecycle.
The review of these corrections returned PASS, pending the full gate.

`git.pullDefault` retains its existing `localWrite` effect: it merges the published default into
the authoring copy. It is not remote follow. Fetch retains its existing dynamic publication-scope
check before advancing the published default. This corrects the earlier integration note above.

Proof: `bun test tests/auth/published-operation-parity.test.ts tests/auth/operation-inventory.test.ts`:
`14 pass, 0 fail, 269 expect() calls; Ran 14 tests across 2 files. [7.59s]`.


### Frozen HTTP compatibility after snapshot integration

The frozen `tests/fixtures/characterization/http-v1.json` is byte-for-byte unchanged. The input
driver runs its original 1,547 recorded caller/route cases, excluding only newly added route rows.
Comparison preserves every original response field and audit outcome. The intentional additive
`published` identity on `/api/projects` is asserted as a branch/full commit pair, then omitted
from the comparison with the older shape. It is the only response projection. New operations
have separate parity and published-definition tests.

Remote `bun test tests/auth/http-characterization.test.ts`: `1 pass, 0 fail,
1576 expect() calls; Ran 1 test across 1 file. [21.00s]`.


### Mutation proof integration

Updated the surface mutant and its assertions to authenticated caller metadata. Added faults
for dropping the admitted execution context and accepting an unowned internal step. Existing
default-selection, abandoned-intent and single-queue mutants remain registered. The boundary
mutation baseline ran remotely with `bun scripts/mutation-case.ts
$PWD/src/server/auth/operation-boundary.ts operation-boundary`: `operation boundary baseline exit 0`.
The complete mutation gate remains required below.


## Integrated completion gate on operation boundary

All commands below run serially through the no-force worktree-local copy of `sw-midgard-run`,
using a fresh scratch namespace and the installed wrapper’s resource/SSH behavior. Complete logs
and browser output remain on midgard. Only small summary text is pulled back.

- `bun --bun run check`: exit 0. `All matched files use the correct format.`;
  `Found 2624 warnings and 0 errors.`; `Comments are free of specification and task IDs.`;
  `No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.`;
  `No product name or logo is hard-coded outside public/brand.`
- The readability checker and docs-sync checker both exited 0 with no findings.
- The independent documentation review returned PASS for caller surfaces, lifecycle ownership,
  frozen comparison and the single-suite remote driver.

The driver accepts one named suite so each finished browser or mutation gate can be recorded
and committed independently, and always stops its owned frontend.


### Full-test integration corrections

The first integrated `bun test` failed: `2272 pass, 7 fail, 183072 expect() calls;
Ran 2279 tests across 322 files. [1422.25s]`. No failure was accepted as a baseline exception.
The read matrix now publishes its added semantic fixture before consumer reads, and the preview
matrix creates a real session through the session store instead of treating a cookie string as
authenticated metadata. The isolated snapshot mutation harness joins the existing boundary-scan
fixture allow-list. The complete audit serializer input includes publication identifiers.
Identity attachment initializes publication metadata and clears outcomes on a reused request.

The generated administration comparison changes from 963 to 1,008 matrix cases because the
five added routes join its nine-principal policy replay. Original audit records and the frozen
HTTP fixture remain unchanged. The regenerated baseline adds only those route decisions and count.

Focused remote proof: `bun test tests/kpi-save.test.ts tests/auth/matrix.test.ts
tests/auth/request-identity.test.ts tests/auth/boundary-scan.test.ts
tests/auth/dry-run-baseline.test.ts tests/auth/audit-origin.test.ts`:
`35 pass, 0 fail, 42962 expect() calls; Ran 35 tests across 6 files. [101.70s]`.
The capped remote’s cold mall KPI workflow took 8,375.70 ms; that test now has a 30-second
execution budget with every content, journal and binding assertion preserved.
Additional reuse proof: `bun test tests/auth/request-identity.test.ts`: `1 pass, 0 fail,
18 expect() calls; Ran 1 test across 1 file. [623.00ms]`.


Second integrated full run: `2278 pass, 1 fail, 1 error, 208933 expect() calls;
Ran 2279 tests across 322 files. [1557.90s]`. Every earlier functional failure is fixed.
The remaining failure is the unchanged metric-binding fixture taking 5,169.61 ms against Bun’s
default 5,000-ms test timeout; the killed fixture also produced the dangling-process error.
The remote complete-suite retry uses `bun test --timeout 30000`, preserving every assertion
and explicit per-test limit while budgeting the capped shared machine consistently.


- Final complete unit/integration gate, remote `bun test --timeout 30000`: `2279 pass,
  0 fail, 208937 expect() calls; Ran 2279 tests across 322 files. [1638.93s]`.
  Exit 0. The timeout budget is the shared-remote execution adjustment described above.

- Final remote `bun --bun run check` after fixture/identity corrections: exit 0;
  `All matched files use the correct format.`; `Found 2624 warnings and 0 errors.`;
  comment, theme and brand checks all passed with their unchanged success lines above.
  Readability, docs-sync and public-doc/internal-evidence leak checks also exited 0 with no findings.

- Final remote `bun --bun run build`: exit 0; `✓ built in 3.12s`.
  The existing module-directive and large-chunk warnings remain warnings.
- Final architecture review remains PASS after publication-outcome reset; no fix-first finding remains.

- Final remote frozen HTTP gate, `bun test tests/auth/http-characterization.test.ts`:
  `1 pass, 0 fail, 1576 expect() calls; Ran 1 test across 1 file. [29.20s]`.
  Frozen fixture SHA-256 remains `64ee445a73ffc360c337bd4cb8fad37216bad4ddf5f264c54907b412d84d124d`,
  identical to `origin/main`; the additive project identity is asserted by the explicit comparison above.

- Final remote mutation gate, `bun scripts/published-snapshot-remote-gate.ts test:mutation`
  (runs `bun scripts/mutation-tests.ts` with its owned frontend): exit 0;
  `722/722 targeted mutants killed; all unmodified module baselines passed.
  Run test:ui for the full browser baseline.`
  All source, askpass and visual cases completed. Default choice, abandoned intent, the shared
  queue and the newly registered operation-context faults were all detected.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:published-snapshot`: exit 0;
  `2 published snapshot browser checks passed.` Local and server controls passed geometry
  checks at all six viewports. Screenshots remain on midgard; no image folder was pulled locally.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:ui`: exit 0;
  `20 UI checks passed`. This includes repaired saved mapping references, changed mapping
  selection, stale response protection and no browser runtime errors.

- The first isolated `test:edges` run failed before any edge assertion: the cold frontend had
  not rendered `.workspace-title h1` within the helper’s default five seconds. Its initial
  model-readiness call now uses the existing 30-second option; attachment distances, geometry
  and every edge assertion are unchanged.
- Remote retry `bun scripts/published-snapshot-remote-gate.ts test:edges`: exit 0;
  `6 edge attachment UI checks passed`. Includes worker routes, entity/area dragging,
  layout changes and no browser runtime errors.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:grouping-validation`: exit 0;
  `8 grouping and validation UI checks passed`. Exact fixture exports and the absence of
  uncaught browser errors were verified by the suite.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:examples:ui`: exit 0;
  `19 example UI checks passed; no browser runtime errors.` Includes mapping chains,
  governed metric lineage, breakdown and unexecuted SQL previews.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:scm`: exit 0;
  `18 source-control checks passed on isolated data root
  /srv/dev/tmp-008-published-snapshot-boundary-20261117/workbench-browser-9CpftC.`
  Includes missing-Git behavior, native actions and panel geometry at 390, 1280, 1440 and 2560 px.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:mappings-layout`: exit 0;
  `7 mapping layout checks passed on isolated data root
  /srv/dev/tmp-008-published-snapshot-boundary-20261117/workbench-browser-38Jb3l.`
  Includes project-local selection, bounded mapping lists and no uncaught browser errors.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:projects`: exit 0;
  `8 project checks passed on isolated data root
  /srv/dev/tmp-008-published-snapshot-boundary-20261117/workbench-browser-zLR1zC.`
  Includes cache rebuild/restart, exact ZIP round trip, project context and new-file creation.

- Remote `bun scripts/published-snapshot-remote-gate.ts test:auth`: exit 0;
  `test-auth: exit 0`. The suite completed the real local mock-provider flow, visibility
  checks, permitted-file project export and refusal of history for partial readers.
  It has no numeric final summary, so no count is inferred.

- Remote full `bun scripts/published-snapshot-remote-gate.ts test:responsive`: exit 1 at
  the previously reproduced first-canvas baseline: `Expected: > 503.99999999999994; Received: 481`
  (`scripts/responsive-ui-tests.ts:334`). This exactly matches the unchanged-main remote
  proof recorded earlier. The full run stops before the separately documented local mall
  407/421 assertion; it does not establish a new mall result. Neither the canvas nor its
  check was changed. This is the user-authorized pre-existing responsive exception, not a green suite.
  The six remaining responsive groups are rerun separately below.

- Remote `RESPONSIVE_ONLY="dark theme:" bun scripts/published-snapshot-remote-gate.ts
  test:responsive`: exit 0; `5 responsive UI checks passed` (four viewports plus no
  uncaught browser errors). The canvas assertions remain unchanged.

- Remote `RESPONSIVE_ONLY="graph canvases:" bun scripts/published-snapshot-remote-gate.ts
  test:responsive`: exit 0; `5 responsive UI checks passed` (390, 1280, 1440 and 2560 px
  plus no uncaught browser errors). Names, overlaps and toolbar geometry passed.
