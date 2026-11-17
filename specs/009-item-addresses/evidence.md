# Item address evidence

Earlier sections retain the initial attempts and resolved blockers. The final status and
unshimmed completion-gate results are recorded in the later sections.

## Scope ledger

- Existing save routes enforce file ownership, base hashes and governance before committed writes.
- Structured inspection already owns entity paths and internal IDs; RDF and built-ins keep their narrower unaddressable contract.
- This change adds canonical locators and explicit ordered history without changing standard document bytes or guessing external identity.
- Visibility-before-read, atomic journal recovery, volatile-name fallback and operation replay are verified through their owning entry points.

## Foundations

- Checklist: 16 checked, 0 unchecked. No extension hooks are configured.
- `bun test tests/seeded-random.test.ts tests/item-address.test.ts`: 5 pass, 0 fail, 367 expect() calls.
- The kind registry matches the grammar contract and covers every structured editor kind.

## Integration follow-ups

- Feature 008: snapshot suffixes remain opaque text; no published-snapshot lookup is introduced.
- Feature 010: migration appends must initially use the existing save and batch-save boundaries.

## Pure grammar

- `bun test tests/seeded-random.test.ts tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-purity.test.ts`: 12 pass, 0 fail, 61,989 expect() calls (the randomized assertion count varies with the seed).
- The property run covers 10,000 generated items; boundary tests accept exactly 4,096 characters and 32 segments.
- `bun --bun run check`: passed TypeScript, formatter, lint, comment, theme and brand checks.
- `bun --bun run build`: built in 2.37s; existing large-chunk warning remains.

## Phase 3 blocked: missing derivation contracts

The kind registry says mapping is named, with `name` required for its address. The pinned
`OntologyMap` schema makes that field optional. Removing `ontology_mappings[0].name` from the
Flights fixture and calling `inspect()` succeeds with 55 entities. There is no name to use for
the required mapping scope. Inventing a name or changing the registry to positional would change
the agreed grammar/stability contract.

The mandatory `address: Address` fields in T015 also cover RDF entities and relationships returned
by `inspect()`. Calling it on a Turtle resource with a blank-node object returns `Blank node` and
`RDF resource` entities. The contract supplies no RDF scope/child rules, and structured ontology
inspection also adds built-in concepts that have no source-document path. A required locator
cannot be added to all these typed results without a new contract or a narrower type.

Phase 3 and its dependent adoption phases remain pending, with no boxes marked complete.
The requested clarification offers either a structured-only contract or explicit RDF derivation
rules. The unnamed embedded mapping also needs a named-versus-positional decision before T011.
No UI, persisted-key conversion or migration-store behavior is claimed by this delivery.

## Grammar mutation proof

`SW_BASE_URL=http://127.0.0.1:5301 DATA_DIR=<temporary data root> bun scripts/mutation-tests.ts`
ran all unmodified module baselines and detected all six new grammar mutants: widened unreserved
characters, lowercase escapes, removed early length rejection, depth off-by-one, textual prefix
matching and leading-zero positions. The runner was interrupted during later browser cases because their API harness uses unassigned ephemeral ports. There is no complete global mutation result.

The project-only base case for document-relative resolution also returns a typed `form` failure;
it does not throw. Its focused regression test passes.

The requested commit-cadence command cannot run: `scripts/commit_cadence.py` is absent.

## Final verification status

| Command | Result |
| --- | --- |
| `ADDRESS_TEST_SEED=9721 bun test tests/seeded-random.test.ts tests/item-address.test.ts tests/item-address-properties.test.ts tests/item-address-purity.test.ts` | 12 pass, 0 fail, 61,987 expect() calls; 4 files, 310 ms. |
| `bun test --preload /tmp/sw-009/ports.ts` | 2,024 pass, 45 fail, 192,325 expect() calls; 2,069 tests across 289 files, 359.62 s. |
| `bun --bun run check` | Passed TypeScript, fmt:check, lint, comments, theme and brand checks. |
| `bun --bun run build` | Built in 2.37 s; large-chunk warning only. |
| `bun scripts/mutation-tests.ts` | All six address mutants killed; global run interrupted during browser mutants, without a final total. |
| Docs sync, readable-code check, `git diff --check` | Passed. |
| Document leak scan | README, architecture, item-address documentation and changelog clean; internal evidence clean under the confidential-only scan. |

The full test command used a temporary preload to constrain `Bun.serve` to port 5302, with
`DATA_DIR` and `TMPDIR` inside the assigned temporary root. Existing multi-server tests collide
on that single port; cleanup failures cascade after failed setup. The deployment CLI test also
hard-codes a `/tmp/sw-deploy-registry-` prefix and fails under the assigned `TMPDIR`.
The complete suite is not green, and an unrestricted baseline is not claimed.

An initial attempt to supply the preload through `BUN_OPTIONS` recursed into the package test
script instead of running the test runner; the table records the corrected explicit invocation.
The global mutation runner was started with the assigned frontend URL. Its browser helpers were
later found to bind ephemeral API ports; the runner and its owned descendants were stopped.
The pure grammar mutation cases had already passed and require no network listener.

The remaining browser commands (`test:addresses`, `test:graph`, `test:lineage`, `test:metrics`,
`test:item-edit`, `test:ui`, `test:responsive`, `test:edges`, `test:auth`) have no positive completion
result here. The new address suite is not implemented. The release regression comparison also
remains pending; its requested updated-main worktree is outside this lane's allowed scope.
No browser adoption task or final completion gate is marked complete.

T001–T009 are complete. T010–T045 remain unchecked, following the ordered phase stop at model
derivation. No task was silently skipped or marked complete without its stated feature proof.
The API, key conversion, migration persistence and authorization adoption must not be advertised
as implemented. All started verification processes and the frontend are stopped before handoff.

## Integrator decisions, 2026-11-16

The phase 3 blockers are resolved: unnamed embedded mappings use volatile positional segments;
addressable result types cover structured definitions only. RDF resources may later use their
IRI as a locator; blank nodes and built-ins remain unaddressable. No RDF kind is introduced.
Port 0 and dynamic harness allocations are allowed. Subsequent gates run without the port shim.

## Model mutation scope

The explicit parent-kind precheck in resolution is redundant with the typed root/child traversal:
removing only that precheck cannot admit a child the traversal never visits. That requested mutant
is equivalent, rather than an undetected fault. Illegal parent chains are exercised through the
public resolver. The three non-equivalent model mutants target kind matching, choosing the first
duplicate and losing positional volatility.

## Structured derivation proof

- Model derivation tests: seven passed, including all structured sample locators resolving to
  their source items and 1,000 permutations per sample project. Combined grammar/model run:
  15 pass, 0 fail, 37,984 assertions in 54.80 s.
- The later inspector test used an invalid concept type in its synthetic fixture; it was corrected
  to the pinned schema's `EntityType`. No production schema was changed.
- Timing after integrating only requested inspector paths and reusing repeated edge paths:
  `enterprise-1000.ossie.yaml`, 15 alternating samples after four warmups, baseline median
  292.13984 ms, current median 297.252631 ms, overhead 1.7501176833671472%.

## Model mutation result

The real `bun scripts/mutation-tests.ts` run passed its unmodified module baselines and killed
all three non-equivalent model mutants. The separate parent precheck mutant is equivalent for
the structural traversal, as documented above. No port preload or `BUN_OPTIONS` shim was used.

The example-registry case initially expired under the runner's 10-second limit. Its standalone
comparison after removing whole-contract derivation from each foreign-key lookup passed:
current 6.594 s, main 5.719 s (both exit 0). The copied baseline is `git archive main`, commit
655df094b1783aa9fc40570cb3d40d51949da481, under the assigned temporary root.

## Inspector proof

`bun test tests/formats.test.ts tests/grouping.test.ts tests/grouping-modes.test.ts tests/model-address-inspect.test.ts`:
28 pass, 0 fail, 8,445 assertions in 25.39 s. The focused inspector run after strengthening the
built-in/RDF checks: 1 pass, 0 fail, 7,966 assertions in 2.86 s. `bun --bun run check` passed.
The reusable timing check is `bun scripts/item-address-timing.ts`; locators on inspector output
are document-relative and become absolute only with an explicit document location.

## Legacy adapter proof

`bun test tests/item-key-adapters.test.ts`: 4 pass, 0 fail, 22 assertions. The cases include
ambiguous dotted fields, duplicate model scopes, slash names, explicit alias resolution and
unchanged source values.

## Mapping consumer proof

The mapping graph formats keys within context assembly's resolved ontology/model scope labels.
Direct relationship rows are locators; built-ins and aggregate mapping paths remain synthetic rows.
Row ownership no longer splits identifiers. Reserved slash names stay distinct.
`bun test tests/mapping-graph.test.ts tests/agent-context-kinds.test.ts`: 22 pass, 0 fail,
6,861 assertions. Legacy context digests exclude only the documented new scope labels; all
other context fields retain their original digests. `bun --bun run check` passed.

The delegated overlay comparison ran the same injected scenario against archived main and
this branch. Both killed it with the intended assertion and the same ten overlaps. The earlier
null-root exception did not reproduce and is not classified as a main baseline failure.
This limited comparison does not complete the full journey regression task.

## Pure migration proof

`bun test tests/address-migration.test.ts tests/item-address-purity.test.ts`: 6 pass, 0 fail,
3,035 assertions. The public API covers append order, duplicate record IDs, rename back,
resolved-input preservation, whole-segment boundaries, snapshots, declaration ownership,
retention and 1,000 seeded histories. `bun --bun run check` passed. No migration persistence
is connected yet. The pure phase is independent of the blocked consumer adoption phase.

