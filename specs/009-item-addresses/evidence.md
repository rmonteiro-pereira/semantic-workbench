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
