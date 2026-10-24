# Round 2 — server light diagnostic review B

Reviewed every assigned PNG from `/tmp/polish-review-SB.txt`, after reading
`/tmp/polish-round4/server/capture.log`. The log records zero automated geometry problems for these
captures. This is a diagnostic review, not a clean round: several filenames contain the wrong screen.
A screenshot cannot establish whether that mismatch comes from capture navigation or product behavior.
No claim is made about the intended views that are absent.

| # | Severity | Screen and size (screenshot file name) | Defect (what you see, where) | Suggested fix |
| --- | --- | --- | --- | --- |
| R2-SB-1 | S2 | `server-ontology-catalog-1280.png`, `server-ontology-catalog-1440.png`, `server-ontology-catalog-2560.png`, `server-ontology-graph-1280.png`, `server-ontology-graph-1440.png`, `server-ontology-graph-2560.png`, `server-ontology-mappings-1280.png`, `server-ontology-mappings-1440.png`, `server-ontology-mappings-2560.png`, `server-ontology-metrics-1280.png`, `server-ontology-metrics-1440.png`, `server-ontology-metrics-2560.png`, `server-ontology-neighborhood-1280.png`, `server-ontology-neighborhood-1440.png`, `server-ontology-neighborhood-2560.png`, `server-ontology-overview-1280.png`, `server-ontology-overview-1440.png`, `server-ontology-overview-2560.png`, `server-ontology-source-1280.png`, `server-ontology-source-1440.png`, `server-ontology-source-2560.png`, `server-sidebar-projects-390.png` | Capture coverage failure: every listed desktop ontology image shows the Source control page, rather than the view in its filename. The phone sidebar image shows a closed sidebar and a graph with nodes beyond the right edge, rather than the project list. These images cannot verify the intended screens. | Explicitly enter Model explorer before selecting ontology tabs; assert the selected view and visible content before capture. Open and assert the phone sidebar before its capture. Recapture and review the missing views. |
| R2-SB-2 | S2 | `server-remote-folder-1280.png`, `server-remote-folder-1440.png`, `server-remote-folder-2560.png`, `server-remote-folder-390.png`, `server-remote-folder-refused-1280.png`, `server-remote-folder-refused-1440.png`, `server-remote-folder-refused-2560.png`, `server-remote-folder-refused-390.png` | The folder help promises “If you change it, you see which files move before anything changes,” but the refusal state immediately says this works only in local mode. The unchanged help and error contradict each other in the same dialog. | In server mode, explain the local-only restriction and clone-instead route beside the field before submission. Retain the useful refusal text. |
| R2-SB-3 | S3 | `server-ontology-mappings-390.png` | The physical-sources summary reads “1 datasets.” | Use the singular “1 dataset.” |
| R2-SB-4 | S3 | `server-project-delete-1280.png`, `server-project-delete-1440.png`, `server-project-delete-2560.png`, `server-project-delete-390.png` | The deletion summary reads “1 file go to the trash.” | Use “1 file goes to the trash” or “Files moved to trash: 1.” |

No S1 visual defect was observed in the rendered content. There is one product S2 wording row and one
S2 capture coverage row. The missing intended views prevent a clean-round result.

Screens with no defects

- `server-odcs-dataset-relationships-1280.png`
- `server-odcs-dataset-relationships-1440.png`
- `server-odcs-dataset-relationships-2560.png`
- `server-odcs-dataset-relationships-390.png`
- `server-odcs-property-edit-1280.png`
- `server-odcs-property-edit-1440.png`
- `server-odcs-property-edit-2560.png`
- `server-odcs-property-edit-390.png`
- `server-ontology-catalog-390.png`
- `server-ontology-graph-390.png`
- `server-ontology-metrics-390.png`
- `server-ontology-neighborhood-390.png`
- `server-ontology-overview-390.png`
- `server-ontology-source-390.png`
- `server-project-export-1280.png`
- `server-project-export-1440.png`
- `server-project-export-2560.png`
- `server-project-export-390.png`
- `server-project-export-history-1280.png`
- `server-project-export-history-1440.png`
- `server-project-export-history-2560.png`
- `server-project-export-history-390.png`
- `server-project-rename-1280.png`
- `server-project-rename-1440.png`
- `server-project-rename-2560.png`
- `server-project-rename-390.png`
- `server-query-composer-1280.png`
- `server-query-composer-1440.png`
- `server-query-composer-2560.png`
- `server-query-composer-390.png`
- `server-sidebar-projects-1280.png`
- `server-sidebar-projects-1440.png`
- `server-sidebar-projects-2560.png`
- `server-source-control-1280.png`
- `server-source-control-1440.png`
- `server-source-control-2560.png`
- `server-source-control-390.png`
- `server-source-control-sync-1280.png`
- `server-source-control-sync-1440.png`
- `server-source-control-sync-2560.png`
- `server-source-control-sync-390.png`
- `server-source-editor-1280.png`
- `server-source-editor-1440.png`
- `server-source-editor-2560.png`
- `server-source-editor-390.png`
- `server-trash-1280.png`
- `server-trash-1440.png`
- `server-trash-2560.png`
- `server-trash-390.png`

Reviewed: **84 screenshots**. Rows: **0 S1, 2 S2, 2 S3**.
