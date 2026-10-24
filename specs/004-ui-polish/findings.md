# UI polish findings (v0.4.0 base)

Findings of the polish pass that follows v0.4.0, ranked by severity. They come from three
sources: the findings left open by features 002 and 003, a review of every screen and dialog at
390×844, 1280×720, 1440×900 and 2560×1440 in local mode and in server mode with the mock
provider, and a measurement of the rendered pages (text size and text collisions).

The owner's complaints guide the ranking: overlapping elements, a crammed interface (prefer a
dialog or progressive disclosure over more controls in a panel), the ODCS data view, and text
that is readable at normal zoom.

Severity: **S1** content overlaps, is cut off or cannot be reached; **S2** crammed, hard to use
or hard to read; **S3** polish. Screenshots are in `screenshots/before/` (taken before any fix,
from the v0.4.0 build). `screenshots/after/` holds the same screens after the fixes.

## S1: overlap, cut-off or unreachable content

| # | Where | Finding | Screenshot | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F01 | Lineage and graph canvases | The zoom controls (bottom left) sit on top of cards and hide field names and card edges. | local-lineage-mall-1280, local-odcs-data-graph-390 | Controls sit in a gutter beside the canvas, never over cards | fixed: zoom buttons moved into the toolbar; nothing floats over the canvas |
| F02 | Whole-model graph, neighborhood | The minimap is large, opaque and covers cards and edge labels. | workbench-overlap-bundle-1280 | Smaller, translucent, hidden when a panel is open or below 1100 px | fixed: the mini-map is off until switched on in View options |
| F03 | Lineage with a selected path | The Selected path panel covers the canvas (a third of it at 1024 px, most of it at 390 px). | workbench-lineage-pierce, workbench-final-sweep-pierce-390 | Collapsed chip that opens a dialog; the canvas keeps its width | fixed: below 1100 px the path opens as a dialog from the walk row |
| F04 | Sidebar project tree | The first tree row is cut by the PROJECTS label; the tree scrolls behind its header; the footer note is cut at 720 px. | local-projects-1440, workbench-ui-matrix | Header stays above a scrolling region that starts below it | fixed: the tree scrolls between the navigation and a fixed footer; native scrolling and row snapping preserve names without edge fades |
| F05 | Add concept, add item dialogs | The dialog sits at the lower right and is cut at the right edge at 1440 and 2560 px. | workbench-item-add | Centre it with the shared dialog rules | fixed: add dialogs are centred dialogs |
| F06 | Edit metric and item drawer | The Delete, Cancel and Save row sits in the middle of the form; fields continue under it. | workbench-item-kpi-edit | Footer pinned below a scrolling body | fixed: actions sit in the dialog footer below one scrolling body |
| F07 | Metric wizard step strip | Steps run past the drawer edge ("7 Explanati…"); no scroll cue (finding 5 of feature 002). | workbench-item-wizard-preview | One "Step N of M" line with the step name | fixed: "Step N of M" line with a step select |
| F08 | Graph, neighborhood and lineage toolbars | At 390 px the last buttons ("Fit m…", "Relationship") are cut; with the details panel open at 1280 px "Labels", "Overview", "Neighborhood" are cut. | local-graph-390, workbench-overlap-graph-1280 | Few primary controls; the rest in one "View options" dialog | fixed: toolbars keep a few controls; the rest is in View options |
| F09 | Tab strip at 390 px | Tabs are cut at both edges with no cue that the strip scrolls. | local-odcs-graph-390 | One select-style view switcher at phone width | fixed: the strip reveals complete selected and focused labels, hides clipped neighbors and keeps cues outside the labels |
| F10 | ODCS contract, schema objects table | The table runs past its card (PROPERTIES shows as "P", KEYS and DESCRIPTION unreachable at 1280; only OBJECT at 390). | local-odcs-data-1280, local-odcs-data-390 | Rows with name, type, keys and a short line; the rest in the object page | fixed: object rows, secondary lines, cards at phone width |
| F11 | ODCS dataset page, Properties table | Ten columns run off the page; the physical type column is empty for every row; the FK badge is cut. | workbench-sweep-dataset-page-1280, workbench-odcs-narrow | Few columns; the rest in an edit dialog | fixed: read-only rows, empty columns hidden, edit dialog |
| F12 | Admin, Audit at 390 px | The filters take the dialog; the result keeps one column. | workbench-admin-audit-390 | Filters behind a disclosure, results as cards | fixed: filters fold; results are cards at phone width |
| F13 | Admin dialogs opened from another dialog | The parent dialog, its text and its Close button show beside the child, so two Close buttons appear. | workbench-admin-grant-form-1280 | Parent is hidden while the child is open | fixed: a child dialog hides its parent |
| F14 | Phone drawer behind dialogs | Import, Trash and Grouping open over the sidebar drawer, which stays visible. | local-trash-390 | Close the drawer first | fixed: opening a dialog closes the drawer; focus returns to the workspace button |
| F15 | Source control project select | The select is wider than its column; its arrow is cut. | workbench-sweep-source-control-1280 | Select fits its column | fixed |
| F16 | ODCS graph first view | The first view is cropped: the left card loses its names, the right one its edge. | local-odcs-data-graph-1280 | Fit with padding once layout settles | not changed, on purpose: the first view keeps column names at least 12 px (asserted by the lineage and ODCS suites), and three cards at that size do not fit a 970 px canvas; Fit is in the toolbar. Fitting all cards needs zoom 0.61, text near 8 px |
| F17 | Header at 1280 px | Title, "Saved to file · 0 uncom…" and "Commit…" are cut with an ellipsis. | local-neighborhood-1280 | Shorter state label with the full text in its title and name | fixed: whole save state from 1200 px; person menu keeps roles in its menu |

