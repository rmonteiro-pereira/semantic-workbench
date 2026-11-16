# Implementation Plan: Operation Boundary

**Branch**: `010-operation-boundary` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-operation-boundary/spec.md`

## Summary

`createAccessMiddleware` is split into three parts that keep today's order of checks. A request
authentication stage produces a minted **caller**. An **operation boundary** takes a caller and a
request and runs route selection, authorization, the existing handler, refusal mapping and audit.
A thin HTTP adapter composes them, so the server calls the same boundary that the MCP tools of
feature 006 will call with a twin request. Identity reaches handlers through one attach function
that also carries the session for delegated Git credentials. The audit record gains origin, tool,
method and connection and a semantic outcome; the dry run samples writes and MCP reads in separate
strata; tool lists are computed from effective permissions with the dry run's probe resources; and
`policies/operation-inventory.json` records every route row's service, action, targets, handler
checks, limits, effects and exposure, checked by a test. A characterization of HTTP behaviour is
recorded first, on the unchanged code, and must pass unchanged at the end.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server). No browser code changes.

**Primary Dependencies**: none new. Cedar policy evaluation, `bun:test`, the existing mutation
harness (`scripts/mutation-tests.ts`) and the audit verifier (`scripts/audit-verify.ts`).

**Storage**: the audit log's month files gain optional fields. No new store. The inventory is a
checked-in JSON file.

**Testing**: `bun test` (`tests/auth/`), the characterization replay, mutation cases for the boundary,
`bun run audit:verify` against a checked-in old-format fixture, and the existing browser suites
`test:auth` and `test:admin` to show the UI paths that use the boundary still work.

**Target Platform**: unchanged: local mode on a developer machine; server mode on one container.

**Project Type**: web service plus single-page app; this feature touches only `src/server/auth/`,
`policies/`, `scripts/`, `tests/`, `docs/`.

**Performance Goals** (chosen here, to be measured and recorded; not derived from a measurement):
an HTTP request through the new boundary costs no more than 5% over the recorded baseline median on
the in-process handler benchmark; `availableOperations` for 20 projects and every operation of the
inventory completes within 50 ms on the test fixture; a dry run over 50,000 MCP read records and 300
writes completes within the time of a dry run over 50,300 current-style records.

**Constraints**: no HTTP response, audit record or refusal wording changes; fail closed on a missing
or unminted caller; no copy of a handler check outside its handler; no tool-supplied value chooses
an action, a resource or a row; files of about 400 lines at most, functions of about 40.

**Scale/Scope**: about 120 route rows (the inventory test reports the exact count), 29 distinct
actions, tens of people per instance.

## Constitution Check

Checked against the constitution in the worktree (3.2.0) and against the amendments being drafted on
`constitution-tessera`, which this plan refers to by principle.

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Local mode keeps the implicit Admin principal through the same boundary; the loopback Host and Origin check stays in request authentication, and a twin never bypasses it because the network request that carries the MCP call passes it first. Server mode: no new outbound call; bearer tokens remain valid only where they are today (the change to the MCP endpoint belongs to the amendment for 006). No document content enters audit, logs or metrics. |
| II. Byte-Exact Source Preservation | No file is read or written by this feature; handlers run unchanged. |
| III. One Validation Rule Set | Untouched. Tool-side validation is not added; handler validation runs for twins. |
| IV. Atomic, Hash-Checked File Persistence | Untouched. The audit append keeps its single `fsync`ed write per record and its hash chain. |
| V. Pinned Official Standards | No standard is touched. The inventory has no JSON Schema file so that `schemas/` keeps meaning official or workbench formats. |
| VI. Verification Gate | Characterization replay, parity table, mutation cases (FR-040), audit compatibility fixture, listing fixtures, generated hostile-parameter test, and the route inventory test. **Amendment needed** (Principle VI): "every new route MUST be added to the matrix" extends to the operation inventory and its parity case. |
| VII. Honest Claims | Docs describe the shared boundary as "one code path", not as exposure of any tool. Counts in docs come from the inventory test. README's audit description gains the new fields. |
| VIII. Readable Code | The 538-line `middleware.ts` becomes four modules named for their concept; functions stay near 40 lines; comments say why; no IDs in comments (`check:comments`). |
| Technical Constraints | **Amendment needed** (Technical Constraints): "every route and every server-side derivation MUST obtain its decision from the one authorization boundary" becomes "every operation, whatever transport it arrives by, goes through the operation boundary; no transport, adapter or tool decides access". No new dependency. Single-instance rule unchanged. |
| Development Workflow | Gate: `bun test`, `bun --bun run check`, `bun --bun run build`, `test:mutation`, `test:auth`, `test:admin`. Destructive-operations rule unchanged. |

Complexity Tracking is empty: the new modules each own one concept, and no pattern is added without
its problem (see "Patterns used").

## Design

### The new modules

| Module | Concept | Moves or adds |
|---|---|---|
| `src/server/auth/caller.ts` | Who is calling, minted once | `Caller`, `CallerOrigin`, `mintCaller`, `assertMinted` |
| `src/server/auth/request-authentication.ts` | Proving who sent a network request | rate limits, local check, bearer, cross-site check, principal resolution, anonymous audit gate (from `middleware.ts`) |
| `src/server/auth/operation-boundary.ts` | Deciding and running one operation | `operate`, `availableOperations`, `recordProtocolCall`; `execute`, `routeDecision`, `refusal`, `refusedTarget`, trash lookup, audit input (from `middleware.ts`) |
| `src/server/auth/operation-inventory.ts` | The contract of every operation | typed parser of `policies/operation-inventory.json`, lookups by row path and operation id |
| `src/server/auth/twin-request.ts` | Building an in-process request | `buildTwinRequest` |
| `src/server/auth/connection-scope.ts` | Effects a connection may use | effect vocabulary, `scopeAllows`, `requireEffect` |
| `src/server/auth/replay-sample.ts` | Which audit records a dry run replays | strata, deduplication, constants |
| `src/server/auth/middleware.ts` | The HTTP adapter | composes the above, page redirects, request id and observability wrapper |

`request-scope.ts` gains `attachIdentity` and `requestSession`; `remote-credentials.ts` reads the
session through them; `audit.ts` gains the new fields, validators and filters; `dry-run.ts` and
`access-admin.ts` call `replaySample`.

### Flow of one request

1. HTTP: `request-authentication` limits, checks Host and Origin (local), validates a bearer token,
   checks cross-site requests, resolves the principal. It mints a caller (`origin: http`).
2. The adapter selects the route row to find the anonymous action and the page redirect; for an
   authenticated caller it calls `operate(call)`.
3. `operate` re-selects the row from the twin or HTTP request (one function, `routeFor`), checks
   the caller was minted, substitutes the client action, refuses non-dispatchable twins, checks that
   the row equals the named operation (twins), applies the connection scope, decides, runs the
   handler and audits.
4. MCP (006): its authenticator mints a caller (`origin: mcp`), a tool calls `buildTwinRequest`, then
   `operate({ caller, request, tool, outcome })`, then maps the response to a tool result.

For HTTP, step 2's row selection and step 3's are the same call on the same request; the adapter
passes the found row on so the work is not repeated.

### Patterns used

- **Adapter**: `middleware.ts` adapts network requests to the boundary. Problem: two transports, one
  decision path.
- **Branded capability** (minted caller): the runtime `WeakSet` stops code outside authentication
  from fabricating identity. Problem: a structural type alone does not stop a tool from building a
  caller literal.
- **Strategy by callback**: the outcome classifier, supplied by the caller. Problem: only the caller
  knows whether a 2xx body reports failure, and the boundary must not know tool shapes.

No other pattern is introduced.

### Audit and dry run

`AuditInput` and `record()` gain `origin`, `tool`, `method`, `connection`. `tool` is checked
against the inventory's ids, `method` against a fixed list, `connection` against
`/^[A-Za-z0-9_-]{1,64}$/`. The serializer-completeness test lists every input key. `queryAudit` and
`exportAudit` gain filters and CSV columns appended after the existing ones. `replaySample` builds
the strata of research R8; `MAX_AUDIT_SNAPSHOTS` keeps its value for stratum A, and the read cap
`MAX_READ_SNAPSHOTS` is 500 (chosen here, see the spec's assumptions). `createAuditLog` receives the
configured retention, and start-up builds one log per data root.

### Inventory

Entry shape, vocabularies and the generated table are in [data-model.md](./data-model.md) and
[contracts/operation-inventory.md](./contracts/operation-inventory.md). The inventory test is added
beside `tests/auth/route-actions.test.ts` and reuses its example requests.

### Contracts

- [contracts/operation-boundary.md](./contracts/operation-boundary.md): the callable boundary,
  caller, twin request builder and results, as 006 consumes them.
- [contracts/operation-inventory.md](./contracts/operation-inventory.md): the inventory file.
- [contracts/audit-log-delta.md](./contracts/audit-log-delta.md): the changes to the audit record,
  queries and export, and the dry-run strata.

## Project Structure

### Documentation (this feature)

```text
specs/010-operation-boundary/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── operation-boundary.md
│   ├── operation-inventory.md
│   └── audit-log-delta.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
policies/
└── operation-inventory.json          # new: the contract
src/server/auth/
├── caller.ts                         # new
├── request-authentication.ts         # new, extracted from middleware.ts
├── operation-boundary.ts             # new, extracted from middleware.ts
├── operation-inventory.ts            # new
├── twin-request.ts                   # new
├── connection-scope.ts               # new
├── replay-sample.ts                  # new
├── middleware.ts                     # shrinks to the HTTP adapter
├── request-scope.ts                  # attachIdentity, requestSession
├── remote-credentials.ts             # session lookup through the caller first
├── audit.ts                          # origin, tool, method, connection, filters, CSV columns
├── dry-run.ts, access-admin.ts       # replay strata
└── route-actions.ts                  # unchanged rows; exports the dispatchability helpers
src/server/observability/metrics.ts   # recordOperation
src/server/handler.ts, authentication.ts, index.ts   # one audit log with mirror and retention
scripts/
├── record-http-characterization.ts   # new
├── operation-inventory-table.ts      # new
├── operation-boundary-mutants.ts     # new
├── operation-boundary-mutation-cases.ts   # new
└── mutation-tests.ts, mutation-case.ts    # wired
tests/auth/
├── http-characterization.test.ts
├── operation-boundary.test.ts
├── operation-parity.test.ts
├── operation-inventory.test.ts
├── operation-listing.test.ts
├── twin-request.test.ts
├── connection-scope.test.ts
├── boundary-scan.test.ts
├── audit-origin.test.ts
├── audit-compat.test.ts
└── dry-run-strata.test.ts
tests/fixtures/
├── characterization/http-v1.json
└── audit-v1/2026-0*.jsonl            # months written by the unchanged code
docs/operations.md                    # generated
docs/audit-tamper-evidence.md, ARCHITECTURE.md, README.md, CHANGELOG.md   # updated
specs/003-authn-authz/contracts/audit-log.md, policy-model.md             # updated
```

**Structure Decision**: all new code sits in `src/server/auth/`, where the current boundary lives,
one module per concept. Nothing is added under `src/server/mcp/`; that folder belongs to 006, which
imports `operation-boundary.ts`, `twin-request.ts`, `caller.ts` and `operation-inventory.ts` only
(enforced by `boundary-scan.test.ts` once the folder exists).

## Delivery phases (detail in tasks.md)

1. **Record**: the HTTP characterization and the old-format audit fixture, on unchanged code.
2. **Split**: extract authentication, boundary and adapter with no behaviour change; characterization
   and existing tests stay green after every step.
3. **Callable boundary**: caller, twin builder, identity attach, scope seam, row match, parity table.
4. **Audit and dry run**: fields, outcome classifier, protocol-call record, retention, strata.
5. **Listing and inventory**: inventory file, test, generated table, listing.
6. **Gate and documentation**: mutants, scan test, docs, constitution note, release gate.

## Complexity Tracking

No violations.
