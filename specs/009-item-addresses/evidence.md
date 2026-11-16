# Item address evidence

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