## S1 (owner requests, in priority order)

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| F55 | Admin panel | The panel is a modal and reads as broken. It must be a page with its own route state, a section navigation on the left (grants, roles, policies, project access, audit and the rest), full-width content and a clear way back; dialogs inside it only for confirmations and dry-run previews. | workbench-admin-audit-390 | fixed: #/admin/<section> page with section navigation, back to workspace, no modal versions; dialogs only for confirmations and previews |
| F56 | ODCS terminology | Everything is labelled "contract object". The schema objects are Tables in all UI text (lists, headings, counts, breadcrumbs, empty states, legend, search); a type other than table shows as a small badge. ODCS terms stay only where they name the standard's fields. | local-contract-contract-1280 | fixed: Tables everywhere; terminology check rejects "contract object" |
| F57 | ODCS graph, data view and lineage | The ODCS graph needs the most work: table cards that read at the default zoom, a clear PK/FK legend and edge labels, a first view without crop, no overlapping cards or edges, controls in the shared toolbar and View options, selection and neighbour highlighting. Then the data view and lineage. | local-contract-graph-1280 | fixed: whole-card first view, readable columns, labelled lines, legend, see odcs-graph-defects.md |
| F58 | Foreign-key steps | The foreign-key hops are confusing in the lineage and graph steps and in the data view. Each hop reads as `orders.customer_id → customers.id`, the direction is clear, the hop count and path show in one place, the stepping control has plain labels and one line of help. | local-contract-graph-1280 | fixed: Hops row, path line, foreign-key dialog and sentences in the data view |
| F59 | Sidebar Examples | The Examples button becomes a fly-out menu anchored to the button, keyboard accessible. | local-ontology-overview-1280 | fixed: Examples is a fly-out menu on the shared menu |
| F60 | Header, top-right corner | Person menu, mode badge, save state and the rest are ungrouped and uneven. Group them, keep the essentials, move the rest into the person or an overflow menu, align heights and spacing, and make it work at 390 px. | server-projects-1280 | fixed: header grouped into file, save and account clusters at 36/34 px, icons only below 1100 px |
| F61 | Visual audit | Every screen and dialog at four sizes, local and server mode, light and dark where the app has both, reviewed strictly by a separate reviewer until a round finds no S1 or S2 item. | specs/004-ui-polish/screenshots/after | open: round 14 visual audit clear; final gate pending |
| F62 | Theme | Colours are literals spread over CSS, inline styles and renderers, so changing the palette is hard. One theme file of semantic tokens, light and dark value sets, a check that fails on a literal elsewhere, docs and a browser check that swaps the accent. | src/style.css | open: round 14 visual audit clear; final gate pending |
| F63 | Lineage view | A dedicated redesign pass: defects listed first, readable cards, clean first view, no overlaps, path highlight, plain hop sentences, Full pierce kept, understandable fan-out collapse, shared toolbar plus View options. | local-contract-graph-1280 | open: round 14 visual audit clear; final gate pending |
| F64 | Earlier owner asks | Full-screen graph, YAML highlighting with SQL, trash icons, file list hierarchy, real concept mappings, VS Code-like source control and click-to-edit must still work and look right after the polish. | specs/004-ui-polish/screenshots/after | open: round 14 clear; supplemental R11 browser proof and gate pending |
| F65 | Table cards on the lineage canvas and the ODCS graph | A card shows "93 more columns" and page buttons "1 2 ... 11". Cards must show the columns that matter (keys, columns with an edge in view or on the path, search matches), end with "+ N more columns" that expands in place to one scrollable, virtualised list with a filter above about 30 columns and "Show fewer", with no page numbers anywhere and edges anchored to scrolled rows. | owner photo | fixed: cards open in place to a scrolling list with filter and Show fewer; no page numbers |
| F66 | Edge labels on parallel edges | The word "lines" repeats on several parallel dashed edges. A bundle is labelled once, or its label shows on hover or selection. | owner photo | fixed: a bundle carries its count once; labels without room show on hover |
| F67 | Built-in examples | The examples have no metrics, so the Metrics view, breakdown, lineage path and SQL preview show nothing for them. Add workbench-authored metrics (simple, derived, foreign-key path; owner and status) bound to real ODCS columns, without editing hash-checked upstream files. | local-ontology-metrics-1280 | fixed: metrics in commerce, mapped commerce, billing, ubl, flights and mall, in labelled workbench-authored files |
| F68 | Project menu | New feature: Export project... after Import files into this project; byte-exact zip, optional Git history bundle, drafts excluded, server mode filtered by read access and audited, streamed under the size limits. | owner photo | fixed: Export project... with byte-exact streamed zip, optional history bundle, server filtering and audit |
| F69 | Project menu popup | The menu is cut off by the file list (Delete is half hidden) and fades into the names behind it, because it sits inside the masked, scrolling list. Menus must be opaque, anchored in the viewport and fixed in the shared menu component. | owner photo, shots-measure/menu | fixed: every menu is drawn in the window, opaque and flipped when short of room |
| F70 | Remote and Clone dialogs | New feature for v0.5.0: a Folder in repository field, with sparse checkout, so a project can live in a subfolder of a shared remote repository and clone, pull and push touch that folder only. | src/scm | fixed: Folder in repository field with sparse checkout, previewed move for local projects, per-user worktrees in server mode (moving an existing project in server mode is refused with a message to clone the folder instead) |
| F71 | Metric attributes wizard (GitHub issue 10) | The seven-step strip scrolls sideways with a native scrollbar and a cut last step, step labels are under the 12 px floor, the body is two lines above a large empty area with floating actions, and long metric names such as valor_aluguel_merchandising_gerencial_total have no wrapping. A shared stepper (compact line, progress bar and step menu below 1200 px, a state-marked list from 1200 px), footer actions, wrapped names, and checks at four widths. | issue 10 screenshot | open: round 14 visual audit clear; final gate pending |
| F72 | Phone drawer while loading | The drawer a person opens during start-up closes by itself when the first file opens. | responsive: sidebar, phone drawer during loading | The start-up open keeps the drawer as it is | open: round 14 visual audit clear; final gate pending |
| F73 | Metric wizard drawer | The drawer is as tall as the window even for a short step. | workbench-item-kpi-wizard | The wizard is as tall as its step | open: round 14 visual audit clear; final gate pending |
| F74 | Delete dialogs | The dialog lists files without saying how many go to the trash. | local-trash-delete | A line with the count above the list | open: round 14 visual audit clear; final gate pending |
| F75 | Sidebar tree | Scrolling stops with a row cut at the top edge; repository rows were not snap targets. | local-monorepo-390 | Rows snap to the top edge, repository rows included | open: round 14 visual audit clear; final gate pending |
| F76 | Dialogs from 1920 px | An old rule made narrow dialogs 720 px wide on large screens, a third width. | local-trash-2560 | Rule removed; dialogs keep the two standard widths | open: round 14 visual audit clear; final gate pending |
| F77 | Sidebar, header, document title, sign-in pages | The product name is written into the code in four places, so a deployment cannot show its own name. | responsive: sidebar | The name is read from `brand.json` in the browser and from the active brand on the server | fixed |
| F78 | Sidebar and sign-in pages | The logo is an inline icon and a text wordmark, copied into two files. | responsive: sidebar | The logo is `logo.svg` and `logo-mark.svg` in the brand bundle, shown as images | fixed |
| F79 | Deployment | Changing the name or logo needs a rebuild of the image. | test:brand | `SW_BRAND_DIR` mounts a folder; the server serves it at `/brand/*` | fixed |
| F80 | Brand files | A mounted logo or stylesheet could carry script or load outside content. | test:brand | SVG is rebuilt from an allow-list, CSS keeps theme tokens only, sizes are capped and every response is sandboxed | fixed |
| F81 | Code base | Nothing stops the product name or logo from coming back into code. | none | `scripts/check-brand.ts` in `bun run check` | fixed |
| F82 | Browser tab | The page has no favicon of its own. | test:brand | `favicon.svg` in the brand bundle, linked from `index.html` and the sign-in pages | fixed |

