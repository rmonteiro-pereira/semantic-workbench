# Quickstart: verifying v0.3.0 (002-lineage-and-ux)

Everything runs on an isolated data root; nothing touches `data/`.

```sh
bun install
bun test
bun --bun run check
bun --bun run build
bun run dev            # separate terminal; checks below use their own temporary API
```

## 1. Lineage graph (Stories 1, 10)

```sh
bun run test:lineage
```

By hand: load **UBL business model**, open `ubl.odcs.yaml`, open **Graph**.

1. **Find assets** → `invoice_line`: centered card, one foreign-key step each way, fields and
   metrics to the right, legend visible, PK/FK badges on rows, pager on long cards.
2. Click a column: its path is emphasised, everything else dimmed, **Selected path** lists it.
3. **Expand** a frontier card: new cards appear beside it; nothing already placed moves.
   **Undo expansion** restores the earlier canvas.
4. **Full pierce** (Both): the whole path to metrics opens; on a large closure the banner reads
   "N more reachable" with **Expand further**.
5. **Walk here** on `invoice`: trail, Back, Forward.

Neighborhood: open `ubl.ontology.yaml`, center `Order`, expand `OrderLine`, then `Item`, then
**Full pierce** (Outgoing) from `Lease` in the shopping center ontology.

## 1b. Concept-mapping graph (Story 11)

```sh
bun run test:mapping-graph
```

Open `commerce.mapping.yaml` (mapped commerce) in **Graph**: concept cards left, dataset cards
with field rows right, lines per object/referent/link mapping, shared legend. Select `Customer`:
its mappings are emphasised. Tick **Unmapped only**. Open Flights `flights.yaml`: the same graph
for the embedded mappings, with **Ontology graph** to switch.

## 2. Save and commit (Story 3)

```sh
bun run test:autosave
bun run test:editor      # typing latency with autosave on, 1.9 MB file
```

By hand: edit a description in Source, wait 1 s: indicator "Saved to file · 1 uncommitted
change"; `git -C <project> diff` shows only that line. Break the YAML: "Not saved: 1 error",
the file is unchanged. **Commit…** → tick, message, **Commit**. Import two files into an
existing project: `git log -1` shows "Import 2 files" with only those paths.

## 3. SQL in definitions (Story 4)

```sh
bun test tests/sql-lint.test.ts
bun run test:sql
```

Open `tests/fixtures/sql/case-when.ossie.yaml` in Source: SQL keywords colored, no finding.
Remove `END`: a warning at the `)` of the `SUM(CASE …` line within 500 ms; Save state still
"Saved to file" (warnings never block). Export: bytes equal the file.

## 4. Git setup, clone and monorepo (Stories 7, 8)

```sh
bun run test:git-setup   # identity, remote, clone from a local bare repository, credential guide
bun run test:monorepo    # manifest, detection + confirm, shared Source Control, remove/delete
```

No network remote is used; fixtures create bare repositories in the temporary root.

## 5. UI, terminology, Group by, Mappings (Stories 2, 5, 6, 9)

```sh
bun run test:responsive      # sidebar resize, dialogs, no clipped text, six viewports
bun run test:dialogs         # every dialog of spec Appendix B: focus trap, Escape, fits window
bun run test:terminology     # no "KPI" in rendered UI or README
bun run test:grouping-validation
bun run test:mappings-layout # synthetic 80-character identifiers, zero overflow
bun run test:mutation
```
