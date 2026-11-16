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
