# Implementation evidence

## Base and prerequisites

- The implementation base includes the attribute rule and annotation slot from attributes and governance.
- Research, data-model and quickstart documents are absent from this feature directory. The available
  implementation documents are the specification, plan, task list and operation contract.
- The formatter excludes fixtures and Markdown; changed TypeScript uses the repository Oxfmt configuration.
- `scripts/commit_cadence.py` is absent from this base.

## Task departures

- T005 is unnecessary as written: `src/shared/attributes/attribute-rule.ts` already owns `isAttribute`
  and `conceptKindLookup`. The comparison will import that rule instead of adding a duplicate
  `src/shared/item-diff/attribute-kind.ts`. Its targeted proof is retained in
  `tests/item-diff/attribute-kind.test.ts` and covers the five requested predicates.

## Proofs

- T001: `bun test tests/item-diff/repository.test.ts`: 2 pass, 0 fail, 36 assertions.
  The semantic fixture uses the standard model format; Tessera markers on semantic models are refused
  by this base. Both committed fixtures pass the shared inspector.
- T002: baseline recording on the development server completed with six rendered structures and three
  consumer answers; `bun test tests/item-diff/baseline.test.ts`: 1 pass, 0 fail, 5 assertions, both
  locally and on the development server. The recorded full graph includes the built-in String card.
  DOM recording excludes transient coordinates, SVG ids and selection classes; it retains element
  hierarchy, classes, labels and text. No source changes preceded recording.
- T003: `bun test tests/item-diff/sides.test.ts`: 3 pass, 0 fail, 15 assertions.
- T004: `bun test tests/item-diff/bounds.test.ts`: 3 pass, 0 fail, 11 assertions.

- T008 adds `src/shared/item-diff/model-items.ts` to extract addressed comparison inputs in one
  reusable pure module. Container child collections are excluded to avoid reporting a concept edit
  as an ontology edit too; relationship roles remain a relationship field. This seam is also the
  server service's extraction input. The plan named no extraction module.
- T006: field changes, 3 pass, 0 fail, 11 assertions.
- T007: address comparison, 6 pass, 0 fail, 12 assertions.
- T008: serialization and Tessera proofs on the development server, 3 pass, 0 fail, 36 assertions.
  The examples test uses a 60-second timeout because the server run took 13.85 seconds.

## Operation phase blocked by migration provenance

The operation cannot select migrations that happened **between the requested sides** using this
base's recorded history. The plan permits no new durable state and proposes reading the existing
project history directly. That history is neither branch-scoped nor versioned alongside definitions.

Concrete reproduction: `bun test tests/item-diff/migration-scope.test.ts` passes with 6 assertions.
A workbench rename on `work/comparison` writes a migration. Restore the original bytes, create
`work/outside` at the same HEAD, and save identical renamed bytes without declaring a migration.
Both branches now have the same before/after definition bytes, the same HEAD and the same migration
history, although only the first branch performed a recorded rename. The required result is one
changed item for the first branch and remove plus add for the second. Ancestry cannot distinguish
these cases because the record names their shared pre-edit HEAD.

Relevant existing code:

- `src/server/projects/workspace/document-save.ts`: `saveMigrations` reads `localCommit` before saving;
  `saveFile` appends the records using the global workspace layout, regardless of the working copy.
- `src/server/projects/workspace.ts`: `localCommit` returns `git.head`, not a resulting saved version.
- `src/server/projects/address-migrations.ts`: `addressMigrationFile` keys only by project;
  `readAddressMigrations` filters endpoint visibility but has no side or branch provenance.
- `src/shared/core/address-migration.ts`: `MigrationRecord` holds id, kind, endpoints, time and commit;
  it has no branch, copy or resulting content version.

The pure comparison accepts an already-selected migration list. No route should pass the entire
project history to it: that would misclassify outside renames after branch switches. T010–T018 are
left unticked and the operation phase is stopped, as required for a specification/base contradiction.
The dependent overlay, branch journey, publication review and their browser proofs remain pending.
The independent planner status flag can proceed.

