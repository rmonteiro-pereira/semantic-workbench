# Release verification

Work started from `bce884c` on `004-ui-polish`. Browser checks use an isolated API and
`SW_BASE_URL=http://127.0.0.1:5175`. The owner's server and data root are not used.

## Shared navigation and dialog fixes

- `bun run fmt`: passed.
- `bun --bun run check`: passed, including type checking, formatting, lint, comments,
  theme literals and brand literals.
- `RESPONSIVE_ONLY='shell screens:' bun --bun run test:responsive`: 4 checks passed,
  at 390×844, 1280×720, 1440×900 and 2560×1440.
- The installed readable-code check passed for the changed code and browser checks.
- Initial edit-screen matrix: 4 checks passed at the four release sizes.
- Strengthened edit checks exposed a real CSS cascade defect: the shared dialog body's padding
  overrode the item drawer's bottom padding. The drawer selector now includes `has-footer`,
  so the scroll-space rule wins.
- A second strengthened-check run exposed the mapping page's paragraph maximum width leaking
  into its query dialog footer. The shared footer hint now explicitly uses the full row.
  These were real failures, not machine-load reruns. The final strengthened edit matrix passed
  all 4 viewport checks after both fixes.
- `bun test`: 1,832 passed, 0 failed, 128,578 assertions across 257 files (294.22 seconds).
- `bun --bun run build`: passed. The existing bundle-size advisory remains informational.
- `bun --bun run check`: passed again after the strengthened assertions and cascade fixes.
- The strengthened dataset matrix passed at 390 and 1280 px, then found the off-centre
  Team and roles dialog at 1440 px. A broad ODCS page-width selector capped the native dialog
  overlay at 1,400 px. Excluding dialogs preserves viewport centring. The redundant 960 px
  Relationships cap was removed so it shares the existing readable content width.
- The first Relationships width assertion mistakenly included the page's horizontal padding
  in its available-width measurement. It now compares the table wrapper with its actual tab
  panel, retaining the existing 1,400 px readable-width cap and all existing assertions.
- Strengthened dataset and final shell matrices: 4 viewport checks each passed.
- `test:dialogs`: 9 checks passed across 6 viewports.
- Focused light/dark capture: 40 images, zero automated geometry problems and no skipped screens.
  Independent visual review found remaining issues recorded for the next batch.
- Check and build passed again after those captures. The full release gate remains pending.

No timing budget, timeout or assertion was relaxed. No load-related rerun has been needed.

## Readable first views and edit states

- Check and build passed after this batch; the overview-capacity unit file passed 5 tests.
- Graph canvas matrix: 4 passed, including rendered detail size multiplied by viewport scale.
- Strengthened edit matrix: 4 passed, including retained metric units and matching column headings.
- Shell matrix: 4 passed, including keyboard traversal to an initially clipped neighboring tab.
- `test:trash`: 13 passed. `test:monorepo`: 8 passed.
- Architecture review caught a Type heading left visible after its cells were hidden. The heading
  now shares the cell class, and a browser assertion compares visible headings with cell labels.
- The new keyboard assertion exposed native focus leaving a tab partially visible. ScrollStrip
  now explicitly reveals a focused control with the same clearance as the selected tab.
- Two subsequent keyboard-check failures were test-state problems: the check left an unselected
  tab in view before the next screen, and attempted focus through an inert phone drawer background.
  It now restores selected focus and checks only interactive strips. All four sizes then passed.
- These are documented diagnostic reruns, not machine-load reruns. Existing timing budgets,
  timeouts and assertions are unchanged. The mutation inventory has one new zoom-cutoff fault;
  the complete mutation run remains part of the pending final release gate.

## Source actions and graph explanations

- Mapping layout: 4 checks passed, including selected-document Source navigation at six sizes.
- Two diagnostic runs corrected the new test setup: EmptyState titles are strong text rather
  than headings, and reopening an original project requires expanding its collapsed tree row.
  The navigation, source-content and viewport assertions were retained.
- Focused graph units: 11 passed, 31 assertions across two files.
- Both new edge-label bounds faults were killed individually: ignoring bounds and omitting the
  caller's bounds. The complete mutation inventory still awaits its final gate run.
- The complete responsive matrix is running. No timing budget or timeout was changed.

- The complete responsive run passed the main, edit, ODCS, project, export, file, folder, shell,
  admin, header, ODCS graph and example tours, then failed dark-theme contrast on deliberately
  transparent clipped tabs. The strip now clips those fragments geometrically while retaining
  opaque theme colors and keyboard focusability. The containment assertion checks the clip;
  focused and selected controls must also have no clip. Contrast assertions remain unchanged.

