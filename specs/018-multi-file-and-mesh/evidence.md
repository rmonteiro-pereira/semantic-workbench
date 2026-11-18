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

T003: fixtures.test.ts: 3 pass, 0 fail, 31 assertions. Every unit file parses, the three-part
unit equals the one-file twin in concept/relationship order, and the empty root gets the same
concepts from its part. JSON syntax in .yaml files is intentional: JSON is a YAML subset and the
fixture values remain readable without introducing another serializer. This proof checks fixture
content, not unit validation, which is still pending.

T004: fixtures.test.ts: 4 pass, 0 fail, 155 assertions with all 26 refusal envelopes present.
Each envelope's files parse and the fixture inventory names its expected finding. Link paths are
caller-supplied metadata, not links followed by the fixture loader. The pin fixture distinguishes
an available object from published history. These are inputs for the later refusal proofs; no
claim is made that the current validator emits their set findings. The fixtures are split across
two commits to keep each change within the file limit.

T005 and T006: mesh-workspace.test.ts: 6 pass, 0 fail, 30 assertions. Shared repositories use one
repository with three registered project folders; separate repositories use three. Published bytes
stay unchanged after an unstaged import and a personal branch. Provider changes advance only the
intended repository snapshot and retain an unstaged consumer import. The authorization fixture
hides the retail part from Alice and includes it for Bob; units has no domain. Fixture disposal
closes the latest workspace as well as the original fixture lifetime.

The helper follows publishFixture's direct Git/pointer setup to install committed fixture states.
It is not evidence that the ordinary publication path accepts or refuses a unit; T030 and T031
must exercise the real publication boundary. No production validation is bypassed by application
code. Revision 3 remains unsupported until the foundational format tasks are implemented.

Merge operation-boundary proof on the development server: 46 pass, 0 fail, 45,038 assertions,
4 files, 124.07 seconds (inventory, route actions, matrix and compile parity). Regenerating the
operation table gives no diff.

## Setup checkpoint and remaining implementation

Completed: T001–T006 only. No task was skipped as wrong or unnecessary. T007–T063 remain open;
this is not a completed feature or a release-ready state. Revision 3 still fails closed under the
existing unsupported-revision rule. No mesh runtime module, route, dependency writer, publication
check, compile translation, address map or UI has been implemented.

Final development-server setup proof: tests/mesh/ has 10 pass, 0 fail, 185 assertions across two
files, 5.13 seconds. Check exits 0 with 2,684 lint warnings and no errors. Build exits 0 with 2,365
modules, 3.08 seconds and the existing directive/chunk warnings. The changed code passes the
readable-code checker. The repository formatter excludes Markdown and fixture trees. Leak scans
of the added fixture files and changed product prose pass; internal evidence is scanned for
confidential terms. The repository has no scripts/commit_cadence.py.

No browser check or mutation run proves mesh behavior yet. There is no test:mesh command at this
checkpoint. T053 and its dependent screenshot review T054 stay open for the later capture job.
MCP, usage-counter and item-diff integration are still absent from this base and require their
later integration proofs. Their absence does not account for the unfinished foundational tasks.

No imported block has been added to full-node-data.ts, FullGraphNodes.tsx, NeighborhoodGraph.tsx,
RelationshipEdge.tsx, GraphOptions.tsx or legend.css. Those files retain their baseline behavior.

Batch-gate owner: after implementation, run the integrated full suite, full mutation inventory,
remaining browser suites, release comparison and architecture review once. The feature's own mesh
browser and targeted mutant proofs must exist and pass before that handoff. Do not use the fixture
syntax checks as proof of any runtime refusal, pin, publication, privacy or compilation guarantee.

Reviewer: the production delta after the merge is only the report-version acknowledgement fix;
check the regenerated golden report and complete status counts. Existing tests changed in the
merge resolution are tests/compile/api.test.ts and tests/compile/loss-preview.test.tsx.
Security reviewer: meshWorkspace and publishFixture install fixture Git objects and publication
pointers directly. This setup cannot prove production publication authorization, dependency
atomicity, hidden/missing timing equivalence or reader-specific finding isolation. Those runtime
proofs remain mandatory. No security guarantee of revision 3 is claimed at this checkpoint.

Only scratch transport was pushed; no project remote, tag or deployment was changed. No persistent
server or browser process was started; every test and wrapper command has finished.

T007 registers the four unit properties at revision 3. The registry proof has 8 passing
tests, and the mesh registry proof has 5 passing tests including rejection by a revision 2
reader. The schema and runtime selection follow in T008 and T017.

For integration with 017, the committed `.semantic-workbench-address-migrations.jsonl`
file remains outside definition reads, unit membership and compiler inputs. The shared
`ADDRESS_HISTORY_FILE` constant can replace the local duplicate when 017 integrates. Enumerate the root and its declared parts for a unit.
The dependency manifest is separate metadata and is never a part.