Resolution needed: agree a durable provenance contract for saved and committed migrations across
branches and working copies, including historical comparisons and legacy records. This changes the
plan's no-new-state constraint and requires changes to the existing migration writers, outside its
listed file ownership. Do not weaken the no-similarity or outside-rename rule to bypass this gap.

## Independent planner proof

- T031: `bun test tests/item-diff/planner-flag.test.tsx`: 3 pass, 0 fail, 7 assertions.
- `scripts/item-diff-planner-browser-check.ts` passed on the development server at 1440×900
  and 360×800, light and dark, for approved, proposed, legacy draft, deprecated and absent status.
  Geometry, clipped text and contrast checks passed. This checks only the independent planner
  change; it does not replace the pending overlay browser check.
- The browser fixture supplies authenticated same-origin metadata when intercepting the preview
  context request. Without it the existing browser-only route correctly refuses the test client.

## Remaining work and batch hand-off

| Tasks | Status and reason |
| --- | --- |
| T005 | Skipped as unnecessary; the existing attribute rule is reused and its proof passes. |
| T010–T018 | Stopped at the operation phase because the base lacks migration provenance between named sides. No operation, route or authorization row is added. |
| T019–T030, T032–T034 | Pending the operation and overlay data. Standalone UI fragments are not enabled against an incorrect comparison. |
| T035 | Remains unticked for the later capture job. No screenshot set or visual-review claim accompanies this partial implementation. |
| T036 | Pending the operation phase prerequisite; mutation wiring and the integrated mutation run remain outstanding. |
| T037 | Pending the actual mark and its theme treatment. |
| T038–T039 | Full-feature documentation remains pending the implemented behavior. Existing architecture and usage documentation describe only the pure module and planner status flag. |
| T040 | Pending the overlay; no performance measurements or target claims are made. |
| T041 | Partial verification only; the operation parity case and overlay browser proof cannot run before those features exist. |
| T042 | Final delivery hand-off remains unticked because the feature is blocked. |

The integrated batch still owns the full unit suite, full mutation suite, all browser suites,
the last-release UI regression across the full graph journey and the architecture review. These
must not be inferred from the targeted proofs. The current branch is not ready as the complete
item-diff/overlay feature. Reviewers must not wire all global address history into a route as a
shortcut around the provenance gap.

Follow-ups outside this base: shared proposals register the proposal side and use the change list;
usage counters add their separate traffic field and annotation; the MCP contract records the
not-exposed reason for `items.diff`. These integrations remain pending, and no graph shared-file
block has been added. The attributes annotation slot already exists on the base.

## Verification corrections

- The first combined server group had 86 passes and 2 failures in the new repository fixture;
  all 60 existing authorization tests passed. Bun subprocesses need `env: process.env` to receive
  the identity installed by the isolated fixture. The correction is in commit `c7f7ceb7`.
- The final address comparison proof includes address reuse after a recorded rename: 7 pass,
  0 fail, 14 assertions. Migration selection must be correct before calling this pure function.
- No existing test file was changed. All new tests are under `tests/item-diff/` and use temporary
  workspaces or fixtures; none reads the specification directory.
- No extension hook file exists at `.specify/extensions.yml` on this base.

## Implementation commits

