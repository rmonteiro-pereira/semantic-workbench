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

## T049 — last-Admin refusal

- Before: review `screenshots/states/{server-admin,server-dark-admin}-protection--last-admin-1440.png`.
- After: `out/lane-d/after/states/{server-admin,server-dark-admin}-protection--last-admin-1440.png`.
- Opened both after images: the title names Dave, the refusal is a single sentence, and only Cancel remains. No enabled Confirm survives the real server refusal.
- `bun scripts/admin-last-admin-check.ts` now runs its exported check when invoked directly; previously that command did nothing. Runtime preload supplies the assigned browser origin.
- Last-admin check passed: refusal has no enabled Confirm.

## T050 — access result

- Before: review `screenshots/states/server-admin-access-check--{allowed,refused}-1440.png`, `screenshots/states/server-admin-access-check--refused-390.png`, and `screenshots/server-light/server-admin-access-check-2560.png`.
- After: `out/lane-d/after/states/server-admin-access-check--{allowed,refused}-{390,1440,2560}.png`.
- Opened the phone refusal, desktop allowed/refused and wide allowed images. The red/green sentence sits immediately below the actions; the phone refusal is fully inside the 844 px viewport. Empty headings are absent and attributes are folded.
- `bun test tests/admin-presentation.test.tsx`: 14 pass, 0 fail, 53 expect() calls. Added a real-browser viewport assertion to the admin check.
