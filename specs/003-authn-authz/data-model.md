# Data Model: Sign-In, Roles and Access Control (v0.4.0)

Builds on the 002 data model (registry entries with `folder`/`repo`/`remoteAddress`, trash
`subproject` entries, repository manifest). All state files keep `formatVersion: 1` and atomic
writes unless noted.

## Data root layout (server mode additions in bold)

```text
data/
├── projects/<repo>/            repository (base checkout; detached at the default branch in server mode)
├── **worktrees/<userKey>/<repo>/**  personal working copy (git worktree, locked)
├── **admin/**                  administration Git repository (policies, roles, grants, ...)
├── state/
│   ├── projects.json, views/, drafts/, journal/, suggestions.json, legacy-ids.json   (local mode, as v0.3.0)
│   ├── **users.json**          principals seen through sign-in
│   ├── **users/<userKey>/views/, drafts/, suggestions.json**   per-person state (server mode)
│   ├── **sessions/<sha256(id)>.json**   encrypted session records
│   ├── **audit/YYYY-MM.jsonl** append-only audit log
│   └── **instance.lock**       single-instance heartbeat
└── trash/<entry>/              entry.json gains `owner`
```

The SQLite cache moves to `SW_CACHE_DIR` when set (container local disk); default unchanged.

## Instance lock (`state/instance.lock`, written atomically)

| Field | Type | Rule |
| --- | --- | --- |
| `instance` | string (UUID) | unique per start; the sole ownership identity |
| `host`, `pid` | string, number | holder diagnostics |
| `revision` | string | `CONTAINER_APP_REVISION`, else `SW_VERSION+SW_COMMIT` (two containers of one image are the same revision), else `dev` |
| `heartbeat` | ISO time | refreshed every 10 s; stale after 30 s |
| `state` | `serving` | written by the holder; removed in the SIGTERM handler |

Same revision and fresh heartbeat → refuse: not ready, no data served, re-checked every 10 s (FR-122); different revision and fresh heartbeat →
hand-over wait with no recovery, scan or write (FR-123); stale or absent → take the lock, then
recover and scan.

## Principal (in memory, per request)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | `tid:oid` (Entra) or `iss|sub`; `local` in local mode; `client:<clientId>` for agents |
| `key` | string | `u` + 20 hex of SHA-256(`id`); folder names |
| `kind` | `'person'\|'client'\|'local'` | |
| `name`, `username` | string | from ID token/userinfo |
| `verifiedEmail` | string \| null | trimmed, lower-cased; Entra: `email` with `xms_edov=true`, else `upn`/`preferred_username` unless it contains `#EXT#`; Keycloak/generic: `email` with `email_verified=true`; else `null` (FR-024) |
| `groups` | string[] | group object ids (Entra) or names/paths (Keycloak), after overage resolution |
| `groupsResolved` | `'token'\|'directory'\|'failed'` | `failed` → no group membership (group grants do not match) |
| `grants` | `{grantId, roleId, scope, via: 'group'\|'email'\|'bootstrap', group?}[]` | matching grants (data-model Access grant); `[]` → **No access** |
| `deactivated` | boolean | from `admin/deactivated.json` |

Provider roles (`roles`, `resource_access.<client>.roles`) are not read for people. Effective
permissions in a project = union of the permissions of every role in `grants` whose scope covers
the project; Admin (built-in, workspace scope only) applies to every project, including projects
without a domain. The decision itself is taken by
Cedar from the compiled policies (Policy entities below), never from this list directly; the list
is for `/api/me`, Users & groups and the access check.

## Session (`state/sessions/<sha256(id)>.json`, AES-256-GCM)

| Field | Type |
| --- | --- |
| `formatVersion` | 1 |
| `iv`, `ciphertext`, `tag` | base64 (payload below) |

Payload: `{principalId, createdAt, lastSeenAt, expiresAt, idToken, accessToken, accessTokenExpiresAt,
refreshToken?, claims (normalised principal snapshot), remote: {azureDevOps?: {token, expiresAt},
github?: {host, token, expiresAt, refreshToken?}}}`. Deleted on sign-out, expiry or End session.

## User record (`state/users.json`)

