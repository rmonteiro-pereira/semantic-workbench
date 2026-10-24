# Earlier owner requests: final acceptance

All seven acceptance rows are verified in the browser. The final gate head and command results
are in `gate-results.json`; native screenshots retain original dimensions and source/output
hashes. The round 16 workspace and authentication matrix covers every required size and theme.
The supplemental proof index adds 61 images from successful suites and the click-to-edit walk.
Independent reports `audit/r11-proof-A.md` through `r11-proof-D.md` review every supplemental
original. There are no S1 or S2 findings. Repeated sidebar fragments are deferred F118. Minor
rename-operation wording and a duplicated
RDF refusal explanation are deferred F128/F129; the reference panel and refusal remain clear.
The repair summary’s singular noun agreement is deferred F130; counts and details remain clear.

| Ask | Browser evidence | Reviewed after evidence | Status |
| --- | --- | --- | --- |
| a. Full-screen graph | `test:graph`, `test:responsive`: enter/exit, inspector overlay, Escape, selection and zoom preserved | `screenshots/after/*-ontology-graph-fullscreen-*.jpg` and neighborhood full-screen, all modes/themes/sizes | verified |
| b. YAML, embedded SQL highlighting and lint | `test:editor` 9 checks and `test:sql`; real typing, lint markers, repair and large files | `screenshots/after/r11/workbench-editor-*.jpg`, `workbench-sql-*.jpg`; proof A | verified |
| c. Row trash icons | `test:trash`; row actions and recovery | `screenshots/after/r11/workbench-trash-row-icons.jpg`; proof A | verified |
| d. Project as file list | `test:projects`, `test:monorepo`; hierarchy, folders, selected file and repository actions | `screenshots/after/r11/workbench-projects-tree.jpg`, `workbench-monorepo-*.jpg`; A/C | verified |
| e. Real concept mappings | `test:mapping-graph` 12 checks, `test:mappings-layout` 4 checks; edges match resolver bindings | `screenshots/after/*-mapping-graph-*.jpg`, all four modes and sizes; round 16 C/F partitions | verified |
| f. Source control | `test:scm` 11 checks, `test:git-setup`, `test:monorepo`; stage, diff, commit, branch, pull, conflicts, history, credentials and no-Git states | `screenshots/after/r11/workbench-scm-*.jpg`, `workbench-git-*.jpg`; proof C | verified |
| g. Click-to-edit entities and relationships | `test:item-edit`, `test:rdf-edit`; supplemental Customer and places walk at four sizes, both themes, dialog geometry/contrast and zero browser errors | `screenshots/after/r11/workbench-item-*.jpg`, `workbench-rdf-*.jpg`, `workbench-click-*.jpg`; B/D | verified |

The row-icon driver intentionally captures the sidebar region at 300×500; it is preserved
without resizing. Other supplemental sources are full viewport images. The final full-workspace
matrix separately proves sidebar geometry at 390×844, 1280×720, 1440×900 and 2560×1440.

A branch screenshot initially showed loading despite successful functional branch assertions.
A fresh same-head replay waits for the enabled Branch selector with value `main` before capture;
the replacement and its provenance are recorded in the supplemental manifest and proof C.
