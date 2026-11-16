# Integration and regression gate

Status: in progress. No visual pair is classified before both images have been opened.

## Scope ledger

- Existing lane modules and public contracts remain the implementation boundaries.
- Integration combines lane changes and can expose shared-style or capture-expectation conflicts.
- Corrections cover named findings and observed failures through existing entry points.
- Gate evidence distinguishes current failures, baseline failures and completed visual inspection.

## Command journal

All commands run from this worktree. Raw output is retained in `.data/gate/logs/` unless a row names another location. No push, remote changes or deployment is authorized.

| Command | Summary |
| --- | --- |
| `pwd; git status --short; cat README.md; cat ARCHITECTURE.md` | Correct integration worktree; initially clean; existing architecture read. |
| `cat specs/007-ui-review-fixes/{tasks,plan,quickstart,capture-index}.md` | Merge boundaries, suites and capture matrix read. |
| `git merge --no-ff 007-lane-a -m 'merge: integrate graph review fixes from lane A'` | `f1398bf8`; clean merge, no conflicts. |
| `bun test` | Running after merge A; raw log `A-test.log`. |
| `bun --bun run check` | Passed after A; formatter, lint, comments, theme and brand checks passed. |
| `bun --bun run build` | Passed after A; `built in 1.51s`. |
| `find <baseline>/screenshots -type f -name '*.png'` | Exactly 3,559 baseline PNG images. |
| `df -h . /tmp; free -h` | 59 GiB worktree filesystem free; 8.3 GiB temporary filesystem free; 25 GiB available memory. |

## Pending checks

T074–T077 remain open until their recorded requirements pass. T078 belongs to the subsequent architecture review.

### Merge A unit result

```text
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2077 pass
 0 fail
 130795 expect() calls
Ran 2077 tests across 286 files. [321.82s]
```

### Merge B

`git merge --no-ff 007-lane-b -m merge: integrate UI review fixes from lane B`: exit 0. Full output: `B-merge.log`.

`bun test`: exit 0.

```text
{"ok":false,"restored":"restored","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"smoke":"passed"}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"name":"updated","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"event":"record","before":{"name":"previous","version":"0.3.0","commit":"cccccccccccccccccccccccccccccccccccccccc","digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}}
{"ok":true,"restored":{"tag":"v0.4.0-alpha.1","version":"0.4.0","packageVersion":"0.4.0","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","digest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"updated"}}

 2083 pass
 0 fail
 130825 expect() calls
Ran 2083 tests across 286 files. [292.31s]
```

### Capture fixture ports

Existing API/mock/Git factories already accept OS-assigned ports. The follow-up adapters unnecessarily forced fixed ports; removing those adapters preserves fixture behavior. The second frontend retains
the same graph-reopen stages with a dynamically allocated port and a private cache. No application behavior changes.

- `bunx --bun oxfmt scripts/ui-review/{followup-local,followup-trash,followup-server,known-issues}.ts`: formatted four files.
- `bunx --bun tsc --noEmit`: exit 0.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <four capture scripts>`: exit 0.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/port-smoke graphs`: transport/setup succeeded;
  light/dark state assertions failed because the old driver clicked a counted area instead of expanding to an entity. This capture-expectation failure remains to fix; these are not final gate pairs.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/known-issues.ts .data/gate/reopen-smoke 11 11`: exit 0; dynamic frontend 42327; toolbar appeared in 80 ms; canvas 954×507; exact started listener stopped.

### Known temporary-directory assertion

`git archive e8b7d69 | tar -x -C .data/gate/main` creates a baseline copy inside this worktree; dependency resolution uses this worktree's node_modules.
`TMPDIR="$PWD/.data/gate/tmp" bun test ./.data/gate/main/tests/pipeline/deploy-azure.test.ts`: `4 pass`, `1 fail`, `18 expect() calls`.
The failure is the same hard-coded `/tmp/sw-deploy-registry-` prefix at line 100. Baseline production code correctly honors TMPDIR. A portable assertion is still pending.

`bun scripts/mutation-case.ts <archived-main>/src/shared/projects/examples.ts example-registry`: exit 0 without the runner deadline. This is diagnostic only; the complete mutation gate is pending.

`bun --bun run check`: exit 0.

```text

All matched files use the correct format.
Finished in 652ms on 1037 files using 28 threads.
$ bunx --bun oxlint --quiet src scripts tests
$ bun scripts/check-comments.ts
Comments are free of specification and task IDs.
$ bun scripts/check-theme.ts
No colour literals outside src/shared/theme/theme.css and src/app/theme/theme-palette.ts.
$ bun scripts/check-brand.ts
No product name or logo is hard-coded outside public/brand.
```

`bun --bun run build`: exit 0.

```text
   │
   │ Help: For more information, see https://rolldown.rs/in-depth/directives#other-directives
───╯

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.53s
```

### Merge C

`git merge --no-ff 007-lane-c -m merge: integrate UI review fixes from lane C`: exit 0. Full output: `C-merge.log`.

### Capture expectations and scratch roots

- Expanded-area entity selection now uses the existing Expand all helper before native node clicks. First-view captures retain the new counted-area presentation.
- Source-control history is an existing region rather than a button. Phone diff sequences use Back to changes between selections and before staging or entering a commit message.
- Scratch factories now resolve the system temporary directory rather than hard-coding `/tmp`; the gate can keep their data inside its ignored TMPDIR.
- `SW_BASE_URL=http://127.0.0.1:5261 SW_FOLLOWUP_WIDTH=1440 SW_FOLLOWUP_ONLY=network-node-selected bun scripts/ui-review/followup-local.ts .data/gate/expectation-smoke graphs`:
  light and dark captures both report `failed: false`, inspector visible, Network layout, no geometry problems.
- `SW_BASE_URL=http://127.0.0.1:5261 bun scripts/ui-review/source-control-states.ts .data/gate/scm-smoke`: in progress; 68 captures through light/2560 with no unreachable state so far.
- `bun --bun run check`: exit 0 after these capture updates; raw log `capture-updates-check.log`.
- Readability checker on all changed capture scripts: exit 0.
- Full leak scan on `docs/development.md`: exit 0 after replacing machine-specific sample output paths with ignored relative output paths.

These scratch captures are driver verification only. Final merged-branch capture and pair classification remain pending.
