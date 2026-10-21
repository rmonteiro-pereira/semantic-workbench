# Quickstart: Validating Workbench Improvements

End-to-end checks per delivery phase ([plan.md](./plan.md#delivery-phases)). Contracts:
[http-api.md](./contracts/http-api.md), [sse-events.md](./contracts/sse-events.md),
[ui-contracts.md](./contracts/ui-contracts.md). Entities: [data-model.md](./data-model.md).

## Prerequisites

- Bun 1.4+, Git 2.40+ with `user.name` and `user.email` configured, Playwright Chromium
  (`bun node_modules/@playwright/test/cli.js install chromium`).
- `bun install`.
- Use an isolated data root for every check below:
  `export DATA_DIR=$(mktemp -d)` (the API reads `DATA_DIR`, default `data/`).

## Always (every phase)

```sh
bun test
bun --bun run check
bun --bun run build
DATA_DIR=$(mktemp -d) bun run dev &      # isolated workspace
bun run test:ui && bun run test:responsive && bun run test:edges \
  && bun run test:grouping-validation && bun run test:examples:ui
bun run test:mutation                      # every mutant detected
```

## Phase 1: folder projects, migration, live refresh

1. Copy a v0.1.0 `workbench.sqlite` into `$DATA_DIR/` and start the API. Expected: a backup appears
   in `$DATA_DIR/backup/`, one folder per example set plus "Ungrouped" under
   `$DATA_DIR/projects/`, each with one commit; `sha256sum` of each file equals the stored source;
   `legacy-ids.json` maps every old id.
2. Open the UI: sidebar shows projects with their files; every old document opens.
3. Edit a file in a terminal (`printf '\n# note\n' >> $DATA_DIR/projects/<slug>/<file>`): the open
   tab updates within 2 s (SC-017).
4. Delete `$DATA_DIR/cache.sqlite` and restart: same projects, files, view settings, drafts
   (SC-015).
5. Open a file in two tabs, save in tab A, then save in tab B: tab B gets a stale-save diff.

## Phase 2: delete, undo, trash, Clear, suggestions

1. Import the four Flights files in one batch → one project "Flights".
2. Delete one file → confirmation lists it; Undo within 10 s restores it; delete again; after 10 s
   it is in Trash; Restore puts it back; Source Control shows the deletion/restoration as changes.
3. Delete the project; Clear the workspace; restore one project from Trash. No reload at any point
   (SC-005, SC-006).
4. Import `flights.mapping.yaml` alone into a new batch after removing it from "Flights": a
   suggestion with evidence (`ontology_ref` name) offers "Flights".

## Phase 3: Ossie layouts and metrics (read side)

1. Load Ossie Flights split set and `flights.yaml` as separate projects: identical concept,
   dataset, join, metric and 60 binding counts (SC-007).
2. Open the shopping center project → Metrics: 25 KPIs; open `occupancy_rate` → "How it is
   calculated" shows ratio tree (occupied_gla / total_gla), inputs to ODCS properties, additivity
   text, SQL preview labelled "Preview · not executed"; requesting a sum over months is refused.
3. Confirm no SQL is executed: the API process opens no database other than its cache (checked by
   the browser test's API fixture asserting no calls to an execution path; the planner remains
   preview-only).

## Phase 4: neighborhood walk

UBL → center Order → step five relationships → Back five times: correct hidden-neighbor counts at
each step, no empty-state flash, no overlapping edges (SC-008; `bun scripts/graph-browser-check.ts`
extended).

## Phase 5: source editor

Open one file per serialization: token colors; type an error → inline marker within 500 ms
(SC-009); fix → marker clears; edit one line of a CRLF fixture → saved bytes differ only on that
line (`cmp`).

## Phase 6: item editing, add/delete, KPI wizard (YAML/JSON)

Edit a concept in UBL ontology and a property in `commerce.odcs.yaml`: `git diff` shows only the
item; create a ratio KPI via the wizard (SC-002) → diff shows one metric and its extension block.

## Phase 7: RDF item editing

Edit one resource in each of Turtle, N-Triples, N3, RDF/XML: graph isomorphism check passes
(parsed graph = original − removed + added) and text outside the statements is identical (SC-010).

## Phase 8: Source Control

Commit, create branch, switch, push to a local bare remote (`git init --bare $(mktemp -d)`), pull a
commit made elsewhere, produce a conflict and repair it; add a file to `.gitignore` from the
panel; a hidden-type file change is listed read-only (SC-012). With `PATH` lacking git: banner
explains, editing still works.

## Phase 9: ODCS dataset pages

`commerce.odcs.yaml` and `ubl.odcs.yaml`: property tables complete (SC-011); lineage from `orders`
reaches sales metrics; after two commits, History shows property-level changes.

## Phases 10–12: layout, Mappings, polish (Codex)

`bun run test:responsive` at six viewports plus resize sweep: zero overlaps, no horizontal scroll,
full screen enter/exit keeps view state (SC-013); Mappings chains render for mapped commerce and
Flights.