## S2: crammed or hard to read

| # | Where | Finding | Screenshot | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F18 | Whole interface | 172 declarations use text below 12 px (sidebar captions, status bar, table headers, legends, badges); 40 to 190 text runs per screen measure under 12 px. | workbench-ui-overview | A 12 px floor in shared type tokens, asserted in the browser suite | fixed: 12 px floor, asserted at four sizes |
| F19 | Whole interface | Muted text is a pale grey (about 3:1 contrast) on white. | workbench-sweep-contract-1280 | A darker muted token | fixed: --text-muted at 4.5:1 or better |
| F20 | Neighborhood, graph and lineage at fit zoom | Card text renders at 5 to 7 px; buttons inside cards are unusable. | local-neighborhood-1280, workbench-lineage-ubl-1280 | Card text sized for the fitted zoom; extras only when zoomed in | fixed: below zoom 1 neighborhood and lineage cards drop detail lines and show the name at a size that stays at least 12 px on screen down to zoom 0.27 (below that it shrinks with the canvas); buttons become icon-only and scale with it |
| F21 | ODCS contract page | Identity strip, purpose, limitations, a mostly empty Team table and the object table are stacked in one long page. | local-odcs-contract-tab-1440, workbench-sweep-contract-1280 | Summary first, detail sections in dialogs, empty columns hidden | fixed: summary first, sections open in dialogs, empty columns hidden |
| F22 | ODCS dataset page | "Open in lineage" is drawn as a sixth tab inside the view switcher; its label is long. | workbench-odcs-schema | A button in the header card | fixed: a button in the header card |
| F23 | ODCS dataset page, Properties | Inline selects and three checkboxes per row; classification looks disabled; editing and reading share one cell. | workbench-auth-property-editors-editor-1280 | Read-only rows with badges; Edit opens a dialog | fixed: read-only rows with badges; Edit opens a dialog |
| F24 | ODCS pages at 390 px | Tables scroll sideways with no cue; the sub-tab strip is cut at "Propertie". | workbench-sweep-dataset-page-390, workbench-sweep-contract-390 | Cards at phone width | fixed: stacked cards at 700 px and below |
| F25 | Lineage toolbar | Twelve controls in two rows plus a group select; two unlabelled full-screen icons. | local-odcs-data-graph-1440 | Search, Full pierce and one options button; labelled icons | fixed: search, Full pierce, Undo, zoom, Fit, options and full screen |
| F26 | Neighborhood toolbar | Five rows (centre, filters, actions, legend, trail) take about 190 px. | local-neighborhood-1280 | Two rows; the filters in View options | fixed: centre, counts, pierce, zoom and options; filters in View options |
| F27 | Whole-model graph toolbar | Nine controls plus Group by and search; five bands at 390 px. | local-graph-390 | Layout and Fit visible; the rest in View options | fixed: Fit model, zoom and View options |
| F28 | Details panel on Overview, Catalog, Graph | At 1280 px the inspector takes a third of the width; at 390 px it is an in-flow block of 500 px. | workbench-overlap-neighborhood-1280, workbench-overlap-overview-390 | Dialog sheet at phone width | fixed: a side panel above 650 px and a bottom sheet below; at phone width the sheet drops its icon and large spacing so the description shows beside the canvas |
| F29 | Source control | Eight to ten stacked controls in a 350 px column; the model tabs and entity search show above a Git view; remote actions mixed with commit. | local-source-control-1280, workbench-auth-two-editors-source-control-1280 | Sync actions in a Sync dialog; tabs hidden here | fixed: Sync dialog; model tabs hidden on this screen |
| F30 | Metrics list | Filters wrap into three rows; five columns of dashes; an "Add attributes" button on every row. | workbench-sweep-metrics-1280, workbench-metrics-detail | Filter dialog; empty columns hidden | fixed: Filters dialog; empty columns hidden |
| F31 | Metric detail | Formula, built from, rules and SQL all show at once. | workbench-metrics-2560 | Rules and SQL are sections that open on demand | fixed: rules and SQL open on demand |
| F32 | Compose a query | Three nested scroll regions; a flat list of 36 or more fields (finding 11 of feature 002). | workbench-mapping-query, billing-ambiguous-query | Field filter; the dialog scrolls once | fixed: field filter, fields grouped by dataset, one scroll |
| F33 | Admin dialogs | Plain list launcher; grant form shows no Save; raw identifiers and UUIDs repeated; 11 built-in rules before custom ones; camelCase action names. | workbench-admin-launcher-1280, workbench-admin-grant-form-1280, workbench-admin-policies-1280 | Launcher with descriptions; footers hold actions; names before IDs; built-in rules folded | fixed: launcher descriptions, footers with actions, names before ids, built-in rules folded |
| F34 | Admin dialogs | The sentence about the last Admin repeats under every title. | workbench-admin-deactivate-1280 | Only where it applies | fixed: only where it applies |
| F35 | Refused property edit | The refusal is drawn as a success bar and its chip is cut ("Not saved: this …"). | workbench-auth-guarded-refusal-1280 | Warning style, full message | fixed: warning style |
| F36 | Catalog | The Edit button crowds the type label; every card repeats the same long description. | local-catalog-1280 | Aligned cards; two-line description | fixed: aligned cards, two-line description |
| F37 | Mappings | Four summary cards and a stack before the first concept; the first concept card is cut at the top of its list (finding 10 of feature 002). | local-mappings-390, workbench-mapping-chains | One summary line; list scrolls whole cards | fixed: one summary line, whole cards in the list |
| F38 | Sign-in pages, person menu | The pages are a bare left column; the person menu name is larger than the menu items and items are centred. | workbench-auth-no-access-1280, workbench-auth-person-menu-1280 | Card with the logo; menu aligned and sized to the scale | fixed: centred card with logo; person menu aligned |
| F39 | Sidebar rows | Delete and menu icons show on every row; file names wrap mid-word at 220 px; Clear workspace wraps. | workbench-projects-tree | Actions on hover and focus; truncation | fixed: row actions stay hidden until hover or focus (muted on the open file) and remain visible on touch |
| F40 | Lineage options dialog | Checkbox sits above its label. | workbench-final-sweep-dialog-lineage-options-1280 | Row layout | fixed: the options dialog uses toggle buttons like the other graphs |
| F41 | Toasts | Status messages push the layout and cover the footer status. | workbench-item-wizard-saved | Overlay toast | no change: the status line is an overlay that dismisses itself and never covers a control (checked by the responsive suite) |
| F42 | Trash, More menu | An empty Trash opens a dialog that only says "empty"; the More menu holds one item. | local-trash-1280, local-more-menu-1280 | Export in the header; Trash count | fixed: Export is a header button; an empty Trash explains itself and offers only Close |

