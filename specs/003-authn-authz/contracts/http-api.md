# HTTP API Contract: changes in v0.4.0

Base: [002 HTTP API](../../002-lineage-and-ux/contracts/http-api.md) and
[001 HTTP API](../../001-workbench-improvements/contracts/http-api.md). Local mode keeps every
rule there. Server mode adds the rules below.

## Common rules (server mode)

- Authentication: session cookie `__Host-sw-session` on every route except `/auth/*`,
  `/healthz` and `/readyz`. There is no sign-in page. `/api/agent/*` also accepts
  `Authorization: Bearer <jwt>`; a bearer header anywhere else → 401.
- No principal → `401 {error: 'sign-in required'}` for `/api/*`; for pages, `302` straight to the
  provider's authorization endpoint (the server starts the sign-in as `/auth/login` does, with
  the requested path as `returnTo`). Signed in but deactivated or without any matching grant →
  `302 /auth/no-access` for pages and `403 {error: 'no access'}` for `/api/*`.
- Non-GET requests require `Origin` = `SW_PUBLIC_URL` origin and `X-SW-Request: 1`, else 403.
- Unreadable target → `404` with the body of a missing resource. Readable target, action denied →
  `403 {error, required: {role?, guard?}, rule}`.
- Guarded change refused → `403 {error, guarded: [{file, pointer, kind}]}` (readable files only).
- Every decision on these routes is audited per [audit-log.md](./audit-log.md).

## New routes

