# Research: UI review fixes

Decisions, the source of every number, the review's inferences to confirm, and the review items judged wrong or not reproducible. No open clarification remains.

## Decisions

### D1. Bundle DM Sans and Manrope as vendored woff2 files

- **Decision**: store variable woff2 files (Latin and Latin-extended) and each family's `OFL.txt` under `src/shared/fonts/`, declare them in `fonts.css` with `font-display: swap`, and expose `--font-sans` and `--font-display` tokens. Every `font` and `font-family` declaration ends in a generic family.
- **Why**: the owner chose bundling. The CSP (`src/server/static.ts`) forbids a CDN, and `default-src 'self'` already allows same-origin fonts, so no CSP change is needed.
- **Rejected**: `@fontsource` packages (a new runtime dependency to justify under the constitution, for two files); a system font stack only (the owner chose bundling; the product already names the two faces).
- **Check**: `tests/fonts.test.ts` and the font assertions in `test:theme`.

### D2. Evidence stays out of git

- **Decision**: before/after images live in `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/after/<lane>/`; the repository holds only `evidence/<lane>.md` (pair list, check output, confirmed inferences).
- **Why**: the review warns that some images show the owner's name as committer; images are large; `specs/004-ui-polish/` committed images, but the capture here is repeatable from the scripts. Captures use a neutral Git identity from now on.

### D3. The capture scripts become a development tool in `scripts/ui-review/`

- **Decision**: copy the review's scripts into the repository on the 007 branch so the cross-lane gate can run them from inside the repository (they import `../helpers/*` and `src/*`). They pass the same format, lint and comment checks as other scripts.
- **Alternative**: keep them in the review folder and copy per run. Rejected: five agents would each copy, and the gate would depend on a folder outside the repository.

### D4. M2 is solved by both packing and legibility, and the claim is rewritten

- **Decision**: pack the Network layout to the pane's aspect ratio (so UBL becomes readable) and replace the 250-entity count with a legibility test (so the Mall model opens as counted areas). The user-guide claim 'The first view shows every entity by name' is replaced by the rule as implemented, so the doc is true either way. The existing test 'the 45-entity model opens with every entity visible, whatever the pane' keeps passing.
- **Why**: the owner asked that the claim become true or be changed; the review's own good example is the 1,000-entity counted-area view.

### D5. m6 changes the docs, not the code

- **Decision**: keep `MAX_HOPS = 3` (`src/app/odcs/ForeignKeyHops.tsx:9`); the docs say 'one to five' (`docs/user-guide.md:409`, `docs/graph-design.md:118`) and are corrected. The mapping graph's **Steps** (1-5, `LineageToolbar.tsx`) stays and is documented separately.

### D6. Phone patterns reuse one idea

- **Decision**: the Source control diff (FR-034) and the Mappings detail (FR-059) both use the same pattern: at 650 px and narrower the chosen item replaces the list and a Back row returns. No new navigation component; each lane writes its own small view because the files are in different lanes. 650 px is the review's own figure for the unified diff.

### D7. Where a review fix is a redesign, the smallest change ships

- 'Walk to…' list (M1): header card collapses instead. Full-screen phone diff (M12): Back-row view instead. Role matrix grid (m25): presentation only. Hops and Steps as one control (m6): documentation only. All four are listed in the spec's Out of scope.

### D8. No data model and no contracts

- No stored data, no API field and no authorization decision changes, so there is no `data-model.md` and no `contracts/`. If the staged-deletion investigation finds the cause in `src/server/projects/scm.ts`, the response keeps its fields and a test pins the corrected values.

### D9. Graph openings use the completed layout

- **Decision**: compare the smallest rendered name against the locked 9 px floor after the actual Fit viewport has painted. Network opens with the existing counted areas when the expanded result
  fails; 250 entities remains an upper layout safety cap. One additional layout is permitted for the counted result. Explicit area choices persist.
- **Layered**: retain the existing area order and orthogonal cross-area routes. Open on the first area at readable scale; pan and Fit model reach the remaining areas. Wrapping is rejected because it
  would invalidate the existing compound routes.
