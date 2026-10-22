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
- Decisions are memoised per request by (principal, action, project, file-rule class); the
  file-rule class is the set of restricted patterns and role path conditions a path matches plus
  its document type and classification level, so files that no condition tells apart share one
  decision.
- Engine: Cedar (`@cedar-policy/cedar-wasm/nodejs`), policy set = baseline (`policies/*.cedar`,
  shipped, read-only) + role policies compiled from the built-in roles
  (`policies/builtin-roles.json`) and the custom roles (`data/admin/roles.json`) + enabled Admin
  rules (`data/admin/policies/*.cedar`), validated against `policies/schema.cedarschema` plus the
  generated `holders` record type at start-up and on every Admin change. Invalid set at start-up →
  server refuses to start (server mode) or logs and refuses Admin changes (local mode keeps the
  last valid set).
- Local mode: principal `local`, holder of the built-in Admin role at workspace scope; the same
  boundary runs, so the matrix covers it.

## Role compiler (`server/auth/role-compiler.ts`, pure)

Each role becomes one `permit` per permission. Membership is not in the policy text: it comes
from the entity hierarchy built from grants (`User → Group | Email → RoleHolder`, see
[data-model.md](../data-model.md)), so adding or removing a grant changes entities only, and
editing a role changes policies only.

```cedar
// Custom role "Metric reviewer" (id r_metric_reviewer), permission 2 of 2
@id("role:r_metric_reviewer:2")
permit(principal,
       action in [SW::Action::"approveMetric"],
       resource)
when {
  principal in resource.project.holders.r_metric_reviewer
  && resource.docType == "metric"
};
```

| Condition | Generated clause |
| --- | --- |
| `branch` | `context.branch like "<glob as Cedar pattern>"` (only for actions that carry a branch) |
| `path` | `resource.path like "<glob>"` (`**` and `*` become `*`; `?` refused) |
| `docType` | `[...].contains(resource.docType)` |
| `maxLevel` | `context.level <= <n>` (levels `public`=0 … `restricted`=3) |

Workspace-wide actions use `SW::Workspace::"ws"` as the resource, whose `holders` record is built
the same way from workspace-scoped grants. The compiler refuses `admin` in a custom role, an
unknown action, a condition on an action that cannot carry it, and a role id that is not a Cedar
identifier; its output is validated with the rest of the set before activation.

Built-in roles compile from `policies/builtin-roles.json` (Appendix B of the spec) through the
same function, so the matrix tests also test the compiler. `role:admin:*` permits every action
and is reachable only through workspace-scoped grants and bootstrap Admins.

## Baseline policies (shipped; `forbid` always prevails)

Sketch; the exact text ships in `policies/baseline.cedar` and is fixed by the matrix tests. File
restriction is modelled as an entity: a restricted file's `restrictedTo` access set has the
listed groups and e-mail entities as members, so `principal in resource.restrictedTo` holds when
the person is in one of the groups or has one of the addresses.

```cedar
@id("B6-everyone-read")     permit any person with hasAccess on read group when project.everyoneCanRead
@id("B8-agent")             permit client  on agentRead when project in client grants

@id("F1-no-self-approval")  forbid approveMetric when resource.ownerId == principal.id
@id("F2-no-domain")         forbid non-Admin on any action when project has no domain, not everyoneCanRead and principal not in project.explicitHolders
@id("F3-deactivated")       forbid everything when principal.deactivated
@id("F4-bearer-scope")      forbid client principals on every action except agentRead
@id("F5-protected-branch")  forbid push/publish to a protected branch unless the principal holds publish on the project
@id("F6-restricted")        forbid read group on a restricted file unless principal in resource.restrictedTo or Admin
@id("F7-remote-admin")      forbid setRemote/clone/registerProjects unless Admin
@id("F8-no-access")         forbid every person action when !principal.hasAccess
```

The former role-specific permits (read, write, Git and Steward actions per domain, Admin
everything, per-project assignments) are now the compiled role policies above; their ids in
audit entries are `role:<roleId>:<n>`.

## Admin rule templates (structured editor → Cedar text)

| Template | Parameters | Generates |
| --- | --- | --- |
| Classification level for editing | project or domain, level | sets `protectedLevel` (data, not a policy) and an optional extra `forbid` for `editGuarded` below a role |
| Metric ownership and steward | domain, extra approver groups | `permit approveMetric` for those groups (F1 still applies) |
| Git action limits | role, actions, branch pattern | `forbid` those actions on matching branches for holders of that role |
| Branch protection | repository, patterns | adds patterns to `protectedBranches` (data) |
| Agent client scope | client id, projects/domains | entry in `agents.json` (data) |
| Time or network condition | actions, allowed hours or source ranges | `forbid … unless context.hour/sourceIp` |

Who holds which role is not a template: it is managed as grants and custom roles in **Roles &
access**. Admin rules may only add `permit` within readable scopes or add `forbid`; a dry run that
shows an Admin rule enabling an action that a baseline `forbid` blocks is impossible by Cedar
semantics (forbid wins), and the editor rejects rules that reference the Admin role holders in a
`forbid` without a narrowing condition, so the last-Admin guard cannot be bypassed by policy text.

## Access check and dry run

- `explain(principal | {groups, email}, action, resource)` builds the same entities for a
  hypothetical principal (its groups and address matched against the grants), and returns the
  decision, the matching grants, the roles they give, the deciding policy ids and the attributes
  used.
- A proposed change of roles or grants is compiled and loaded beside the active set; the dry run
  replays the matrix cases and the last 1,000 audit snapshots and also computes, for every person
  in `users.json` (stored groups and address) and every agent client, the allowed actions per
  readable project before and after: `people: [{principal, project, gained: [action], lost:
  [action], access: 'kept'|'gained'|'lost'}]` ("what changes for whom").
