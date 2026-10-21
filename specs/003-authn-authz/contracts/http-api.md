# HTTP API Contract: changes in v0.4.0

Base: [002 HTTP API](../../002-lineage-and-ux/contracts/http-api.md) and
[001 HTTP API](../../001-workbench-improvements/contracts/http-api.md). Local mode keeps every
rule there. Server mode adds the rules below.

## Common rules (server mode)

- Authentication: session cookie `__Host-sw-session` on every route except `/auth/*`,
  `/healthz`, `/readyz` and static assets of the sign-in page. `/api/agent/*` also accepts
  `Authorization: Bearer <jwt>`; a bearer header anywhere else → 401.
- No principal → `401 {error: 'sign-in required'}` for `/api/*`; `302 /auth/login?returnTo=` for
  pages. Deactivated or role-less → 403 page / `403 {error: 'no access'}`.
- Non-GET requests require `Origin` = `SW_PUBLIC_URL` origin and `X-SW-Request: 1`, else 403.
- Unreadable target → `404` with the body of a missing resource. Readable target, action denied →
  `403 {error, required: {role?, guard?}, rule}`.
- Guarded change refused → `403 {error, guarded: [{file, pointer, kind}]}` (readable files only).
- Every decision on these routes is audited per [audit-log.md](./audit-log.md).

## New routes

