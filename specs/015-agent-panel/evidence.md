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
The middleware addition is one contiguous dispatch block. Existing feature additions in imports
and HandlerOptions are retained; they are separate from that dispatch block and need attention
when integrating the shared file with the sign-in branch.

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