## Migration mutation preparation

The five registered migration candidates are killed by assertion failures through the public
entry point (focused temporary candidate run: 5/5). Ordering, duplicate IDs, resolved-input
preservation, segment boundaries and cross-project declaration rejection are covered.
The first prefix-check candidate was equivalent because `replacePrefix` independently enforces
the boundary. The redundant rename precheck was removed; the candidate now changes replacement
itself to textual prefix matching. The updated pure tests report 6 pass, 0 fail, 3,037 assertions.
The full repository mutation command remains required before its task is checked.

## Accepted unnamed roots: phase stop

The real unshimmed `bun test` exposes an introduced inspector regression on an input that the
existing API accepts: `ontology: [{concept: A}]` has no root `name`. Address derivation throws
`Invalid item address: empty`, so import rejects a previously accepted file.
`bun test tests/grouping-api.test.ts` on this branch: 1 pass, 2 fail, 6 assertions (520 ms).
The identical command against archived main 655df09: 3 pass, 0 fail, 22 assertions (579 ms).
This is not a harness limit. The inspector adoption task is reopened pending the scope decision.

The current root-name rule requires `ontology:<name>` and the structured-result rule requires an
address. Keeping unnamed roots inspectable without addresses or choosing a positional root
requires reconciling those rules. No fallback name or new root rule was invented.

Lineage adoption also needs the treatment of existing unnamed `property.items` rows: UBL's
`note.items` has only `logicalType: string`; the lineage flattener renders `note[]` separately.
The registry describes named properties and no array-item segment. A clarification was requested
before choosing whether these remain synthetic rows. Consumer adoption stops at this boundary;
its remaining tasks and full regression comparison are not marked complete.

## Real gate and mapping browser follow-up

`DATA_DIR=/tmp/sw-009/data bun test`: 2,098 pass, 3 fail, 241,504 assertions,
2,101 tests across 293 files in 437.51 s. No preload, BUN_OPTIONS or TMPDIR override was used.
Two failures are the accepted unnamed-root regression above. The third was the addition of
`address: null` to an unresolved agent target whose previous response was empty. That introduced
response change is fixed: unresolved metadata has no scope label. The exact old bearer test
passes without changing its expectations. This full run preceded that fix and is not a green
completion gate.

`bun test tests/auth/bearer.test.ts tests/mapping-graph.test.ts tests/agent-context-kinds.test.ts`:
37 pass, 0 fail, 7,000 assertions in 14.49 s. `bun --bun run check` passed after the fix.
`bun --bun run build`: built in 1.82 s (exit 0; existing large-chunk advisory).

`TMPDIR=/tmp/sw-009 SW_BASE_URL=http://127.0.0.1:5301 bun scripts/mapping-graph-browser-check.ts`:
12 mapping graph checks passed on isolated data. The selectors now look up addressed source
items instead of constructing the retired key notation. Concept selection, mapped rows, link
paths, findings, expansion/collapse, standalone/embedded layouts, KPI bindings, responsive text
and browser errors were checked. This is not the whole-journey comparison or the final gate.

The first full mutation rerun stopped at its unmodified mapping-graph baseline because that
case still expected the retired private key strings. Its assertions now use the public mapping
key formatters with resolved scope labels. `bun scripts/mutation-case.ts <mapping-graph.ts>
mapping-graph` passes. This was an introduced test-adoption omission, not a harness failure.

## Migration mutation proof

The subsequent real `SW_BASE_URL=http://127.0.0.1:5301 bun scripts/mutation-tests.ts` run
passed every unmodified module baseline and killed all five registered migration mutants,
as well as the six grammar and three non-equivalent model mutants. Mutation preparation is
therefore complete for the pure migration phase. The overall runner result, including its
browser candidates, is reported separately below.

## Scope edge cases

Context labels now verify the actual derived scope kind, so a model-only context does not label
its synthetic ontology with the model's locator. A declared `String` concept retains its source
locator when mapped; only the implicit built-in receives a synthetic UI key. The synthetic
fixture is accepted by the real inspector without error diagnostics.
`bun test tests/mapping-graph.test.ts`: 16 pass, 0 fail, 6,673 assertions in 3.72 s.
`bun --bun run check` passed. The full mutation run began before these two scope-edge changes;
its address/migration modules and mutation candidates were unchanged. The final completion
gate must still be rerun after resolving the phase stop.

## Mapping center ordering

The new Unicode tie case failed against the key-based comparator: escaped key order selected
a different center than the former visible-name order. The comparator now uses card labels
for equal connection counts. Focused verification with the root acceptance restoration:
`bun test tests/grouping-api.test.ts tests/mapping-graph.test.ts`: 21 pass, 0 fail,
6,699 assertions in 4.83 s.

## Restore accepted inputs at the phase stop

The blocked inspector adoption was backed out to the exact model implementation at approved
base 655df09. Its newly added adoption test and timing script were removed with the integration;
existing model and grouping tests were not weakened. The proposed narrower result types remain
a specification target, not a current implementation claim. No positional root or fallback name
was invented. Context scope labels are omitted for accepted unnamed legacy roots.
The public graph-context test uses the Flights layout without its root name/version headers:
the real inspector accepts that legacy source with no error diagnostics.

`bun test tests/grouping-api.test.ts tests/mapping-graph.test.ts`: 21 pass, 0 fail,
6,699 assertions in 4.83 s. This restores the two grouping API failures observed in the full run.
T011 is also reopened because `items.properties` traversal and unnamed array-item row semantics
are not settled. T017 remains partial: named-scope mapping graphs pass their proofs, but adoption
for accepted unnamed scopes awaits the same root decision. No blocked adoption task is advertised
as complete. The pure migration phase remains complete independently.

## Per-fixture sample verification

The restored unshimmed full suite finished with 2,103 pass, 1 fail, 233,558 assertions
across 2,104 tests in 750.58 s. All existing tests passed. The sole failure was the newly
introduced aggregate sample test exceeding Bun's five-second per-case deadline (5,169.70 ms).
Its assertions now run as one case per sample, with the same deadline and shared immutable
fixtures. This is a test-structure correction, not a waived harness limitation.
`bun test tests/model-addresses.test.ts -t 'structured sample'`: 28 pass, 0 fail,
6 filtered out, 21,635 assertions in 7.54 s.

## Compaction counterexample and skipped remainder

The exact-chain compactor was not sufficient for the requested prefix migrations. A public-API
regression test actually failed on this ordered history: dataset A → B, field B.f → B.g, dataset
B → C. Ordinary replay yields C.g; the compacted history yielded C.f. Collapsing the surrounding
dataset chain across its descendant rename changes the program's append order.

Full prefix-aware compaction is larger than the exact-chain implementation: it must preserve
interleaved ancestor/descendant rewrites and their original source prefixes under the retention
and record bound. Per the brief's skip rule, that remainder is skipped rather than replaced by
an unapproved compaction design. T024 is reopened. The unsafe compactor and its positive-only
tests were removed; the counterexample remains a positive test of ordered replay. No store or
writer uses compaction. The replay, declaration validation, record types and deterministic
retention-cut helper remain available. T025/T026 still cover those implemented decisions.

## Dependent adoption backed out

The mapping/agent scope prototype was backed out at the same phase boundary as inspector
adoption. Mapping graph, context assembly, their existing tests and the mapping browser check
are restored byte-for-byte from approved base 655df09. The mapping mutation assertions were
restored too; the new address mutation categories remain registered. This avoids partial
adoption for unnamed or otherwise unaddressable scopes and leaves existing persisted UI keys
and agent response fields untouched. The earlier successful prototype checks remain historical
evidence; they do not complete T017. Prototype commits remain available for resuming after the
root scope contract is settled. The working implementation now adds only shared pure APIs and
their verification. No application writer, inspector or canvas uses addresses yet.

## Raw-name boundary validation

The raw model API could coerce numeric name 7 into the same locator as string name "7". A
representative public-entry test failed before the fix and passes after the formatter rejects
non-string values at its encoding boundary. The model API reports the existing path-bearing
unaddressable-item error; it does not invent a string name.
`bun test tests/item-address.test.ts tests/item-address-properties.test.ts tests/model-addresses.test.ts -t 'raw model names|canonical|round|prefix|format|parse|relative'`:
6 pass, 0 fail, 38 filtered out, 61,561 assertions in 1.316 s.

## Current handoff: blocked, not ready

The current tree completes T001–T010, T012–T014, T016 and T025–T026 (16 tasks).
T011/T015 and their dependent consumer tasks remain blocked by accepted unnamed ontology roots
and unnamed ODCS array-item nodes. These need explicit scope contracts; the two clarification
questions remain unanswered. No positional root, array-item kind or synthetic name was added.
T024 is partial and unchecked: its unsafe compaction remainder is skipped for the counterexample
and scope reason above. All other unchecked tasks remain pending, including persistence,
conversion, consumer retirement, the structured-only inspector types and the new address browser
journey. This is not feature completion or a request to merge the feature as ready.

Application, server and inspector code are byte-for-byte the approved base 655df09. The current
change adds shared pure APIs, verification and documentation only. Earlier adoption and timing
results are historical prototypes, not claims about current behavior. Feature 008's suffix stays
opaque. Feature 010's future append integration must use existing save/batch-save routes until
its operation boundary is available. No migration store, setting or append route is implemented.

### Final-tree verification

