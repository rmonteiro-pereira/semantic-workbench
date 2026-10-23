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
| F04 | Sidebar project tree | The first tree row is cut by the PROJECTS label; the tree scrolls behind its header; the footer note is cut at 720 px. | local-projects-1440, workbench-ui-matrix | Header stays above a scrolling region that starts below it | fixed: the tree scrolls between the navigation and a fixed footer; rows fade at the edges |
| F05 | Add concept, add item dialogs | The dialog sits at the lower right and is cut at the right edge at 1440 and 2560 px. | workbench-item-add | Centre it with the shared dialog rules | fixed: add dialogs are centred dialogs |
| F06 | Edit metric and item drawer | The Delete, Cancel and Save row sits in the middle of the form; fields continue under it. | workbench-item-kpi-edit | Footer pinned below a scrolling body | fixed: actions sit in the dialog footer below one scrolling body |
| F07 | Metric wizard step strip | Steps run past the drawer edge ("7 Explanati…"); no scroll cue (finding 5 of feature 002). | workbench-item-wizard-preview | One "Step N of M" line with the step name | fixed: "Step N of M" line with a step select |
| F08 | Graph, neighborhood and lineage toolbars | At 390 px the last buttons ("Fit m…", "Relationship") are cut; with the details panel open at 1280 px "Labels", "Overview", "Neighborhood" are cut. | local-graph-390, workbench-overlap-graph-1280 | Few primary controls; the rest in one "View options" dialog | fixed: toolbars keep a few controls; the rest is in View options |
| F09 | Tab strip at 390 px | Tabs are cut at both edges with no cue that the strip scrolls. | local-odcs-graph-390 | One select-style view switcher at phone width | fixed: the strip scrolls and its edge fade is now 32 px wide, so a cut tab reads as more to scroll to |
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
| F56 | ODCS terminology | Everything is labelled "contract object". The schema objects are Tables in all UI text (lists, headings, counts, breadcrumbs, empty states, legend, search); a type other than table shows as a small badge. ODCS terms stay only where they name the standard's fields. | local-contract-contract-1280 | open |
| F57 | ODCS graph, data view and lineage | The ODCS graph needs the most work: table cards that read at the default zoom, a clear PK/FK legend and edge labels, a first view without crop, no overlapping cards or edges, controls in the shared toolbar and View options, selection and neighbour highlighting. Then the data view and lineage. | local-contract-graph-1280 | open |
| F58 | Foreign-key steps | The foreign-key hops are confusing in the lineage and graph steps and in the data view. Each hop reads as `orders.customer_id → customers.id`, the direction is clear, the hop count and path show in one place, the stepping control has plain labels and one line of help. | local-contract-graph-1280 | open |
| F59 | Sidebar Examples | The Examples button becomes a fly-out menu anchored to the button, keyboard accessible. | local-ontology-overview-1280 | open |
| F60 | Header, top-right corner | Person menu, mode badge, save state and the rest are ungrouped and uneven. Group them, keep the essentials, move the rest into the person or an overflow menu, align heights and spacing, and make it work at 390 px. | server-projects-1280 | open |
| F61 | Visual audit | Every screen and dialog at four sizes, local and server mode, light and dark where the app has both, reviewed strictly by a separate reviewer until a round finds no S1 or S2 item. | specs/004-ui-polish/screenshots/after | open |
| F62 | Theme | Colours are literals spread over CSS, inline styles and renderers, so changing the palette is hard. One theme file of semantic tokens, light and dark value sets, a check that fails on a literal elsewhere, docs and a browser check that swaps the accent. | src/style.css | open |
| F63 | Lineage view | A dedicated redesign pass: defects listed first, readable cards, clean first view, no overlaps, path highlight, plain hop sentences, Full pierce kept, understandable fan-out collapse, shared toolbar plus View options. | local-contract-graph-1280 | open |
| F64 | Earlier owner asks | Full-screen graph, YAML highlighting with SQL, trash icons, file list hierarchy, real concept mappings, VS Code-like source control and click-to-edit must still work and look right after the polish. | specs/004-ui-polish/screenshots/after | open |
| F65 | Table cards on the lineage canvas and the ODCS graph | A card shows "93 more columns" and page buttons "1 2 ... 11". Cards must show the columns that matter (keys, columns with an edge in view or on the path, search matches), end with "+ N more columns" that expands in place to one scrollable, virtualised list with a filter above about 30 columns and "Show fewer", with no page numbers anywhere and edges anchored to scrolled rows. | owner photo | open |
| F66 | Edge labels on parallel edges | The word "lines" repeats on several parallel dashed edges. A bundle is labelled once, or its label shows on hover or selection. | owner photo | open |
| F67 | Built-in examples | The examples have no metrics, so the Metrics view, breakdown, lineage path and SQL preview show nothing for them. Add workbench-authored metrics (simple, derived, foreign-key path; owner and status) bound to real ODCS columns, without editing hash-checked upstream files. | local-ontology-metrics-1280 | open |
| F68 | Project menu | New feature: Export project... after Import files into this project; byte-exact zip, optional Git history bundle, drafts excluded, server mode filtered by read access and audited, streamed under the size limits. | owner photo | open |
| F69 | Project menu popup | The menu is cut off by the file list (Delete is half hidden) and fades into the names behind it, because it sits inside the masked, scrolling list. Menus must be opaque, anchored in the viewport and fixed in the shared menu component. | owner photo, shots-measure/menu | open |
| F70 | Remote and Clone dialogs | New feature for v0.5.0: a Folder in repository field, with sparse checkout, so a project can live in a subfolder of a shared remote repository and clone, pull and push touch that folder only. | src/scm | open |

## S2: crammed or hard to read

| # | Where | Finding | Screenshot | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F18 | Whole interface | 172 declarations use text below 12 px (sidebar captions, status bar, table headers, legends, badges); 40 to 190 text runs per screen measure under 12 px. | workbench-ui-overview | A 12 px floor in shared type tokens, asserted in the browser suite | fixed: 12 px floor, asserted at four sizes |
| F19 | Whole interface | Muted text is a pale grey (about 3:1 contrast) on white. | workbench-sweep-contract-1280 | A darker muted token | fixed: --text-muted at 4.5:1 or better |
| F20 | Neighborhood, graph and lineage at fit zoom | Card text renders at 5 to 7 px; buttons inside cards are unusable. | local-neighborhood-1280, workbench-lineage-ubl-1280 | Card text sized for the fitted zoom; extras only when zoomed in | fixed: below zoom 0.6 neighborhood and lineage cards drop detail lines and show the name at a size that stays at least 12 px on screen down to zoom 0.27 (below that it shrinks with the canvas); buttons become icon-only and scale with it |
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