## S3: polish carried over from features 002 and 003

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| F43 | Mapping graph toolbar | The options button reads "Lineage options…" (finding 1). | workbench-mapping-graph-mall-1440 | fixed: Graph options for a mapping graph |
| F44 | Status footer on a mapping file | Reads "167 entities · 0 relationships" (finding 2). | workbench-mapping-graph-mall-1440 | fixed: concept mappings for a mapping file |
| F45 | Source Control change rows, shared repository | The project tag wraps under the file name (finding 6). | workbench-monorepo-scm | fixed |
| F46 | Projects dialogs | Name inputs use the 16 px size while paths use 12.5 px (finding 7). | workbench-monorepo-projects-1440 | fixed |
| F47 | Delete dialog, subfolder choice | Choice labels render at regular weight (finding 8); the Sales title wraps at 390 px (finding 12). | workbench-monorepo-delete-1280 | fixed |
| F48 | Editor status bar | "Large file mode" is plain text (finding 13). | workbench-sql-large-mode | fixed: badge beside the switch |
| F49 | Neighborhood pierce lanes | Long lane routes around the canvas (finding 4); first view of a metric lacks its dataset (finding 3). | workbench-neighborhood-pierce-budget | fixed: the first view of a metric also shows its datasets, and long edge lanes run beyond the boxes they pass instead of around the whole canvas |
| F50 | Clone dialog result | Manifest sentence above the invalid files (finding 9). | workbench-monorepo-clone | fixed |