No preload shim was used. Browser suites ran sequentially, after the full unit suite, with
`TMPDIR=/tmp/sw-009`, temporary data and `SW_BASE_URL=http://127.0.0.1:5301`.

| Command | Observed summary |
| --- | --- |
| `DATA_DIR=/tmp/sw-009/data bun test` | 2,127 pass; 0 fail; 233,446 expect() calls; 2,127 tests across 292 files; 757.30 s. |
| `bun --bun run check` | Passed TypeScript, formatter, lint, comments, theme and brand checks. |
| `bun --bun run build` | Built in 5.04 s; existing chunk-size advisory. |
| `bun /tmp/sw-009/check-address-mutants.ts` | 14/14 registered address mutants killed by assertion failures on the final tree. |
| `SW_BASE_URL=http://127.0.0.1:5301 bun scripts/mutation-tests.ts` | Earlier real run: 677/677 targeted mutants killed; all unmodified module baselines passed. This predates final adoption rollback and raw-name guard; the final focused 14-mutant check above supplements it. |
| `bun --bun run test:addresses` | Not run: the script and adopted journey are not implemented; T019/T032/T045 remain pending. |
| `bun --bun run test:graph` | Failed: pierce main-thread task 229 ms exceeded 100 ms. (59.88 s.) |
| `bun --bun run test:lineage` | Failed: sidebar separator intercepted Walk here at line 398. (62.85 s.) |
| `bun --bun run test:metrics` | 11 metrics checks passed. (27.76 s.) |
| `bun --bun run test:item-edit` | 11 item-edit checks passed. (49.24 s.) |
| `bun --bun run test:ui` | 20 UI checks passed (56.99 s.) |
| `bun --bun run test:responsive` | Failed: full-screen exit restored a different graph transform at line 550. (135.11 s.) |
| `bun --bun run test:edges` | 6 edge attachment UI checks passed (23.62 s.) |
| `bun --bun run test:auth` | Passed; process exit 0. (176.97 s.) |
| `bun --bun run test:mapping-graph` | 12 mapping graph checks passed. (100.84 s.) |

The failed suites were actually run against archived main 655df09, served from the temporary
archive on OS-assigned port 44515, also sequentially. Graph reproduced the same 100 ms assertion
at 205 ms. Lineage reproduced the same separator interception at line 398. Main responsive passed
the full-screen assertion but later failed the mall ODCS canvas-height assertion at line 1668:
407 px instead of at least 421 px. These are recorded as failures, not waived harness limits.
`RESPONSIVE_ONLY='full screen:' bun scripts/responsive-ui-tests.ts` on the branch finished with
3 responsive UI checks passed (including no uncaught browser errors), exit 0. The unchanged
focused repeat passed both full-screen checks; that does
not turn the failed complete responsive run green. T045 remains unchecked.

Formatter/check and the changed-code readability check passed. The docs-sync and public-doc leak
scans passed. Oxfmt excludes the Markdown evidence file; its final documentation-only change
was checked with `git diff --check`. The requested `python3 scripts/commit_cadence.py <worktree>` could not run: the
repository has no such script (exit 2). No formatter or gate tooling was added to compensate.

### Continuation commits

- `75013451` data: include unnamed embedded mapping address
- `37629f86` feat: define volatile unnamed mappings and structured address scope
- `bc01bbab` feat: derive and resolve structured item locators
- `66b65af0` test: cover model locator ambiguity and volatility guards
- `1cee6bbf` feat: attach locators to structured inspector results
- `6b639b21` feat: adapt legacy item labels without delimiter guessing
- `f703231a` feat: use scoped locators in mapping graphs
- `0f1ca13b` feat: apply and validate ordered address migrations
- `6ecfa7aa` test: detect migration replay and ownership faults
- `4f051ad4` fix: preserve unresolved context responses with addressed mapping keys
- `c1baad5b` test: use scoped keys in mapping mutation cases
- `43504926` test: record killed address migration mutants
- `3fa4f1f8` fix: label only source-backed mapping scopes and concepts
- `114ffd9a` fix: preserve mapping center ordering across escaped names
- `38321846` fix: restore unnamed legacy inspection at the scope boundary
- `9830ceee` test: verify address samples in independent cases
- `e8c1136e` fix: remove unsafe exact-chain migration compaction
- `35abe71d` fix: defer mapping adoption until scope contracts are settled
- `73069d44` fix: reject coerced model names at the address boundary

## General positional rule and resumed adoption

The integrator resolved the unnamed-root/array-item scope decisions and dropped compaction.
The registry now allows named-when-present segments everywhere a name field exists. Array-item
schemas use `property` and follow the parent's declared properties in same-kind sibling order.
Unnamed ontology roots, unnamed mappings, unusable concept names and unnamed array-item nodes
are covered through public derivation/resolution and 1,000 generated sibling permutations.
Other potential unnamed cases use the same rule: model roots/legacy entries, contract IDs,
relationships, concept mappings, datasets, fields, joins, metrics, schema objects and properties.
Roles, object mappings, link mappings and foreign keys already use positions by definition.
No positional locator or descendant may enter migration history.

`bun test tests/model-addresses.test.ts tests/item-address.test.ts`: 44 pass, 0 fail,
61,082 assertions, 49.52 s. The conformance fixtures include an unnamed ontology root and an
array-item subtree. Constitution 4.0.0 includes the required IV/V amendments; the plan records it.
The earlier compaction counterexample remains the reason for the integrator's dropped task.
The remaining store implementation will enforce the specified 50,000-record bound uncompacted.

## Inspector adoption restored with positional roots

`bun test tests/model-address-inspect.test.ts tests/grouping-api.test.ts`: 5 pass, 0 fail,
7,990 assertions, 1.65 s. `bun test tests/formats.test.ts tests/ossie-layouts.test.ts tests/validation.test.ts`:
121 pass, 0 fail, 527 assertions, 1.358 s. Existing tests were unchanged.
`bun scripts/item-address-timing.ts`: baseline median 277.196 ms, addressed median 280.598 ms,
1.2275% overhead on enterprise-1000. Structured entity/relationship types require an address;
RDF and built-ins expose none. Internal IDs and persisted keys remain unchanged in this step.

## Mapping adoption restored

Mapping cards/rows use the formatter and document-qualified scopes when project metadata exists.
Unnamed root scopes now propagate positional addresses instead of losing scope information.
The synthetic ontology of a model-only context remains unaddressed; built-ins and unresolved
mapping rows use explicit synthetic UI keys. Equal-degree center ordering remains by visible name.
`bun test tests/mapping-graph.test.ts tests/agent-context-kinds.test.ts`: 26 pass, 0 fail,
6,869 assertions, 6.25 s. `TMPDIR=/tmp/sw-009 SW_BASE_URL=http://127.0.0.1:5301 bun scripts/mapping-graph-browser-check.ts`:
12 mapping graph checks passed on isolated data. No source or persisted UI state was rewritten.

## Lineage adoption

ODCS lineage indexes actual structured definitions, including unnamed array-item schemas.
A literal dotted property and nested properties retain distinct addresses despite equal visible
labels. Ambiguous dotted references are not guessed. Real project files carry absolute addresses;
standalone fixture inputs without project metadata use project-relative locators. External stubs
remain synthetic. Existing semantic-edge oracle/golden assertions retain their exact expectations
through a test-only key translation that refuses duplicate display keys. A separate direct-entry
case asserts actual canonical keys, uniqueness and model resolution for dotted and array nodes.
`bun test tests/lineage.test.ts tests/lineage-query.test.ts tests/lineage-hops.test.ts tests/lineage-pierce.test.ts tests/lineage-addresses.test.ts`:
16 pass, 0 fail, 1,672 assertions, 1.046 s. The direct address case subsequently moved into
lineage.test.ts; no assertion was removed. The mutation baseline retains its semantic assertions.

## Lineage labels, reference fixtures and staged UI storage

Browser comparison first exposed its obsolete private-key expectations. Frozen semantic-edge
fixtures now translate only key spelling through the test-only adapter; actual DOM path assertions
use canonical keys derived from the declared definitions. No edge/content assertion was removed.
A later run found an introduced visible label `property:line_extension_amount` from slicing keys.
Consumers now read card/row labels via nodeLabel, preserving nested dotted and array labels.
The mapping/lineage preference writers bridge to the original stable center format until explicit
conversion; volatile addresses are never written. Built-in mapping cards retain their old UI keys.
`bun test tests/item-key-adapters.test.ts tests/lineage.test.ts tests/mapping-graph.test.ts tests/selection-addresses.test.ts tests/walk.test.ts`:
40 pass, 0 fail, 8,382 assertions, 3.27 s. The full lineage browser reached the UBL first-view check
but measured 2,082 ms, then 2,071 ms against 2,000 ms. No threshold was raised; a main comparison
is being run before classifying that failure. Unrelated ontology-only address indexing was removed.

## Graph selection and neighborhood state

Recorded structured selections and neighborhood centers use absolute item addresses. Renderer
IDs stay at the canvas boundary; no grouping or durable state shape changed. RDF/built-in absence
is handled explicitly. The pure entry test proves a selection follows its name after reorder,
and unchanged walk steps retain reference identity required by the existing history reconciler.
`bun test tests/selection-addresses.test.ts tests/walk.test.ts`: 11 pass, 0 fail, 46 assertions
before the added step-identity assertion; the subsequent combined run includes that assertion.
`TMPDIR=/tmp/sw-009 SW_BASE_URL=http://127.0.0.1:5301 bun --bun run test:addresses`:
3 item address browser checks passed (selection, reload, byte preservation and no browser errors).
Existing `test:graph`: 18 graph and neighborhood checks passed. Existing `test:ui`: 20 UI checks
passed. The lineage performance follow-up remains recorded separately, so T019 is not yet ticked.
The temporary UBL comparison initially resolved an unrelated Playwright cache; it was corrected to
absolute locked repository dependency paths and `bun --no-install` before the actual comparison.

