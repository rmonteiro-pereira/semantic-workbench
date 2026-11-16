# Contract: the operation boundary

The HTTP adapter and trusted in-process callers use this contract. Signatures are described in words.

## Minting a caller

`mintCaller({ principal, origin, sourceIp, session?, connection?, scope? })` returns a caller. It is
exported only to the request authentication stage, the HTTP adapter and the MCP authenticator. The
MCP authenticator MUST authenticate the outer request first (bearer or person connection), then
mint with `origin: 'mcp'` and its connection id.

## Building a twin request

`buildTwinRequest(operationId, { params, query?, body?, signal? })`:

1. Looks up the inventory entry; refuses an operation whose `dispatch` is not `twin`.
2. Fills the row's path template with each parameter percent-encoded; the splat is encoded segment
   by segment.
3. Serializes the query (sorted keys) and the JSON body; refuses a body above the operation's
   request limit.
4. Returns a `Request` whose URL host is a fixed internal name, whose method is the row's method, and
   whose only header is `Content-Type: application/json` when there is a body.

`BadRequestError` identifies malformed caller parameters, invalid JSON and oversized bodies.
Programming errors such as a forged caller remain exceptions.

The twin has no cookies, no `Authorization`, no `Origin`, no `Host`, and no forwarding headers.

## Dispatching

`operate({ caller, request, operationId?, outcome? })` returns `{ response, requestId }`.

Steps, in order:

1. `assertMinted(caller)`; otherwise throw (a programming error, not an HTTP answer).
2. Attach identity to the request (`attachIdentity`), including the session reference.
3. `routeFor(method, pathname, mode)`. No match: 404 unmapped. A public row, a stream row or a row
   whose inventory entry is not `dispatch: twin`: refused as unmapped.
4. If `operationId` is named, the row's inventory entry id must equal it; otherwise refuse.
5. Application clients: the row's client action replaces its action; a row without one refuses.
6. Connection scope: static effects (403, reason `connection-scope`).
7. Authorization decision, trash target resolution, Steward audit scope, local-only rule, pass for
   body-targeted rows, no-grant refusal: exactly the logic of the HTTP path.
8. The route handler runs. A `WriteAccessError` becomes an audited denial. A hidden response becomes
   an audited denial and a 404 body.
9. One audit record: denial, or allow with the semantic outcome. Non-HTTP origins are audited even
   for plain reads.
10. Server mode: a 404 answer is normalized.

A twin cannot reach the network-level checks (rate limit, Host, Origin, cross-site, bearer) because
those belong to the request that carried it.

## Listing

`availableOperations(caller)` returns operation ids, sorted. An id is present when the caller's
effective permissions allow the operation's action (or its client action) on at least one target,
using `routeVerdict(scope, row, mode, target)` shared with `operate`, and the connection scope covers its static effects. It
performs no handler work and returns no resource names.

## Requiring a dynamic effect

`requireEffect(request, effect)` is called inside the owning authorizer when an effect is known
(for example `authorizeGitPush` requires the `remote` effect for a commit with `push: true`). With no connection
scope it does nothing. Without it, a scoped connection could push through a commit tool.

## What the boundary does not do

It does not rate limit, count concurrency, store receipts or map responses to tool results. The
caller owns those.
