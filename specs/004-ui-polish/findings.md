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
| F01 | Lineage and graph canvases | The zoom controls (bottom left) sit on top of cards and hide field names and card edges. | local-lineage-mall-1280, local-odcs-data-graph-390 | Controls sit in a gutter beside the canvas, never over cards | open |
| F02 | Whole-model graph, neighborhood | The minimap is large, opaque and covers cards and edge labels. | workbench-overlap-bundle-1280 | Smaller, translucent, hidden when a panel is open or below 1100 px | open |
| F03 | Lineage with a selected path | The Selected path panel covers the canvas (a third of it at 1024 px, most of it at 390 px). | workbench-lineage-pierce, workbench-final-sweep-pierce-390 | Collapsed chip that opens a dialog; the canvas keeps its width | open |
| F04 | Sidebar project tree | The first tree row is cut by the PROJECTS label; the tree scrolls behind its header; the footer note is cut at 720 px. | local-projects-1440, workbench-ui-matrix | Header stays above a scrolling region that starts below it | open |
| F05 | Add concept, add item dialogs | The dialog sits at the lower right and is cut at the right edge at 1440 and 2560 px. | workbench-item-add | Centre it with the shared dialog rules | open |
| F06 | Edit metric and item drawer | The Delete, Cancel and Save row sits in the middle of the form; fields continue under it. | workbench-item-kpi-edit | Footer pinned below a scrolling body | open |
| F07 | Metric wizard step strip | Steps run past the drawer edge ("7 Explanati…"); no scroll cue (finding 5 of feature 002). | workbench-item-wizard-preview | One "Step N of M" line with the step name | open |
| F08 | Graph, neighborhood and lineage toolbars | At 390 px the last buttons ("Fit m…", "Relationship") are cut; with the details panel open at 1280 px "Labels", "Overview", "Neighborhood" are cut. | local-graph-390, workbench-overlap-graph-1280 | Few primary controls; the rest in one "View options" dialog | open |
| F09 | Tab strip at 390 px | Tabs are cut at both edges with no cue that the strip scrolls. | local-odcs-graph-390 | One select-style view switcher at phone width | open |
| F10 | ODCS contract, schema objects table | The table runs past its card (PROPERTIES shows as "P", KEYS and DESCRIPTION unreachable at 1280; only OBJECT at 390). | local-odcs-data-1280, local-odcs-data-390 | Rows with name, type, keys and a short line; the rest in the object page | open |
| F11 | ODCS dataset page, Properties table | Ten columns run off the page; the physical type column is empty for every row; the FK badge is cut. | workbench-sweep-dataset-page-1280, workbench-odcs-narrow | Few columns; the rest in an edit dialog | open |
| F12 | Admin, Audit at 390 px | The filters take the dialog; the result keeps one column. | workbench-admin-audit-390 | Filters behind a disclosure, results as cards | open |
| F13 | Admin dialogs opened from another dialog | The parent dialog, its text and its Close button show beside the child, so two Close buttons appear. | workbench-admin-grant-form-1280 | Parent is hidden while the child is open | open |
| F14 | Phone drawer behind dialogs | Import, Trash and Grouping open over the sidebar drawer, which stays visible. | local-trash-390 | Close the drawer first | open |
| F15 | Source control project select | The select is wider than its column; its arrow is cut. | workbench-sweep-source-control-1280 | Select fits its column | open |
| F16 | ODCS graph first view | The first view is cropped: the left card loses its names, the right one its edge. | local-odcs-data-graph-1280 | Fit with padding once layout settles | open |
| F17 | Header at 1280 px | Title, "Saved to file · 0 uncom…" and "Commit…" are cut with an ellipsis. | local-neighborhood-1280 | Shorter state label with the full text in its title and name | open |

## S2: crammed or hard to read

