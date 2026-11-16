# Lane C

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

The surface assertion failed before the fix: expected `rgb(15, 21, 20)`, received `rgb(245, 245, 245)`. The four comparison screens then passed (modified, added, staged-deleted, stale-save). This failure demonstration used the unchanged foundation's comparison code, rather than a separate e8b7d69 checkout.

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
