# Capture index

Use the frontend port assigned to the current lane. Commands below show the foundation lane's port 5201; the integration gate uses 5261.
`OUT` is an authorized scratch output root. Images remain outside Git. The Group/filter column lists optional command prefixes.
An unfiltered command preserves the original state sequence. The width column describes the requested output rather than an additional filter.
The standard matrix is 390×844, 1280×720, 1440×900 and 2560×1440.

Additional-state and follow-up scripts accept `SW_THEME=light` or `SW_THEME=dark` for one theme per batch; omitting it retains both.
Stock tours receive their theme as the final command argument. Server and follow-up fixtures allocate loopback ports dynamically.
Run one browser script at a time and stop its frontend, API and browser before the next batch. Check `free -g` before heavy steps;
with less than 8 GB available, wait and check again.

The foundation lane did not smoke-run the server and follow-up drivers. Integrated results belong in `evidence/GATE.md`.

| Review image | Script and arguments | Group/filter | Theme | Width |
| --- | --- | --- | --- | --- |
| `auth-pages/auth-page-no-access--page-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/connect-account-states.ts $OUT/auth-pages` | all | light | 1440 |
| `auth-pages/auth-page-sign-in-error--page-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/connect-account-states.ts $OUT/auth-pages` | all | light | 1440 |
| `followup/local-interaction--focus-native-select-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT content` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `followup/local-item-editor--duplicate-name-refusal-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT content` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `followup/local-mall-properties-lineage--more-columns-open-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT lineage` | SW_FOLLOWUP_WIDTH=1440; lineage | light | 1440 |
| `followup/local-mapped-commerce-mappings--concept-with-bindings-390-full.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT content` | SW_FOLLOWUP_WIDTH=390; content | light | 390 |
| `followup/local-status-bar--mall-semantic-yaml-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT content` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `followup/local-trash--populated-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-trash.ts $OUT` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `followup/local-ubl-full-graph--layered-node-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT graphs` | SW_FOLLOWUP_WIDTH=1440; graphs | light | 1440 |
| `followup/local-ubl-full-graph--network-node-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT graphs` | SW_FOLLOWUP_WIDTH=1440; graphs | light | 1440 |
| `followup/local-ubl-neighborhood--pierce-alone-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-local.ts $OUT graphs` | SW_FOLLOWUP_WIDTH=1440; graphs | light | 1440 |
| `followup/server-alice-admin--direct-address-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-server.ts $OUT` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `followup/server-carol-admin--direct-address-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/followup-server.ts $OUT` | SW_FOLLOWUP_WIDTH=1440; content | light | 1440 |
| `local-dark/local-dark-clone-folder-refused-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/capture-tour.ts $OUT/local-dark local dark` | all | dark | 1440 |
| `local-dark/local-dark-item-editor-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/capture-tour.ts $OUT/local-dark local dark` | all | dark | 1440 |
| `local-dark/local-dark-metric-wizard-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/capture-tour.ts $OUT/local-dark local dark` | all | dark | 1440 |
| `local-dark/local-dark-ontology-source-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/capture-tour.ts $OUT/local-dark local dark` | all | dark | 1440 |
| `local-light/local-catalog-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-catalog-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 2560 |
| `local-light/local-clone-repository-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-contract-graph-1280.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1280 |
| `local-light/local-contract-graph-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-contract-graph-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 2560 |
| `local-light/local-item-editor-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-mapping-graph-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-mappings-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-metric-detail-1280.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1280 |
| `local-light/local-metric-detail-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 2560 |
| `local-light/local-metrics-list-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `local-light/local-ontology-overview-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 2560 |
| `local-light/local-source-control-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/local-light local light` | all | light | 1440 |
| `server-light/server-admin-access-check-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 2560 |
| `server-light/server-admin-audit-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 1440 |
| `server-light/server-admin-grants-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 2560 |
| `server-light/server-admin-roles-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 1440 |
| `server-light/server-admin-settings-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 1440 |
| `server-light/server-query-composer-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-tour.ts $OUT/server-light server light` | all | light | 1440 |
| `server-personas/server-carol-source-control-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/server-pages.ts $OUT` | all | light | 1440 |
| `states/local-catalog--search-no-result-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=catalog; rest | light | 1440 |
| `states/local-catalog--search-no-result-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=catalog; rest | light | 390 |
| `states/local-clone-repository--connecting-wait-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/clone-states.ts $OUT/states` | all | light | 1440 |
| `states/local-contract-lineage--after-fit-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-contract-lineage--after-fit-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 2560 |
| `states/local-contract-lineage--column-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-contract-lineage--first-view-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-contract-lineage--first-view-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 390 |
| `states/local-contract-lineage--hops-3-list-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-contract-lineage--loading-1-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-contract-lineage--no-links-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-graph-states.ts $OUT/states` | all | light | 1440 |
| `states/local-contract-lineage--node-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-panel-states.ts $OUT/states` | all | light | 1440 |
| `states/local-dark-mapping-graph--empty-bindings-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | dark | 2560 |
| `states/local-dark-source-control--diff-modified-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/source-control-states.ts $OUT/states` | all | dark | 1440 |
| `states/local-dark-source-editor--stale-save-warning-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/source-control-states.ts $OUT/states` | all | dark | 390 |
| `states/local-dark-workspace--first-run-empty-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/empty-states.ts $OUT/states` | all | dark | 1440 |
| `states/local-dataset-lineage--first-view-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 2560 |
| `states/local-full-graph--empty-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-graph-states.ts $OUT/states` | all | light | 1440 |
| `states/local-full-graph-layered--first-view-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--areas-collapsed-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--first-view-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--first-view-2560.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 2560 |
| `states/local-full-graph-network--first-view-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 390 |
| `states/local-full-graph-network--fullscreen-node-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--labels-on-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--mini-map-on-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--zoomed-in-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-full-graph-network--zoomed-minimum-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-import--file-chosen-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-states.ts $OUT/states` | all | light | 1440 |
| `states/local-import--refused-file-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/file-states.ts $OUT/states` | all | light | 1440 |
| `states/local-lineage-walk--first-view-1280.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-walk-states.ts $OUT/states` | all | light | 1280 |
| `states/local-lineage-walk--first-view-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-walk-states.ts $OUT/states` | all | light | 1440 |
| `states/local-lineage-walk--first-view-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-walk-states.ts $OUT/states` | all | light | 390 |
| `states/local-lineage-walk--fitted-1-after-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-walk-states.ts $OUT/states` | all | light | 1440 |
| `states/local-lineage-walk--fitted-1-before-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-walk-states.ts $OUT/states` | all | light | 1440 |
| `states/local-mall-full-graph--group-automatic-1280.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/graph-loading-states.ts $OUT/states` | all | light | 1280 |
| `states/local-mall-full-graph--group-definition-types-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/graph-loading-states.ts $OUT/states` | all | light | 1440 |
| `states/local-mapping-graph--after-fit-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-mapping-graph--node-selected-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/lineage-panel-states.ts $OUT/states` | all | light | 1440 |
| `states/local-mappings--selected-binding-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=mappings; rest | light | 390 |
| `states/local-metric-wizard--step-1-empty-validation-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=metrics; rest | light | 1440 |
| `states/local-metric-wizard--step-2-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=metrics; rest | light | 1440 |
| `states/local-metric-wizard--step-3-validation-error-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=metrics; rest | light | 1440 |
| `states/local-metric-wizard--step-4-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=metrics; rest | light | 1440 |
| `states/local-metric-wizard--step-8-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=metrics; rest | light | 1440 |
| `states/local-neighborhood--empty-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-graph-states.ts $OUT/states` | all | light | 1440 |
| `states/local-neighborhood--first-view-1280.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1280 |
| `states/local-neighborhood--fullscreen-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 390 |
| `states/local-neighborhood--walk-3-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs` | graphs | light | 1440 |
| `states/local-remote-folder--refused-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 1440 |
| `states/local-shell--avatar-menu-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=shell; rest | light | 1440 |
| `states/local-shell--new-menu-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=shell; rest | light | 1440 |
| `states/local-source-control--branch-menu-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/file-states.ts $OUT/states` | all | light | 1440 |
| `states/local-source-control--commit-message-filled-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 1440 |
| `states/local-source-control--diff-modified-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 1440 |
| `states/local-source-control--diff-modified-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 390 |
| `states/local-source-control--staged-changes-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 1440 |
| `states/local-source-editor--invalid-unsaved-draft-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=editing; rest | light | 1440 |
| `states/local-source-editor--invalid-unsaved-draft-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states rest` | SW_ONLY=editing; rest | light | 390 |
| `states/local-source-editor--stale-save-warning-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/source-control-states.ts $OUT/states` | all | light | 1440 |
| `states/local-trash--populated-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-states.ts $OUT/states` | all | light | 1440 |
| `states/local-workspace--first-run-empty-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-states.ts $OUT/states` | all | light | 1440 |
| `states/local-workspace--project-no-files-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/empty-states.ts $OUT/states` | all | light | 1440 |
| `states/server-admin-access-change--review-confirm-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 1440 |
| `states/server-admin-access-check--allowed-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 1440 |
| `states/server-admin-access-check--refused-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 1440 |
| `states/server-admin-access-check--refused-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 390 |
| `states/server-admin-grant-form--validation-error-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 1440 |
| `states/server-admin-grant-form--validation-error-390.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/admin-states.ts $OUT/states` | all | light | 390 |
| `states/server-admin-protection--last-admin-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/last-admin-state.ts $OUT/states` | all | light | 1440 |
| `states/server-dark-admin-protection--last-admin-1440.png` | `SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=dark bun scripts/ui-review/last-admin-state.ts $OUT/states` | all | dark | 1440 |