## S4: found while reviewing the after screenshots

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| F51 | Header in server mode at 1280 px | The action group shrank below its content and slid under the person menu, hiding Commit and Admin. | server-projects-1280 | fixed: the group no longer shrinks; the sign-in suite asserts no header action leaves its group or sits under the menu |
| F52 | Neighborhood toolbar at 1280 px | The full-screen button wrapped onto a row of its own. | local-ontology-neighborhood-1280 | fixed: the centre picker takes less width |
| F53 | Details sheet at 390 px | The sheet kept a large icon and wide spacing, leaving no room for the description beside the canvas. | workbench-overlap-neighborhood-390 | fixed: compact sheet at phone width |
| F54 | Neighborhood toolbar, legend | The Incoming and Outgoing legend sits alone on a second row at 1280 px. | local-ontology-neighborhood-1280 | left as is: it is one slim row and the legend stays next to the controls that change what it describes |

Measured before the fixes (`scripts/polish-capture.ts`): no text collisions on any non-dialog
screen at the four sizes; 17 to 190 text runs per screen below 12 px; no cut-off controls
reported by the existing control check, because scrolling strips count as reachable.

## S5: strict audit rounds

Each round photographs every screen and dialog at four sizes, in light and dark, in local and server
mode, and a reviewer who did not build the app reads every image. The reviewer's rows are in
`specs/004-ui-polish/audit/round-N-<letter>.md`; every S1 and S2 row there is a finding of this
release, and the round is closed only when the next round reports none.

