# HTTP API Contract: changes in v0.3.0

Base: [001 HTTP API](../../001-workbench-improvements/contracts/http-api.md). All rules there
still hold: loopback only, origin check on every route (403), bounded JSON bodies, `{error,
issues?}` errors, URL-encoded relative POSIX paths, per-project (now per-repository for Git)
serialization. Remote Git commands run only from the endpoints marked **remote**.

## Status and identity

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/status` | | `{gitAvailable, dataRoot, migration, recovery, repositories: [{repo, identityConfigured, projects: [slug]}]}`; `identityConfigured` (top level) kept as "every repository has an identity" for v0.2.0 clients |
| `GET /api/projects/:slug/git/identity` | | `{name: string\|null, email: string\|null, scope: 'local'\|'global'\|'none'}` (read with the repository as working directory) |
| `PUT /api/projects/:slug/git/identity` | `{name, email, allRepositories?: boolean}` | `{repositories: [repo]}`; writes `user.name`/`user.email` with `git config` (local scope) in the project's repository, or also in every repository under `data/projects/` that has no identity yet (a repository's own author is never replaced); never `--global`. Name 1–200 chars, email 3–320 chars, no control characters |
| `GET /api/git/credential-helper` | | `{helper: string\|null}`: the helper set in the user's or system Git settings (read-only `git config --get credential.helper` outside any repository; never reads credentials) |
| `DELETE /api/projects/:slug/git/remote` | `{name}` | `{removed: name}`; 400 when no remote has that name |

## Commit, revert, imports

| Method & path | Request | Response |
| --- | --- | --- |
| `POST /api/projects/:slug/git/commit` | `{message, paths?: [path], repoPaths?: [path], push?: boolean}` | `repoPaths` names files from the repository root (shared repositories), `paths` from the project folder; either given: commits exactly those project paths with `git add -- <untracked>` + `git commit --only -F - -- <paths>`; absent: v0.2.0 behaviour (commit the index). `push: true` then runs push (**remote**). → `{commit, altered, pushed?: {ok, message}}`; 409 during a merge unless `paths` is absent; 400 empty message |
| `GET /api/projects/:slug/git/status`, `POST …/git/stage`, `POST …/git/unstage`, `GET …/git/diff` | stage and unstage accept `{repoPaths}` instead of `{paths}`; diff accepts `repoPath` instead of `path` | `repoPaths`/`repoPath` work for every project; the browser uses them for every Source Control action, and `paths`/`path` stay for v0.2.0 clients. Status shows the whole repository; each change adds `repoPath` (from the repository root), `project` and `projectPath` (the project that holds the file and the path inside it; absent for a file of no project) and `outside` when the file is not in the viewed project |
| `GET /api/projects` | unchanged | each project adds `repo` (its repository folder) and `folder` (its folder inside the repository, `''` for the root) |
| `POST /api/projects/:slug/git/revert` | `{path, baseHash}` | one journaled operation: base hash checked, `HEAD` bytes staged, current file moved into a new trash file entry and the staged bytes moved into place → `{hash, trashEntry}`; 409 stale base |
| `POST /api/import`, `POST /api/projects/:slug/import`, `POST /api/examples/:id` | unchanged | response adds `commit: {committed: true, commit, message} \| {committed: false, reason: 'no-git'\|'no-identity'\|'merging'}`; the commit contains only the written paths |

## Clone and repositories

| Method & path | Request | Response |
| --- | --- | --- |
| `POST /api/clone` (**remote**) | `{url, name?}` | `{op, name, slug}` immediately (a taken name, including one a running clone uses, gets a free one); progress and result through SSE `clone` events `{op, phase: 'cloning'\|'scanning'\|'done'\|'failed'\|'cancelled', name?, message?, repo?, invalid?, candidates?, manifest?, manifestError?, projects?}` (`projects`: slugs registered from the manifest); address rules as `setRemote` (no `transport::`, no leading `-`, ≤ 2000 chars, no control characters, no masked `***@` address); clone into `data/projects/.staging-clone-<op>/` then journaled move; a leftover staging folder is removed at start-up and reported as a rolled-back `clone` |
| `POST /api/clone/:op/cancel` | | `{cancelled}` |
| `GET /api/repos/:repo/project-candidates` | | `{manifest: {projects} \| null, manifestError?, manifestHash: string\|null, detected: [{path, files}], registered: [{slug, name, path}]}`; `path` is relative to the repository root, `''` for the root |
| `PUT /api/repos/:repo/projects` | `{projects: [{path, name?}], saveManifest?: boolean, manifestBaseHash?: string\|null}` | makes exactly these folders the repository's projects (a folder already registered keeps its project; a project whose folder is left out is removed from the workspace, nothing is deleted) → `{projects: [{slug, name, folder}]}`; `saveManifest` writes `.semantic-workbench.json` through a hash-checked save (409 when `manifestBaseHash` is not the file's current hash); 400 nested, missing or invalid paths |
| `PUT /api/projects/:slug/git/remote` | unchanged | applies to the project's repository |

## Delete for subfolder projects

| Method & path | Request | Response |
| --- | --- | --- |
| `DELETE /api/projects/:slug` | body `{mode: 'remove'}`, or `{mode?: 'delete', confirm: true}` | `remove` (only for a subfolder project whose repository keeps another project; 400 otherwise): registry only, nothing on disk changes → `{removed: slug}`; `delete`: repository-root project as v0.2.0; subfolder project → trash entry kind `subproject`, only its folder moves → `{entryId, undoUntil}`; the last project of a repository → kind `repository`, the whole repository moves. The browser offers Remove first for a subfolder project. `POST /api/clear` moves a repository holding subprojects as one trash entry, kind `repository` |
| `GET /api/projects/:slug/delete-impact` | unchanged | adds `subproject: boolean, repo, sharedWith: [slug]` |

## Metrics (terminology)

| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/projects/:slug/metrics` | | every metric of the project's semantic models; each item adds `governed: boolean`; non-governed items have only `{file, modelPath, model, layout, name, label, description, expression, governed: false}` |
| `POST /api/projects/:slug/metrics` | body of v0.2.0 `…/kpis` | same response; `…/kpis` is a deprecated alias |
| `POST /api/projects/:slug/metrics/preview` | as `…/kpis/preview` | same; `…/kpis/preview` is a deprecated alias |

## Agent context (additive)

| Method & path | Change |
| --- | --- |
| `GET /api/agent/context` | `bindings[].kind`: `'object'\|'referent'\|'link'`; new `metricBindings: [{metric, measures, of?, evidence, findings}]` from the mapping root `SEMANTIC_WORKBENCH` extension. Existing fields unchanged; `/api/agent/plan` unchanged |

## Validation findings

`findings` in file responses, imports and saves may now include `{severity: 'warning', code:
'sql-syntax', path, line, column, message}` from the shared SQL lint (never blocks a save).