| Commit | Change |
| --- | --- |
| `2a922619` | test: add two-state item comparison repository (T001) |
| `74813767` | test: validate comparison fixture against the shared parser |
| `2a2e1378` | generated: record item comparison DOM and consumer baseline (T002) |
| `c725e27d` | feat: parse named comparison sides with an extensible registry (T003) |
| `6f6cc691` | feat: bound item comparison responses and field values (T004) |
| `f1d1dcb5` | test: reuse the existing attribute classifier for item changes (T005) |
| `4c91f0ce` | feat: compare parsed item fields without serialization noise (T006) |
| `dc97126d` | feat: match item changes by address and recorded migrations (T007) |
| `6d92f3b0` | test: prove serialization and Tessera changes at addressed items (T008) |
| `c5875792` | test: prove deterministic item comparison under shuffled inputs (T009) |
| `324e15f9` | test: demonstrate missing branch provenance in address history |
| `96baa84b` | feat: label non-approved metrics in the query composer (T031) |
| `c7f7ceb7` | test: pass the isolated Git environment to fixture subprocesses |
| `88c2c8f5` | fix: honor recorded renames when an old address is reused |
| `6957d141` | refactor: accumulate duplicate address candidates without repeated copying |
| `b49d835f` | fix: validate branch characters without a control-character regex |

## Final targeted verification

All heavy commands below ran through `sw-midgard-run` on the development server.

| Proof | Final summary |
| --- | --- |
| Repository fixture | 2 pass, 0 fail, 36 assertions. |
| Published consumer baseline | 1 pass, 0 fail, 5 assertions; context, plan and explanation remain byte-identical. |
| Side parsing | 3 pass, 0 fail, 20 assertions. |
| Response bounds | 3 pass, 0 fail, 11 assertions. |
| Existing attribute classifier | 2 pass, 0 fail, 5 assertions. |
| Parsed field comparison | 3 pass, 0 fail, 11 assertions. |
| Address comparison | 7 pass, 0 fail, 14 assertions. |
| Serialization and Tessera | 3 pass, 0 fail, 36 assertions. |
| Shuffled-input determinism | 1 pass, 0 fail, 100 assertions. |
| Migration provenance diagnostic | 1 pass, 0 fail, 6 assertions, reproducing the blocker. |
| Planner labels | 3 pass, 0 fail, 7 assertions. |
| Combined final feature group | 29 pass, 0 fail, 251 assertions; exit 0. |
| Existing authorization matrix, operation parity, snapshot parity and inventory | All 60 tests passed. |
| Planner browser check | PASS at desktop and phone width, both themes, all five status cases, geometry and contrast. |
| `bun --bun run check` | Exit 0: TypeScript, formatting, lint, comments, theme and branding. Lint reports 2,679 warnings and zero errors. |
| `bun --bun run build` | Exit 0. Bundler warnings concern the dependency's `use client` directive and large chunks. |
| Readable-code checker | Exit 0 on every changed source, test and script file. |
| Leak scanner | Exit 0 on every changed file; specification logs use confidential-only mode. |
| `git diff --check` | Exit 0. |

The first `check` refused the branch-name regex for control characters and an unnecessary escape.
Commit `b49d835f` replaces that regex predicate without disabling lint rules and adds malformed-name
cases. The final combined test/check/build command above ran after that correction.

No full unit suite, mutation suite, other browser suite, deployment, project-remote push or tag
was run. The browser frontend used port 5447 and an isolated API. Process inspection after the
checks showed no remaining frontend, baseline recorder or planner-check process from this run.
The missing commit-cadence script could not run; all changes are committed in coherent steps.


## Git-backed address provenance

The owner adopted Git-backed history after accepting the branch reproduction above. The earlier
blocking decision is superseded. The side comparison may proceed once the provenance gate passes.

- `bda7bdfd` replaced project state writes with journaled Git working-copy history for single and
  batch saves, file moves, deletions and reconciliation. Legacy rows import on the first write.
- `bb3daef7` excluded the history from scanning and compile inputs. Two branches with independent
  records merged with Git's union driver, and both old addresses resolved. Commit `a28fb6f5`
  proves this when both branches first create the file independently.
- `4872a2b2` resolved consumer addresses against the published pin and browser editor addresses
  against saved files. A browser saw an alias before publication, while a consumer saw it after.
- `bce97f93` included matching records in selective commits and journaled record changes on file
  revert and undo. The selective test preserved a different staged definition. Commit
  `9e1b853d` then covers committing that staged definition and its remaining record.
