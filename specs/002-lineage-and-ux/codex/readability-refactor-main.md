# Codex brief: split src/main.tsx's App into readable pieces

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or scripts. Other agents are editing other files at the
same time: change only `src/main.tsx` and new files you create under `src/app/`.

Read specs/002-lineage-and-ux/codex/readability-style.md first; it is mandatory.

## Task

`src/main.tsx` holds a ~2,700-line `App` component with about 110 hooks and inline handlers. Make
it readable with no behaviour change:

- Move cohesive state and effects into named hooks under `src/app/`, for example:
  `useWorkspace` (documents, projects, refresh, events), `useSidebar` (compact mode, drawer,
  hidden state, width and resize separator, Examples group), `useMetrics` (KPI list loading,
  selection, filter, wizard), `useWalk`/neighborhood focus, `useImport` (import dialog, repair,
  conflicts, file input routing), `useItemEditing` (editing, adding, deleting targets).
- Move large JSX regions into components under `src/app/`: the sidebar (`WorkspaceSidebar`), the
  header (`WorkspaceHeader` with New and More actions), the toolbar with tabs and search, the
  details panel / inspector (`DetailsPanel`), the status footer, and the dialogs block
  (`AppDialogs`). Pass props explicitly; avoid one giant context object.
- Name the inline handlers (`openDocument`, `loadExample`, `handleSaveStateClick`, …) and replace
  cryptic local names with descriptive ones.
- Rewrite the comments by the rules in readability-style.md (module headers, JSDoc on exports,
  short why-comments, no spec IDs).
- Keep every accessible name, role, class name, `data-*` attribute, text, keyboard behaviour,
  localStorage key, timing (status messages clear after 5 s) and render order exactly as they are;
  the browser checks select by them. The responsive mutation harness patches the served
  `src/main.tsx` at `const timer = setTimeout(() => setMessage(""), 5e3);` (as Vite serves it):
  keep the status-message timer in `src/main.tsx` in a form that produces that line, i.e.
  `const timer = setTimeout(() => setMessage(''), 5000);` inside main.tsx.
- `src/main.tsx` should end up as the entry point plus a short `App` that composes the hooks and
  components (aim for a few hundred lines).

## Verification

- `bun run fmt`, then `bun run check` passes; `bun scripts/check-comments.ts src/main.tsx src/app`
  is clean; `bun test` passes.
- The browser checks need the dev server at http://127.0.0.1:5173; if your sandbox cannot open
  ports, say so and the reviewer runs every suite.

Report briefly the new structure.
