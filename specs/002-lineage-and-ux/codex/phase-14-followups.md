# Codex brief: Phase 14 follow-ups from the second architecture review

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify existing tests to make them pass (you may rewrite the tests
named below, which test code paths the editor never runs).

1. **One rule for when the large-file mode is decided** (`src/editor/documentMode.ts`,
   `src/editor/useCodeMirror.ts`). Rule: the mode is decided when a document opens (mount, or a
   different document id); typing and external replacements of the same document keep it; the
   user's switch (**Full parsing** / **Large file mode**) overrides it until another document
   opens. Reduce `documentMode.ts` to `initialDocumentMode(length)` and
   `resolveDocumentMode({ length, previous, override, newDocument })`; inline the trivial toggle.
   Rewrite `tests/editor-document-mode.test.ts` so it tests these functions as the hook uses
   them. Make `ARCHITECTURE.md` and the README sentence (search "500,000") say the same rule.
2. **One home for the threshold**: move `largeDocumentThreshold` into `documentMode.ts`;
   `languages.ts` stops exporting it; build the status-bar tooltip in
   `src/editor/EditorStatusBar.tsx` from `largeDocumentThreshold.toLocaleString('en-US')`.
3. **Test the stable handler hook itself** (`src/app/useStableHandler.ts`): a render test that
   re-renders a parent with a new handler, checks the returned function keeps its identity, and
   that calling it from an event runs the newest handler; then make `forwardToLatestHandler`
   module-private. Follow how the repo's existing tests render React, if any; otherwise use
   `react-dom/server` or `react-test-renderer`-free approaches available in the dependencies,
   without adding a dependency.

Checks: `bun --bun run check`, `bun test`. The reviewer runs the browser checks.
## Code style (mandatory, overrides the style of the surrounding code)
- Run the repo's formatter on every file you change; if there is none, format as
  Prettier/ruff/gofmt would at 100 columns.
- One statement per line; one variable per declaration; no line over 100 characters.
- Descriptive names; small functions (about 40 lines) and components (about 150 lines);
  no nested ternaries; extract long inline handlers into named functions.
- Comments explain why, in plain English, one idea per sentence. Never put spec, task or
  requirement IDs (FR-xxx, T0xx, US3, R12) or process notes in code comments; put
  traceability in the commit message.

## Design (mandatory)
- Read ARCHITECTURE.md and README first. Find how this repo already does the same
  kind of thing (config, errors, logging, data access, tests) and follow it.
- Put code in the module that owns the concept. Name new modules after domain
  concepts, never utils, helpers, common or manager.
- Keep decisions in pure functions. Keep I/O (HTTP, database, files, env, clock)
  at the edges, and pass dependencies in as parameters.
- Validate input at the boundary into typed objects and trust them inside.
- No abstraction, interface or design pattern without a need present in the code
  now (rule of three). No inheritance beyond one level.
- Raise specific errors with context. Never swallow an error.
- In the same change, update README, ARCHITECTURE.md or docs/ for any new env var,
  CLI flag, route, module, or change to how the project is run.

Report briefly what you changed, the bench numbers before and after, and anything you could not do.
