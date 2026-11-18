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
