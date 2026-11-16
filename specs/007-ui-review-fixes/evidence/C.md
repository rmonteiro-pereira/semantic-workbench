# Lane C

T036–T046 are complete. T047 remains uncompleted because the full responsive check fails an unchanged Mall ODCS canvas minimum, reproduced before lane C on foundation `593f2c18`. All other listed checks passed, including the full unit and mutation suites. No application fix was skipped.

## Scope ledger

- The API already compares revision bytes without writing files; hash checks and commit permissions remain authoritative.
- Diff presentation may change labels, theme surfaces and narrow-screen layout, without changing file bytes or revision signatures.
- Selection must follow a path between unstaged and staged groups; a missing side must never be described as identical.
- Existing isolated fixtures own their temporary workspaces and cleanup. Browser runs use frontend 5231 and API 5232 only.

## Confirmed inferences

The reproduced dark modified diff at 1440 and stale-save comparison at 1440 both resolve `.diff-host .cm-gutters.cm-gutters-before` to `rgb(245, 245, 245)`. `.cm-changeGutter` itself is transparent; `.cm-changedLineGutter` resolves to `rgb(34, 187, 34)`. `.cm-collapsedLines` reports a transparent background colour, so colour alone does not detect its light gradient. `.diff-host`, merge wrappers, editors, scrollers, content, unchanged lines, spacers and inserted/deleted spans are transparent; changed lines resolve to `rgba(100, 160, 128, 0.08)`. Both editors carry CodeMirror's light class in the application's dark theme.

Confirmation captures: `/tmp/sw-C/confirmation-target/local-dark-source-control--diff-modified-1440.png` and `/tmp/sw-C/confirmation-target/local-dark-source-editor--stale-save-warning-1440.png`. Full element colour inventory: `/tmp/sw-C/colours.jsonl`.

## Capture constraints

The source-control capture script ignores SW_THEME and runs all viewports. A temporary copy preserves the script's state sequence, with imports resolved to this worktree and the matrix restricted to 1440×900 and 390×844, dark then light. A temporary Bun preload binds its isolated API to 5232. Images remain under `/tmp/sw-C/`, respecting the restriction to this worktree and temporary folders.

The script's History button selector is stale. Its generic geometry checker also counts the background behind modal dialogs as covered; those messages are not new dialog regressions. Expected draft lookup 404s identify `/api/drafts/<project>/<file>`.

## Dark comparison surfaces

The surface assertion failed before the fix: expected `rgb(15, 21, 20)`, received `rgb(245, 245, 245)`. The four comparison screens then passed (modified, added, staged-deleted, stale-save). The initial failure demonstration used the unchanged foundation. A later run against an archived e8b7d69 frontend on 5231 failed at the same assertion: expected rgb(15, 21, 20), received rgb(245, 245, 245), recorded in /tmp/sw-C/e8b7d69-surface.log. The baseline server was stopped before returning to the fixed frontend.

Viewed after images `/tmp/sw-C/theme-fixed/local-dark-source-control--diff-modified-1440.png` and `/tmp/sw-C/theme-fixed/local-dark-source-editor--stale-save-warning-1440.png`, paired with the same basenames under the review's `screenshots/states/`. Gutters and collapsed-line strips are dark; no white bands remain. The old overwrite-primary and clipped header are still visible in these captures and belong to later fixes.

## Staged deletion and phone comparisons

The new HTTP regression in `tests/git-status.test.ts` passes without a server change: HEAD contains the committed bytes and index correctly reports absence. The defect was the client's retained `changes` group after staging, which then asked for index → worktree (both absent). Selection now follows the path to the staged group. `tests/scm-presentation.test.ts` covers the staged label and missing-side identical guard.

`test:scm`: **20 source-control checks passed**, including staged-deletion content, selected-row retention, no New file/identical text, phone viewport containment, unified rendering, Back, and read-access controls. `/tmp/sw-C/scm-browser.log` holds the output.

Viewed pairs (before root: `/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/screenshots/states/`; after root: `/tmp/sw-C/after/states/`):

| Finding | Matching basename | Observation |
| --- | --- | --- |
| M6 | `local-source-control--staged-changes-1440.png` | Committed deletion content replaces two empty sides; selected row stays highlighted; Deleted (staged) replaces Deleted and no identical claim remains. |
| M12 | `local-source-control--diff-modified-390.png` | A unified diff and Back row occupy the phone pane instead of a diff below the change list. |
| M12, m24 | `local-dark-source-editor--stale-save-warning-390.png` | Three complete stacked buttons fit; Keep editing is primary, overwrite is outlined danger; comparison is unified and gutters stay dark. |
| M12, m24 | `local-source-editor--stale-save-warning-1440.png` | Side-by-side comparison remains; safe action is primary on the right. |