`{formatVersion: 1, users: [{key, id, kind, name, verifiedEmail, username, groups,
groupsResolved, lastSignInAt, access: 'granted'|'none', handle}]}`; `handle` = unique branch
handle (OP-1). Groups and address are those of the last sign-in or refresh; the dry run and the
"what changes for whom" view use them. No tokens.

## Access configuration (`data/admin/`, Git repository; schema `schemas/semantic-workbench-access-v1.json`)

| File | Content |
| --- | --- |
| `roles.json` | `{roles: [{id, name, description, permissions: [{actions: [action], conditions?: Conditions}], createdBy, createdAt}]}`: custom roles only; the built-in roles ship read-only in `policies/builtin-roles.json` with the same shape |
| `grants.json` | `{grants: [{id, roleId, member: {kind: 'group', groupId, displayName?, resolvedAt?} \| {kind: 'email', email}, scope: {kind: 'workspace'} \| {kind: 'domains', domains: [id]} \| {kind: 'projects', projects: [slug]}, addedBy, addedAt}]}` |
| `projects.json` | `{domains: [{id, name}], projects: {<slug>: {domain?: id, everyoneCanRead?: boolean, stewards: [id], restricted: [{pattern, groups: [groupId], emails: [email]}], protectedBranches: [pattern], protectedLevel?: level}}, classification: {levels: ['public','internal','confidential','restricted'], aliases: {<text>: level}, protectedLevel: 'confidential'}}` |
| `agents.json` | `{clients: [{clientId, name, projects: [slug], domains: [id]}]}` |
| `deactivated.json` | `{principals: [{id, at, by, reason}]}` |
| `settings.json` | `{session: {idleHours: 8, absoluteHours: 24}, remote: {allowedHosts: [host], azureDevOpsObo: boolean, github: {host, appConfigured: boolean}}, audit: {retentionDays: 400}}` |
| `policies/<id>.cedar` | one Admin rule; annotations `@id`, `@enabled("true"\|"false")`, `@template(<name>)`, `@description` |

`stewards` are informational contacts shown to readers; they grant nothing.

`Conditions` = `{branch?: glob, path?: glob, docType?: [type], maxLevel?: level}`; every present
key must hold (AND); a permission without conditions applies to every resource in the grant's
scope.

### Access grant and role rules

| Rule | Detail |
| --- | --- |
| Role ids | built-in `viewer`, `editor`, `steward`, `admin`; custom `r_` + lower-case letters, digits and `_` (they become Cedar identifiers); names unique, case-insensitive |
| Built-in roles | not in `roles.json`; any change or deletion refused |
| Custom role actions | any action of the policy model except `admin`; at least one |
| Grant member | `groupId`: non-empty, ≤ 256 chars (Entra: a GUID); `email`: lower-cased addr-spec; `displayName` from the directory at add time and refreshed when the panel opens; absent → "name not resolved" |
| Grant scope | `admin` role: `workspace` only, and its policies are gated by the workspace holder, so Admin reaches every project including those without a domain; domains and projects must exist; for every other role the workspace scope covers projects with a domain; a project without a domain is covered only by a `projects` scope naming it |
| Duplicates | one grant per (role, member, scope); a second identical grant is refused |
| Role deletion | refused while grants reference it unless the request carries `confirmDeleteInUse: true`; then role and its grants are removed in one commit |

### Grant resolution (pure function, `server/auth/grants.ts`)

`resolveGrants(principal, grants, projects) → MatchedGrant[]`: a group grant matches when
`principal.groups` contains `groupId` (exact, case-sensitive for Keycloak names, case-insensitive
for Entra GUIDs); an e-mail grant matches when `principal.verifiedEmail` equals `email`; a
`null` address never matches. Bootstrap Admins add a synthetic `{roleId: 'admin', scope:
workspace, via: 'bootstrap'}`. Deactivated principals resolve to `[]`.

Validation: path patterns are relative POSIX globs without `..`; levels unique; at least one
Admin remains (last-Admin guard: people seen within the session lifetime whose stored groups or
address match an Admin grant, plus bootstrap Admins). Each change = one commit, author = the
Admin, message `"<area>: <summary>"`. Versions = commits; rollback = new commit with the chosen
version's files.

## Policy entities (Cedar schema `policies/schema.cedarschema` plus a generated fragment, namespace `SW`)

