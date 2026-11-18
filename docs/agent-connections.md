# Agent connections

A server connection lets an external agent act as the signed-in person, limited by the selected
scopes and that person's current roles. An Admin must register the agent program first. No program
is registered automatically, and there is no dynamic registration or client metadata fetch.

Semantic Workbench does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.

## Register a program

The access repository's `programs.json` contains registrations. Each has a unique `clientId`, a
name, description, exact redirect addresses, allowed scopes and an optional setup note. Redirects
must use HTTPS, or HTTP on `127.0.0.1`, `[::1]` or `localhost` with an explicit port. Fragments,
wildcards, user information and custom schemes are refused. Removing a program, a redirect used by
a connection, or one of its scopes ends affected connections after the change is confirmed.

## Protocol reference client

Status: not tested in server mode. The local-mode acceptance record does not establish support for
server authorization. See [the acceptance record](mcp-acceptance.md).

Example registration for a reference client configured to listen on port 8765:

```json
{
  "formatVersion": 1,
  "programs": [{
    "clientId": "reference-client",
    "name": "Protocol reference client",
    "description": "Protocol library reference client",
    "redirectUris": ["http://127.0.0.1:8765/callback"],
    "scopes": ["read", "validate", "edit", "commit"],
    "setupNote": "Configure the callback listener on port 8765."
  }]
}
```

Configure the client with this client id, the exact callback and the MCP resource
`<SW_PUBLIC_URL>/api/mcp`. Discovery begins at
`/.well-known/oauth-protected-resource/api/mcp`. Authorization requires PKCE S256 and explicit
consent in the browser. No client secret is used.

## Codex CLI

Status: not tested. Server authorization compatibility, including a fixed callback port and a
pre-registered client id, needs an acceptance record before this program can be called supported.
There is no confirmed server-mode configuration to copy. Local bridge configuration is described
in [the MCP guide](mcp.md).

## Scopes and lifetime

The default scopes are `read`, `validate`, `edit` and `commit`. `remote` and `publish` require
separate selection; `administration` is unavailable. Scopes narrow roles and cannot allow permanent
destruction. The current tool registry determines which of these operations an agent can call.
Published context and plans always use the immutable published snapshot.

A connection ends at sign-out, session expiry, deactivation, lost access, revocation or removal of
its registration or scopes. Agent traffic never extends the browser session. Access tokens last
ten minutes; rotating refresh tokens last only as long as the session. Reusing a spent code or a
retired refresh token ends the connection. Reconnect through the browser after it ends.

A person may have ten live connections. Authorization codes last sixty seconds; pending consent
and single-use setup credentials last ten minutes. Ended connection records remain for seven days.
Setup credentials must never appear in a URL, a log or a tool argument.