| Method & path | Who | Request | Response |
| --- | --- | --- | --- |
| `GET /auth/login` | anyone | `?returnTo=/path` | 302 to provider; sets `__Host-sw-auth` (state, nonce, PKCE verifier); used by **Sign in again**, **Try again** and the smoke test (no page of its own) |
| `GET /auth/callback` | anyone | provider redirect | validates, creates session, sets `__Host-sw-session`, matches grants; 302 to `returnTo`, or to `/auth/no-access` without a grant; failure → sign-in error page (reason, **Try again**) |
| `POST /auth/logout` | signed in (also from **No access**) | from the app: `X-SW-Request: 1`; from **No access**: an HTML form with the per-session `csrf` field the page embeds (Origin checked either way) | ends session, `{redirect: <provider end-session URL with post_logout_redirect_uri=/auth/signed-out, or /auth/signed-out>}` for the app; `303` to the same address for the form |
| `GET /auth/no-access` | signed in | | minimal HTML: display name and verified address (or username), "An Admin must grant you access to this workbench", **Sign out**; no workspace data; 302 to `/` when the person has access |
| `GET /auth/signed-out` | anyone | | minimal HTML: "You are signed out", **Sign in again** (`/auth/login`); never starts a sign-in by itself |
| `GET /auth/github/start` | signed in | `?returnTo=` | 302 to GitHub authorize with `state` bound to the session |
| `GET /auth/github/callback` | signed in | | stores token in session, 302 to `returnTo` |
| `GET /healthz` | anyone | | `200 {ok: true, version, commit}` (liveness; no workspace data; FR-124) |
| `GET /readyz` | anyone | | `200 {ready: true, state: "serving"}` after lock, recovery and first scan; `200 {ready: true, state: "handover"}` while waiting for a different revision's lock, before any recovery or scan (FR-123); `503` otherwise, including a live lock of the same revision (FR-122) |
| `GET /api/me` | signed in with access | | `{mode, id, name, verifiedEmail, kind, roles: {workspace: [roleId], projects: Record<slug, [roleId]>}, roleNames: Record<roleId, name>, roleSources: [{roleId, scope, via: 'group'\|'email'\|'bootstrap', group?: {id, name?}}], groupsResolved, connected: {azureDevOps, github}, can: Record<Action, boolean> & {admin, audit}, requires: Record<Action, string>, creationDomains: [{id, name}]}`; local mode returns the implicit Admin |
| `POST /api/projects/:slug/git/publish` | Steward(d)/Admin | `{branch?: default}` | fast-forwards the branch to the copy's `HEAD` → `{published, commit}`; `409 {notFastForward: true}` |
| `POST /api/projects/:slug/git/pull-default` | Editor(d)+ | | merges the default branch into the copy's branch → as `git/pull` |
| `GET /api/admin/users` | Admin | `?q=&access=none` | principals with role sources, groups (with names), verified address, last sign-in, access (`granted`/`none`), deactivated |
| `POST /api/admin/users/:id/deactivate` / `reactivate` | Admin | `{reason}` | version commit; sessions ended |
| `GET /api/admin/roles` | Admin | | `{builtIn: [role], custom: [role], actions: [action], conditions: [name], usage: Record<roleId, {grants, people}>}` |
| `PUT /api/admin/roles` | Admin | `roles.json` + `baseVersion` + `dryRunId` + `confirmDeleteInUse?` | `{version}`; built-in role in the body → 400; `admin` action in a custom role → 400; deleting a role with grants without `confirmDeleteInUse` → `409 {inUse: {roleId, grants, people: [{id, name}]}}`; compiled policies validated; last-Admin guard |
| `GET/PUT /api/admin/grants` | Admin | `grants.json` + `baseVersion` + `dryRunId` | `{version}`; e-mail lower-cased; unknown role, domain or project → 400; duplicate → 400; `admin` with a non-workspace scope → 400; last-Admin guard |
| `GET /api/admin/groups/:id` | Admin | | `{id, displayName \| null, resolved: boolean}` from the directory (Graph `GET /groups/{id}?$select=displayName`; Keycloak: the name itself); never fails the grant |
| `GET/PUT /api/admin/projects` | Admin | `projects.json` + `baseVersion` + `dryRunId` | `{version}` |
| `GET/PUT /api/admin/agents` | Admin | `agents.json` + `baseVersion` + `dryRunId` | `{version}` |
| `GET/PUT /api/admin/settings` | Admin | `settings.json` + `baseVersion` | `{version}`; secrets never returned |
| `GET /api/admin/policies` | Admin | | `{baseline: [{id, text, description}], rules: [{id, text, enabled, template?, description}], schema}` |
| `POST /api/admin/policies/validate` | Admin | `{rules}` | `{ok, errors: [{id, line, column, message}]}` |
| `POST /api/admin/policies/dry-run` | Admin | `{rules}` (or any area's proposed file: roles, grants, projects) | `{dryRunId, changed: [{case, before, after, rules}], matrixCases, auditCases, people: [{principal, project, gained, lost, access}]}` (`people` for role, grant and project changes) |
| `PUT /api/admin/policies` | Admin | `{rules, baseVersion, dryRunId}` | `{version}`; refused unless valid and dry-run id matches the same proposal |
| `GET /api/admin/versions` | Admin | `?area=` | `[{version, author, at, message, files}]` |
| `GET /api/admin/versions/:v/diff` | Admin | `?against=` | per-file text diff |
| `POST /api/admin/versions/:v/rollback` | Admin | `{baseVersion}` | `{version}` (new commit); dry run and last-Admin guard apply |
| `POST /api/admin/check` | Admin | `{principal: id \| {groups, email}, action, resource: {type, project?, path?, branch?, metric?}}` | `{decision, grants: [{grantId, roleId, via}], roles: [roleId], rules: [id], attributes}` |
| `GET /api/admin/who-can` | Admin | `?project=&path=` | `[{group \| email \| principal \| client, via: grantId?, actions: [action]}]` |
| `GET /api/admin/sessions` / `DELETE /api/admin/sessions/:principal` | Admin | | list / end all sessions of a principal |
| `GET /api/audit` | Steward(d), Admin | `?principal=&action=&project=&decision=&from=&to=&cursor=` | `{entries, next}`; Stewards get only their domains' projects |
| `GET /api/audit/export` | Steward(d), Admin | same filters + `format=jsonl\|csv` | file download of the filtered entries |
| `GET /api/admin/provider` | Admin | | `{issuer, clientId, discovery: 'ok'\|error, groupClaimMode, overage: 'directory'\|'off', jwksRefreshedAt}` |

## Changed routes (server mode)

| Route | Change |
| --- | --- |
| `GET /api/projects` | only readable projects; each adds `hiddenFiles: n`, `roles: [roleId]`, `actions: [action]` (allowed actions in that project, from all the person's roles, for the UI), `copy: {branch, inUseBranches} \| null`; files listed from the person's copy (Editor+) or the published state (Viewer) |
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
`admin` (every `/api/admin/*`), `agentRead` (agent routes with bearer); `/auth/*`, `/healthz`
and `/readyz` are listed as public rows. The matrix test fails if
a route exists in `server/routes/**` or `server/handler.ts` without a row in
`tests/auth/route-actions.ts`.

## Route inventory (code of 002, re-run after the rebase)

Every route the server answers today, with the action the boundary checks before the route runs
and the resource it is checked against (W workspace, P project, F file). `server/auth/route-actions.ts`
holds the same table; `tests/auth/route-actions.test.ts` fails when a route in `server/routes/**` or
`server/handler.ts` has no row. All the routes that 002 planned (identity, credential helper, clone,
repository projects, metric aliases) exist; none was renamed or dropped.

| Method & path | Action | Resource |
| --- | --- | --- |
| `GET /api/events` | `read` | W |
| `GET /api/status` | `read` (details: `readStatus`) | W |
| `GET /api/projects` | `read` | W (list filtered) |
| `POST /api/projects` | `createProject` | W |
| `PATCH /api/projects/:slug` | `renameProject` | P |
| `DELETE /api/projects/:slug` | `deleteProject` | P |
| `POST /api/import` | `createProject` | W |
| `POST /api/projects/:slug/move` | `move` | P (and the target project) |
| `POST /api/projects/:slug/import` | `import` | P |
| `POST /api/examples/:name` | `createProject` | W |
| `GET /api/projects/:slug/files/*` | `read` | F |
| `PUT /api/projects/:slug/files/*` | `edit` | F |
| `DELETE /api/projects/:slug/files/*` | `delete` | F |
| `GET /api/projects/:slug/files/*/explain/:metric` | `read` | F |
| `GET /api/projects/:slug/metrics` | `read` | P |
| `POST /api/projects/:slug/metrics`, `…/kpis` | `edit` | P |
| `POST /api/projects/:slug/metrics/preview`, `…/kpis/preview` | `read` | P |
| `POST /api/projects/:slug/save-batch` | `edit` | P |
| `GET /api/projects/:slug/delete-impact` | `read` | P |
| `POST /api/clear` | `clear` | W |
| `GET /api/trash` | `read` | W (list filtered) |
| `DELETE /api/trash` | `purge` | W |
| `POST /api/trash/:entry/undo`, `…/restore` | `restoreOwn` (another person's entry: `restoreOthers`) | W |
| `DELETE /api/trash/:entry` | `purge` | W |
| `GET /api/suggestions` | `read` | W (list filtered) |
| `POST /api/suggestions/:id/accept` | `move` | W (both projects checked by the route) |
| `POST /api/suggestions/:id/reject` | `edit` | W |
| `GET /api/drafts` | `viewOwnState` | W (own drafts only) |
| `GET /api/drafts/:slug/*` | `viewOwnState` | F |
| `PUT`, `DELETE /api/drafts/:slug/*` | `edit` | F |
| `GET /api/git/credential-helper` | `setIdentity` | W |
| `GET /api/projects/:slug/git/status`, `diff`, `branches`, `log`, `versions`, `show` | `history` | P |
| `GET /api/projects/:slug/git/identity` | `setIdentity` | P |
| `POST /api/projects/:slug/git/stage`, `unstage` | `stage` | P |
| `POST /api/projects/:slug/git/commit` | `commit` | P |
| `POST /api/projects/:slug/git/revert` | `revert` | P |
| `POST /api/projects/:slug/git/switch` | `branch` | P |
| `POST /api/projects/:slug/git/fetch` | `fetch` | P |
| `POST /api/projects/:slug/git/pull`, `sync` | `pull` | P |
| `POST /api/projects/:slug/git/push` | `push` | P |
| `POST /api/projects/:slug/git/cancel` | `cancelOwn` | P |
| `POST /api/projects/:slug/gitignore` | `edit` | P |
| `PUT`, `DELETE /api/projects/:slug/git/remote` | `setRemote` | P |
| `PUT /api/projects/:slug/git/identity` | `setIdentity` | P |
| `POST /api/clone` | `clone` | W |
| `POST /api/clone/:operation/cancel` | `clone` | W |
| `GET /api/repos/:repo/project-candidates` | `registerProjects` | W |
| `PUT /api/repos/:repo/projects` | `registerProjects` | W |
| `GET /api/agent/catalog`, `GET /api/agent/context`, `POST /api/agent/plan` | `read` (bearer clients: `agentRead`) | W (computed over readable projects) |
| `GET`, `PUT /api/documents/:id/grouping` | `viewOwnState` | W (the route resolves the document's project) |
| `GET /api/documents` | `read` | W (list filtered) |
| `POST /api/documents` | `edit` | W (the route resolves the document's project) |

Workspace-level `read` and `viewOwnState` are allowed to every person with access (baseline policy
`B1-workspace-lists`); what such a route returns is filtered to readable projects and the person's
own state. Rows whose resource is W but whose effect lands in one project (suggestions, legacy
documents, trash entries) are checked again by the route against that project once the user
stories that filter them are built.

The server-mode `/api/me` response also includes `csrf`, the per-session form token used by
the person menu's native `POST /auth/logout`. It is absent in local mode. Provider access, ID
and refresh tokens are never returned.

The `requires` map supplies display text for disabled actions. It names the lowest built-in role
listing the action in `policies/builtin-roles.json`, or the person's custom roles when those are
their only permission source. Each role appears under the name `roleNames` gives it.
`roleNames` follows the current policy: it is built for each request, so a renamed custom role
shows its new name as soon as the administration commit is loaded, without a restart. Clients
display these strings without copying the role matrix.
`creationDomains` contains the permitted domain choices; only the server automatically chooses
the sole domain for a non-Admin. Admins may omit the domain to create an unassigned project.
A creation request (`POST /api/projects`, `/api/import`, `/api/examples/:id`, `/api/clone`) that
names a domain that does not exist answers `404 {error: 'Not found.'}`, exactly like a domain the
person cannot see, so the answer never reveals which domains exist.