| Entity | Parents | Attributes |
| --- | --- | --- |
| `SW::User` | `SW::Group` (resolved groups), `SW::Email` (verified address) | `deactivated: Bool`, `kind: String`, `hasAccess: Bool` (at least one grant), `id: String` |
| `SW::Group` | `SW::RoleHolder` from group grants | `name?` |
| `SW::Email` | `SW::RoleHolder` from e-mail grants | — |
| `SW::RoleHolder` | — | id `<roleId>@<slug>` or `<roleId>@workspace`: holders of one role in one project |
| `SW::Domain` | — | `name` |
| `SW::Repository` | — | `remoteHost?` |
| `SW::Project` | `SW::Repository` | `domain?: Domain`, `everyoneCanRead: Bool`, `protectedLevel: Long`, `holders: {<roleId>: RoleHolder}` (record type generated from the role list), `explicitHolders: RoleHolder` (holders through `projects`-scoped grants) |
| `SW::File` | `SW::Project` | `project: Project`, `path`, `docType`, `level: Long`, `restricted: Bool`, `restrictedTo: SW::AccessSet` |
| `SW::AccessSet` | — | synthetic per restricted rule class; listed groups and e-mail entities are its members |
| `SW::Metric` | `SW::File` | `project: Project`, `path`, `docType` (`metric`), `level: Long`, `status`, `ownerId?`, `governed: Bool` (Cedar does not inherit attributes, so the loader repeats them) |
| `SW::Branch` | `SW::Repository` | `protected: Bool`, `name` |
| `SW::TrashEntry` | — | `owner`, `projects: Set<Project>` |
| `SW::Workspace` | — | singleton for workspace-wide actions; `holders` as on Project |

Grants are data, roles are code: the entity loader expands each grant's scope into
`RoleHolder` parents of its `Group` or `Email` entity (workspace → every project with a domain
plus the workspace holder; Admin grants → the workspace holder `admin@workspace` only, which the
Admin policies test directly; domains → their projects; projects → those projects), so
`principal in resource.project.holders.<roleId>` is true exactly when a matching grant covers the
project. The role compiler turns each role (built-in and custom) into `permit` policies (see
[contracts/policy-model.md](./contracts/policy-model.md)). Expansion is recomputed on every grant,
role, domain or project change; for tens of grants and projects it is a few hundred entities.

Actions (groups in parentheses): `read`, `export`, `history`, `viewOwnState` (read group);
`edit`, `createMetric`, `import`, `move`, `delete`, `revert`, `restoreOwn` (write group);
`approveMetric`, `editGuarded`, `restoreOthers`, `publish` (steward group); `stage`, `commit`,
`branch`, `fetch`, `pull`, `push`, `cancelOwn` (git group); `purge`, `clear`, `createProject`,
`renameProject`, `deleteProject`, `setRemote`, `clone`, `registerProjects`, `setIdentity`,
`readStatus`, `readAudit`, `admin` (admin group); `agentRead` (agent). Context: `mode`,
`guardKind?`, `level?`, `targetProject?`, `branch?`, `authStrength?`.

## Audit entry (`state/audit/YYYY-MM.jsonl`)

See [contracts/audit-log.md](./contracts/audit-log.md).

## Trash entry (extended)

`entry.json` adds `owner: principalId` and `copy: userKey|null`. Server-mode project delete adds
`unpublished: [{userKey, name, patch: 'unpublished/<userKey>.patch', drafts: n}]` holding each
person's uncommitted changes as a binary-safe patch and their drafts.

## State transitions

- Metric status: `draft → proposed` (Editor+), `proposed → approved` (Steward of domain, not
  owner), `approved → deprecated` (Steward of domain), any change by a non-approver to an
  approved metric → `proposed` (server), `deprecated → proposed` (Steward).
- Session: `pending (auth cookie) → active → expired | ended`; `active → refreshed` on token
  refresh (claims re-read, grants re-matched); an active session whose grants become empty
  serves only **No access**.
- Custom role: `absent → created → edited* → deleted` (deletion with grants needs confirmation);
  built-in roles have no transitions.
- Access grant: `absent → active → removed`; a change of role or scope is a remove plus an add in
  one commit.
- Working copy: `absent → created (on first use by Editor+) → active ↔ idle → removed (project
  delete or Admin action, unpublished work to trash)`.
- Policy, role or grant version: `draft (in dialog) → validated → dry-run reviewed → active`;
  invalid never leaves draft.
