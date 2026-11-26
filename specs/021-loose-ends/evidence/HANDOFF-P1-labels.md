# Collapsed Network label follow-ups

T003–T006 are complete on branch `021-labels`. The targeted tests and repository checks pass.
The graphical suite stops at the known neighborhood height assertion; the batch gate still needs
that inherited failure disposition. No merge or push to origin is included.

## Commits

| Task | Commit | Result |
| --- | --- | --- |
| T003 | `e978e6be` | Late route reports return before changing the pending map or scheduling a frame. The cleanup effect clears the mounted ref and cancels its frame. |
| T004 | `2f96c79c` | A real browser renders the hook under StrictMode: one cancellation, one pending frame and one measurement after effect remount. |
| T005 | `70038bdd` | Painted geometry decides viewport visibility, including tangency and chord-only crossings. Bounds remain the cheap reject. Placement keeps its existing sampled geometry. |
| T006 | `50775f37` | Inputs pass directly to the base hook. Named functions build appearance, handles, route detail and labels within the same module. Signature, output and memo dependencies are preserved. |

## Verification

The lifecycle tests use Chromium and therefore run on midgard through `sw-midgard-run`.

| Task | Command | Exit | Result |
| --- | --- | --- | --- |
| T003 | `sw-midgard-run -- bun test ./tests/label-route.test.ts` | 0 | 5 pass |
| T004 | `sw-midgard-run -- bun test ./tests/label-route.test.ts` | 0 | 6 pass |
| T005 | `sw-midgard-run -- bun test ./tests/label-route.test.ts ./tests/label-placement.test.ts ./tests/edge-labels.test.ts` | 0 | 31 pass |
| T006 | `sw-midgard-run -- bun test ./tests/label-route.test.ts ./tests/label-placement.test.ts ./tests/edge-labels.test.ts` | 0 | 31 pass, tests unchanged from T005 |
| Each task | `bun --bun run check` | 0 | TypeScript, formatting, lint, comments, theme and brand checks pass |
| Each task | `bun x oxfmt` with that task's changed files | 0 | Repository formatter applied |
| Changed source and tests | `python3 ~/.claude/skills/readable-code/scripts/readable_check.py --changed <files>` | 0 | No findings |
| Documentation | `python3 ~/.codex/skills/project-docs/scripts/docs_sync.py --worktree .` | 0 | No findings |
| T005 graphical comparison | `sw-midgard-run -- bun run test:graph` | 1 | Known height assertion, detailed below |

A TypeScript AST span inspection of `useFullGraphEdges.ts` finds a maximum function length of
40 lines. The exported hook occupies 12 lines. No dependencies were added.

## Graphical comparison

All 16 opening cases pass: UBL and Mall, Network and Layered, at widths 390, 1280, 1440 and
2560 px. The pending-layout controls check also passes. Execution then stops in
`checkNeighborhood`, at `scripts/helpers/graph-review-checks.ts:90`:

- Expected height: at least 480 px.
- Candidate height: 458.609375 px.
- Known main height supplied with this job: 409 px, against the same 480 px assertion.

This is the same failing assertion, with a different measured height. Main was not rerun.
The suite prints no collapsed Network label counts for UBL or Mall, so count parity is not
established by its output. The four painted-curve unit cases pass, including placement of a
label on a tangent whose samples and endpoints remain outside the viewport.

An earlier exploratory wrapper execution stopped on a name-size polling timeout during the
opening cases. The final command above passed all those opening cases and supersedes that result.

The graphical command used a temporary Bun preload to start Vite on 5483 and bind the isolated
API on 5484. Data and captures stayed under `/srv/dev/tmp-021-labels/graph-final`. Suite assertions
were unchanged. The temporary Bun configuration was restored and both app servers stopped.
Launchers and local logs stay outside Git in the job scratch directory.

## Remaining work

The shared batch gate owns the full unit suite, mutation tests, integrated captures and final
review. The inherited height assertion and the absence of printed label-count evidence remain
explicit limitations of this graphical run. There are no remaining implementation changes in
this lane. All four task proofs are recorded in `specs/021-loose-ends/tasks.md`.
