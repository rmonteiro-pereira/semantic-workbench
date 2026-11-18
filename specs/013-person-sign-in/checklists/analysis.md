# Analysis: spec, plan and tasks

Read-only consistency pass over `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md` and
the contracts, against constitution 4.0.1 and the decisions file. Findings are listed with the fix.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | High | FR-024 (limit of live connections) and FR-033 (token response contents) had no task | Added to T013's description and proof |
| 2 | High | FR-064 (metric labels) had no task | T017 now adds `recordConnectionEvent` in `src/server/observability/metrics.ts` and asserts the labels |
| 3 | High | SC-007 and FR-053 demanded zero HTTP differences, but T008 re-records the administration document list in the characterization fixture | FR-053 and SC-007 name that one reviewed difference |
| 4 | Medium | Research and the contract pointed at task numbers that did not exist (T070, T071, T080) | Renumbered to T038, T039 and T036 |
| 5 | Medium | `contracts/connection-management.md` said no row is a twin without naming the inventory values | Now names `{ no: 'page' }`, `{ no: 'browser-only' }` and `{ no: 'public' }`, which exist in `DISPATCH_REASONS` |
| 6 | Medium | The `validate` scope has no effect of its own | Recorded as decision 7 and gap 3 in the spec; research R8 holds the table |
| 7 | Low | The spec's "no implementation detail" rule versus words such as "keyed hash" and "PKCE" | Kept: they are the decided behaviour of M2 and the constitution, not code structure |
| 8 | Low | Plan lists `docs/configuration.md` although no setting is added | Marked "only if a setting was added" in T041 |

## Coverage

Every FR-001 to FR-075 maps to at least one task through the traceability table or a task
description; every user story has a phase with an independent test; every task names a targeted
proof; the last task hands to the batch gate. No duplicate requirement was found. The terms
"program" (registration), "connection" (durable record) and "setup credential" are used the same
way in every document.

## Constitution

No principle is violated. The one wording gap (the token endpoint authenticates "by code, PKCE or
refresh token" and the setup credential is a fourth, code-like credential) is recorded as gap 1 in
the spec and is not an amendment need.

## Open items left to implementation

R2 (what Codex CLI supports), R6 and R14 (protocol text details) are research tasks T038 and T039;
they can change which programs are listed as supported and the exact parameter and header names,
not the requirements.
