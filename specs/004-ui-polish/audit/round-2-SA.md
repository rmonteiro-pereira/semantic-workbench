# Round 2 SA: server light, diagnostic capture review

Read the audit brief and capture log before reviewing all 80 assigned images. The log reports zero automated geometry problems. Screenshots came from `/tmp/polish-round4/server/`.

**Coverage failure: this is not a valid complete audit round.** `server-contract-contract-1280.png`, `server-contract-contract-1440.png`, `server-contract-contract-2560.png`, `server-contract-graph-1280.png`, `server-contract-graph-1440.png` and `server-contract-graph-2560.png` show Source control instead of their named contract or graph views. Their 390 counterparts show the named views. The observations below describe only what is actually visible; recapture the missing views before making a clean-round claim.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
|---|---|---|---|---|
| R2-SA-1 | S2 | server-contract-contract-1280.png, server-contract-contract-1440.png, server-contract-graph-1280.png, server-contract-graph-1440.png, server-clone-repository-1440.png | The Source control Branch select cuts the selected label to “main (in use by the publi…” beside its arrow. The explanatory published-state wording cannot be read in the closed control. | Keep the branch name in the select and place the published-state explanation below it. |
| R2-SA-2 | S2 | server-mappings-390.png | At phone width the introduction, actions, mapping picker and four vertically stacked summary fields occupy y≈190–670. The concept filter starts near y=700 and no binding or concept entry is visible before the status bar. This first view explains navigation but does not show the mapping itself. | Use a compact two-column summary and shorten the introduction so the first concept or binding appears in the first view. |
| R2-SA-3 | S2 | server-import-390.png, server-import-1280.png, server-import-1440.png, server-import-2560.png | The dialog explicitly accepts YAML, JSON and several RDF formats, but the selected new-project option says “Uses the name of the ontology you import” while a data contract is visible behind it. The explanation unnecessarily identifies all imported definitions as ontologies. | Say “Uses the name declared in the imported file.” |
| R2-SA-4 | S3 | server-mappings-390.png, server-mappings-1280.png, server-mappings-1440.png, server-mappings-2560.png | The Physical sources summary reads “1 datasets”; desktop also reads “1 resolved bindings”. Singular counts use plural labels. | Use singular labels for a count of one. |
| R2-SA-5 | S3 | server-file-move-390.png, server-file-move-1280.png, server-file-move-1440.png, server-file-move-2560.png | The path field is labelled “Path in that project” without explaining whether it expects a folder or a complete file path. The displayed value is a filename. | Add “Folder and file name inside the target project” below the input. |
| R2-SA-6 | S3 | server-catalog-1280.png, server-add-concept-1280.png, server-metrics-list-1280.png | The sidebar list ends abruptly at y≈502 through the finance/revenue file row; the file icon and first filename line are visible but the rest of the row is hidden by the fixed footer block. | Leave bottom scroll padding or size the visible list to end on a complete row. |

## Screens with no defects

- server-add-concept-1440.png
- server-add-concept-2560.png
- server-add-concept-390.png
- server-catalog-1440.png
- server-catalog-2560.png
- server-catalog-390.png
- server-clone-folder-1280.png
- server-clone-folder-1440.png
- server-clone-folder-2560.png
- server-clone-folder-390.png
- server-clone-folder-refused-1280.png
- server-clone-folder-refused-1440.png
- server-clone-folder-refused-2560.png
- server-clone-folder-refused-390.png
- server-clone-repository-1280.png
- server-clone-repository-2560.png
- server-clone-repository-390.png
- server-contract-contract-390.png
- server-contract-graph-390.png
- server-item-editor-1280.png
- server-item-editor-1440.png
- server-item-editor-2560.png
- server-item-editor-390.png
- server-metric-detail-1280.png
- server-metric-detail-1440.png
- server-metric-detail-2560.png
- server-metric-detail-390.png
- server-metric-wizard-1280.png
- server-metric-wizard-1440.png
- server-metric-wizard-2560.png
- server-metric-wizard-390.png
- server-metrics-filters-1280.png
- server-metrics-filters-1440.png
- server-metrics-filters-2560.png
- server-metrics-filters-390.png
- server-metrics-list-1440.png
- server-metrics-list-2560.png
- server-metrics-list-390.png
- server-odcs-contract-search-1280.png
- server-odcs-contract-search-1440.png
- server-odcs-contract-search-2560.png
- server-odcs-contract-search-390.png
- server-odcs-contract-section-1280.png
- server-odcs-contract-section-1440.png
- server-odcs-contract-section-2560.png
- server-odcs-contract-section-390.png
- server-odcs-dataset-history-1280.png
- server-odcs-dataset-history-1440.png
- server-odcs-dataset-history-2560.png
- server-odcs-dataset-history-390.png
- server-odcs-dataset-properties-1280.png
- server-odcs-dataset-properties-1440.png
- server-odcs-dataset-properties-2560.png
- server-odcs-dataset-properties-390.png
- server-odcs-dataset-quality-1280.png
- server-odcs-dataset-quality-1440.png
- server-odcs-dataset-quality-2560.png
- server-odcs-dataset-quality-390.png

Screenshots reviewed: 80. S1: 0 rows. S2: 3 rows. S3: 3 rows.

No S1 was observed in the reviewed pixels. S2 findings remain, and capture coverage is incomplete. Tooltip behavior, scroll reachability and exact computed contrast cannot be established from these static images.