- Dark theme rerun: all 4 viewport checks passed. Keyboard shell rerun: all 4 passed.
- The new direction-label assertion initially ran before opening the phone Controls panel.
  Its setup now opens that panel, checks the exact label and restores the previous folded state.
- Neighborhood details now disappear below natural scale; its geometry floor is strengthened
  from 11 to 12 rendered pixels. The new graph matrix is being rerun.

- Final strengthened graph matrix: 4 checks passed. Static check and build passed afterward.
- Readable-code, documentation sync and architecture structure checks passed. Independent
  architecture review reports SHIP. Full release gate and complete visual review remain pending.

## Complete server capture setup

The first server capture was stopped: beyond permission-dependent Import and Add concept skips,
the minimal access fixture lacked Team and status, so the tour skipped those dialogs too.
Clone also depended on workspace creation rights. This incomplete batch is retained at
`/tmp/polish-round4-incomplete` and is excluded from audit evidence.

The server capture now defaults to the existing mock administrator, expands only its temporary
orders contract with Team and status, explicitly selects that contract, and photographs the
server folder-change refusal instead of waiting for the local-only preview. Any skipped screen
fails an administrator capture. No application permissions or persistent fixture files changed.
The complete four-mode capture matrix has restarted.

The first expanded-fixture start correctly failed the published-checkout guard because the
preparation had left an uncommitted change. Preparation now awaits a commit through the existing
Git service inside that temporary project before starting server mode. The guard and its timeout
are unchanged. This was a capture setup failure, not a machine-load rerun.

The next server run reached all formerly missing phone dialogs, then the Export tour's broad
strict locator matched both the new modal and the drawer during its closing render. The tour
now explicitly waits for exactly one dialog before checking the named Export modal; a drawer
that remains open still fails. No timeout or assertion was relaxed. Preparation and capture
cleanup now also cover initialization failures and termination through the shared cleanup edge.

The next capture exposed a production refusal bug: server folder changes threw a not-found error,
so the privacy boundary replaced the clone-instead instruction with a generic 404. The service
now uses a bad-request refusal after route authorization. A regression exercises preview and apply
for an administrator and an unreadable project. The red test reproduced 404 instead of 400.
Its first green attempt used an editor for the administrative apply action and correctly received
403; the test now uses the capture administrator. Permissions remain unchanged.

Folder regression verification: 15 tests passed, 0 failed, 115 assertions across two files.
Static checks, readable-code, documentation sync and architecture structure checks passed.
Independent architecture review reports SHIP. The complete capture restarted after these checks.

Complete server-light capture: 164 images, 41 screens at all four sizes, no skips and
0 automated geometry findings. Independent review is in progress. The focused mutation baseline
passed and the former not-found refusal was killed. Build and final static checks passed.

## Server diagnostic review and capture coverage correction

Independent reviewers inspected all 164 server-light images in round-2-SA/SB. They found four
product S2 rows and one capture-coverage S2 row (SA: 3 S2; SB: 2 S2). Desktop main-tab captures
retained Source Control from the preceding viewport; the first phone sidebar capture raced the
compact layout transition. The zero geometry count did not establish correct screen coverage.
The batch was stopped, and it is diagnostic evidence only. No clean-round claim is made.

Shared tab navigation now explicitly enters Model explorer and asserts the active tab. Server
viewports use fresh pages in the authenticated context, matching local capture isolation. Sidebar
navigation asserts visibility, and local capture also fails on skips. The new full batch uses
`/tmp/polish-round5`, leaving diagnostic pixels unchanged.

The branch holder now wraps outside its selector; phone mapping summaries use two columns and a
shorter introduction; Import names definitions; folder help names the server restriction before
submission. Browser tours check the branch label, first-view concepts, import wording and folder
hint at the viewport matrix. Singular dataset, binding and delete-file grammar is also corrected.

The strengthened edit and main-screen matrices each passed all four viewport checks. The
trash suite passed all 13 checks. Final static, readable-code, documentation sync and structure
checks passed; architecture review reports SHIP. The corrected capture is running, and direct
inspection confirms the desktop Graph, phone sidebar and phone concepts now show their intended
content. This does not replace the full independent review.

## Round 5 coverage extension

The first independent server-light review of the corrected captures found 0 S1 and 0 S2 across
all 164 main-tour images (SA:80, SB:84). Three S3 rows remain as recorded in those reports.

