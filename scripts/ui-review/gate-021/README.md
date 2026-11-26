# Journey comparison

These manual capture tools compare frozen application sources with disposable data.
Application code stays unchanged. The scripts extend the existing UI review harness.
All browser and build commands run through `sw-midgard-run`.

`journey.py` prepares the two source copies, installs each lockfile and builds each application.
Its `worker SIDE REPEAT` command runs one passage against an existing copy. Graph commands run
separately by viewport and theme. Other commands retain their original state sequences.
`supplement.py` records collapsed Network edge-label text, with Labels enabled,
filled connections, revocation, access decisions and the Ossie conversion entry point.

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
Pairs above noise remain pending until visual review. Missing images remain explicitly unclassified.

No command pushes to a project remote, changes application sources or updates task checkboxes.
