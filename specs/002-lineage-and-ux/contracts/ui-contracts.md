# UI Contracts: v0.3.0

Accessible names and roles the browser checks rely on. Base:
[001 UI contracts](../../001-workbench-improvements/contracts/ui-contracts.md); names there
containing "KPI" are renamed as listed below.

## Header and status

- Sidebar toggle (desktop): button `Hide sidebar` / `Show sidebar`, `aria-expanded`, panel icon.
  Drawer close button `Close workspace drawer` exists only below 1100 px.
- `New` menu button (`aria-haspopup="menu"`), items `Add <kind>…`; disabled items carry the
  reason in `aria-description`.
- Primary button `Commit…`; status `role="status"` named `Save state` with texts `Saving…`,
  `Saved to file · N uncommitted changes`, `Not saved: N errors`, `Not saved: file changed on
  disk`; activating it opens `Commit` or `Validation details`.
- Overflow menu `More actions` holds `Export`.

## Dialogs (all `role="dialog"`, `aria-modal`, labelled by their title, Escape closes, focus returns)

`Commit`, `Validation details`, `Import`, `Add <kind>`, `Grouping suggestions`, `Adjust grouping`,
`Remote`, `Clone repository`, `Set Git identity`, `Credential setup guide`, `Projects in this
repository`, `Compose a query`, `View definition`, `Lineage options`, plus the v0.2.0 dialogs.

Commit dialog: list `Changed files` (checkbox per file named by path), region `Diff of <path>`,
textbox `Commit message`, buttons `Commit`, `Commit & push`, `Revert <path> to last commit`.

## Sidebar

- Separator `Resize sidebar`, `aria-orientation="vertical"`, `aria-valuemin=220`,
  `aria-valuemax=520`, `aria-valuenow`; arrows ±16 px, Home/End.
- Group `Examples` (`<details>`), collapsed when projects exist.
- Button `N grouping suggestions` opens `Grouping suggestions`.
- Tree rows: accessible name = full file or project name; visible text never clipped without a
  `title`.

## Lineage canvas (Graph tab, ODCS)

- Region `Lineage graph`; search combobox `Find assets` with listbox `Asset results`.
- Card: `role="group"`, name `<kind> <label>` (for example `Contract object orders`); header
  buttons `Walk here`, `Expand <label>`, `Collapse <label>`, `Open asset page`.
- Column row: button named `<card label>.<column>`, `aria-pressed` when selected; badges as
  text `PK`, `FK`, `Required`, `Unique`, classification value.
- Pager: navigation `Columns of <label>`, buttons `Page N`.
- Toolbar: `Steps` select (1–5), `Full pierce`, direction radio group `Pierce direction`
  (`Outgoing`, `Incoming`, `Both`), `Stop`, `Undo expansion`, `Fit`, `Full screen`, `Lineage
  options…`.
- Banner `role="status"`: `N more reachable` with `Expand further`.
- Legend list `Legend` (shared component): `Contract object`, `Semantic dataset`, `Field`,
  `Metric`, `Foreign key`, `Feeds`.
- Path summary region `Selected path`.
- Edge DOM carries `data-edge-kind` (`foreign-key`, `reads`, `aggregates`, `uses`,
  `transform`) and `data-on-path` for checks.

## Neighborhood (pierce)

- Node buttons `Expand <name>`, `Collapse <name>`; existing `Walk to <name>` kept.
- Toolbar `Full pierce`, `Pierce direction`, `Stop`, `Undo expansion`; trail items for
  expansions read `expanded <name>`.

## Asset page (Contract tab)

Tablist `Asset views`: `Lineage`, `Relationships`, `Data Quality`, `Properties`, `History`.
Overview rows: buttons `Open <name> in lineage`, `Open <name>`.

## Metrics

Tab `Metrics`; button `New metric`; filter checkbox `Governed only`; explanation heading `How
this metric is calculated`; button `Add attributes` on non-governed metrics; wizard dialog
`New metric`.

## Mappings

Button `Compose a query…`; concept buttons read `N binding`/`N bindings`.
