# Analysis: Shared Proposals

Read-only consistency pass over spec.md, plan.md, research.md, data-model.md, contracts and tasks.md,
with the fixes applied. Severity: high, medium, low.

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | Every FR (001 to 046) maps to at least one task in the traceability table | none | none needed |
| 2 | Quickstart names `tests/proposals-contribution.test.ts` but no task created it | medium | T016 proof now names it |
| 3 | The spec says local mode has no proposal operations, but no task made the routes refuse in local mode | medium | T011 now requires 404 in local mode with a test |
| 4 | Plan said eight delivery phases; tasks has eight plus the batch gate | low | plan wording corrected |
| 5 | Mutant task T039 proof referred to running a file alone, which the harness does not do | low | proof now names `bun run test:mutation` on the dev server |
| 6 | Task numbering skipped from T044 to T051 | low | batch gate renumbered T045 and references updated |
| 7 | Spec uses "Feature Branch" with the documents-only branch name | low | kept, with the note that the feature branch is created at implementation |
| 8 | Success criteria SC-001 to SC-009 each have a task: SC-001 T028, SC-002 T018, SC-003 T021, SC-004 T016, SC-005 T023, SC-006 T012, SC-007 T039, SC-008 T035 and T036, SC-009 T040 | none | none needed |
| 9 | Constitution Check: no principle conflicts; no amendment required (4.0.1 already states proposal confinement) | none | none needed |
| 10 | Duplicate or conflicting requirements: FR-018 and FR-026 both name the repository-wide authority | none | intended; close and restore use the same authority as promotion (Decision 3) |