Concept moves between declared parts run through the existing journaled batch save. The
whole-file move service moves a file and cannot express a concept transfer. The batch
compares the original and candidate definitions before recording a stable address
migration for an unchanged concept that moves to a different file. The workbench-units
proof checks the old address through the live workspace resolver after the batch.

The existing local Publish route proves atomic same-repository movement against committed source, including a different unstaged provider edit. The separate-repository route preserves a historical lock when the provider moves forward. The cycle compile proof and the frozen consumer output proof depend on loading the lock in the compiler, agent context and browser. Their tasks stay open until those entry points can exercise them.

The publication check runs as part of the existing content guard in the ordered publication pipeline. The checker gets the publishing reader from that guard, covering Publish, Adopt and remote follow. Tests use real operations for each refusal and verify that the durable pointer stays put.

CLI compilation without a data root locates same-repository providers by project-named folder. A registration whose folder differs from its slug requires the data root to recover the registry mapping.

Set findings are recomputed per read instead of stored. No authorized set findings are put in a shared cache. Existing file read, save and batch operations are the entry points for set inspection and preflight, so the feature does not add a new validation route. A private draft survives set refusal.

## Implementation handoff

The checkpoints above describe earlier commits. The implementation now adds Tessera revision 3,
keeps a single dependency manifest per project, and uses the original 019 unit-source seam for
working checks, published compiles, and reviewed conversion. The manifest can cover several roots.
A same-repository edge is resolved from the candidate commit. A separate-repository edge must be in
published history. Provider lookup checks project access before reading Git, and projects the public
interface without delivering its source files. The compiler takes only the root and declared parts
for the ontology. Existing standalone Ossie files still have their existing bundle treatment.

The provider's owner-qualified name is `<project>~<ontology>~<concept>`. Percent, dot, and tilde
are escaped inside each component. Neither a relationship's dot separator nor the item-address
grammar needs to change.

The dependents registry is invalidated on publication and project removal and rebuilt on the next
read, rather than rebuilt inside the publication transaction. The dev server served a 50-row warm
page in 14 ms against the 200 ms target. A real route test checks 50 rows plus continuation and
the precise field list, including a consumer without a domain.

The shared graph changes are confined to the imported field, origin mark and import styling blocks
in full-node-data.ts, FullGraphNodes.tsx, NeighborhoodGraph.tsx, RelationshipEdge.tsx,
GraphOptions.tsx and legend.css. Keep those blocks when integrating traffic and item history.

T036 retains incomplete proof for exported concepts whose prerequisites are re-exported
through another provider. Frozen dependency traversal validates authorization, history, depth and
commit conflicts. Computing the full re-export closure and carrying canonical ownership across
that closure still requires changes in public interface preparation and compiler translation.
The current compiler handles a provider's local public prerequisites and refuses unavailable
prerequisites. The refusal suite covers missing public prerequisites, base conflicts, qualified
collisions, version conflicts, undefined provider translations and altered meaning.

T045 has the allowed-fields proof on the real dependents route. Its cross-feature store
boundary needs the usage-counter code. T046's task calls for a findings store, while the
implementation computes findings per request. The paired test observes both call orders and
identical responses for missing and hidden parts. It does not establish a statistical latency
bound. Keeping computed findings request-local avoids cache keys for identity and grant changes.

T055's uniform four-entry-point oracle does not match current contracts. A standalone validator
and the scanner have no repository pin, provider interface or sibling file set. The tests exercise
those contextual decisions at structure, dependency update, publication, reader and compiler
boundaries. The exhaustive cross-surface fixture and one mutant per refusal class remain open.

### MCP integration

The five mesh operations are all classified as later increment. Tool-specific checks wait for the
MCP code. Map file reads to the existing files.read operation and validate `validate_text` with
a standalone part, incomplete-set notice, and no findings from hidden files. The nearest
executable witnesses on this base are mesh-parity.test.ts for the operation transports,
partial-reader.test.ts for file and set separation and interface-access.test.ts for restricted
provider source. These tests do not run the MCP tools themselves.

### Batch verification

The batch gate owner runs the full unit suite, the full mutation runner, `bun run test:mesh`,
`bun run test:tessera`, and every other browser suite once on the integrated tree. The capture
job runs the comparison with the last release and the deferred screen capture and review.
The architecture reviewer reviews the integrated branch once. The 016 additions keep their
revision 2 behavior. The 019 compile inventory, report handling and unit-source seam were
reconciled during integration. No full unit or full mutation run was performed on this feature.

### Security review and proof scope

The real Publish and Adopt routes reject an absent, stale or unreadable lock, and a provider
whose current project access was withdrawn. They keep the old durable commit. The same-repository
test publishes the two sides from a single candidate, leaves an unstaged provider edit out of
the result, and also exercises a reciprocal import. The separate-repository test keeps the
consumer on the old published provider while the provider moves forward. Remote follow runs the
same guard and refuses an invalid candidate.

