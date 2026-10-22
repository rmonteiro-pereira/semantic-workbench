# Codex brief: Phase 14, T100 (final overlap sweep)

Repository: /home/rodrigo/projetos/semantic-workbench, branch `002-lineage-and-ux`. Do not commit.
Do not touch `data/`. Do not modify tests to make them pass (the existing checks stay as they
are; you add new ones).

## Task

**T100**: add a final overlap sweep to `scripts/responsive-ui-tests.ts` covering every floating
element in three places, at the six viewports already defined there as `six` (1280×720,
1366×768, 1920×1080, 2560×1440, 1024×768, 390×844):

1. **Lineage canvas** (Graph tab of `commerce.odcs.yaml`, region `Lineage graph`): the toolbar
   (`.lineage-toolbar`), walk trail (`.lineage-trail`), the busy note (`.lineage-busy`), the
   selected-path panel (`.lineage-path`, after selecting `orders.amount` as the existing lineage
   check does), the footer (`.lineage-foot`), the React Flow mini-map and zoom controls inside
   the lineage stage. None may cover another or a control; each stays inside the viewport.
2. **Neighborhood pierce banner** (`.pierce-banner`, shown after starting a pierce from the
   Neighborhood tools; read `src/graph/PierceControls.tsx` and `src/NeighborhoodGraph.tsx` for
   how it is started): it must not cover `.neighborhood-tools`, the mini-map, the zoom controls
   or the inspector, with and without details open.
3. **Dialogs**: open each app dialog that the existing `scripts/dialogs-browser-check.ts` opens
   (reuse its list as a guide, but write the sweep in `responsive-ui-tests.ts`), and assert the
   dialog box (`.workbench-dialog`) is inside the viewport, its title and footer buttons are
   visible and not clipped, the footer does not overlap the body's last control, and the page
   has no horizontal scroll.

Reuse `layoutProblems(page, { overlays })` from `scripts/helpers/layout-geometry.ts` and the
helpers already in `responsive-ui-tests.ts` (`openFile`, `tab`, `closeDrawer`, `closeDetails`,
`overlapProblems`). Name each check in a plain sentence starting with `overlaps:`. Save one
screenshot per viewport to `/tmp/workbench-final-sweep-<area>-<width>.png`.

If the sweep finds a real overlap in the app, fix the app (CSS or layout in `src/`), not the
check, and say what you fixed.

## Checks (the reviewer runs browser checks; your sandbox cannot open ports)

- `bun --bun run check`, `bun test`
- `bun run test:responsive` (dev server at http://127.0.0.1:5173)

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

Report briefly what you added, any app fix, and anything you could not do.
