# Integration and regression gate

## Focused regressions and suite retries

- M4, Mall mapping Fit. `sw-midgard-run` ran the detached `verify-fixes` phase and returned 0. The `fitted-names` step passed twice at the same
  1440×900 light viewport after `11abdf8c`. The previous candidate's label overflow is preserved under
  `regression-before/{1,2}/local/light/1440/mapping-fit/` on Midgard, and the passing frames are under
  `candidate/{1,2}/local/light/1440/mapping-fit/`. The 1440×900 pair in `before/fixes/mall-mapping-fit-1440.png` and
  `after/fixes/mall-mapping-fit-1440.png` shows the 185 reachable cards filling more of the pane, with names wrapping within their borders. `bun test
  tests/lineage-view.test.ts` passed 11 tests and 35 assertions after removing the unused worker packing mode in `25635dac`. The standalone `bun
  scripts/ci-validate.ts --step browser --suite test:mapping-graph` returned 0. Its summary was `12 mapping graph checks passed`, including complete
  names at least 9 px at 1280×720 and 1440×900 and no browser errors (134.4 s).
- M15, UBL Neighborhood Walk. Both focused 1600×1000 light repetitions reached all five targets after lowering the automatic fit floor. The next
  standalone graph run found the default center description at 4.09 px against the 9 px threshold, so the center now compensates for zoom. Both
  focused repetitions with compensation reached every target again. The standalone graph rerun passed the UBL Order centering check and then failed
  with a 28 px shared relationship path between `r-0-13` and `r-22-208`. Edge geometry remains open.
- `bun scripts/ci-validate.ts --step browser --suite test:back-history` reached and re-centered on both Mall neighbors after the viewport change. The
  updated test can reach the folded Labels control but its state snapshot missed the relationship labels after Controls closes. The next retry records
  the rendered labels.
- `RESPONSIVE_ONLY='examples: 1280×720 mall Graph toolbars' bun scripts/ci-validate.ts --step browser --suite test:responsive` timed out at the Mall
  ontology loading indicator before the Mall ODCS check. The detached `mall-example-geometry` phase then opened only Mall ODCS with the same example
  fixture and 1280×720 viewport. Main and candidate both logged `MALL_EXAMPLE_CANVAS {"x":313,"y":248,"width":954,"height":389}` and failed `>= 421`.
  The repeated frozen-import comparison also measures 389 px on release, main and candidate. Lane B's first-view change does not account for the
  height.
- `bun scripts/ci-validate.ts --step browser --suite test:auth` returned 0 after using the Settings entry point and checking the read-only Source
  Control region. The session-change, grant and refusal checks passed, including the local workspace smoke check (`8811a5a0`).
- `bun scripts/ci-validate.ts --step browser --suite test:item-edit` returned 0 with `11 item-edit checks passed` after opening catalog details by
  concept name (`e1d4acef`).
- `bun scripts/ci-validate.ts --step browser --suite test:monorepo` returned 0 with `8 monorepo checks passed` after following the current clone and
  deletion labels (`c0bbf4b8`).
- `bun scripts/ci-validate.ts --step browser --suite test:theme` passed the offline fonts, token, switching and contrast checks. The retried tour
  reached the light ontology graph and reported that “Allowance charge” and “Document reference” area headings overlap cards. The `test:responsive`
  retry cleared the previous phone startup failure and repeated the same two overlaps in its tour. The matched release and main captures had no
  heading overlap. The candidate before the fix reproduced both overlaps at 390×844 and 1280×720.
- `bun scripts/ci-validate.ts --step browser --suite test:two-editors` returned 0 (73.4 s). Edits, branches, commit identities, publication visible to
  the Viewer, pulls and sparse-project isolation all passed after the test followed the current Sync label.
- Main `5597ae52` also returned 1 for `bun scripts/ci-validate.ts --step browser --suite test:admin`. Both candidate and main time out waiting for the
  `Dry-run result` region. Main `test:responsive` reproduces the 481 px Full Graph canvas against `> 503.99999999999994`. The candidate clears that
  check before a different phone-stage timeout. Lane B's ODCS first view is a separate check.
- Main `test:editor` hit the same 1.9 MB sustained-typing gate as the candidate. Main measured 55.36 ms/key and the candidate measured 55.31 ms/key
  against the 30 ms threshold. Main passed the preceding six editor checks.
- Main `test:sidebar` passed 4 layout checks. Main `test:telemetry` passed 8 checks (79.2 s).
- Candidate `test:sidebar` returned 0 with `4 sidebar layout checks passed` (196.0 s). Candidate `test:telemetry` again passed its first seven checks,
  then timed out opening Catalog with an empty fixture. With an isolated UBL file selected, `test:telemetry` returned 0 with
  `8 telemetry checks passed` (30.4 s), including zero reports when disabled (`252764a9`).
- `sw-midgard-run --pull out/gate-007/comparison/preliminary-proofs -- bash scripts/ui-review/gate-007/matrix-launch.sh` returned 0 after starting the
  detached comparison. The focused catalog baseline `bun scripts/ci-validate.ts --step browser --suite test:clipping` passed 6 checks with no browser
  errors (29.5 s). The same command with `RESPONSIVE_MUTATION=catalog-description-clip` printed `INJECTED_CATALOG_DESCRIPTION_CLIP` and exited 1
  specifically at “a catalog card description is clipped.” The obsolete tooltip mutant is replaced in `597d6d7e`. The full mutation rerun remains
  pending.
- `sw-midgard-run -- bash scripts/ui-review/gate-007/fix-launch.sh` built the candidate and repeated the affected states.
  For m9, both repetitions of the 390×844 light and 1280×720 light and dark views returned `GRAPH_HEADING_GEOMETRY []` after `c3c6f3f0`.
  The viewed pair `before/fixes/ubl-area-headings-1280.png` and `after/fixes/ubl-area-headings-1280.png` shows separate title plates and cards.
  The words still wrap and the plate continues to cover crossing strokes. `bun scripts/ci-validate.ts --step browser --suite test:theme`
  returned 0 with `10 theme checks passed` (211.7 s), including the light and dark tours and browser-error check.
- After the M15 correction, `bun scripts/ci-validate.ts --step browser --suite test:graph` passed the five Walk steps, Back and Forward,
  link labels, dragged positions, 1,000-entity picker, incremental expansion and the Lease pierce. It reached the large Both-direction pierce
  budget, where the longest main-thread task was 287 ms against the 100 ms limit. A matched main comparison is pending.
- Main `test:autosave` passed the commit UI check, then failed on the same `git log -1 --format=%s main` unknown-revision error as the candidate. Main
  `test:git-setup` passed identity setup and the commit action, then failed on the same `git log -1 --format=%an` error that the default branch has no
  commits. These postconditions still assume direct local commits on the default branch.
- Main `test:lineage` stopped earlier, when the resize separator intercepted the Walk click. It did not reach the first-view performance assertion.
  The candidate reproduced the UBL timing failure at 3,811 ms against 2,000 ms. The same timed entry point is included in the matched capture.
- The initial gallery contains 126 recorded comparison steps. At this checkpoint it shows 40 intended fixes, 6 merged feature differences, 52 neutral
  changes, 17 regression frames, 1 unchanged step and 10 awaiting a matched or settled capture. The regression-frame count includes downstream Walk
  steps blocked by one failed click. It shows the initial candidate, before the graph corrections. Graph captures that caught loading or mismatched
  state are scheduled for repetition. The initial page was rendered on Midgard at 1440×900 and 390×844. Both previews showed the version labels and
  controls, and the phone confined horizontal scrolling to the comparison strip.
- The UBL Order replay is saved under `before/fixes/ubl-neighborhood-walk-1600.png` and `after/fixes/ubl-neighborhood-walk-1600.png` in the comparison
  folder. In the first frame the trail cuts across the first Walk control. The new frame shows the complete AllowanceCharge card and its Walk control,
  and the centered Order description wraps in full. Secondary descriptions are smaller than they were in the clipped first view.
  The separate pair `before/fixes/ubl-neighborhood-walk-reached-1600.png` and `after/fixes/ubl-neighborhood-walk-reached-1600.png` shows the
  shared path splitting after `3f08c538`. Both repetitions reached all five targets and each step reported `WALK_EDGE_GEOMETRY ... []`.

### Matched UBL lineage timing

The repeated 1440×900 frozen-import switch from Mall ODCS to UBL ODCS measured 2,090 and 2,264 ms on main. The candidate measured 2,092 and 2,119 ms.
Both exceed the 2,000 ms suite threshold in the matched built-app scenario. The candidate is within the run-to-run range on the same inputs, so no
speculative worker change was retained. The standalone main suite still stops earlier at the Walk click.

### Opened correction pairs

These pairs compare the candidate before and after each correction. The scores are percentages of changed RGBA pixels at the original dimensions.

| Image in `before/fixes/` and `after/fixes/` | Finding | Changed pixels | Observation |
| --- | --- | ---: | --- |
| `mall-mapping-fit-1440.png` | M4 | 25.618750% | The layout uses the available width. Complete names wrap inside all fitted cards. |
| `ubl-neighborhood-walk-1600.png` | M15 | 13.231375% | The first target and its Walk control are inside the canvas. |
| `ubl-neighborhood-walk-reached-1600.png` | M15 | 11.775875% | The two relationship paths enter the reached card separately. |
| `ubl-area-headings-1280.png` | m9 | 1.119575% | The two wrapped title plates have visible clearance above their cards. |

### Full Graph area headings

- The Network layout reserves a fixed header above each area's entity cards. The title background covers relationship strokes.
- The background's block padding consumes space reserved for a second title line. Removing that padding preserves the label, horizontal inset and
  background.
- Recheck the theme and responsive tours and capture the same area headings at the same viewport in both themes.

### Neighborhood walks

- The first view must keep the center description readable. Walk routes use the measured card dimensions and the former center remains visible as
  context.
- Both matched release and main runs have no shared path after walking to AllowanceCharge. The compensated candidate repeats a 28 px overlap there.
- Keep the description compensation on the first center. Subsequent centers keep the route geometry of the ordinary cards while the details pane
  carries their full description.
- Verify the graph's route and label assertions and repeat the matched five-step Walk.

## Gate after rebase

`git fetch origin` resolved `origin/main` to `5597ae52c55cb76a864aa242873dbbe7083a000e`. `git rebase origin/main` replayed the prior integration branch `a8cf837e` through `6e301fd4`. The release baseline `v0.6.1` resolves to commit `3b1c2c10bc6ae96c6c603301764bde4cfdc4dcd4`. All results in the historical sections below precede this rebase.

The conflict resolutions preserve operation boundary mutation coverage and the address architecture map, while adding the lane mutation registrations and font map. FullGraph keeps canonical entity addresses and delegates edge styling, fitting and opening to the lane modules. Graph and lineage suites retain their screenshot and address handling alongside layout checks. Mapping graph assertions use canonical selectors while opening and fitting the detailed card rows. Source Control retains publication styles alongside phone diff rules. Footer and theme tests keep both existing cases. The changelog retains publication, addresses, operation boundary and the UI entries. Git dropped the portable registry temp path patch because its contents were already upstream.

