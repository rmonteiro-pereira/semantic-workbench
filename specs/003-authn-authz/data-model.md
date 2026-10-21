# Data Model: Sign-In, Roles and Access Control (v0.4.0)

Builds on the 002 data model (registry entries with `folder`/`repo`/`remoteAddress`, trash
`subproject` entries, repository manifest). All state files keep `formatVersion: 1` and atomic
writes unless noted.

## Data root layout (server mode additions in bold)

```text
data/
├── projects/<repo>/            repository (base checkout; detached at the default branch in server mode)
├── **worktrees/<userKey>/<repo>/**  personal working copy (git worktree, locked)
├── **admin/**                  administration Git repository (policies, roles, assignments, ...)
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

## Principal (in memory, per request)

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | `tid:oid` (Entra) or `iss|sub`; `local` in local mode; `client:<clientId>` for agents |
| `key` | string | `u` + 20 hex of SHA-256(`id`); folder names |
| `kind` | `'person'\|'client'\|'local'` | |
| `name`, `email`, `username` | string | from ID token/userinfo; email lower-cased |
| `providerRoles` | string[] | `roles` (Entra) or `resource_access.<client>.roles` (Keycloak) |
| `groups` | string[] | group ids (Entra GUIDs) or names (Keycloak), after overage resolution |
| `groupsResolved` | `'token'\|'directory'\|'failed'` | `failed` → no domain membership |
| `roles` | `{global?: Role, domains: Record<domain, Role>, projects: Record<slug, Role>}` | effective, after mappings, assignments and bootstrap |
| `roleSources` | `{role, scope, source: 'app-role'\|'group-mapping'\|'client-role'\|'assignment'\|'bootstrap'}[]` | shown in Users & groups |
| `deactivated` | boolean | from `admin/deactivated.json` |

`Role` = `Viewer < Editor < Steward < Admin`. Effective role in a project = max(domain role for
the project's domain, project assignment); Admin global applies everywhere.

## Session (`state/sessions/<sha256(id)>.json`, AES-256-GCM)

| Field | Type |
| --- | --- |
| `formatVersion` | 1 |
| `iv`, `ciphertext`, `tag` | base64 (payload below) |

Payload: `{principalId, createdAt, lastSeenAt, expiresAt, idToken, accessToken, accessTokenExpiresAt,
refreshToken?, claims (normalised principal snapshot), remote: {azureDevOps?: {token, expiresAt},
github?: {host, token, expiresAt, refreshToken?}}}`. Deleted on sign-out, expiry or End session.

## User record (`state/users.json`)

`{formatVersion: 1, users: [{key, id, kind, name, email, username, groups, lastSignInAt,
handle}]}`; `handle` = unique branch handle (OP-1). No tokens.

## Access configuration (`data/admin/`, Git repository; schema `schemas/semantic-workbench-access-v1.json`)

| File | Content |
| --- | --- |
| `roles.json` | `{mappings: [{source: {kind: 'group'\|'app-role'\|'client-role', value}, role, domain?}], domains: [{id, name, groups: [groupId]}]}` |
| `assignments.json` | `{assignments: [{project, principal?: id, group?: id, role}]}` |
| `projects.json` | `{projects: {<slug>: {domain?: id, everyoneCanRead?: boolean, extraReaders: [group\|id], stewards: [id], restricted: [{pattern, groups: [id]}], protectedBranches: [pattern], protectedLevel?: level}}, classification: {levels: ['public','internal','confidential','restricted'], aliases: {<text>: level}, protectedLevel: 'confidential'}}` |
| `agents.json` | `{clients: [{clientId, name, projects: [slug], domains: [id]}]}` |
| `deactivated.json` | `{principals: [{id, at, by, reason}]}` |
| `settings.json` | `{session: {idleHours: 8, absoluteHours: 24}, remote: {allowedHosts: [host], azureDevOpsObo: boolean, github: {host, appConfigured: boolean}}, audit: {retentionDays: 400}}` |
| `policies/<id>.cedar` | one Admin rule; annotations `@id`, `@enabled("true"\|"false")`, `@template(<name>)`, `@description` |

Validation: path patterns are relative POSIX globs without `..`; group ids non-empty ≤ 256 chars;
levels unique; at least one Admin remains (last-Admin guard). Each change = one commit, author =
the Admin, message `"<area>: <summary>"`. Versions = commits; rollback = new commit with the
chosen version's files.

## Policy entities (Cedar schema `policies/schema.cedarschema`, namespace `SW`)

| Entity | Parents | Attributes |
| --- | --- | --- |
| `SW::User` | `SW::Group`, `SW::Role` | `domains: Set<Domain>`, `projectRoles: Record`, `deactivated: Bool`, `kind: String`, `email: String` |
| `SW::Group` | — | — |
| `SW::Role` | lower role (`Admin` ⊃ `Steward` ⊃ `Editor` ⊃ `Viewer`) | — |
| `SW::Domain` | — | `name` |
| `SW::Repository` | — | `remoteHost?` |
| `SW::Project` | `SW::Repository` | `domain?: Domain`, `everyoneCanRead: Bool`, `protectedLevel: Long` |
| `SW::File` | `SW::Project` | `path`, `docType`, `restricted: Bool`, `restrictedGroup: Group` (synthetic group per rule class whose members are the listed groups' members) |
| `SW::Metric` | `SW::File` | `status`, `ownerId?`, `governed: Bool` |
| `SW::Branch` | `SW::Repository` | `protected: Bool`, `name` |
| `SW::TrashEntry` | — | `owner`, `projects: Set<Project>` |
| `SW::Workspace` | — | singleton for workspace-wide actions |

Actions (groups in parentheses): `read`, `export`, `history`, `viewOwnState` (read group);
`edit`, `createMetric`, `import`, `move`, `delete`, `revert`, `restoreOwn` (write group);
`approveMetric`, `editGuarded`, `restoreOthers`, `publish` (steward group); `stage`, `commit`,
`branch`, `fetch`, `pull`, `push`, `cancelOwn` (git group); `purge`, `clear`, `createProject`,
`renameProject`, `deleteProject`, `setRemote`, `clone`, `registerProjects`, `setIdentity`,
`readStatus`, `readAudit`, `admin` (admin group); `agentRead` (agent). Context: `mode`,
`guardKind?`, `level?`, `targetProject?`, `authStrength?`.

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
  refresh (claims re-read, roles recomputed).
- Working copy: `absent → created (on first use by Editor+) → active ↔ idle → removed (project
  delete or Admin action, unpublished work to trash)`.
- Policy version: `draft (in dialog) → validated → dry-run reviewed → active`; invalid never
  leaves draft.
