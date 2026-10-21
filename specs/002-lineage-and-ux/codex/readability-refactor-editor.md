# Codex brief: make src/editor/CodeEditor.tsx readable

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or scripts. Other agents are editing other files at the
same time: change only `src/editor/CodeEditor.tsx` and new files you create in `src/editor/`.

Read specs/002-lineage-and-ux/codex/readability-style.md first; it is mandatory.

## Task

Refactor `src/editor/CodeEditor.tsx` (the Source editor component) for readability, with no
behaviour change:

- Split the component into well-named pieces: for example a `useCodeMirror`-style hook that builds
  the EditorView and its extensions, a function that maps editor transactions onto the file's
  original bytes (the patch logic), a `EditorStatusBar` component (syntax, line endings, cursor
  position, Checking…, Find, Go to line), and small helpers (`lineEndingLabel`, `goToLine`).
- Replace cryptic names (`v`, `tr`, `l`, `b`, `pos`) with descriptive ones outside tiny lambdas.
- Extract long inline handlers into named functions.
- Rewrite the comments by the rules in readability-style.md: a module header, JSDoc on exports
  (`CodeEditor`, `CodeEditorHandle`), and short why-comments, notably the byte-exact invariant:
  edits are applied as patches to the original bytes so untouched line endings, tabs and the
  trailing newline keep their bytes; a file without `\r` takes a fast path.
- Keep every exported name, prop, accessible name (`aria-label`s, "Go to line", "Find",
  "Checking…"), class name, the `workbenchEditor` property on the content element, the 300 ms lint
  delay and the keymap (Mod-g opens Go to line) exactly as they are.

## Verification

- `bun run fmt`, then `bun run check` passes; `bun scripts/check-comments.ts src/editor` is clean.
- `bun test` passes. The browser checks (`bun run test:editor`, `test:sql`, `test:ui`,
  `test:item-edit`) need the dev server; if your sandbox cannot open ports, say so and the reviewer
  runs them.

Report briefly what you changed.
