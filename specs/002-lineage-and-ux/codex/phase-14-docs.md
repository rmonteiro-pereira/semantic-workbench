# Codex brief: Phase 14, T097 and T098 (documentation)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests to make them pass. Edit only `README.md` and
`docs/graph-design.md` (and `docs/*.md` they link to, if a fact there is now wrong).

## Tasks

- **T097** README: make sure each of these v0.3.0 behaviours is described once, in the section a
  reader would look for, with the exact control names the app shows. Most are already written;
  read the README first, fix what is missing or stale, and do not repeat what is there:
  lineage (how declared names are read, foreign-key direction), pierce budgets, the Metric
  vocabulary and `kpi_bindings`, autosave and **Commit…**, commits made by imports, clone
  among the network operations, repository-local Git identity, the credential guide, the
  `.semantic-workbench.json` manifest format, SQL lint coverage and its warnings, Group by
  modes. Every count you state (tests, checks, mutants, examples) must come from the code or
  the test output in the repo (`grep` the checks' `console.log` lines and `scripts/mutation-tests.ts`);
  never invent a number. The source of truth for behaviour is `specs/002-lineage-and-ux/spec.md`,
  `contracts/*.md` and the code.
- **T098** `docs/graph-design.md`: add the lineage canvas (`src/odcs/LineageCanvas.tsx`,
  `src/odcs/lineage.ts`): column ports on cards, paging of long column lists, incremental
  placement when the user expands (existing cards keep their place), Fit and first view, the
  selected-path panel; and how it differs from the entity graph. Plain English, short
  paragraphs, no task or requirement IDs.

Keep the files' existing layout: one paragraph per line, no re-wrapping of text you do not change (the 100-column rule below applies to code, not to these Markdown files); the diff must show only content changes.

Style for documents: plain English, short sentences, one idea per sentence, no marketing
words, no process notes ("we added", "now"), no spec or task IDs.

## Checks

- `bun --bun run check` (includes the comment and terminology checks).

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