- **Measurement**: use the smaller of the rendered name box and its font size multiplied by the actual viewport zoom, so line height or wrapping cannot conceal undersized glyphs. Counted-card fit
  keeps a small subpixel margin above 9 px. Narrow first views are counted; wide UBL can remain expanded when its real layout passes.
- **Proof**: the opening browser checks cover UBL and Mall at 390, 1280, 1440 and 2560. Additional-layout times, captures and the comparison against the foundation are recorded in `evidence/A.md`.
  These decisions supersede the earlier aspect-ratio-only proposals without changing any locked threshold.


## Provenance of numbers

See the spec's Measured thresholds table. The lane A baseline task measures UBL and Mall at the four widths on e8b7d69 and writes the locked values into this section as the first change of lane A:

| Name | Locked value | Measured baseline |
| --- | --- | --- |
| `NAME_MIN_PX` | 9 px | Network names below this at 390, 1280 and 1440; retained from the review proposal. |
| `DIM_MIN_OPACITY` | 0.35 | Existing unrelated-node opacity is 0.32; retained proposed floor. |
| `NEIGHBORHOOD_CANVAS_MIN_PX` | 480 px | UBL and Mall canvas height is 414 px at 1280; retained proposed target. |
| `MIN_ZOOM_FRACTION` | 0.25 | Existing minimum is fixed at 0.001; retained proposed quarter-fit floor. |

### Graph baseline on e8b7d69

Light theme; fresh browser state per row. Name height is the minimum rendered strong-element box, including line height. Network starts randomly, so these are observations, not golden positions. The review's 6 px is an approximate glyph size; the DOM line boxes below are taller. Layered UBL at 1440 occupies 19.6% of the canvas.

| Model | Viewport width | Layout | Name box height | Graph box | Pane box |
| --- | --- | --- | --- | --- | --- |
| ubl | 390 | network | 3.23 px | 336.0 × 241.2 | 376 × 587 |
| ubl | 390 | layered | 1.05 px | 336.0 × 45.5 | 376 × 587 |
| ubl | 390 | neighborhood | 7.20 px | 555.0 × 353.4 | 376 × 528 |
| mall | 390 | network | 0.84 px | 336.0 × 270.0 | 376 × 587 |
| mall | 390 | layered | 0.59 px | 336.0 × 139.7 | 376 × 587 |
| mall | 390 | neighborhood | 8.14 px | 356.0 × 361.8 | 376 × 495 |
| ubl | 1280 | network | 7.23 px | 847.6 × 455.0 | 954 × 509 |
| ubl | 1280 | layered | 2.67 px | 852.0 × 115.4 | 954 × 509 |
| ubl | 1280 | neighborhood | 7.20 px | 555.0 × 353.4 | 954 × 414 |
| mall | 1280 | network | 1.72 px | 811.4 × 424.0 | 954 × 474 |
| mall | 1280 | layered | 1.49 px | 852.0 × 354.2 | 954 × 474 |
| mall | 1280 | neighborhood | 8.08 px | 353.6 × 359.3 | 954 × 414 |
| ubl | 1440 | network | 8.29 px | 996.0 × 524.3 | 1114 × 689 |
| ubl | 1440 | layered | 3.12 px | 996.0 × 135.0 | 1114 × 689 |
| ubl | 1440 | neighborhood | 9.90 px | 763.4 × 486.1 | 1114 × 627 |
| mall | 1440 | network | 2.29 px | 996.0 × 556.5 | 1114 × 689 |
| mall | 1440 | layered | 1.75 px | 996.0 × 414.0 | 1114 × 689 |
| mall | 1440 | neighborhood | 11.59 px | 507.0 × 515.2 | 1114 × 594 |
| ubl | 2560 | network | 18.20 px | 1988.6 × 1099.0 | 2234 × 1229 |
| ubl | 2560 | layered | 6.26 px | 1996.0 × 270.5 | 2234 × 1229 |
| ubl | 2560 | neighborhood | 18.97 px | 1462.5 × 931.3 | 2234 × 1204 |
| mall | 2560 | network | 4.59 px | 1905.5 × 1099.0 | 2234 × 1229 |
| mall | 2560 | layered | 3.50 px | 1996.0 × 829.7 | 2234 × 1229 |
| mall | 2560 | neighborhood | 23.42 px | 1024.7 × 1041.3 | 2234 × 1204 |

