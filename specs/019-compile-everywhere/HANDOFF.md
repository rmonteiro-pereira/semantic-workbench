# Handoff: compile everywhere

Worktree `/home/rodrigo/projetos/semantic-workbench-wt/019-compile-everywhere`, branch `019-compile-everywhere`. Nothing was pushed.

## Done (ticked in tasks.md, each in its own commit)

T001-T014, T016, T017, T018. `UnitSource` exists since commit 8f9b9e5c (`src/server/tessera/unit-source.ts`, wiring in `workspace-unit-source.ts`, fixture helper in 1e7276c8).

## Not finished

- **T019** (unticked). The mutants are done and pass: `bun scripts/compile-mutants.ts` kills 23/23 (`scripts/compile-mutants.ts`, `scripts/compile-mutation-cases.ts`, one line in `scripts/mutation-case.ts`, one block in `scripts/mutation-tests.ts`). The conversion journey added to `scripts/compile-browser-check.ts` fails on midgard at the step "Converted. retail.ontology.yaml is now standard Ossie in your working copy." (the review, phone width and confirm pass; the success text never appears, so the convert call probably answers an error). Next worker: print the dialog text on failure, find why (likely `dirty`: the imported file may not be committed, or the unit check refuses), fix, rerun, then tick T019.
- T034-T038 not started. T034 needs `docs/compile.md` (docs/development.md already links to it) plus README, ARCHITECTURE.md, docs/user-guide.md; T035 CHANGELOG; T036 inventory/MCP check (`bun scripts/operation-inventory-table.ts && git diff --exit-code docs/operations.md`); T037 `bun --bun run check` and build, check-comments; T038 is covered by `tests/compile/compile-dialog.test.tsx`.
- T024 (Ossie 0.3.0 release check against the official upstream repository) not done; record result and date in research.md. Left open as instructed: T015, T020 (Codex screenshots), T021-T023 (MCP), T025-T033, T039, T040, and multi-file work for 018.

## Uncommitted-then-committed in this handoff commit

browser-sha256 shim, vite.config.ts plugin, mutants, browser check edits.

## Departures from plan.md

- `bundleFiles` moved from `scripts/tessera.ts` to `src/server/tessera/bundle-files.ts`; `findingsOf` core moved to `src/shared/tessera/compile-findings.ts` (both used by the CLI and HTTP so bytes are equal). The CLI tests still pass.
- Added `fileSizes` to `published-snapshot.ts` and `layoutFor` to `workspace.ts` (one block each). `UnitRead` carries `place` (branch, commit, projectFolder) so the manifest source equals the CLI's.
- `compile.check` answer has an extra `accepted` boolean. Convert request uses the unit digest and unit input hashes; the dialog shows only this file's losses.
- Convert route and tests exist; its exposure is `later`. Bundle dispatch is `browser-only`, exposure `never`.
- Extra files: `use-convert.ts`, `workspace-conversion.ts`, `compile-request.ts`, `browser-sha256.ts`. The browser compiles one file locally for the before/after view; the shared digest module imports `node:crypto`, so `vite.config.ts` gives only that module a browser sha-256 (a first browser run failed with the app blank until this was found; the rerun after the fix loaded the app).
- Compile fixtures reuse the access fixture project `sales-contracts` and constants in `tests/helpers/tessera-repository.ts`; `tests/fixtures/compile/` holds only the golden bundle (regenerate with `UPDATE_GOLDEN=1`).

## Proofs run (summary lines)

- `bun test tests/compile/ tests/auth/compile-parity.test.ts`: all pass when last run per file (e.g. convert-service 10 pass, routes 12 pass, parity 10 pass, loss-preview 8, compile-dialog 11, convert-dialog 9, browser-sha256 4).
- `bun test tests/auth/operation-inventory.test.ts tests/auth/route-actions.test.ts tests/auth/matrix.test.ts`: pass.
- `bun --bun run check`: passed (before the last edits; rerun in T037). `bun --bun run build`: built.
- Scale on midgard: 200 documents, 19.55 MB, 19.74 s (recorded in docs/development.md).
- `test:compile` on midgard passed before the conversion journey was added; fails now at the step above.

## Notes for running the browser check on midgard

Start vite with `setsid ... &` and kill the group (`kill -TERM -- -$PID`); an earlier run left a vite on port 5431 (killed by exact PID 771552). Port 5431 was confirmed free after the last run's own cleanup message, but verify with `ss -ltn | grep :5431` before and after.

## Exact next task

Debug the failing conversion step of `scripts/compile-browser-check.ts` (T019), then T034 onward.
