# Codex brief: Phase 13 (US9), T095 (binding chain layout)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests or checks to make them pass.

## Task

**T095**: every binding in the Mappings tab stays inside its card at every viewport, and the
arrows of a binding chain stay with the step they lead to. Files: `src/MappingExplorer.tsx` (the
`.mapping-binding-chain` block and the `.mapping-columns` layout) and `src/style.css` (the
`.mapping-*` rules around lines 1340–1500).

## Requirements (spec FR-063, SC-008; contracts/ui-contracts.md "Mappings")

1. Identifiers break preferentially at `.`, `_` and spaces: render each step value with a `<wbr>`
   after every `.` and `_` (a small pure helper, for example `breakableName(text)` returning React
   nodes; keep the text content identical so `textContent` and accessible names do not change).
   Use `overflow-wrap: break-word` (not `anywhere`) so a long name without separators still breaks
   instead of overflowing, but only as a last resort.
2. Arrows never orphaned: remove the separate `<span className="mapping-arrow">→</span>` element
   and draw the arrow as a `::before` pseudo-element of each step after the first (for example
   `.mapping-binding-chain [data-step] + [data-step]::before { content: '→'; … }`), so an arrow
   always starts the line together with the step it leads to and never ends a line alone.
   The arrow stays `aria-hidden` in effect (pseudo-element content with an empty alternative
   text: `content: '→' / ''`).
3. Two columns: concepts on the left and bindings on the right, so bindings get the width. The
   query composer column (`.mapping-query`) is moved out of the columns by T096 later; for now
   keep its markup but lay out `.mapping-columns` as concepts | bindings with the composer below
   the bindings column. Below 760 px a single column.
4. Every element of a card (`.mapping-binding`): the chain, the `<code>` expression (wrap long
   expressions with `white-space: pre-wrap; overflow-wrap: break-word`), the evidence line
   (`<small>`) and finding paragraphs stay inside the card at 390–2560 px wide.
5. Design: consistent with the rest of the app (spacing, type sizes, colours from `src/style.css`);
   nothing overlapping, clipped or cramped.

## Checks that must pass (dev server at http://127.0.0.1:5173, run by the reviewer since your
sandbox cannot open ports)

- `bun --bun run check`, `bun test`
- `bun run test:mappings-layout` (new geometry check, `scripts/mappings-layout-browser-check.ts`: six
  viewports, every shipped mapping document plus one with 80-character names, every group open;
  no element past its card, no text overflowing its box, each arrow on the same line as the step
  it leads to). Read it to see exactly what is measured.
- `bun run test:examples` (Mappings checks).

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

Report briefly what you changed and anything you could not do.
