# Contract: authorization endpoints

Server mode only. Addresses are relative to `SW_PUBLIC_URL`. The parameter and error names follow
the standards the 2026-07-28 MCP authorization text points to; task T070 compares this page with
that text before the tests are fixed.

## The four unauthenticated answers

| Request | Answer |
| --- | --- |
| `GET /.well-known/oauth-protected-resource/api/mcp` (and the same document at `/.well-known/oauth-protected-resource`) | JSON: `resource` (the MCP address), `authorization_servers` (this server), `bearer_methods_supported: ["header"]`, `scopes_supported` (the offered scopes) |
| `GET /.well-known/oauth-authorization-server` | JSON: `issuer`, `authorization_endpoint`, `token_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token","urn:semantic-workbench:grant-type:setup"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported`. No registration endpoint, no `jwks_uri` |
| `POST /oauth/token` | See below |
| `POST /api/mcp` without a valid token | `401` with `WWW-Authenticate: Bearer resource_metadata="<protected-resource metadata address>"`, an empty body, no cookie |

All four: no `Set-Cookie`, `Cache-Control: no-store` (metadata may be `public, max-age=300`), body at
most 4,096 bytes for requests, rate limited by source address with the sign-in allowance, bounded
anonymous audit.

## Authorization page (needs the browser session)

`GET /oauth/authorize`

| Parameter | Rule |
| --- | --- |
| `response_type` | `code` |
| `client_id` | A registered program |
| `redirect_uri` | Exactly one of its registered addresses |
| `code_challenge`, `code_challenge_method` | 43 to 128 characters, base64url; method `S256` |
| `scope` | Space-separated, each allowed for the program; empty means the default scopes the program may have |
| `resource` | Exactly the MCP address |
| `state` | Optional, at most 512 characters, returned unchanged |

Failure of any rule renders an error page (status 400) and never redirects. An anonymous request
redirects to sign-in with the full request as the return address. Success renders the consent page
(status 200) and creates a pending request.

`POST /oauth/consent` (form): `pending` (id), `decision` (`allow` or `deny`), `scope` (the checked
scopes, a subset of the requested ones the person may use), `csrf` (the session's request token).
Answer: `303` to `redirect_uri` with `code` and `state` on allow, or `error=access_denied` and
`state` on deny. A stale, repeated or foreign post renders the error page (status 400) and issues
nothing.

## Token endpoint

`POST /oauth/token`, `application/x-www-form-urlencoded`, public client (no authentication).

| Grant | Parameters | Result |
| --- | --- | --- |
| `authorization_code` | `code`, `client_id`, `redirect_uri`, `code_verifier`, `resource` | Tokens |
| `refresh_token` | `refresh_token`, `client_id`, `resource` | New tokens |
| `urn:semantic-workbench:grant-type:setup` | `setup_credential`, `client_id`, `resource` | Tokens |

Success (`200`, `Cache-Control: no-store`):
`{ "access_token", "token_type": "Bearer", "expires_in": 600, "refresh_token", "scope" }`. The
scope is the granted set. No other field; in particular no person, role or program detail.

Failure: `400` with `{ "error": "invalid_request" }` for a malformed body, and `{ "error":
"invalid_grant" }` for everything else, including unknown and mismatched programs. The status,
headers and body are identical in all of those cases. A code or setup credential is spent by the
first presentation whatever the result. A retired refresh token revokes the connection before the
answer.

Limits: body 4,096 bytes; each parameter 2,048 characters; rate limit as sign-in.

## The MCP endpoint in server mode

`POST /api/mcp` checks, in order and stopping at the first failure: method (`POST`), `Origin`
(any value is refused, `403`), content type (`application/json`, `415`), bearer (a token looked up
by keyed hash, resource-bound, connection `active`, `401` challenge otherwise), the person (the
session found by reference, the person not deactivated, still holding a grant; otherwise the
connection ends and `401`), then the protocol handler of feature 006 with the caller of
`data-model.md`. Cookies are never read. A refusal says nothing about which check failed.

## Not exposed

No registration endpoint, no introspection or revocation endpoint (revocation is a signed-in
person's action, see `connection-management.md`), no device endpoint, no metadata fetch, no
JWKS.