- `e9c5f11b` placed reconciliations in the actual editor working copy and verified that a fresh Git
  clone resolves an old address without a legacy state file.

Existing tests changed for location only:

- `tests/address-migration-store.test.ts` writes JSON Lines fixtures and looks inside the archived
  project payload for committed bookkeeping.
- `tests/address-reconciliation.test.ts` inspects the signed-in editor's working-copy history.
- `tests/item-address-operations.test.ts` inspects the reconciler's working-copy history and resolves
  the alias in that same editor view during the HTTP/twin replay proof.
- `tests/address-operation-parity.test.ts` reads the editor copy when comparing the record sequences
  produced by the HTTP and twin save, move and delete cases.

Targeted proofs include 17 address-store tests (150 assertions), 4 declared-save tests
(30 assertions), 2 reconciliation tests (14 assertions), 3 address-operation tests (22 assertions),
7 Git tests (22 assertions), 2 address parity tests (34 assertions), and 12 branch provenance tests
(64 assertions), all passing.

The first server-wide pass caught two parity fixtures that still inspected the shared checkout.
Both passed after correcting the test location (34 assertions). The existing trash suite also
caught a clean-worktree regression after undoing the first history write. Commit `52235ecd`
removes the new file and its union rule when the undo leaves no committed history.
All eight existing trash tests then passed (65 assertions).
The shared-module boundary check flagged the unchanged Tessera schema import in
`src/shared/tessera/bases.ts`, introduced before this feature in `d9962218`.

The pipeline's existing browser matrix is missing `test:attributes` and `test:tessera` from the
gate suite list. Those files match the base. The integrated browser gate needs both rows.
The new project trash recovery test interrupts the legacy import, recovers the journal, and
checks that the record is in the archived project with the old state file gone.

Project export is part of the provenance access boundary. The file export excludes the metadata
from both the archive and the omission count. Scoped Git bundles check historical endpoints
and verify that the bundle advertises the authorized commit. The existing export authorization
suite passed all six cases (29 assertions).

### Provenance verification

- Detached full development-server run on the first integrated provenance snapshot: 3,063 pass,
  36 fail, 347,374 assertions across 411 files in 2,021.25 seconds. Check and build exited 0.
- Focused development-server rerun on the corrected provenance implementation: 105 pass, 0 fail
  across 23 files in 75.48 seconds. The side-difference and definition exclusion mutants both
  failed their tests. Check and build exited 0. Vite built in 3.02 seconds.
- The full run found six phase regressions in operation-parity fixtures and trash, startup and undo
  behavior. The fixes passed the focused rerun. The remaining full-run failures concern the
  unchanged Tessera schema lookup, the Azure browser suite list, authorization-boundary scanning
  of the attribute mutation fixture, and the older expected session capability response.
- MCP file, usage-counter and shared-proposal proofs wait for the features that supply those
  surfaces. The available file routes, the agent API and Tessera are covered here.

### HTTP operation and browser integration

- The separate working case for a server caller without a personal copy uses the published
  pin as its editing baseline. This keeps shared repository checkouts from masquerading as the
  person's saved files. Comparison never creates a copy.
- Project history is inventoried as a browser-only read. Direct operation and HTTP parity match
  the body, status and audited decision for four caller cases. Removing the per-file predicate
  exposed a restricted pathname and failed the test. Removing the browser surface check
  returned 200 to the unmarked application request and failed its proof.
- The publication confirmation in this codebase is in SyncDialog.tsx.
  DefaultBranchActions.tsx offers the launcher. The review belongs with the confirmation,
  where it compares the committed tip that the button publishes.
- The uncommitted branch fixture's first browser pass found that full-model cards were arranging
  the mark and title in a row. Marked cards now stack the title and annotation inside the same
  outer dimensions. The subsequent run passed at 1,440 and 390 pixels in both themes and found
  a test-only Git identity issue in the branch-commit step. The test now supplies an identity on
  the single Git command.
