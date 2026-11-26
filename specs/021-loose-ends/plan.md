# Implementation Plan: Loose Ends

**Branch**: `021-loose-ends` from `main` at `4efb44e2`.

## Order

1. **Dispositions first** (Claude, no code): tick 017 T005 with its disposition and confirm each remaining
   source task's text against `main`, so the work list is exact.
2. **Code and docs session** (one Sol job, about 300 calls): the four label follow-ups, 018 T045, 016 T033
   and 018 T061. Each task runs only its own tests, `bun --bun run check` and the formatter.
3. **Codex CLI acceptance** (013 T039): a short separate run with a temporary `DATA_DIR`, the stdio bridge
   and a throwaway project. It needs a model session, so it is a small Codex job of its own.
4. **Shared capture job** (Sol): one capture of every listed state on midgard from a fresh worktree of the
   branch, then visual review cropped to changes (at most 30 images per batch, 120 per job), then 018 T054
   fixes and a targeted recapture.
5. **Batch gate**: full unit suite, mutation, browser suites, the whole-journey UI comparison against
   `main` at `4efb44e2`, architecture review, then Astra code review (at most 3 rounds), then merge and
   the sw-dev redeploy.

## Design notes

- **Painted-curve visibility.** The label hook already measures the painted SVG path. Visibility uses
  that path's own geometry (`getTotalLength` and `getPointAtLength` at a spacing tied to the viewport
  scale, or the path's bounding box first as a cheap reject) instead of the chords sampled for placement.
  It lives in the module that owns label placement, not in the component.
- **Late reports.** The hook keeps a mounted flag in a ref set by the same effect that cancels the frame;
  `reportLabelRoute` returns early when it is false. The StrictMode test renders the hook under
  `<StrictMode>`, reports one route, and counts measurements.
- **Shortening `useFullGraphEdges`.** Pass the input object through instead of destructuring and
  rebuilding it, and move the per-connection appearance builder into a named function in the same module.
  No signature change.
- **Importer visibility test.** Static import scan of `src/server/usage/**` and `src/server/mesh/**` with
  the TypeScript import list, plus one fixture dependents answer checked for forbidden keys.
- **Agent context docs and test.** Follow the published-projection paragraph in `docs/mcp.md`; the tool test
  uses the 016 governance fixture and asserts the absent fields by name.

## Constraints

- Code style, Design and Docs blocks from the skills go into every brief that writes code.
- Heavy runs use `sw-midgard-run`. Until main rules on the midgard identity, no job uses `root@midgard`;
  steps 4 and 5 wait for that ruling if it is still open when they are due.
- Codex budget per the day's lane allowance; at most 2 Workbench jobs and 3 Sol overall at once.
