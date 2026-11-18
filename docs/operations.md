# Operation inventory

This reference describes the shared operation boundary. It does not imply that a protocol transport is available.
Regenerate this page with `bun scripts/operation-inventory-table.ts` after reviewing the inventory.

| Operation | Route | Action | Targets | Effects | Request limit | Exposure |
| --- | --- | --- | --- | --- | --- | --- |
| identity.read | GET /api/me | read | workspace | read | none | never |
| auth.styles | GET /auth/style.css | read | workspace | read | none | never |
| events.subscribe | GET /api/events | read | workspace | read | none | never |
| telemetry.report | POST /api/telemetry/browser | viewOwnState | workspace | localWrite | BROWSER_REPORT_REQUEST_LIMIT | never |
| workspace.status | GET /api/status | read | workspace | read | none | local-edit |
| projects.list | GET /api/projects | read | workspace | read | none | local-edit |
| trash.list | GET /api/trash | read | workspace | read | none | local-edit |
| suggestions.list | GET /api/suggestions | read | workspace | read | none | local-edit |
| documents.list | GET /api/documents | read | workspace | read | none | local-edit |
| projects.create | POST /api/projects | createProject | workspace | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.import | POST /api/import | createProject | workspace | localWrite | IMPORT_REQUEST_LIMIT | local-edit |
| workspace.clear | POST /api/clear | clear | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| repositories.clone | POST /api/clone | clone | workspace | administration, remote, localWrite, publish | PROJECT_REQUEST_LIMIT | workspace-scm |
| documents.save | POST /api/documents | edit | body | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| examples.load | POST /api/examples/:name | createProject | workspace | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.rename | PATCH /api/projects/:slug | renameProject | project | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.delete | DELETE /api/projects/:slug | deleteProject | project | destroy | TRASH_REQUEST_LIMIT | local-edit |
| files.move | POST /api/projects/:slug/move | move | project | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| files.import | POST /api/projects/:slug/import | import | project | localWrite | IMPORT_REQUEST_LIMIT | local-edit |
| projects.export | GET /api/projects/:slug/export | export | project | read | none | local-edit |
| files.saveBatch | POST /api/projects/:slug/save-batch | edit | project | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| compile.check | POST /api/projects/:slug/compile/check | read | project | read | FILE_SAVE_REQUEST_LIMIT | local-edit |
| compile.run | POST /api/projects/:slug/compile | export | project | read | FILE_SAVE_REQUEST_LIMIT | local-edit |
| compile.bundle | GET /api/projects/:slug/compile/bundle | export | project | read | none | never |
| compile.convert | POST /api/projects/:slug/compile/convert | edit | project | localWrite | FILE_SAVE_REQUEST_LIMIT | later |
| itemAddresses.resolve | POST /api/projects/:slug/item-addresses/resolve | read | project | read | ITEM_ADDRESS_REQUEST_LIMIT | local-edit |
| itemAddresses.reconcile | POST /api/projects/:slug/item-addresses/reconcile/* | edit | file | localWrite | ITEM_ADDRESS_REQUEST_LIMIT | local-edit |
| files.ignore | POST /api/projects/:slug/gitignore | edit | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| metrics.list | GET /api/projects/:slug/metrics | read | project | read | none | local-edit |
| projects.deleteImpact | GET /api/projects/:slug/delete-impact | read | project | read | none | local-edit |
| metrics.save | POST /api/projects/:slug/metrics | edit | project | localWrite | METRIC_REQUEST_LIMIT | local-edit |
| people.list | GET /api/projects/:slug/people | edit | project | read | none | local-edit |
| metrics.preview | POST /api/projects/:slug/metrics/preview | read | project | read | METRIC_REQUEST_LIMIT | local-edit |
| kpis.save | POST /api/projects/:slug/kpis | edit | project | localWrite | METRIC_REQUEST_LIMIT | local-edit |
| kpis.preview | POST /api/projects/:slug/kpis/preview | read | project | read | METRIC_REQUEST_LIMIT | local-edit |
| metrics.explain | GET /api/projects/:slug/files/*/explain/:metric | read | file | read | none | local-edit |
| files.read | GET /api/projects/:slug/files/* | read | file | read | none | local-edit |
| files.save | PUT /api/projects/:slug/files/* | edit | file | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| files.delete | DELETE /api/projects/:slug/files/* | delete | file | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| drafts.list | GET /api/drafts | viewOwnState | workspace | read | none | local-edit |
| drafts.read | GET /api/drafts/:slug/* | viewOwnState | file | read | none | local-edit |
| drafts.save | PUT /api/drafts/:slug/* | edit | file | localWrite | DRAFT_REQUEST_LIMIT | local-edit |
| drafts.delete | DELETE /api/drafts/:slug/* | edit | file | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| trash.purgeAll | DELETE /api/trash | purge | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| trash.purge | DELETE /api/trash/:entry | purge | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| trash.undo | POST /api/trash/:entry/undo | restoreOwn | body | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| trash.restore | POST /api/trash/:entry/restore | restoreOwn | body | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| suggestions.accept | POST /api/suggestions/:id/accept | move | body | localWrite | none | local-edit |
| suggestions.reject | POST /api/suggestions/:id/reject | edit | body | localWrite | none | local-edit |
| credentials.gitHelper | GET /api/git/credential-helper | setIdentity | workspace | credential | none | local-edit |
| git.status | GET /api/projects/:slug/git/status | history | project | read | none | local-edit |
| git.diff | GET /api/projects/:slug/git/diff | history | project | read | none | local-edit |
| git.branches | GET /api/projects/:slug/git/branches | history | project | read | none | local-edit |
| git.folder.read | GET /api/projects/:slug/git/folder | history | project | read | none | local-edit |
| git.log | GET /api/projects/:slug/git/log | history | project | read | none | local-edit |
| git.versions | GET /api/projects/:slug/git/versions | history | project | read | none | local-edit |
| git.show | GET /api/projects/:slug/git/show | history | project | read | none | local-edit |
| git.identity.read | GET /api/projects/:slug/git/identity | setIdentity | project | credential | none | local-edit |
| git.identity.set | PUT /api/projects/:slug/git/identity | setIdentity | project | credential | GIT_REQUEST_LIMIT | local-edit |
| git.stage | POST /api/projects/:slug/git/stage | stage | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| git.unstage | POST /api/projects/:slug/git/unstage | stage | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| git.commit | POST /api/projects/:slug/git/commit | commit | project | commit | GIT_REQUEST_LIMIT | local-edit |
| git.revert | POST /api/projects/:slug/git/revert | revert | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| git.switch | POST /api/projects/:slug/git/switch | branch | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| git.fetch | POST /api/projects/:slug/git/fetch | fetch | project | localWrite, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.pull | POST /api/projects/:slug/git/pull | pull | project | localWrite, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.sync | POST /api/projects/:slug/git/sync | pull | project | localWrite, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.push | POST /api/projects/:slug/git/push | push | project | localWrite, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.cancel | POST /api/projects/:slug/git/cancel | cancelOwn | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| git.publish | POST /api/projects/:slug/git/publish | publish | project | publish | GIT_REQUEST_LIMIT | workspace-scm |
| git.pullDefault | POST /api/projects/:slug/git/pull-default | pull | project | localWrite | GIT_REQUEST_LIMIT | workspace-scm |
| git.pushDefault | POST /api/projects/:slug/git/push-default | publish | project | publish, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.remote.set | PUT /api/projects/:slug/git/remote | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| git.remote.delete | DELETE /api/projects/:slug/git/remote | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| git.folder.set | PUT /api/projects/:slug/git/folder | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| repositories.cancelClone | POST /api/clone/:operation/cancel | clone | workspace | localWrite | none | local-edit |
| repositories.projectCandidates | GET /api/repos/:repo/project-candidates | registerProjects | workspace | administration | none | workspace-scm |
| repositories.registerProjects | PUT /api/repos/:repo/projects | registerProjects | workspace | administration, localWrite, publish | METRIC_REQUEST_LIMIT | workspace-scm |
| agent.projects.list | GET /api/agent/projects | read | workspace | read | none | local-edit |
| agent.catalog.read | GET /api/agent/catalog | read | workspace | read | none | local-edit |
| agent.context.read | GET /api/agent/context | read | workspace | read | none | local-edit |
| agent.plan | POST /api/agent/plan | read | workspace | read | AGENT_PLAN_REQUEST_LIMIT | local-edit |
| grouping.read | GET /api/documents/:id/grouping | viewOwnState | workspace | read | none | local-edit |
| grouping.save | PUT /api/documents/:id/grouping | viewOwnState | body | localWrite | GROUPING_REQUEST_LIMIT | local-edit |
| users.list | GET /api/admin/users | admin | workspace | administration | none | administration |
| roles.list | GET /api/admin/roles | admin | workspace | administration | none | administration |
| grants.list | GET /api/admin/grants | admin | workspace | administration | none | administration |
| access.projects.read | GET /api/admin/projects | admin | workspace | administration | none | administration |
| clients.list | GET /api/admin/agents | admin | workspace | administration | none | administration |
| settings.read | GET /api/admin/settings | admin | workspace | administration | none | administration |
| policies.list | GET /api/admin/policies | admin | workspace | administration | none | administration |
| versions.list | GET /api/admin/versions | admin | workspace | administration | none | administration |
| sessions.list | GET /api/admin/sessions | admin | workspace | administration | none | administration |
| provider.status | GET /api/admin/provider | admin | workspace | administration | none | administration |
| access.explain | GET /api/admin/who-can | admin | workspace | administration | none | administration |
| groups.read | GET /api/admin/groups/:id | admin | workspace | administration | none | administration |
| versions.diff | GET /api/admin/versions/:v/diff | admin | workspace | administration | none | administration |
| roles.save | PUT /api/admin/roles | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| grants.save | PUT /api/admin/grants | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| access.projects.save | PUT /api/admin/projects | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| clients.save | PUT /api/admin/agents | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| settings.save | PUT /api/admin/settings | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| policies.save | PUT /api/admin/policies | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| users.deactivate | POST /api/admin/users/:id/deactivate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| users.reactivate | POST /api/admin/users/:id/reactivate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| policies.validate | POST /api/admin/policies/validate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| policies.template | POST /api/admin/policies/template | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| policies.dryRun | POST /api/admin/policies/dry-run | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| access.check | POST /api/admin/check | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| versions.rollback | POST /api/admin/versions/:v/rollback | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| sessions.revoke | DELETE /api/admin/sessions/:principal | admin | workspace | administration | none | administration |
| audit.read | GET /api/audit | readAudit | workspace | read | none | local-edit |
| audit.export | GET /api/audit/export | readAudit | workspace | read | none | local-edit |
| auth.login | GET /auth/login | read | workspace | read | none | never |
| auth.callback | GET /auth/callback | read | workspace | read | none | never |
| auth.logout | POST /auth/logout | read | workspace | localWrite | none | never |
| auth.noAccess | GET /auth/no-access | read | workspace | read | none | never |
| auth.signedOut | GET /auth/signed-out | read | workspace | read | none | never |
| auth.frontChannelLogout | GET /auth/front-channel-logout | read | workspace | read | none | never |
| auth.github.start | GET /auth/github/start | read | workspace | read | none | never |
| auth.github.callback | GET /auth/github/callback | read | workspace | read | none | never |
| health.live | GET /healthz | read | workspace | read | none | never |
| health.ready | GET /readyz | read | workspace | read | none | never |
| brand.read | GET /brand/:file | read | workspace | read | none | never |
| pages.read | GET/HEAD pages | read | workspace | read | none | never |
| git.adopt | POST /api/projects/:slug/git/adopt | publish | project | publish | GIT_REQUEST_LIMIT | workspace-scm |
| git.acknowledgePublication | POST /api/projects/:slug/git/acknowledge-publication | viewOwnState | project | localWrite | GIT_REQUEST_LIMIT | never |
| preview.catalog | GET /api/preview/catalog | read | workspace | read | none | never |
| preview.context | GET /api/preview/context | read | workspace | read | none | never |
| preview.plan | POST /api/preview/plan | read | workspace | read | AGENT_PLAN_REQUEST_LIMIT | never |

## Internal publication steps

These steps run inside the admitted route and share its authorization and audit outcome.

| Operation | Internal steps |
| --- | --- |
| repositories.clone | publication.upgrade |
| projects.export | snapshot.read |
| compile.check | snapshot.read |
| compile.run | snapshot.read |
| compile.bundle | snapshot.read |
| metrics.list | snapshot.read |
| metrics.save | snapshot.read |
| metrics.preview | snapshot.read |
| metrics.explain | snapshot.read |
| git.fetch | publication.advance, publication.abandon |
| git.publish | publication.advance, publication.abandon |
| repositories.registerProjects | publication.upgrade |
| agent.catalog.read | snapshot.read |
| agent.context.read | snapshot.read |
| agent.plan | snapshot.read |
| git.adopt | publication.advance, publication.abandon |

## Workspace lifecycle

| Operation | Effects | Entry point | Dispatch |
| --- | --- | --- | --- |
| publication.upgrade | localWrite, publish | src/server/projects/published-initialization.ts | Trusted data-root startup reconciles interrupted publication and adopts existing default commits without rewriting Git content; no transport dispatch. |

## Browser capabilities

| Capability | Status | Reason | Exposure | Source |
| --- | --- | --- | --- | --- |
| validation.shacl | needs-shared-implementation | The worker invokes a shared validator, but no reviewed server operation exposes it. | resources-prompts | src/app/validation/shacl.worker.ts |
| validation.editor | browser-only-by-design | Editor diagnostics depend on the current unsaved buffer and worker lifecycle. | never | src/app/editor/lint.worker.ts |
| lineage.assets | needs-shared-implementation | Asset ranking is implemented in the browser lineage model without a server operation. | later | src/app/odcs/lineage.ts |
| lineage.traversal | needs-shared-implementation | Browser lineage traversal has no reviewed server operation. | later | src/app/odcs/lineage-pierce.ts |
| graph.layout | browser-only-by-design | Node coordinates are presentation state for the browser canvas. | never | src/app/graph/layout.ts |
| lineage.projection | needs-shared-implementation | The browser builds column lineage from contract sources without a reviewed server operation. | resources-prompts | src/app/odcs/lineage.ts |
| mappings.projection | needs-shared-implementation | Mapping cards and edges are derived in the browser without a reviewed server operation. | resources-prompts | src/app/mappings/mapping-graph.ts |
| graph.neighborhood | needs-shared-implementation | Browser neighborhood selection has no reviewed server operation. | later | src/app/graph/graph-view.ts |
| graph.traversal | needs-shared-implementation | The browser owns bounded graph traversal without a reviewed server operation. | later | src/app/graph/pierce.ts |
