# Tasks: Loose Ends

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

Format: `- [ ] ID [Source] Description. Proof: what shows it works.` Every code task ends with its own
targeted test green and the formatter applied. No task edits an existing test only to make it pass.

## Phase 1: Dispositions

- [x] T001 [017 T005] Tick 017 T005 with a disposition line naming `isAttribute` in
  `src/shared/attributes/attribute-rule.ts` and `tests/item-diff/attribute-kind.test.ts`. Proof: the test
  passes on this branch.
- [x] T002 Re-read every source task named in the spec against `main` and correct this list if one is
  already done. Proof: a one-line note per source task in `evidence.md`.
  Done: `evidence.md` lists all 37 open tasks on `main` 4efb44e2 with their package.
- [x] T018 [006 T013, T035] Tick both with a disposition naming the code and test that supersede them. Proof: the
  tests named pass on this branch.
  Done: `bun test ./tests/auth/dry-run-strata.test.ts` 3 pass; `bun test ./tests/mcp/published-only.test.ts` 3 pass.

## Phase 2: Collapsed Network labels (007 follow-ups)

- [x] T003 Ignore a label-route report after unmount in `src/app/graph/useFullGraphEdges.ts`. Proof: a test
  reports after unmount and sees no state change and no scheduled frame.
  Proof: `sw-midgard-run -- bun test ./tests/label-route.test.ts` — exit 0, 5 pass; `bun --bun run check` — exit 0; `bun x oxfmt` on changed files — exit 0.
- [x] T004 StrictMode remount test: report a route, remount under StrictMode, expect one measurement.
  Proof: `sw-midgard-run -- bun test ./tests/label-route.test.ts` — exit 0, 6 pass, one measurement after StrictMode cleanup/setup; `bun --bun run check` — exit 0; `bun x oxfmt tests/label-route.test.ts tests/harness/label-route-harness.tsx` — exit 0.
- [x] T005 Decide edge visibility against the painted curve, in the label placement module. Proof: unit
  cases for a curve inside, outside, grazing an edge with both ends off screen, and a chord-only crossing;
  `test:graph` shows the same counts as `main` on the UBL and Mall collapsed Network states.
  Proof: `sw-midgard-run -- bun test ./tests/label-route.test.ts ./tests/label-placement.test.ts ./tests/edge-labels.test.ts` — exit 0, 31 pass; `bun --bun run check` and `bun x oxfmt` — exit 0; `sw-midgard-run -- bun run test:graph` — exit 1 at the inherited height assertion (458.609375 < 480; main reference 409); 16 openings pass; label counts not printed.
  Still to prove: the UBL and Mall collapsed Network label counts against `main`, in the T015 whole-journey comparison.
- [x] T006 Shorten `useFullGraphEdges` (pass the input object through, extract the appearance builder) with
  no change in output. Proof: the existing label and edge tests pass unchanged; every function in the file
  is about 40 lines or less.
  Proof: `sw-midgard-run -- bun test ./tests/label-route.test.ts ./tests/label-placement.test.ts ./tests/edge-labels.test.ts` — exit 0, 31 pass unchanged; `bun --bun run check` and `bun x oxfmt src/app/graph/useFullGraphEdges.ts` — exit 0; TypeScript AST function spans — maximum 40 lines.

## Phase 3: Code and documentation tasks

- [ ] T007 [018 T045] Add `tests/mesh/importer-visibility.test.ts`. Proof: the test passes, and fails when
  a usage module imports from `src/server/mesh/`.
- [ ] T008 [016 T033] Document agent context and the status flag in `docs/mcp.md` and `docs/mcp-contract.md`,
  and add the tool test. Proof: the tool test returns published context only, with no owner, steward,
  classification or note text.
- [ ] T009 [018 T061] Document units read as files, `validate_text` on a part and the five mesh operations
  as later increments in `docs/mcp-contract.md`. Proof: the contract test that compares the document with
  the registry passes.
- [ ] T010 [013 T039, 006 T065] Run Codex CLI against the stdio bridge with a temporary data folder; record the version,
  configuration and result in `docs/mcp-acceptance.md` and update `docs/agent-connections.md`. Proof: the record.

## Phase 4: Shared captures

- [ ] T011 [CODEX] One capture job for 012 T041, 013 T037, 014 T035, 015 T037, 016 T030, 017 T035,
  018 T053, 019 T015 and 019 T020: every state those tasks list, light and dark, 390 and 1440 px, local and server mode where the
  feature exists in both. Proof: a manifest naming each source task and state, and a findings file.
- [ ] T012 [018 T054] Fix every Mesh finding from T011 in `src/app/mesh/mesh.css` and the components; recapture
  only those states. Proof: before and after pairs of the same states.
- [ ] T013 Tick each source capture task with a disposition pointing to the T011 manifest. Proof: no source
  capture task is left unticked.

## Phase 4b: Ossie 0.3.0 draft base (worktree `021-ossie`)

- [ ] T019 [019 T025, T028 to T033, T036, T039] Pin Ossie 0.3.0.dev0 at one upstream commit (SHA and date as
  provenance), add it as a base labelled draft in code, `schemas/README.md` and the docs, and do the inventory,
  validation, planner, compile, conversion and capture tasks against that pin. T026 and T027 stay open until the
  release, and the docs say so. Proof: each 019 task's own proof, with the pin named.

## Phase 4c: Settings review (worktree `021-settings`)

- [ ] T020 Capture every settings and Admin screen and state, run an independent design review, send the findings
  to main, then fix tier A and the light success colour as main decided in `shared/orch/sw/SETTINGS-DECISIONS.md`,
  recapture and compare. Tier C goes to feature 022. Proof: review file, fix commits, before and after pairs.

## Phase 5: Batch gate

- [ ] T014 Full unit suite, `bun run test:mutation`, every browser suite, `bun --bun run check` and
  `bun --bun run build` on midgard. Proof: commands and exit codes in `evidence/GATE.md`; failures matched
  against `main`.
- [ ] T015 UI regression comparison of the whole journey against `main` at `4efb44e2`. Proof: classification
  counts; zero unaccepted regressions. Include every screen that uses the light `--color-success` token
  (`src/app/style.css`, `governance.css`, `WorkspaceHeader.css`, `admin.css`), every item editor dialog (the shared
  `.item-fields` input rule in `edit.css`), the UBL and Mall collapsed Network
  label counts, and the settings journey. In the attribute dialog, check that the reading sentence uses the
  same font face, size and height as the Name input beside it.
- [ ] T016 Architecture review, then Astra code review, at most three rounds. Proof: review files and fixes.
- [ ] T017 Tick the batch-gate hand-off tasks closed by this gate (012 T042/T045, 013 T044, 015 T044) with a
  disposition, merge to `main` without force, and redeploy sw-dev. Proof: merge commit and `/healthz` commit.
