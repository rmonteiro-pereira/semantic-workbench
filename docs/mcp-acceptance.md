# Agent endpoint acceptance record

This page records what the scripted acceptance run (`bun run test:mcp`) proved and the exact client versions used. Update it when the run is repeated.

## Scripted run

`bun run test:mcp` starts an isolated local server on a spare port with a temporary data root, loads the Mapped commerce example and drives it with the protocol reference client (`@modelcontextprotocol/client` 2.4.0, protocol library `@modelcontextprotocol/server` 2.4.0). It checks ten steps: discovery and 21 sorted tools with hints; listing and reading by byte range; validation without writing; a patch save; a second save; one commit of both files; a retry that returns the same commit and a changed message that is refused; delete and restore; published context and plans with the snapshot id; and the refused cases (no capability, wrong capability, a browser origin, `Origin: null`, a rebinding Host, a form post, `GET`, a stale version, a moved head and a stale cursor).

Result on the release candidate: all ten steps pass.

## Server-mode reference transport

Command: `bun run test:mcp -- --server-mode`. On 2026-11-18, the reference client
`@modelcontextprotocol/client` 2.4.0 with server library 2.4.0 passed discovery of the 21 tools the endpoint had on that date,
an authenticated project read and a 401 challenge after connection revocation over a real
loopback HTTP listener. The fixture uses an isolated identity provider and sends consent
requests directly; it does not establish browser authorization compatibility.

Acceptance of specific external programs is tracked separately from the Workbench browser
consent flow and the stdio bridge exchange and refresh checks.

## Codex CLI

Local stdio bridge: passes. On 2026-11-26, `codex-cli 0.169.1` drove a local-mode workbench through `bun scripts/mcp-stdio.ts` with a temporary data folder. It listed the 23 tools, listed the files of Mapped commerce, read one, validated and saved a one-line edit, committed it with `git_commit` and read the published catalog. The configuration, passed as overrides so no Codex configuration file changed:

```text
mcp_servers.<name>.command = "bun"
mcp_servers.<name>.args    = ["scripts/mcp-stdio.ts"]
mcp_servers.<name>.env     = { DATA_DIR = "<data folder>", SW_PORT = "<workbench port>" }
mcp_servers.<name>.default_tools_approval_mode = "approve"   # only for a non-interactive codex exec
```

Codex asks before calling a tool that is not read-only. In a non-interactive `codex exec` it cannot ask, so it refuses `save_file` and the other writes unless the server's tools are approved in its configuration as above; an interactive session asks instead. The record is `specs/006-mcp-server/evidence/codex-cli/RESULT.md`.

Server sign-in: not established. Against a server-mode test instance with its test identity provider, the same version found the endpoint through `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server`, used a pre-registered client id, a fixed loopback callback and the resource indicator, and stopped where a person must sign in in the browser. The token exchange and calls after it were not run. The record, with the exact settings, is `specs/013-person-sign-in/evidence/codex-cli/RESULT.md`.
