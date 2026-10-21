# Policy Model Contract

The decision boundary is the only place access is decided (constitution 3.0.0, Technical
Constraints).

```ts
// server/auth/authorize.ts
authorize(principal: Principal, action: Action, resource: ResourceRef, context?: Ctx): Decision
filter<T>(principal: Principal, action: Action, items: T[], toResource: (t: T) => ResourceRef): T[]
type Decision = {allow: boolean; rules: string[]; reason?: string; status: 403 | 404 | 200};
```

- `status` is 404 when the principal cannot `read` the resource (existence hidden), otherwise 403
  on deny.
- Decisions are memoised per request by (principal, action, project, file-rule class).
- Engine: Cedar (`@cedar-policy/cedar-wasm/nodejs`), policy set = baseline (`policies/*.cedar`,
  shipped, read-only) + enabled Admin rules (`data/admin/policies/*.cedar`), validated against
  `policies/schema.cedarschema` at start-up and on every Admin change. Invalid set at start-up →
  server refuses to start (server mode) or logs and refuses Admin changes (local mode keeps the
  last valid set).
- Local mode: principal `local`, global Admin; the same boundary runs, so the matrix covers it.

## Baseline policies (shipped; `forbid` always prevails)

Sketch; the exact text ships in `policies/baseline.cedar` and is fixed by the matrix tests. File
restriction is modelled as group parents: a restricted file's `restrictedTo` groups are checked
with `principal in` each group (the entity loader expands the set into a `restrictedGroup`
parent per file rule class), so a restricted file needs membership of at least one listed group.

```cedar
@id("B1-read-domain")
permit(principal in SW::Role::"Viewer", action in SW::ActionGroup::"read", resource)
when { resource.project.domain in principal.domains
       && (!resource.restricted || principal in resource.restrictedGroup) };

@id("B2-write-domain")      permit Editor  on write group   in own domains
@id("B3-git-domain")        permit Editor  on git group     in own domains, not protected branches
@id("B4-steward-domain")    permit Steward on steward group in own domains
@id("B5-admin")             permit Admin   on every action
@id("B6-everyone-read")     permit any person on read group when project.everyoneCanRead
@id("B7-project-assign")    permit by projectRoles for an explicitly assigned project
@id("B8-agent")             permit client  on agentRead when project in client grants

@id("F1-no-self-approval")  forbid approveMetric when resource.ownerId == principal.id
@id("F2-no-domain")         forbid non-Admin on any action when project has no domain and not everyoneCanRead and not assigned
@id("F3-deactivated")       forbid everything when principal.deactivated
@id("F4-bearer-scope")      forbid client principals on every action except agentRead
@id("F5-protected-branch")  forbid push/publish to protected branch unless Steward(d)/Admin
@id("F6-guarded")           forbid editGuarded unless Steward(d)/Admin
@id("F7-remote-admin")      forbid setRemote/clone/registerProjects unless Admin
```

## Admin rule templates (structured editor → Cedar text)

| Template | Parameters | Generates |
| --- | --- | --- |
| Domain or project membership | groups, domain or project, role | `permit` for the role's action group on that scope |
| Classification level for editing | project or domain, level | sets `protectedLevel` (data, not a policy) and an optional extra `forbid` for `editGuarded` below a role |
| Metric ownership and steward | domain, extra approver groups | `permit approveMetric` for those groups (F1 still applies) |
| Git action limits | role, actions, branch pattern | `forbid` those actions on matching branches for that role |
| Branch protection | repository, patterns | adds patterns to `protectedBranches` (data) |
| Agent client scope | client id, projects/domains | entry in `agents.json` (data) |
| Time or network condition | actions, allowed hours or source ranges | `forbid … unless context.hour/sourceIp` |

Admin rules may only add `permit` within readable scopes or add `forbid`; a dry run that shows an
Admin rule enabling an action that a baseline `forbid` blocks is impossible by Cedar semantics
(forbid wins), and the editor rejects rules that reference `SW::Role::"Admin"` in a `forbid`
without a narrowing condition, so the last-Admin guard cannot be bypassed by policy text.
