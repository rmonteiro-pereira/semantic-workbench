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
