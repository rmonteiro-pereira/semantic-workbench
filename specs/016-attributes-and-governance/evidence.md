# Feature evidence

## Browser

The isolated browser check passed at 1440 px and 360 px, both in light and dark theme.
It edited attributes, governance and context, verified cancel and confirm for the revision
upgrade and measured **290 ms** from opening the card to seeing the attribute in a
200-concept document. The check uses the modal titles to distinguish them from the phone
details dialog. The browser uses local mode. The role split is covered at the server boundary.

The dev wrapper transports commits to scratch. Pre-push checks and architectural review apply
to the integrated project delivery, not to scratch synchronization.

## Targeted mutation gate

`bun scripts/mutation-tests.ts --attributes` on the dev server passed all seven focused
baselines and killed **11/11** mutants. It covers target kind, role count, revision, owner and
approver checks, classification limits, distinct relationship identities, status removal,
demotion, published-only
selection and loss status counts. The standalone
candidate inventory only exports definitions, so the focused mode of the existing runner
executes the proof. The complete mutation gate belongs to the batch.

## Authorization and write paths

- The operation boundary continues to authorize the write before it compares the content.
- The content guard retains the before, after and committed owner comparison and save demotion.
- Policy binding distinguishes ontology items from metrics. Both ontology guard kinds use
  `approveOntologyItem`; metric approval uses its existing action and metric resource type.
- Approval policy sees the higher classification before or after the change. This honors the
  maximum level configured on an ontology approval grant.
- Built-in and existing custom roles require an explicit ontology grant. The Admin role editor
  exposes the action for custom roles and the server guide describes reviewed assignment.
- Through HTTP, a metric approver cannot approve a concept and an ontology approver cannot
  approve a metric. Both corresponding authorized writes succeed.
- Pull, revert, restore, import, switch and publish have HTTP cases, alongside the existing
  save, delete and move cases. The successful Git pull uses a fixture-local bare repository.
- Relationship identities distinguish concept and relationship names even when either contains dots.
- Clearing an approved status now requires approval authority. An author may explicitly
  return an item to proposed. Metric behavior remains as before.

## Agent output

The projection strips the raw Tessera fields, including notes and ordering, and omits ontology
owner, steward and classification from its governance flag. The flag includes status and, for
deprecated items, any replacement and reason. HTTP tests compare context, plans and metric
explanations before and after an unpublished ontology edit. The browser preview sees the
edited context. `tests/tessera/agent-context-r2.test.ts`: 5 pass, 0 fail.

## Shared-file blocks for integration

- `main.tsx`: one prop carries the existing item-editing functions to the details panel.
- `DetailsPanel.tsx`: one wrapper installs that support for the item sections. The original
  details presentation stays in place.
- `useItemEditing.tsx`: no remaining delta against the base. The shared relationship field
  derives built-in choices from the declared choices.
- `ItemSections.tsx`: one new file mounts the applicable sections and reads the edit support.
- `EntityDetails.tsx` and `RelationshipDetails.tsx` mount those sections. Catalog cards show
  attributes and status. The graph drawing folder has no diff.
- The other overlap points are the Tessera registry, reserved names, supported revisions,
  validator and generated schemas, compile and loss reporting, the guard and policy pipeline,
  item editing and references, the validation panel, the agent context, explanation and
  planner modules, and the browser and mutation inventories. HANDOFF.md lists the
  inherited blocks individually.

## Existing tests and fixtures changed

Compared with the completed Tessera revision 1 base:

| Path | Reason |
| --- | --- |
| `tests/auth/authorize.test.ts` | Covers the explicit grant requirement for the built-in Admin role. |
| `tests/auth/operation-inventory.test.ts` | Requires the policy binding and rejects metric approval for either ontology guard kind. |
| `tests/auth/guard-cases.ts` | Reuses the metric save request and constructs an explicit ontology approval grant for the write-path proofs. |
| `tests/helpers/tessera-refusals.ts` | Moves the unknown revision and reserved-property expectations to the next revision and the still-reserved imports property. |
| `tests/helpers/tessera-repository.ts` | Adds a repository fixture holding all three additions. |
| `tests/tessera/agent-and-access.test.ts` | Narrows the no-additions promise to fields that stay private and covers the permitted projection. |
| `tests/tessera/loss-report.test.ts` | Updates the report version expectation. |
| `tests/tessera/registry.test.ts` | Expects the three new registrations and remaining reservation. |
| `tests/tessera/schema-derivation.test.ts` | Checks the generated revision 2 schema alongside revision 1. |
| `tests/tessera/tessera-repository.test.ts` | Covers the additional repository fixture. |
| `tests/tessera/validation.test.ts` | Updates unknown revision and reserved-property expectations. |

The fixture index reflects the new supported range. The unknown-revision fixture now uses
revision 3 and the reserved-property fixture uses imports. The golden loss report was
regenerated for compiler 1.1.0 and report version 2. Feature tests added earlier on this branch
and updated in the continuation are the built-in target, details mounting, ontology guard
paths, ontology guard parity and agent context tests.

## Documentation

`bun test tests/tessera/docs-paths.test.ts`: 12 pass, 0 fail. The user guide's new finding
codes agree with the revision contract. The generated operations reference includes both
ontology guard kinds and the route list is unchanged.

## Validation comparison

On the development server, the shared `validateStructured` path returned no findings in
all samples. The input was the same 200-concept ontology with one built-in String
attribute per concept and only the revision marker changed. Across 50 warm, alternating
validation runs per revision, median validation time was **0.822 ms** at revision 1 and
**1.175 ms** at revision 2. Parsing was outside the timed region.

## Batch handoff

- The integrated batch owner runs the full unit suite, `bun run test:mutation`,
  `test:attributes`, `test:tessera`, `test:validation`, `test:editor`, `test:item-edit`,
  `test:addresses`, `test:auth`, and the remaining browser suites once on the integrated tree.
- The batch owner runs `architecture-reviewer` on that tree. The capture job owns T030,
  including the last-release comparison and the evidence index.
- The MCP owner takes T033 after the server is integrated. It must prove published context
  and status flags at the tool boundary with the same private fields excluded.
- The integrated reviewer should check the ontology grant rollout and the revision-number
  overlap with imports. Existing role memberships require explicit grants for ontology approval.
  Review any administrator-authored Cedar permits that match every action during rollout.
- The targeted browser check uses the isolated local API. The Editor/approver distinction is
  exercised through server-mode HTTP fixtures. Adding a sign-in and roles tour to the browser
  suite is larger than the selector and layout proof and belongs with the integrated auth tour.
- The inherited agent contract supplies item context at item addresses in context responses.
  Plans and explanations carry the selected concept and metric flags. Extending those two
  payloads to include item context text or relationship-level flags needs an explicit response
  contract and matching MCP coverage.

## Development server proofs

| Group | Pass | Fail |
| --- | ---: | ---: |
| Operation inventory | 9 | 0 |
| Tessera | 504 | 0 |
| Attributes | 75 | 0 |
| Governance | 70 | 0 |
| Agent runtime and HTTP | 54 | 0 |
| Metric extension | 8 | 0 |
| Addresses | 117 | 0 |
| Guards and role policy | 50 | 0 |
| Shared validation | 113 | 0 |

The operation table regenerates without a diff, and the readable-code and comment checks pass.
The address guard against retired private keys and the role matrix caught integration issues.
The final concept identity uses a one-part tuple and relationship identity a two-part tuple.
The matrix expects explicit ontology approval for Admin accounts as well.