The same source-control state sequence was recaptured in light/dark at 1440×900 and 390×844. The temporary copy presses Back between phone selections so the next change can be selected. Its generic geometry checker assumes a Branch selector always exists, so it reports that expected absence while a phone diff replaces the list; the dedicated SCM geometry assertion passes.

## Diff headings and syntax keys

Viewed `states/local-source-control--diff-modified-1440.png` before and `/tmp/sw-C/after/states/local-source-control--diff-modified-1440.png` after: the filename has its own line and both version labels are whole. Viewed `local-dark/local-dark-ontology-source-1440.png` before and `/tmp/sw-C/after/local-dark/local-dark-ontology-source-1440.png` after: YAML keys are visibly lighter than plain values, with the same UBL file and viewport. `tests/theme-check.test.ts`: **18 pass, 0 fail**, including token parity and the key/value/surface contrast assertions. The source-control suite's history and diff checks also pass.

## Read access

Viewed the matching `server-personas/server-carol-source-control-1440.png` before and `/tmp/sw-C/after/server-personas/server-carol-source-control-1440.png` after: the same `hr-people/people.odcs.yaml` state now shows You have read access, with no commit textarea, commit action or New branch. `/tmp/sw-C/after/server-personas/server-alice-source-control-1440.png` retains the textarea, Commit and New branch for `sales-contracts/orders.odcs.yaml`.

The persona capture follows the `server-pages.ts` contract/open-Source-control sequence using `authWorkspace`, `accessFixture`, `createAccessControl` and `createHandler` in server mode. Its existing trusted-principal injection supplies Carol/Alice without a separate OIDC listener. Permissions and project filtering are real; identity-provider sign-in is outside this comparison. The driver is `/tmp/sw-C/persona-capture.ts`, output `/tmp/sw-C/persona-capture.log`. This keeps all HTTP listeners on 5231/5232. The dedicated SCM browser assertion and existing commit-availability unit assertions pass.

## Invalid draft

Viewed the review's `states/local-source-editor--invalid-unsaved-draft-1440.png` and `-390.png`, paired with `/tmp/sw-C/after/editing-matched/local-source-editor--invalid-unsaved-draft-1440.png` and `-390.png`. The full original light editing sequence reproduces three findings at 1440 and one at 390. The header retains Not saved, the editor retains its located finding, the pill wraps at 390, and the footer no longer repeats the failure banner. Earlier reduced-matrix captures used a different accumulated draft and are superseded by these matched images.

`bun test tests/footer-counts.test.ts tests/editor-presentation.test.tsx`: **4 pass, 0 fail, 10 expect() calls**. The footer regression retains Validation details and checks that the overview still has its repair banner. The raw-caret regression belongs to the wording change below.

## Wording and action weight

Viewed the review's `states/local-clone-repository--connecting-wait-1440.png` against `/tmp/sw-C/after/states/local-clone-repository--connecting-wait-1440.png`: a complete circular spinner accompanies the plain workspace-connection explanation. Viewed `states/local-remote-folder--refused-1440.png` before and `/tmp/sw-C/after/states/local-remote-folder--refused-1440.png` after: Remove remote is outlined danger and Cancel is primary. Viewed `local-light/local-source-control-1440.png` and `/tmp/sw-C/after/local-light/local-source-control-1440.png`: the no-remote explanation uses normal text and Sync has one name.

The final header fix lets the phone Commit button grow around its existing count and prevents the icon and badge from shrinking. Its new SCM browser assertion measures the icon at 16 px and checks the visible count. The disabled-count policy is unchanged.

`test:git-setup`: **13 Git setup checks passed** (`/tmp/sw-C/final-git-setup.log`). Its repository-identity fixture now clears the foundation's ambient author overrides so repository-local Ana Lima remains the subject of its existing assertion. Completed-clone checks expect the new plain project sentence; waiting checks expect the workspace-connection explanation. `test:dialogs`: **9 dialog checks passed at six viewports** (`/tmp/sw-C/check-dialogs.log`). `test:scm`: **20 source-control checks passed** (`/tmp/sw-C/final-scm.log`).

The ValidationPanel regression retains the parser explanation and location while removing a caret-only line. `bun test tests/footer-counts.test.ts tests/editor-presentation.test.tsx`: **4 pass, 0 fail**.

## Rendered editor check

`test:editor`: **10 editor checks passed** (`/tmp/sw-C/check-editor.log`). The new browser assertion checks the actual rendered `name` key and `Shop` value against the dark tokens, then restores light. The large-save typing check releases its earlier API and page before starting its separate-process fixture, permitting reuse of the assigned API port. It measured 17.6 ms/key during saving versus 17.8 ms/key baseline, with no long task.

