# Foundation evidence

## Scope

Existing theme styles name DM Sans and Manrope; local font faces supply their glyphs without changing layout rules or colour tokens. Local browser fixtures own temporary workspaces. Capture scripts retain the original state sequences.

## Setup

- T001: copied the capture tools; neutral Git author and committer identity is set in the shared isolated fixture. Corrected hard-coded first-server URLs in known-issues to respect SW_BASE_URL.
- `bun --bun run check`: exit 0. All matched files use the correct format. Comments are free of specification and task IDs. Theme and brand checks pass.
- `SW_BASE_URL=http://127.0.0.1:5201 bun scripts/ui-review/known-issues.ts /tmp/sw-foundation/setup-capture 1 1`: writes PNGs and structured records. Its existing lineage failure captures are retained rather than treated as successful navigation.
- The imported capture scripts are a single externally supplied tooling set, larger than the usual commit guideline; application code is unchanged.
