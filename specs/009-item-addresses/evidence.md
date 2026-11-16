# Item address evidence

Earlier sections retain the initial attempt. The current scope stop and unshimmed gate results
are recorded in the later sections.

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
