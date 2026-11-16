# Lane D

## Scope and execution

The existing API owns validation, authorization and the last-Admin guard. The form adds early address feedback; presentation changes do not change grants or server decisions. Authentication pages retain their existing CSP and contain no scripts.

Completed captures and browser checks use ports 5241 and 5242. An initial terminology invocation omitted SW_BASE_URL and failed to connect to its default 5173; the assigned-port rerun passed. The dev server was started on 5241 with a temporary proxy configuration to the isolated API on 5242. Captures stay inside this worktree in ignored `out/lane-d/after/`, respecting the lane safety boundary. Runtime preload adaptations keep shared capture files unchanged: fixed fixture ports, the renamed review action, and waiting for field feedback instead of clicking a disabled invalid proposal.

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

## T054 — documentation

- User guidance names Review change, the last-Admin refusal, visible access results and the direct-address notice. Server guidance explains the script-free support line; the theme paragraph describes the optional support link.
- Terminology check passed: no "KPI" or "contract object" in 8 files' views, the metric detail, the wizard, README and docs.
- `rg -l 'Dry run' docs README.md` retains only `docs/diagrams/identities.svg`, outside lane D ownership. The integrator must update that diagram label to meet the literal zero-match proof; no cross-lane edit was made.
- Deliverable scanner: 0 hits in the three documentation files and `changelog/D.md`.

## T055 — focused guard coverage complete; full green gate skipped

The new e-mail and refused-confirmation mutants are registered under lane D's sentinel. Existing mutants remain unchanged. A refused operation also refuses a repeated submission through its existing handler.

Focused results:

- `bun test tests/admin-presentation.test.tsx tests/admin-route.test.ts tests/auth/auth-pages.test.ts`: 26 pass, 0 fail, 138 expect() calls.
- Admin dialogs and geometry: 18 pass, 0 fail.
- Last-admin check passed: refusal has no enabled Confirm.
- Admin width check passed: form <= 640px, table <= 1200px, aligned left edges.
- 2/2 lane D review mutants killed; unmodified baselines passed.
- Six browser predicates against the foundation before the lane commits: Baseline: 0 passed, 6 failed. Current: 6 passed, 0 failed. They cover the invalid address, form/table caps, decision banner, last-Admin confirm removal and non-Admin address notice. The baseline frontend is built into ignored output using a loader for the original Admin sources; the worktree sources remain untouched.
- `bun --bun run check`: types, formatting, lint, comment, colour and brand checks passed.
- `bun --bun run build`: built successfully; the existing chunk-size warning remains.

Broad gate limitations:

- `bun test`, with a runtime port guard: 1993 pass, 71 fail, 130240 expect() calls; 2064 tests across 286 files. Of the failures, 68 are fixture/cleanup failures associated with refusing listeners on port 0; three assert retired sign-in wording. An earlier broad URL-rewriting attempt was aborted and its results are not used.
- The retired wording assertions are `tests/auth/sign-in-failure-status.test.ts:30`, `:52`, and `tests/auth/server-boundary.test.ts:79`. Those files are outside lane D ownership. The focused run confirms 3 pass, 3 fail in those two files; HTTP status behavior remains unchanged.
- `bun scripts/mutation-tests.ts` stops at the unmodified `remote-credential` baseline because its Git fixture requests port 0. The two new lane mutants pass independently. The broad runner was sequential, with its existing 10-second child timeout and reduced process priority.
- `bun run test:responsive` passed all four Admin viewports, then timed out in `scripts/helpers/odcs-graph-tour.ts:49` waiting for the unrelated Foreign keys button. No graph or lineage file was edited.
- `scripts/commit_cadence.py` is absent; the requested command reports file not found. Every coherent lane step has a local commit.

The full gate is explicitly skipped as a green completion, not claimed as passed. The assigned two-port limit prevents its multi-service fixtures, and the stale assertions require edits outside this lane. The integrator must resolve those constraints and rerun the complete gate.

## Integrator notes

- Update the three retired wording assertions, the identities diagram's Dry run label, and the shared brand manifest comment that still calls support navigation reserved.
- Shared capture sources remain unchanged. The ignored runtime adapter updates their old Dry run selector, the disabled invalid-email submission, the deactivation dialog title and the last-admin code matcher. Those selectors need to be reconciled centrally for future stock captures.
- Audit snapshot counts depend on preceding fixture requests; their count differs between full-matrix and narrowed captures. The proposal, file, viewport, theme and review stage are unchanged.
- Fixture factories initially used their normal disposable temporary roots and cleaned them up. Later checks set TMPDIR inside ignored lane output. No owner data or other worktree was used.
- Documentation and changelog scans: zero hits. New source hunks and the confidential-only source scan: zero hits. A full process-pattern scan of the shared mutation runner reports its two pre-existing executable `/tmp` literals; lane D's sentinel changes introduce neither.

Dedicated browser results on the final code:

- Admin browser check exit: 0. Includes invalid-address `aria-invalid`, schema-text absence, the 390x844 banner containment assertion, Alice/Bob/Carol direct addresses, review/save flows and the real last-Admin refusal.
- Brand browser check: five PASS lines, including script removal from brand SVG, script-free branded pages and the shipped-brand fallback.
- Auth browser check passes sign-in/sign-out, MSAL, front-channel logout and the earlier access/governance checks, then the port guard stops `startCredentialGitServer` in `auth-remote-check.ts:76`. The complete auth command is not green.

Final capture and shutdown notes:

- All 17 requested before/after pairs were opened and compared. The wide empty access-check state is `out/lane-d/after/server-light/server-admin-access-check-2560.png` (2560x1440); the decision states are additional captures.
- The isolated ODCS repeat exited 143 without output, so it provides no conclusive result and does not change the full responsive timeout finding.
- The lane dev server was stopped after browser checks. No push, merge or deployment was performed.
