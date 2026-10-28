# Changelog

Source release tags identify the versions below. Image build metadata and approved Azure delivery
also require a matching package version in the target release checkout; a source tag alone does
not configure a production deployment.

## Unreleased

### Added

- Admin has a **Git remotes** section that lists every project with its remote address, or "No
  remote", and offers **Set remote…** and **Remove remote** for each. In Source control, **Remote…**
  now appears only for Admins; everyone else still sees the address and Fetch, Pull and Push.
  Setting or removing a remote already required Admin on the server, and a test now covers it.
- Back and Forward now undo and redo every action a click caused, not only a change of file or
  walk. The browser buttons, the mouse buttons and the Neighborhood and lineage arrows share one
  list of actions: files, tabs, selections, centres and expansions, graph switches, opened areas,
  groups and bundled lines, layout and grouping choices, Mappings concepts and **Show more**, and
  metric selection. Typing and deletions are not undone by Back.

### Changed

- The sidebar starts with one **Add project** button whose menu holds **Import files**, **Clone a
  repository** and **Load an example**. Its footer is now **Trash** and **Settings**, a row like the
  navigation above it. **Settings** opens a panel with **Theme**, **Clear workspace** and **Admin**,
  so the Theme control, the Examples and Import buttons and the header's **Admin** button are gone.
  The examples drop their "Load" prefix, as they now sit under **Load an example**.
- Show the header on a phone (up to 650 px wide) as one row: the menu button, the title, a dot
  for the save state, **Commit…** as an icon and **More actions**. **More actions** opens a menu
  with **New** and **Export**; **Admin** is under **Settings**. A save that needs action keeps its
  words beside the dot. Wider windows are unchanged.
- Show the metric filters (Group by, Type, Status, Owner, Governed only) beside the search box
  again instead of behind a Filters dialog, and show a metric's Rules and SQL preview open in its
  detail instead of closed behind Show.
- Show the remote address and **Remote…** in Source control again, so the remote form is one click
  away, and keep the model tabs and **Find an entity** above Source control. **Fetch**, **Pull**,
  **Push** and **Sync** are buttons under the remote line again; **Sync…** remains only on a server,
  for Pull, Publish and Push of the published branch.
- Show graph options in the graph toolbar instead of a View options dialog. Layout is a
  Layered / Network switch, and Labels, Value types, Metrics, Mini-map and the other switches keep
  a fixed name with a check mark when on. The Neighborhood **Re-center** button, which puts nodes
  back in their columns, is now **Re-arrange**.
- Open the sidebar Examples menu as a flyout against the right side of its button, level with it,
  with the button's arrow pointing at it, on windows wider than a phone; it keeps opening upward
  on a phone.
- Suggested graph areas join small communities into larger ones, level by level, as the Louvain
  method does, and entities with no relationships are grouped by type instead of getting an area
  each. The mall semantic model now opens with 11 areas instead of 48.
- Show a semantic dataset that copies an ODCS table column for column as that table's card, with
  a Semantic dataset badge beside its type, instead of a second card joined to it line by line.

### Fixed

- The UBL example opens without a "Basic checks only" warning: its ontology declares its Ossie
  version and gets the full schema checks. Its mapping now maps all 45 components to their datasets
  and all 277 roles to their keys or bridge tables, instead of mapping no concept. The commerce
  workspace's sales mapping maps Customer, Order, OrderLine and Product to the sales tables.
- **Mappings** lists only the open project's mapping documents, and says when the project has
  none, instead of offering every project's mappings.
- **Load an example** opens the examples beside the **Add project** menu again, by pointer or with
  the right arrow key; on a phone they replace the menu under **Back**. **Settings** shows the
  theme as one control without a focus ring after a click, stays inside the phone drawer, and lines
  Trash and Settings up with the navigation above.
- The ODCS graph no longer hides cards behind a "N of M cards shown · Show all" control. Every
  card is laid out, the first view frames the nearest cards at a readable size, and expanding an
  "N more tables" card lays out all of its members.
- ODCS property rows edit the logical type and the Required, Unique and Primary key flags in the
  table again, with physical type and tags in columns of their own; **Edit** keeps the rest.
- The ODCS Contract page shows team and roles on the page again instead of behind a count button.
- The graph no longer loses its position and background when Admin opens while the graph is
  refitting to a new size.
- Catalog cards show an entity's whole name again, wrapping long names such as
  CommodityClassification between their words instead of cutting them with an ellipsis.
- Open the whole-model graph on every entity by name in the Network layout, as before, instead of
  one counted card per area; only models above 250 entities start folded. Idle lines are faint
  again.
- Keep neighborhood cards whole when zoomed out: type, description, metric count and the full name
  stay, and **Labels** on shows every relationship name at any zoom. A phone opens with twelve
  neighbors again.
- Keep the Graph toolbar on one row at 1280 px, with **Re-layout** as an icon, so the graph keeps
  its height. On a phone the Controls panel closes when the details sheet opens.
- A neighborhood expansion no longer leaves cards unmeasured, which could keep the view from
  fitting.
- Lineage lines can be clicked: a single line selects its relationship, a bundled line splits
  into its lines, and a line to a counted card opens it.
- A lineage card that shows more columns stays in view where it was, instead of leaving the
  view, and the view pans so the whole card shows, or its top when it is taller than the canvas.
- Clicking a bundled line to a counted card keeps the card at its other end on screen, so the
  canvas is never left empty.
- Keep the Graph toolbar of the ontology and of an ODCS contract on one row at 1280 px with the
  mall example: the area zoom is a narrower select marked by an icon, and the ODCS toolbar spaces
  its controls more tightly.
- Keep the Mappings tab at a normal height: the concept list and the bindings scroll on their own,
  each dataset group shows its first five bindings with Show more and Show fewer, and a long
  concept list does the same. The tab opens on a mapping of the open file's project.
- Keep the whole sidebar footer, including the Theme control, visible at short window heights; the
  project list shrinks and scrolls instead.
- Stop the project list from shrinking to a single row after loading several examples, and keep it
  stable after deleting a file or a project.

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