| Round | Files | Rows (S1 / S2 / S3) | Status |
| --- | --- | --- | --- |
| 1, local light | audit/round-1-A.md, round-1-B.md | 3 / 15 / 5 and 3 / 12 / 6 | fixing |
| 1, local dark | audit/round-1-C.md, round-1-D.md | 1 / 13 / 8 and 5 / 19 / 3 | fixing |
| 1, server light and dark | to be reviewed after the local rows are fixed | | open |

## Round 2 remediation

The baseline rows and current evidence are tracked in [the resolution ledger](audit/round-2-resolution.md).
Round 8 independently reviewed all 864 native screenshots with no S1/S2 rows.
The full release gate and R11 acceptance evidence remain pending.

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F83 | Shared navigation | Reveal selected tabs after cue sizing and resizing; wrap header titles. | open: round 14 visual audit clear; final gate pending |
| F84 | Catalog | Keep long titles on one line with their full name in a tooltip. | open: round 14 visual audit clear; final gate pending |
| F85 | Item forms and wizard | Stack phone fields, preserve scroll padding, and distinguish the current step. | open: round 14 visual audit clear; final gate pending |
| F86 | Dialog chrome | Full-row footer hints and a stronger native-dialog scrim. | open: round 14 visual audit clear; final gate pending |
| F87 | ODCS layout | Keep modal overlays out of page width limits and remove the narrower Relationships cap. | open: round 14 visual audit clear; final gate pending |
| F88 | Graph detail | Hide summaries and metric badges below their readable zoom; keep headings above lines. | open: round 14 visual audit clear; final gate pending |
| F89 | Tab neighbors | Hide clipped fragments and explicitly reveal keyboard focus with edge clearance. | open: round 14 visual audit clear; final gate pending |
| F90 | Sidebar | Remove file-name fades and reclaim footer height on short windows. | open: round 14 visual audit clear; final gate pending |
| F91 | Metrics and Git | Retain units, match headings to cells, compact phone cards and label push/pull counts. | open: round 14 visual audit clear; final gate pending |
| F92 | Editing wording | Name required inputs, explain missing bindings, separate project scope from counted files. | open: round 14 visual audit clear; final gate pending |
| F93 | Wizard and disabled actions | Center content-height metric wizards; distinguish disabled actions without fading text. | open: round 14 visual audit clear; final gate pending |
| F94 | Mapping empty states | Summarise unbound concepts, use one page scroll and open the selected mapping Source. | open: round 14 visual audit clear; final gate pending |
| F95 | Graph explanations | Name expansion directions and count units; wrap area titles; keep edge labels inside card-layout bounds. | open: round 14 visual audit clear; final gate pending |
| F96 | Form and page guidance | Put schema findings first; link empty quality checks to Source; name project scope; remove repeated compact wizard step names and phone Edit labels. | open: round 14 visual audit clear; final gate pending |
| F97 | Server folder change | Preserve clone-instead guidance for authorized requests while concealing unreadable projects. | open: round 14 visual audit clear; final gate pending |
| F98 | Server review wording and layout | Wrap branch holders, compact phone mapping context and clarify Import/folder guidance. | open: round 14 visual audit clear; final gate pending |
| F99 | Capture coverage | Enter and verify each intended tab; isolate server viewport pages and assert sidebar visibility. | open: round 14 visual audit clear; final gate pending |
| F100 | Graph heading geometry | Reserve two compensated title lines above cards; measure title/card collisions and enforce the full 12 px name floor. | open: round 14 visual audit clear; final gate pending |
| F101 | Graph edges | Keep default strokes at screen width and measure composited contrast in both themes. | open: round 14 visual audit clear; final gate pending |
| F102 | Phone canvas and wording | Share the walk/Other files row; correct singular relationship counts and explain destination file paths. | open: round 14 visual audit clear; final gate pending |

