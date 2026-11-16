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
