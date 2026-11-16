# Lane D

T048–T055 are complete with documented foundation exceptions. No lane-introduced gate failure remains.

## Scope and execution

The existing API owns validation, authorization and the last-Admin guard. The form adds early address feedback; presentation changes do not change grants or server decisions. Authentication pages retain their existing CSP and contain no scripts.

The original capture pass used ports 5241 and 5242. Resumed gate checks also use OS-assigned fixture ports, as authorized by the integrator. An initial terminology invocation omitted SW_BASE_URL and failed to connect to its default 5173; the assigned-port rerun passed. The dev server was started on 5241 with a temporary proxy configuration to the isolated API on 5242. Captures stay inside this worktree in ignored `out/lane-d/after/`, respecting the lane safety boundary. Runtime preload adaptations keep shared capture files unchanged: fixed fixture ports, the renamed review action, and waiting for field feedback instead of clicking a disabled invalid proposal.

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

## T055 — initial gate before the port correction (superseded)

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

This initial run was not claimed as a green completion. Its two-port constraint and retired wording assertions are superseded by the integrator-authorized gate resumption below.

## Integrator notes

- The retired wording assertions are reconciled with the authentication-page wording. Update the identities diagram's Dry run label and the shared brand manifest comment that still calls support navigation reserved; both remain outside lane D ownership.
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

## Integrator-authorized gate resumption

- Dynamic OS-assigned fixture ports are now permitted. The previous strict two-port run is superseded by the following gate results.
- Scope ledger: authentication handlers retain their existing response statuses and script-free CSP. Only test expectations for deliberately changed plain-language failure messages are reconciled. No route, public API or access decision changes. The existing request-entry tests verify this delta.
- Updated the three retired wording assertions in `tests/auth/sign-in-failure-status.test.ts` and `tests/auth/server-boundary.test.ts`, explicitly authorized by the integrator. Their status assertions remain intact.
- The identities diagram is outside lane D ownership and remains an integrator follow-up.
- Wording reconciliation entry-point tests: 6 pass, 0 fail, 48 expect() calls.

Resumed gate results (logs in ignored `out/lane-d/`):

| Command | Result | Log |
| --- | --- | --- |
| `bun test` | 2076 pass, 2 fail, 130824 expect() calls; 2078 tests, 286 files | `unit-resume.log` |
| `bun --bun run check` | Exit 0: types, formatting, lint, comments, theme and brand | `check-resume.log` |
| `bun --bun run build` | Exit 0; built in 3.17s, existing chunk-size warning | `build-resume.log` |
| `bun run test:admin` | Exit 0 | `admin-resume.log` |
| `bun run test:auth` | Exit 0; 36 PASS lines | `auth-resume.log` |
| `bun run test:brand` | Exit 0; five PASS lines | `brand-resume.log` |
| `bun scripts/admin-last-admin-check.ts` | Last-admin check passed: refusal has no enabled Confirm. | `last-admin-resume.log` |

The two full-unit failures were checked on the foundation archive at `593f2c18`:

- `tests/auth/audit.test.ts`: the thousand-appends test exceeds the default 5000ms timeout on both versions (lane 6070.61ms; foundation 6815.85ms). Foundation: 0 pass, 1 fail, 5 filtered out, 1002 expect() calls (`audit-foundation.log`). Lane focused default run: 5 pass, 1 fail; lane `--timeout 20000`: 6 pass, 0 fail, 1018 expect() calls (`audit-current-extended-timeout.log`). No assertion or timeout setting was changed in the repository.
- `tests/pipeline/deploy-azure.test.ts:100`: assumes a literal `/tmp/sw-deploy-registry-` prefix, so the isolated worktree `TMPDIR` fails on both versions. Foundation with the same isolated TMPDIR: 4 pass, 1 fail (`deploy-foundation-isolated-tmp.log`). Lane with `TMPDIR=/tmp`: 5 pass, 0 fail, 20 expect() calls (`deploy-current-default-tmp.log`). This focused file uses simulated deployment commands; no external deployment occurred.

The full responsive run reached 123 PASS lines and stopped at the integrator-confirmed pre-existing Mall ODCS canvas measurement: 407px against a 421px minimum at 1280x720 (`responsive-resume.log`). The integrator already reproduced this exact failure on foundation `593f2c18` and main; lane B owns it. All four Admin viewports and all four ODCS graph viewports passed. The earlier Foreign keys timeout did not recur with the unmodified harness. Remaining groups are run individually below.

Responsive continuation, one group at a time with `RESPONSIVE_ONLY` and `SW_BASE_URL=http://127.0.0.1:5241`:

| Group | Summary | Log |
| --- | --- | --- |
| `examples: 1440` | 2 responsive UI checks passed; exit 0 | `responsive-examples-1440-resume.log` |
| `examples: 2560` | 2 responsive UI checks passed; exit 0 | `responsive-examples-2560-resume.log` |
| `dark theme:` | 5 responsive UI checks passed; exit 0 | `responsive-dark-theme-resume.log` |
| `graph canvases:` | 5 responsive UI checks passed; exit 0 | `responsive-graph-canvases-resume.log` |
| `shell screens:` | 5 responsive UI checks passed; exit 0 | `responsive-shell-screens-resume.log` |
| `sidebar: the phone drawer` | 2 responsive UI checks passed; exit 0 | `responsive-sidebar-loading-resume.log` |

Each continuation includes the uncaught-browser-error assertion. No responsive assertion or repository script was modified or disabled. `responsive-remaining-results.json` records all six exit codes.

Final mutation and gate completion:

- `bun scripts/mutation-tests.ts`: **668/668 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.** Exit 0 (`mutations-final.log`). Includes both new review guards, all existing modules, askpass cases and all nine UI mutants.
- New review guards: 2 generated, 2 killed, 0 survived, 100%, exceeding a 95% target. The invalid-address and refused-operation assertions each kill a mutant; valid-address and allowed-confirmation assertions provide positive controls. The browser checks also exercise the entry points.
- Existing Bun mutation runner, Bun 1.4.0. Approximate wall time 1124 seconds (log creation through final output). Nice 19; affinity to CPUs 21 and 17, selected from the least-busy allowed CPUs. A supervisor sampled its own process group's RSS every two seconds with a 6 GiB stop limit; peak sampled RSS 430 MiB. The sampled RSS supervisor did not change host cgroup settings. The runner retains its ten-second module-child timeout and does not report a separate timeout-kill count.
- An earlier concurrent mutation attempt stopped without a diagnostic at `write-body-legacy`; the isolated final run passed that baseline and the entire gate. This was a discarded attempt, not classified as a pre-existing code failure. The final unit run likewise supersedes its preparatory restart after the foundation archive was moved into the hidden ignored comparison directory.
- All required commands have run with dynamic fixture ports permitted. Every browser suite and every remaining responsive group ran sequentially. No failed lane behavior remains; the full-unit and responsive command exit codes are not represented as green.
- T055 is checked as completed with the foundation exceptions documented above, following the integrator's instruction to compare failures and continue. The remaining integrator work is the Mall canvas fix in lane B, the portable temporary-path assertion and audit timeout policy, and the already-noted shared diagram/comment/capture selectors.
- All 17 before/after comparisons remain recorded above. No visual implementation changed during this resumed gate.
- The lane dev server was stopped after the final mutation checks. No push, tag, merge, deployment or remote-setting change was performed. Browser checks used disposable local identity and Git fixtures.
