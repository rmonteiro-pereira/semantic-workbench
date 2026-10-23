# HTTP API Contract: changes in v0.4.0

Base: [002 HTTP API](../../002-lineage-and-ux/contracts/http-api.md) and
[001 HTTP API](../../001-workbench-improvements/contracts/http-api.md). Local mode keeps every
rule there. Server mode adds the rules below.

## Common rules (server mode)

- Authentication: session cookie `__Host-sw-session` on every route except `/auth/*`,
  `/healthz` and `/readyz`. There is no sign-in page. `/api/agent/*` also accepts
  `Authorization: Bearer <jwt>`; a bearer header anywhere else → 401. An invalid bearer token →
  `401 {error: 'sign-in required'}` with `WWW-Authenticate: Bearer error="invalid_token"`; the
  provider's keys cannot be fetched or read → `503 {error: 'identity provider unavailable'}`
  without that header. A valid client on a route whose row declares no client action → 403.
- A session whose token refresh fails because the provider cannot be reached keeps the session
  and answers `503` (the sign-in error page with status 503); a refused refresh (invalid token,
  tenant mismatch, upgraded token format) ends the session. A session that the current
  `SW_SESSION_KEY` cannot read counts as ended: the file is deleted and the request is
  unauthenticated.
- No principal → `401 {error: 'sign-in required'}` for `/api/*`; for pages, `302` straight to the
  provider's authorization endpoint (the server starts the sign-in as `/auth/login` does, with
  the requested path as `returnTo`). Signed in but deactivated or without any matching grant →
  `302 /auth/no-access` for pages and `403 {error: 'no access'}` for `/api/*`.
- Rate limits: each client address (the socket peer, or the forwarded address when `SW_TRUSTED_PROXY_HOPS` names reverse proxies) has a request allowance, and
  `/auth/login` and `/auth/callback` share a tighter one, because each call can reach the identity
  provider. A source over its allowance gets `429 {error: 'Too many requests.'}` with
  `Retry-After` in seconds, before any other handling and without an audit record; the source is
  logged as `[http] rate-limited <source> <n>` at most once a minute. A signed-in person is
  limited as themselves, everyone else by client address (see `SW_TRUSTED_PROXY_HOPS` in
  [configuration.md](./configuration.md)).
- Unexpected failures: a typed input error (malformed or invalid body, unknown path) is
  `400 {error}` with its message. Any other failure is `500 {error: 'Internal error.'}`; its cause
  is written to the server log as `[http] <requestId> <name>: <message>` and never sent. This
  includes the legacy `/api/documents` and `/api/agent/*` routes. A failed Git command is
  `500 {error: 'Git failed.'}` with Git's output in the log line; the conflicts, missing remotes,
  rejected pushes and other failures that have their own errors keep their answers. A malformed
  percent escape in a path (`%E0%A4%A`) is `400 {error: 'Malformed path encoding.'}`.
- Non-GET requests require `Origin` = `SW_PUBLIC_URL` origin and `X-SW-Request: 1`, else 403.
  A request authenticated by a valid bearer token is exempt: the check protects cookies.
- Unreadable target → `404` with the body of a missing resource. Readable target, action denied →
  `403 {error, required: {role?, guard?}, rule}`.
- Guarded change refused → `403 {error, guarded: [{file, pointer, kind}]}` (readable files only).
  This covers saves, save-batch, metric saves, document saves, imports (including one that
  creates a project), revert, pull/sync, branch switch, a move between projects (including an
  accepted suggestion), file delete and trash undo/restore; for the operations
  that bring in text the person did not type, `error` asks them to have a Steward do it.
- An approved metric stored as proposed → the save answers `200` with `demoted: [{file, pointer,
  metric}]` and the stored text (`source`, per written file for batches).
- Every decision on these routes is audited per [audit-log.md](./audit-log.md).

## New routes

