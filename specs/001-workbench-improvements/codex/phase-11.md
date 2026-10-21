# Codex brief: Phase 11 Mappings layout (T154, T155)

Semantic Workbench (`/home/rodrigo/projetos/semantic-workbench`, branch
`001-workbench-improvements`): React 19 + TypeScript, Bun 1.4, Vite+.

**Hard rules:** do not commit; do not touch `data/`; do not modify tests or browser checks
(`tests/`, `scripts/`) to make them pass; no new dependencies; do not change server code
(`server/`): the runtime context (`GET /api/agent/context`) already has what the view needs.

## Tasks

- **T154** Binding chains, grouping by dataset, separated fields / sources / metrics, side-by-side
  composer in `src/MappingExplorer.tsx` (styles in `src/style.css` or a new
  `src/mapping-explorer.css`).
- **T155** Findings linking to the item editor in `src/MappingExplorer.tsx` (plus the small
  wiring in `src/main.tsx`).

## Requirements (spec)

- **FR-068** Mappings MUST show each binding as a chain (concept → relationship path → field or
  metric → dataset → physical source) with conditions and findings attached.
- **FR-069** Bindings MUST be groupable by dataset and collapsible, with counts; fields, sources
  and metrics MUST be separate labelled elements.
- **FR-070** Findings in Mappings MUST link to the item editor for the offending item.
- User Story 11: in mapped commerce and Flights, select Customer and Airport; every binding is a
  chain with separated elements; the composer stays visible on desktop widths. Concept list,
  evidence and composer are side by side at desktop width; on narrow widths they stack in that
  order.
- Baseline defect 21: in a binding, the field list and "Governed metrics:" are concatenated with
  no separator (`src/MappingExplorer.tsx`). Fix it by the new structure.

## UI contract (keep existing hooks; the browser checks rely on them)

Keep these class names and accessible names exactly: `.mapping-explorer`, `.mapping-heading`,
select "Mapping document", button "Export agent context", `.mapping-layer-chain`,
`.mapping-findings` (the list of findings that do not belong to one binding; absent when there
are none), `.mapping-columns`, `.mapping-concepts` (with input "Find concept", button "All mapped
concepts" and one button per concept whose text starts with the concept name), `.mapping-detail`
whose `h3` is the selected concept (or "All concepts"), `details.mapping-bindings` (the evidence
wrapper; `open` when there are at most 12 bindings, closed otherwise; summary
"<n> resolved bindings · source evidence"), one `article.mapping-binding` per binding (all
bindings stay in the DOM even when a group is collapsed), `.mapping-query` (the composer with
checkboxes "Metric <name>" and "Dimension <dataset>.<field>", button "Preview governed query",
`pre` labelled "Governed SQL preview").

New structure:
- Inside `details.mapping-bindings`, bindings are grouped by dataset: one
  `details.mapping-group` per dataset (attribute `data-dataset="<name>"`), summary text
  `<dataset> · <n> binding(s)` and the dataset's physical source; bindings that reach only
  metrics go in a group "Metrics" (`data-dataset=""`). A binding that reads fields of several
  datasets is listed in the group of its first field's dataset. Groups are open by default;
  closing one hides its bindings.
- Each `article.mapping-binding` has `role="group"` and `aria-label="Binding <rootConcept>"` and
  shows a left-to-right chain (wrapping on narrow widths) of separate step elements, each with
  attribute `data-step` and a small visible label (class `step-label`): `concept` ("Concept",
  the root concept), one `relationship` step per relationship in `b.relationships`
  ("Relationship"), the target `concept` when it differs from the root, then one `field` step
  per field ("Field", `<dataset>.<field>`), one `metric` step per metric ("Metric"), and for
  field bindings the `dataset` ("Dataset") and `source` ("Physical source", the dataset's
  `source`) steps. Arrows between steps are decorative (`aria-hidden`). The mapping expression
  (`b.expression`) stays visible as code. A conditional binding shows a `.mapping-condition`
  note inside the article (keep the existing sentence "Conditional population mapping. Review
  its meaning before composing a query."). Keep the evidence line (filename · revision · path)
  and the "Mapping evidence" details.
- **Findings**: a finding belongs to a binding when its `evidence.documentId` equals the
  binding's and one of the two `evidence.path`s is a prefix of the other: the finding's path starts with the binding's `evidence.path` (or the binding's path starts with the finding's); such
  findings are shown inside that binding (`.mapping-binding-finding`). The others stay in
  `.mapping-findings`. Every finding with a non-empty `evidence.path` has a button **Edit item**
  that opens the item editor for that document and path (the deepest prefix of the path that is
  an editable item: use `itemKindAt` from `src/edit/item-model.ts` on the parsed document), and
  falls back to opening Source at the item's line when no prefix is editable. Add an optional
  prop `onEditItem(docId: string, path: (string|number)[])` to `MappingExplorer`; in
  `src/main.tsx` implement it with the existing `setEditing({docId,path,kind})` (open the
  document first if it is not the current one) and `openSourceAt` fallback.
- **Layout**: at ≥ 1100 px the three parts sit side by side: concepts (left, ~240 px), evidence
  (middle, flexible), composer (right, ~360 px, `position: sticky` so it stays visible while the
  evidence scrolls). Below 1100 px they stack in the order concepts, evidence, composer. No
  horizontal page scroll at 390 px (chains wrap).

## Constitution rules that matter

- Nothing executes: the SQL preview stays labelled "not executed".
- Derived views never rewrite documents; the item editor writes through its own Save.
- Honest labels: the grouping by dataset is a view choice.

## Polish findings to respect

Do not add anything to the sidebar; do not add status toasts.

## Tests that must pass

- `bun --bun run check`, `bun --bun run build`, `bun test`.
- `bun run test:examples:ui` (includes the new mapping chain assertions written for this task),
  `bun run test:ui` (mapped commerce checks), `bun run test:responsive` (resize sweep includes
  Mappings), `bun run test:item-edit`. They need the Vite dev server on 127.0.0.1:5173 (it may
  already be running; otherwise `bun node_modules/vite/dist/vite/node/cli.js dev --host
  127.0.0.1 --strictPort` in the background). If the sandbox prevents the dev server or
  Chromium, say so and report what you could run.

Final message: files changed, what you ran with results, and anything you were unsure about.
