# Lane D

## Scope and execution

The existing API owns validation, authorization and the last-Admin guard. The form adds early address feedback; presentation changes do not change grants or server decisions. Authentication pages retain their existing CSP and contain no scripts.

Only ports 5241 and 5242 are used for browser checks. The dev server was started on 5241 with a temporary proxy configuration to the isolated API on 5242. Captures stay inside this worktree in ignored `out/lane-d/after/`, respecting the lane safety boundary. Runtime preload adaptations keep shared capture files unchanged: fixed fixture ports, the renamed review action, and waiting for field feedback instead of clicking a disabled invalid proposal.

## T048 — grant validation

- Before: review `screenshots/states/server-admin-grant-form--validation-error-{1440,390}.png`.
- After: `out/lane-d/after/states/server-admin-grant-form--validation-error-{1440,390}.png`.
- Opened after images: one short error sits beneath the invalid field; Review change is disabled; the schema dump is absent. Compared the phone baseline, which prints the schema dump below the form.
- `bun test tests/admin-presentation.test.tsx`: 13 pass, 0 fail, 48 expect() calls.
- Known schema diagnostics are mapped to a plain sentence; other structured refusals retain their existing handling.
