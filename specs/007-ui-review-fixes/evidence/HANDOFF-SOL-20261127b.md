# Comparison notice fixes

Both requested comparison-notice issues are resolved in separate local commits on `007-ui-review-fixes`.

| Issue | Commit | Status |
| --- | --- | --- |
| Head reuse across projects with the same branch name | `5a0ac018` | Fixed: retain a head only when project and branch match. |
| Ambiguous comparison notice assertion | `c0c79cf8` | Fixed: assert against the dialog’s `.item-overlay-status`. |

The head-retention decision is a pure function in the existing item-diff hook module. Unit coverage switches from one project on `main` to another project on `main` with a different head, including the intervening status-loading state. Additional coverage preserves same-checkout loading behavior, clears the head on a branch switch, and checks a real head movement. Item-comparison documentation now explains project-scoped history.

## Commands and results

| Command | Result | Exit code |
| --- | --- | --- |
| `bun test tests/item-diff/overlay-control.test.tsx` before the predicate fix | 3 pass, 1 fail: the second project retained `first-head` while loading. The extraction still used the original branch-only predicate. | 1 |
| `bun test tests/item-diff/overlay-control.test.tsx` after the fix, repeated on the final code | 4 pass, 0 fail; 15 assertions. | 0 |
| `sw-midgard-run -- bash /srv/dev/review-run.sh bun run test:item-diff` | Six baseline DOM structures, two expanded toolbars, light/dark at 390 and 1440 px, branch notices, held names, overlay refresh, publication retry and no push all passed. | 0 |
| `bun run check` for the first fix and again on the final code | TypeScript, formatting, lint, comments, theme and brand checks passed. | 0 |
| `bunx --bun oxfmt src/app/item-diff/use-item-diff.ts tests/item-diff/overlay-control.test.tsx docs/item-diff.md` | Formatted the supported TypeScript files; Markdown is outside this formatter’s supported set. | 0 |
| `bunx --bun oxfmt scripts/item-diff-browser-check.ts` | Passed. | 0 |
| `python3 /home/rodrigo/.codex/skills/readable-code/scripts/readable_check.py --changed src/app/item-diff/use-item-diff.ts tests/item-diff/overlay-control.test.tsx` | Passed. | 0 |
| `python3 /home/rodrigo/.codex/skills/readable-code/scripts/readable_check.py --changed scripts/item-diff-browser-check.ts` | Passed. | 0 |
| `python3 /home/rodrigo/.codex/skills/project-docs/scripts/docs_sync.py --worktree .` | Passed. | 0 |
| `git diff --check` | Passed. | 0 |

Browser execution used the existing remote helper, disposable data under `/srv/dev`, and frontend port 5481. Logs are in `~/scratch/sw-007/fix-session-2/`: `before.log`, `unit-final.log`, `item-diff.log`, `check-a.log` and `check-final.log`.

## Open regressions and next step

No open regression remains within these two requested fixes. The full regression gate, capture comparison, and mutation suite were outside this narrow session and were not repeated. T076 and the existing gate disposition remain unchanged.

Next step: review the two local fix commits. No origin or GitHub push, merge into main, or branch deletion was performed.
