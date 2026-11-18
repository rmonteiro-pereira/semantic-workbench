# Analysis: spec, plan and tasks of 015

Read-only pass over spec.md, plan.md, tasks.md and the contracts, then fixes.

## Checks run

| Check | Result |
| --- | --- |
| Every requirement (FR-001 to FR-041) maps to at least one task | all mapped after the fixes below |
| Every task has a story label where required, an ID, a path and a targeted proof | yes; T044 is the one hand-off to the batch gate |
| spec.md contains no file paths or code names | none found (origin names `http`, `mcp`, `acp` are vocabulary) |
| Each path in plan.md and tasks.md exists or is marked new or from 006 | verified with `ls`; new files are listed under "Files this feature owns" |
| Route count agrees across documents | 6 panel and 4 relay routes = 10 in the contracts, plan and T024 |
| End reasons agree | 13 in FR-006, data-model, SC-005, T010, T027 |
| Defaults agree between spec, plan and data-model | waiting 10 min, idle 30 min, grace 45 s, frame cap 1 MiB, buffer 500 events and 4 MiB, 1 session per person |

## Findings and fixes

1. **Contradiction (fixed).** FR-040 said opening the panel changes nothing about the screen, but the
   plan places the panel as a sheet beside the canvas, which narrows it. FR-040 now allows only the
   width given to the panel and requires an exact restore on close; T035 tests it.
2. **Inconsistency (fixed).** FR-033 promised appended CSV columns; the contract and T005 say the
   `origin` column already exists from 010. FR-033 now says existing columns keep their order.
3. **Uncovered requirement (fixed).** FR-014 (relay listens on no port) had no test; T026 now checks
   it.
4. **Uncovered edge case (fixed).** Two tabs posting one prompt, and attached paths that must not
   reveal existence: added to T023's proof.
5. **Unrunnable proof (fixed).** T038 named a filter the mutation script does not have; it now uses
   `scripts/mutation-case.ts` as the other mutant files do.
6. **Dispatch reasons (fixed).** T024 named a reason the inventory vocabulary lacks; it now uses
   `browser-only` and `public`, which exist.
7. **Open dependency (not a defect).** The relay needs a registered client record in 013; listed in
   the plan's overlaps and in `contracts/relay-connection.md`.
8. **Risk noted.** Protocol facts are unverified until T001; the plan states what changes if a fact
   differs, and FR-024 holds even if a write carries a base version.
9. **Constitution.** No amendment is needed by 015; whether the relay routes are a new class of
   unauthenticated-by-session endpoint under Principle I is for 013 to state.

No `[NEEDS CLARIFICATION]` markers remain.
