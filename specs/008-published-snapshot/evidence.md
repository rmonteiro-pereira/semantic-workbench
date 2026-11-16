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
