# Evidence: where the implementation departs from the plan

This page records what the code showed while the tasks were implemented. The decisions of the spec
stand; nothing below reopens one.

## Departures from plan.md

| Area | Plan | Done | Why |
| --- | --- | --- | --- |
| Shutdown flush | `src/server/index.ts` untouched, closed through the workspace | `createHandler` returns the recorder as `handler.usage`; `index.ts` passes `config.usage` and calls `handler?.usage.close()` before the workspace closes | The workspace owns no hook for closing something created by the handler; two lines in `index.ts` were smaller than a hook in `workspace.ts` |
| Boundary options | `operation-boundary.ts` and `handler.ts` only | `HandlerOptions` in `src/server/auth/middleware.ts` gained `usage` and `usageSettings`, and the middleware passes the recorder to the boundary and returns it | The options type and the boundary construction live in `middleware.ts` |
| Hook content | one call after the response | the call is wrapped in `try` and logs `usage.record-failed` | A recorder that throws must not change an answer |
| Counted-table test | compares `contracts/counted-operations.md` | compares `docs/usage-counters.md` | Tests must not read files under `specs/` |
| Fixtures | answers stored under `tests/fixtures/usage/` | answers are built at test time from the commerce example (`tests/usage/commerce-answers.ts`); `tests/fixtures/usage/` holds only the two structure baselines | The real runtime produces the answer, so a fixture cannot drift from it; the commerce example is the smallest with ontology, mappings and a semantic model |
| Read answer | `contracts/usage-read-api.md` has no `other` | optional `otherTotal` on a series, present only when the reader may read every file of the published snapshot | FR-018 stores the excess; FR-027 forbids it for a partially readable project |
| Item rules | context items are the mapping, concepts, relationships, models, datasets, fields, metrics | the same; a binding contributes its concept, its root concept and relationships that resolve to exactly one definition. Mapping nodes without a name are positional and skipped | `addressAtModelPath` gives positional addresses to unnamed nodes, which FR-008 skips |
| Interface scope | the graph components receive project and model as props | the store learns project, file and model from `useTrafficScope` calls in `GraphViews`, `DetailsPanel` and `WorkspaceCanvas`; `src/app/main.tsx` is untouched | Graph models hold addresses relative to their file, and the three components already know `current` |
| Intensity marks | class on the card | an absolutely positioned ring, bar and screen-reader text inside the card, drawn with `<i>` elements | The neighborhood card styles every `span` as a line of text, so spans made the card overflow |
| Legend | text under the graph | a `<details>` whose summary is the one-line legend | At 360 px the full legend took the canvas below 55 percent of the screen |
| Admin Settings | status from the read answer's `counters` | the page asks for the usage answer of the first project | The read operation is per project; counters are the same for every project. With no project the page says so |
| Mutation harness | `--only usage` assumed to exist | `scripts/mutation-tests.ts` gained `--only <prefix>`, a block that filters the mutants and ends the run after them | The harness had no filter |
| Benchmark | `scripts/boundary-benchmark.ts` with counted requests | `scripts/usage-benchmark.ts` | The benchmark requests `/api/projects`, which is not counted |

## Behaviour worth knowing

- With Traffic off, the only difference from the code before this feature is the Traffic switch in the
  graph options. `tests/fixtures/usage/dom-baseline.json` was recorded from the source of the base commit
  and `bun run test:usage-traffic` compares it with the switch removed; `entity-node-baseline.html` was
  rendered from the base `FullGraphNodes.tsx`.
- A rename in the 30 seconds before a flush may leave those few counts under the old address, because
  memory holds addresses as they were when counted.
- Counting a project deleted to the trash before its memory is flushed can recreate its folder under
  `state/usage/`. The folder holds counts only and ages out with the retention.
- Restoring a trashed project under another name starts without counts, because the addresses name the
  old project.
- The browser check compares cut text with the screen before Traffic is switched on, because the Zoom
  to group select of the full graph toolbar already cuts "Whole model" at some widths without Traffic.
- Edges of kinds other than ontology relationships (inheritance, joins, metric references) show no
  traffic: their address is that of their source or has no counted item.

## Not done here

- T035 (screenshots through Codex) is left for the batch.
- T042: feature 006 is not on this branch, so the MCP twin case stays a twin caller; see
  `checklists/analysis.md`.