The publication guard never sends a hidden part path in the generic set refusal. The file GET,
PUT, batch save and Adopt tests compare the missing and hidden responses byte for byte. The
response-equivalence test is distinct from a latency test. Immutable snapshot construction
still varies with tree shape and storage cache state, so timing equivalence across those
conditions remains open. Complete-set findings are never cached across readers or accesses.

Provider file restrictions are tested through a signed-in caller who can compile an exported
item from a private part and sees neither its private sibling concept nor the part path. A
reader with source access sees the original address in the compiled map. Revoking project
access removes the interface on the next read and prevents compile output. Frozen provider
failures propagate to published agent calls. Agent context, catalog, plans and compile are
compared before an author changes a working provider, after the provider publishes, and after
the consumer updates.

The browser journey opens and updates an import, publishes it after observing the actual
disclosure dialog, selects a project by keyboard, and opens Used by at 1440, 768 and 390 px in
both themes. The route audit proof confirms that publication records the acknowledgement.
Screenshot comparison and every-state review are separate capture work.

### Existing tests changed after the merge baseline

- Authorization coverage changed in `tests/auth/matrix-write.test.ts`, `tests/auth/matrix.test.ts`
  and `tests/auth/route-actions.ts` for the new operations and their existing entry points.
- Tessera tests changed in `tests/tessera/additions-r2.test.ts`, `docs-paths.test.ts`,
  `loss-report.test.ts`, `refusals.test.ts`, `registry.test.ts`, `schema-derivation.test.ts`
  and `validation.test.ts`. The shared refusal fixture and its inventory moved the unsupported
  revision sample above revision 3.

### Verification results

| Proof | Result |
| --- | --- |
| Mesh, Tessera, compile, authorization matrices, inventory and operation parity on the integration checkpoint | 834 passed, 0 failed across 93 files |
| Mesh, Tessera, compile, mesh parity and inventory after metadata and compiler fixes | 777 passed, 0 failed across 91 files |
| Hidden or missing exact wire response and per-reader isolation | 2 passed, 16 assertions |
| Immutable same-repository and separate-repository publication, reciprocal imports, and depth bound | 4 passed, 31 assertions |
| Publication error cases, symbolic links and disclosure audit | 9 passed, 43 assertions |
| Missing provider objects, provider trash and unexported name in compile and agent catalog | 3 passed, 15 assertions |
| Frozen graph, agent context, catalog, plan and compile output | 1 passed, 17 assertions |
| Private provider part, source address and renewed project access | 1 passed, 13 assertions |
| Dependents roles, privacy, continuation and no domain | 5 passed, 76 assertions, 13 ms for the measured 50-row page |
| Merge order, ownership, item addresses, losses and meaning refusal | 8 passed, 20 assertions |
| Compile scale | 3,575 ms for 200 parts, 20 imports and 20 MB of source |
| Focused mutants | 13 killed out of 13 |
| Browser journey | 1440, 768 and 390 px in light and dark passed |
| TypeScript, formatter, lint, comments, theme and brand | Exit 0, zero lint errors with 2,724 warnings |
| Production build | Exit 0, Vite built in 3.13 s |
| Readability and generated inventory | No findings on changed lines since the merge; regenerated operations reference matched |

The fixture helper `tests/auth/working-copy-fixture.ts` also changed to expose the exact HTTP body
to the authorization tests. The commit cadence helper is absent from this checkout.

### Canonical re-exports

- Exact publication locks still define the snapshots and the allow-list still gates each import.
- Re-export edges carry the original project, ontology, version and source address through the entire closure.
- Compile, mesh and dependents collapse paths to the same canonical item. Publication rejects circular re-exports with the root names.
- The development server passed 17 tests across five files and killed 15 of 15 mesh mutants. A focused run of the real-route re-export tests also checked the compiled file's bytes and passed three tests.

### Incomplete-set timing and reader isolation

- Working-copy reads and saves check the declared paths through the same index and access view before loading any part. A reader with an incomplete set receives only the active file's findings.
- Publication lists candidate tree paths without blob sizes, filters by the reader and checks visible definitions before building the shared candidate index or computing the governance diff. The operation test observes exactly one batch containing only the root blob for either condition.
- Timed the signed-in file GET on the development server. After 20 warm-up pairs, ran 100 pairs at idle and 100 while a real snapshot build was held at its blob-read boundary. Alternated pair order. Used the same access policy and visible setup for both cases. Times are milliseconds.

| Phase | Hidden median | Missing median | Hidden p95 | Missing p95 |
| --- | ---: | ---: | ---: | ---: |
| Idle | 10.30 | 10.22 | 13.04 | 14.09 |
| Snapshot in progress | 9.71 | 9.76 | 13.64 | 15.10 |
| Combined | 10.00 | 9.98 | 13.22 | 14.23 |

The test requires overlapping p10–p95 intervals, at most 0.5 ms median difference and at most 2 ms p95 difference in each phase and overall. The calibration run's worst gaps were 0.08 ms and 1.47 ms. The margins allow variation on the shared development server. Three tests passed, with 249 assertions. Findings remain request-local and no findings store is needed.