The capture list now also includes all eight existing Admin section tours, a real concept-mapping
graph, and Graph and Neighborhood in full screen. These are capture-only additions; the responsive
suite already checks Admin independently. The expected complete matrix is 52 screens × 4 sizes ×
4 mode/theme combinations = 832 images. Both tools support substring selection for supplements.
Local batches will include these screens directly; server supplements add the missing views to
its already frozen main-tour batch. The production UI remains at `253165e` throughout this round.
Static checks passed and independent architecture review reports SHIP. Supplemental capture
execution and independent image review remain pending.

## Round 5 remaining graph defects

Server dark review completed all 164 images: SC found 0 S1/0 S2; SD found 0 S1/1 S2
(insufficient relationship-line contrast). Local capture then exposed wrapped area headings
colliding with count cards. The local batch was stopped and is incomplete; only the two inspected
phone images are recorded in round-5-LE-diagnostic. No full-round clean result is claimed.

Generic capture previously measured ordinary UI text while excluding graph nodes. Capture now
also runs the graph geometry assertions and fails on any measurement problem. New heading and
paint checks reproduced four phone title collisions and sub-3:1 edges. Neighborhood reproduced
the existing 55% canvas-height failure; its suspected card overlap did not reproduce.

The grouped layout now reserves two largest-size heading lines, titles clamp to two lines with
their complete native tooltip, and graph names grow to a full 12 px floor. Default edge strokes
retain screen width and use stronger shared idle tokens without reducing focus dimming. The
phone walk controls share a row with Other files. Singular relationship counts and full-path
wording are corrected as well.

The first focused capture passed the normal phone graph and Neighborhood checks, then the new
full-screen screens exposed a measurement-scope issue: the text checker was examining workspace
text that is intentionally behind native full screen. It now measures the visible full-screen
canvas, matching the control checker’s existing scope. No timing budget or timeout changed.
A TypeScript literal-inference error for SVG vectorEffect was fixed with a literal type.

The strengthened layout and theme unit checks passed: 19 tests, 0 failures, 3,724 assertions.
Further focused capture and full viewport verification are in progress before the next round.


Focused graph follow-up (round 5 LF): the independent reviewer inspected all 16 light images and
found two S1, two S2 and one S3. Phone Controls retained their old position after full-screen entry
and clipped the direction selector; full-detail neighborhood cards touched; wide Network views
formed a dense mesh. Controls now reposition after layout commits and viewport/full-screen changes,
and expansion controls wrap. Neighborhood rows are 180 canvas pixels, preserving a gap around the
measured full-detail cards. Layered is the initial model layout and retains its ELK route vertices
until live handles move. Fully collapsed areas use compact packing. Controls anchoring, horizontal
containment, minimum neighbor gaps and edge/card clearance are measured at the viewport matrix.
The first Layered focused capture failed at 390 px: collapsed areas formed an unreadably long chain.
Compact packing fixes that root cause; no text-size floor was reduced. Targeted units: 26 pass,
zero failures, 3,750 assertions across three files. Full browser and visual verification is pending.

The first retained ELK route attempt still used fallback curves for internal links. Diagnostic
inspection established that root-stored edges can declare a compound `container`; route vertices
now receive that container's absolute origin. All 183 bundled routes are unit-checked against
absolute source and target borders. A subsequent focused review found wide-layout name cramming
and summary counts clipped by the old fixed 60-pixel CSS height. Actual layout proportions now
participate in the existing initial-area decision; manual expansion remains available. Summary
cards reserve 96 pixels in both layout engines and their rendered height follows their layout.
The focused count-clipping assertion reproduced the CSS defect and then passed at all four sizes.
Targeted units now pass 28 tests, zero failures, 4,487 assertions across three files. The canonical
graph tour keeps ownership of its existing manual-all-open name-size exception; complete captures
measure graph geometry directly. Existing edge attachment checks now explicitly select Network
for worker checks and drag cards in both layout choices, preserving their endpoint tolerance.

Independent focused reviews `round-5-LG-focused.md` and `round-5-DG-focused.md` inspected all 32
light/dark Graph and Neighborhood images at native resolution: zero S1, zero S2, one S3 each
(the same compact DocumentReference word break). These are focused reviews, not a clean full round.
`bun run test:edges` passed all six checks on port 5175, including live endpoint measurements on
every drag frame and dragging after both Layered and Network layout changes. Static check passed.
Both production ELK constructors and the unit engine now explicitly register the box packer.
Open phone Controls are additionally measured before the canonical graph tour folds them again;
full-screen captures reopen, measure and close Controls after the full-screen transition.

