# Contract: tools of the first MCP release

There are 21 tools. `tools/list` returns them sorted by name. A test compares the registry, this
file and the documentation, so a change to one is a change to all three. Inputs are plain JSON
Schema with `additionalProperties: false`. Every `project` is a project slug and every `path` is
relative to the project; the same path rules as the browser apply (no escape from the project, case
variants and symlinks refused).

## Result shape

A tool answers with `structuredContent` and the same object as JSON text in `content`:

```text
success: { "ok": true, "data": { ... } }
failure: { "ok": false, "error": { "code": "<code>", "message": "<plain sentence>", "details": { ... } } }
```

A failure sets the protocol's `isError`. Protocol-level problems (malformed request, unknown tool,
unsupported version) are JSON-RPC errors, not tool results. Error codes are a closed set:

| Code | Meaning |
|------|---------|
| `invalid_input` | the arguments do not match the schema or a rule; `details.field` names the field |
| `not_found` | the target does not exist or the caller may not know it exists (hidden equals missing) |
| `refused` | the caller may see the target but the action is refused; `message` carries the boundary's reason |
| `conflict` | the version the edit started from is not the current version; carries `details.currentVersion` and `details.unchanged` |
| `guard_refused` | a content guard forbids the change; carries the guard's message |
| `precondition_failed` | for a commit, the branch, head or a listed file version differs; carries what changed |
| `key_reused` | an idempotency key was reused with different normalized arguments |
| `uncertain` | the outcome of a retried receipt-backed call cannot be established; `message` says what to check |
| `not_published` | no published snapshot answers this request; `details.reason` names why |
| `not_ready` | the workspace index is rebuilding |
| `unavailable` | Git is absent or the repository is unreadable |
| `version_changed` | a byte range was requested against a version that is no longer current |
| `cursor_expired` | the cursor belongs to another query, generation or caller, or is too old |
| `limit_exceeded` | the request or its result is over a limit; `details.limit` and how to narrow it |
| `rate_limited` | too many calls or concurrent calls; `details.retryAfterSeconds` |
| `internal` | an unexpected failure; the text is generic and carries no paths or file text |

`conflict` and `guard_refused` map to the audit outcome `refused`, `internal` to `failed`, the rest
of the failures to `refused` or `failed` as the table in [mcp-audit.md](./mcp-audit.md) states.

## Paging and ranges

A list tool takes `limit` (default 50, at most 200) and `cursor`, and answers
`{ items, nextCursor? }`. A cursor is opaque and bound to the query, the ordering, the index
generation, an expiry and the caller; every page is authorized again.

`read_file` takes `offset` (bytes, default 0), `length` (bytes, default and maximum the result cap)
and optional `expectedVersion`. It answers the text of the range, `version`, `size`, `offset`,
`nextOffset` (absent at the end) and `findingCount`. A range ends on a character boundary, so
`nextOffset` can be a few bytes before `offset + length`. Concatenating the ranges of one version
reproduces the file.

## Hints, effect and retry class

The four hints are set independently. `destructive` is stated even though the protocol only reads it
when the tool is not read-only. The server never relies on a hint.

| Tool | Twin route | Action | readOnly | destructive | idempotent | openWorld | Retry class |
|------|------------|--------|----------|-------------|------------|-----------|-------------|
| `explain_metric` | `GET .../files/*/explain/:metric` | read | true | false | true | false | repeatable |
| `get_findings` | `GET .../files/*` | read | true | false | true | false | repeatable |
| `get_mapping_catalog` | `GET /api/agent/catalog` | read | true | false | true | false | repeatable |
| `get_mapping_context` | `GET /api/agent/context` | read | true | false | true | false | repeatable |
| `git_branches` | `GET .../git/branches` | history | true | false | true | false | repeatable |
| `git_diff` | `GET .../git/diff` | history | true | false | true | false | repeatable |
| `git_file_versions` | `GET .../git/versions` | history | true | false | true | false | repeatable |
| `git_log` | `GET .../git/log` | history | true | false | true | false | repeatable |
| `git_show` | `GET .../git/show` | history | true | false | true | false | repeatable |
| `git_status` | `GET .../git/status` | history | true | false | true | false | repeatable |
| `list_files` | `GET /api/documents` | read | true | false | true | false | repeatable |
| `list_projects` | `GET /api/projects` | read | true | false | true | false | repeatable |
| `list_trash` | `GET /api/trash` | read | true | false | true | false | repeatable |
| `plan_query` | `POST /api/agent/plan` | read | true | false | true | false | repeatable |
| `read_file` | `GET .../files/*` | read | true | false | true | false | repeatable |
| `validate_text` | `POST .../files/*/validate` (new) | edit | true | false | true | false | repeatable |
| `create_file` | `PUT .../files/*` with null base | edit | false | false | true | false | precondition-protected |
| `save_file` | `PUT .../files/*` | edit | false | true | true | false | precondition-protected |
| `delete_file` | `DELETE .../files/*` | delete | false | false | true | false | receipt-backed |
| `restore_file` | `POST /api/trash/:entry/restore` | restoreOwn | false | false | true | false | receipt-backed |
| `git_commit` | `POST .../git/commit` | commit | false | false | true | false | receipt-backed |

