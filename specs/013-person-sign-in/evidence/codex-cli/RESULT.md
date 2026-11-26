# Codex CLI OAuth acceptance

Status: STOPPED at interactive authorization/callback entry. No browser was opened,
no person signed in, and no authorization code or token was obtained.
Version: `codex-cli 0.169.1`.

## Compatibility answers

| Question | Observed answer |
| --- | --- |
| Callback port; can it be fixed? | Yes. Global `-c mcp_oauth_callback_port=5453` produces `redirect_uri=http://127.0.0.1:5453/callback` in both authorization URLs. Neither help page exposes a callback flag. The binary contains `mcp_oauth_callback_port` and `mcp_oauth_callback_url`. Add prints/stores a portless callback URL, but the emitted redirect uses the configured port. |
| Pre-registered client id? | Yes at authorization request construction. `mcp add --oauth-client-id codex-cli` persists that id; both URLs send `client_id=codex-cli`. No dynamic registration request appears. Token exchange remains unverified. |
| Resource indicator? | Yes, both URLs include `resource=http://127.0.0.1:5452/api/mcp` twice. No authorization request was submitted, so server acceptance of the duplicate parameter is unverified. |
| Discovery path? | `GET /.well-known/oauth-protected-resource/api/mcp` and `GET /.well-known/oauth-authorization-server`, both 200. An initial `GET /api/mcp` receives 405; discovery nevertheless proceeds. |

## Test server

Command: `SW_PORT=5452 bun /home/rodrigo/scratch/sw-docs/p3/oauth-server.ts`.
The helper imports `openConnectionServer` from `tests/helpers/connection-server.ts`,
the same fixture used by `scripts/connections-acceptance.ts`.
It uses `oidcTransport('keycloak')`, an in-process repository test transport;
there is no real Keycloak instance, external identity provider or owner sign-in.

`DATA_DIR=/home/rodrigo/scratch/sw-docs/p3/server-data` is supplied; the fixture independently
creates its actual disposable workspace beneath `TMPDIR=/home/rodrigo/scratch/sw-docs/p3/tmp`.
Its temporary access repository registers this programs.json payload:

```json
{"formatVersion":1,"programs":[{"clientId":"codex-cli","name":"Codex CLI","description":"Local acceptance","redirectUris":["http://127.0.0.1:5453/callback"],"scopes":["read","validate"],"setupNote":""}]}
```

Only this fixture registration writes Git history in its temporary access repository.
The fixture is disposed at shutdown. The server logs method, pathname and response status,
without request authorization headers or query values.

## Client commands and output

Help inspected: `codex mcp add --help` and `codex mcp login --help`.
Add exposes `--oauth-client-id`, `--oauth-client-secret`, `--oauth-client-registration`
and `--oauth-resource`. Login exposes `--scopes`, `--no-browser` and
`--oauth-client-registration`; no client-id or callback flag appears on login.

Both commands run with initially empty `CODEX_HOME=/home/rodrigo/scratch/sw-docs/p3/oauth-home`,
`TMPDIR=/home/rodrigo/scratch/sw-docs/p3/tmp`, scratch caches, `BROWSER=/bin/false`,
and closed stdin. Neither command modifies the owner's Codex configuration.

```sh
timeout 60 codex -c mcp_oauth_callback_port=5453 mcp add sw_oauth --url http://127.0.0.1:5452/api/mcp --oauth-client-id codex-cli --oauth-resource http://127.0.0.1:5452/api/mcp
```

Output (state and PKCE challenge values removed):

```text
Added global MCP server 'sw_oauth'.
OAuth callback URL: http://127.0.0.1/callback
Detected OAuth support. Starting OAuth flow…
Authorize `sw_oauth` by opening this URL in your browser:
http://127.0.0.1:5452/oauth/authorize?response_type=code&client_id=codex-cli&state=%5BREDACTED%5D&code_challenge=%5BREDACTED%5D&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A5453%2Fcallback&scope=read+validate+edit+commit+remote+publish&resource=http%3A%2F%2F127.0.0.1%3A5452%2Fapi%2Fmcp&resource=http%3A%2F%2F127.0.0.1%3A5452%2Fapi%2Fmcp
```

Exit 124: the 60-second timeout ended the pending browser flow. No browser launched.
The add flow asks for every advertised scope: `read validate edit commit remote publish`,
which exceeds the registered program ceiling.

```sh
timeout 60 codex -c mcp_oauth_callback_port=5453 mcp login sw_oauth --no-browser --scopes read,validate
```

Output (state and PKCE challenge values removed):

```text
Authorize the MCP server by opening this URL in your browser:
http://127.0.0.1:5452/oauth/authorize?response_type=code&client_id=codex-cli&state=%5BREDACTED%5D&code_challenge=%5BREDACTED%5D&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A5453%2Fcallback&scope=read+validate&resource=http%3A%2F%2F127.0.0.1%3A5452%2Fapi%2Fmcp&resource=http%3A%2F%2F127.0.0.1%3A5452%2Fapi%2Fmcp

After signing in, copy the full URL from your browser's address bar.
If the callback page cannot load, paste that URL here anyway.
Callback URL (input hidden): Error: No OAuth callback URL received before input closed
```

Exit 1: callback input closed. Explicit login requests exactly `read validate`.
This is the final command and stop point. No callback was supplied and no consent was attempted.

The duplicate resource parameter is retained above because it is part of the actual client output.
`response_type=code` names the OAuth response type; no issued code appears in these records.
No end-to-end OAuth support is claimed.

Raw logs: `/home/rodrigo/scratch/sw-docs/p3/oauth-server.log`, `oauth-client-0.log`,
`oauth-client-1.log`, `oauth-commands.json`, and `run.log`.
Server PID 174 received SIGTERM and exited 0. Timeout wrapper PID 449 exited 124;
its client was terminated by timeout. Login wrapper PID 493 exited 1 with its client.
These PIDs belong to the command sandbox namespace.
