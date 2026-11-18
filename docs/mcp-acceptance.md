# Agent endpoint acceptance record

This page records what the scripted acceptance run (`bun run test:mcp`) proved and the exact client versions used. Update it when the run is repeated.

## Scripted run

`bun run test:mcp` starts an isolated local server on a spare port with a temporary data root, loads the Mapped commerce example and drives it with the protocol reference client (`@modelcontextprotocol/client` 2.4.0, protocol library `@modelcontextprotocol/server` 2.4.0). It checks ten steps: discovery and 21 sorted tools with hints; listing and reading by byte range; validation without writing; a patch save; a second save; one commit of both files; a retry that returns the same commit and a changed message that is refused; delete and restore; published context and plans with the snapshot id; and the refused cases (no capability, wrong capability, a browser origin, `Origin: null`, a rebinding Host, a form post, `GET`, a stale version, a moved head and a stale cursor).

Result on the release candidate: all ten steps pass.

## Server-mode reference transport

Command: `bun run test:mcp -- --server-mode`. On 2026-11-18, the reference client
`@modelcontextprotocol/client` 2.4.0 with server library 2.4.0 passed discovery of 21 tools,
an authenticated project read and a 401 challenge after connection revocation over a real
loopback HTTP listener. The fixture uses an isolated identity provider and sends consent
requests directly; it does not establish browser authorization compatibility.

Acceptance of specific external programs is tracked separately from the Workbench browser
consent flow and the stdio bridge exchange and refresh checks.

## Codex CLI

Status: not done. Codex CLI has not been run against this endpoint, and nothing here claims it works.

The run needs a real agent session with a model and the owner's Codex configuration, which an automated change cannot start. Before release, register the bridge with Codex (for example `codex mcp add semantic-workbench --env DATA_DIR=<data folder> -- bun scripts/mcp-stdio.ts`, checked against `codex mcp add --help`), ask the agent to list the files of a project, read one, validate and save one change and commit it, and record here the output of `codex --version`, the configuration used and the result. Until that is recorded, only the reference client is verified.