### ODCS inspection cost during consumer adoption

A focused comparison of the existing UBL first-view browser assertion measured 1,654 ms on base 655df09 and 2,465 ms with consumer adoption. Investigation found repeated whole-document foreign-key traversal while attaching inspector addresses. The inspector now indexes ODCS paths once; legacy center restoration also skips conversion when no center was stored and uses direct conversions before loading definitions. Focused model, lineage and selection tests: 44 pass, 0 fail, 62,437 assertions. The complete lineage browser gate remains required; no performance threshold was raised.

### Agent context adoption

Context field IDs and AI-context labels now use formatted addresses, including embedded model scopes. The query planner accepts existing tuple selectors through the compatibility adapter, while its resolved field keys are canonical. Metric names remain the public metric selectors. Legacy semantic digests normalize only the documented key/label spelling changes; their saved digests and SQL assertions remain unchanged. Context, planner and mapping graph proof: 57 pass, 0 fail, 6,981 assertions. The added dotted-name collision proof enters through buildContext and verifies source bytes remain untouched.

The lineage browser suite passed UBL first view at 1,876 ms and all earlier stages, then its opened-list measurement misclassified the card header as a row because it inferred row identity from a slash. The measurement now compares the handle with the actual card ID; row/edge coordinate assertions remain intact. Full suite rerun remains pending.

### Metric extension reader

Metric dimension, time and filter references are read through the compatibility adapter. Missing-reference messages retain their existing wording; ambiguous matches are refused explicitly. Existing schema restrictions on the extension's dataset.field notation remain unchanged. A workspace read plus empty-patch save preserves the source and hash byte-for-byte and contains no sw1 text. Adapter, extension and independent consumer proofs: 15 pass, 0 fail, 353 assertions.

Independent pointer, usage-counter and diff examples exercise only public operations and conformance fixtures: 3 pass, 0 fail, 35 assertions. External edits remain remove/add until a reconciliation record is supplied; a resolving original remains unchanged.

The legacy-wrapper IRI regression assertion now expects its context field's canonical locator; its scope, evidence path and resolution assertions are unchanged. Proof: `bun test tests/iri.test.ts` — 4 pass, 0 fail, 36 assertions.

### Consumer visual regression comparison

The delegated comparison is recorded in `/tmp/sw-009/ui-comparison/findings.md`, with captures under `main/`, `current/` and `main-repeat/`, mechanical results in `comparison.json`, and highlighted differences under `differences/`. Approved base: 655df094b1783aa9fc40570cb3d40d51949da481. Both primary runs: 20 captures each, zero geometry problems and zero browser page errors. Six repeat-main captures establish the unchanged randomized network layout and animated zoom variation. Overview, initial/expanded neighborhood and mapping are unchanged; lineage differs only by subpixel arithmetic and a temporary fixture commit hash in dataset metadata. No unrequested visible changes remain. The final build still requires a fresh comparison.

The complete lineage retry passed the opened-column alignment assertions after header classification was corrected, then reached a second assertion that derived a visible label by splitting the old key. It now translates the key through the existing test-only display adapter before asserting the same displayed label. Product labels were already correct.

### Graph selection acceptance

The in-memory selection and neighborhood address boundary passed the new address browser proof (3 checks), existing graph suite (18 checks), UI suite (20 checks), and now the complete lineage suite (25 checks, UBL first view 1,900 ms). Logs: `/tmp/sw-009/addresses-browser-selection.log`, `adoption-browser-graph.log`, `adoption-browser-ui.log`, `lineage-browser-display-fixed.log`. No source or durable-state conversion was introduced during these adoption steps. Agent and mapping portable mutation baselines also pass against the unchanged modules.

### Persisted-key inventory

The documented inventory distinguishes entity-keyed grouping assignments and browser center values from document paths, source patches, group display names and in-memory layout hints. Active shared/personal views and file/project/personal trash views carry the same grouping assignments. The compiler-AST inventory test rejects additions to those durable type shapes until their conversion treatment is recorded: 1 pass, 0 fail, 13 assertions. Source and draft contents are not address stores and must remain untouched.

Server grouping conversion now backs up original shared, personal and archived view stores, verifies their hashes and the source hashes, and journals all replacements with its completion marker. Unknown shapes and backup mismatches install nothing. A 1,000-key fixture converts 999 and retains/reports one missing key; restoring the backup reproduces the original bytes. Startup conversion, grouping API compatibility, legacy migration, state and cache proofs: 14 pass, 0 fail, 121 assertions. TypeScript validation passes. Browser center conversion and additional archive coverage remain before the conversion task is complete.

### Persisted center preferences

Browser centers convert only a unique stable graph match. Original local-storage values are kept in adjacent before-item-addresses entries and verified before replacement; positional locators are never written. Errors use existing UI messages/alerts. Personal working-copy and archived-definition tests cover distinct names and preserve group display names. Conversion, grouping API and browser preference proofs: 10 pass, 0 fail, 53 assertions. TypeScript passes. The mapping browser suite is running against the converted preference writers.

The mapping browser suite with canonical preference writers passed all 12 checks, with no browser errors (`/tmp/sw-009/mapping-center-conversion-browser.log`).

### Uncompacted migration store

The store validates supported record kinds and stable absolute endpoints, stages replacement steps for the owning journal, derives IDs from the operation ID, and treats exact replay as a no-op append. A conflicting reuse of an ID is refused. The 50,000-record boundary allows replay at capacity and refuses a new record before any definition or store rename. The compaction-dependent retention configuration is dropped as unnecessary after the integrator's decision: a setting that cannot delete or rewrite history would misleadingly promise retention. No new environment variable is introduced. The pure retention-cut function remains a calculation only.

Store and pure replay proof: `bun test tests/address-migration-store.test.ts tests/address-migration.test.ts` — 9 pass, 0 fail, 3,035 assertions.

### Interrupted history writes

The journal test hook now supports interruption before as well as after a rename. The three-definition fixture interrupts every one of its eight rename steps on both sides, including the store steps. Recovery settles definitions and history together, and a second recovery changes nothing. A missing staged source separately proves complete rollback to old definitions and empty history. Proof: `bun test tests/address-migration-store.test.ts tests/journal.test.ts` — 14 pass, 0 fail, 141 assertions.

### Save-route migration append

Single and batch routes validate optional declarations into typed entries and use the same enforcement in workspace entry points. Invalid project/document ownership and more than 64 entries refuse the whole request; omission preserves the existing path. Store steps join the source journal with the same operation ID. The existing batch error cleanup discarded staged data on JournalCrash; that newly relevant recovery bug is fixed by retaining crash staging, as the journal requires. Route plus Viewer/Editor/Steward write matrix proof: 16 pass, 0 fail, 1,278 assertions.

Operation-boundary follow-up: feature 010 is absent. Existing save/batch routes generate the journal operation ID, and recovery replays its staged records without recomputing IDs or timestamps. A lost-reply retry with the old base hash is stale; client-stable operation keys and completed-operation replies remain for 010 integration. Appends are staged and committed synchronously in one workspace process, with no await between the store decision and journal execution; multiple processes sharing DATA_DIR remain unsupported.

### Relationship rename coverage

Relationship-target rewrites now include mapping referents and link children, using the same inherited relationship lookup as agent context. Only a unique defining owner matches; another concept's same-named relationship remains unchanged. Existing identify_by handling remains local to the edited definition's document. The targeted editor/context/rename tests pass: 41 pass, 0 fail, 149 assertions. The concept-rename browser proof initially encountered two valid Edit Customer buttons (catalog and inspector); its locator is now scoped to the selected inspector.

### Client rename declarations

Item edits send stable subtree declarations with the selected reference rewrites; Source autosave sends named root/embedded-scope changes. Scope changes replay in parent order, and named root reordering produces no declaration. The edited item's old disk name must match the open item before its path can declare a rename, avoiding a guessed item after unsaved reordering. Unnamed ontology roots, embedded mappings and array-item schemas remain volatile and do not produce history. Save acknowledgements now validate completion status, required file identifiers, SHA-256 hashes, batch order and creation flags before accepting a new base.

Proofs: editor/context/rename/acknowledgement tests — 43 pass, 0 fail, 157 assertions; new address browser suite — 4 checks passed, including a concept rename with ticked cross-file references and exactly one recorded migration; existing item-edit browser suite — 11 checks passed, no browser errors. Logs: `/tmp/sw-009/client-renames-validation-proof.log`, `address-rename-browser-proof-2.log`, `item-edit-address-adoption-browser.log`. TypeScript passes.

### Move and archive history

File moves, including the suggestions path through the same module, record document prefixes and stage identical records in both projects for a cross-project move. Project, subproject and repository trash/restore carry complete stores beside view state. Historical records retain their original endpoints even when a project is restored under another slug; reads validate record shape while ownership is enforced for each new append. Another active store is never overwritten. Crash staging survives restore interruptions.

The broader move/trash tests exposed a conversion regression: grouping reads with no assignments tried to open a file that had already moved or been deleted. Empty/non-item grouping state now returns without reading definitions, preserving the prior contract. Proof: migration-store, project API and trash tests — 17 pass, 0 fail, 212 assertions; TypeScript passes.

### Deleted-history decisions