`test:validation`: **PASS invalid Source draft keeps its header state and one located message; {"errors":[]}** (`/tmp/sw-C/final-validation.log`). The malformed `name: [` input locates the missing closing bracket at line 2; the assertion uses that parser location.

Viewed `states/local-source-control--diff-modified-390.png` before and `/tmp/sw-C/after/header/local-source-control--diff-modified-390.png` after: the Commit icon is complete beside the visible count 3, and the unified comparison stays inside the phone viewport. This final header capture supersedes the earlier phone image for the count fix. The capture follows the original source-control state sequence through the modified selection, then stops.

Viewed `states/local-source-editor--validation-details-1440.png` before and `/tmp/sw-C/after/states/local-source-editor--validation-details-1440.png` after: the same Commerce malformed description retains the explanation, source excerpt and line/column; the raw caret is absent from the dialog message. Also viewed both Alice persona images: the same orders contract retains the commit textarea, commit action and New branch.

## Documentation

The Source control section in `docs/user-guide.md` describes staged deletion, the phone diff, read access and invalid drafts. These correspond respectively to the passing staged-deletion/phone SCM check, read-access SCM check, and invalid-Source-draft validation check named above. `changelog/C.md` records the visible changes. `test:terminology`: **Terminology check passed: no retired terms in 8 files' views, metric detail, wizard, README and docs** (`/tmp/sw-C/check-terminology.log`). Documentation leak scan: **0 hits in 2 files**.

## Comparison fixture lifetime

A full responsive run reached the desktop header and found Not saved plus a count where its unchanged saved-header baseline expects Saved. The newly added stale-save tour had persisted its draft to the shared API workspace. Its draft PUT is now intercepted, like its simulated conflicting file PUT. A focused entry-point run exercises all four comparisons at 1440 and 390, closes each page, then asserts `api.ws.state.drafts()` is empty: **8 comparison screens passed; both durable-draft assertions passed** (`/tmp/sw-C/tour-lifetime.log`). The first responsive attempt was interrupted by a frontend reload while changes/build generation were still occurring; the next run exposed this fixture leak. The final rerun uses settled sources.

The temporary full-unit port adapter originally prefixed the mock issuer path, correctly refused by the Entra authority validator. The revised temporary adapter exposes the provider on 5232 with its original tenant path and multiplexes other fixtures by path. Authentication preflight: **13 pass, 0 fail, 67 expect() calls** (`/tmp/sw-C/unit-port-preflight.log`). The invalid harness run was stopped and does not count as a successful unit gate.

## Presentation mutations

The existing targeted-mutation runner is extended only inside lane C's import and execution sentinels. The new runner uses temporary copies of `diff-presentation.ts` and its executable assertion cases, preserving the shared dispatcher's other categories and requiring a passing baseline. No dependency is added.

Focused result: **4 SCM presentation mutants detected; baseline passed** (`/tmp/sw-C/scm-mutations.log`). The staged-label decision loses its index predicate in one mutant; the identical guard loses both existence checks or each check separately in three more. Target 100%; 4 generated, 4 killed, 0 survived, 0 equivalent, 0 timed out; score 100%. The assertions distinguish present empty files, each absent side and unequal present contents. No defect or equivalent mutant was found. The full runner executed this baseline and these faults before its existing categories. The initial resource envelope was two CPUs (13,14), nice 19, MemoryMax 6G and no swap. The successful full rerun used four idle CPUs (0,1,10,11) with the same priority and memory limits.

## Final scope check and additional viewed pairs

The desktop added-file comparison must retain its existing two columns. The final scope review removed an unnecessary `newFile` prop from the selected-change caller; phone comparisons still use the requested unified mode. The added-file tour now asserts a MergeView above 650 px. `tests/scm-presentation.test.ts`: **9 pass, 0 fail, 28 expect() calls**.

Viewed the review's `states/local-source-control--diff-added-1440.png` and `states/local-dark-source-control--diff-added-1440.png`, paired with the matching basenames under `/tmp/sw-C/after/desktop-preserved/`: both desktop columns remain, the filename appears once, and the dark gutters are dark. The captures repeat the original fixture sequence through the added-file selection. The earlier added-file captures under `after/states` are superseded by these.

Viewed `states/local-clone-repository--cloned-folder-result-1440.png` before and `/tmp/sw-C/after/clone-completed/local-clone-repository--cloned-folder-result-1440.png` after: the same completed finance folder clone says **Cloned finance.** instead of **finance: Cloned.**. The temporary capture copy changes its old `Cloned.` substring expectation to the new plain sentence; the shared capture script is unchanged. Also viewed `states/local-source-control--commit-message-filled-1440.png` and its matching after under `/tmp/sw-C/after/states/`: the staged deletion keeps its committed content and selection after the message is filled, with no New file or identical claim.

