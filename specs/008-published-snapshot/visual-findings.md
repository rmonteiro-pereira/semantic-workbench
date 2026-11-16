# Published snapshot visual findings

The native comparison found no unrequested product regression. Publication controls, preview wording and
export source selection account for the intended interface changes. Capture timing and fixture selection
issues were corrected before producing the final index. The inherited responsive canvas assertion remains
an explicit exception owned by the UI fix branch.

## Coverage and provenance

[Comparison index](comparison-index.md) pairs 464 screens, backed by 928 PNG files. Each revision contains
58 states at 390×844, 1280×720, 1440×900 and 2560×1440 in both local and server modes. All four complete
journeys finished with exit 0 and 232 `problems=0` measurements each, with no skipped screen or uncaught
browser error. Focused sidebar recaptures also passed all sixteen measurements across both revisions and
modes. Light-theme captures are paired here; the separate dark-theme responsive checks passed five checks.

The release is v0.6.1 (`3b1c2c10bc6ae96c6c603301764bde4cfdc4dcd4`). Feature application source was frozen at
`bab84471` for the original completion gate. The later architecture corrections change server ownership
and the publication notice; their new browser geometry checks and captures are recorded separately in
verification. These 928 PNGs remain evidence for the original compared revisions. Capture-only corrections are recorded by the driver hashes in
[capture manifest](capture-manifest.json). It records original dimensions, capture timestamps, full-file
SHA-256 hashes, changed-pixel bounds, RGB differences and the classification of every pair. Image paths point
to the retained temporary capture directories on this host; the PNG files are not embedded in Git.

Both revisions use the same expanded graph inventory and choose the project that owns the mapping fixture.
The server fixture's prepared contract is explicitly adopted on the feature branch so its snapshot includes
those fields. File menus target the selected sidebar row, avoiding duplicated filenames in the server
fixture. The sidebar capture opens the ontology Overview explicitly before showing the sidebar drawer.

## Classification of every pair

The index and manifest assign exactly one category to each pair. The RGB threshold is descriptive, not an
acceptance tolerance: a pixel counts as changed when the sum of its three channel deltas exceeds 30.
Dimensions and browser geometry checks are independent of this calculation.

| Classification | Pairs | Finding |
|---|---:|---|
| identical | 171 | Full PNG SHA-256 hashes match. |
| raster-only | 94 | Hashes differ, but no pixel exceeds the RGB comparison threshold. |
| publication-controls | 8 | Published state and distance, explicit Publish, and the local authoring branch. |
| preview-label | 20 | Working-copy preview wording and its wrapping, including the query dialog backdrop. |
| export-source | 16 | Working-copy/Published selector and the resulting dialog height. |
| fixture-metadata | 50 | Temporary Git ids, history times, audit rows, identity-provider ports and session times. |
| randomized-graph | 37 | Existing randomized network layout and its fit or zoom framing. |
| dialog-background | 68 | Unchanged dialogs over the randomized graph or changed Source Control backdrop. |
| Total | 464 | No unclassified pair. |

## Native review

Representative native pairs were inspected for Source Control in both modes, phone export, Mappings at
390 and 1440 px, server query composition, file Move, full-screen network layout, server settings and ODCS
properties. The comparison covered material changes and the largest changed regions; it does not claim a
manual inspection of every PNG. Automated comparison and geometry checks cover the full inventory.

Source Control retains the existing remote-tracking badge separately from the new snapshot block. A new
local fixture imports onto `work/local` and correctly reports no published commit until Publish. Supplemental
controls show Publish, outside fast-forward Adopt, the upgrade notice and Published export when a snapshot
exists. Phone controls remain usable; longer preview text wraps and shifts the content below it without a
collision. Query and Move dialogs retain their controls and dimensions in the inspected pairs.

The server Source Control pair differs between held `main` and `(detached)` because feature capture
preparation adopts the prepared contract. Adoption invokes the existing shared-checkout repair, which detaches
the base even at the same commit. Independent architecture review confirmed this predates the feature and
that a signed-in person's write still creates or reuses their personal branch. It is fixture state, not a
change to personal authoring.

Network node positions differ because `network-layout.ts` already sets fCoSE `randomize: true`; that module
is unchanged from the release. Native network pairs preserve the same model, areas, controls and labels.
Dialogs over those canvases inherit their background differences. Administration and ODCS native pairs show
matching content and controls apart from temporary issuer ports, timestamps, audit data and Git identifiers.

## Corrections and inherited exception

A file-menu selector matched two projects with the same filename. The release reproduced it; selecting the
already chosen sidebar row fixed the capture driver on both revisions. A sidebar image caught an unfinished
lineage layout. Explicit Overview preparation and focused recaptures removed that intermediate state.
Separate temporary Vite caches and a warm-up prevented the release dependency optimizer from reloading its
first screenshot. Failed and superseded captures are excluded from the manifest.

The responsive suite still reports `mall.odcs.yaml canvas height`: expected at least 421 px, received 407 px
at 1280×720. A temporary worktree from freshly fetched `origin/main` (`655df094`) reproduced exactly that
assertion and was removed afterward. The user assigned the lineage-toolbar fix elsewhere. Neither canvas
nor assertion was changed here; subsequent responsive groups passed in focused runs.

Eighteen supplemental mock-state PNGs are also hashed in the manifest. Native review included local phone
Adopt, the local upgrade notice, server Mappings and local Published export. The server notice image is a
synthetic shared-component state; the real server API does not emit the local migration notice.
