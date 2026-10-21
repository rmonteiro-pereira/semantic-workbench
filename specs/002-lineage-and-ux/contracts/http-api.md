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
| `POST /api/projects/:slug/git/commit` | `{message, paths?: [path], push?: boolean}` | `paths` given: commits exactly those project paths with `git add -- <untracked>` + `git commit --only -F - -- <paths>`; absent: v0.2.0 behaviour (commit the index). `push: true` then runs push (**remote**). → `{commit, altered, pushed?: {ok, message}}`; 409 during a merge unless `paths` is absent; 400 empty message |
| `POST /api/projects/:slug/git/revert` | `{path, baseHash}` | one journaled operation: base hash checked, `HEAD` bytes staged, current file moved into a new trash file entry and the staged bytes moved into place → `{hash, trashEntry}`; 409 stale base |
| `POST /api/import`, `POST /api/projects/:slug/import`, `POST /api/examples/:id` | unchanged | response adds `commit: {committed: true, commit, message} \| {committed: false, reason: 'no-git'\|'no-identity'\|'merging'}`; the commit contains only the written paths |

## Clone and repositories

| Method & path | Request | Response |
| --- | --- | --- |
| `POST /api/clone` (**remote**) | `{url, name?}` | `{op, name, slug}` immediately (a taken name, including one a running clone uses, gets a free one); progress and result through SSE `clone` events `{op, phase: 'cloning'\|'scanning'\|'done'\|'failed'\|'cancelled', name?, message?, repo?, invalid?, candidates?, manifest?}`; address rules as `setRemote` (no `transport::`, no leading `-`, ≤ 2000 chars, no control characters, no masked `***@` address); clone into `data/projects/.staging-clone-<op>/` then journaled move; a leftover staging folder is removed at start-up and reported as a rolled-back `clone` |
| `POST /api/clone/:op/cancel` | | `{cancelled}` |
| `GET /api/repos/:repo/project-candidates` | | `{manifest: {projects} \| null, manifestError?, detected: [{path, files}], registered: [slug]}` |
| `PUT /api/repos/:repo/projects` | `{projects: [{path, name?}], saveManifest?: boolean, manifestBaseHash?: string\|null}` | registers the subfolder projects (journaled registry write) → `{projects: [{slug, name, folder}]}`; `saveManifest` writes `.semantic-workbench.json` through a hash-checked save; 400 nested or invalid paths |
| `PUT /api/projects/:slug/git/remote` | unchanged | applies to the project's repository |

## Delete for subfolder projects

| Method & path | Request | Response |
| --- | --- | --- |
| `DELETE /api/projects/:slug` | query `mode=trash` (default for repository-root projects) or `mode=remove` (default for subfolder projects), `confirm=true` | `remove`: registry only, nothing on disk changes → `{removed: slug}`; `trash`: repository-root project as v0.2.0; subfolder project → trash entry kind `subproject` → `{entryIds, undoUntil}` |
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
