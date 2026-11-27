# Journey comparison

These manual capture tools compare frozen application sources with disposable data.
Application code stays unchanged. The scripts extend the existing UI review harness.
All browser and build commands run through `sw-midgard-run`.

`journey.py` prepares the two source copies, installs each lockfile and builds each application.
Its `worker SIDE REPEAT [rest|features]` command runs one passage against an existing copy; `rest` excludes
graphs; `features` selects Admin, feature states and settings. Separate passage numbers allow these groups to run concurrently with graph captures. Graph commands run
separately by viewport and theme. Other commands retain their original state sequences.
`supplement.py` records collapsed Network edge-label text, with Labels enabled,
filled connections, revocation, access decisions and the Ossie conversion entry point.
Optional group arguments select a subset: `labels`, `gaps`, `conversion`, `policy` or `governance`.
`patch-captures.py` expands feature and settings captures to the required variants and opens a
program's editor when the screen presents its program list first.

The capture environment uses `JOURNEY_OUTPUT` for artifacts, `JOURNEY_VIEWPORTS` for the
graph viewport list, `SW_THEME` for the graph theme, `SW_BASE_URL` for the static frontend
and `CAPTURE_ROUND=2` for complementary settings states. `TMPDIR` holds disposable fixtures.
The static frontend listens on loopback port 5410; fixtures use ports within 5401–5498.
Each concurrent passage requires its own network namespace.

`integrity.py` checks application files against their Git blob hashes.
`compare.ts` compares both passages of each side. Its score is the fraction of pixels whose
largest channel difference exceeds 12. It records within-side noise, a changed-pixel bounding
box and a cropped side-by-side strip. A cross-version score at or below the larger within-side
noise score plus 0.00005 is marked neutral. This numerical filter does not establish visual quality.
Different recorded lineage centres remain non-comparable. `report.py OUTPUT` applies recorded
visual decisions and recognises the approved success-colour transformation in stable pixels.
Pairs above noise remain pending until visual review. Missing images remain explicitly unclassified.

No command pushes to a project remote, changes application sources or updates task checkboxes.

`catalog.ts` records fixture hashes and parser counts using filenames without directory prefixes.
`stop-passages.py graphs|tours` stops only workers with a successful final command in that block, checking exact PIDs and start times.
Keep at most eight capture workers on the shared transport and run comparisons after capture slots become available.

`evidence.py ROOT` summarises selected passages, unreachable actions, example hashes, label counts and attribute input measurements.

`JOURNEY_EXCLUDE_GROUPS` compares completed blocks first; `JOURNEY_GROUPS` replaces only those named blocks in the existing comparison results.
Feature variants resize a live state before restoring its original viewport and theme; they do not replay that action independently for each screenshot.

`preview.ts` renders the offline report at 390 and 1440 px through a temporary loopback server on port 5420, then closes its browser and server.

The report preserves unreachable actions and console errors. Custom fixtures without recorded input hashes remain not compared even when their screenshots have a visual disposition.
