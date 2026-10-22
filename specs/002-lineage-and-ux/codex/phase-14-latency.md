# Codex brief: Phase 14, typing latency in a 1.9 MB file

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests to make them pass; do not loosen any budget.

## Goal

Typing in the Source editor on a 1.9 MB YAML file must cost at most **22 ms per keystroke with
an automatic save in flight** on a quiet machine (today about 27 ms without a save and 29.5 ms
with one; v0.2.0 measured 13–22 ms). The measure is the one in
`scripts/editor-browser-check.ts`, check "typing in a 1.9 MB file stays responsive to each
keystroke while an automatic save runs": the mean Event Timing duration of `keydown` events
over 39 keystrokes, with keys under 16 ms counted as 16 ms. Every byte the user did not edit must
stay exactly as it was (byte-exact preservation is a project invariant), and no keystroke may be
lost or reordered.

## What the profile shows (Chrome CPU profile, 46 keystrokes at line 4, quiet machine)

1. **YAML re-parsing on every transaction.** `@codemirror/language` `LanguageState.apply`
   re-parses synchronously up to `max(treeLen, viewport.to)` with a 20 ms budget. With
   `@lezer/yaml` 1.0.4 no node is ever reused from the previous tree: instrumenting
   `tryReuse` shows 108,056 attempts and 0 hits even on an unchanged document, because nodes
   carry a context hash that never matches the tracker's current hash. So each keystroke
   re-parses from the start up to how far the background parse got (up to 100 kB past the
   viewport), up to ~15 ms per key. JSON (`@lezer/json`) reuses fine (0.7 ms for the same work).
   A strict:false tracker or a different hash does not restore reuse (tested).
   Bench scripts you can run with `bun` (no browser needed):
   `scripts/.profile-tmp/parse-bench.ts`, `reuse-bench.ts`, `reuse-debug.ts`, `hash-bench.ts`.
2. **React re-renders the whole app on every keystroke** (`renderWithHooks` ~240 ms,
   `jsxDEV`/`createElement` ~200 ms over 46 keys, i.e. 5–8 ms per key in the dev build that the
   check uses). `SourceView` calls `setSource` (state in `src/app/useWorkbench.tsx`) on every
   change, and `main.tsx` passes `source` to many components. `useCodeMirror` also sets cursor
   state on every update.
3. Smaller: `applyNormalizedChanges` in `src/editor/editorText.ts` rebuilds the 1.9 MB string
   per keystroke (~0.8 ms); native style/layout/paint is the rest.

**Rejected attempt:** wrapping `setSource` in `startTransition` lost a keystroke: a late render
passed an older `value` to the editor, which `useCodeMirror` treats as an external replacement.
Any change that lets the app's copy of the text lag must keep the editor as the source of truth
and never push an older text back into it.

## Directions (choose what works; measure with the bench scripts)

- Make the YAML parse cost proportional to the edit, not the file. For example, give
  CodeMirror a YAML language whose parser reuses work (a fix in how we configure
  `@lezer/yaml`, or a `StreamLanguage` YAML mode from `@codemirror/legacy-modes` for large
  documents above a size threshold, keeping SQL and JSON highlighting inside YAML for normal
  files), or keep the parse ahead short for large documents. Keep the highlighting colours,
  the embedded SQL/JSON highlighting on the shipped examples and the editor checks' behaviour.
- Stop re-rendering unrelated parts of the app per keystroke: memoise heavy subtrees
  (`React.memo` with stable props and callbacks), keep the cursor position local to the editor
  status bar, and let consumers that only need the text later (validation, views, save state)
  read it without forcing a full app render on each key, while autosave and drafts still see
  every edit.
- Keep `useCodeMirror`'s external-replacement rule safe (an echo of text the editor itself
  produced must never be re-applied).

Files: `src/editor/useCodeMirror.ts`, `src/editor/languages.ts`, `src/editor/editorText.ts`,
`src/editor/EditorStatusBar.tsx`, `src/app/SourceView.tsx`, `src/app/useWorkbench.tsx`,
`src/main.tsx` and the components they render, as needed. Add a short note to
`specs/002-lineage-and-ux/research.md` (section "R29. Typing latency") with what you changed and
the bench numbers before and after; the reviewer adds the browser numbers.

## Checks (the reviewer runs the browser checks; your sandbox cannot open ports)

- `bun --bun run check`, `bun test` (including `tests/` for patches and editor text).
- The reviewer runs `bun run test:editor` (latency and byte-exact saves), `test:autosave`,
  `test:sql` (SQL colouring inside YAML), `test:ui` and the rest.
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