Pure deletion derivation emits minimal stable prefixes and excludes positional or ambiguous items. The history reader reports a reset after the most recent matching item/document deletion and exposes only later records, including an explicit later reconciliation. Item/file delete and reuse integration tests are implemented and passing in the working tree; the save/delete wiring is the next coherent commit.

### Explicit deletion wiring

The item-delete dialog sends deletedItems with the existing save/batch routes; this separate optional field keeps declaredMigrations restricted to item/scope renames as specified. Boundary validation confines stable prefixes to written files, and the guarded before/after check verifies actual minimal removals before a working copy or source is written. File deletion stages a document tombstone in its own journal using the existing trash entry ID, and preserves crash staging. Delete/recreate tests exercise the history reset through workspace entry points, while ordinary saves without explicit deletion declarations retain their existing behavior.

Proof: migration store, declared-save routes, trash and write-authorization matrix — 33 pass, 0 fail, 1,474 assertions; TypeScript passes. Pure deletion/history decisions — 11 pass, 0 fail, 3,032 assertions.

### Explicit reconciliation authority

The server workspace function requires edit authority on the new file, visibility of both endpoints, a missing old item and a unique new item. It checks the existing governance guard against unchanged target text; an approved metric is not demoted. A caller-stable operation ID makes a lost-reply retry return the original record without another append. The initial hidden-file fixture used an unrestricted sales-metrics path; correcting it to the fixture's actual sales-contracts/finance restriction makes the intended policy proof meaningful.

Proof: reconciliation and migration-store tests — 11 pass, 0 fail, 144 assertions; TypeScript passes. No reconciliation HTTP interface is added; item diff will call the server function.

### External changes

A local bare-remote SCM fixture performs a real pull of an external item rename and switches between the original and renamed branches. Neither operation records history. Switching back restores resolution of the original locator without applying stale changes. The independent diff consumer reports remove/add until reconciliation, then one rename, and preserves a resolving original after undo.

Proof: external-change and toy-consumer tests — 4 pass, 0 fail, 49 assertions. No network remote is involved.

### Caller-aware resolution

Hidden projects, absent projects outside the reader's view, guarded paths and malformed locators return exactly `{status: 'missing'}` with zero project, file or store reads. Visible current items bypass history; missing items replay only visible prefixes, and deletion terminates replay before a reused destination can inherit history. Results omit private source text. The absent unrestricted-project check opens no definition or history file. Opaque snapshot text survives replay; the interim resolver reads current definitions until feature 008 supplies version lookup.

Proof: resolution and reconciliation tests — 6 pass, 0 fail, 33 assertions; TypeScript passes. The semantic fixture needed its actual format version, required dataset source and valid empty fields to exercise semantic-model resolution rather than validation refusal. The preceding resolver commit mistakenly preceded the completed proof; the immediate corrective commit contains the validated fixture and actual passing summary.

### Address observability boundary

An actual HTTP save with a declared rename, workspace resolution and reader-filtered history read run with debug logging and in-memory OpenTelemetry exporters. The test requires nonempty request logs, spans and metric batches, then checks all captured labels/attributes and lines for canonical prefixes, project slug, document path and item names. Audit records remain the existing separate security ledger.

Proof: address-redaction test — 1 pass, 0 fail, 12 assertions; TypeScript passes.

### Adoption lint cleanup

The real mutation gate's formatting/lint baseline found an unused governance type import and an unnecessary quote escape in the adopted reference rewrite. Both are removed without behavior changes. Lint passes; targeted edit/acknowledgement tests pass (6 tests, 16 assertions). The first full mutation attempt then stopped at two stale existing anchors (lineage foreign-key construction and batch-save options); these are being updated to the composed entry points, rather than bypassed.

### Isolated browser artifacts

The named browser drivers previously hard-coded screenshot destinations directly under /tmp. They now use the existing screenshotPath seam, which honors SW_SCREENSHOT_DIR and otherwise TMPDIR, preserving their ordinary defaults. This keeps final browser and mutation artifacts under the assigned temporary root. Earlier runs used the drivers' hard-coded screenshot locations before this was corrected; test fixture helpers also defaulted to /tmp before TMPDIR was consistently supplied. No unrelated file or shared Git configuration was removed. Future commands explicitly set TMPDIR=/tmp/sw-009.

### Cross-project resolution continuation

Review found that following only the original project's store would miss a later rename in the destination project after an explicit cross-project move. Resolution now opens each additional visible project's history once, and replays each operation record once. A workspace integration test moves a file across projects, renames the moved item, and resolves its original address through both stores.

Proof: hidden/missing and migration-store integration — 14 pass, 0 fail, 152 assertions; readability passes.

### Commit-lookup failure cleanup

The added local HEAD lookup originally happened after trash metadata or personal staging preparation. A lookup failure could therefore leave an orphan directory despite no journal starting. HEAD is now read before those writes. A real temporary Git wrapper is removed after workspace setup to force the lookup failure through move/delete entry points; source, state, trash and history remain unchanged.

Proof: migration-store tests — 11 pass, 0 fail, 138 assertions; TypeScript passes.

### Server boundary mutation proof

The four additional mutants reveal hidden-vs-missing, read project data before visibility, duplicate an operation replay, or log an address field. Each is killed through real parsing/model resolution or journal installation. The existing lineage-direction and save-guard anchors now target the adopted function/options shape; the save-client baseline supplies the required requested path and valid SHA-256. The new address browser command is registered in the shared gate inventory and pipeline matrix. Mutation temporary trees now honor TMPDIR; no preload shim is used.

`TMPDIR=/tmp/sw-009 SW_BASE_URL=http://127.0.0.1:5301 bun scripts/mutation-tests.ts`:
`681/681 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`

This proof precedes the final frozen-tree gate. The new server cases are loaded only for their own categories, avoiding unnecessary workspace initialization in every other candidate.

### Public documentation and code map

The address guide covers all 17 kinds and 43 conformance fixtures, relative forms, canonical escaping, stability, IRI identity, volatile names, consumer obligations, persistence inventory and bounded ordered migrations. README, configuration, user/development guides and Unreleased entries describe the final behavior. The architecture map identifies derivation, adapters, persistence, caller resolution and reconciliation, and the place to extend a kind. The dropped retention environment variable is explicitly unsupported rather than introduced as a no-op.

Proof: documentation-count test — 1 pass, 0 fail, 20 assertions; docs-sync exits 0. Full public leak scans pass for README, architecture, changelog, address and user guides. The full scanner flags pre-existing public /tmp command examples in configuration/development; these usage commands must be preserved under the brief. Their confidential-only scans pass, as do internal evidence/tasks scans. The requested repository scripts/commit_cadence.py is absent (the actual command exits 2); no replacement checker is added.

### Private key retirement

The mapping graph's exported conceptId/datasetId/metricId/fieldId wrappers are retired; its resolved-scope keys use the canonical formatter directly. No production caller imported those wrappers. A TypeScript syntax-tree scan rejects legacy concept/dataset/field/join/metric template shapes outside the compatibility adapter. Renderer document IDs, evidence paths and explicit unresolved UI keys retain their separate meanings.

Proof: private-key guard and mapping graph tests — 19 pass, 0 fail, 6,679 assertions; the full static check passes. The documentation and private-key guard together pass 2 tests with 22 assertions.

### Remote completion-gate continuation

The local full-suite run was interrupted externally during shared-machine memory pressure, and has no completion result. Heavy verification now uses the authorized sw-midgard-run wrapper, one remote command at a time, with its memory/CPU caps and temporary root. The wrapper's scratch-repository push is the only newly authorized transport; no GitHub push or remote-setting change is made. The old local frontend listeners are gone.

The first remote run exposed the exhaustive enterprise resolver test exceeding Bun's default timeout. Segment matching now compares typed name/position values instead of repeatedly serializing them, and rejects nonmatching children before allocating their paths. One shared predicate preserves kind checking and duplicate detection. The focused enterprise proof passes locally with 11,002 assertions; no timeout or correctness assertion is relaxed. The kind-mismatch mutant is retargeted to that predicate and remains in the full mutation gate.

### Remote baseline and portable fixtures

The first remote `bun test` finished with `2177 pass`, `11 fail`, `265094 expect() calls`, `Ran 2188 tests across 308 files. [1296.66s]`. These are actual failures, not a completed gate claim. The same affected cases were run against unchanged main 655df09 in an archive inside the wrapper checkout. Main reproduced the Git identity/merge/restore failures, the hard-coded temporary-path assertion, and the five-second ratio, metric-binding and exact open/save correctness timeouts. Its metric API alias test passed in 20.82 seconds, while the feature exceeded 30 seconds, identifying a feature performance regression to fix.

Bun 1.4.0's implicit child environment does not include later process.env changes: a small probe returned undefined implicitly and the assigned value with explicit env. Test Git helpers now pass the existing isolated environment, and the identity fixture initializes that isolation before capturing its restore value. The deployment test expects its existing temporary-directory prefix beneath tmpdir(), rather than a hard-coded /tmp. No production Git, authorization or deployment behavior changes.

An initial focused run also discovered the archived baseline because Bun treats unprefixed test paths as filters. The baseline archive was removed before the proof, and focused paths now begin with ./tests/. Heavy commands remain remote; transient wrapper SSH/artifact-copy errors are separate from test outcomes.

Proof: remote fixture run — `41 pass`, `0 fail`, `340 expect() calls`, `Ran 41 tests across 7 files. [16.65s]`. Logs are retained in out/gate-009/fixture-fixed.log and main-focused.log. The optimized enterprise resolver also passes remotely: 11,002 assertions, with the test body taking 1.48 seconds and no timeout adjustment.

