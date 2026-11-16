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

## T051 — direct Admin address

- Before: review `screenshots/followup/server-{alice,carol}-admin--direct-address-1440.png`.
- After: `out/lane-d/after/screenshots/followup/server-{alice,carol}-admin--direct-address-1440.png`.
- Opened both after images: the Admin-role notice and workspace link replace the silent workspace fallthrough. The real browser suite also covers Bob and the return link.
- `bun test tests/admin-route.test.ts`: 4 pass, 0 fail, 19 expect() calls.
- The follow-up capture's unrelated Git fixture is omitted at runtime for direct-address-only captures; the real identity provider and application use 5241/5242.

## T052 — widths and admin tables

- Before: review `screenshots/server-light/server-admin-{grants-2560,roles-1440,audit-1440,settings-1440}.png` and `screenshots/states/server-admin-access-change--review-confirm-1440.png`.
- After: matching names under `out/lane-d/after/server-light/` and `out/lane-d/after/states/`.
- Opened all five after images: grants stop at the table cap; role permissions use marks; audit decisions differ visually and signIn reads Signed in; settings save follows its fields; review uses plain counts and the primary is rightmost. Dates omit seconds.
- `bun test tests/admin-presentation.test.tsx`: 14 pass, 0 fail, 53 expect() calls.
- Admin width check passed: form <= 640px, table <= 1200px, aligned left edges.
- `capture-tour.ts`: all eight admin captures at 1440 and 2560 reported `[]` geometry problems.

## T053 — script-free authentication pages

- Before: review `screenshots/auth-pages/auth-page-{sign-in-error,no-access}--page-1440.png`.
- After: matching names in `out/lane-d/after/screenshots/auth-pages/`.
- Opened both after images: the single action is filled, the expired-link explanation is plain, and the administrator support line is visible.
- `bun test tests/auth/auth-pages.test.ts`: 6 pass, 0 fail, 63 expect() calls. Includes configured support links, HTML escaping, fallback text, script absence and the existing CSP.
- Request-entry tests keep the HTTP status checks while expecting the new expired-link and service-unavailable explanations, so deliberate wording changes remain covered.
- No inline styles, script, CSP relaxation, or new route is introduced. Brand URLs pass through the existing sanitized manifest boundary.
- `bun test` on the admin dialog and geometry components: 18 pass, 0 fail.
