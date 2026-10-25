# Remaining polish closure

This follow-up to v0.5.0 addresses every deferred minor finding and the documented browser warnings.
The v0.5.0 results in FINAL.md remain historical. The final follow-up gate passes all six steps,
and every deferred finding is fixed and verified. The final complete log has no resize-loop,
SVG-prop or missing-handle warnings. Earlier attempts and their corrections remain recorded below.

## Changes and focused verification

| Finding | Change | Focused evidence |
| --- | --- | --- |
| F118 | Fit the sidebar scroller to its last whole row within an independent frame; retain all files and keyboard navigation | Pure boundary cases and Chromium resize/scroll/focus checks at 390, 1280, 1440 and 2560 pixels pass; real sidebar screenshot inspected |
| F119 | Add wrap opportunities at camel-case and identifier boundaries without changing names | Measured text-line tests at four card widths pass; actual light-theme 1440-pixel fullscreen and ordinary neighborhood screenshots show Document / Reference without an orphan suffix |
| F124 | Multiline metric deprecation reason with a short placeholder and paired actions | Server-mode authentication suite passes; placeholder width and action-row assertions pass at all four supported viewports; phone screenshot inspected |
| F128 | Use operation-neutral recovery text for an empty definition | Presentation regression verifies the recovery sentence and rejects import-specific wording |
| F129 | Render the shared RDF refusal once while preserving its Source action and distinct errors | RDF editing suite passes, including exactly one matching refusal alert; N3 refusal screenshot inspected |
| F130 | Use singular error/warning labels only for a count of one | Presentation cases cover zero, one and multiple errors and warnings |

The 22 new focused tests pass. The RDF suite passes nine checks. The graph suite passes sixteen
checks, including both themes at all four viewport sizes and the unchanged 100 ms main-thread
budget (75 ms observed). The lineage suite passes nineteen checks with React Flow warnings now
included in its failure list. The authentication suite passes with the new deprecation geometry
assertions. Complete-gate results will be recorded after the final run.

## Browser warning corrections

- The routed-edge fallback passes only supported geometry and appearance props to its SVG renderer.
  Graph internals such as handle IDs and path options no longer leak onto SVG DOM elements.
- Lineage node measurement reuse is tied to row identity, the hidden-row count and expanded-column
  state. Open lists also include their visible-row budget and connected-column identities. Changing
  the handle topology invalidates the prior measurement so
  React Flow measures current handles before connecting the updated edges. Existing geometry
  assertions continue to check row attachment and clamped offscreen ports.
- Pane measurement and menu repositioning are scheduled outside ResizeObserver delivery. Menu
  placement measures natural scroll height without clearing and reapplying its own height limit
  inside the observer callback. No browser error or warning is suppressed.

The first lineage attempt exposed stale handle bounds under the stricter console assertions.
A provisional permanent-handle approach also failed the existing row-attachment assertion; it
was removed. Shape-aware measurement invalidation then passed the complete lineage suite with
no warning exclusions and without changing geometry or timing limits.

The final diff review added the case where a group opens beside an already expanded column list.
Its connected handle identities are included in the cache key. Applying a list-size key to closed
cards initially broke the existing no-hidden-cards-on-resize test; limiting that key to open lists
restored the guarantee. The full nineteen-check lineage suite then passed, including the added
group-opening transition. The first complete gate was stopped and its state discarded before
this correction; only the corrected-state run can count as final validation.

The first whole-row test exposed a one-pixel border accounting error; measuring only the bottom
border corrected it. Repetition then exposed a second path: shrinking a scroller while it was at
the end could strand the last file below the new bottom. Preserving the end position during that
height change fixed it. A deterministic resize-at-end assertion fails when that preservation line
is removed. The corrected tests pass 80 repeated viewport runs, covering the final file,
keyboard-focused middle files and frame resizes. Viewport expectations have a stricter one-second
deadline so a regression reports its failure and completes cleanup before the test deadline.

Both theme capture runs pass all sixteen neighborhood cases each, with no measured problems or
uncaught browser errors. The shared dialog suite passes nine checks across six viewport sizes,
including popup geometry and keyboard focus. No timing budget or assertion was weakened.

## Complete-gate failure and built-frontend correction