### Metric lookup cost on the capped remote CPU

The API alias timeout was introduced by rebuilding the model address index for every metric field reference. A model-local lookup now builds separate canonical and legacy indexes once per validation/query, lazily for metric validation. Canonical addresses win over colliding legacy labels. The lookup is recreated for each model value and no cache survives edits.

The exact open/save, ratio KPI and unknown metric-binding cases receive a 30-second framework budget because main also exceeded their default five-second budget remotely. The metrics API case keeps its existing 30-second limit; explicit graph and view performance limits are unchanged.

Proof: remote focused run — `32 pass`, `0 fail`, `Ran 32 tests across 5 files. [70.81s]`. The API alias case takes 21.21 seconds, compared with 20.82 seconds on main and over 30 seconds before index reuse. Local adapter tests pass 5/5 with 26 assertions; metric extension tests pass 8/8 with 293 assertions. The full static check, readability check and docs-sync pass. The remote log is out/gate-009/metric-index-fixed.log.

### Architecture review: cross-project history order

The required pre-push architecture review found that appending a destination's entire history could replay a rename from before arrival or miss an intervening rename when a document moved back. Both scenarios were reproduced through workspace save/move/resolve entry points: 10 tests passed and two failed before the fix. Resolution now follows each destination immediately after the shared document-move record; both stores install that record in one journal and never prune it. Cached project histories still avoid repeated reads, while later re-entry resumes after its new shared marker. No timestamp ordering is inferred.

Proof: `TMPDIR=/tmp/sw-009 bun test ./tests/address-migration-store.test.ts` — `12 pass`, `0 fail`, `140 expect() calls`, `Ran 12 tests across 1 file. [2.71s]`. The earlier full remote unit gate passed 2,189 tests with zero failures before this review correction; the final gate must be rerun on the corrected tree.

### Architecture review: save metadata failure cleanup

The second review finding was a new Git metadata lookup after single-file save staging but outside its cleanup block. Deleting the configured Git wrapper reproduced an orphaned .staging directory through saveFile; 11 tests passed and the staging assertion failed. The lookup now runs before staging, matching move/delete ordering. The existing failed-lookup fixture also checks save, move and deletion together, without introducing another isolation layer.

Proof: `TMPDIR=/tmp/sw-009 bun test ./tests/address-migration-store.test.ts` — `12 pass`, `0 fail`, `141 expect() calls`, `Ran 12 tests across 1 file. [3.16s]`. Visibility regression proof — `4 pass`, `0 fail`, `20 expect() calls`. The reviewer reported no other blocking architecture findings.

### Reviewed implementation: remote gate checkpoint

Production source at 10408a68 includes both verified architecture-review corrections. The required review
marker is recorded, and the pre-push check reports `79 unpushed commits checked, 0 findings`.

- Remote `bun test`: `2190 pass`, `0 fail`, `265122 expect() calls`,
  `Ran 2190 tests across 308 files. [1136.23s]`. Full output: out/gate-009/unit-reviewed.log.
- Local `bun --bun run check`: TypeScript, formatting, lint, comments, theme and brand checks pass.
- Local `bun --bun run build`: `✓ built in 2.92s`. Remote build also passes: `✓ built in 3.04s`.
  The existing large-chunk warning remains.
- Remote `bun run test:addresses`: `4 item address browser checks passed`. This uses the owned
  frontend on 5489 and API on 5490, including the actual rename/reference/history round trip.

The initial server-backed mutation attempt never reached its runner: a readiness curl had no timeout,
and the forced-Bun Vite launcher did not open its port. The interrupted command has no mutation result.
Its identified API/frontend/probe processes were stopped through the wrapper. A later 5401 collision
reached another frontend; that attempt is invalid evidence, and the existing listener was left alone.
Subsequent launchers use the repository's bun x vite-plus command, bounded readiness, isolated process
groups, and a unique response marker to verify endpoint ownership before opening a browser.

The real graph and lineage suites then exposed these existing remote baseline failures. Unchanged
main 655df09 was archived inside the wrapper checkout and tested with its own frontend and API. Only
its screenshot destinations were redirected into the owned output folder; assertions were unchanged.
The archive was removed after its servers stopped. No performance budget or geometry assertion changed.

| Command | Feature result | Main result | Log pair (.log) |
| --- | --- | --- | --- |
| test:graph, dev | 227 ms > 100 ms | 233 ms > 100 ms | browser-graph / main-graph |
| test:graph, build | 63 ms; later select clipping | Same select clipping | production-graph / main-production-graph |
| test:lineage, build | 3,482 ms > 2,000 ms | 3,494 ms > 2,000 ms | production-lineage / main-production-lineage |

All listed logs are under out/gate-009/. These failures are not claimed as passing gates or feature
regressions. The remaining named browser suites, actual remote mutation runner and final paired
visual comparison still require completion after this checkpoint.

### Functional browser gate results

The remaining browser commands ran sequentially against the owned production frontend/API on 5489.
Each suite used its own isolated workspace/browser and closed them before the next command.

- `bun run test:metrics`: `11 metrics checks passed` (exit 0).
- `bun run test:item-edit`: `11 item-edit checks passed` (exit 0).
- `bun run test:ui`: `20 UI checks passed` (exit 0).
- `bun run test:edges`: `6 edge attachment UI checks passed` (exit 0).
- `bun run test:auth`: exit 0, 36 PASS lines; its final line is
  `PASS Git history is refused for a person who cannot read every file`.
- `bun run test:responsive`: exit 1 at its first graph-height assertion: 481 px versus a required
  value greater than 504 px. Its main comparison has not run yet, so this failure is not classified.

Full outputs are out/gate-009/production-{metrics,item-edit,ui,responsive,edges,auth}.log. The static
check passes again after the evidence checkpoint. Production code remains unchanged from 10408a68.

Three consecutive wrapper attempts to run main's responsive comparison failed at SSH transport
before executing tests. No AVX2-specific error occurred, so heavy work has not fallen back locally.
The responsive baseline comparison, actual remote mutation gate and final delegated visual comparison
remain pending. All server processes started by the completed browser commands were stopped by their
cleanup traps; the failed transport attempts started no test server.

### Retired mapping API in the mutation baseline

The actual remote mutation runner passed formatting/lint and reached its unmodified mapping-graph
baseline, then stopped because that case still called the retired conceptId/datasetId/metricId/fieldId
exports. Expected keys now use the public formatAddress function and the fixture's resolved scopes.
No production builder is restored, and assertions still compare independently formatted endpoints.

Proof: `bun scripts/mutation-case.ts <worktree>/src/app/mappings/mapping-graph.ts mapping-graph` exits 0.
The full static and readability checks pass. Only the mutation case and this evidence changed;
production source remains unchanged from 10408a68. The full remote mutation gate must be rerun.

### Portable mutation Git fixtures

The next real mutation run stopped at copy-worktrees before mutating source. Its Git subprocess
inherited Bun's initial environment rather than the fixture's isolated Git configuration. The same
focused case fails on unchanged main (exit 1, Git exit 128); the corrected case passes remotely
(exit 0). Logs: out/gate-009/main-copy-worktrees.log and current-copy-worktrees.log.

Mutation-case Git subprocesses now explicitly receive process.env, matching the existing fixture
contract. The deployment-ancestry fixture also uses the assigned TMPDIR instead of a fixed /tmp
prefix. The focused case passes locally with initially disabled global Git configuration; the full
static check and readability check pass. No production source changed.

Main's production responsive comparison has now completed: both branches measure the graph at
481 px and fail the same greater-than-504 px assertion. Logs are production-responsive.log and
main-production-responsive.log under out/gate-009/. This is a reproduced baseline failure.

The next unmodified baseline exposed the same implicit-environment issue in the security-review
SCM fixture. Remaining Git subprocesses in the security-review and export mutation case modules
now receive the same explicit environment. Unchanged main's focused SCM case fails remotely with
missing Git identity (exit 1); the corrected case passes (exit 0), as does its local counterpart.
Logs: out/gate-009/main-secrev-scm.log and current-secrev-scm.log. Formatting, full static checks
and readability checks pass. No test assertion or production source changed.

### Remote example baseline deadline

The actual mutation runner next stopped at the example-registry baseline with no assertion error:
its ten-second child deadline expired. The exact focused case passes on both branches when timed
without that deadline: `Main example baseline: 17.516 s` (exit 0) and
`Current example baseline: 18.190 s` (exit 0). Logs are main-example-registry.log and
current-example-registry.log under out/gate-009/.

Only this six-example category now receives thirty seconds on the capped remote CPU; other
categories retain ten seconds. Assertions and mutation anchors are unchanged. Full static and
readability checks pass. This is a measured baseline deadline correction, not an AVX2 failure
or a claimed mutation-gate pass; the real gate must complete with the corrected deadline.

## Completion gate and integration status

All implementation tasks are addressed. The completion commands were executed without a preload
shim. The strict browser gate is not entirely green: graph, lineage and responsive failures were
reproduced on unchanged main 655df09. Their assertions remain unchanged.

Production source is anchored at 10408a68. Subsequent commits correct mutation fixture portability,
the retired mapping API assertion, and a measured remote baseline deadline; they do not change app
behavior. Heavy runs used sw-midgard-run serially, with owned listeners on 5489/5490 and dynamic
fixture ports. No AVX2-specific failure required a local heavy run.

