# Contract: local access to the MCP endpoint

## The capability

- Created on first start of local mode when `<data root>/state/mcp-capability` is absent: 32 bytes
  from the platform's secure random source, written base64url, with mode `0600`, atomically.
- Read by the route when its modification time changes; never logged, audited, echoed in an error,
  placed in telemetry or put in a tool argument.
- Replaced by `bun run mcp:rotate`; the old value stops working on the next request.
- On Windows the file's access list is reduced to the current user with `icacls` (argument list, no
  shell). When owner-only access cannot be set on any platform, local mode refuses to mount the
  endpoint and logs why.

## Order of checks

The route runs these in order and stops at the first failure. Nothing before step 5 reveals whether
the capability is right, whether a tool exists or what version is spoken.

| Step | Check | Failure |
|------|-------|---------|
| 1 | The mode is local | the path is an unknown route (404) |
| 2 | The method is `POST` | 405 |
| 3 | The request has no `Origin` header at all (any value, including `null`, is refused) | 403 |
| 4 | `Host` is exactly one of the server's own loopback names with its port | 403 |
| 5 | `Authorization: Bearer <capability>` is present and equal (constant time) | 401, empty body, `WWW-Authenticate` absent |
| 6 | `Content-Type` is `application/json` | 415 |
| 7 | The body fits the global cap while it streams in | 413 |
| 8 | The per-caller rate and concurrency limits allow it | tool error `rate_limited`, not an HTTP error |
| 9 | The body is parsed and handed to the library | protocol errors per the conformance contract |

Failures at steps 3 to 5 count toward a failure rate limit per source address and are recorded as
anonymous denials by the existing anonymous-audit gate, with no header values.

## Bridge

`scripts/mcp-stdio.ts` reads the data root the same way the server does (`DATA_DIR`, default
`data`) and the port from `SW_PORT` (default 4310), the variables the server reads, reads the capability file,
and for each message from standard input posts it with the capability and the three mirrored
headers derived from the message. It writes each answer to standard output, one message per line,
never prints the capability, starts no server and opens no port. When the server cannot be reached
it answers the pending request with a JSON-RPC error whose text says to start the workbench in
local mode; when the server runs in server mode (the path is unknown) it says MCP is not available
in server mode yet.

## Direct clients

A client that takes a URL and a header uses `http://127.0.0.1:<port>/api/mcp` and
`Authorization: Bearer <contents of the capability file>`. The documentation shows the exact
configuration for Codex CLI and says where the file is. Browser-based clients cannot connect, by
design.

## Threat model, as documented

Protects against: another page in the person's browser, a web page using DNS rebinding, another
operating-system user on the machine without read access to the data root, and a container sharing
the network but not the files. Does not protect against: a process running as the same operating
system user (it can read the file), or any other local route, which keeps its existing boundary.
