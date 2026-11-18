# Agent endpoint (MCP)

Semantic Workbench does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.

The local workbench offers one endpoint, `POST /api/mcp`, that speaks the Model Context Protocol (revision 2026-07-28, with earlier clients served request and response). A connected agent can read definitions, findings and history, check proposed text, change files, and commit exactly the files it names. The workbench only answers requests. It never runs a query plan, contacts a warehouse or calls a model, and it makes no outbound network call for this feature.

Server mode does not mount the endpoint. Person sign-in, application grants, the remaining workspace and remote operations, resources and prompts, and administration are later increments (see the end of this page).

## Connect an agent

The endpoint is mounted when the workbench starts in local mode (`bun run dev`). On first start it creates a secret, the local capability, in `data/state/mcp-capability`: one line of 43 characters in a file only your operating-system user can read. Every request must present it.

Through the bridge, for clients that start a program and speak over standard input and output:

```text
command: bun
args:    scripts/mcp-stdio.ts
env:     DATA_DIR=<your data folder>, SW_PORT=<the workbench port, default 4310>
```

The bridge reads the capability file for every message, so `bun run mcp:rotate` needs no reconfiguration. It starts no server, opens no port and never prints the capability. When the workbench is not running it answers each request with an error that says to start it in local mode, and when the server runs in server mode it says MCP is not available there yet.

Directly over HTTP, for clients that take a URL and a header: URL `http://127.0.0.1:4310/api/mcp` and the header `Authorization: Bearer <contents of data/state/mcp-capability>`. Browser-based clients cannot connect, by design.

Codex CLI has not been tried with this endpoint yet; `docs/mcp-acceptance.md` records what is verified and what is not. Only the reference client of the protocol library has been run against it. The registration command differs by client, so follow that client's own documentation and point it at `bun scripts/mcp-stdio.ts` with `DATA_DIR` set to your data folder.

Rotate the secret with `bun run mcp:rotate` (`scripts/mcp-rotate.ts`). The bridge gives up on a call that gets no answer after 35 seconds, a little after the server's own 30-second deadline. The old value stops working on the next request.

## What the tools do

There are 21 tools. `tools/list` returns them sorted by name, and only the tools your caller may use. Reading tools are read-only; the others change files or Git history.

| Tool | What it does | Effect |
|------|--------------|--------|
| `create_file` | Create a file; an existing path answers conflict | change |
| `delete_file` | Move a file to the trash, from the version you read; needs an idempotency key | change |
| `explain_metric` | Explain how a metric is computed in the published snapshot | read |
| `get_findings` | List the validation findings of a file | read |
| `get_mapping_catalog` | List the mappings of the published snapshot | read |
| `get_mapping_context` | Read the semantic context of one published mapping | read |
| `git_branches` | List branches and the current one | read |
| `git_commit` | Commit exactly the listed files at the listed versions; needs an idempotency key | change |
| `git_diff` | Show a file at two revisions, paged by bytes | read |
| `git_file_versions` | List the committed versions of one file | read |
| `git_log` | List recent commits, at most 200 | read |
| `git_show` | Read a file as it was in one commit, by byte range | read |
| `git_status` | Show the branch, the published state and the changed files | read |
| `list_files` | List the files of a project, in path order | read |
| `list_projects` | List the projects you may read | read |
| `list_trash` | List trashed files you may restore | read |
| `plan_query` | Plan a query from named concepts and metrics over the published snapshot | read |
| `read_file` | Read a file by byte range, with its version | read |
| `restore_file` | Restore a trashed file without overwriting; needs an idempotency key | change |
| `save_file` | Replace a file by patches or full text, from the version you read | change |
| `validate_text` | Check proposed text exactly as saving would, writing nothing | read |

Each tool is the twin of an existing route and runs through the same operation boundary, so its authorization, content guards, version checks and audit record are the browser's own. `docs/operations.md` lists the routes.

The four published-only tools (`get_mapping_catalog`, `get_mapping_context`, `plan_query`, `explain_metric`) answer from the immutable published snapshot, include its id and answer `not_published` until the project has been published from the browser. An unpublished edit never appears in them.

Results are `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "details" } }`, with
the protocol error flag set on failure. The codes are `invalid_input`, `not_found` (a hidden file answers like a
missing one), `refused`, `conflict`, `guard_refused`, `precondition_failed`, `key_reused`, `uncertain`,
`not_published`, `unavailable`, `version_changed`, `cursor_expired`, `limit_exceeded`, `rate_limited` and
`internal`. The audit record of a tool request carries the same code in `result`. When a tool decides a failure
itself after its route answered, such as `version_changed` or `cursor_expired`, the call also gets a second
record with that result, so the log shows what the caller was told. Failures that routes report come from one
classifier of the operation, the HTTP status and the `X-Workbench-Failure` header of the route's answer
(`not-found`, `git-unavailable` or `git-refused`), never from its sentence. The header leaves the status and
body of the older routes as they were.

