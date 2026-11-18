# Evidence and departures

Notes on tasks that were skipped, changed or found different from their description.

## T008: the Admin audit view has no origin filter

`src/app/admin/AuditSection.tsx` filters by person, action, resource project and time only, and
`src/app/admin/types.ts` has no origin field, so there was no origin option to extend. The server
query and the export already accept `origin=acp` (checked in `tests/auth/audit.test.ts`). The
Admin view was left unchanged; adding a new filter control would be a design change that this
feature was not asked to make. The audit contract and `docs/audit-tamper-evidence.md` name `acp`.

## T004: one more literal found

`src/server/routes/files.ts` kept the person's unsaved draft only for a caller with origin `mcp`.
It now does the same for `acp`, so an agent panel write shows in the editor as an outside change.
The plan did not list this file.

## Endings and connection contract

The end-to-end flood case exposed a reset of the oversize counter before every frame, including
oversize frames. Consecutive oversize frames now accumulate and end the session. The lifecycle
proof covers the twelve server-produced reasons; `server-restarted` requires the browser 404
inference and remains part of the panel work before T027 is complete.

The connection directory now matches the connection service request and end notice: optional
origin, mutable named scopes (read/edit rather than operation effects read/localWrite), and connectionId, reason, origin, person and clientId on
end. The service's `signed-out` maps to `sign-out`, `session-ended` to `expired`, and registration,
replay and revocation endings to `revoked`. Real connection-service integration remains T028.

Connection proof: `bun test tests/acp/connection-auth.test.ts`: 3 pass, 0 fail. Lifecycle proof: `bun test tests/acp/end-reasons.test.ts`: 12 pass, 0 fail.

## Relay authorization and refusal audit

The public relay rows now authenticate at the relay adapter, then enter the ordinary operation
boundary with origin `acp`. A request-local WeakMap carries the authenticated context into the
boundary's invocation of the same route; it is deleted in finally. The exception in route verdict
is limited to the four registered relay operation ids and still evaluates read access and scope.
The HTTP authentication dispatcher leaves only those exact paths to relay authentication, so a
foreign Origin/Host reaches the audited authentication refusal instead of the former outer 403.
Relay delegation is a single contiguous block in request-authentication.ts. Middleware additions
are now confined to one HandlerOptions block using an inline type import. The request entry
remains responsible for authentication delegation, and relay authorization stays in the boundary.

Unknown methods are recorded as unsupported-terminal or unsupported-other; file and question
refusals get a bounded reason. No arbitrary method, parameter, path or content enters these records.

Proofs: `sw-midgard-run -- bun test tests/acp/ tests/auth/operation-inventory.test.ts
 tests/auth/route-actions.test.ts tests/auth/matrix.test.ts tests/auth/guard-inventory.test.ts`:
274 pass, 0 fail, 46,593 assertions. Additional targeted proofs after strengthening refusal checks:
`bun test tests/acp/audit-records.test.ts`: 2 pass, 0 fail; `bun test
 tests/acp/relay-boundary.test.ts`: 2 pass, 0 fail, including a real policy denial that leaves the
single-use code unconsumed and an allow record with origin acp and the connection id.

## Browser panel structure and proofs

Shared event types live in `src/shared/agent-panel/events.ts`; server normalizers re-export the
same types for existing callers. Presentation proofs live under `tests/acp/`, alongside the rest
of this feature's tests, rather than a second top-level test group. Reducer proof: 2 pass, 0 fail.
Presentation proofs: transcript 1 pass (million-character message and 5,000-character task),
connect 1 pass, change 1 pass (ordinary-save arguments and conflict), question 1 pass (eight long
escaped choices). These are rendering/contract proofs; focus and geometry belong to the browser
check, not server rendering.

The lazy person-menu import mounts the sheet beside the canvas into its own React root. Closing
removes that container, restoring canvas width and menu focus. No edits to main.tsx or
WorkspaceCanvas.tsx are necessary, so those proposed edits in T035 are skipped. The sheet's
BrandProvider preserves the deployment identity. The only PersonMenu change is one contiguous
menu-item block. The panel requests nothing until that item is chosen.

Shared-file consolidation: files.ts has one keepDrafts expression; me.ts one availability field;
middleware.ts one HandlerOptions block; guard-cases.ts one exemption block; route-actions.ts one
appended registration block. The latter registers conversation-only examples after the
definition-read matrix is derived, so event streams cannot hang the definition-read checks.

## Mutation scope

