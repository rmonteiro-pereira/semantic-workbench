# Research: Person Sign-In for Agent Connections

Each entry gives the decision, the evidence in the code at the base commit (or in 006 where marked),
and what was rejected. The governing decisions (M2 to M5) are not reopened. Protocol facts that
cannot be checked offline are marked **Verify** and have a task in `tasks.md`.

## R1. The workbench is the authorization server

**Evidence.** Bearer handling accepts identity-provider JWTs for application identities only and is
confined to `/api/agent/` (`src/server/auth/bearer.ts`, `acceptsBearer`). Sessions own the person's
delegated Git credentials (`src/server/auth/sessions.ts`, `remote`), so a token that refers to a
session gets revocation and credentials for free.

**Decision.** Own endpoints, opaque tokens, no new runtime dependency. The surface is small:
two metadata documents, an authorize page, a consent post, a token endpoint, a setup page.

**Rejected.** Provider-direct tokens (M2 rejects it for inconsistent setup and session integration);
a separate broker process (operating cost, M2); a library authorization server (a dependency that
would own routing, storage and error shapes; the logic here is about 600 lines of pure functions
and a small store).

## R2. Which programs are supported, and what is unknown

**Evidence.** M15 names Codex CLI and the bundled protocol reference client as the first matrix.
`docs/mcp-acceptance.md` in 006 records that Codex CLI "has not been tried" against the local
endpoint and that only the reference client has run.

**Decision.** Support is claimed only for programs recorded in an acceptance file after a real
run. The first release registers the reference client for tests. Codex CLI is documented as
supported only if task T039 shows it can complete the flow with a fixed callback port.

**Verify.** (a) Whether Codex CLI can use a pre-registered public client id, a fixed callback port
and a resource indicator. (b) Which discovery requests it makes (path-aware protected-resource
metadata or a different address). (c) Whether the reference client library handles a bearer
challenge by following the metadata. Answers may shrink the supported list; they do not change
requirements.

**Rejected.** Loopback port wildcards (they loosen the exact redirect rule), and claiming
compatibility from the protocol text alone (Principle VII).

## R3. Token storage and the keyed hash

**Evidence.** Sessions derive separate keys from `config.sessionKey` with `hkdfSync` and distinct
labels (`sw-session`, `sw-attempt`, `sw-provider-index`).

**Decision.** Derive a fourth key with the label `sw-connection-tokens` and store
`HMAC-SHA256(key, token)` as the lookup value. Tokens are 32 random bytes in base64url (43
characters). Compare in constant time. No separate secret is introduced: changing `SW_SESSION_KEY`
already ends every session, and FR-041 makes connections end with sessions, so one rotation event
covers both. A separate key would add a configuration value without adding a property.

**Rejected.** Plain SHA-256 (offline guessing is impossible for 256-bit random values, but a keyed
hash is what the constitution requires, and leaked state files alone then prove nothing); storing
tokens encrypted (they are never read back); a database table (state files are the repository's
durable form).

## R4. Where state lives

**Evidence.** Durable state is atomic JSON under `data/state/` (`atomicWriteJson`,
`src/server/projects/atomic.ts`); sessions use one file per record named by a hash; the 006 receipt
store uses a folder (`state/mcp-receipts`).

**Decision.** One file per connection, `state/connections/<id>.json`, written with
`atomicWriteJson`, plus an in-memory index by token hash built at start. Single instance per data
root makes the index authoritative. Pending requests, codes and setup credentials stay in memory
(decision 4 of the spec).

**Restart behaviour.** Connections persist. A connection whose session did not survive is ended at
the first sweep after start. A lost code means the program starts the flow again.

**Rejected.** One file for all connections (rewrites everything for each refresh); SQLite (it is a
rebuildable cache by Principle IV and must not hold this); keeping hashes only in memory (a restart
would end every connection although sessions survive).

## R5. Binding to the session and not extending it

**Evidence.** `sessions.get(id, touch = true)` updates last-seen unless `touch` is false. The store
is keyed by `sha256(id)` and calls `options.ended(session, reason)` when a session is removed for any
reason (`remove`). `sessions.subscribe(id, listener)` also signals the end. Session principals are
re-resolved against the current access configuration with `access.principalFor` on each browser
request (`src/server/auth/authentication.ts`, `resolve`).

**Decision.** A connection stores the session reference `sha256(session.id)`, never the id. Add to
the store (a) a lookup by reference that never touches last-seen, and (b) a way for more than one
party to hear about ended sessions (the existing single `ended` option is already used for audit).
The connection service subscribes to (b) and revokes. On each call the service looks the session up
by reference, rebuilds the principal with `access.principalFor`, and mints the caller.

