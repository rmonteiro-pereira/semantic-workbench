# Codex brief: Phase 14, keep features in the large-file editor mode, and show it

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify existing tests to make them pass (add new ones). Keep every
change already in the tree (staged) and build on it.

## Context

YAML files above 500,000 characters (`src/editor/documentMode.ts`, `src/editor/languages.ts`,
`src/editor/useCodeMirror.ts`) now use a `StreamLanguage` YAML highlighter, because the
`@lezer/yaml` tree re-parsed on every keystroke and typing cost about 30 ms per key in a 1.9 MB
file; it is now about 17 ms. In that mode the editor lost three things: SQL colouring inside SQL
values (`expression`, `query`, `transformLogic` keys), JSON colouring inside
`SEMANTIC_WORKBENCH` extension blocks, and folding. Validation, findings, autosave and drafts
are unchanged (they run in the worker and on their existing timers).

The owner's rule: prefer keeping every feature and making it lazier over disabling it; anything
that is reduced must be visibly indicated and re-enableable.

## Tasks

1. **Keep SQL and extension-JSON colouring in large mode, viewport only.** A
   `ViewPlugin` that, for the visible ranges only (`view.visibleRanges`, recomputed on
   viewport change and, debounced, after edits), finds values that hold SQL with the same rule
   the full parser uses (`SQL_KEY_BEFORE` and the key-path check in `languages.ts`; reuse those
   functions, extracted if needed, rather than copying them) and decorates them with the SQL
   highlighting of `StandardSQL` (parse each visible value with `StandardSQL.language.parser`
   and map tokens to the existing `HighlightStyle` classes); same for JSON inside
   `SEMANTIC_WORKBENCH` `data` blocks. Work stays proportional to what is on screen.
2. **Keep folding**: an indentation-based `foldService` for large YAML (fold a line's block of
   deeper-indented lines), so the fold gutter keeps working.
3. **Indicate the mode and let the user leave it**: in the editor status bar
   (`src/editor/EditorStatusBar.tsx`), show `Large file mode` when it is on, with a tooltip:
   "This file is over 500,000 characters. Colouring and folding work on what is on screen so
   typing stays fast." and a button **Full parsing** that switches this document to the full
   parser (it stays switched until another document opens; the status shows `Full parsing` with
   a button **Large file mode** to switch back). Accessible names exactly as written.
4. **Docs**: update the README sentence about the reduced mode (search "500,000") to describe
   the viewport-only behaviour and the status bar switch; add a line to research R29.
5. **Tests** (new files in `tests/`): the SQL-region finder returns the same SQL ranges as the
   full parser on the shipped examples (e.g. `public/examples/commerce/sales.ossie.yaml`,
   `public/examples/mall/mall.semantic.yaml`) when given their whole text; the fold service
   folds an indented block; the mode toggle helper.

## Checks (your sandbox cannot open ports; the reviewer runs the browser checks and the latency
measurement, which must stay ≤ 22 ms per key with a save in flight)

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
