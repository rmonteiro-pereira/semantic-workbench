# Evidence: Loose Ends

## Open tasks on `main` at 4efb44e2 (2026-11-26)

37 open tasks in specs 003, 006 and 012 to 019, plus the four 007 label follow-ups in
`specs/007-ui-review-fixes/evidence/GATE.md`. Each one is still open in substance unless noted.

| Source | Task | State on `main` | Closed by |
| --- | --- | --- | --- |
| 003 | OA-1, OA-2, OA-3 | Owner actions on the trial Azure DevOps organisation, the real Entra tenant and the Azure Repos mirror | The owner |
| 006 | T013 | Superseded by 010's `src/server/auth/replay-sample.ts` | T018, disposition |
| 006 | T035 | Superseded: 008 is merged, the tools register unconditionally | T018, disposition |
| 006 | T065 | Reference client done; the Codex CLI run is missing | T010 |
| 012 | T041 | Capture never ran | T011 |
| 012 | T042, T045 | Batch-gate hand-off | T014 to T017 |
| 013 | T037 | Capture never ran | T011 |
| 013 | T039 | Codex CLI against a test server is missing | T010 |
| 013 | T044 | Batch-gate hand-off | T017 |
| 014 | T035 | Capture never ran | T011 |
| 015 | T037 | Capture never ran | T011 |
| 015 | T044 | Batch-gate hand-off | T017 |
| 016 | T030 | Capture never ran | T011 |
| 016 | T033 | The docs do not mention agent context or the status flag; no tool test | T008 |
| 017 | T005 | Done in substance (`isAttribute`) | T001, ticked |
| 017 | T035 | Capture never ran | T011 |
| 018 | T045 | `tests/mesh/importer-visibility.test.ts` is missing | T007 |
| 018 | T053 | Capture never ran | T011 |
| 018 | T054 | Waits for T053 | T012 |
| 018 | T061 | The note was never turned into documentation | T009 |
| 019 | T015, T020 | Captures never ran | T011 |
| 019 | T025, T028 to T033 | Wait for Ossie 0.3.0; done against a pinned 0.3.0.dev0 as a draft base | T019 |
| 019 | T026, T027 | Need the released schemas and a non-draft base | Stay open until the release |
| 019 | T036, T039 | Inventory check and 0.3.0 status record | T019 |
| 019 | T040 | Batch-gate hand-off | T017 |
| 007 | four label follow-ups | Open in `GATE.md` | T003 to T006 |

## Upstream Ossie on 2026-11-26

`gh api repos/apache/ossie/releases` returns nothing, and `gh api repos/apache/ossie/tags` returns only
`osi-0.1.1-rc1`. `core-spec/spec.yaml` on upstream `main` declares `version: 0.3.0.dev0`, marked as a draft
that may change before 0.3.0 is released.

## Capture findings recorded for the owner (feature 022)

From the shared capture review of features 012 to 019:

- 014, usage overlay on the graph: at 360 px wide the graph labels break mid-word, and at 768 px they render at
  about 5 px. Long names are cramped, and the neighbourhood group is shown by colour alone. A fix touches the
  graph's label layout and its locked 9 px label floor, so it belongs in a graph change with its own comparison.