| Command | Actual summary or failure |
| --- | --- |
| `bun test` | `2190 pass`; `0 fail`; `265122 expect() calls`; `Ran 2190 tests across 308 files. [1136.23s]` |
| `bun --bun run check` | `All matched files use the correct format.`; TypeScript, lint, comments, theme and brand checks exit 0. |
| `bun --bun run build` | `✓ built in 2.92s`; existing chunk-size warning only. |
| `bun run test:addresses` | `4 item address browser checks passed` |
| `bun run test:metrics` | `11 metrics checks passed` |
| `bun run test:item-edit` | `11 item-edit checks passed` |
| `bun run test:ui` | `20 UI checks passed` |
| `bun run test:edges` | `6 edge attachment UI checks passed` |
| `bun run test:auth` | Exit 0; 36 PASS lines; final `PASS Git history is refused for a person who cannot read every file` |
| `bun run test:graph` | Development long task 227 ms vs main 233 ms, both over 100 ms; production select clipped on both branches. |
| `bun run test:lineage` | Production first view 3,482 ms vs main 3,494 ms, both over 2,000 ms. |
| `bun run test:responsive` | Production graph height 481 px on both branches; same greater-than-504 px assertion fails. |
| `bun scripts/mutation-tests.ts` | `681/681 targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.` |

Exact summaries for the suites whose output includes their isolated data root:

```text
11 metrics checks passed on isolated data root /srv/dev/tmp-009-item-addresses/workbench-browser-bLPhnG.
11 item-edit checks passed on isolated data root /srv/dev/tmp-009-item-addresses/workbench-browser-Gv8fy5.
```

The three failing scripts finish with these unchanged error summaries:

```text
error: script "test:graph" exited with code 1
error: script "test:lineage" exited with code 1
error: script "test:responsive" exited with code 1
```

Gate logs are retained under out/gate-009/. The mutation log is mutation-reviewed.log; the unit
log is unit-reviewed.log. Browser feature/main pairs use the production-* and main-production-*
filenames recorded above. The full static check passed again after the final mutation runner edit.

Compaction remains deliberately dropped: A→B, B.f→B.g, B→C resolves A.f to C.g, whereas compacting
the outer moves to A→C loses the middle rewrite and yields C.f. The uncompacted project store
refuses writes beyond 50,000 records atomically. Its unsupported retention environment setting
was omitted, and the equivalent parent-kind mutant was documented rather than counted as killed.

Integration follow-ups remain explicit: feature 008 supplies published-snapshot lookup; suffixes
currently stay opaque. Feature 010 supplies operation-key settlement; migration appends use the
existing save/batch-save routes, and stale old-base retries are not promised safe replay. RDF
resources could later use IRIs; RDF blank nodes and built-in concepts remain unaddressable. The
store currently assumes one workspace process per DATA_DIR. No unrelated baseline browser
layout/performance behavior was changed.

Docs-sync and the public documentation leak scan exit 0. The requested commit-cadence script
cannot run because scripts/commit_cadence.py does not exist in the repository (exit 2).

### Feature commit ledger

```text
d5e1ed2c docs(spec): specify item addresses (feature 009)
3a53e72f docs(spec): clarify item addresses (reconciliation permission, undone renames)
a9ab5f4d docs(spec): research for item addresses
4b85e054 docs(spec): data model for item addresses
ca4b11d7 docs(spec): address grammar and migration store contracts
572913ee docs(spec): quickstart for item addresses
1d2ad271 docs(spec): implementation plan for item addresses
1f94bf28 docs(spec): tasks for item addresses with traceability
65ceaca1 docs(spec): analysis fixes for item addresses (migration kinds, hidden-equals-missing wording, traceability)
e87fed28 data: add item address conformance cases
77e23866 feat: define item address kinds and seeded fixtures
478704e3 data: cover reserved bytes and oversized malformed locators
0ea842da feat: implement canonical item address grammar
6a9dd8e1 fix: reject document-relative resolution without a document base
5c6b5fef test: detect canonical item address grammar mutations
d29141c9 data: cover document snapshot and positional address forms
49ede3eb docs: record item address proofs and derivation blockers
75013451 data: include unnamed embedded mapping address
37629f86 feat: define volatile unnamed mappings and structured address scope
bc01bbab feat: derive and resolve structured item locators
66b65af0 test: cover model locator ambiguity and volatility guards
1cee6bbf feat: attach locators to structured inspector results
6b639b21 feat: adapt legacy item labels without delimiter guessing
f703231a feat: use scoped locators in mapping graphs
0f1ca13b feat: apply and validate ordered address migrations
6ecfa7aa test: detect migration replay and ownership faults
4f051ad4 fix: preserve unresolved context responses with addressed mapping keys
c1baad5b test: use scoped keys in mapping mutation cases
43504926 test: record killed address migration mutants
3fa4f1f8 fix: label only source-backed mapping scopes and concepts
114ffd9a fix: preserve mapping center ordering across escaped names
38321846 fix: restore unnamed legacy inspection at the scope boundary
9830ceee test: verify address samples in independent cases
e8c1136e fix: remove unsafe exact-chain migration compaction
35abe71d fix: defer mapping adoption until scope contracts are settled
73069d44 fix: reject coerced model names at the address boundary
369c8b36 docs: record address gate results and unresolved scope contracts
1f2ec317 data: cover unnamed ontology roots and array item addresses
0ad5beea feat: derive volatile locators for every unnamed structured item
725f1cba feat: attach locators to structured inspector results including unnamed roots
6ec7165c feat: restore scoped mapping canvas keys with positional roots
aab85041 feat: address lineage cards and rows from structured definitions
8f6be82d fix: preserve lineage labels and stored centers during address adoption
df6332b5 feat: record graph selections and neighborhood centers as item addresses
844920f9 fix: index ODCS item paths once during inspection
6e94bf36 feat: use scoped item addresses in agent context and query plans
275aa52b feat: resolve metric extension references through item key adapters
2987094b test: exercise independent consumers of the item address grammar
9decef4d test: expect scoped field locators in legacy wrapper resolution
a017c265 test: compare canonical lineage keys against unchanged displayed labels
cf93141c test: complete graph selection and lineage adoption browser proofs
ffc70a50 docs: inventory durable item key shapes before conversion
4fe520ce feat: back up and convert durable grouping keys atomically
dd4560dd feat: convert saved canvas centers after verified backups
f42e19e0 feat: stage bounded uncompacted address history in owning journals
1a14974c test: recover definition changes and address history at every journal boundary
b5563d35 feat: append declared renames atomically through save routes
71fdfb50 fix: rewrite relationship mapping targets only for their defining concept
7d53b1e0 feat: declare item and document scope renames from workbench edits
334a814a feat: record document moves and carry history through project trash
367a2e26 feat: reset reused locators at explicit deletion markers
eb836ef0 feat: journal explicit item and file deletion tombstones
040d1a49 feat: reconcile missing item locators with save authority and replay safety
63b85a7a test: preserve external rename ambiguity through pull and branch switches
9b42c75b feat: resolve item history behind the caller read boundary
03e0c109 test: validate resolver fixtures through real structured inspection
e12b122f test: keep item addresses out of logs and telemetry exports
220bdfbc fix: clear adoption lint failures before the mutation gate
cef829cf test: route browser artifacts through the existing isolated screenshot seam
b574b960 fix: follow destination history after a cross-project item move
c91862e9 fix: read local commit before preparing address history side effects
cfa0dfd2 test: kill hidden-read replay and address logging faults in the real gate
7fe3b2c9 docs: define item address stability storage and integration contracts
726d167c refactor: retire private item key builders and guard their old spellings
d6225bdb perf: compare locator segments before allocating unmatched sibling paths
32d71cc9 test: isolate Git fixture subprocesses and honor the temporary root
c479f88f perf: reuse model address indexes within metric validation and queries
d0aafbdb fix: replay cross-project history after each shared arrival marker
10408a68 fix: fetch save history metadata before creating staged files
f83227ea test: record reviewed unit gate and paired browser baseline failures
696084a5 style: keep remote gate evidence rows within the line limit
09f8ecae test: record completed functional browser gates and pending remote checks
8625d4e1 test: format mapping mutation keys through the public address API
509ab839 test: pass isolated Git configuration to mutation fixtures
c5b8f1ef test: preserve isolated Git environment across mutation case modules
e42cab7d test: allow the measured remote example baseline to finish
```

### Final-build visual comparison

The delegated review rebuilt unchanged main and e42cab7d, then captured 20 states per build and
six repeated main controls at desktop and phone widths. No page errors occurred. Both builds
reported the same three phone neighborhood warnings that the canvas occupies 50% of the screen.
Those capture commands retain exit 1; this is not reported as an entirely passing visual gate.

Visual inspection found no address-induced label or layout defect. Randomized Network layouts
also vary on main. Label-view differences came from the unchanged tour clicking during the
150 ms zoom animation. A separate focused run waited for 175 ms of unchanged viewport before
and after animated zoom steps, preserving every geometry assertion on both builds. All four
paired states then had identical viewport styles and node/path geometry. Phone images were
pixel-identical; desktop differed in 13 low-intensity rasterization pixels, with zero pixels
above RGB delta 25. No page errors occurred in this run either. The same two phone canvas
warnings remain, and both focused capture commands retain exit 1.

The reviewed journey contains 54 captures including the focused pairs. Address-copy and migration
dialogs are outside this visual tour; their functional browser coverage is recorded separately.