Changing files:

- A save names the version it started from. A changed file answers `conflict` with the current version and says whether it already holds the proposed text. Invalid text is never saved. Patches change only the patched ranges and keep line endings. A rewrite by a content guard is reported in `stored`.
- `delete_file`, `restore_file` and `git_commit` need an `idempotencyKey` of 16 to 128 characters (letters, digits, dash, underscore). A retry with the same key and arguments returns the original result. The same key with other arguments answers `key_reused`. After a crash that cannot be settled the answer is `uncertain`, which means: read the trash or the Git log before trying again. Receipts live under `data/state/mcp-receipts/` for seven days: an expired receipt is ignored at once, and expired ones are removed when the endpoint starts. A second call with a key whose first call is still running is answered `rate_limited` before anything is read. If a receipt file cannot be parsed, it is moved aside as `*.json.corrupt-<time>` (a warning is logged as `mcp.receipts-corrupt`), and until that file is older than the retention period every key that is not found is answered `uncertain`, because the lost file may have held it. To lift that sooner, check the trash and the Git log for anything a lost receipt may have covered, then delete the `*.json.corrupt-<time>` file from `data/state/mcp-receipts/`.
- `git_commit` takes `files` (path and version), `expectedBranch` and `expectedHead`. Exactly those files are committed, in the same step of the repository's queue that checks them, and other staged work stays staged. The commit holds the write lock of every project whose files it names (taken in sorted order), so a save of those projects waits for it. A commit that names no files, which commits the whole index, locks only its own project. If a hook or filter changed a listed file during the commit, the commit still happened and the answer carries `altered`, the paths whose committed bytes differ from what you listed; a retry with the same key returns that same answer. There is no push and no commit-all argument. A commit made while the default branch is checked out lands on the authoring branch (`work/local`) and the answer carries `movedFrom`; what agents and people read changes only when you publish from the browser. The commit carries the configured Git identity and no agent marker.
- No tool pushes or syncs. The push and sync routes refuse every `work/` or `proposal/` branch for any caller, and `git_commit` takes no `push` option, so an agent's commits stay in the workbench until a person publishes them.
- Tessera ontologies (marker `tessera: 1`, notes in `tessera_notes`) are validated, saved and patched exactly as
  in the browser. A finding carries its `code`, such as `tessera-kind`, when the validator gave one. The local
  MCP release supports authorized reads, edits and commits. Authoring reads through `read_file` and `git_show`
  return stored bytes, including unpublished work and Tessera markers and notes. A patch or save changes only
  the bytes it names. Semantic agent context, plans and explanations use the published projection, which strips
  the Tessera marker and notes. No tool compiles a Tessera project; that is the `tessera` command.
- An agent's save never discards a person's unsaved draft of the same file, and open browsers refresh through the live events.

The tools, their twin routes and their hints are listed in [mcp-contract.md](mcp-contract.md), which tests compare with the registry and the route table.

## Limits

| Limit | Value |
|-------|-------|
| Request body | 12,004,096 bytes for `save_file`, `create_file` and `validate_text`; 64,000 bytes otherwise |
| Text in one result | 32,768 bytes; follow `nextOffset` or `nextCursor` for more |
| Page size | 50, at most 200 |
| Calls | 20 per second with a burst of 40, 4 at once, 30 seconds each |
| Cursor lifetime | 10 minutes, bound to the query, the list's state and the caller |
| Document size | 2,000,000 bytes, as in the browser |

## Threat model

The capability protects against another page in your browser, a web page using DNS rebinding, another operating-system user without read access to the data folder, and a container that shares the network but not the files. Any `Origin` header is refused, `Host` must be exactly a loopback name with the server's port, and the checks run in this order, stopping at the first failure: method, `Origin`, `Host`, the capability (compared in constant time), then the content type.

It does not protect against a process running as your own operating-system user, which can read the file. It is not a sandbox, and the other local routes keep their existing boundary.

Residual risk: file text is data from the project, but an agent reads it with its model, and a hostile definition can contain text that tries to steer the agent. The protocol has no marker for untrusted content, so none is applied, and tool descriptions say only that text is data. Review what an agent changes in the browser before you publish.

## Later increments

Not available yet, each a separate feature: person sign-in on a team server (MCP in server mode), application grants, the remaining workspace and source-control operations (metrics, move, import, stage, branch switching, fetch, pull, push, publish, clone and remote settings), search and lineage, resources and prompts with change notices, administration, and the agent panel. A client of the earlier protocol era gets request and response only, with no change notices or sessions.
