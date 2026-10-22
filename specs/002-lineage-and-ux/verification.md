# Verification: v0.3.0 (002-lineage-and-ux)

Final run on 2026-10-22, branch `002-lineage-and-ux`, Bun 1.4.0, Chromium headless shell 1248
through Playwright, dev server at http://127.0.0.1:5173. Every command used an isolated
temporary data root; `data/` was never opened. Load average 8.9 at the start, 4.8 at the end
(another workload shares the machine; see "Notes").

## Commands from the quickstart

| Command | Result | Duration |
| --- | --- | --- |
| `bun test` | 596 pass, 0 fail, 92 files | 56 s |
| `bun --bun run check` (tsc, Oxfmt, Oxlint, comment check) | pass | 6 s |
| `bun --bun run build` | pass | 2 s |
| `bun run test:mutation` | 125/125 targeted mutants killed (122 logic, 3 browser); baselines pass | 86 s |
| `bun test tests/sql-lint.test.ts` | 8 pass | 1 s |

## Browser suites

| Suite | Checks | Duration |
| --- | --- | --- |
| `test:ui` | 20 | 21 s |
| `test:examples` (fixtures) | pass | 2 s |
| `test:examples:ui` | 18 | 30 s |
| `test:responsive` (six viewports, final overlap sweep) | 69 | 177 s |
| `test:edges` | 6 | 8 s |
| `test:grouping-validation` | 8 | 14 s |
| `test:projects` | 5 | 10 s |
| `test:trash` | 13 | 18 s |
| `test:metrics` | 11 | 18 s |
| `test:graph` | 15 | 12 s |
| `test:editor` (typing latency, byte-exact saves) | 9 | 25 s |
| `test:item-edit` | 11 | 19 s |
| `test:rdf-edit` | 9 | 12 s |
| `test:scm` | 10 | 17 s |
| `test:odcs` | 9 | 9 s |
| `test:lineage` | 12 | 29 s |
| `test:autosave` | 9 | 13 s |
| `test:sql` (including large file mode) | 10 | 9 s |
| `test:git-setup` | 8 | 5 s |
| `test:monorepo` | 8 | 6 s |
| `test:dialogs` (six viewports) | 9 | 90 s |
| `test:terminology` | pass | 63 s |
| `test:mappings-layout` (six viewports, 80-character names) | 3 | 20 s |
| `test:mapping-graph` | 12 | 43 s |

## Typing latency (1.9 MB YAML file)

Mean `keydown` Event Timing duration over 39 keystrokes with an automatic save in flight (keys
under 16 ms count as 16 ms): **18.3 and 18.5 ms** in the editor check, in large file mode
(the budget is 30 ms; the target for this release was 22 ms). **Full parsing**, chosen in the
status bar: 27.5–34.1 ms. Details and the before/after table: research R29.

## Notes

- In the final run `test:scm` failed once in the file-history check: a history reload (from the
  sync just before) reset the two versions the check had picked. This was an application bug,
  not a test problem: Source Control now keeps the chosen versions across reloads while both are
  still in the history. After the fix, `test:scm` passed 4 times out of 4. `bun test` and
  `check` were run again after the fix (596 pass).
- Another workload on the machine raised the load average to about 99 during the Phase 13 gate.
  Timing checks (the typing budget, click timeouts) failed then and passed when rerun at low
  load (research R28). The latency figures above were taken at a load average under 8.
- Screenshots: `/tmp/workbench-final-sweep-*.png` (lineage, pierce, dialogs at six viewports),
  `/tmp/workbench-monorepo-*.png`, `/tmp/workbench-mappings-*.png`,
  `/tmp/workbench-sql-large-mode.png`, `/tmp/workbench-lineage-path-*.png`.
- UI polish findings collected during the work are in `polish-findings.md`. The owner deferred
  the full polish pass until after v0.4.0.
