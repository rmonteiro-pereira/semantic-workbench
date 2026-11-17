# Agent endpoint acceptance record

This page records what the scripted acceptance run (`bun run test:mcp`) proved and the exact client versions used. Update it when the run is repeated.

## Scripted run

`bun run test:mcp` starts an isolated local server on a spare port with a temporary data root, loads the Mapped commerce example and drives it with the protocol reference client (`@modelcontextprotocol/client` 2.4.0, protocol library `@modelcontextprotocol/server` 2.4.0). It checks ten steps: discovery and 21 sorted tools with hints; listing and reading by byte range; validation without writing; a patch save; a second save; one commit of both files; a retry that returns the same commit and a changed message that is refused; delete and restore; published context and plans with the snapshot id; and the refused cases (no capability, wrong capability, a browser origin, `Origin: null`, a rebinding Host, a form post, `GET`, a stale version, a moved head, the published branch and a stale cursor).

Result on the release candidate: all ten steps pass.

## Codex CLI

The run with Codex CLI needs a real agent session with a model and the owner's Codex configuration, which an automated change cannot start. Before release, register the bridge as in `docs/mcp.md`, ask the agent to list the files of a project, read one, validate and save one change and commit it, and record here the output of `codex --version`, the configuration used and the result. Until that is recorded, only the reference client is verified.