## Inferences in the review to confirm before fixing

| Finding | What the review inferred | Confirm in task | Result |
| --- | --- | --- | --- |
| M5 | CodeMirror's light defaults show through (`.cm-collapsedLines`, merge gutters) | lane C 'Confirm first' | pending, `evidence/C.md` |
| M17 | Cause in `hops.css:39-45` and `odcs.css:628-636` | lane B 'Confirm first' | pending, `evidence/B.md` |
| M20 | Empty trash may remove a file the dialog does not list | lane E 'Confirm first' | code reading below; pending test, `evidence/E.md` |
| M24 | The detail is below the list on a phone | lane E 'Confirm first' | pending, `evidence/E.md` |
| m4 | The pink tint comes from `theme-palette.ts` | lane E 'Confirm first' | `#ab6d64` is a palette entry; pending, `evidence/E.md` |
| Status bar | 277 may be metric links | lane E investigation | see below; pending, `evidence/E.md` |

## Review items judged wrong, partly wrong or not reproducible

These come from reading the code against the review; none was reproduced in a browser here (this step writes artefacts only).

1. **m6 conflates two controls.** `Steps` (1-5) is shown only for a mapping graph (`LineageToolbar.tsx`, `mapping` flag) and `Hops` (1-3) only for a contract graph. The review's two images are different canvases, so they are not two controls for one idea on one screen. The docs error ('one to five hops') is real.
2. **M20's risk is mostly answered by the code.** `Trash.tsx` words the confirmation 'Permanently delete all N items in the trash, from every project?' and `routes/trash.ts` calls `ws.trash.purgeAll()`. So Empty trash does remove the unlisted file, and says so; the defect is a dialog that shows nothing while offering a destructive action. The task still confirms by test, as asked.
3. **The status-bar count looks stale, not metric links.** The follow-up checks record '167 entities · 277 relationships' for `mall.semantic.yaml` and '45 entities · 277 relationships' for UBL, while the Mall ontology shows '195 entities · 896 relationships'. 277 is UBL's count, which points at a count carried over from another document rather than at 18 metric links. Not established; the investigation task decides.
4. **M6's cause is not established.** For a staged delete the client asks for `HEAD` to `index`; `DiffPane.tsx:32` prints 'new file' only when the server says the left side does not exist, so the left side is empty in the response. The cause may therefore be on the server (`src/server/projects/scm.ts`), not only in the label code the review cites.
5. **Every follow-up capture logs a 404** ('Failed to load resource: 404', `followup/checks.jsonl`). The review does not mention it. It may be a missing asset of the application; a lane E task names it.
6. **Known issue 2 (graph reopen) was not reproduced** (20 of 20 attempts) and is not given a task; the existing `test:ui` check and the Unreleased changelog entry stay as they are.
7. **Known issue 3** (407 px against 421 px) is reproduced and is covered by the toolbar single-row requirement (FR-004) plus the 421 px criterion in SC-015.
8. **Not relied on**: the neighbourhood speck after Back and Labels (unconfirmed in the review), the avatar-menu and connected-accounts geometry notes (open menu and backdrop), the server query-composer failure (fixture without a mapping document), and the 'Laying out…' frame of the zero-mapping graph (transient). No task depends on them; m27 covers the empty query composer by its own screenshot.
9. **Evidence gaps carried forward**: about 440 of 3,559 images were opened by the reviewer; findings are stated for the widths and themes named. Dark at 390, 1280 and 2560, and server mode, were spot checks, so a fix is verified at the named widths plus the gate's whole-journey comparison, not assumed elsewhere.