| # | Where | Finding | Screenshot | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| F18 | Whole interface | 172 declarations use text below 12 px (sidebar captions, status bar, table headers, legends, badges); 40 to 190 text runs per screen measure under 12 px. | workbench-ui-overview | A 12 px floor in shared type tokens, asserted in the browser suite | open |
| F19 | Whole interface | Muted text is a pale grey (about 3:1 contrast) on white. | workbench-sweep-contract-1280 | A darker muted token | open |
| F20 | Neighborhood, graph and lineage at fit zoom | Card text renders at 5 to 7 px; buttons inside cards are unusable. | local-neighborhood-1280, workbench-lineage-ubl-1280 | Card text sized for the fitted zoom; extras only when zoomed in | open |
| F21 | ODCS contract page | Identity strip, purpose, limitations, a mostly empty Team table and the object table are stacked in one long page. | local-odcs-contract-tab-1440, workbench-sweep-contract-1280 | Summary first, detail sections in dialogs, empty columns hidden | open |
| F22 | ODCS dataset page | "Open in lineage" is drawn as a sixth tab inside the view switcher; its label is long. | workbench-odcs-schema | A button in the header card | open |
| F23 | ODCS dataset page, Properties | Inline selects and three checkboxes per row; classification looks disabled; editing and reading share one cell. | workbench-auth-property-editors-editor-1280 | Read-only rows with badges; Edit opens a dialog | open |
| F24 | ODCS pages at 390 px | Tables scroll sideways with no cue; the sub-tab strip is cut at "Propertie". | workbench-sweep-dataset-page-390, workbench-sweep-contract-390 | Cards at phone width | open |
| F25 | Lineage toolbar | Twelve controls in two rows plus a group select; two unlabelled full-screen icons. | local-odcs-data-graph-1440 | Search, Full pierce and one options button; labelled icons | open |
| F26 | Neighborhood toolbar | Five rows (centre, filters, actions, legend, trail) take about 190 px. | local-neighborhood-1280 | Two rows; the filters in View options | open |
| F27 | Whole-model graph toolbar | Nine controls plus Group by and search; five bands at 390 px. | local-graph-390 | Layout and Fit visible; the rest in View options | open |
| F28 | Details panel on Overview, Catalog, Graph | At 1280 px the inspector takes a third of the width; at 390 px it is an in-flow block of 500 px. | workbench-overlap-neighborhood-1280, workbench-overlap-overview-390 | Dialog sheet at phone width | open |
| F29 | Source control | Eight to ten stacked controls in a 350 px column; the model tabs and entity search show above a Git view; remote actions mixed with commit. | local-source-control-1280, workbench-auth-two-editors-source-control-1280 | Sync actions in a Sync dialog; tabs hidden here | open |
| F30 | Metrics list | Filters wrap into three rows; five columns of dashes; an "Add attributes" button on every row. | workbench-sweep-metrics-1280, workbench-metrics-detail | Filter dialog; empty columns hidden | open |
| F31 | Metric detail | Formula, built from, rules and SQL all show at once. | workbench-metrics-2560 | Rules and SQL are sections that open on demand | open |
| F32 | Compose a query | Three nested scroll regions; a flat list of 36 or more fields (finding 11 of feature 002). | workbench-mapping-query, billing-ambiguous-query | Field filter; the dialog scrolls once | open |
| F33 | Admin dialogs | Plain list launcher; grant form shows no Save; raw identifiers and UUIDs repeated; 11 built-in rules before custom ones; camelCase action names. | workbench-admin-launcher-1280, workbench-admin-grant-form-1280, workbench-admin-policies-1280 | Launcher with descriptions; footers hold actions; names before IDs; built-in rules folded | open |
| F34 | Admin dialogs | The sentence about the last Admin repeats under every title. | workbench-admin-deactivate-1280 | Only where it applies | open |
| F35 | Refused property edit | The refusal is drawn as a success bar and its chip is cut ("Not saved: this …"). | workbench-auth-guarded-refusal-1280 | Warning style, full message | open |
| F36 | Catalog | The Edit button crowds the type label; every card repeats the same long description. | local-catalog-1280 | Aligned cards; two-line description | open |
| F37 | Mappings | Four summary cards and a stack before the first concept; the first concept card is cut at the top of its list (finding 10 of feature 002). | local-mappings-390, workbench-mapping-chains | One summary line; list scrolls whole cards | open |
| F38 | Sign-in pages, person menu | The pages are a bare left column; the person menu name is larger than the menu items and items are centred. | workbench-auth-no-access-1280, workbench-auth-person-menu-1280 | Card with the logo; menu aligned and sized to the scale | open |
| F39 | Sidebar rows | Delete and menu icons show on every row; file names wrap mid-word at 220 px; Clear workspace wraps. | workbench-projects-tree | Actions on hover and focus; truncation | open |
| F40 | Lineage options dialog | Checkbox sits above its label. | workbench-final-sweep-dialog-lineage-options-1280 | Row layout | open |
| F41 | Toasts | Status messages push the layout and cover the footer status. | workbench-item-wizard-saved | Overlay toast | open |
| F42 | Trash, More menu | An empty Trash opens a dialog that only says "empty"; the More menu holds one item. | local-trash-1280, local-more-menu-1280 | Export in the header; Trash count | open |

## S3: polish carried over from features 002 and 003

| # | Where | Finding | Screenshot | Status |
| --- | --- | --- | --- | --- |
| F43 | Mapping graph toolbar | The options button reads "Lineage options…" (finding 1). | workbench-mapping-graph-mall-1440 | open |
| F44 | Status footer on a mapping file | Reads "167 entities · 0 relationships" (finding 2). | workbench-mapping-graph-mall-1440 | open |
| F45 | Source Control change rows, shared repository | The project tag wraps under the file name (finding 6). | workbench-monorepo-scm | open |
| F46 | Projects dialogs | Name inputs use the 16 px size while paths use 12.5 px (finding 7). | workbench-monorepo-projects-1440 | open |
| F47 | Delete dialog, subfolder choice | Choice labels render at regular weight (finding 8); the Sales title wraps at 390 px (finding 12). | workbench-monorepo-delete-1280 | open |
| F48 | Editor status bar | "Large file mode" is plain text (finding 13). | workbench-sql-large-mode | open |
| F49 | Neighborhood pierce lanes | Long lane routes around the canvas (finding 4); first view of a metric lacks its dataset (finding 3). | workbench-neighborhood-pierce-budget | open |
| F50 | Clone dialog result | Manifest sentence above the invalid files (finding 9). | workbench-monorepo-clone | open |

Measured before the fixes (`scripts/polish-capture.ts`): no text collisions on any non-dialog
screen at the four sizes; 17 to 190 text runs per screen below 12 px; no cut-off controls
reported by the existing control check, because scrolling strips count as reachable.
