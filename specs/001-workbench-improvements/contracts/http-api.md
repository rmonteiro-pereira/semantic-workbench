# HTTP API Contract (loopback `127.0.0.1:4310`, proxied at `/api`)

All endpoints: loopback only; requests with an `Origin` header outside the local frontend/API are
rejected with 403; JSON bodies are size-bounded; errors are `{error, issues?}` with 4xx/5xx.
Paths in URLs are URL-encoded relative POSIX paths; `..`, absolute paths and `.git/` are rejected
(400). Mutations on one project are serialized.

## Projects

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/projects` | | `[{slug, name, origin, branch, ahead, behind, changes, files: [{path, docType, layout, valid, visible, gitState, hash}]}]` |
| `POST /api/projects` | `{name}` | `{slug, name}` (folder, `git init -b main`, initial empty commit) |
| `PATCH /api/projects/:slug` | `{name}` | `{slug, name}` |
| `POST /api/projects/:slug/import` | `{files: [{path, source}], onConflict?: 'replace'\|'keep-both'}` | `{written: [{path, hash}], findings}`; 409 `{conflicts: [path]}` when names exist and `onConflict` is absent |
| `POST /api/import` | `{name?, files: [...]}` | creates one project per batch (FR-018) → `{slug, written}` |
| `POST /api/examples/:id` | | creates or opens the example project → `{slug}` |
| `POST /api/projects/:slug/move` | `{path, toProject, toPath?}` | `{project, path}` (journaled) |

## Files

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/projects/:slug/files/*path` | | `{path, source, hash, docType, findings}` (`source` is the exact bytes as UTF-8 text) |
| `PUT /api/projects/:slug/files/*path` | `{baseHash, source}` or `{baseHash, patches: [{from, to, insert}]}` | `200 {hash, findings}`; `409 {error:'stale', currentHash, currentSource}`; `400 {error, issues}` when invalid |
| `GET /api/projects/:slug/files/*path/explain/:metric` | query `grain?`, `dimension*` | KPI explanation (data-model.md); `sqlPreview.refused` when additivity forbids the rollup. Never executes SQL |

## Drafts

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/drafts` | | `[{project, path, baseHash, updatedAt}]` |
| `PUT /api/drafts/:slug/*path` | `{baseHash, text, patches}` | `{updatedAt}` |
| `DELETE /api/drafts/:slug/*path` | | 204 |

## Delete, undo, trash, clear

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/projects/:slug/delete-impact?path=` | | `{removes: [...], unsavedDrafts: [...], brokenReferences: [{from, to, kind}]}` (feeds the confirmation dialog) |
| `DELETE /api/projects/:slug/files/*path` | `{confirm: true}` | `{entryId, undoUntil}` |
| `DELETE /api/projects/:slug` | `{confirm: true}` | `{entryId, undoUntil}` |
| `POST /api/clear` | `{confirm: true}` | `{batchId, entries: [entryId], undoUntil}` |
| `POST /api/trash/:entryId/undo` | | 200 within `undoUntil`; 410 after |
| `GET /api/trash` | | `[{entryId, kind, project, path, deletedAt, batchId}]` |
| `POST /api/trash/:entryId/restore` | `{toProject?, toPath?}` | 200; `409 {error:'occupied', suggestion}` if the original location is taken |
| `DELETE /api/trash/:entryId` / `DELETE /api/trash` | `{confirm: true}` | 204 (permanent) |

## Grouping suggestions

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/suggestions` | | `[{id, file: {project, path}, targetProject, evidence: [...]}]` |
| `POST /api/suggestions/:id/accept` | | moves the file (journaled) |
| `POST /api/suggestions/:id/reject` | | stored in `suggestions.json` |

## Source Control (per project)

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/projects/:slug/git/status` | | `{branch, upstream, ahead, behind, gitAvailable, identityConfigured, changes: [{path, index, worktree, conflicted, hidden, label?}]}` (`hidden: true` → labelled "not shown in workspace", read-only) |
| `GET /api/projects/:slug/git/diff` | `path`, `from?`, `to?` (`HEAD`, `index`, `worktree`, commit) | `{path, before, after, binary}` texts for the diff view |
| `POST /api/projects/:slug/git/stage` / `unstage` | `{paths: [...]}` or `{all: true}` | status |
| `POST /api/projects/:slug/git/commit` | `{message}` (required, non-empty) | `{commit, altered: [path]}` |
| `GET /api/projects/:slug/git/branches` | | `{current, local: [...], remote: [...]}` |
| `POST /api/projects/:slug/git/switch` | `{branch, create?: boolean}` | 200; `409 {error:'dirty'\|'drafts', paths}` |
| `PUT /api/projects/:slug/git/remote` | `{name, url}` | 200 |
| `POST /api/projects/:slug/git/fetch` / `pull` / `push` / `sync` | | `{ok, ahead, behind, conflicted: [path], altered: [path], stderr}`; pull/sync `409` with drafts or a dirty tree |
| `GET /api/projects/:slug/git/log` | `path?`, `limit?` | `[{commit, author, date, message}]` |
| `GET /api/projects/:slug/git/show` | `commit`, `path` | `{source}` |
| `POST /api/projects/:slug/gitignore` | `{pattern}` | appends via the normal hash-checked save → `{hash}` |

Remote operations run only when these endpoints are called; nothing contacts a remote in the
background.

## Events

`GET /api/events` → `text/event-stream`; see [sse-events.md](./sse-events.md).

## Legacy facade (kept during transition, research R9)

`GET /api/documents`, `POST /api/documents` (`{filename, source, id?, revision?|baseHash?}`),
`GET|PUT /api/documents/:id/grouping`, `/api/agent/catalog`, `/api/agent/context`,
`POST /api/agent/plan`: unchanged shapes; ids resolve through `legacy-ids.json` or
`<project>/<path>`. `/api/agent/plan` still returns a SQL preview only.
