# Analysis: Usage Counters

Read-only consistency analysis of spec.md, plan.md, tasks.md, research.md, data-model.md and the
contracts, followed by fixes. Done once, 2026-11-17.

## Coverage

Every FR maps to at least one task (tasks.md traceability and the Proof lines). Checked individually:
FR-001 T001, T012; FR-002 to FR-009 T003, T008, T009; FR-010 to FR-013 T007, T011; FR-014 T005; FR-015
T001, T015; FR-016 T016; FR-017 T010, T013; FR-018 T007; FR-019 T008, T009; FR-020 T016; FR-021 to
FR-024 T004, T014, T017, T018; FR-025 to FR-030 T020 to T024; FR-031 to FR-040 T025 to T035, T033;
FR-041, FR-042 T036, T037; FR-043 T041; FR-044 T012. Every SC has a task (SC-011 T040, SC-007 T034 and the
batch comparison).

## Findings and fixes

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | FR-044 said "headers except none", a leftover phrase | low | reworded to "status, headers and body" |
| 2 | FR-031 said "remembered per person" but the existing options are remembered in the browser | medium | reworded to "in the browser like the other graph options" |
| 3 | plan.md named T047 for the 006 documentation note; the task is T042 | low | plan reference corrected |
| 4 | T039 was garbled and named a file it did not change | medium | rewritten to update `docs/development.md` |
| 5 | FR-016 (deleting the store loses only counts) had no task | medium | added to the T016 proof |
| 6 | The spec's Dependencies section named a source path | low | reworded without a path |
| 7 | data-model names origin `acp` which does not exist on this base | low | already stated as "exists once the agent panel adds it"; T009 uses a synthetic origin |
| 8 | Contract `usage-read-api.md` omits `other` from the answer although FR-018 stores it | low | intentional: `other` is internal and dropped for partially readable projects (research R6); stated there |
| 9 | Plan says the benchmark file `scripts/boundary-benchmark.ts` exists | verified | exists on this base |
| 10 | Existing paths used in plan and tasks were checked with ls and grep: operation-boundary.ts, route-actions.ts, address-migrations.ts, trash.ts, trash-restore.ts, address-key-stores.ts, GraphOptions.tsx, hidden-kinds.ts, LineageLegend.tsx, legend.css, EntityDetails.tsx, RelationshipDetails.tsx, CatalogView.tsx, MetricsPanel.tsx, SettingsSection.tsx | verified | none needed; `useNeighborhoodNodes.ts`, `NeighborhoodToolbar.tsx`, `CompactControls.tsx` exist in `src/app/graph/` |

## Remaining open points (for the implementer, not blockers)

- T003 needs the exact answer shapes of plan and explain; the item rules in
  `contracts/counted-operations.md` are written from the context answer type and the route names. The
  first task step is to record one real answer of each as a fixture and adjust the rules table if an
  answer names items differently.
- No existing test lists the layout folders, so T006 adds `tests/usage/usage-layout.test.ts`.
- T040 (5,000 counted agent context requests in process, on the dev server): counters off median 12.73 ms, p95 18.01 ms; counters on median 12.85 ms, p95 18.71 ms; the median grows 0.9 percent, under the 5 percent limit. Run with `bun scripts/usage-benchmark.ts`.
- T042 pending: feature 006 is not on this branch. After both merge, list `get_mapping_context`, `plan_query` and `explain_metric` as counted tools in docs/mcp-contract.md and switch the twin-caller parity case in tests/auth/usage-read-parity.test.ts to the live tool.
- Hand-off for the batch gate: suite `bun run test:usage-traffic`, tests under `tests/usage/`, `tests/auth/usage-read-parity.test.ts`, `tests/address-key-inventory.test.ts`, mutant group `bun scripts/mutation-tests.ts --only usage`. UI regression journey screens affected: full graph, neighborhood, details panel, Catalog, Metrics, Admin Settings. Screenshots (T035) are left for Codex. The architecture reviewer should look at the boundary hook, the recorder creation in handler.ts and the departures in evidence.md.
