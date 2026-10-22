# Codex brief: Phase 14, architecture review fixes for the latency change

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify existing tests to make them pass (adding new tests is
expected). Keep every uncommitted change in the tree and build on it.

## Fixes

1. **Large-file mode decided once per document** (`src/editor/useCodeMirror.ts`). Today
   `largeDocument` is recomputed from `value.length` on each render, so a file near 500,000
   characters switches parsers back and forth while typing, and switching back re-parses the
   whole file with `@lezer/yaml`. Decide the mode when the editor mounts and when an outside
   replacement (the `external` path) brings a new text; typing never switches it.
2. **Document the reduced mode** in `README.md`, in the Source editor paragraph (search for
   "Source and import-repair editors share one editor"): YAML files above 500,000 characters get
   plain YAML colouring for speed, without SQL or extension-JSON colouring and without folding.
   One or two sentences; keep the file's one-paragraph-per-line layout; no re-wrapping.
3. **Rename the hook** `src/app/useWorkbenchAction.ts` to `src/app/useStableHandler.ts`
   (`useStableHandler`), update `src/main.tsx` and `ARCHITECTURE.md`. Its doc comment states the
   contract: the returned function calls the latest committed handler; call it from event
   handlers or passive effects, never during render or from a child's layout effect (child
   layout effects run before the parent's, so they would see the previous handler). Move the two
   hand-written "latest handler" refs in `src/app/useInspector.tsx` (around line 95) and
   `src/app/useItemEditing.tsx` (around line 206) onto it, only if that keeps their behaviour
   identical; otherwise leave them and say why.
4. **Do not wrap stable setters**: in `src/main.tsx`, pass `setTab` directly instead of
   `useWorkbenchAction(setTab)`; wrap only handlers that close over changing state.
5. **Tests** (new files under `tests/`, plain-sentence test names):
   - `languageFor('YAML', true)` returns a `StreamLanguage`-based support whose tokens tag a
     YAML key as a property-name definition (the same colour as small files), and
     `languageFor('YAML', false)` keeps the mixed SQL/JSON YAML parser.
   - the large-file mode is chosen by size once: an edit that crosses the threshold does not
     change the mode (test the pure decision function you extract for fix 1).
   - `useStableHandler` calls the newest committed handler (test the pure part, or render with
     `react-dom/server` / a tiny harness if the repo already does that; follow existing tests).
6. Add one sentence to `specs/002-lineage-and-ux/research.md` R29 for each fix.

## Checks (your sandbox cannot open ports; the reviewer runs browser checks)

- `bun --bun run check`, `bun test`.
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
