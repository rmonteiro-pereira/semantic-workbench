# Handoff: 004-ui-polish (v0.5.0)

## Head and what is merged
Branch `004-ui-polish` (private repo; coordinator merges and tags; never push main, never tag).
Merged: all earlier polish rounds, main v0.4.1 and v0.4.2, the late fixes (phone drawer stays open
while loading, WizardStepper for issue 10, wizard height to content, delete-dialog file count,
tree snap incl. repository rows, removal of the 1920 px dialog-width rule), the lineage
measurement watchdog, the white-label brand bundle (`004-ui-polish-brand`), and
`005-observability` (logging and telemetry, merge `8cd6362`). Round-2 audit tables are in
`specs/004-ui-polish/audit/round-2-L{A,B,C,D}.md`; fix briefs in `audit/briefs/`.
Branches `004-ui-polish-r2a..r2d` exist at the pre-fix head and contain no work.
No `004-ui-polish-wip` branch is needed: everything is committed on `004-ui-polish`.

## Requirements R1-R17 (details in spec.md, findings in findings.md)
- R1 theme isolation: done (codemod, `check:theme`, `test:theme`); F62 still marked open: confirm.
- R2 lineage redesign / R2a no pagination: done; F63 open (confirm in round 2).
- R3 admin page, R4 ODCS terminology, R5 FK hops, R6 Examples menu, R7 header: done.
- R8 dialogs and no overlap: done, but round 2 found more (below); F72-F76 are fixed in code,
  status cells still say `open`: flip to `fixed` after the gate.
- R9 readable text: done (12 px floor; far-zoom names 11.5 px). R10 visual audit: round 2 open.
- R11 earlier asks still hold: open (F64), verify by walking the owner asks in spec.md.
- R12 example metrics, R13 export, R14 menus, R15 sparse folder: done.
- R16 wizard stepper (F71, F73): done in code and checks; mark fixed.
- R17 white-label brand (F77-F82): done and fixed.

## Audit round 2
Round 2 on the merged head found S1/S2/S3 rows (local light+dark only: LA 28 rows, LB 23, LC ~24,
LD ~12). Nothing from round 2 is fixed yet. The assigned fix areas (A shell and sidebar, B dialogs
and wording, C graphs, D pages) are written in `audit/briefs/brief-fix2-*.txt`; the common rules
are in `brief-fix2-common.txt`. Triage each row yourself: fix real defects, justify the rest.
Probable test-data artefacts: none known besides the server capture below.
Server mode: the server capture tool was stale (it looked for `.sidebar`); fixed in `e2862dd`
(`.workspace-sidebar`). Server captures were never reviewed. Redo them.
Capture commands (own Vite on a free port, never 5173):
- `SW_BASE_URL=http://127.0.0.1:PORT bun scripts/polish-capture.ts <dir>`; add `SW_THEME=dark`;
  `SW_ONLY=<text>` filters screens.
- `bun --bun run build` then `bun scripts/polish-capture-server.ts <dir>` (and with `SW_THEME=dark`);
  about 12 minutes each. Four widths: 390, 1280, 1440, 2560.
- Reviewer brief: `audit/briefs/brief-audit.txt`; one reviewer per about 80 images.
Repeat rounds until none reports S1/S2; update status columns; put final JPEGs in
`specs/004-ui-polish/screenshots/after`.

## Full gate (run after the fixes; nothing else touching the tree while it runs)
Start Vite for the tree: `bun x vite-plus dev --host 127.0.0.1 --port 5174 --strictPort < /dev/null &`
(5173 is the owner's Vite: leave it alone). Then, one at a time, with
`SW_BASE_URL=http://127.0.0.1:5174`: `bun --bun run <suite>` for test:ui, test:responsive (about
15 min), test:edges, test:grouping-validation, test:examples:ui, test:projects, test:trash,
test:metrics, test:graph, test:editor, test:item-edit, test:rdf-edit, test:scm, test:odcs,
test:lineage, test:autosave, test:sql, test:git-setup, test:monorepo, test:dialogs,
test:terminology, test:mappings-layout, test:mapping-graph, test:theme, test:auth,
test:two-editors, test:admin, test:examples, test:telemetry. `test:brand` builds and serves itself.
Also: `bun test` (1832 pass), `bun --bun run check`, `bun --bun run build`,
`SW_BASE_URL=http://127.0.0.1:5174 bun --bun run test:mutation` (needs the URL or it hits 5173;
last: 557/557 before brand+telemetry, brand reported 603), `bun run ci:validate` (run detached,
long timeout; it once hit 590 s), `bun --bun run test:container` (podman; not run on the merged
tree), 10 consecutive clean `test:lineage` runs, the employer-name scan from the memory note must print nothing.
Never loosen a budget, timeout or assertion (30 ms keystroke, 100 ms graph).
Before the PR-sized commits run the architecture-reviewer and `review_marker.py mark <repo>`.

## Last results
Before the brand and observability merges: all browser suites passed on the late-fix tree
(responsive, item-edit, projects, ui, trash, monorepo, dialogs, lineage, examples:ui).
On the final merged head: `bun test` 1832 pass, `check` clean, `build` clean, mutation 557 killed
(before brand/telemetry). The browser suites, container and ci:validate have NOT been run on the
final merged head.

## Risks and flaky areas
- test:lineage: cards left hidden by React Flow under load (about 1 run in 4 with a busy machine).
  Fixed by `MeasurementWatchdog` in `src/odcs/LineageCanvas.tsx`; 20 of 20 clean under eight busy
  processes, but still prove 10 clean runs on the final tree.
- Timing suites flake when other projects load the machine: rerun alone; a second failure is real.
- Editing files while a gate runs reloads Vite and fails suites. Use a separate worktree.
- /tmp is a small tmpfs shared with other sessions; it filled up once. Remove old worktrees.
- Server-mode capture only shows the screens the signed-in user may open (import and add-concept
  are skipped for it).
- Brand: `SW_BRAND_DIR` is read at start; Vite dev serves `public/brand` only.

## In the middle of
Nothing uncommitted. I was about to launch the four round-2 fix agents (worktrees
`wt-r2a..d` in the scratchpad, branches `004-ui-polish-r2a..d`) and a fresh server-mode capture.
