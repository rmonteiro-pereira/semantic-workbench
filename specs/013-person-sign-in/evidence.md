# Evidence and departures from the plan

Where the plan named files or shapes that differ from the code that landed, the code was followed.

- The agent endpoint exists in `src/server/routes/mcp.ts` with its gate in `src/server/mcp/request-gate.ts`. Its row in `route-actions.ts` is `localOnly`; making it reachable in server mode is task T028 and is not done.
- The connection service is built inside `createServerAuthentication` (not in `handler.ts`) because it needs the session store, access control, audit log and key there. It is exposed as `connections: { service, grants }` and `HandlerOptions.connections`; the handler registers the routes from it. The one-minute sweep timer is cleared by `close()`.
- No exposure of `sessions` or `principalFor` was needed: the service gets `access.principalFor({ ...principal, deactivated: false })`, as the browser path does, so it never contacts the provider.
- Custom redirect schemes (FR-011) are not implemented: the verified specification requires `https` or loopback. See research.md, Verified.
- Added `iss` to the authorization response and `authorization_response_iss_parameter_supported` to the metadata (research.md, Verified).
- The consent page shows the registered redirect address in full.
- Three route files instead of two: `routes/oauth.ts` (documents, token), `routes/oauth-consent.ts` (pages), `routes/connections.ts`, `routes/admin-connections.ts`.
- `programs.json` is optional when reading an older administration repository (reads as empty), which the plan did not say; new repositories get it in the first commit.
- `AccessConfig` gained a required `programs` field; `access.programs()` returns it without copying the configuration.
- New request limit name `OAUTH_REQUEST_LIMIT` (4096 bytes) in `src/server/request.ts` and the operations schema enum, because the schema enumerates limit names.
- Rows are `serverOnly`; the delete examples use an id without the word `missing` so the existing write regression test (which resolves rows in local mode) still passes.
- Characterization recording: only the 12 `version` hashes and the two administration document lists (`programs.json` added) were edited by hand-patching the recording, not by re-recording, because a re-record also pulls in unrelated `published` fields the test strips.
- Layout rules for the pages were added to `auth-stylesheet.ts` together with the pages (T032 ticked with that work).
- `handler.ts` keeps the response's own CSP and Referrer-Policy for `/oauth/` pages that set `X-Frame-Options`, because the consent form must be allowed to send its answer to the program.
- `static.ts` no longer serves `/oauth/*` and `/.well-known/*` as the single-page app.
- Delegated Git credentials through a connection session: `getByReference` returns a session whose `id` is empty (the id cannot be recovered from its hash), and `remote-credentials` saves by `session.id`. No current tool uses the remote effect; the next worker must add `updateRemote` by reference before one does.
- Audit origin `acp`: `CALLER_ORIGINS` is `http | mcp` on this base. `connectionCallerOrigin` casts. The agent panel adds `acp` to the list; audit of an `acp` connection throws until it does.

## Continuation proofs

- T022: `bun test tests/docs-agent-connections.test.ts`: 2 pass, 0 fail. No server-mode client is claimed supported.
- Redirect decision settled by the owner: HTTPS or loopback HTTP only. FR-011 and the registration contract now agree with the implementation.
- T025: `bun test tests/auth/connection-scopes.test.ts`: 2 pass, 0 fail; consent rejects a role-disabled scope and unknown/disallowed scopes. Discovery checked across all 64 offered combinations against the role-admitted inventory. T026 still needs the full inventory walk, including direct refusals.
- T024 phase paused: the bridge contract requires plaintext client tokens in an owner-only file, while the execution brief forbids plaintext token storage. A clarification is pending; no bridge storage exception has been inferred.
- T028: dev-server targeted gate run: 19 pass, 0 fail across server gate, unconfigured-server absence, local gate, public surface and operation inventory. Route-action proof passed in the preceding run. Public transport dispatch now agrees with the inventory; an unconfigured handler returns 404 before workspace routes.
- MCP protocol audit is minted per request; anonymous gate refusals carry no local identity or connection.
- Delegated Git fix: `bun test tests/auth/connection-remote-credentials.test.ts`: 1 pass, 0 fail. A reference-only session after restart persists an exchanged Git credential, keeps lastSeenAt, and refuses mutation after end. `Session.reference` identifies the locked store record without exposing/reconstructing the cookie.
- ACP integration: unsupported origins now raise an explicit error before a connection/token record is written. `bun test tests/connections/connection-service.test.ts`: 24 pass, 0 fail. Feature 015 must add the origin to the shared operation/audit vocabulary before exchange can succeed; its setup credential API remains transport-neutral.
- T026: `bun test tests/auth/connection-scopes.test.ts`: 3 pass, 0 fail, 13,672 assertions. Every inventory row is checked through the shared route verdict for all 64 offered combinations, against an independent scope/effect table; no combination admits destruction.
- First dev-server check caught TypeScript union narrowing in the MCP route; the gate adapter now returns an explicit authenticated decision for either mode. Runtime gate proof remains unchanged.
- T030: `bun test tests/mcp/connection-cancellation.test.ts`: 1 pass, 0 fail. A slow protocol tool receives the connection end signal after explicit revocation; the request is joined before cleanup.
- Characterization re-recorded on the dev server with `scripts/record-http-characterization.ts`, not patched. The script now applies the existing test canonicalization (published project metadata excluded, Cedar rule sets sorted). Canonical output equals the prior hand-patched file. Against base 84642cb0, normalization proves that only administration version hashes and programs.json in version document lists differ.
- Person connections UI: `bun test tests/agent-connections-dialog.test.tsx`: 2 pass, 0 fail. Admin UI: `bun test tests/admin-agent-programs.test.tsx`: 3 pass, 0 fail. Browser geometry and interactive refusal states remain pending; T033/T034 are not ticked until that proof.
- Security races fixed while exposing MCP: simultaneous code replay is remembered before the first exchange attaches its connection, so the first exchange also refuses and revokes the eventual record. Resolve re-reads its indexed token after awaiting the session, preventing revoked/rotated tokens from minting a caller or restoring a stale active record. `bun test tests/connections/connection-service.test.ts`: 26 pass, 0 fail.