Why the write values are what they are. `save_file` replaces existing bytes that may not be in Git
yet, so it is destructive; `delete_file` moves to the trash and is recoverable, so it is not.
Idempotent is true for every write because a repeat with the same arguments has no further effect:
a conflict for the precondition-protected tools, the original result for the receipt-backed ones.
Open-world is false everywhere because nothing reaches outside the workbench.

The four published-only tools (`get_mapping_catalog`, `get_mapping_context`, `plan_query`,
`explain_metric`) are registered only when feature 008's snapshot reader is present.

## Descriptions

Tool and argument descriptions are written by the server and never contain file text. Each says in
one sentence what the tool does and, for results that carry file text, that the text is data from
the project. No description claims that text is marked untrusted, because the protocol has no such
marker.

## Tools

### Reading

- **`list_projects`**: `{ limit?, cursor? }` gives `{ items: [{ project, name, domain? }] }`.
- **`list_files`**: `{ project, limit?, cursor? }` gives `{ items: [{ path, kind, version, size }] }`
  for the files the caller may read, in path order.
- **`read_file`**: `{ project, path, offset?, length?, expectedVersion? }`, answers as above.
- **`get_findings`**: `{ project, path, limit?, cursor? }` gives `{ version, items: [{ pointer, line?,
  column?, severity, message }] }`, the same located findings the editor shows. Findings without a
  reliable location stay document-level.
- **`list_trash`**: `{ limit?, cursor? }` gives `{ items: [{ entry, project, path, deletedAt }] }`.
- **`validate_text`**: `{ project, path, source }` or `{ project, path, patches, baseVersion }` gives
  `{ valid, findings (paged by the caps), guard: { outcome, message?, storedSource? } }` and writes
  nothing. `source` is limited to the document size limit.
- **`git_status`**: `{ project }`. **`git_diff`**: `{ project, path, from?, to?, cursor? }`, the diff
  text paged by bytes. **`git_log`**: `{ project, path?, limit? }`, at most 200 entries.
  **`git_branches`**: `{ project }`. **`git_file_versions`**: `{ project, path, limit? }`.
  **`git_show`**: `{ project, commit, path, offset?, length? }`, ranged like `read_file`.
- **`get_mapping_catalog`**: `{ project, limit?, cursor? }`. **`get_mapping_context`**:
  `{ project, mappingId, concept?: string[] }`. **`plan_query`**: `{ project, mappingId, concepts?,
  metrics?, dimensions? }` with the existing limits (at most 100 ids, no expression or metric
  override). **`explain_metric`**: `{ project, path, metric }`. All four answer from the published
  snapshot, include `snapshot: { id }`, and answer `not_published` when none exists.

### Changing

- **`save_file`**: `{ project, path, baseVersion, patches }` or `{ project, path, baseVersion,
  source }`, exactly one of `patches` and `source`. Patches are the existing patch form of the save
  API. Success gives `{ version, findings, stored: { differs: boolean, source? } }`; `differs` is true
  and `source` is present when a content guard changed the submitted text.
- **`create_file`**: `{ project, path, source }`. Fails with `conflict` when the path exists; the
  conflict says whether the existing text equals `source`.
- **`delete_file`**: `{ project, path, baseVersion, idempotencyKey }` gives `{ entry }`.
- **`restore_file`**: `{ entry, idempotencyKey }` gives `{ project, path, version }` and refuses to
  overwrite a file that now exists.
- **`git_commit`**: `{ project, message, files: [{ path, version }], expectedBranch, expectedHead,
  idempotencyKey }` gives `{ commit, branch, files }`. The commit takes exactly `files`; staged work
  of any other path stays staged. There is no `push` argument and no `all`. A commit on the published
  branch answers `refused` with the instruction to publish from the browser.

An `idempotencyKey` is 16 to 128 characters of `A-Z a-z 0-9 - _`. A receipt is bound to the caller,
the tool and the key; see [data-model.md](../data-model.md).

## Limits

The numeric defaults are named and sourced in the plan (table "Defaults and where they come from").
Names used here: the global request cap, the per-tool request caps, the result cap, the page size,
the calls-per-second and concurrency limits, the call deadline, the cursor lifetime and the receipt
retention.