| Method & path | Who | Request | Response |
| --- | --- | --- | --- |
| `GET /auth/login` | anyone | `?returnTo=/path` | 302 to provider; sets `__Host-sw-auth` (state, nonce, PKCE verifier); used by **Sign in again**, **Try again** and the smoke test (no page of its own) |
| `GET /auth/callback` | anyone | provider redirect | validates, creates session, sets `__Host-sw-session`, matches grants; 302 to `returnTo`, or to `/auth/no-access` without a grant; failure → sign-in error page (reason, **Try again**) with status 400 for `attempt-invalid`, `token-invalid` and `tenant-mismatch`, and 503 for `provider-unreachable` |
| `POST /auth/logout` | signed in (also from **No access**) | from the app: `X-SW-Request: 1`; from **No access**: an HTML form with the per-session `csrf` field the page embeds (Origin checked either way); the form body is read only up to 4096 bytes, and a larger one, declared or not, is refused 403 | ends session, `{redirect: <provider end-session URL with post_logout_redirect_uri=/auth/signed-out, or /auth/signed-out>}` for the app; `303` to the same address for the form |
| `GET /auth/no-access` | signed in | | minimal HTML: display name and verified address (or username), "An Admin must grant you access to this workbench", **Sign out**; no workspace data; 302 to `/` when the person has access |
| `GET /auth/front-channel-logout?sid=[&iss=]` | the identity provider (no cookie, no CSRF header) | `sid` must be non-empty and `iss`, when present, equal `SW_OIDC_ISSUER` exactly, else nothing happens; a failure is logged as `front-channel-logout-failed` without the `sid` | ends every session the provider session `sid` started (audit `signOut`, `sessionEnded` reason `provider-signed-out`); always `200` with an empty body, `Cache-Control: no-store`, CSP `frame-ancestors <issuer origin>` |
| `GET /auth/signed-out` | anyone | | minimal HTML: "You are signed out", **Sign in again** (`/auth/login`); never starts a sign-in by itself |
| `GET /api/projects/:slug/people` | `edit` on the project (Editor+) | | `[{name, owner}]` people who may read the project, seen at sign-in with a verified e-mail or Entra user name, for the metric owner picker; Viewer → 403; `[]` in local mode |
| `GET /auth/github/start` | signed in | `?returnTo=` | 302 to GitHub authorize with `state` bound to the session (ten minutes, single use); without a session, starts sign-in; 404 when no GitHub app is configured |
| `GET /auth/github/callback` | signed in | `?code&state` | stores token in session, 302 to `returnTo`; a state of another session, expired or reused, or a failed token exchange → minimal page "GitHub not connected" with a link back |
| `GET /healthz` | anyone | | `200 {ok: true, version, commit}` (liveness; no workspace data; FR-124) |
| `GET /readyz` | anyone | | `200 {ready: true, state: "serving"}` after lock, recovery and first scan; `200 {ready: true, state: "handover"}` while waiting for a different revision's lock, before any recovery or scan (FR-123); `503` otherwise, including a live lock of the same revision (FR-122) |
| `GET /api/me` | signed in with access | | `{mode, id, name, verifiedEmail, kind, roles: {workspace: [roleId], projects: Record<slug, [roleId]>}, roleNames: Record<roleId, name>, roleSources: [{roleId, scope, via: 'group'\|'email'\|'bootstrap', group?: {id, name?}}], groupsResolved, connected: {azureDevOps, github} (azureDevOps: the session holds a valid on-behalf-of token; github: the session holds a GitHub token), azureDevOpsAvailable, githubConfigured, can: Record<Action, boolean> & {admin, audit}, requires: Record<Action, string>, creationDomains: [{id, name}]}`; local mode returns the implicit Admin |
| `POST /api/projects/:slug/git/publish` | Steward(d)/Admin | `{branch?: default}` | fast-forwards the branch to the copy's `HEAD` → `{published, commit}`; `409 {notFastForward: true}` |
| `POST /api/projects/:slug/git/pull-default` | Editor(d)+ | | merges the default branch into the copy's branch → as `git/pull` |
| `POST /api/projects/:slug/git/push-default` | Steward(d)/Admin (`publish`) | `{branch?: default}` | sends the default branch, as published here, to the remote with the person's credential; needs no copy and never publishes; delegated credential and host rules as `git/push` |
| `GET /auth/style.css` | anyone | | the stylesheet shared by the minimal authentication pages, which a content security policy keeps from using inline styles |
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
| `POST /api/admin/policies/template` | Admin | `{template: 'git-limits'\|'metric-ownership'\|'classification'\|'time'\|'network', id, …parameters}` | `{id, text, enabled: true, template}`, the rule the server generates; 400 for unknown actions, `admin` among the actions, hours outside 0–23 or none, no network range or a malformed one, no approver group. A time window past midnight is its hours (`[22, 23, 0, 1]`); network ranges compare the `ipaddr` context attribute `sourceIp` |
| `POST /api/admin/policies/dry-run` | Admin | the document the area's PUT takes (`{rules}`, `{roles}`, `{grants}`, the projects document or `{clients}`), or `{rollbackTo: version}` | `{dryRunId, changed: [{case, before, after, rules}], matrixCases, auditCases, people: [{principal, name, project, gained, lost, access}]}` (`people` for role, grant, project and rollback changes, including people a rollback reactivates; `name` is the display name, or the id when none is known) |
| `PUT /api/admin/policies` | Admin | `{rules, baseVersion, dryRunId}` | `{version}`; refused unless valid and dry-run id matches the same proposal |
| `GET /api/admin/versions` | Admin | `?area=` | `[{version, author, at, message, files}]` |
| `GET /api/admin/versions/:v/diff` | Admin | `?against=` | per-file text diff |
| `POST /api/admin/versions/:v/rollback` | Admin | `{baseVersion, dryRunId}` | `{version}` (new commit); refused unless `dryRunId` comes from a dry run of `{rollbackTo: v}` at the current version; the policy-set, bootstrap and last-Admin guards apply |
| `POST /api/admin/check` | Admin | `{principal: id \| {groups, email}, action, resource: {type, project?, path?, branch?, metric?}}` | `{decision, grants: [{grantId, roleId, via}], roles: [roleId], rules: [id], attributes}` |
| `GET /api/admin/who-can` | Admin | `?project=&path=` | `[{group \| email \| principal \| client, via: grantId?, actions: [action]}]` |
| `GET /api/admin/sessions` / `DELETE /api/admin/sessions/:principal` | Admin | | list / end all sessions of a principal |
| `GET /api/audit` | Steward(d), Admin | `?principal=&action=&project=&decision=&from=&to=&cursor=` | `{entries, next}`; Stewards get only their domains' projects; `from` defaults to the start of the current UTC month, and only the months from `from` through `to` are read |
| `GET /api/audit/export` | Steward(d), Admin | same filters + `format=jsonl\|csv` | file download of the filtered entries |
| `GET /api/admin/provider` | Admin | | `{issuer, clientId, discovery: 'ok'\|error, groupClaimMode, overage: 'directory'\|'off', jwksRefreshedAt}` |

