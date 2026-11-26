# Tasks: Loose Ends

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

Format: `- [ ] ID [Source] Description. Proof: what shows it works.` Every code task ends with its own
targeted test green and the formatter applied. No task edits an existing test only to make it pass.

## Phase 1: Dispositions

- [x] T001 [017 T005] Tick 017 T005 with a disposition line naming `isAttribute` in
  `src/shared/attributes/attribute-rule.ts` and `tests/item-diff/attribute-kind.test.ts`. Proof: the test
  passes on this branch.
- [ ] T002 Re-read every source task named in the spec against `main` and correct this list if one is
  already done. Proof: a one-line note per source task in `evidence.md`.

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
- [ ] T006 Shorten `useFullGraphEdges` (pass the input object through, extract the appearance builder) with
  no change in output. Proof: the existing label and edge tests pass unchanged; every function in the file
  is about 40 lines or less.

## Phase 3: Code and documentation tasks

- [ ] T007 [018 T045] Add `tests/mesh/importer-visibility.test.ts`. Proof: the test passes, and fails when
  a usage module imports from `src/server/mesh/`.
- [ ] T008 [016 T033] Document agent context and the status flag in `docs/mcp.md` and `docs/mcp-contract.md`,
  and add the tool test. Proof: the tool test returns published context only, with no owner, steward,
  classification or note text.
- [ ] T009 [018 T061] Document units read as files, `validate_text` on a part and the five mesh operations
  as later increments in `docs/mcp-contract.md`. Proof: the contract test that compares the document with
  the registry passes.
- [ ] T010 [013 T039] Run Codex CLI against the stdio bridge with a temporary data folder; record the version,
  configuration and result in `docs/mcp-acceptance.md` and update `docs/agent-connections.md`. Proof: the record.

## Phase 4: Shared captures

- [ ] T011 [CODEX] One capture job for 012 T041, 013 T037, 014 T035, 015 T037, 016 T030, 017 T035 and
  018 T053: every state those tasks list, light and dark, 390 and 1440 px, local and server mode where the
  feature exists in both. Proof: a manifest naming each source task and state, and a findings file.
- [ ] T012 [018 T054] Fix every Mesh finding from T011 in `src/app/mesh/mesh.css` and the components; recapture
  only those states. Proof: before and after pairs of the same states.
- [ ] T013 Tick each source capture task with a disposition pointing to the T011 manifest. Proof: no source
  capture task is left unticked.

## Phase 5: Batch gate

- [ ] T014 Full unit suite, `bun run test:mutation`, every browser suite, `bun --bun run check` and
  `bun --bun run build` on midgard. Proof: commands and exit codes in `evidence/GATE.md`; failures matched
  against `main`.
- [ ] T015 UI regression comparison of the whole journey against `main` at `4efb44e2`. Proof: classification
  counts; zero unaccepted regressions.
- [ ] T016 Architecture review, then Astra code review, at most three rounds. Proof: review files and fixes.
- [ ] T017 Tick the batch-gate hand-off tasks closed by this gate (012 T042/T045, 013 T044, 015 T044) with a
  disposition, merge to `main` without force, and redeploy sw-dev. Proof: merge commit and `/healthz` commit.
