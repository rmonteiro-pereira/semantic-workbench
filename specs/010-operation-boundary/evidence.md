# Operation boundary evidence

## Scope

- Existing HTTP middleware owns authentication order, authorization, handler execution and audit; concrete-target checks remain in handlers.
- HTTP responses, selected headers, refusals and audit records must retain their existing behavior.
- The new boundary adds authenticated callers, operation-bound twins and narrowing effect scopes.
- Entry-point comparisons use disposable fixtures; event streams are aborted and cancelled before fixture disposal.

## HTTP baseline

The characterization covers every `routeExamples` entry for local mode, all fixture people, anonymous access, a deactivated Editor and an application client. The fixture includes Viewer, Editor, Steward, Admin, a custom role and people without grants. Git author and committer dates and audit time are fixed. Import timestamps, request identifiers and temporary data roots are normalized. Stream bodies are represented by a marker after cancellation.

`bun test tests/auth/http-characterization.test.ts`: 1 pass, 0 fail, 1548 expect() calls. Production sources remain unchanged.

## Old audit fixture

The unchanged audit writer produced January, February and March records at fixed dates, including the January/February boundary. Each month holds an allowed snapshot, a denied snapshot and an anonymous denial.

`bun test tests/auth/audit-compat.test.ts`: 2 pass, 0 fail, 8 expect() calls.

`bun run audit:verify tests/fixtures/audit-v1`: Audit log intact: 9 records in 3 months.