Primary artifacts: out/item-address-final-comparison-20261116-112755/ (20 + 20 + 6 captures).
Focused proof: out/item-address-final-zoom-20261116-161342/settled-viewport-proof.json and paired
PNGs. The final remote production build summary is `✓ built in 5.20s`. Owned servers stopped;
temporary main source archives were removed. No unrequested application change was made to
silence baseline geometry/performance failures or capture timing.

The final task records command execution and classification, not a claim that the baseline
browser failures satisfy their thresholds. All task checkboxes are addressed, including the
explicit compaction omission. Integration remains subject to the non-green baseline gates
reported here. The evidence-only completion commit follows the feature commit ledger above.

## Operation-boundary integration continuation

The following results supersede the prior completion checkpoint for integration onto main.
Fetched origin/main is a153c20f, including operation-boundary contracts and constitution 4.0.1.
The branch rebased successfully; conflicts retained both changelog streams, shared body limits,
save classifiers, address declarations and both mutation inventories. The boundary's longer
remote deadlines and timeout-as-failure behavior replace the earlier address-only deadline edit.
Focused proof after rebase: `bun test ./tests/auth/operation-inventory.test.ts`: `7 pass`, `0 fail`,
`224 expect() calls`; `Ran 7 tests across 1 file. [600.00ms]`.

### Integration scope ledger

- The operation boundary owns trusted caller admission, effects, refusal mapping and audit.
- Workspace readers and write authorizers already enforce concrete project/file visibility.
- Save, batch-save, move, delete and grouping operations keep their existing handlers and journals.
- Resolution/reconciliation gain inventoried twins; parity must preserve hidden/missing behavior.
- Snapshot text remains opaque; boundary dispatch adds neither receipts nor save replay settlement.

The installed remote wrapper pushes scratch refs with --force. To honor the new no-force-push
instruction, a temporary copy removes that flag and uses the fresh scratch name
009-item-addresses-operation-boundary. The installed wrapper, Git remotes and other worktrees
remain untouched. Remote work still uses the wrapper's unprivileged capped execution and pulls.
The original no-new-HTTP-route assumption is superseded by this integration request, as recorded
in the spec Clarifications. No new MCP transport or tool is introduced.

### Inventoried address entry points

The new focused entry-point tests first failed because itemAddresses.resolve and
itemAddresses.reconcile had no twin dispatch. After registration and route composition,
`bun test ./tests/item-address-operations.test.ts`: `3 pass`, `0 fail`, `19 expect() calls`;
`Ran 3 tests across 1 file. [1.96s]`. This covers HTTP/twin resolution with an opaque suffix,
a read-only connection refusal, same-key lost reconciliation reply recovery, unchanged bytes,
conflicting key reuse, malformed/foreign bodies and hidden/missing equivalence. Generic parity
and full-role matrix cases are registered and will run remotely before this integration is done.

### Migration operation parity and targeted predicates

`bun test ./tests/address-operation-parity.test.ts`: `2 pass`, `0 fail`, `34 expect() calls`;
`Ran 2 tests across 1 file. [4.61s]`. Both server-mode transports preserve ordered rename,
item-deletion, recreation, document-move and file-deletion history. The baseline definition is
committed before the person's first write, and the checks read that person's working copy.

The focused remote driver uses the registered route mutations and the normal mutation case
entry point: `6/6 address route mutants killed; unmodified baseline passed.` The faults remove
project/item scoping, unknown-field rejection, operation-key typing or the bounded body read.
The canonical parser already guarantees canonical spelling, so the route no longer repeats it.
The full unmodified global mutation runner remains required after the final implementation edit.

Reconciliation uses the boundary's workspace/body-target admission pattern; concrete target
visibility and edit authorization remain inside its owning service. Both metadata-only routes
join the guard inventory with explicit reasons, and the hidden-body-target regression includes
reconciliation. Focused checks after these changes:

- `bun test ./tests/item-address-operations.test.ts`: `3 pass`, `0 fail`, `21 expect() calls`;
  `Ran 3 tests across 1 file. [2.05s]`; HTTP acceptance is retried through a twin with one record.
- `bun test ./tests/auth/write-regressions.test.ts`: `9 pass`, `0 fail`, `169 expect() calls`;
  `Ran 9 tests across 1 file. [7.95s]`.
- `bun test ./tests/auth/guard-inventory.test.ts`: `3 pass`, `0 fail`, `259 expect() calls`;
  `Ran 3 tests across 1 file. [10.64s]`.

Formatter, readability and docs-sync checks pass. Generic remote parity/matrix execution is still
running; all full completion commands will run on the final committed source, without a preload.

### File-scoped reconciliation admission correction

The subsequent architecture review found that workspace/body-target admission rejected a caller
whose edit permission was limited to the target file, even though saving that file succeeded.
The new real-entry-point regression demonstrated save `200` followed by reconciliation `403`.
Reconciliation now uses the existing file-target admission with
`POST /api/projects/:slug/item-addresses/reconcile/*`; the parsed destination document must
match the wildcard. No generic boundary admission logic changed. The earlier workspace/body
route description above is superseded by this correction. The seventh registered route mutant
removes the URI/document binding predicate.

- `bun test ./tests/auth/item-address-scope.test.ts`: `1 pass`, `0 fail`, `4 expect() calls`;
  `Ran 1 test across 1 file. [1402.00ms]`.
- `bun test ./tests/item-address-operations.test.ts`: `3 pass`, `0 fail`, `21 expect() calls`;
  `Ran 3 tests across 1 file. [3.68s]`.
- `bun test ./tests/auth/write-regressions.test.ts`: `9 pass`, `0 fail`, `168 expect() calls`;
  `Ran 9 tests across 1 file. [7.36s]`.

The earlier remote focused run completed with `53 pass`, `5 fail`, `2 errors`,
`31522 expect() calls`; `Ran 58 tests across 6 files. [850.37s]`. All address entry points,
migration parity, generic operation parity, inventory and route-action checks passed. Five
existing authorization-matrix tests timed out (two at 60 seconds and three at five seconds),
with two follow-on errors after timeout cancellation. These are not classified as baseline
exceptions until the same matrix has run on unchanged main at a153c20f remotely.


### Completed boundary admission and compatibility proof

The scoped-role correction was independently reviewed with no remaining architecture blocker.
`bun test ./tests/auth/guard-inventory.test.ts`: `3 pass`, `0 fail`, `259 expect() calls`;
`Ran 3 tests across 1 file. [9.59s]`.

Unchanged main a153c20f was archived inside this wrapper checkout, with the same dependencies,
and the real authorization matrix ran without changing its timeouts or assertions:
`bun test ./tests/auth/matrix.test.ts`: `15 pass`, `1 fail`, `1 error`, `36341 expect() calls`;
`Ran 16 tests across 1 file. [125.75s]`. Its read-route test exceeded 60 seconds and cancellation
caused a follow-on Git status refusal. The archive was removed by the command's exit trap.
All other main matrix checks passed. The feature's subsequent full run passed that read-route
matrix in 46.65 seconds; the other earlier focused timeouts did not recur either.

The first full integration `bun test` returned `2273 pass`, `2 fail`, `340064 expect() calls`;
`Ran 2275 tests across 327 files. [1630.60s]`. Both failures were introduced by the two new
inventory rows being absent from generated fixtures, not baseline exceptions. The shipped
matrix now includes the new project-read and file-edit cases; HTTP characterization adds 26
caller/route records. All 1,547 original HTTP records are retained exactly, including their
original Cedar rule ordering. Every original matrix principal and case is unchanged.

After regeneration, focused checks passed:

- `bun test ./tests/auth/http-characterization.test.ts`: `1 pass`, `0 fail`,
  `1574 expect() calls`; `Ran 1 test across 1 file. [17.12s]`.
- `bun test ./tests/auth/dry-run.test.ts`: `8 pass`, `0 fail`, `37 expect() calls`;
  `Ran 8 tests across 1 file. [22.90s]`.

The first full integration run also passed both migration-history parity journeys, all address
entry points, the conditional-file role regression and generic operation parity for both new
IDs. A fresh plain full unit gate is running on the corrected generated fixtures. No runtime
implementation changed to repair these two failures.

## Disk-recovery completion gates

After the disk failure, the clean worktree was verified at c595b1da with a153c20f as an
ancestor. Runtime source still matched the reviewed f4f7ec07 tree. Uncommitted results from
the interrupted run and lost temporary logs are not used as proof. Every remaining completion
command is rerun remotely, serially, with large logs and captures retained on midgard. Only
small command summaries are pulled back. The temporary non-force wrapper was recreated from
the installed wrapper with the same two documented changes; no GitHub push or force push is used.

The fresh `bun --bun run check` exited 2: duplicate `tmpdir` and `join` imports in
`tests/pipeline/deploy-azure.test.ts` survived the automatic rebase. Main has only one copy of
each import, so this was an integration error. Removing the duplicate pair restores that file
to main without changing its test behavior or temporary-directory isolation.

`bun test ./tests/pipeline/deploy-azure.test.ts`: `5 pass`, `0 fail`, `20 expect() calls`;
`Ran 5 tests across 1 file. [63.00ms]`. The fixture uses fake deployment commands; no external
service, container or real deployment is invoked. Formatter and changed-line readability pass.
Remote gate logs and small summaries use out/gate-009-operation-recovery/.

### Recovered static gate

`bun --bun run check`: exit 0. `All matched files use the correct format.`;
`Finished in 152ms on 1076 files using 12 threads.`; lint: `Found 2605 warnings and 0 errors.`
Comment, theme and brand checks also passed. Full logs remain remote; the local summary is
out/gate-009-operation-recovery/check-summary.txt.
