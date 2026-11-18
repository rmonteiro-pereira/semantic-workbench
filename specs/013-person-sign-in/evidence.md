# Evidence and departures from the plan

Where the plan named files or shapes that differ from the code that landed, the code was followed.

## Original handoff observations

These describe the earlier worker state; the continuation results below supersede resolved items.

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
- T040: dev-server `bun run test:mutation -- connections`: 10/10 connection mutants killed; both unmodified baselines passed. The connections selector exits after its own cases and never starts unrelated mutation/browser cases. Existing targeted source-copy machinery is reused; no dependency added.
- T042: `bun test tests/pipeline/ci-validate.test.ts`: 8 pass, 0 fail. `test:connections` is a self-served canonical gate suite. `ci-validate.ts` already imports those shared lists, so a duplicate pipeline list is unnecessary.
- Phase 10 STOPPED on a contract contradiction: Chromium sends `Origin: null` on the consent POST under required `Referrer-Policy: no-referrer`; request-authentication requires exact SW_PUBLIC_URL. The real browser run proves 403 before a code is issued. The regression assertion records only Origin, never cookies or credentials. Do not relax the origin gate without reconciling the consent-header/CSRF contract. T033/T034 component implementations exist but their full browser proof is blocked; T035–T037 remain unticked. The capture currently contains only the first consent screen, not a complete manifest.

## Continuation scope ledger

- Existing operation-boundary verdicts enforce roles, effect ceilings and person/connection audit attribution; the MCP adapter must preserve those guarantees.
- Session references already identify keyed store records without reconstructing a browser cookie; delegated remote credential writes add a locked update through that existing identity.
- Grant presentation already spends credentials synchronously; attachment after a session await must not lose a concurrent replay, and resolution must recheck revocation after the await.
- Indexed token lookup selects a candidate; the continuation adds constant-time verification of that candidate's keyed hash without changing token formats or storage.
- Production browser consent cannot currently satisfy both the mandated referrer policy and the exact-Origin gate. Browser release proof is stopped rather than changing that contract implicitly.

- Indexed token candidates and pending grants now receive constant-time keyed-hash verification; token formats and storage remain unchanged. Store/grant proof: 14 pass, 0 fail; service: 26 pass, 0 fail; registration: 6 pass, 0 fail. The two small store/grant files were accidentally run together locally; subsequent grouped proofs use the dev server.
- Documentation scanner: eight updated public pages pass the complete scanner. `.env.server.example` and `docs/configuration.md` retain existing public temporary-path usage examples required by the brief; these trigger the generic path rule, while the confidential-only scan is clean. No allow rule was used.

- T031: dev-server `bun scripts/mcp-acceptance.ts --server-mode`: server MCP reference acceptance passed (client/server 2.4.0; 21 tools, authenticated project read, revoked-token 401). This is real HTTP transport with fixture consent, not a browser compatibility claim; server-mode programs remain not tested end to end. Listener and fixture close in finally.
- Consolidated feature proof on the dev server: 131 pass, 0 fail, 15,412 assertions across 16 files (412.57 seconds). Later constant-time verification edits have separate store/grant/service proofs; final static/build checks remain to run.

- Final check first reached the brand rule and refused the pre-existing hard-coded product name in the onward-use sentence. The sentence now uses the active brand at render time and escapes it; default-brand wording remains identical. Consent page proof: 10 pass, 0 fail, including a custom product name with HTML characters.

- Separate pre-existing integrity limit: the planned eight retired-refresh hashes and 5,000-entry in-memory grant cap bound replay recognition. An older/evicted credential is refused as unknown, so it cannot revoke a surviving connection; restart likewise loses spent-code memory. The code and planned bounds are unchanged. Public threat-model wording now makes this limit explicit. The security reviewer must reconcile unqualified replay language with those retention decisions before release.

- T029: dev-server parity/tool-matrix/boundary-scan/delegated-Git run: 7 pass, 0 fail, 26,956 assertions. The added direct-tool matrix then passed separately: 1 pass, 0 fail, 30,209 assertions in 415.24 seconds, calling all 21 tools for all 64 scope combinations and every one of the nine identity fixtures (12,096 schema-valid direct calls). Stale versions and existing paths prevent permitted write probes from changing the fixture. The existing matrix proves hidden equals missing; the reference-only Git test proves credential persistence without a cookie. The first direct fixture attempt was refused by the existing missing-remote-service guard; it now uses the established remote-credential fixture. No production guard changed.
- Handler compact pass keeps the unconfigured endpoint refusal in the mode-selection block and removes a nested ternary. Gate proof: 2 pass, 0 fail; unconfigured endpoint proof: 1 pass, 0 fail.

- T041 final dev-server `bun --bun run check`: pass (TypeScript, formatting, lint with 0 errors/2,680 warnings, comments, theme and brand). The guide states the scope ceiling rather than a sandbox, onward use, session/day reconnection and unverified-program status. Docs sync exits 0; guide proof remains 2 pass.
- Generic pre-push check: 82 unpushed commits scanned; no secret/attribution findings, one architecture-review-due finding. The brief explicitly reserves architecture review and the marker for the integrated batch and forbids origin pushes. Only owner-approved wrapper scratch synchronization was used; no review marker was manufactured and no origin push attempted.

- Final dev-server build: `bun --bun run build` passed; Vite built in 3.15 seconds. Existing chunk-size and dependency directive warnings remain. `out/proofs/connections-build.log` and `connections-check.log` keep the complete outputs.
- Targeted mutation rerun after all production changes: 10/10 connection mutants killed; both unmodified baselines passed. Complete output: `out/proofs/connections-mutation.log`. No full mutation suite ran.

- Phase 10 follow-up before sign-off: program loading currently validates the document envelope/version/list, not every returned registration member. Connection loading validates its id and state but still accepts empty client identifiers. Finish successful-response member/nonempty-identifier validation with refusal cases when that phase resumes; component proofs do not establish that stronger boundary contract.
- Final scans: 50 changed source/test files pass the confidential-term scan; ten public prose documents pass the complete scanner; configuration/env and internal notes pass confidential-only. A synthetic branding fixture collided with a confidential-term rule and was replaced with neutral wording (no allow). Its focused page proof remains 10 pass.

- Phase 9 STOPPED after the fresh-call matrix: completed MCP receipts return before any twin/boundary authorization. A receipt for the same person/key/arguments can be recovered through a read-only connection, even for git_commit. This returns an earlier result; it does not execute a new unauthorized commit. Real endpoint reproduction: `bun test --todo tests/mcp/connection-receipt-authorization.test.ts` reaches the expected refusal assertion and receives `ok: true` instead of false (0 pass, 1 todo). The test remains explicitly TODO, not a passing refusal proof. T029 is unticked again: fresh-key matrix coverage is insufficient for this shortcut. Reconcile replay authorization/resource checking/audit at the operation boundary before resuming the phase; do not invent a parallel policy evaluator or merely filter tool discovery.
- The final consolidated feature command passed: 132 pass, 0 fail, 15,414 assertions across 16 files in 417.00 seconds. Complete output is retained in `out/proofs/connections-own-proof.log`. This command excludes the explicitly pending MCP receipt regression and cannot establish release readiness.

- T043: final static/HTTP run on the dev server passed `bun --bun run check` again on the final test source, followed by HTTP characterization: 1 pass, 0 fail, 1,602 assertions (29.00 seconds). The build already passed on the identical production source (2,322 modules, 3.15 seconds). The final exact feature command passed 132/0 as above. This tick records those scoped commands only; the receipt TODO and failed browser proof keep the feature/batch red.