**Rejected.** Storing the session id (a database leak would hand out browser sessions); a timer
that polls sessions (slower than the end signal); refreshing the provider token on agent calls
(would contact the provider and, through the refresh path, touch lifetimes).

## R6. Authorization request shape and resource binding

**Evidence.** Principle I requires PKCE S256, exact redirect, resource and client binding, one-use
codes. The repository's sign-in already does authorization code with PKCE as a client
(`src/server/auth/oidc.ts`), which is client-side code and cannot be reused for serving.

**Decision.** Standard authorization-code request parameters, with `resource` required and equal to
the MCP resource address derived from `SW_PUBLIC_URL`. Scopes are space separated. State is passed
through unchanged and bounded to 512 characters.

**Verify.** The exact required and optional parameters, error names and metadata fields of the
2026-07-28 authorization text and the authorization-server metadata and protected-resource metadata
standards it references. `contracts/oauth-endpoints.md` is written from what the code of the
protocol library in 006 (`@modelcontextprotocol/server`) and the decisions file say; task T038
compares it with the specification and records differences before tests are fixed.

## R7. Consent page and CSRF

**Evidence.** Sign-in pages are server-rendered without script and styled by
`src/server/routes/auth-stylesheet.ts`; sign-out forms use a per-session request token
(`docs/server-mode.md`).

**Decision.** The consent page is rendered by a new server module in the same way, with the session
token in a hidden field and a pending-request id. Headers: `Cache-Control: no-store`,
`Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'` plus the
redirect origin when needed, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.
The form needs its normal root origin for the CSRF gate. The redirect carries `no-referrer`.

**Note.** `form-action` and redirects: the consent post answers with a 303 to the program's redirect
address. Some browsers apply `form-action` to redirects after a post; the plan therefore lists the
registered redirect's origin in `form-action`, and T036 checks the browsers the suites use.

## R8. Scope to effect mapping

**Evidence.** `OPERATION_EFFECTS` in `src/server/auth/operation-inventory.ts`: read, localWrite,
commit, remote, publish, administration, destroy, credential. Connection scope is a list of effects
(`Caller.scope`).

| Scope | Effects |
| --- | --- |
| read | read |
| validate | read |
| edit | localWrite |
| commit | commit |
| remote | remote, credential |
| publish | publish |
| administration | administration (not offered) |

`destroy` is granted by no scope. The mapping lives in one pure module and is checked by a test that
walks the inventory: every operation's effects must be a subset of the effects of some scope set
that the product can offer.

**Rejected.** One scope per tool (a list that changes with every tool added); inheriting the
person's whole authority (M9).

## R9. Token endpoint answers and sameness

**Decision.** The token endpoint answers `invalid_grant` for every failure that concerns a
credential (code, verifier, refresh token, setup credential, program, redirect, resource) and
`invalid_request` only for a malformed body. Unknown and invalid clients get the same status,
headers and body. Time differences are reduced by doing the same lookups in the same order and
comparing with constant-time functions; the plan does not claim constant time overall.

**Rejected.** Distinct error names for debugging (the audit log has the reason).

## R10. Replay detection storage

**Decision.** A connection keeps the hash of the current refresh token and of its last 8 retired
ones. A presented hash that matches a retired one revokes the connection. Older retired hashes are
unknown and answer `invalid_grant` without revoking. 8 is assumed; it covers a client that retries
a few times after a crash.

**Rejected.** Keeping every retired hash (unbounded); a grace window that accepts the retired token
once (it hands an attacker who raced the real client a free refresh, and M2 asks for replay
detection).

## R11. Rate limits and anonymous audit

**Evidence.** `DEFAULT_REQUEST_LIMITS` and `SIGN_IN_PATHS` in `src/server/auth/rate-limit.ts` limit
by address; `createAnonymousAuditGate` bounds anonymous denial records.

**Decision.** The token endpoint and metadata documents use the sign-in limiter (add their paths to
`SIGN_IN_PATHS`) and the anonymous audit gate. The MCP endpoint's own per-principal call limits are
006's.

## R12. Bridge storage of the agent credential

**Evidence.** 006's `local-capability.ts` writes a file with mode 0600 and, on Windows, restricts it
with `icacls`, and refuses to run when it cannot.

**Decision.** Reuse the same helper for the bridge's credential file under the person's own
configuration folder (`$XDG_CONFIG_HOME/semantic-workbench/` or the platform equivalent), one file
per server address. Move the helper to a shared place when the bridge needs it, not before.

## R13. Which events end a connection, and when it is noticed

**Decision.** Immediate: session end through the subscription. Lazy: person deactivated, grants
removed, program removed or narrowed; these are checked at the next call, and a periodic sweep
every minute ends them so that the list is truthful. The sweep also removes ended records after
7 days (assumed).