## Changed routes (server mode)

| Route | Change |
| --- | --- |
| `GET /api/projects` | only readable projects; each adds `hiddenFiles: n`, `roles: [roleId]`, `actions: [action]` (allowed actions in that project, from all the person's roles, for the UI), `copy: {branch, inUseBranches} \| null`; files listed from the person's copy (Editor+) or the published state (Viewer) |
| `GET /api/status` | non-Admins get `{mode, gitAvailable, ready}` only |
| `GET /api/documents`, agent routes, metrics, `…/explain/:metric`, `…/metrics/preview`, `…/delete-impact`, `/api/suggestions` | computed over the readable set; `delete-impact` adds `hiddenReferences: n` |
| `GET/PUT/DELETE /api/drafts…`, `/api/documents/:id/grouping` | per person (owner only); a draft body is at most about 4 MB, a draft needs a file the person has (404 otherwise), and a person keeps at most 200 drafts per project and 1,000 in all (400) |
| any route naming a file path | 404, like a hidden file, for a path that spells an existing name in another letter case or a new name that differs from a sibling only in case (the SMB share ignores case) |
| `GET /api/trash` | entries whose paths are readable and (own or Steward(d)/Admin) |
| `…/git/log` | readable paths only; `hiddenCommits: n` for commits touching only unreadable paths |
| `…/git/show`, `…/git/diff`, `…/git/versions` | 404 for unreadable paths |
| `…/git/commit` | author = principal; trailer `Signed-in-user`; operates on the person's copy |
| `…/git/switch` | 409 `{inUseBy: name}` when the branch is checked out in another copy; 403 `{branch}` for another person's `work/*` branch whether or not a copy holds it; 400 for a name that is no branch (a tag, a commit, `@{-1}`) |
| `…/git/branches` | lists no other person's `work/<handle>` branch, local or remote |
| `…/git/stage`, `…/git/unstage` | answer with the caller's own view of the status |
| `…/git/fetch|pull|push|sync`, `…/git/commit` with `push: true` | delegated credential (R8); `428 {error, connect: 'github'\|'azure-devops'}` when missing (checked before the commit); remote host not allowed → 400 `{allowedHosts}` |
| `PUT …/git/remote`, `POST /api/clone`, `PUT /api/repos/:repo/projects` | Admin; host allow-list → 400 `{allowedHosts}` |
| `GET/PUT …/git/identity`, `GET /api/git/credential-helper` | local mode only; 404 in server mode |
| `POST /api/clear`, `DELETE /api/projects/:slug` | Admin; delete lists `unpublished: [{name, changes}]` in the impact response, which only a caller who may delete the project receives |
| `POST /api/trash/:entry/restore`, `…/undo` | both take an optional body `{domain?}` (restore also `toProject?`, `toPath?`); a restore of a file whose project is gone makes a project, so it needs `createProject` in that domain, which is recorded for it; a file deleted outside any copy returns into the caller's copy |

## Route → action table (authorization test matrix input)

Every route of 001/002 and above maps to one action of [policy-model.md](./policy-model.md):
`read` (projects, files, documents, metrics, explain, preview, status-basic, suggestions list,
events), `history` (git status/diff/branches/log/versions/show), `viewOwnState` (drafts,
grouping), `edit` (files PUT, save-batch, documents POST, metrics/kpis POST, gitignore,
suggestions reject), `import`, `move` (move, suggestion accept), `delete` (file delete),
`revert`, `restoreOwn`/`restoreOthers` (undo, restore), `purge` (trash delete, empty), `clear`,
`createProject` (projects POST, import new, examples), `renameProject`, `deleteProject`,
`stage`, `commit`, `branch` (switch), `fetch`, `pull` (pull, sync, pull-default), `push`, `publish` (publish, push-default),
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
| `GET /auth/style.css` and the other `/auth/*` pages, `/healthz`, `/readyz` | public rows | W |
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
| `GET /api/projects/:slug/people` | `edit` | P |
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
| `POST /api/projects/:slug/git/publish`, `…/push-default` | `publish` | P |
| `POST /api/projects/:slug/git/pull-default` | `pull` | P |
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

## Administration response and proposal details

Document GET responses (`grants`, `projects`, `agents`, `settings`) contain the document's
fields plus `version`, the current administration commit. Roles and policies also include
`version` alongside the fields above. `baseVersion` on every PUT is the `version` of the GET
response the proposal was built from; the client does not derive it from
`GET /api/admin/versions`. Omit the response-only `version` field from the proposed document
and from the dry-run body: the document schemas refuse unknown fields with 400. Rollback's
`baseVersion` is the current version, which is also the first entry of
`GET /api/admin/versions` without `area`. Stale writes return `409 {error: "stale", message}`
before proposal validation, so a refusal of the proposal itself (for example a built-in role in
`roles`) is only reported against the current version.

`GET /api/admin/settings` returns every setting, with the value in force for any setting the
stored `settings.json` leaves out (session 8 and 24 hours, no allowed hosts, on-behalf-of off,
GitHub `github.com` without an app, audit retention 400 days). New custom roles carry
`createdBy` (the Admin's principal ID) and `createdAt` (ISO time) set by the client, as new
grants carry `addedBy` and `addedAt`; the roles schema requires both.

Dry-run accepts the complete document the area's PUT takes: `{roles}`, `{grants}`,
`{domains, projects, classification}`, `{clients}` (agents) or `{rules}` (policies); the one of
`roles`, `grants`, `projects`, `clients` or `rules` it contains names the area. Rule objects are
`{id, text, enabled, template?, description?}`; text may include its stored annotations.
Receipts bind the complete normalized proposal to the current version, expire after fifteen
minutes and are invalidated by a successful write. Missing, expired or mismatched receipts
return `400 {error}`. Invalid policies return `400 {error, ok: false, errors}` on activation;
the validation endpoint returns `200 {ok: false, errors}`. Error positions are one-based.
Dry-run changed decisions use boolean `before`/`after`; `case` identifies the replayed request.
The `people[].principal` field is the stable principal ID, including `client:<clientId>`.
Deleting a role previews removal of its grants too; `inUse.grants` is a count and `people`
contains the known identities whose decisions change. Confirmation uses the same receipt.

Users returns an array of stored identities, with `groups: [{id, displayName, resolved}]`,
`roleSources` (the `/api/me` shape, `[{roleId, scope, via, group?: {id, name?}}]`, with the
group's directory name when known), `roles: {workspace, projects}`, `bootstrap`, `access`, and
`deactivated`.
Configured agent clients follow the people as rows with `kind: "client"`, `id: "client:<clientId>"`,
`clientId`, `name`, `projects`, `domains`, `lastSignInAt: null`, `groups: []`, `roleSources: []`
and `access` (`granted` when the client has any project or domain). `q` matches the name,
address, username, ID, client ID or a group name, ignoring case.
Role usage values contain numeric `grants` and `people` counts. Group names are refreshed
when the users panel opens; group lookup failure is represented by `displayName: null`.
Deactivation/reactivation accepts `{reason}` and serializes against the current version.
Last-Admin refusal is `400 {error: "last-admin", message, bootstrap}`; bootstrap identities
cannot be deactivated (`400 {error: "bootstrap-admin", message}`). Refusals of administration
writes are therefore `400 {error, message?}` for invalid or guarded proposals,
`409 {error: "stale", message}` for a superseded base and `409 {inUse}` for an unconfirmed role
deletion; the panel shows `error` and `message` together.

Versions returns the array above with `author: {name, email}` and `files: string[]`.
`area` is one of `roles`, `grants`, `projects`, `agents`, `deactivated`, `settings` or
`policies` (every rule file). Each `message` is one line, `<area>: <summary>`, naming what was
added, removed or changed, for example `grants: Add grant erin-viewer (viewer to
erin@example.org)`, `deactivated: Deactivate Alice Andrade: <reason>` or
`rollback: Roll back to <version>`.
Diff returns `Record<filename, unifiedDiffText>`. Rollback performs validation and a fresh
server dry run before creating its new commit. Sessions returns
`[{principal, name, createdAt, lastSeenAt}]`, without session identifiers or credentials;
DELETE returns `{ended: true}`. Local provider diagnostics use null issuer/client/key-refresh
time and discovery `"unavailable"`. A null key-refresh time means no key fetch has completed in this process.

An activated change closes, with `access {reason: "changed"}`, the live-update streams of the
people and clients whose decisions the dry run shows changing; other streams stay open.
`GET /api/me` reports `can.audit: true` for an Admin and for anyone allowed `readAudit` on at
least one project (a Steward of a domain).

Access check returns `decision: {allow, status, rules, reason?}` and
`attributes: {principal, resource, context}` containing only normalized identity and access
attributes. Who-can returns separate rows for grant members (`group` or `email`, with `via`),
known `principal` IDs and `client` IDs, each with allowed `actions`.
Audit pages contain at most 100 filtered entries; `next` is an opaque cursor string or null.
Exports apply the same scope and filters and download all matching records. CSV quotes fields
and protects spreadsheet formula prefixes. Invalid filters or formats return 400.

For simulator file resources, optional `docType`, `level` and
`metric: {name, status, owner?}` supply the same resource attributes as normal file decisions.
`branch` supplies the branch context. Configured clients are selectable as `client:<clientId>`.

The returned Cedar schema includes generated custom-role holders. Policy context has `hour`
(UTC hour, integer) and `sourceIp` (Cedar `ipaddr`, taken from the direct socket peer).
Network conditions use `context.sourceIp.isInRange(ip("10.0.0.0/8"))`; forwarded headers are
not treated as trusted peer addresses.
