# Round 5 — server mode, dark theme, reviewer D

Reviewed all 84 assigned screenshots individually at 390, 1280, 1440, and 2560 pixels.
Every intended screen matches its filename. The capture log contains 164 measurements, all with
zero problems, and no skipped captures. Dialogs and the mobile drawer are opaque and consistently dark.

Counts: **0 S1, 1 S2, 1 S3**. Eleven screenshots show a listed defect; 73 are clean.
No S1 defects were found.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R5-SD-1 | S2 | `server-dark-ontology-graph-1280.png`, `server-dark-ontology-graph-1440.png`, `server-dark-ontology-graph-2560.png`, `server-dark-ontology-graph-390.png`, `server-dark-sidebar-projects-1280.png`, `server-dark-sidebar-projects-1440.png`, `server-dark-sidebar-projects-2560.png` | Relationship lines are thin, dark green strokes close to the dark canvas color. Long connections between the definition groups are difficult to trace, especially around the ValueType group. They are substantially fainter than the clearly visible Neighborhood edges. | Increase the dark-theme relationship stroke contrast through the shared graph tokens while keeping the group outlines quieter. |
| R5-SD-2 | S3 | `server-dark-ontology-overview-1280.png`, `server-dark-ontology-overview-1440.png`, `server-dark-ontology-overview-2560.png`, `server-dark-ontology-overview-390.png` | The EntityType card footer says “1 internal relationships”, with a plural noun for one relationship. | Use “1 internal relationship” when the count is one. |

## Screens with no defects

- `server-dark-odcs-dataset-relationships-1280.png`
- `server-dark-odcs-dataset-relationships-1440.png`
- `server-dark-odcs-dataset-relationships-2560.png`
- `server-dark-odcs-dataset-relationships-390.png`
- `server-dark-odcs-property-edit-1280.png`
- `server-dark-odcs-property-edit-1440.png`
- `server-dark-odcs-property-edit-2560.png`
- `server-dark-odcs-property-edit-390.png`
- `server-dark-ontology-catalog-1280.png`
- `server-dark-ontology-catalog-1440.png`
- `server-dark-ontology-catalog-2560.png`
- `server-dark-ontology-catalog-390.png`
- `server-dark-ontology-mappings-1280.png`
- `server-dark-ontology-mappings-1440.png`
- `server-dark-ontology-mappings-2560.png`
- `server-dark-ontology-mappings-390.png`
- `server-dark-ontology-metrics-1280.png`
- `server-dark-ontology-metrics-1440.png`
- `server-dark-ontology-metrics-2560.png`
- `server-dark-ontology-metrics-390.png`
- `server-dark-ontology-neighborhood-1280.png`
- `server-dark-ontology-neighborhood-1440.png`
- `server-dark-ontology-neighborhood-2560.png`
- `server-dark-ontology-neighborhood-390.png`
- `server-dark-ontology-source-1280.png`
- `server-dark-ontology-source-1440.png`
- `server-dark-ontology-source-2560.png`
- `server-dark-ontology-source-390.png`
- `server-dark-project-delete-1280.png`
- `server-dark-project-delete-1440.png`
- `server-dark-project-delete-2560.png`
- `server-dark-project-delete-390.png`
- `server-dark-project-export-1280.png`
- `server-dark-project-export-1440.png`
- `server-dark-project-export-2560.png`
- `server-dark-project-export-390.png`
- `server-dark-project-export-history-1280.png`
- `server-dark-project-export-history-1440.png`
- `server-dark-project-export-history-2560.png`
- `server-dark-project-export-history-390.png`
- `server-dark-project-rename-1280.png`
- `server-dark-project-rename-1440.png`
- `server-dark-project-rename-2560.png`
- `server-dark-project-rename-390.png`
- `server-dark-query-composer-1280.png`
- `server-dark-query-composer-1440.png`
- `server-dark-query-composer-2560.png`
- `server-dark-query-composer-390.png`
- `server-dark-remote-folder-1280.png`
- `server-dark-remote-folder-1440.png`
- `server-dark-remote-folder-2560.png`
- `server-dark-remote-folder-390.png`
- `server-dark-remote-folder-refused-1280.png`
- `server-dark-remote-folder-refused-1440.png`
- `server-dark-remote-folder-refused-2560.png`
- `server-dark-remote-folder-refused-390.png`
- `server-dark-sidebar-projects-390.png`
- `server-dark-source-control-1280.png`
- `server-dark-source-control-1440.png`
- `server-dark-source-control-2560.png`
- `server-dark-source-control-390.png`
- `server-dark-source-control-sync-1280.png`
- `server-dark-source-control-sync-1440.png`
- `server-dark-source-control-sync-2560.png`
- `server-dark-source-control-sync-390.png`
- `server-dark-source-editor-1280.png`
- `server-dark-source-editor-1440.png`
- `server-dark-source-editor-2560.png`
- `server-dark-source-editor-390.png`
- `server-dark-trash-1280.png`
- `server-dark-trash-1440.png`
- `server-dark-trash-2560.png`
- `server-dark-trash-390.png`