`sw-midgard-run -- bun scripts/acp-mutants.ts`: 19 killed, 0 survived, each candidate run through
`scripts/mutation-case.ts` after its passing baseline. The full mutation suite was not run.
The proposed mutant replacing the recorded base with the just-read current hash is equivalent:
the existing equality guard proves those hashes equal before save. It is omitted rather than
reported as killed. Dropping the equality guard, allowing an unread write and skipping the
second read are independently killed. The content/audit-origin candidates exercise the session
service's public start/end path; they do not add an unrestricted agent operation.

The browser exposed a permission-focus race: a question can arrive while the prompt POST is
still pending, so its first button is disabled at mount and cannot receive focus. Focus is now
applied once the action finishes as well as when the question id changes. The targeted renderer
proof remains green; the browser check exercises this race through the real relay.

Lifecycle proof completed: `bun test tests/acp/end-reasons.test.ts`: 13 pass, 0 fail, including
replacement of process-owned session state on the same data root/address, the 404 inference in
the browser client and refusal of the next file frame. The fixture can also serve the built
frontend through the same local static wrapper used by the production entry point.

Relay token review found that any successful HTTP reply was cast to tokens without checking its
fields. The relay now requires HTTP 200, Bearer type, nonempty access/refresh tokens and a positive
integer lifetime, with a bounded request deadline. Failed refreshes report a content-free error
and stop presenting a token. `bun test tests/acp/relay-token.test.ts`: 2 pass, 0 fail.

Browser proof on the dev server: `bun run test:acp`: 6 viewport/theme conversations passed,
including 360/768/1280 widths, both themes, real reference-agent messages, long text/paths,
versioned write, Undo, conflict, eight options, keyboard-visible focus, cancellation, all end
reasons and unchanged canvas geometry on close. Default screens sent no panel requests. No
capture was made: the screenshot portion of T036 is deferred with T037 as explicitly requested.
The baseline screenshot and exact main-bundle comparison remain the integrated regression gate's
responsibility; the panel code and stylesheet are separate lazy build chunks.

Documents cover relay setup, named scopes versus operation effects, the credential variable,
draft-text disclosure, memory-only transcript, limits, threat model and pending server assembly.
The request brief substitutes the reference agent for T042's unspecified real-agent selection:
compatibility is claimed only for reference-agent 1.0.0 in local mode. Its real relay/browser
acceptance connected, read, wrote, answered, cancelled and ended cleanly.

T041 requires no edit to ci-validate.ts: it already imports gateSuites and selfServedSuites, so
registering test:acp in those inventories includes it automatically. Proof: `bun test
 tests/pipeline/ci-validate.test.ts`: 8 pass, 0 fail. Docs sync on the working tree exits 0.
The leak scanner is clean for README, architecture and the panel guide. Its complete-file scan
flags the existing public container cache path in docs/configuration.md and .env.server.example
as a local path; those usage defaults are preserved rather than changed to evade the scanner.

Review removed a duplicate rendered copy of completed agent messages: the live announcement
used a class that did not exist in the theme. The visible message itself is now the polite
completed-message status region, without a second copy or clipped text. The transcript test
asserts a single escaped copy and the polite announcement attribute.

Session-create review found that an invalid JSON body was treated as default options and could
create a session. The route now rejects malformed, oversized and wrongly typed options before
calling the service. Its targeted route proof includes no state change for malformed bodies.

Final route-inventory review caught the positional requirement in route-actions.test.ts: the
conversation examples must precede the final pages row. The single appended block now inserts
them immediately before that row, after deriving the definition-read matrix.
Proof: `bun test tests/auth/route-actions.test.ts`: 7 pass, 0 fail, 385 assertions.

The origin-parity proof compared rule arrays by iteration order, although the decision supplies
the same rule set in either order. Its comparison now canonicalizes only rules; decisions,
resources and every other audit field remain compared. No production authorization changed.
Proof: `bun test tests/auth/acp-origin.test.ts`: 11 pass, 0 fail, 51 assertions.

The boundary scan lacked declarations for the panel's audit support and local identity factory,
including the identity import already present before this continuation. It now admits only
reportAuditFailure, createAnonymousAuditGate, auditDenial and localPrincipal in their exact owning
modules. Negative cases reject another symbol or another module; access evaluators and scope
construction remain forbidden. Proof: `bun test tests/auth/boundary-scan.test.ts`: 4 pass, 0 fail,
16 assertions. The preceding aggregate exposed these issues: 297 pass, 3 fail; the closing
aggregate must replace that result after these three corrections.
The final type check required an explicit array callback at the origin normalizer's caller,
so an array index cannot become its optional field name. The targeted origin proof was rerun:
11 pass, 0 fail, 51 assertions.
