# Continuation evidence

## Current result

The browser locators now target the last open native dialog rather than every dialog role.
At phone width the definition details panel also has the dialog role. The Name field uses
an exact accessible-name match inside the modal. T029 remains unchecked until the complete
remote browser flow passes and reports the 200-concept timing.

## Scope ledger

- The browser harness already isolates its workspace and cleans up its API and browser.
- The responsive details panel and the native modal can both expose the dialog role.
- Scoping the editing and confirmation selectors to the native modal changes only the harness.
- The full browser entry point must prove the selectors, revision confirmation and timing.

## Verification

- `bunx --bun oxfmt scripts/attributes-governance-browser-check.ts`: exit 0.
- `bun test tests/tessera/agent-context-r2.test.ts`: 5 pass, 0 fail, 23 assertions.
  This covers item-address context, governance flags, exclusion of private fields from
  context/plan/explanation, and published-only context versus the editing preview.
- Mandatory pre-push check: exit 1. It reports 88 unpushed commits and requires an
  architecture review for 9,068 changed code lines inherited from the feature history.
  The owner explicitly reserves that review for the integrated batch. No scratch push,
  remote browser run, grouped tests, check or build has been started by this continuation.
  A clarification is pending about allowing scratch synchronization with review deferred.

## Authorization finding requiring correction

`src/server/auth/policies.ts` generates a metric-ownership template that grants
`approveMetric` to configured groups. `src/server/auth/guards.ts` currently presents
ontology item changes as metric resources and authorizes that action. Consequently a
metric-only approval grant can also approve ontology governance. A separate ontology
approval action and policy/entry-point tests are needed before accepting this feature.
No correction has been made yet: the requested execution order starts with T029.

## Shared files requiring consolidation

Compared with base `5597ae52`, `src/app/main.tsx` has one added prop block.
`src/app/workspace/DetailsPanel.tsx` has five separate added blocks (import, prop type,
destructuring and two forwarded props). `src/app/workspace/hooks/useItemEditing.tsx`
has an import change and a choices block. These last two files still need consolidation
into one contiguous addition each without moving or reformatting existing lines.
`src/app/workspace/ItemSections.tsx` is a new file, so its 63 lines form one new block.
This continuation changes none of those files.

## Existing tests changed

No existing test was changed by this continuation. The preceding implementation changed:

- `tests/tessera/registry.test.ts`: registry entries and reserved name expectations.
- `tests/tessera/validation.test.ts`: revision and reserved-name expectations.
- `tests/tessera/loss-report.test.ts`: report version and compiler expectations.
- `tests/tessera/schema-derivation.test.ts`: supported revision schemas.
- `tests/helpers/tessera-refusals.ts`: updated reserved-name and revision findings.
- `tests/tessera/agent-and-access.test.ts`: allow published item context and status flags
  while retaining the exclusions for notes and attribute order.
- `tests/tessera/tessera-repository.test.ts`: additional repository cases.

These entries are carried forward from HANDOFF.md; the complete base diff still requires
review before the pull request. Prior fixture changes: `revision-2.yaml` became
`revision-3.yaml`, `reserved-governance.yaml` became `reserved-imports.yaml`, and
`loss-report.json` was regenerated for compiler 1.1.0 and report version 2.

## Remaining work and batch handoff

T029 awaits remote browser proof. T031, T032, T034, T035 and T036 remain incomplete.
The authorization correction, HTTP write-path cases and shared-file consolidation also
remain incomplete. No task is marked done on the strength of inspection alone.
T030 waits for the later screenshot capture job. T033 waits for the MCP server on this base.

The integrated batch owner must run the full unit suite, `bun run test:mutation`,
`test:attributes`, `test:tessera`, `test:validation`, `test:editor`, `test:item-edit`,
`test:addresses`, `test:auth`, remaining browser suites, T030 capture/comparison and
`architecture-reviewer`. The MCP owner must complete T033 after integrating that server.
The reviewer must address the metric-only grant widening described above, the existing
approved-status-removal limitation recorded in HANDOFF.md, and the incomplete HTTP matrix.