| Method & path | Who | Request | Response |
| --- | --- | --- | --- |
| `GET /auth/login` | anyone | `?returnTo=/path` | 302 to provider; sets `__Host-sw-auth` (state, nonce, PKCE verifier) |
| `GET /auth/callback` | anyone | provider redirect | validates, creates session, sets `__Host-sw-session`, 302 to `returnTo` |
| `POST /auth/logout` | signed in | | ends session, `{redirect: <provider end-session URL or />}` |
| `GET /auth/github/start` | signed in | `?returnTo=` | 302 to GitHub authorize with `state` bound to the session |
| `GET /auth/github/callback` | signed in | | stores token in session, 302 to `returnTo` |
| `GET /healthz` | anyone | | `200 {ok: true}` (liveness; no workspace data) |
| `GET /readyz` | anyone | | `200 {ready: true}` after recovery, lock and first scan; else 503 |
| `GET /api/me` | signed in | | `{mode, id, name, email, kind, roles: {global?, domains, projects}, roleSources, groupsResolved, connected: {azureDevOps, github}, can: {admin, audit}}`; local mode returns the implicit Admin |
| `POST /api/projects/:slug/git/publish` | Steward(d)/Admin | `{branch?: default}` | fast-forwards the branch to the copy's `HEAD` → `{published, commit}`; `409 {notFastForward: true}` |
| `POST /api/projects/:slug/git/pull-default` | Editor(d)+ | | merges the default branch into the copy's branch → as `git/pull` |
| `GET /api/admin/users` | Admin | `?q=` | principals with role sources, groups, last sign-in, deactivated |
| `POST /api/admin/users/:id/deactivate` / `reactivate` | Admin | `{reason}` | version commit; sessions ended |
| `GET/PUT /api/admin/roles` | Admin | `roles.json` + `baseVersion` | `{version}`; last-Admin guard |
| `GET/PUT /api/admin/assignments` | Admin | `assignments.json` + `baseVersion` | `{version}` |
| `GET/PUT /api/admin/projects` | Admin | `projects.json` + `baseVersion` | `{version}` |
| `GET/PUT /api/admin/agents` | Admin | `agents.json` + `baseVersion` | `{version}` |
| `GET/PUT /api/admin/settings` | Admin | `settings.json` + `baseVersion` | `{version}`; secrets never returned |
| `GET /api/admin/policies` | Admin | | `{baseline: [{id, text, description}], rules: [{id, text, enabled, template?, description}], schema}` |
| `POST /api/admin/policies/validate` | Admin | `{rules}` | `{ok, errors: [{id, line, column, message}]}` |
| `POST /api/admin/policies/dry-run` | Admin | `{rules}` (or any area's proposed file) | `{changed: [{case, before, after, rules}], matrixCases, auditCases}` |
| `PUT /api/admin/policies` | Admin | `{rules, baseVersion, dryRunId}` | `{version}`; refused unless valid and dry-run id matches the same proposal |
| `GET /api/admin/versions` | Admin | `?area=` | `[{version, author, at, message, files}]` |
| `GET /api/admin/versions/:v/diff` | Admin | `?against=` | per-file text diff |
| `POST /api/admin/versions/:v/rollback` | Admin | `{baseVersion}` | `{version}` (new commit); dry run and last-Admin guard apply |
| `POST /api/admin/check` | Admin | `{principal: id \| {groups, roles}, action, resource: {type, project?, path?, branch?, metric?}}` | `{decision, rules: [id], attributes}` |
| `GET /api/admin/who-can` | Admin | `?project=&path=` | `[{principal \| group \| client, actions: [action]}]` |
| `GET /api/admin/sessions` / `DELETE /api/admin/sessions/:principal` | Admin | | list / end all sessions of a principal |
| `GET /api/audit` | Steward(d), Admin | `?principal=&action=&project=&decision=&from=&to=&cursor=` | `{entries, next}`; Stewards get only their domains' projects |
| `GET /api/audit/export` | Steward(d), Admin | same filters + `format=jsonl\|csv` | file download of the filtered entries |
| `GET /api/admin/provider` | Admin | | `{issuer, clientId, discovery: 'ok'\|error, groupClaimMode, overage: 'directory'\|'off', jwksRefreshedAt}` |

## Changed routes (server mode)

| Route | Change |
| --- | --- |
| `GET /api/projects` | only readable projects; each adds `hiddenFiles: n`, `role`, `copy: {branch, inUseBranches} \| null`; files listed from the person's copy (Editor+) or the published state (Viewer) |
| `GET /api/status` | non-Admins get `{mode, gitAvailable, ready}` only |
| `GET /api/documents`, agent routes, metrics, `…/explain/:metric`, `…/metrics/preview`, `…/delete-impact`, `/api/suggestions` | computed over the readable set; `delete-impact` adds `hiddenReferences: n` |
| `GET/PUT/DELETE /api/drafts…`, `/api/documents/:id/grouping` | per person (owner only) |
| `GET /api/trash` | entries whose paths are readable and (own or Steward(d)/Admin) |
| `…/git/log` | readable paths only; `hiddenCommits: n` for commits touching only unreadable paths |
| `…/git/show`, `…/git/diff`, `…/git/versions` | 404 for unreadable paths |
| `…/git/commit` | author = principal; trailer `Signed-in-user`; operates on the person's copy |
| `…/git/switch` | 409 `{inUseBy: name}` when the branch is checked out in another copy |
| `…/git/fetch|pull|push|sync` | delegated credential (R8); `428 {connect: 'github'\|'azure-devops'}` when missing |
| `PUT …/git/remote`, `POST /api/clone`, `PUT /api/repos/:repo/projects` | Admin; host allow-list → 400 `{allowedHosts}` |
| `GET/PUT …/git/identity`, `GET /api/git/credential-helper` | local mode only; 404 in server mode |
| `POST /api/clear`, `DELETE /api/projects/:slug` | Admin; delete lists `unpublished: [{name, changes}]` in the impact response |

## Route → action table (authorization test matrix input)

Every route of 001/002 and above maps to one action of [policy-model.md](./policy-model.md):
`read` (projects, files, documents, metrics, explain, preview, status-basic, suggestions list,
events), `history` (git status/diff/branches/log/versions/show), `viewOwnState` (drafts,
grouping), `edit` (files PUT, save-batch, documents POST, metrics/kpis POST, gitignore,
suggestions reject), `import`, `move` (move, suggestion accept), `delete` (file delete),
`revert`, `restoreOwn`/`restoreOthers` (undo, restore), `purge` (trash delete, empty), `clear`,
`createProject` (projects POST, import new, examples), `renameProject`, `deleteProject`,
`stage`, `commit`, `branch` (switch), `fetch`, `pull` (pull, sync, pull-default), `push`, `publish`,
`cancelOwn`, `setRemote`, `clone`, `registerProjects`, `setIdentity`, `readStatus`, `readAudit`,
`admin` (every `/api/admin/*`), `agentRead` (agent routes with bearer). The matrix test fails if
a route exists in `server/routes/**` or `server/handler.ts` without a row in
`tests/auth/route-actions.ts`.
