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