After the desktop scope correction, `check`, `build`, `test:scm` and `test:theme` were rerun successfully (`/tmp/sw-C/desktop-results.txt`). The new desktop assertion passed in both themes. The earlier full unit and mutation runs cover the unchanged predicates and backend; this final rendering delta is covered by the browser tour, SCM checks and build.

## Final command results

Browser checks used `SW_BASE_URL=http://127.0.0.1:5231` and a temporary Bun preload binding the isolated API to 5232. The final unit transport (`/tmp/sw-C/transport.ts`, selected by `/tmp/sw-C/gate-ports.ts`) preserves distinct virtual fixture URLs and their issuer/host validation, dispatches Bun fetches in memory and routes Git HTTP through a proxy listening only on 5232. Browser children use the real 5232 fixture adapter. No production validation or repository test assertion was changed for this transport. Its preflight passed **44 tests, 0 failures, 163 assertions** across MSAL, OIDC, credential-leak and HTTP smoke cases.

Summary lines from the passing runs:

```text
bun test: 2078 pass; 0 fail; 130801 expect() calls
Ran 2078 tests across 287 files. [693.96s]
check: tsc, fmt:check, lint, check:comments, check:theme and check:brand exited 0
Comments are free of specification and task IDs.
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
No product name or logo is hard-coded outside public/brand.
build: 2305 modules transformed; built in 3.23s
test:scm: 20 source-control checks passed
test:editor: 10 editor checks passed
test:validation: PASS invalid Source draft keeps its header state and one located message; {"errors":[]}
test:autosave: 9 autosave and commit checks passed
test:git-setup: 13 Git setup checks passed
test:theme: 10 theme checks passed
test:dialogs: 9 dialog checks passed at six viewports
test:ui: 20 UI checks passed
test:terminology: Terminology check passed
mutation: 4 SCM presentation mutants detected; baseline passed
mutation: 666/666 targeted mutants killed; all unmodified module baselines passed
```

Logs: `/tmp/sw-C/unit-transport.log`, `/tmp/sw-C/desktop-check.log`, `/tmp/sw-C/desktop-build.log`, `/tmp/sw-C/desktop-scm.log`, `/tmp/sw-C/check-editor.log`, `/tmp/sw-C/final-validation.log`, `/tmp/sw-C/check-autosave.log`, `/tmp/sw-C/final-git-setup.log`, `/tmp/sw-C/desktop-theme.log`, `/tmp/sw-C/check-dialogs.log`, `/tmp/sw-C/check-ui.log`, `/tmp/sw-C/check-terminology.log`, `/tmp/sw-C/mutation-retry.log`.

The first full mutation attempt hit its 10-second per-case deadline at the unchanged example registry under the two-CPU cap. The same unmodified case passed standalone in 9.924 seconds. The four-CPU retry passed every baseline and all 666 existing mutants, plus the four new SCM faults. No timeout or equivalent fault was needed for the new SCM predicates.

## Uncompleted gate and integrator follow-up

**T047 completion is skipped, with this reason:** `bun run test:responsive` fails at `scripts/responsive-ui-tests.ts:1668`, the **examples: 1280×720 mall Graph toolbars keep the canvas height they had as dialogs** check. For `mall.odcs.yaml`, expected canvas height is at least **421**, received **407**. The same unchanged check against foundation commit `593f2c18efe1e4b495121da5b838791401e56072` receives **407**. The foundation frontend was served from an archived copy under `/tmp/sw-C/foundation` on 5231; API was 5232. Logs: `/tmp/sw-C/gate-responsive.log` and `/tmp/sw-C/foundation-canvas.log`. No ODCS, shell geometry or threshold outside lane C's ownership was edited. The integrator must resolve that inherited baseline failure and rerun the full responsive gate before marking the lane ready.

All comparison, header and preceding responsive sections passed in the full run. The sections after that stopping point were run using an unchanged-check temporary copy with a combined name filter: dark theme, graph canvases, shell screens and phone loading drawer. Result: **14 responsive UI checks passed**, including no uncaught browser errors (`/tmp/sw-C/responsive-tail.log`). This partial run does not replace or relabel the failed full gate.

The planned read-access assertion is in the owned SCM browser suite rather than the unowned Admin script. Carol and Alice were also captured with real server capabilities, as described above. The shared capture scripts retain stale History and `Cloned.` expectations; temporary copies adapt them without changing shared files. Expected missing-draft lookup 404s and the capture checker's covered-background reports are retained in the capture logs.

`python3 scripts/commit_cadence.py <worktree>` could not run because that file is absent (`/tmp/sw-C/commit-cadence.log`). No cadence tool was added. The committed-change readability audit reported **0 findings** (`/tmp/sw-C/readability-range.log`); public documentation and changelog leak scans reported **0 hits**. All screenshots and temporary drivers are retained under `/tmp/sw-C/` for integration review.