The corrected-state full gate passed verify (1,878 tests, 129,583 assertions, 264 files), all
663 mutation targets, every canonical browser suite and the image build/scan. It then failed the
container's responsive suite on the new whole-row assertion; the pipeline step was not reached.
That run is not a successful gate.

A focused container reproduction identified a 390×844 drawer reopening with an incompletely
exposed Flights row at 605–658 px inside a viewport ending at 620 px. Initial fitting had been
scheduled for a later animation frame, while the drawer was already visible. ProjectTree now
reveals the selected file and fits the viewport in layout effects before paint. Initial fitting
is synchronous; resize-observer deliveries still schedule later work outside the callback.

The browser harness records partial rows immediately after observer setup, before any animation
frame can run. All four viewport cases require zero initial fragments as well as correct scrolling
and resizing. The 22 focused tests and static checks pass after this correction. Rebuilt-container
confirmation passes with `RESPONSIVE_ONLY='shell screens:'` and
`bun scripts/container-check.ts --build --suite test:responsive`; the unchanged failing sequence
now succeeds in the production bundle. A fresh unfiltered full gate is pending. Neither the
assertion nor its tolerance changed;
its failure now includes the viewport, row label and measured boundaries for diagnosis. Replacing
synchronous initial fitting with the deferred call makes the new initial-layout test fail in
58 ms (one partial row instead of zero); restoring the fix passes all 22 focused tests.

## Deterministic unsaved-draft deletion fixture

The next unfiltered gate passed verify and mutation, then stopped in the browser's trash suite.
Its warning fixture appended a valid comment, so the normal autosave could finish before the
Delete action opened; an already saved file correctly has no unsaved-edits warning.

The fixture now creates invalid YAML, waits for the existing Not saved indicator and persisted
draft, and verifies that the original file bytes remain unchanged before opening Delete. The
warning assertion, Cancel behavior, exact-file Undo assertion and all deadlines remain intact.
Production saving and deletion code is unchanged. The corrected trash suite passes all thirteen
checks, the autosave suite passes all nine checks, and the container's targeted trash group passes.
A new complete gate is required; the stopped browser run is not counted as a pass.

## Example-load synchronization and complete warning capture

The following full run passed verify, mutation, canonical browser suites and the image stage.
Its container run then failed the example-metrics check: the test clicked Metrics before the
example loader finished selecting its initial mapping document, so the loader's final tab update
replaced the requested view. The test now waits for the existing completed-load message before
choosing Metrics. The expected count, metric kinds and presentation assertions are unchanged.
The focused container example suite passes with that synchronization.

A complete log audit also found warning paths missed by the earlier event collectors. The
layout-routed FullGraph edge forwarded the full graph props to BaseEdge. It now shares the
SVG-safe edgeAppearance selector with the background-routed edge, with a targeted unit test and
mutation fault guarding excluded metadata. The mutation inventory is now 664 targets.

Resize-loop events are now collected directly from window error events in graph, lineage and
responsive checks; Playwright pageerror alone had missed these events. The new collector does
not cancel or suppress them, and a browser test verifies that the original event is not cancelled.

Observer instrumentation traced the remaining loop to React Flow's internal node measurement
callback. Deferring only the application's controlled node changes did not resolve it, and that
probe was removed. The pinned React Flow 12.12.0 dependency now has a Bun-managed ESM patch:
measurements are merged by node identity and applied on the next animation frame, and pending
work is cancelled and cleared on unmount. Both ESM entrypoints have behavior tests for batching,
latest-node selection, cancellation and independent batches. Frozen installation passes, and
both Docker dependency stages copy patches before installing; a Dockerfile regression verifies
that order. There is no global observer override or event suppression in production.

The graph and lineage suites pass with raw resize-loop capture enabled. The observed graph
main-thread maximum is 67 ms against the unchanged 100 ms budget. Broader responsive and container
validation of the reproducible patch is pending. Earlier successful suites do not stand in for
this new dependency state.

## Grouping measurement continuity

The next full gate stopped in the grouping-geometry suite. Its captured state showed all
49 Flights entities visible with eight handles each, but zero rendered edges after changing
grouping. The 4.5 px attachment tolerance and fifteen-second deadline were not changed.

