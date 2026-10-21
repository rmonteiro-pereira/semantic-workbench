# Code style and comment rules (included in every brief)

Code style (mandatory, overrides the style of the surrounding code):
- Run the repo's formatter on every file you change; if there is none, format as
  Prettier/ruff/gofmt would at 100 columns.
- One statement per line; one variable per declaration; no line over 100 characters.
- Descriptive names; small functions (about 40 lines) and components (about 150 lines);
  no nested ternaries; extract long inline handlers into named functions.
- Comments explain why, in plain English, one idea per sentence. Never put spec, task or
  requirement IDs (FR-xxx, T0xx, US3, R12) or process notes in code comments; put
  traceability in the commit message.

In this repository: format with `bun run fmt`; `bun run check` (TypeScript, `fmt:check`, Oxlint)
must pass, and `bun scripts/check-comments.ts <dirs>` must report no IDs in comments.

Comment rules (owner):
- Plain English a new developer understands without reading the spec. Explain WHY or a
  non-obvious constraint; don't narrate what the next line does.
- No spec/task/research IDs (FR-xxx, NFR-xxx, SC-xxx, T0xx, R12, US3, "Phase 7", "v0.3.0 (FR-…)")
  in code comments; link to docs/ only when genuinely needed, and then also state the point.
- Short: one idea per sentence, at most about 3 lines per comment block; a header comment per
  module saying what it is for in 1–2 sentences.
- Exported functions, components and types get a brief JSDoc (`/** … */`): what it does, key
  params/returns, important invariants (for example byte-exact preservation of the user's file).
- Delete comments that are obsolete, redundant with good names, or process notes ("owner review",
  "coordinator", "now", "updated to", "as requested", "v0.2.0 behaviour").
- Tests: test names are plain sentences of behaviour, not IDs.

Before / after example:

    // Source editor (FR-042–FR-047): CodeMirror 6 with syntax colors per serialization, findings drawn
    // inline while typing (validated in a worker after a 300 ms pause), line numbers, search, ...

    /** Source editor for one file, built on CodeMirror 6. */
    // Edits are applied as patches to the original bytes, so line endings, tabs and
    // the trailing newline the user did not touch stay exactly as they were.
