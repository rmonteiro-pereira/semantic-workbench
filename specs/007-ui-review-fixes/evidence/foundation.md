# Foundation evidence

## Scope

Existing theme styles name DM Sans and Manrope; local font faces supply their glyphs without changing layout rules or colour tokens. Local browser fixtures own temporary workspaces. Capture scripts retain the original state sequences.

## Setup

- T001: copied the capture tools; neutral Git author and committer identity is set in the shared isolated fixture. Corrected hard-coded first-server URLs in known-issues to respect SW_BASE_URL.
- `bun --bun run check`: exit 0. All matched files use the correct format. Comments are free of specification and task IDs. Theme and brand checks pass.
- `SW_BASE_URL=http://127.0.0.1:5201 bun scripts/ui-review/known-issues.ts /tmp/sw-foundation/setup-capture 1 1`: writes PNGs and structured records. Its existing lineage failure captures are retained rather than treated as successful navigation.
- The imported capture scripts are a single externally supplied tooling set, larger than the usual commit guideline; application code is unchanged.

- T002 partially completed, skipped as a completion claim: capture-index has 109 referenced image commands, but proving every driver exceeds the lane port contract (server follow-up requires three listeners). Only the known-issues local smoke run is proven so far. Integrator must validate the full index with an appropriate port allocation.

- T003: five import/registration sentinel pairs in each shared registry. `bun --bun run check`: exit 0. Setup mutation run: `663/663 targeted mutants killed; all unmodified module baselines passed.` Log: `/tmp/sw-foundation/setup-mutations.log`. No new mutant was registered for that run.

## Font assets

- T004: official Google Fonts repository snapshots supply DM Sans 4.004 and Manrope 4.505. Upstream complete variable WOFF2 files include Latin and extended Latin, so there are two complete files rather than four locally derived subsets. Both OFL texts are retained.
- Upstream mismatch: Manrope publishes no GitHub release assets, the DM Sans release archive predates the variable font, and neither repository publishes a SHA-256 manifest. Immutable repository snapshots are used instead of inventing release checksums. File bytes match upstream Git blob IDs `ab7ecbbb57ab2f2dd6500d4d6f43b81a0a35bc28` and `6e0584dbf6647a8e27cf5e28b9c667659088e1c4`. URLs, versions, sizes and locally computed SHA-256 values are in `src/shared/fonts/README.md`.
- `sha256sum src/shared/fonts/*.woff2`:
  - DM Sans: `0add1329f56a835a5df780b431ece97fff8b2a2deaa930aee93f1d4b9f3b2f5e`
  - Manrope: `30b83738add8c9edd9e3450b98036a9a8fb5668d0cbd4eb0ce5fe6761197f21f`

## Typography

- T005: local font-face declarations use swap; family stacks use `--font-sans` and `--font-display`. Inherited font shorthands are expanded into longhands so size, style, weight, variant, stretch and line height remain inherited while the family has its generic fallback. Existing explicit system and monospace stacks stay unchanged.
- `bun test tests/fonts.test.ts`: `1 pass`, `0 fail`.
- `SW_BASE_URL=http://127.0.0.1:5201 bun run test:theme`: `10 theme checks passed` (`/tmp/sw-foundation/theme-final.log`).
- M7 / FR-053, first-run workspace, no project/file, 1440×900, light: before `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/states/local-workspace--first-run-empty-1440.png`; after `/tmp/sw-foundation/final-after/states/local-workspace--first-run-empty-1440.png`.
- Same state and viewport, dark: before `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/states/local-dark-workspace--first-run-empty-1440.png`; after `/tmp/sw-foundation/final-after/states/local-dark-workspace--first-run-empty-1440.png`.
- Both final after images and both before images were opened. The title changes from serif to Manrope sans-serif. The centered composition, colours, controls and spacing remain intact.
- Capture command: `SW_BASE_URL=http://127.0.0.1:5201 bun scripts/ui-review/empty-states.ts /tmp/sw-foundation/final-after/states`. Unrelated invalid-empty-document fixture states still produce validation-backdrop geometry records; the first-run states above have empty problem arrays. No application behaviour outside typography was changed for those records.

## Font gate

- T006: the filesystem gate checks local font-face URLs, both OFL files and generic/token fallback declarations across source CSS. Font-face family descriptors are excluded because CSS descriptors name one face, not a fallback stack.
- `bun test tests/fonts.test.ts`: `1 pass`, `0 fail`, `1 expect() calls`.
- Three asset mutants are registered under the E sentinel: raw family without fallback, missing WOFF2 URL, removed Manrope licence. All three are killed by the same `fontProblems` entry point used by the test. `/tmp/sw-foundation/font-mutants.log` records the focused baseline and three failures; `/tmp/sw-foundation/final-mutations.log` includes all three `KILLED fonts` entries in the complete runner.
- Shared-file exception: the runner's `run` function dispatches the fonts category to a disposable asset-tree runner. The existing runner only handles TypeScript candidate modules, so CSS and licence faults need this foundation dispatch. Lane imports and registrations remain inside the E sentinels.

## Offline browser proof

- T007: first-run browser requests outside the application origin are aborted and every request host is printed. The check requires registered, loaded faces as well as both requested document.fonts.check calls; the API alone can return true for an unregistered family. Every first-run heading must have a sans-serif generic fallback.
- Before: `git archive e8b7d69` extracted into `/tmp/sw-foundation/base`, with only the new theme-check driver/helper copied into that disposable tree. A temporary Vite on 5202 served the unchanged base application. `SW_BASE_URL=http://127.0.0.1:5202 bun scripts/theme-browser-check.ts --fonts-only` exited 1: `DM Sans is registered and loaded locally`, expected true, received false. Log: `/tmp/sw-foundation/fonts-browser-before.log`. The baseline server was stopped after the check.
- After: the same focused check on port 5201 exited 0 and prints `PASS document.fonts.check(16px "DM Sans") with a registered face`, `PASS document.fonts.check(700 22px Manrope) with a registered face`, `PASS first-run heading stacks end in sans-serif`. `/tmp/sw-foundation/fonts-browser-after.log`.
- Complete theme check on the final styles: `10 theme checks passed`; all recorded request hosts are `127.0.0.1:5201`. `/tmp/sw-foundation/theme-final.log`.

## Fixture and capture-index follow-up

- The first full responsive run found `odcs-dataset-properties` overlap between a commit hash and the newly chosen `Workbench Fixture` name. The neutral environment now uses the existing fixture convention, `Workbench Test <workbench-test@example.invalid>`, instead of inventing a longer name. No ODCS layout or assertion was changed. Focused rerun: `RESPONSIVE_ONLY='ODCS screens' SW_BASE_URL=http://127.0.0.1:5201 bun run test:responsive` passed all four requested widths (390, 1280, 1440, 2560), log `/tmp/sw-foundation/responsive-odcs.log`.
- Capture-index command mapping was refined against original capture log stems; some states come from dedicated file/lineage tools rather than capture-states. T002 remains partial until each driver has a fresh smoke run.

## Documentation

- T008: README stack/licensing row, shared-layer architecture, theme font/replacement guidance and `changelog/E.md` describe the local fonts. `src/server/static.ts` has no font-src override; its existing default-src self permits same-origin font assets without a policy edit.
- `bun --bun run check`: exit 0; formatting, lint, comment, theme and brand checks pass (`/tmp/sw-foundation/final-check.log`).
- Document leak scan: five font/application documents clean, zero hits; internal evidence/index and imported capture tooling also pass the confidential-only scan. Logs are under `/tmp/sw-foundation/`.
