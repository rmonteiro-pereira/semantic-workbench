# Quickstart: connect an agent to the local workbench

This is the script of the release acceptance run (success criterion 1) and the outline of
`docs/mcp.md`. The commands name the files this feature adds; they exist once the tasks are done.

## 1. Start local mode and find the capability

```bash
bun run dev                          # local mode, loopback only
ls -l data/state/mcp-capability      # -rw------- and one line
```

The first start creates the file. `bun run mcp:rotate` replaces it.

## 2. Add the workbench to an agent

Through the bridge (clients that run a command):

The command is `bun scripts/mcp-stdio.ts`, registered in the client's MCP server list as a standard
input and output server. The exact registration syntax of each client is written in `docs/mcp.md`
from what the acceptance run observed, not from memory.

Directly over HTTP (clients that take a URL and a header): URL `http://127.0.0.1:4310/api/mcp` and the
header `Authorization: Bearer <contents of data/state/mcp-capability>`.

The documentation prints the configuration for Codex CLI and for the reference client and says what
the tools send to the agent's model provider (the content statement).

## 3. The acceptance script

`bun run test:mcp` starts an isolated local server on a spare port and a temporary data root, loads
the Mapped commerce example, and drives a client through these steps:

1. `server/discover`, then `tools/list`: 21 tools, sorted, hints as in the contract.
2. `list_projects`, `list_files`, `read_file` in ranges: the bytes of a definition and its version.
3. `validate_text` with a broken reference: located findings, nothing written.
4. `save_file` with a patch changing a metric's description, then `get_findings`: a new version.
5. `save_file` repairing the reference.
6. `git_status`, `git_diff`, then `git_commit` with both files, their versions, the branch and head:
   one commit, authored by the configured identity, no agent marker.
7. `git_log`: the commit.
8. A retry of step 6 with the same key returns the same commit; with another message it is refused.
9. `delete_file` then `restore_file` of a third file: it returns with its bytes.
10. Publish the project from the browser path of the harness, then `get_mapping_context` and
    `plan_query`: results carry the snapshot id and equal the agent HTTP API's.

The same script runs with Codex CLI against a real session in the release acceptance, and the exact
versions are written to the acceptance record.

## 4. Refused cases the script also runs

No capability; a wrong capability; `Origin: http://127.0.0.1:5173`; `Origin: null`; a `Host` of
`localhost.evil.example`; a form post; a save against an old version; a commit with a moved head; a
commit on the published branch; a result larger than the cap; a stale cursor; server mode (404).