| F103 | Phone graph controls | Reposition after full-screen entry and wrap the expansion selector. | open: round 14 visual audit clear; final gate pending |
| F104 | Wide graph layout | Use initial Layered routes and reserve visible gaps between full-detail neighbors. | open: round 14 visual audit clear; final gate pending |


## Round 6 follow-up

The complete server-light and server-dark captures each contain 208 images. Independent native
reviews SA–SF found six distinct serious defects, repeated in both themes. This is not a clean
full round; local capture follows the fixes.

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F105 | Admin roles matrix | Keep natural table height in the page-owned vertical scroller. | open: round 14 visual audit clear; final gate pending |
| F106 | Admin phone navigation | Hide clipped link fragments with the shared strip and reveal selected links. | open: round 14 visual audit clear; final gate pending |
| F107 | Neighborhood actions | Compensate before paint; retain 24 px targets and 12 px icons. | open: round 14 visual audit clear; final gate pending |
| F108 | Admin lists | Remove flex shrinking of tables and sections; show a stable page scrollbar. | open: round 14 visual audit clear; final gate pending |
| F109 | Mapping graph counts | Name reachable and total assets separately from visible card counts. | open: round 14 visual audit clear; final gate pending |
| F110 | Built-in roles | Label fixed definitions as Built-in role rather than read-only permissions. | open: round 14 visual audit clear; final gate pending |
| F111 | Admin guidance | Use Access grants consistently and explain person IDs and action prerequisites. | open: round 14 visual audit clear; final gate pending |

## Round 7 local follow-up

All 832 images were reviewed at native resolution. Server light/dark have no S1 or S2.
Local light/dark each have one S1 and four S2 rows; these are five distinct defects.

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F112 | Neighborhood relationship labels | Scale labels at fitted zoom; reserve bounds, show leaders, use an opaque layer above paths, and suppress clipped fragments. | open: round 14 visual audit clear; final gate pending |
| F113 | Empty access grants | Explain local full access and Add grant next step. | open: round 14 visual audit clear; final gate pending |
| F114 | Empty allowed-host policy | Explain that no configured hosts means server remote access is refused. | open: round 14 visual audit clear; final gate pending |
| F115 | Empty active sessions | Explain no sessions and local sign-in context. | open: round 14 visual audit clear; final gate pending |
| F116 | Project preview actions | Name project access and agent grant scopes and explain preview before saving. | open: round 14 visual audit clear; final gate pending |

| F117 | Graph attribution | Apply the shared 12 px and readable muted tokens; include attribution in interface legibility checks. | open: round 14 visual audit clear; final gate pending |

## Round 8 final visual result