The graph viewport matrix passed all four checks at 390×844, 1280×720, 1440×900 and 2560×1440
(`RESPONSIVE_ONLY='graph canvases:'`, Vite 5175). This includes expanded-area geometry and the
open phone Controls assertions. Targeted units remained 28/28 with 4,487 assertions. Build passed.
Architecture review reports SHIP after explicit box registration. The complete capture inventory
is 52 named screens; the next full round will capture 208 per mode/theme, 832 total.


## Round 6 server review and follow-up

The frozen build at `5e3738a` produced 208 server-light images with zero reported geometry
problems. The long-running capture runner exited 143 while server dark had produced 157 images;
that partial directory is excluded. Vite on 5175 also stopped unexpectedly. The exact cause is
unknown; this is an interrupted run, not evidence of machine load. A detached server-dark retry
completed all 208 images against the same frozen build with zero geometry problems and no skips.
Independent native review covered all 416 complete images in SA–SF. Light and dark each found
four S1 and two S2 rows in the final 72-image partition; the other partitions found no S1/S2.

New assertions reproduced clipped phone Admin labels against the old build. Initial Neighborhood
follow-up caught four icons below 12 px in wide full screen. Default action icon minima and compact
badge visibility now address that failure. The next attempt failed with connection refused after
Vite stopped; restarting our Vite on 5175 allowed all eight light Neighborhood captures to pass.
No timeout, timing budget or assertion was relaxed. Static checks, build and targeted Admin units
passed (10 tests, zero failures, 11 assertions). Focused server capture and matching suites follow.

An immediate Admin navigation measurement initially observed cues before the resize observer's
paint. The assertion now runs with the other screen measurements after the existing screen-ready
step; Admin geometry also waits for two animation frames after viewport changes. It retains the
same cue, clipping and table assertions without extending any timeout or timing budget.


The focused light follow-up inspected all 44 images: zero S1, two S2 and two S3. Tables and
navigation are corrected; the remaining S2 rows concern the obsolete Roles & access destination
name and missing Access check input guidance. The reviewer clarified that the relative size of
fullscreen phone card names is S3; a numerical floor violation was not established, while the
computed-font-times-zoom assertions pass. Both themes completed 44 focused capture measurements
with no problems or skips. The Admin viewport matrix passed all four sizes.

Architecture review identified a test-module cycle introduced by shared Admin measurements.
Extracting `strip-geometry.ts` removes it; the independent review now reports SHIP.


The four graph viewport checks and all 12 mapping graph checks passed. The complete Admin suite
also exited zero, but its in-process last-Admin fixture logged six brand-route HTTP 500 errors:
it bypassed server startup without loading the default brand. That fixture now uses the existing
brand initializer and asserts the actual manifest response is 200. A standalone rerun verifies
this correction; the production server and the frozen captures already initialized branding.


Final focused verification for this batch: 64 fresh Admin captures (32 per theme) passed all
measurements; independent review of the 16 changed Projects/Access check views found zero S1,
zero S2 and zero S3. The strengthened Admin matrix passed all four viewports again. The standalone
last-Admin fixture rerun exited zero with its manifest-response assertion and no brand-load errors.
Static checks, production build, readable-code, documentation sync and structure checks pass.
Independent architecture review reports SHIP. Full four-mode audit and the final gate remain open.


## Round 7 full audit

The complete four-mode capture started from pushed code head
`31f4dbcbd1e8aa4a17a1e05719cc31232875a7c1`, with no product changes during capture. Each mode
must produce 208 PNGs and 208 zero-problem measurements with no skips before the runner marks it
complete. Review partitions contain 68, 68 and 72 native images per mode. Review is in progress;
no clean-round result is claimed yet. README and graph-design prose are being reconciled with
existing behavior, including the full 12 px floor, Layered routing and compensated action sizes.


Both server themes completed 208 zero-problem measurements with no skips. Independent review
of all 416 server images found zero S1/S2. Local capture then stopped at its first mapping graph:
`commerce.mapping.yaml` belongs to mapped commerce, which the local harness had not loaded.
This is a deterministic fixture omission, not machine load. The harness now loads that example
explicitly. The interrupted 41-image local batch is diagnostic only; all local captures and reviews
restart from a fresh root. Application code remains at `31f4dbc`; completed server evidence is valid.

The corrected local mapping capture passed all four viewports with zero geometry problems.
Static, formatter, readable-code and documentation checks pass. The fixture-only change does not
alter application source or invalidate the 416 completed server captures.