FullGraph layout publication now retains a previous node's measurement only when its ID, type,
width and height are unchanged. New nodes and resized nodes still enter the normal measurement
path. This preserves valid local handle bounds while parent positions and grouping change,
without reusing dimensions for differently sized area boxes. Focused grouping verification
passes with raw resize-error capture enabled. A single guard-removal probe did not reproduce
the intermittent failure, so it is not claimed as a deterministic mutation kill. Ten consecutive
corrected-state grouping suites now pass with raw resize capture enabled and unchanged geometry
limits. A freshly rebuilt container also passes its grouping-validation suite, proving that both
frozen dependency stages apply the observer patch. The complete release gate remains required.

The grouping failure path now captures a screenshot and logs node visibility, handle counts,
edge count, grouping mode and viewport transform. These diagnostics supplement the original
geometry assertion without skipping missing edges or changing limits.

## Final warning audit and pane observer

A complete gate subsequently passed all six steps in 5,435.129 seconds with 1,887 tests and
664/664 mutation targets. Its source fingerprint stayed unchanged. Final log inspection still
found three resize-loop events in the sidebar drag check, whose custom browser context had not
used the strengthened collector. That green gate is retained as historical evidence, not claimed
as warning-free acceptance of the later correction.

All responsive pages now use one error-registration function, including role fixtures, example
pages and the sidebar's persistent context. A diagnostic observer trace reproduced the remaining
three events at the React Flow pane-size observer. The same dependency patch now schedules only
observer-driven pane updates outside resize delivery, disconnects the observer and cancels queued
work even after its DOM ref is cleared. Initial measurements and normal window-resize events stay
synchronous. Both ESM entrypoints have tests for latest-size coalescing, ref-cleared cleanup and
unchanged window-resize behavior; all thirteen observer/collector tests pass.

The complete pointer/keyboard sidebar check and final no-error assertion pass with the collector
active and no instrumentation or exclusions. Temporary observer instrumentation has been removed.
The final complete-gate acceptance below validates this patch with every responsive page covered.

## Final complete-gate acceptance

The final frozen working tree based on `0051d6737e8518c24ee269632ac36ed406850ffb` passes
`bun run ci:validate` with all selectors cleared. The cached suite runner reports exit 0 and
`tree_changed: false`; documentation and the result record were updated only after completion.
All validated code, dependency, Dockerfile and patch hashes are in
[remaining-polish-results.json](remaining-polish-results.json).

| Step | Seconds | Result |
| --- | --- | --- |
| verify | 267.914 | types, formatting, lint, comments, theme/brand checks, 1,893 tests and build passed |
| mutation | 953.832 | 664/664 targets killed; unmodified baselines passed |
| browser | 2,277.762 | all 29 canonical suites passed, including 137 responsive checks |
| image | 94.138 | build, scan and SBOM passed; zero vulnerabilities and secrets |
| container | 1,895.397 | all 25 local suites and 30 server/persistence checks passed |
| pipeline | 3.617 | lint and offline pipeline plans passed |

Total duration: 5,492.660 seconds. Unit tests: 1,893 passed, 0 failed, 129,672 assertions across
267 files. Full-log scans found zero resize-loop events, zero unrecognized SVG-prop warnings and
zero missing-handle warnings. Intentional telemetry error fixtures remain part of their tests;
no real error is filtered to obtain this result. All geometry and responsiveness limits remain
unchanged. The ten consecutive grouping runs and focused container reproductions supplement,
not replace, this final complete run.

All six deferred findings are closed. No required feature, finding or validation remains open.
The release contains source, Dockerfile and pipeline definitions; actual deployment, image upload
and real Azure/Entra acceptance remain outside this work's authorized scope.

## Logs and captures

Focused results are in `/tmp/remaining-polish-graph.log`, `/tmp/remaining-polish-lineage.log`,
`/tmp/remaining-polish-auth.log`, and the capture logs for light and dark themes. Neighborhood
images are in `/tmp/remaining-polish-captures/`; the authentication and RDF suites retain their
standard screenshots under `/tmp/workbench-auth-metric-deprecate-form-*.png` and
`/tmp/workbench-rdf-n3-refused.png`.

Validation used no real workspace data and left existing owner services unchanged. No deployment,
image upload or real Azure/Entra call was performed. The Git release follows verification of the
final frozen-state evidence.