The complete frozen capture at `6363a0e16699c6a891728de2d69acc4e4c78e4e9` contains
54 states at four sizes in local/server mode and light/dark: 864 images. All measurements
report zero problems, with no skipped views. Three independent reviewers inspected every native
image; all twelve reports account for every filename. They found **0 S1, 0 S2 and 8 S3 rows**,
representing the two repeated minor patterns below. A subsequent resize runtime correction
requires a fresh complete round before final R10 closure.

The [closure ledger](audit/closure.md) links earlier serious rows to their fixes. Final JPEGs
retain native dimensions, with source/output hashes in `screenshots/after/manifest.json`.

| Finding | Area | Remaining minor polish | Status |
| --- | --- | --- | --- |
| F118 | Sidebar scroll boundary | A partial next row can appear above fixed actions. | deferred S3: scrolling and actions remain usable; no unreadable content |
| F119 | Neighborhood long names | DocumentReference can wrap with a final two-letter line at 1440 px. | deferred S3: the complete name remains readable above the size floor |

## Resize delivery follow-up

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F120 | Graph and strip resize delivery | Queue layout-changing resize publication outside observer delivery; cancel pending work and reject uncaught errors in capture. | open: round 14 visual audit clear; final gate pending |


## Authentication supplement after round 9

The complete 864-image tour was clear. Independent review of all 84 authentication-suite
screenshots then found four serious rows in `audit/round-9-AUTH-{A,B,C}.md`: the same broken
public-page logo in two partitions, the long-refusal header and a cropped phone graph captured
before resize fitting. Loading metric/viewer captures also lacked settled content evidence.
These supplemental findings reopen the complete visual result until a fresh round is clear.

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F121 | Public identity-page branding | Serve only sanitized bundle assets without workspace access; preserve strict asset policies and verify decoded logos at every size. | open: round 14 visual audit clear; final gate pending |
| F122 | Long refusal header | Reserve readable title width and let the shared action group shrink instead of creating a zero-width, very tall title. | open: round 14 visual audit clear; final gate pending |
| F123 | Authentication capture completeness | Wait for settled calculations and graphs, then assert whole graph bounds and header geometry at every size. | open: round 14 visual audit clear; final gate pending |


## Round 10 coverage correction

The 168 authentication originals were independently reviewed. Twelve requested dark account
screens were light because their separate capture helper bypassed shared theme setup. The main
tour was stopped while incomplete; no complete round 10 is claimed. See `audit/round-10-coverage.md`.

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F125 | Account-dialog dark capture | Use the shared authentication capture helper and assert the active CSS color scheme. | open: round 14 visual audit clear; final gate pending |

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F126 | Initial graph measurement | Require fitted whole/centered bounds and stable node/path geometry before responsive measurements; retain strict clearance assertions and live drag behavior. | open: 137 responsive checks pass; final gate pending |

## Clone progress follow-up

| Finding | Area | Remediation | Status |
| --- | --- | --- | --- |
| F127 | Clone progress delivery | Wait for workspace update readiness and apply response/event transitions atomically so fast failures and completion remain visible. | open: ordering tests, Git setup and round 14 pass; final gate pending |

## Round 14: complete fresh security-update visual result

At `2ce466ca0e39184b573e6631525c0e524c3b7ceb`, authentication light/dark passed 84 images each;
local/server light/dark passed 216 each, with zero geometry or legibility problems, skips or
browser errors. Git setup passed and produced eight delayed connection-wait images across
four widths and both themes. Independent native review accounts for all 1,040 originals:
0 S1 / 0 S2 / 18 repeated S3 rows. Original dimensions and source/output hashes are
validated for every saved JPEG. No crop or resize was applied.

The dependency and runtime security updates retain the clean complete visual result. The full
49-command gate now restarts at this artifact commit; supplemental R11 evidence will be
refreshed at the verified gate head. Earlier failures remain documented, without relaxed checks.

## Expansion performance follow-up

| Finding | Area | Observed issue | Evidence | Resolution | Status |
| --- | --- | --- | --- | --- | --- |
| F131 | Neighborhood large expansion | An intermediate fit-all viewport mounts otherwise offscreen nodes and can exceed the 100 ms main-thread budget. | audit/round-15-performance.md | Choose and publish the readable viewport once; retain the original performance assertion. | fixed: three decision tests, three targeted mutants, ten clean graph runs and 80 transition checks; fresh round 16 and final gate pending |
