# Regression gate handoff

The gate remains incomplete at candidate `73ececee`, compared with main `da54cf17`.
No browser suite, mutation run, capture or pixel comparison was started in this round.
No regressions have been confirmed or cleared. The capture classification counts remain unmeasured.

## Inspection results

| Command | Exit code | Result |
| --- | --- | --- |
| `git status --short` | 0 | Clean before this note. |
| `git log -5 --oneline` | 0 | Candidate is `73ececee`. |
| `git show da54cf17:GATE.md` | 0 | Main records inherited responsive, graph, editor, lineage and back-history failures. |
| `git diff 3801e71c da54cf17 -- package.json` | 0 | Additional suites identified below. |
| `head -140 ~/.local/bin/sw-midgard-run` | 0 | Wrapper performs a force push, hard reset and clean before executing tests. |
| Read the three supplied comparison helpers over SSH | 0 | Capture helper terminates children by process pattern; use exact owned PIDs instead. |

## Existing results supplied with the brief

These were not rerun: unit suite at `d5d84e57`, exit 0, 4383 pass and 0 fail;
build exit 0. They do not establish the full gate at `73ececee`.

## Execution constraint

The required wrapper performs operations explicitly prohibited by the round:
`git push --quiet --force`, `git reset --quiet --hard` and `git clean --quiet -fd`.
A clarification is pending about using a transfer-only adapted wrapper or permitting the
original wrapper exclusively for the development scratch repository and checkout.
The original wrapper was not invoked. No push or force operation occurred.

## Next step

Resolve the wrapper conflict, then run the browser suites from the task list and main additions:
`test:tessera`, `test:item-diff`, `test:attributes`, `test:mesh`, `test:compile`,
`test:usage-traffic`, `test:connections`, `test:mcp`, `test:mcp:browser`, `test:proposals`
and `test:acp`. Follow with `bun scripts/mutation-tests.ts`.
Use an isolated loopback network and ensure test listeners meet the permitted port range;
several existing helpers allocate ephemeral ports by default.

Compare unexpected assertions with main before classifying them. Then capture the requested
matrix, compare pixels against main and the accepted candidate, inspect changed regions,
and record classification counts and any fixes in the gate. Verify the legend below the
neighborhood canvas and the combined metric content width. Leave the completion task unchecked
until the comparisons establish zero remaining regressions.
