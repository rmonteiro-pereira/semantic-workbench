# Changelog

Source release tags identify the versions below. Image build metadata and approved Azure delivery
also require a matching package version in the target release checkout; a source tag alone does
not configure a production deployment.

## Unreleased

### Changed

- Open the sidebar Examples menu as a flyout to the right of the sidebar, level with its button,
  on windows wider than a phone; it keeps opening upward on a phone.

### Documentation

- Explain the architecture, full technology stack and definition-to-preview flow in the README.
- Provide task-oriented user, server, configuration and development guides.
- Consolidate repeated setup/behavior explanations and separate release evidence from current use.

## v0.5.1 — 2026-10-25

### Fixed

- Keep sidebar lists on complete rows when opening, resizing and scrolling, including at the end.
- Wrap long neighborhood identifiers at natural boundaries instead of leaving short suffixes.
- Keep the deprecation reason readable and its actions together on phone-sized screens.
- Use operation-neutral recovery guidance and correct singular/plural validation labels.
- Show an RDF refusal once while preserving its Source action and distinct errors.
- Preserve compatible graph measurements when regrouping and invalidate changed lineage ports.
- Keep internal graph metadata out of SVG elements.
- Apply a reproducible, pinned React Flow ESM patch to schedule observer-driven node and pane
  measurements outside resize delivery, with cleanup of queued work on unmount.
- Make unsaved-draft and example-load verification wait for the intended application state.

### Verified

The frozen complete gate passed 1,893 tests, 664 mutation targets and all six stages, including
browser/container checks and image scanning. Its complete log contains no resize-loop,
unrecognized SVG-prop or missing-handle warnings. These counts describe that release, not later
revisions. See [the recorded results](specs/004-ui-polish/remaining-polish-results.json).

## v0.5.0 — 2026-10-24

### Added and improved

- Broader responsive/light/dark UI coverage and shared readable dialogs, menus and wizard steps.
- Improved graph, neighborhood, contract and column-level lineage presentation and navigation.
- Full-page access administration with section navigation and reviewed confirmations.
- Governed metrics, bindings and contract lineage across every metric-bearing example.
- Project ZIP export with an optional permitted Git-history bundle.
- Repository-folder clone and sparse-checkout workflows, with reviewed local folder moves.
- Startup-loaded brand bundles for product name, logos, favicon and theme-token overrides.
- Structured operational logging and opt-in server-only OpenTelemetry/Azure Monitor reporting.

The application remains a definition editor and planner: no metric preview or warehouse query is
executed. Earlier specification and audit records remain under `specs/`; the v0.5.1 follow-up
closes the minor findings retained in the original v0.5.0 release.