## R14. The MCP resource address and the challenge

**Decision.** The resource is `SW_PUBLIC_URL` plus `/api/mcp`. The challenge header names the
protected-resource metadata at `/.well-known/oauth-protected-resource/api/mcp` and, for clients
that look at the root, the same document is also served at `/.well-known/oauth-protected-resource`.
That is two aliases of one document; both are public rows.

**Verify.** Whether the specification requires both and whether more public rows are needed; if the
specification requires another document, the unauthenticated list of Principle I changes and the
plan stops until the constitution is amended.

## R15. Admin storage of registrations

**Evidence.** Access documents are JSON files in the administration repository validated by
`schemas/semantic-workbench-access-v1.json`; each area has a document name and a `validate` branch
in `src/server/auth/access-config.ts` and a proposal builder in `src/server/auth/access-admin.ts`
(`documentFiles`, the area discriminator of the dry-run body).

**Decision.** New area `programs`, file `programs.json`, schema `$defs.programsFile`, discriminator
field `programs`. The existing `agents` area (application grants) is untouched. Validation of
redirect addresses lives in the shared schema plus one typed check, so the browser and server judge
the same document.

## R16. What the bridge needs from the server

**Decision.** Server address in, credential in, nothing else: it discovers the metadata, performs
the setup exchange and the refresh grant, and exposes standard input and output as in 006. It never
opens a browser. For a person with a browser the program's own flow is used instead; the bridge is
for programs that speak stdio.

## Verified (T038), read 2026-11-17

Source: the published Model Context Protocol specification, revision 2026-07-28, pages `basic/authorization`, `basic/authorization/authorization-server-discovery`, `basic/authorization/client-registration` and `basic/authorization/security-considerations` at modelcontextprotocol.io. The pages cite OAuth 2.1 draft 13, RFC 6750, 8414, 8707, 9207 and 9728; those documents were not read in full, only as the MCP pages quote them.

Confirmed, no change needed:

- The resource server must publish protected resource metadata with `authorization_servers`, and must either send `resource_metadata` in the 401 `WWW-Authenticate` header or serve the well-known document. Clients must try the path-aware address `/.well-known/oauth-protected-resource/<path>` and then the root address. The contract serves both and names the path-aware one in the challenge.
- The authorization server metadata address is `/.well-known/oauth-authorization-server`, and its `issuer` must equal the issuer used to build that address. The metadata must carry `code_challenge_methods_supported`, and a client refuses to continue without it. The contract lists `S256`.
- Pre-registered clients are a named mechanism and come first in a client's priority order; dynamic registration is deprecated and client ID metadata documents are optional (SHOULD). The server need not support either, so the absence of a registration endpoint and of `client_id_metadata_document_supported` is allowed.
- `resource` must be sent in authorization and token requests and must be the canonical address of the MCP server; the server must accept only tokens issued for itself. Exact comparison against `SW_PUBLIC_URL` plus `/api/mcp` is what the contract does.
- Exact redirect comparison against pre-registered values is required. PKCE with S256 is required, and public clients must get rotated refresh tokens.
- Invalid or expired tokens get 401. Other refusals use 400 for malformed authorization requests and 403 for insufficient scope.

Differences found and what was done:

1. **Redirect schemes (settled).** The security considerations say "All redirect URIs MUST be either `localhost` or use HTTPS". The owner confirmed HTTPS or loopback HTTP only. FR-011 and the registration contract now agree with the implementation: `https`, or `http` on a loopback host with an explicit port. There is no custom-scheme registration list.
2. **Issuer in the authorization response (new, additive).** Servers SHOULD return `iss` in authorization responses, including error responses, and then advertise `authorization_response_iss_parameter_supported: true`; a client rejects a response without `iss` when that flag is true. Added to the contract and the code: the redirect carries `iss` (the issuer, which is `SW_PUBLIC_URL`) and the metadata sets the flag.
3. **Redirect host on the consent page.** Authorization servers must clearly display the redirect URI host during authorization (stated under loopback risks). The consent page shows the program's registered redirect address in full.
4. **Scope in the challenge.** Servers SHOULD put `scope` in the 401 challenge, and SHOULD answer a runtime shortfall with 403 `insufficient_scope`. Not done: FR-007 forbids a challenge that distinguishes causes, and a scope hint is not needed because the program is pre-registered with its scopes. A scope refusal reaches the program as the tool's own refusal. Recorded as a deliberate omission.
5. **Mix-up and token passthrough.** Nothing to change: the workbench makes no upstream call with a connection token and never accepts an identity-provider token on the MCP endpoint.

Not verified: whether Codex CLI performs this flow with a fixed callback port and a pre-registered client id (T039).