- T002 is complete. The capture index introduced in `5f77711f` and refined in `ceaeed5d` and `6e301fd4` covers all 109 distinct PNG paths named in the spec and tasks.
- T057 is partially accepted. `81bee1e1` implements the catalog alignment, inline badges, sidebar scroll fade and humanized type labels. `77cd6447` and `7733dfb0` preserve complete descriptions and consistent row height. The 1440 px UBL and Commerce comparisons show aligned card titles, complete descriptions, humanized types and visible Edit actions. Hover-only Edit is skipped to preserve a discoverable direct action on cards alongside View details. Description shortening is superseded by the complete-text requirement.
- T064 is partially accepted. `81bee1e1` preserves the sidebar spacing and reuses the content cap for the metrics list. The metric detail remains beside that list. Moving it onto the same left edge as other tabs would redesign the approved master/detail layout, so that portion is skipped. See the measured offsets in `E.md`.
- T035 and T055 were already checked and their final lane evidence records successful runs. T009, T023, T047 and T073 remain unchecked because their lane evidence records failed or blocked checks. Pre-rebase results below do not settle the rebased gate.

The rebased candidate under test is `c8a99063d82a2e1e92758da847de631bb80cb743`. Heavy verification runs through `sw-midgard-run` in the isolated Midgard checkout. Its Git transfer goes to the authorized scratch bare repository. No project remote received a push.

The suite driver checks available memory before each command, waits below 8 GB, and records terminal output and exit status per command. It runs unit tests, check, build, the mutation gate and each of the 36 registered browser suites serially. The suite log and completion status are written under `out/gate-007/suites/` on Midgard.

Completed checks on the rebased candidate:

