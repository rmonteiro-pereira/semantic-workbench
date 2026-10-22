# Codex brief: Phase 14, typing latency, part 2 (React re-renders)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests to make them pass; do not loosen any budget.
Keep the uncommitted changes already in the tree (the large-YAML streaming highlighter in
`src/editor/languages.ts` and `src/editor/useCodeMirror.ts`, research R29) and build on them.

## Goal

Typing in the Source editor on a 1.9 MB YAML file must cost at most **22 ms per keystroke with
an automatic save in flight** (measured in the browser by `scripts/editor-browser-check.ts`:
mean `keydown` Event Timing duration over 39 keystrokes, keys under 16 ms count as 16). After
part 1 it is about 26 ms. Every byte the user did not edit must stay exactly as it was; no
keystroke may be lost; autosave, drafts, validation and every view keep working.

## Profile after part 1 (Chrome CPU profile, 46 keystrokes, quiet machine, dev build)

- React work per keystroke ≈ **9 ms**: `performWorkOnRoot` 434 ms in total,
  `renderWithHooks` 270 ms, `jsxDEV`/`createElement` ~200 ms, `lucide-react` icon components
  97 ms (icons all over the app re-render), commit 107 ms with `commitHostUpdate` 48 ms (DOM
  props changing on each key). This is a synchronous render of the whole app on each change:
  `SourceView` (`src/app/SourceView.tsx`) calls `setSource`, whose state lives in
  `src/app/useWorkbench.tsx`, and `src/main.tsx` passes `source` (and objects or callbacks
  derived from it, recreated on each render) to the header, sidebar, canvas, dialogs and status
  footer.
- CodeMirror's own update ≈ 3 ms; `applyNormalizedChanges` ≈ 1.2 ms (rebuilds the 1.9 MB
  string per key); native style/layout/paint ≈ 11 ms.

## What to do

1. Find which components re-render per keystroke and why (props that change identity on each
   render: inline objects and callbacks, `source` passed only to compute something cheap, a
   save-state object recreated each time). Use React's own tools reasoning, not guesses:
   read `src/main.tsx`, `src/app/*.tsx`, `src/app/use*.tsx`.
2. Make a keystroke re-render only what must change: the editor and the save indicator.
   Typical fixes: `React.memo` on heavy subtrees (sidebar and project tree, canvas and views
   that are not visible in the Source tab, header, toolbar) with stable callbacks
   (`useCallback`, or refs read inside handlers), pass derived booleans (`dirty`) instead of
   the whole text, keep the editor cursor position inside the editor's status bar component,
   and avoid DOM attribute churn (a `title` or `aria-*` that embeds the text length or time).
3. Do not let the editor's text lag behind in a way that can push an older text back into the
   editor (a `startTransition` around `setSource` was tried and lost a keystroke, because
   `useCodeMirror` treats a `value` different from its own bytes as an external replacement).
   If you defer anything, keep the editor as the source of truth and make the echo rule safe.
4. Optionally avoid rebuilding the whole 1.9 MB string on each key when no consumer needs it
   yet, only if it stays simple and byte-exact.
5. Add to `specs/002-lineage-and-ux/research.md` section R29 a short paragraph on what changed
   and why (the reviewer adds the browser numbers).

## Checks (the reviewer runs browser checks; your sandbox cannot open ports)

- `bun --bun run check` (ignore formatting complaints about `scripts/.profile-tmp/`, a
  temporary folder the reviewer removes), `bun test`.
- The reviewer runs `test:editor`, `test:autosave`, `test:ui`, `test:examples:ui`,
  `test:projects`, `test:responsive` and the rest.
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
