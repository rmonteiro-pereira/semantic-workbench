# Implementation evidence

## Scope ledger

- `inspect` and `validateInput` already validate one file and preserve its source paths.
- Publication already reads immutable candidates and advances each repository atomically.
- Units add cross-file reference resolution and must retain physical source addresses.
- Set findings require reader and authorization-state isolation outside the shared parse cache.
- Existing operation-boundary and publication enforcement remain authoritative.

## Integration baseline

Merge commit e1472b40 integrates 019-compile-everywhere with --no-ff. Conflicts in CHANGELOG.md,
package.json, scripts/gate-suites.ts and scripts/mutation-tests.ts retain both branches' entries.
The attribute-only mutation filter remains after registration of the compile mutants.

The merged compile client required report version 1 while the shared compiler produces version 2.
The client now accepts version 2 and the existing acknowledgement test also rejects unknown version 3.
The status-count fixture now includes approved, deprecated, notSet and proposed as the shared type
requires. The compile goldens were regenerated with UPDATE_GOLDEN=1 through golden.test.ts.
No generated schema or operation table required a delta after regeneration.

Development-server proofs:

- Combined baseline: 760 tests across 68 files; 757 pass and three integration failures (two golden
  comparisons and the compile acknowledgement), all corrected above. The non-compile groups pass.
- Corrected compile group: 111 pass, 0 fail, 376 assertions, 17 files, 122.71 seconds.
- Corrected status-count fixture: 8 pass, 0 fail, 24 assertions (single local file).
- Final merged check: exit 0; TypeScript, formatter, lint, comment, theme and brand checks pass; lint reports 2,684 warnings and zero errors.
- Final merged build: exit 0, 2,365 modules, 2.86 seconds; existing directive/chunk warnings remain.
- Standard unchanged baseline: 43 pass, 0 fail, 45 assertions before format changes.

The initial scratch run omitted staged merge additions and auto-merged staged changes because the
transport copies unstaged/untracked files over HEAD. That run is excluded from the merge proof.
Unstaging the merge paths before scratch synchronization supplied the complete tree. A login shell
also removed Bun from PATH in the first invocation; subsequent commands use a non-login shell.

## Setup

T001: the fixture inventory names each planned unit file and each refusal envelope with its code.
T002: direct inspect/validateStructured callers and indirect model consumers are classified in
callers.md. The source search contains no direct caller absent from the table.
The owner qualification decision is recorded in research.md and contracts/unit-and-parts.md;
its executable qualification proof belongs to T015, which remains open.