| Command | Summary |
| --- | --- |
| `bun test` | 2,446 pass, 0 fail, 347,024 assertions across 350 files (2,030.75 s). |
| `bun --bun run check` | Exit 0 in 46.8 s. TypeScript passed, 1,180 files formatted, lint reported 2,661 warnings and 0 errors. Comments, theme and brand checks passed. |
| `bun --bun run build` | Exit 0 in 6.2 s. Vite built in 3.24 s with the chunk-size advisory. |
| `bun scripts/ci-validate.ts --step mutation` | Exit 1 in 2,994.7 s. `Surviving UI mutant: clamped catalog description without its full-text tooltip`. All unmodified module baselines passed. |
| `bun scripts/ci-validate.ts --step browser --suite test:auth` | Exit 1 in 47.0 s. Read-only role check expects an accessible name beginning with `Commit to` but the disabled button is named `Commit`. |
| `bun scripts/ci-validate.ts --step browser --suite test:two-editors` | Exit 1 in 73.7 s. Personal edits, branches and commit authors all passed. The publication step waited for the obsolete button name `Sync…`. |
| `bun scripts/ci-validate.ts --step browser --suite test:admin` | Exit 1 in 35.6 s. The candidate failed at the `Dry-run result` region, the same assertion reported on main. |
| `bun scripts/ci-validate.ts --step browser --suite test:ui` | Exit 0 in 65.8 s. `20 UI checks passed`, including no browser runtime errors. |
| `bun scripts/ci-validate.ts --step browser --suite test:responsive` | Exit 1 in 105.1 s. The candidate passed the 1280×720 compact-shell assertion that main fails. At the next phone viewport, loading the UBL model timed out before the heading appeared. The Mall ODCS check still needs a standalone run. |
| `bun scripts/ci-validate.ts --step browser --suite test:edges` | 6 edge attachment UI checks passed (32.8 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:grouping-validation` | 8 grouping and validation UI checks passed (60.9 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:overview-areas` | 7 overview area checks passed (37.9 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:published-snapshot` | 2 published snapshot browser checks passed (32.6 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:examples:ui` | 19 example UI checks passed, no browser runtime errors (129.7 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:projects` | 8 project checks passed (37.3 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:trash` | 13 trash checks passed (43.0 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:sidebar` | Exit 1 in 67.8 s. Timed out opening a desktop viewport before the project tree or empty state appeared. |
| `bun scripts/ci-validate.ts --step browser --suite test:metrics` | 11 metrics checks passed (69.3 s), including phone and wide-screen containment. |
| `bun scripts/ci-validate.ts --step browser --suite test:graph` | Exit 1 in 115.3 s. The Mall ontology Graph passed the 473 px minimum. Later, the Neighborhood trail intercepted pointer events for Walk to AllowanceCharge. |
| `bun scripts/ci-validate.ts --step browser --suite test:editor` | Exit 1 in 56.3 s. The 1.9 MB editor check measured 55.31 ms per keystroke with a limit below 30 ms. |
| `bun scripts/ci-validate.ts --step browser --suite test:item-edit` | Exit 1 in 50.5 s. The first two edit checks passed. The next still selected the raw EntityType label instead of the humanized catalog row. |
| `bun scripts/ci-validate.ts --step browser --suite test:addresses` | 4 item address browser checks passed (18.1 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:rdf-edit` | 9 RDF edit checks passed (40.4 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:validation` | Exit 0 in 22.1 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:scm` | 20 Source Control checks passed (59.7 s), including phone containment and read-only actions. |
| `bun scripts/ci-validate.ts --step browser --suite test:odcs` | 10 ODCS checks passed (39.2 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:lineage` | Exit 1 in 63.7 s. Commerce and Mall edge rendering passed. The 169-table UBL first view measured 3,784 ms with a 2,000 ms limit. |
| `bun scripts/ci-validate.ts --step browser --suite test:autosave` | Exit 1 in 25.6 s. Save and commit assertions passed, followed by a Git log assertion that could not resolve main. |
| `bun scripts/ci-validate.ts --step browser --suite test:sql` | 10 SQL checks passed (36.0 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:git-setup` | Exit 1 in 12.3 s. Setting identity and committing through the UI passed. The fixture repository had no commits on its current main branch. |
| `bun scripts/ci-validate.ts --step browser --suite test:monorepo` | Exit 1 in 30.7 s. Clone finished with “Cloned monorepo.” but the browser check required “Cloned.”. |
| `bun scripts/ci-validate.ts --step browser --suite test:dialogs` | 9 dialog checks passed across six viewports (326.5 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:telemetry` | Exit 1 in 104.8 s. Seven reporting and privacy checks passed. The disabled-report scenario could not open Catalog. |
| `bun scripts/ci-validate.ts --step browser --suite test:terminology` | Exit 0 in 104.2 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:mappings-layout` | 8 mapping layout checks passed (78.6 s). |
| `bun scripts/ci-validate.ts --step browser --suite test:clipping` | Exit 0 in 28.8 s. |
| `bun scripts/ci-validate.ts --step browser --suite test:mapping-graph` | Exit 1 in 109.1 s. Fit left five Mall overview card names outside their cards at 9 px. |
| `bun scripts/ci-validate.ts --step browser --suite test:back-history` | Exit 1 in 52.2 s. The Neighborhood trail covered the second Mall neighbor and prevented the first selection. |
| `bun scripts/ci-validate.ts --step browser --suite test:theme` | Exit 1 in 56.7 s. Both font loads, offline first-run fonts, theme switching and contrast checks passed. The light sidebar assertion counted a disabled status indicator as an outlined action. |
| `bun scripts/ci-validate.ts --step browser --suite test:brand` | Exit 0 in 11.9 s. |

The first pass ran all 36 registered browser suites. Twenty passed and sixteen failed.

The catalog mutation removed a tooltip from a description that already wraps in full. The mutation needs to inject actual clipping and the assertion needs to reject clipped descriptions even with a tooltip.
The read-only Auth check still expects the commit form the Source Control fix deliberately removes. The denied state remains represented by the disabled header button and its tooltip. The two-editor check still uses the former Sync label. Both browser checks need to be rerun against the reviewed controls.

Reported failures on middle revision `5597ae52`: `test:responsive` observed a 481 px canvas at 1280×720 where the compact-shell check requires more than 504 px. This is distinct from the 421 px minimum on the Mall ODCS Graph. `test:admin` failed at the Dry-run result step. The candidate diverges on compact-shell geometry and reaches the same Admin assertion. The live three-version comparison is pending.

The first repeated capture batch measured the viewport at 1280×720 on the same frozen inputs.

| Local Graph canvas | v0.6.1 | Main | Candidate |
| --- | ---: | ---: | ---: |
| UBL ontology | 481 px | 481 px | 511 px |
| Mall ontology | 481 px | 481 px | 511 px |
| Mall ODCS | 389 px | 389 px | 389 px |

The 30 px UBL gain is in the Full Graph surface owned by lane A. The Mall ODCS canvas uses the lineage surface owned by lane B.
The frozen-import ODCS geometry is below the suite's 421 px threshold on all versions. The standalone suite still needs to check
the example-loading scenario where lane B passed before rebase.

The repeated 1600×1000 local UBL Walk reached all five targets on the release and main. On the candidate the first button
(`Walk to AllowanceCharge`) timed out because the trail intercepted pointer events. The Walk state is a regression.
The 1440×900 Mall mapping Fit showed a different failure on the candidate. The two older versions had fitted name text at
0.6 px, and the candidate reached 9 px but some names extended outside their compact cards.

The comparison fixture consists of the seven release projects with 36 unique source files.
Each file was read once from the release Git blob using `git show` and hashed with SHA-256.
The duplicate Commerce contract is shared by the Commerce and Mapped commerce imports.
Three supplemental files exercise SQL colouring, SQL warnings and a mapping with no bindings.
The two SQL files come from the release fixtures. The empty mapping keeps the Commerce mapping reference fields and drops its bindings.
The Import UI returned success for all nine frozen projects in both local and server mode on all three versions.
Each run wrote 43 files across the projects, using 39 unique inputs, and every reported file hash matched the frozen hash.
The per-file inventories returned the same 5,298 entities and 12,145 relationships across the unique inputs.
The UBL server import went into HR for the reader's journey. The other server imports went into Sales.
The unbound project was renamed through the UI after import to distinguish it from the other Mapped commerce project.

| Capture version | Commit | Vite build | Local import | Server import | Entities | Relationships |
| --- | --- | --- | --- | --- | --- | --- |
| v0.6.1 | `3b1c2c10bc6ae96c6c603301764bde4cfdc4dcd4` | 3.10 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |
| Main | `5597ae52c55cb76a864aa242873dbbe7083a000e` | 3.12 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |
| Candidate at preparation | `e090f17691f0a6dc593386a916fb6ac90317a52d` | 3.01 s | 9 projects, 43 files | 9 projects, 43 files | 5,298 | 12,145 |

`sw-midgard-run` launched the detached comparison preparation and returned status 0 for the full prepare phase.
`bun --bun run build` ran within each checkout. Each used the same dependency lock.
The per-version `bun -e` inventory verified every SHA-256 and ran that version's `inspect`.
The serial Import driver verified each response file hash and closed Chromium and the assigned servers before starting another batch.

<details>
<summary>Frozen input hashes</summary>

| Frozen source | SHA-256 |
| --- | --- |
| `billing/billing.mapping.yaml` | `8df7269adfa49bae09ebedd26da75e03a8b7e134333a96c44e1b4cfeb7c481f4` |
| `billing/billing.odcs.yaml` | `3f3bbda2933f10e6e42e3ffaaaef58b7de9ab78eaef1405c8ec7096fbcb4d078` |
| `billing/billing.ontology.yaml` | `faf35e9592ade9fe15ff5107bf24258b7156c3346f8443b43e6c479d8554b1a3` |
| `billing/billing.semantic.yaml` | `2653c136378a00df30b90649ca1fd06d5268d5a7bb0adcb588cbb07f3e3bbdc0` |
| `commerce/commerce-business.ossie.yaml` | `7ad7245528e26cac6ba14f8fba5541562d5aed76399b126aae40bef06bb911b0` |
| `commerce/commerce-data.ttl` | `3ff01477fdba89c0f36030cbc271b7a73c618682f06c405dcde8c0634e98d31a` |
| `commerce/commerce-scale.ttl` | `e93b0b93f039617d868f49cc52f5cfc04db2d8be245f45c88170be11f5d389e3` |
| `commerce/commerce.mapped-ontology.yaml` | `21f1ff7a40946b0fc7cd46bdc130390e243f904dbb00fbd9c5f35f16f2e80a01` |
| `commerce/commerce.mapped-semantic.yaml` | `64c18fb46af93c4f00f804a578312f9af7f476157cf89b373dd3ab556ee6168e` |
| `commerce/commerce.mapping.yaml` | `bed274e8cb6d3b632e7dfe1d5e02f70d8a3af1b8e0fd162a717899887e423599` |
| `commerce/commerce.odcs.yaml` | `30cbafad91dac376320668e6a3df16913f171bdf156c2114913e5d17a80e1992` |
| `commerce/commerce.owl` | `d92ee09aaeea891f6774a822f46aefa1de5065ff2c5be03c8374e8646b422a3a` |
| `commerce/commerce.owl.ttl` | `cc7f01232bb10a8fd73bc394ba3378765572112b32662a4a4bddb11bd90178f1` |
| `commerce/commerce.shacl.ttl` | `0ee9a65a3aa413f3478419e8260fdadcfd6b8f71a2ee43ff47ac8e08da60a552` |
| `commerce/sales.mapping.yaml` | `e4d29469e30fd486805980b377976338a4127341255bb75ad1d45affed505c49` |
| `commerce/sales.ossie.yaml` | `42d5fd7389861ef34349b2d5d9b9be91c4a80528b55ba2720aac9e51de6f2232` |
| `mall/mall-data.ttl` | `b2a24c09086d44b178210fb6a0376d1529d103ee552399b2e3a5e3e0e1faa532` |
| `mall/mall.mapping.yaml` | `ddfe91807d88a22a91948e790852dff9dcfe28f962cc90b3a0ad74e3ea28177f` |
| `mall/mall.odcs.yaml` | `707d338f3f3fdee63b5fa5e2e9fa1ed1d8f7a0b14b7c20863a1b84dfa333c400` |
| `mall/mall.ontology.yaml` | `5d11b246f6890a4e3a11a0ed17e08810945dfeac458d369d0726dec54a8fe4f7` |
| `mall/mall.owl.ttl` | `df4b7eb7fead55f9061ee194f7ba482fab1bdebd4015fa8a39fa5c552b1e02b2` |
| `mall/mall.semantic.yaml` | `ce3ba1ed501bd170d24e30cd6c04746a9319dab7734943a8e3de99dcfb5692e1` |
| `mall/mall.shacl.ttl` | `0f9f4e5c3b4e069018c7c8768f7b8bf841ef26db505a4984b71fefaee96711b9` |
| `ossie/flights.mapping.yaml` | `dd62e2614097d0fa3f457fdb15a4ac431cfbbc088fa0a46148d2671ca6b1215c` |
| `ossie/flights.metrics.mapping.yaml` | `73a7a1061c2b5f6c273cee8e3b8c93a2a8f8c73affbe1f1c469dbba3d6deaa0b` |
| `ossie/flights.metrics.semantic.yaml` | `2d7aa9fada288ae70acb41921f4f58f555b928b26b009d7a0517d531cddb1c86` |
| `ossie/flights.odcs.yaml` | `9a7c220945419e97b815f185a707ecbc692110366bb1fc74a67262a3ba2a7d61` |
| `ossie/flights.ontology.yaml` | `4035aa22494a1dfc739f5fe6689ffa74d07338497ef67a7acab69c568eae00fd` |
| `ossie/flights.semantic_model.yaml` | `e0652e489c1bbf69066c9c17109175721e7d9e7e27d302a5cae9747cabbac75e` |
| `ossie/flights.yaml` | `1d716be212d952422885fd74997583b466d267c78f5add3a71fd357f84012130` |
| `ubl/ubl.odcs.yaml` | `bd2eedd821abef9b834e2bbad8e70495042b922ee73ca1a67ed06dba8e35efb4` |
| `ubl/ubl.ontology.yaml` | `ac8343193ce8b087c9975583e6b047caf653e59c2416dc40c043bb35bea63b2f` |
| `ubl/ubl.owl.ttl` | `4ae7d7872dcde977f71fc2e50ec22a7b0bf453919db954fe5c9ac72062a221de` |
| `ubl/ubl.semantic-mapping.yaml` | `ad70e22d7a6b171b1644d1e113b307f440f9c934de218af16dbbfedee455a6a0` |
| `ubl/ubl.semantic.yaml` | `3b97121ee492a6eaea2a3798ced9810462e7da58701445bb272b232b898ad6ab` |
| `ubl/ubl.shacl.ttl` | `a40474f3e9e2593664ffb2d4561afa40670171c810832070d48141d953f7282d` |
| `sql/case-when.ossie.yaml` | `17c3bfc8909fb2420224b0fc83aab7db65e21333ebf70fbb27862d9e9e056415` |
| `sql/case-when-broken.ossie.yaml` | `23ba6a85d5d846fb00fb2fb326ba324f43d0ad62988bc6191f548e810f7f3cf1` |
| `unbound/commerce.mapping.yaml` | `ae4b63433db73d910c9536d77313a7841b22c223e1f17d3a3d504b0cbdbbd4fc` |

</details>

`bunx --bun oxfmt --check` passed on all 196 changed TypeScript, JSX and CSS files. The formatter configuration excludes Markdown.
The confidential-only scanner passed for the task and evidence documents. Neither the repository nor the installed skills includes the named cadence checker.
The original review archive contains 3,559 PNGs. A read-only count by folder measured 72 in `auth-pages`, 175 in `followup`, 220 each in `local-dark` and `local-light`, 228 each in `server-dark` and `server-light`, 51 in `server-personas` and 2,365 in `states`. The superseded comparison bundle contained exact copies of all 3,559, verified byte by byte before removal. The source archive remains intact. The current comparison uses newly captured release, main and candidate frames.

Status: in progress. No visual pair is classified before both images have been opened.

## Scope ledger

- Existing lane modules and public contracts remain the implementation boundaries.
- Integration combines lane changes and can expose shared-style or capture-expectation conflicts.
- Corrections cover named findings and observed failures through existing entry points.
- Gate evidence distinguishes current failures, baseline failures and completed visual inspection.

## Command journal

All commands run from this worktree. Raw output is retained in `.data/gate/logs/` unless a row names another location. No push, remote changes or deployment is authorized.

| Command | Summary |
| --- | --- |
| `pwd; git status --short; cat README.md; cat ARCHITECTURE.md` | Correct integration worktree; initially clean; existing architecture read. |
| `cat specs/007-ui-review-fixes/{tasks,plan,quickstart,capture-index}.md` | Merge boundaries, suites and capture matrix read. |
| `git merge --no-ff 007-lane-a -m 'merge: integrate graph review fixes from lane A'` | `f1398bf8`; clean merge, no conflicts. |
| `bun test` | Running after merge A; raw log `A-test.log`. |
| `bun --bun run check` | Passed after A; formatter, lint, comments, theme and brand checks passed. |
| `bun --bun run build` | Passed after A; `built in 1.51s`. |
| `find <baseline>/screenshots -type f -name '*.png'` | Exactly 3,559 baseline PNG images. |
| `df -h . /tmp; free -h` | 59 GiB worktree filesystem free; 8.3 GiB temporary filesystem free; 25 GiB available memory. |

## Pending checks

T074–T077 remain open until their recorded requirements pass. T078 belongs to the subsequent architecture review.

### Merge A unit result

```text
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2077 pass
 0 fail
 130795 expect() calls
Ran 2077 tests across 286 files. [321.82s]
```

### Merge B

`git merge --no-ff 007-lane-b -m merge: integrate UI review fixes from lane B`: exit 0. Full output: `B-merge.log`.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2083 pass
 0 fail
 130825 expect() calls
Ran 2083 tests across 286 files. [292.31s]
```

### Capture fixture ports

Existing API/mock/Git factories already accept OS-assigned ports. The follow-up adapters unnecessarily forced fixed ports; removing those adapters preserves fixture behavior. The second frontend retains
the same graph-reopen stages with a dynamically allocated port and a private cache. No application behavior changes.

- `bunx --bun oxfmt scripts/ui-review/{followup-local,followup-trash,followup-server,known-issues}.ts`: formatted four files.
- `bunx --bun tsc --noEmit`: exit 0.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <four capture scripts>`: exit 0.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/port-smoke graphs`: transport/setup succeeded;
  light/dark state assertions failed because the old driver clicked a counted area instead of expanding to an entity. This capture-expectation failure remains to fix; these are not final gate pairs.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/known-issues.ts .data/gate/reopen-smoke 11 11`: exit 0; dynamic frontend 42327; toolbar appeared in 80 ms; canvas 954×507; exact started listener stopped.

### Known temporary-directory assertion

`git archive e8b7d69 | tar -x -C .data/gate/main` creates a baseline copy inside this worktree; dependency resolution uses this worktree's node_modules.
`TMPDIR="$PWD/.data/gate/tmp" bun test ./.data/gate/main/tests/pipeline/deploy-azure.test.ts`: `4 pass`, `1 fail`, `18 expect() calls`.
The failure is the same hard-coded `/tmp/sw-deploy-registry-` prefix at line 100. Baseline production code correctly honors TMPDIR. A portable assertion is still pending.

`bun scripts/mutation-case.ts <archived-main>/src/shared/projects/examples.ts example-registry`: exit 0 without the runner deadline. This is diagnostic only; the complete mutation gate is pending.

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 652ms on 1037 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.53s
```

### Merge C

`git merge --no-ff 007-lane-c -m merge: integrate UI review fixes from lane C`: exit 0. Full output: `C-merge.log`.

### Capture expectations and scratch roots

- Expanded-area entity selection now uses the existing Expand all helper before native node clicks. First-view captures retain the new counted-area presentation.
- Source-control history is an existing region rather than a button. Phone diff sequences use Back to changes between selections and before staging or entering a commit message.
- Scratch factories now resolve the system temporary directory rather than hard-coding `/tmp`; the gate can keep their data inside its ignored TMPDIR.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/expectation-smoke graphs`:
  light and dark captures both report `failed: false`, inspector visible, Network layout, no geometry problems.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/source-control-states.ts .data/gate/scm-smoke`: in progress; 68 captures through light/2560 with no unreachable state so far.
- `bun --bun run check`: exit 0 after these capture updates; raw log `capture-updates-check.log`.
- Readability checker on all changed capture scripts: exit 0.
- Full leak scan on `docs/development.md`: exit 0 after replacing machine-specific sample output paths with ignored relative output paths.

These scratch captures are driver verification only. Final merged-branch capture and pair classification remain pending.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2090 pass
 0 fail
 130847 expect() calls
Ran 2090 tests across 287 files. [329.58s]
```

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 51ms on 1042 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.77s
```

### Merge D

`git merge --no-ff 007-lane-d -m merge: integrate UI review fixes from lane D`: exit 0. Full output: `D-merge.log`.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2097 pass
 0 fail
 130894 expect() calls
Ran 2097 tests across 287 files. [302.60s]
```

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 80ms on 1042 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.55s
```

### Merge E

`git merge --no-ff 007-lane-e -m merge: integrate UI review fixes from lane E`: exit 1. Full output: `E-merge.log`.

### Portable registry-isolation assertion

The CLI adapter already chooses the system temporary directory. The assertion now compares with that same standard location, preserving its registry-directory prefix and cleanup checks.
`TMPDIR="$PWD/.data/gate/tmp" bun test tests/pipeline/deploy-azure.test.ts`: `5 pass`, `0 fail`, `20 expect() calls`, 79 ms. The archived-main result above proves the original failure.
Formatter and readability checks passed. Commit: `c8e08bbc`.

### Source-control driver completion

The full scratch run finished with 144 captures, light/dark at all four widths, no `failures.jsonl` and exit 0. Generic modal-background coverage messages remain in the raw log and are not treated as
geometry passes. Final merged-branch captures remain separate.

### Capture report

The old report contained historical counts and hard-coded commands. It now reads the current manifests and optionally compares unreachable-state identities with a baseline.
Synthetic CLI fixtures proved both branches: an existing failed state exits 0 (`1 images, 1 failed attempts, 0 new failed states`); a new failed state exits 1 (`1 images, 1 failed attempts, 1 new failed states`).
`bun --bun run check`: exit 0 (`capture-report-check.log`). Readability and the public documentation leak scan passed.

### Lineage truncation investigation

Three lane-B additions used CSS ellipsis in the dataset summary, lineage context and name-only card. The gate rule forbids those cuts. Removing the cuts and allowing wrapping passes the suite's
functional and geometry checks, including readable names, whole frames and native Walk clicks. Its final browser-error check failed on two React Flow parent-size warnings. This is not yet green;
the final merged run and baseline comparison must settle those warnings before delivery. Raw log: `lineage-unclipped.log`.

### Lane E boundary conflicts

`git merge --no-ff 007-lane-e` conflicted in `tests/footer-counts.test.ts` and `tests/theme-check.test.ts`. Neither test file appears in the plan's permitted shared-file list.
These are lane-boundary errors: C added Source footer/validation and dark YAML contrast coverage; E added Mall relationship isolation and non-red group-palette coverage. Both imports and both sets of
assertions are retained. No intent was dropped. The shared stylesheet/doc/sentinel edits merged mechanically.

`bun test tests/footer-counts.test.ts tests/theme-check.test.ts`: `23 pass`, `0 fail`, `98 expect() calls`, 511 ms. Merge commit: `1416dac2`.
`rg -n humanizeIdentifier src/app/graph/EntityName.tsx src/app/workspace/CatalogView.tsx`: A exports the function; E imports it directly; no temporary placeholder exists.

The five merge commits, in order, are A `f1398bf8`, B `6f632145`, C `5b13344c`, D `9d77dd22`, E `1416dac2`. E's complete checks passed: `bun test` 2102 pass, 0 fail, 130929 assertions in 287 files (294.46 s); `bun --bun run check` exit 0; `bun --bun run build` exit 0 (1.64 s).

### bun run test:ui

Exit 1; raw output `suite-ui.log`.

```text
  ariaSnapshot: "- complementary \"Workspace documents\":\n  - img \"Semantic Workbench\"\n  - button \"Add project\":\n    - img\n    - text: Add project\n  - text: LOCAL WORKSPACE\n  - button \"Model explorer\":\n    - img\n    - text: Model explorer\n  - button \"Source editor\":\n    - img\n    - text: Source editor\n  - button \"Source control 1 changed files\":\n    - img\n    - text: Source control 1\n  - text: PROJECTS 7\n  - tree \"Projects\":\n    - treeitem \"UBL business model\" [expanded]:\n      - button \"UBL business model\":\n        - img\n        - img\n        - text: UBL business model 6\n      - button \"Delete project UBL business model\"\n      - button \"Actions for UBL business model\":\n        - img\n      - group:\n        - treeitem \"ubl.odcs.yaml\" [selected]:\n          - button \"ubl.odcs.yaml\":\n            - img\n            - text: ubl.odcs.yaml\n          - button \"Delete ubl.odcs.yaml\"\n          - button \"Actions for ubl.odcs.yaml in UBL business model\":\n            - img\n          - text: ODCS\n        - treeitem \"ubl.ontology.yaml\":\n          - button \"ubl.ontology.yaml\":\n            - img\n            - text: ubl.ontology.yaml\n          - button \"Delete ubl.ontology.yaml\"\n          - button \"Actions for ubl.ontology.yaml in UBL business model\":\n            - img\n          - text: Ossie ontology · modified\n        - treeitem \"ubl.owl.ttl\":\n          - button \"ubl.owl.ttl\":\n            - img\n            - text: ubl.owl.ttl\n          - button \"Delete ubl.owl.ttl\"\n          - button \"Actions for ubl.owl.ttl in UBL business model\":\n            - img\n          - text: OWL\n        - treeitem \"ubl.semantic-mapping.yaml\":\n          - button \"ubl.semantic-mapping.yaml\":\n            - img\n            - text: ubl.semantic-mapping.yaml\n          - button \"Delete ubl.semantic-mapping.yaml\"\n          - button \"Actions for ubl.semantic-mapping.yaml in UBL business model\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"ubl.semantic.yaml\":\n          - button \"ubl.semantic.yaml\":\n            - img\n            - text: ubl.semantic.yaml\n          - button \"Delete ubl.semantic.yaml\"\n          - button \"Actions for ubl.semantic.yaml in UBL business model\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"ubl.shacl.ttl\":\n          - button \"ubl.shacl.ttl\":\n            - img\n            - text: ubl.shacl.ttl\n          - button \"Delete ubl.shacl.ttl\"\n          - button \"Actions for ubl.shacl.ttl in UBL business model\":\n            - img\n          - text: SHACL\n    - treeitem \"commerce\" [expanded]:\n      - button \"commerce\":\n        - img\n        - img\n        - text: commerce 1\n      - button \"Delete project commerce\"\n      - button \"Actions for commerce\":\n        - img\n      - group:\n        - treeitem \"commerce.owl\":\n          - button \"commerce.owl\":\n            - img\n            - text: commerce.owl\n          - button \"Delete commerce.owl\"\n          - button \"Actions for commerce.owl in commerce\":\n            - img\n          - text: OWL\n    - treeitem \"UBL 2.3 procurement-to-payment · 45 business entities\" [expanded]:\n      - button \"UBL 2.3 procurement-to-payment · 45 business entities\":\n        - img\n        - img\n        - text: UBL 2.3 procurement-to-payment · 45 business entities 1\n      - button \"Delete project UBL 2.3 procurement-to-payment · 45 business entities\"\n      - button \"Actions for UBL 2.3 procurement-to-payment · 45 business entities\":\n        - img\n      - group:\n        - treeitem \"roundtrip.ontology.yaml\":\n          - button \"roundtrip.ontology.yaml\":\n            - img\n            - text: roundtrip.ontology.yaml\n          - button \"Delete roundtrip.ontology.yaml\"\n          - button \"Actions for roundtrip.ontology.yaml in UBL 2.3 procurement-to-payment · 45 business entities\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"JSON round trip\" [expanded]:\n      - button \"JSON round trip\":\n        - img\n        - img\n        - text: JSON round trip 1\n      - button \"Delete project JSON round trip\"\n      - button \"Actions for JSON round trip\":\n        - img\n      - group:\n        - treeitem \"roundtrip.json\":\n          - button \"roundtrip.json\":\n            - img\n            - text: roundtrip.json\n          - button \"Delete roundtrip.json\"\n          - button \"Actions for roundtrip.json in JSON round trip\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"Batch valid\" [expanded]:\n      - button \"Batch valid\":\n        - img\n        - img\n        - text: Batch valid 2\n      - button \"Delete project Batch valid\"\n      - button \"Actions for Batch valid\":\n        - img\n      - group:\n        - treeitem \"batch-good.yaml\":\n          - button \"batch-good.yaml\":\n            - img\n            - text: batch-good.yaml\n          - button \"Delete batch-good.yaml\"\n          - button \"Actions for batch-good.yaml in Batch valid\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"batch-repaired.json\":\n          - button \"batch-repaired.json\":\n            - img\n            - text: batch-repaired.json\n          - button \"Delete batch-repaired.json\"\n          - button \"Actions for batch-repaired.json in Batch valid\":\n            - img\n          - text: Ossie ontology\n    - treeitem \"retry\" [expanded]:\n      - button \"retry\":\n        - img\n        - img\n        - text: retry 1\n      - button \"Delete project retry\"\n      - button \"Actions for retry\":\n        - img\n      - group:\n        - treeitem \"retry.ttl\":\n          - button \"retry.ttl\":\n            - img\n            - text: retry.ttl\n          - button \"Delete retry.ttl\"\n          - button \"Actions for retry.ttl in retry\":\n            - img\n          - text: RDF\n    - treeitem \"Mapped commerce\" [expanded]:\n      - button \"Mapped commerce\":\n        - img\n        - img\n        - text: Mapped commerce 4\n      - button \"Delete project Mapped commerce\"\n      - button \"Actions for Mapped commerce\":\n        - img\n      - group:\n        - treeitem \"commerce.mapped-ontology.yaml\":\n          - button \"commerce.mapped-ontology.yaml\":\n            - img\n            - text: commerce.mapped-ontology.yaml\n          - button \"Delete commerce.mapped-ontology.yaml\"\n          - button \"Actions for commerce.mapped-ontology.yaml in Mapped commerce\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"commerce.mapped-semantic.yaml\":\n          - button \"commerce.mapped-semantic.yaml\":\n            - img\n            - text: commerce.mapped-semantic.yaml\n          - button \"Delete commerce.mapped-semantic.yaml\"\n          - button \"Actions for commerce.mapped-semantic.yaml in Mapped commerce\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"commerce.mapping.yaml\":\n          - button \"commerce.mapping.yaml\":\n            - img\n            - text: commerce.mapping.yaml\n          - button \"Delete commerce.mapping.yaml\"\n          - button \"Actions for commerce.mapping.yaml in Mapped commerce\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"commerce.odcs.yaml\":\n          - button \"commerce.odcs.yaml\":\n            - img\n            - text: commerce.odcs.yaml\n          - button \"Delete commerce.odcs.yaml\"\n          - button \"Actions for commerce.odcs.yaml in Mapped commerce\":\n            - img\n          - text: ODCS\n  - button \"2 grouping suggestions\":\n    - img\n    - text: 2 grouping suggestions\n  - button \"Trash\":\n    - img\n    - text: Trash\n  - button \"Settings\":\n    - img\n    - text: Settings\n  - text: Project folders · on your machine Your definitions stay local.\n- separator \"Resize sidebar\"\n- main:\n  - button \"Hide sidebar\" [expanded]:\n    - img\n  - heading \"ubl.odcs.yaml\" [level=1]\n  - text: UBL business model ODCS\n  - status \"Save state\": Saved to file · 1 uncommitted change\n  - button \"Commit\":\n    - img\n    - text: Commit\n  - button \"More actions\":\n    - img\n  - group \"Account\":\n    - button \"Person menu\"\n  - button \"Contract\":\n    - img\n    - text: Contract\n  - button \"Overview\":\n    - img\n    - text: Overview\n  - button \"Graph\":\n    - img\n    - text: Graph\n  - button \"Neighborhood\":\n    - img\n    - text: Neighborhood\n  - button \"Catalog\":\n    - img\n    - text: Catalog\n  - button \"Source\":\n    - img\n    - text: Source\n  - button \"Mappings\":\n    - img\n    - text: Mappings\n  - button \"Metrics 9\":\n    - img\n    - text: Metrics 9\n  - region \"Lineage graph\":\n    - group \"Lineage controls\":\n      - combobox:\n        - img\n        - textbox \"Find assets\":\n          - /placeholder: Find assets…\n      - button \"Fit\":\n        - img\n        - text: Fit\n      - button \"Full pierce\":\n        - img\n        - text: Full pierce\n      - text: \"Expand:\"\n      - radiogroup \"Pierce direction\":\n        - radio \"Outgoing\"\n        - radio \"Incoming\"\n        - radio \"Both\" [checked]\n      - button \"Undo expansion\" [disabled]:\n        - img\n      - 'button \"Group by: Suggested communities\"':\n        - img\n        - text: Suggested communities\n        - img\n      - group \"View options\":\n        - group \"Show\":\n          - button \"Metrics\" [pressed]\n          - button \"Other contracts\" [pressed]\n    - group \"Foreign-key hops\":\n      - text: Hops\n      - group \"How far to follow foreign keys\":\n        - button \"1 hop\" [pressed]: \"1\"\n        - button \"2 hops\": \"2\"\n        - button \"3 hops\": \"3\"\n      - text: party · 22 connected tables 1 hop\n      - button \"Foreign keys (93)\"\n    - button \"Back\" [disabled]:\n      - img\n    - button \"Forward\" [disabled]:\n      - img\n    - list:\n      - listitem:\n        - button \"party\"\n    - group \"Viewport\":\n      - button \"Zoom out\":\n        - img\n      - button \"Zoom in\":\n        - img\n      - button \"Full screen\":\n        - img\n    - application:\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#purchase_order\": purchase_order.quotation_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#purchase_order\": purchase_order.originator_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.originator_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#purchase_order\": purchase_order.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#purchase_order\": purchase_order.freight_forwarder_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#invoice\": invoice.accounting_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#invoice\": invoice.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#invoice\": invoice.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#invoice\": invoice.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice\": invoice.payee_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice\": invoice.tax_representative_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#credit_note\": credit_note.accounting_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#credit_note\": credit_note.seller_supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#credit_note\": credit_note.accounting_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#customer_party to object:ubl.odcs.yaml#credit_note\": credit_note.buyer_customer_party_id → customer_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note\": credit_note.payee_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note\": credit_note.tax_representative_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#party__person\": party__person.source_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#party\": party.postal_address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#party\": party.physical_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#party\": party.contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#party\": party.agent_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#financial_account to object:ubl.odcs.yaml#party\": party.financial_account_id → financial_account.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#customer_party\": customer_party.party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.delivery_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.accounting_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#customer_party\": customer_party.buyer_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#supplier_party\": supplier_party.party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.despatch_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.accounting_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#contact to object:ubl.odcs.yaml#supplier_party\": supplier_party.seller_contact_id → contact.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#location\": location.address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#item__manufacturer_party\": item__manufacturer_party.source_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#item__manufacturer_party\": item__manufacturer_party.target_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#document_reference to object:ubl.odcs.yaml#item\": item.catalogue_document_reference_id → document_reference.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#item\": item.information_content_provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#line_item\": line_item.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#line_item\": line_item.warranty_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#line_item\": line_item.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#delivery to object:ubl.odcs.yaml#delivery__notify_party\": delivery__notify_party.source_id → delivery.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery__notify_party\": delivery__notify_party.target_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#address to object:ubl.odcs.yaml#delivery\": delivery.delivery_address_id → address.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#delivery\": delivery.delivery_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#delivery\": delivery.alternative_delivery_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery\": delivery.carrier_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#delivery\": delivery.delivery_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#consignment\": \"17\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#transportation_service to object:ubl.odcs.yaml#consignment\": \"2\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#consignment\": \"9\"\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.loading_proof_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.owner_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.operating_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#supplier_party to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.supplier_party_id → supplier_party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.loading_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.unloading_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#location to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.storage_location_id → location.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#transport_means to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.applicable_transport_means_id → transport_means.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#delivery to object:ubl.odcs.yaml#transport_equipment\": transport_equipment.delivery_id → delivery.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#invoice_line\": invoice_line.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#invoice_line\": invoice_line.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#credit_note_line\": credit_note_line.originator_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#item to object:ubl.odcs.yaml#credit_note_line\": credit_note_line.item_id → item.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#document_reference\": document_reference.issuer_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transportation_service\": transportation_service.responsible_transport_service_provider_party_id → party.record_id\n      - img:\n        - group \"Edge from object:ubl.odcs.yaml#party to object:ubl.odcs.yaml#transport_means\": transport_means.owner_party_id → party.record_id\n      - group:\n        - group \"Table party\":\n          - button \"party center\":\n            - strong: party\n            - emphasis: center\n      - group:\n        - group \"Table purchase_order\":\n          - button \"purchase_order\":\n            - strong: purchase_order\n      - group:\n        - group \"Table invoice\":\n          - button \"invoice\":\n            - strong: invoice\n      - group:\n        - group \"Table credit_note\":\n          - button \"credit_note\":\n            - strong: credit_note\n      - group:\n        - group \"Table party__person\":\n          - button \"party__person\":\n            - strong: party__person\n      - group:\n        - group \"Table customer_party\":\n          - button \"customer_party\":\n            - strong: customer_party\n      - group:\n        - group \"Table supplier_party\":\n          - button \"supplier_party\":\n            - strong: supplier_party\n      - group:\n        - group \"Table item__manufacturer_party\":\n          - button \"item__manufacturer_party\":\n            - strong: item__manufacturer_party\n      - group:\n        - group \"Table item\":\n          - button \"item\":\n            - strong: item\n      - group:\n        - group \"Table line_item\":\n          - button \"line_item\":\n            - strong: line_item\n      - group:\n        - group \"Table delivery__notify_party\":\n          - button \"delivery__notify_party\":\n            - strong: delivery__notify_party\n      - group:\n        - group \"Table delivery\":\n          - button \"delivery\":\n            - strong: delivery\n      - group:\n        - group \"Table consignment\":\n          - button \"consignment\":\n            - strong: consignment\n      - group:\n        - group \"Table transport_equipment\":\n          - button \"transport_equipment\":\n            - strong: transport_equipment\n      - group:\n        - group \"Table invoice_line\":\n          - button \"invoice_line\":\n            - strong: invoice_line\n      - group:\n        - group \"Table credit_note_line\":\n          - button \"credit_note_line\":\n            - strong: credit_note_line\n      - group:\n        - group \"Table document_reference\":\n          - button \"document_reference\":\n            - strong: document_reference\n      - group:\n        - group \"Table transportation_service\":\n          - button \"transportation_service\":\n            - strong: transportation_service\n      - group:\n        - group \"Table transport_means\":\n          - button \"transport_means\":\n            - strong: transport_means\n      - group:\n        - group \"Table address\":\n          - button \"address\":\n            - strong: address\n      - group:\n        - group \"Table location\":\n          - button \"location\":\n            - strong: location\n      - group:\n        - group \"Table contact\":\n          - button \"contact\":\n            - strong: contact\n      - group:\n        - group \"Table financial_account\":\n          - button \"financial_account\":\n            - strong: financial_account\n      - img\n      - link \"React Flow attribution\":\n        - /url: https://reactflow.dev/attribution\n        - text: React Flow\n    - group:\n      - list \"Legend\":\n        - listitem:\n          - img\n          - text: Table\n        - listitem: \"Card tint: application grouping\"\n        - listitem: PK Primary key\n        - listitem: FK Points to another table\n        - listitem: 5 Several links in one line\n        - listitem: Foreign key\n        - listitem: Feeds\n    - text: Links follow the names declared in this contract.\n  - img\n  - text: Structure checked\n  - button \"Validation details\"\n  - text: 169 entities · 401 relationships",
},

      at captureRawStack (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright/lib/matchers/expect.js:13316:57)
      at expectResolvedBindings (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/helpers/mapping-bindings.ts:6:61)
      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/ui-tests.ts:464:11
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/ui-tests.ts:46:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:ui" exited with code 1
```


### Complete text and integrated canvas geometry

The existing card geometry, row ports and semantic edge set remain the layout contract. Compact names must stay whole at the existing nine-pixel minimum.
Only compact reaches whose layered fit cannot hold the full wrapped names use the existing ELK box algorithm; detailed cards retain layered routes.
Expansion placement remains incremental: an attempted relayout of existing expansion cards failed the stability assertion and was removed.
Packed links use the empty row and column gutters, retaining every original endpoint. No text is shortened to satisfy geometry.

- `bun test tests/lineage-view.test.ts`: 10 pass, 0 fail, 33 assertions, 82 ms (`packing-unit.log`); rerun after routing: `packing-final-unit.log`.
- `bun scripts/lineage-mutation-cases.ts`: exit 0 (`packing-case.log`). Two packing predicate mutants were added to the existing registry.
- `bun --bun run check`: exit 0 (`packing-routes-check.log`); final CSS follow-up: `packing-final-check.log`.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <changed code files>`: exit 0.
- `bun .data/gate/measure-lineage.ts`: four widths, 19 compact names each, zero text rectangles outside their cards (`lineage-final-geometry.log`).
  The phone and 1280-pixel screenshots were opened: all names wrap, the full reach is visible, and the summary/back action share one row.
- `bun .data/gate/measure-ubl.ts`: diagnostic UBL expansion exposed six overflowing names with a one-column compact pack.
  Keeping the compact pack's aspect ratio at least square preserves room for complete wrapped names (`ubl-pack-debug4.log`).
- `bun run test:lineage`: intermediate failures and fixes are retained in `lineage-complete-names.log`, `lineage-packed-final.log`, `lineage-packed-final2.log`,
  `lineage-frozen.log`, `lineage-preserve-expansion.log`, and `lineage-routed-packing.log`.
  The first exposed overflowing full names; the second attempt moved existing cards and was reverted; the third exposed links crossing cards and led to gutter routing.
  The next run passed full-text, four-width geometry and stable expansion checks, but found only 280 px of visible dataset canvas.
  The compact dataset header now puts All tables beside the summary and keeps a 300 px minimum stage. Final suite result remains pending.
- `bun run test:responsive`: the first run passed the resize/lineage checks, then found unequal catalog row heights after complete descriptions were restored.
  Grid items now stretch to their row height, preserving every description (`suite-responsive.log`). The final rerun is in `suite-responsive-complete-text.log`.
- `bun run test:ui`: the first run was invalidated by Vite reloading regenerated validators during another command's build (`suite-ui.log`).
  Frozen rerun: 20 UI checks passed, no browser runtime errors (`suite-ui-frozen.log`).
- Archived `e8b7d69`, `bun run test:ui`: 20 UI checks passed (`main-suite-ui-valid-root.log`). The invalidated merged run is not claimed as a main failure.
  An earlier archived-root configuration returned HTTP 404 and was corrected before the valid comparison (`main-suite-ui.log`, `main-smoke.log`).
- `bun scripts/mutation-tests.ts`: all ordinary mutants, including example-registry, ran before the UI phase failed at the unconfigured default frontend port 5173 (`mutation-final.log`).
  Rerun uses `SW_BASE_URL=http://127.0.0.1:5261` (`mutation-assigned-port.log`); no deadline or assertion was relaxed.
- `bun --bun run build`: exit 0, built in 1.87 s (`frozen-build.log`). Builds rewrite validators and trigger Vite reloads; the suite driver is paused during captures.

### Changelog assembly

`CHANGELOG.md` Unreleased contains the five lane fragments and their font foundation entry; the fragment folder was deleted in `dc829ba8`.
Historical release counts remain attached to their named releases. Current mapping hops match `MAX_HOPS = 3`.
`rg -n 'one to five|Dry run|first view shows every entity' docs README.md` found only the intended architecture SVG Dry run label.
`bun --bun run check` and the public-document leak scanner passed for this step.

### Capture restart

The first partial local-light run was interrupted when the full lineage suite found the expansion-placement regression.
Its partial images will be replaced, not accepted as final evidence. Capture and browser fixtures use isolated temporary data and the assigned frontend or dynamic listener ports.

### bun run test:edges

Exit 0; raw output `suite-edges.log`.

```text
$ bun scripts/edge-attachment-ui-tests.ts
PASS network graph path endpoints attach to actual entity borders
PASS zoomed worker routes attach after hover and selection
PASS individual entity dragging preserves endpoints
PASS parent area dragging preserves child edge attachment
PASS layered and network layout changes preserve attachment
PASS browser has no runtime errors
6 edge attachment UI checks passed
```

### bun run test:grouping-validation

Exit 0; raw output `suite-grouping-validation.log`.

```text
$ bun scripts/grouping-validation-ui-tests.ts
PASS Flights grouping modes state provenance honestly and retain all graph connections
PASS grouping corrections persist across views, documents and reload without rewriting source
PASS UBL grouping provenance remains explicit and source exports remain unchanged
PASS contracts and semantic models group into communities; lineage cards carry the group tint
PASS invalid source highlights the precise feature and finding action selects its offending line
PASS mixed import repair highlights and locates the faulty file without modifying saved documents
PASS fixture exports preserve the exact upstream source of every fixture
PASS browser has no uncaught runtime errors
8 grouping and validation UI checks passed
```

### bun run test:examples:ui

Exit 1; raw output `suite-examples-ui.log`.

```text
232 |     await page.screenshot({ path: '/tmp/workbench-mapping-chains.png' });
233 |     await page.setViewportSize({ width: 390, height: 844 });
234 |     const e2 = (await page.locator('.mapping-bindings').boundingBox())!;
235 |     const k2 = (await page.locator('.mapping-concepts').boundingBox())!;
236 |     expect(k2.y).toBeLessThan(e2.y);
                 ^
TypeError: null is not an object (evaluating 'k2.y')
      at <anonymous> (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/examples-ui-tests.ts:236:12)
      at async check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/examples-ui-tests.ts:36:9)

Bun v1.4.0 (Linux x64)
error: script "test:examples:ui" exited with code 1
```

### bun run test:graph

Exit 1; raw output `suite-graph.log`.

```text
  timeout: 5000,
  ariaSnapshot: "- complementary \"Workspace documents\":\n  - img \"Semantic Workbench\"\n  - button \"Add project\":\n    - img\n    - text: Add project\n  - text: LOCAL WORKSPACE\n  - button \"Model explorer\":\n    - img\n    - text: Model explorer\n  - button \"Source editor\":\n    - img\n    - text: Source editor\n  - button \"Source control\":\n    - img\n    - text: Source control\n  - text: PROJECTS 3\n  - tree \"Projects\":\n    - treeitem \"UBL business model\" [expanded]:\n      - button \"UBL business model\":\n        - img\n        - img\n        - text: UBL business model 6\n      - button \"Delete project UBL business model\"\n      - button \"Actions for UBL business model\":\n        - img\n      - group:\n        - treeitem \"ubl.odcs.yaml\":\n          - button \"ubl.odcs.yaml\":\n            - img\n            - text: ubl.odcs.yaml\n          - button \"Delete ubl.odcs.yaml\"\n          - button \"Actions for ubl.odcs.yaml in UBL business model\":\n            - img\n          - text: ODCS\n        - treeitem \"ubl.ontology.yaml\":\n          - button \"ubl.ontology.yaml\":\n            - img\n            - text: ubl.ontology.yaml\n          - button \"Delete ubl.ontology.yaml\"\n          - button \"Actions for ubl.ontology.yaml in UBL business model\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"ubl.owl.ttl\":\n          - button \"ubl.owl.ttl\":\n            - img\n            - text: ubl.owl.ttl\n          - button \"Delete ubl.owl.ttl\"\n          - button \"Actions for ubl.owl.ttl in UBL business model\":\n            - img\n          - text: OWL\n        - treeitem \"ubl.semantic-mapping.yaml\":\n          - button \"ubl.semantic-mapping.yaml\":\n            - img\n            - text: ubl.semantic-mapping.yaml\n          - button \"Delete ubl.semantic-mapping.yaml\"\n          - button \"Actions for ubl.semantic-mapping.yaml in UBL business model\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"ubl.semantic.yaml\":\n          - button \"ubl.semantic.yaml\":\n            - img\n            - text: ubl.semantic.yaml\n          - button \"Delete ubl.semantic.yaml\"\n          - button \"Actions for ubl.semantic.yaml in UBL business model\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"ubl.shacl.ttl\":\n          - button \"ubl.shacl.ttl\":\n            - img\n            - text: ubl.shacl.ttl\n          - button \"Delete ubl.shacl.ttl\"\n          - button \"Actions for ubl.shacl.ttl in UBL business model\":\n            - img\n          - text: SHACL\n    - treeitem \"Shopping center administration\" [expanded]:\n      - button \"Shopping center administration\":\n        - img\n        - img\n        - text: Shopping center administration 7\n      - button \"Delete project Shopping center administration\"\n      - button \"Actions for Shopping center administration\":\n        - img\n      - group:\n        - treeitem \"mall-data.ttl\":\n          - button \"mall-data.ttl\":\n            - img\n            - text: mall-data.ttl\n          - button \"Delete mall-data.ttl\"\n          - button \"Actions for mall-data.ttl in Shopping center administration\":\n            - img\n          - text: RDF\n        - treeitem \"mall.mapping.yaml\":\n          - button \"mall.mapping.yaml\":\n            - img\n            - text: mall.mapping.yaml\n          - button \"Delete mall.mapping.yaml\"\n          - button \"Actions for mall.mapping.yaml in Shopping center administration\":\n            - img\n          - text: Ossie mappings\n        - treeitem \"mall.odcs.yaml\":\n          - button \"mall.odcs.yaml\":\n            - img\n            - text: mall.odcs.yaml\n          - button \"Delete mall.odcs.yaml\"\n          - button \"Actions for mall.odcs.yaml in Shopping center administration\":\n            - img\n          - text: ODCS\n        - treeitem \"mall.ontology.yaml\":\n          - button \"mall.ontology.yaml\":\n            - img\n            - text: mall.ontology.yaml\n          - button \"Delete mall.ontology.yaml\"\n          - button \"Actions for mall.ontology.yaml in Shopping center administration\":\n            - img\n          - text: Ossie ontology\n        - treeitem \"mall.owl.ttl\":\n          - button \"mall.owl.ttl\":\n            - img\n            - text: mall.owl.ttl\n          - button \"Delete mall.owl.ttl\"\n          - button \"Actions for mall.owl.ttl in Shopping center administration\":\n            - img\n          - text: OWL\n        - treeitem \"mall.semantic.yaml\":\n          - button \"mall.semantic.yaml\":\n            - img\n            - text: mall.semantic.yaml\n          - button \"Delete mall.semantic.yaml\"\n          - button \"Actions for mall.semantic.yaml in Shopping center administration\":\n            - img\n          - text: Ossie semantic\n        - treeitem \"mall.shacl.ttl\":\n          - button \"mall.shacl.ttl\":\n            - img\n            - text: mall.shacl.ttl\n          - button \"Delete mall.shacl.ttl\"\n          - button \"Actions for mall.shacl.ttl in Shopping center administration\":\n            - img\n          - text: SHACL\n    - treeitem \"Commerce scale data\" [expanded]:\n      - button \"Commerce scale data\":\n        - img\n        - img\n        - text: Commerce scale data 1\n      - button \"Delete project Commerce scale data\"\n      - button \"Actions for Commerce scale data\":\n        - img\n      - group:\n        - treeitem \"commerce-scale.ttl\" [selected]:\n          - button \"commerce-scale.ttl\":\n            - img\n            - text: commerce-scale.ttl\n          - button \"Delete commerce-scale.ttl\"\n          - button \"Actions for commerce-scale.ttl in Commerce scale data\":\n            - img\n          - text: RDF\n  - button \"Trash\":\n    - img\n    - text: Trash\n  - button \"Settings\":\n    - img\n    - text: Settings\n  - text: Project folders · on your machine Your definitions stay local.\n- separator \"Resize sidebar\"\n- main:\n  - button \"Hide sidebar\" [expanded]:\n    - img\n  - heading \"commerce-scale.ttl\" [level=1]\n  - text: Commerce scale data RDF\n  - status \"Save state\": Saved to file · 0 uncommitted changes\n  - button \"Commit\" [disabled]:\n    - img\n    - text: Commit\n  - button \"More actions\":\n    - img\n  - group \"Account\":\n    - button \"Person menu\"\n  - button \"Overview\":\n    - img\n    - text: Overview\n  - button \"Graph\":\n    - img\n    - text: Graph\n  - button \"Neighborhood\":\n    - img\n    - text: Neighborhood\n  - button \"Catalog\":\n    - img\n    - text: Catalog\n  - button \"Source\":\n    - img\n    - text: Source\n  - button \"Mappings\":\n    - img\n    - text: Mappings\n  - button \"Metrics\":\n    - img\n    - text: Metrics\n  - img\n  - textbox:\n    - /placeholder: Find an entity…\n  - combobox:\n    - img\n    - textbox \"Find a center\":\n      - /placeholder: \"Center: Customer 10000\"\n  - button \"150 entities, Fit\"\n  - status \"Neighbor counts\":\n    - text: 12 of 13 neighbors ·\n    - strong: 1 hidden\n  - button \"1 more neighbor\"\n  - button \"Full pierce\":\n    - img\n    - text: Full pierce\n  - text: \"Expand:\"\n  - radiogroup \"Pierce direction\":\n    - radio \"Outgoing\"\n    - radio \"Incoming\"\n    - radio \"Both\" [checked]\n  - button \"Undo expansion\":\n    - img\n  - button \"Zoom out\":\n    - img\n  - button \"Zoom in\":\n    - img\n  - group \"View options\":\n    - group \"Neighbors\":\n      - text: Relationship\n      - combobox \"Filter neighbors by relationship\":\n        - option \"All (14)\" [selected]\n        - option \"placedBy (2)\"\n        - option \"soldTo (2)\"\n        - option \"billedTo (1)\"\n        - option \"lastInvoice (1)\"\n        - option \"lastPayment (1)\"\n        - option \"lastShipment (1)\"\n        - option \"paidBy (1)\"\n        - option \"places (1)\"\n        - option \"preferredProduct (1)\"\n        - option \"purchasedBy (1)\"\n        - option \"recipient (1)\"\n        - option \"serves (1)\"\n      - button \"Links between neighbors (6)\" [pressed]\n    - group \"Show\":\n      - button \"Labels\"\n    - group \"Layout\":\n      - button \"Re-arrange\"\n  - button \"Enter full screen\":\n    - img\n  - navigation \"Walk\":\n    - button \"Back\":\n      - img\n    - button \"Forward\" [disabled]:\n      - img\n    - list:\n      - listitem:\n        - button \"Customer 10000\"\n      - listitem:\n        - text: ›\n        - button \"All connected to Customer 10000\"\n  - status:\n    - text: 150 entities shown in 3 steps ·\n    - strong: 850 more reachable\n    - button \"Expand further\"\n  - application:\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#product_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#payment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_174 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_87 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_35 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_48 to https://example.org/commerce#payment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#customer_61 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#line_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_0 to https://example.org/commerce#warehouse_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_13 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_35 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_48 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_61 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_78 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_100 to https://example.org/commerce#line_113\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_113 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_148 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_161 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#order_178 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_35 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_48 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_48 to https://example.org/commerce#warehouse_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#product_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_74 to https://example.org/commerce#warehouse_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_87 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_96 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_100 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_135 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_148 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_174 to https://example.org/commerce#order_174\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_187 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#line_196 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#warehouse_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#line_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_13 to https://example.org/commerce#order_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_35 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_48 to https://example.org/commerce#order_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_61 to https://example.org/commerce#line_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#product_74 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_0 to https://example.org/commerce#order_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_9 to https://example.org/commerce#product_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_22 to https://example.org/commerce#warehouse_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_35 to https://example.org/commerce#invoice_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#order_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#customer_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#warehouse_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#product_91\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_52 to https://example.org/commerce#invoice_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_74 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_87 to https://example.org/commerce#customer_0\"\n    - img:\n      - group \"Edge from https://example.org/commerce#shipment_87 to https://example.org/commerce#product_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_4 to https://example.org/commerce#order_4\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_4 to https://example.org/commerce#customer_17\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_9 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_13 to https://example.org/commerce#payment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_22 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#order_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#customer_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#payment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#line_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_26 to https://example.org/commerce#shipment_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_35 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_48 to https://example.org/commerce#line_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_61 to https://example.org/commerce#payment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#order_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#payment_13\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#line_126\"\n    - img:\n      - group \"Edge from https://example.org/commerce#invoice_87 to https://example.org/commerce#shipment_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_0 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_9 to https://example.org/commerce#line_48\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_22 to https://example.org/commerce#line_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_26 to https://example.org/commerce#invoice_26\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_35 to https://example.org/commerce#shipment_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#invoice_39\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#customer_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#order_65\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#line_78\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_39 to https://example.org/commerce#shipment_91\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_48 to https://example.org/commerce#line_87\"\n    - img:\n      - group \"Edge from https://example.org/commerce#payment_74 to https://example.org/commerce#order_100\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_35 to https://example.org/commerce#line_74\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_39 to https://example.org/commerce#shipment_52\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_48 to https://example.org/commerce#shipment_61\"\n    - img:\n      - group \"Edge from https://example.org/commerce#warehouse_74 to https://example.org/commerce#order_100\"\n    - group:\n      - img\n      - text: Center Customer\n      - strong: Customer 10000\n      - text: 1 field\n    - group:\n      - text: Invoice\n      - strong: Invoice 10026\n      - text: 1 field\n      - button \"Expand Invoice 10026\":\n        - img\n      - button \"Walk to Invoice 10026\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Invoice\n      - strong: Invoice 10087\n      - text: 1 field\n      - button \"Expand Invoice 10087\":\n        - img\n      - button \"Walk to Invoice 10087\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Product\n      - strong: Monitor arm · SKU 10013\n      - text: 1 field\n      - button \"Expand Monitor arm · SKU 10013\":\n        - img\n      - button \"Walk to Monitor arm · SKU 10013\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Product\n      - strong: Monitor arm · SKU 10048\n      - text: 1 field\n      - button \"Expand Monitor arm · SKU 10048\":\n        - img\n      - button \"Walk to Monitor arm · SKU 10048\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order\n      - strong: Order 10000\n      - text: 1 field\n      - button \"Expand Order 10000\":\n        - img\n      - button \"Walk to Order 10000\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order\n      - strong: Order 10100\n      - text: 1 field\n      - button \"Expand Order 10100\":\n        - img\n      - button \"Walk to Order 10100\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Order line\n      - strong: OrderLine 10074\n      - text: 1 field\n      - button \"Expand OrderLine 10074\":\n        - img\n      - button \"Walk to OrderLine 10074\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Payment\n      - strong: Payment 10039\n      - text: 1 field\n      - button \"Expand Payment 10039\":\n        - img\n      - button \"Walk to Payment 10039\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Shipment\n      - strong: Shipment 10052\n      - text: 1 field\n      - button \"Expand Shipment 10052\":\n        - img\n      - button \"Walk to Shipment 10052\":\n        - img\n        - text: Walk here\n    - group:\n      - text: Shipment\n      - strong: Shipment 10087\n      - text: 1 field\n      - button \"Expand Shipment 10087\":\n        - img\n      - button \"Walk to Shipment 10087\":\n        - img\n        - text: Walk here\n    - img\n    - link \"React Flow attribution\":\n      - /url: https://reactflow.dev/attribution\n      - text: React Flow\n  - img\n  - text: Structure checked\n  - button \"Validation details\"\n  - text: 1000 entities · 5000 relationships",
},

      at captureRawStack (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright/lib/matchers/expect.js:13316:57)
      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/graph-browser-check.ts:452:60
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/graph-browser-check.ts:47:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:graph" exited with code 1
```

### bun run test:odcs

Exit 1; raw output `suite-odcs.log`.

```text
  name: "toBeLessThanOrEqual",
},

      at captureRawStack (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright/lib/matchers/expect.js:13316:57)
      at checkDatasetLineageWidth (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/helpers/odcs-graph-review.ts:34:43)
      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/odcs-browser-check.ts:160:11
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/odcs-browser-check.ts:55:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:odcs" exited with code 1
```

### bun run test:mapping-graph

Exit 0; raw output `suite-mapping-graph.log`.

```text
PASS selecting a concept (Region) emphasises its mappings, dims the rest, and lists its bindings with Edit item (0.3 s)
PASS link Order.customer → Customer is labelled and passes through orders.customer_id and customers.customer_id (7.5 s)
PASS Unmapped only: unmapped concepts and fields carry the badge; the filter leaves only them (2.8 s)
PASS warning markers: a resolver finding shows on the affected card with its message and Edit item (2.9 s)
PASS Expand, Collapse and Show all connected work on the mapping canvas: Show all connected from Customer opens exactly the cards its mappings reach (3.6 s)
PASS Flights standalone: drawn lines are the resolver bindings (5.7 s)
PASS Flights consolidated: the same mapping graph for the embedded mappings, and Ontology graph switches to the entity graph (1.6 s)
PASS billing: drawn lines are the resolver bindings (4.9 s)
PASS shopping center: KPI bindings as metric cards, measures solid and of dashed (11.5 s)
PASS readable first view: whole cards retain names at least 9 px at 1280×720 and 1440×900 (5.4 s)
PASS no browser errors (0.0 s)
12 mapping graph checks passed on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-rKtMkw.
```

### bun run test:scm

Exit 0; raw output `suite-scm.log`.

```text
PASS the Remote dialog starts on the address field; Escape returns to Remote… (0.1 s)
PASS file history: compare two versions of a file (0.3 s)
PASS waiting for credentials: the panel says so and Cancel stops the operation (0.5 s)
PASS Admin → Git remotes sets and removes a local bare remote (1.1 s)
PASS feedback about a remote ends when the remote is removed (0.9 s)
PASS Admin → Git remotes explains an empty workspace and leads back to Add project (1.1 s)
10:30:33 ERROR http.request requestId=98bf020c-340f-4db0-bb02-155f2511a569 actor=local method=GET route=/api/projects/:slug/git/log status=500 durationMs=1
PASS missing Git: the banner explains it, the panel says so, editing and saving still work (3.8 s)
PASS the panel and its remote actions fit at 390, 1280, 1440 and 2560 px (1.4 s)
PASS read access replaces commit and branch creation controls (0.9 s)
PASS no browser errors (0.0 s)
20 source-control checks passed on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-0fxQNE.
```

### bun run test:editor

Exit 0; raw output `suite-editor.log`.

```text
PASS a finding appears inline within 500 ms of a typing pause, with gutter marker and message; fixing it clears it
PASS a CRLF/mixed-ending file: one edited line changes only that line, and the save sends a patch
PASS the import-repair dialog uses the same editor: findings, Go to line from the report, repair and import
PASS keyboard: the editor is reachable by Tab with its accessible name; search opens with Ctrl+F
  1153 ms for 39 keystrokes (30 ms each)
  in the page: 35.5 ms mean per key without a save running
PASS typing in a 1.9 MB file stays responsive
  no save running: 425 ms wall clock for 39 keystrokes; in the page 44.9 ms mean per key, longest task 0 ms
  automatic save in flight: 375 ms wall clock for 39 keystrokes; in the page 18.3 ms mean per key, longest task 0 ms
PASS typing in a 1.9 MB file stays responsive to each keystroke while an automatic save runs
PASS no browser errors
10 editor checks passed on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-JQLEFf.
```

### bun run test:validation

Exit 0; raw output `suite-validation.log`.

```text
$ bun scripts/validation-browser-check.ts
PASS invalid Source draft keeps its header state and one located message
{"errors":[]}
```

### bun run test:theme

Exit 1; raw output `suite-theme.log`.

```text
  "      - element is visible, enabled and stable", "      - scrolling into view if needed",
  "      - done scrolling", "      - <div role=\"status\" class=\"full-graph-loading\">Arranging 4 graph nodes…</div> intercepts pointer events",
  "    - retrying click action", "      - waiting 100ms", "    - waiting for element to be visible, enabled and stable",
  "  - element was detached from the DOM, retrying"
],

      at accentCheck (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/theme-browser-check.ts:53:78)
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/theme-browser-check.ts:20:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:theme" exited with code 1
```

### bun run test:dialogs

Exit 0; raw output `suite-dialogs.log`.

```text
$ bun scripts/dialogs-browser-check.ts
PASS Commit: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Validation details: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Add concept: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Grouping suggestions: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Import: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS New file: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS View definition: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS Trash: opens from its trigger, fits the six viewports, traps focus, Escape closes and returns focus
PASS menus: opaque, inside the window and reachable at four sizes
9 dialog checks passed at six viewports on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-QKj32f.
```

### bun run test:metrics

Exit 1; raw output `suite-metrics.log`.

```text
  timeout: 5000,
  ariaSnapshot: undefined,
},

      at captureRawStack (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:9282:21)
      at callMatcherAsStep (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright/lib/matchers/expect.js:13316:57)
      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/metrics-browser-check.ts:253:57
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/metrics-browser-check.ts:111:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:metrics" exited with code 1
```

### bun run test:trash

Exit 0; raw output `suite-trash.log`.

```text
PASS the row icon runs the same confirmation, undo and trash flow for a single file
PASS rows never overlap or run under the icons at 390 px and 2560 px; touch shows the icons without hover
PASS a mapping imported on its own is suggested for Flights with evidence, and accepting moves it
PASS a dismissed suggestion is not offered again
PASS delete names the file, warns about unsaved edits and broken references; Cancel keeps it
PASS confirmed delete updates every view; Undo within 10 s restores the exact file
PASS after the undo window the file is restored from the trash, and another is purged
PASS deleting a project removes it with its history; restore from the trash brings it back
PASS Clear empties the workspace; Undo brings every project back
PASS Clear again, then empty the trash with confirmation
PASS no page reload and no browser errors
13 trash checks passed on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-WajKpG.
```

### bun run test:projects

Exit 0; raw output `suite-projects.log`.

```text
$ bun scripts/projects-browser-check.ts
PASS sidebar tree lists projects with their files, types and validity
PASS an invalid file opens in Source for repair
  external edit visible after 396 ms
PASS an external edit appears in the open tab within 2 s without a reload
PASS a save based on an older version is rejected with both versions shown (two tabs)
PASS deleting the cache and restarting restores projects, files, view settings and drafts
PASS export project downloads a zip that imports back byte-exact
PASS the selected project is the context: fallbacks and Import stay in it, never in another project
PASS New file creates each kind in an empty project, opens it and validates
8 project checks passed on isolated data root /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/.data/gate/tmp/workbench-browser-XXoTDc.
```

### bun run test:sidebar

Exit 1; raw output `suite-sidebar.log`.

```text
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at openPage (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/sidebar-layout-browser-check.ts:24:14)
      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/sidebar-layout-browser-check.ts:109:28
      at check (/home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/scripts/sidebar-layout-browser-check.ts:15:9)
      at processTicksAndRejections (native:7:39)

Bun v1.4.0 (Linux x64)
error: script "test:sidebar" exited with code 1
```

### bun run test:mappings-layout

Exit 1; raw output `suite-mappings-layout.log`.

```text
59167 |     e = Object.assign(new PlaywrightError(error.error.message), { name: error.error.name });
                                  ^
error: goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5261/
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:59167:27

Bun v1.4.0 (Linux x64)
error: script "test:mappings-layout" exited with code 1
```

### bun run test:back-history

Exit 1; raw output `suite-back-history.log`.

```text
59167 |     e = Object.assign(new PlaywrightError(error.error.message), { name: error.error.name });
                                  ^
error: goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5261/
Call log:
[2m  - navigating to "http://127.0.0.1:5261/", waiting until "load"[22m

  log: [ "  - navigating to \"http://127.0.0.1:5261/\", waiting until \"load\"" ],

      at /home/rodrigo/projetos/semantic-workbench-wt/007-ui-review-fixes/node_modules/playwright-core/lib/coreBundle.js:59167:27

Bun v1.4.0 (Linux x64)
error: script "test:back-history" exited with code 1
```

### Browser action readiness

The whole-graph loading overlay already marks unfinished layout, and Expand all is disabled while that work is pending.
The shared browser driver tested that disabled state immediately after switching graphs and could skip the expansion entirely.
The driver will wait for the existing loading indicator before deciding whether expansion is needed and after requesting it.
Existing timeouts and assertions remain unchanged; metrics and theme checks exercise the same entry point.

### Mapping disclosure selection

Resolved bindings now open by default, as the lane-E change requires. Native disclosure toggles still let the reader close the current evidence.
Selecting a different concept must open that concept's evidence, the behavior already required by the examples browser suite.
A stable key per selected concept resets only that disclosure when selection changes; ordinary renders preserve the reader's open/closed choice.

### Resume after external memory stop

The owner confirmed the previous run was stopped externally because other sessions exhausted machine memory. Interrupted commands and connection-refused results remain recorded, but are not accepted as product failures or passes.
All five pending edits are retained: the examples checks follow the approved phone detail view and humanized type label; the graph driver waits for existing layout readiness; mapping evidence resets on a new concept; this journal preserves results; the merge/changelog checkboxes reflect completed commits.
The resumed gate runs one browser or capture script at a time, checks `free -g` before each heavy step, waits below 8 GB available, and verifies that its frontend, API and browser processes exit before the next step.
`bun scripts/mutation-tests.ts` with the assigned frontend completed before the stop: `679/679 targeted mutants killed; all unmodified module baselines passed.` The two new packing mutants were detected.
`bun run test:lineage`: `26 lineage checks passed`, including four readable Walk targets, stable expansion, complete names and no browser errors (`suite-lineage-private-cache.log`).
`bun run test:odcs`: `10 ODCS checks passed`, including the dataset/header alignment (`suite-odcs-aligned-summary.log`).
`bun .data/gate/mall-canvas.ts`: Mall ODCS canvas at 1280×720 is 954×424 px; required minimum is 421 px. The original 407 px regression is fixed.
The full unit attempt reported 2102 pass / 1 timeout in the unchanged audit append benchmark under machine pressure. Focused reruns passed on both archived main (6 tests, 1018 assertions, 5.22 s) and merged code (6 tests, 1018 assertions, 4.85 s). A final serial full run remains required.

### Pending edits completed on serial resume

All five pending edits were retained. The evidence and task status updates are committed in `c9bb867b`.
The examples driver now checks the approved phone detail navigation and humanized catalog label, waits for example loading to finish,
and verifies that manually closed evidence reopens for a newly selected concept. The disclosure key changes only on concept selection.
The shared graph driver waits for the existing layout indicator before and after expansion, without changing timeouts.

- `python3 .data/gate/serial-step.py examples-listen-debug bun run test:examples:ui`: exit 0; `19 example UI checks passed; no browser runtime errors.`
- `free -g`: 25 GB available before that browser step; 24 GB before the following check.
- `bunx --bun oxfmt scripts/examples-ui-tests.ts scripts/helpers/graph-options.ts src/app/mappings/MappingExplorer.tsx`: finished on 3 files.
- `bun --bun run check`: exit 0; all 1044 matched files formatted; lint, comment, theme and brand checks passed.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed scripts/examples-ui-tests.ts scripts/helpers/graph-options.ts src/app/mappings/MappingExplorer.tsx`: exit 0.
- Process cleanup: `OWNED_PROCESSES_REMAINING []`; no gate frontend or API listener remains.

Frontend startup attempts `examples-current-labels`, `examples-final`, `examples-capped`, `examples-api-launch`,
`examples-fresh-cache` and `examples-start-debug` did not reach browser execution. Their driver logs preserve readiness timeouts or explicit diagnostic stops.
Direct Vite API startup with an isolated cache subsequently succeeded; no product timeout or assertion was relaxed.

### Serial browser and capture preparation

Existing Vite configuration and the disposable API fixtures remain authoritative. Capture drivers previously iterated both themes internally.
The capture-record module now validates an optional theme selection; no selection retains the original matrix.
Drivers reuse that selection so a batch can finish and release its servers before the next theme starts.
No viewport, fixture, screenshot identity or assertion is removed.

- `python3 .data/gate/serial-step.py graph-direct-http bun run test:graph`: exit 0; `18 graph and neighborhood checks passed`.
  Additional checks passed for expansion at all four widths in both themes, complete names, tile geometry, stable dragged positions,
  and first opening of UBL/Mall in Network/Layered layouts at all four widths. The 150-node budget/frontier check passed.
- `free -g`: 25 GB available before graph; 26 GB before the capture-driver check.
- `bun -e` importing `captureThemes`: default returns light/dark; light and dark each return only themselves; invalid input throws `Unsupported SW_THEME`.
- `bunx --bun oxfmt` on the changed capture drivers: exit 0.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed` on all changed capture TypeScript files: exit 0.
- `python3 ~/.codex/skills/never-leak-process/scripts/leak_scan.py docs/development.md`: `CLEAN`, 0 hits.

Startup diagnostics used `ps`, `ss`, `/proc` status and temporary Vite/Node-net logging inside the ignored gate folder.
The trace stopped after the wildcard IPv6 probe's listening event, before its close callback and before Vite buildStart.
A delayed close did not resolve it. The temporary launcher now uses Vite's supported middleware mode with its existing configuration,
a real HTTP listener on 5261 and the same listener for HMR. This avoids the failing port probe; it changes no application or suite assertions.
Every stopped diagnostic and completed suite reported `OWNED_PROCESSES_REMAINING []`.
- `bun --bun run check` after theme selection changes: exit 0; all 1044 matched files formatted; TypeScript, lint, comments, theme and brand passed.
