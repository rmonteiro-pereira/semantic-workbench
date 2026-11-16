# Operations

This reference describes the shared operation boundary. It does not imply that a protocol transport is available.
Regenerate this page with `bun scripts/operation-inventory-table.ts` after reviewing the inventory.

| Operation | Route | Action | Targets | Effects | Request limit | Exposure |
| --- | --- | --- | --- | --- | --- | --- |
| me.read | GET /api/me | read | workspace | read | none | never |
| auth.style.css.read | GET /auth/style.css | read | workspace | read | none | never |
| events.read | GET /api/events | read | workspace | read | none | never |
| telemetry.browser.run | POST /api/telemetry/browser | viewOwnState | workspace | localWrite | BROWSER_REPORT_REQUEST_LIMIT | never |
| status.read | GET /api/status | read | workspace | read | none | local-edit |
| projects.list | GET /api/projects | read | workspace | read | none | local-edit |
| trash.read | GET /api/trash | read | workspace | read | none | local-edit |
| suggestions.read | GET /api/suggestions | read | workspace | read | none | local-edit |
| documents.list | GET /api/documents | read | workspace | read | none | local-edit |
| projects.create | POST /api/projects | createProject | workspace | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.import | POST /api/import | createProject | workspace | localWrite | IMPORT_REQUEST_LIMIT | local-edit |
| clear.run | POST /api/clear | clear | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| repositories.clone | POST /api/clone | clone | workspace | administration, remote | PROJECT_REQUEST_LIMIT | workspace-scm |
| documents.save | POST /api/documents | edit | body | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| examples.run | POST /api/examples/:name | createProject | workspace | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.update | PATCH /api/projects/:slug | renameProject | project | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| projects.delete | DELETE /api/projects/:slug | deleteProject | project | destroy | TRASH_REQUEST_LIMIT | local-edit |
| files.move | POST /api/projects/:slug/move | move | project | localWrite | PROJECT_REQUEST_LIMIT | local-edit |
| files.import | POST /api/projects/:slug/import | import | project | localWrite | IMPORT_REQUEST_LIMIT | local-edit |
| projects.export | GET /api/projects/:slug/export | export | project | read | none | local-edit |
| files.save.batch | POST /api/projects/:slug/save-batch | edit | project | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| projects.gitignore.run | POST /api/projects/:slug/gitignore | edit | project | localWrite | GIT_REQUEST_LIMIT | local-edit |
| projects.metrics.read | GET /api/projects/:slug/metrics | read | project | read | none | local-edit |
| projects.delete.impact.read | GET /api/projects/:slug/delete-impact | read | project | read | none | local-edit |
| projects.metrics.run | POST /api/projects/:slug/metrics | edit | project | localWrite | METRIC_REQUEST_LIMIT | local-edit |
| projects.people.read | GET /api/projects/:slug/people | edit | project | read | none | local-edit |
| projects.metrics.preview.run | POST /api/projects/:slug/metrics/preview | read | project | read | METRIC_REQUEST_LIMIT | local-edit |
| projects.kpis.run | POST /api/projects/:slug/kpis | edit | project | localWrite | METRIC_REQUEST_LIMIT | local-edit |
| projects.kpis.preview.run | POST /api/projects/:slug/kpis/preview | read | project | read | METRIC_REQUEST_LIMIT | local-edit |
| projects.files.file.explain.read | GET /api/projects/:slug/files/*/explain/:metric | read | file | read | none | local-edit |
| files.read | GET /api/projects/:slug/files/* | read | file | read | none | local-edit |
| files.save | PUT /api/projects/:slug/files/* | edit | file | localWrite | FILE_SAVE_REQUEST_LIMIT | local-edit |
| files.delete | DELETE /api/projects/:slug/files/* | delete | file | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| drafts.read | GET /api/drafts | viewOwnState | workspace | read | none | local-edit |
| drafts.file.read | GET /api/drafts/:slug/* | viewOwnState | file | read | none | local-edit |
| drafts.file.set | PUT /api/drafts/:slug/* | edit | file | localWrite | DRAFT_REQUEST_LIMIT | local-edit |
| drafts.file.delete | DELETE /api/drafts/:slug/* | edit | file | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| trash.purge.all | DELETE /api/trash | purge | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| trash.purge | DELETE /api/trash/:entry | purge | workspace | destroy | TRASH_REQUEST_LIMIT | local-edit |
| trash.undo.run | POST /api/trash/:entry/undo | restoreOwn | body | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| trash.restore.run | POST /api/trash/:entry/restore | restoreOwn | body | localWrite | TRASH_REQUEST_LIMIT | local-edit |
| suggestions.accept.run | POST /api/suggestions/:id/accept | move | body | localWrite | none | local-edit |
| suggestions.reject.run | POST /api/suggestions/:id/reject | edit | body | localWrite | none | local-edit |
| git.credential.helper | GET /api/git/credential-helper | setIdentity | workspace | credential | none | local-edit |
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
| git.pull.default | POST /api/projects/:slug/git/pull-default | pull | project | localWrite | GIT_REQUEST_LIMIT | workspace-scm |
| git.push.default | POST /api/projects/:slug/git/push-default | publish | project | publish, remote | GIT_REQUEST_LIMIT | workspace-scm |
| git.remote.set | PUT /api/projects/:slug/git/remote | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| git.remote.delete | DELETE /api/projects/:slug/git/remote | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| git.folder.set | PUT /api/projects/:slug/git/folder | setRemote | project | administration | GIT_REQUEST_LIMIT | workspace-scm |
| clone.cancel.run | POST /api/clone/:operation/cancel | clone | workspace | localWrite | none | local-edit |
| repos.project.candidates.read | GET /api/repos/:repo/project-candidates | registerProjects | workspace | administration | none | workspace-scm |
| repos.projects.set | PUT /api/repos/:repo/projects | registerProjects | workspace | administration | METRIC_REQUEST_LIMIT | workspace-scm |
| agent.projects.read | GET /api/agent/projects | read | workspace | read | none | local-edit |
| agent.catalog.read | GET /api/agent/catalog | read | workspace | read | none | local-edit |
| agent.context.read | GET /api/agent/context | read | workspace | read | none | local-edit |
| agent.plan.run | POST /api/agent/plan | read | workspace | read | GIT_REQUEST_LIMIT | local-edit |
| documents.grouping.read | GET /api/documents/:id/grouping | viewOwnState | workspace | read | none | local-edit |
| documents.grouping.set | PUT /api/documents/:id/grouping | viewOwnState | body | localWrite | GROUPING_REQUEST_LIMIT | local-edit |
| admin.users.read | GET /api/admin/users | admin | workspace | administration | none | administration |
| admin.roles.read | GET /api/admin/roles | admin | workspace | administration | none | administration |
| admin.grants.read | GET /api/admin/grants | admin | workspace | administration | none | administration |
| admin.projects.read | GET /api/admin/projects | admin | workspace | administration | none | administration |
| admin.agents.read | GET /api/admin/agents | admin | workspace | administration | none | administration |
| admin.settings.read | GET /api/admin/settings | admin | workspace | administration | none | administration |
| admin.policies.read | GET /api/admin/policies | admin | workspace | administration | none | administration |
| admin.versions.read | GET /api/admin/versions | admin | workspace | administration | none | administration |
| admin.sessions.read | GET /api/admin/sessions | admin | workspace | administration | none | administration |
| admin.provider.read | GET /api/admin/provider | admin | workspace | administration | none | administration |
| admin.who.can.read | GET /api/admin/who-can | admin | workspace | administration | none | administration |
| admin.groups.read | GET /api/admin/groups/:id | admin | workspace | administration | none | administration |
| admin.versions.diff.read | GET /api/admin/versions/:v/diff | admin | workspace | administration | none | administration |
| admin.roles.set | PUT /api/admin/roles | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.grants.set | PUT /api/admin/grants | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.projects.set | PUT /api/admin/projects | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.agents.set | PUT /api/admin/agents | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.settings.set | PUT /api/admin/settings | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.policies.set | PUT /api/admin/policies | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.users.deactivate.run | POST /api/admin/users/:id/deactivate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.users.reactivate.run | POST /api/admin/users/:id/reactivate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.policies.validate.run | POST /api/admin/policies/validate | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.policies.template.run | POST /api/admin/policies/template | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.policies.dry.run.run | POST /api/admin/policies/dry-run | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.check.run | POST /api/admin/check | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.versions.rollback.run | POST /api/admin/versions/:v/rollback | admin | workspace | administration | ADMIN_REQUEST_LIMIT | administration |
| admin.sessions.delete | DELETE /api/admin/sessions/:principal | admin | workspace | administration | none | administration |
| audit.read | GET /api/audit | readAudit | workspace | read | none | local-edit |
| audit.export.read | GET /api/audit/export | readAudit | workspace | read | none | local-edit |
| auth.login.read | GET /auth/login | read | workspace | read | none | never |
| auth.callback.read | GET /auth/callback | read | workspace | read | none | never |
| auth.logout.run | POST /auth/logout | read | workspace | localWrite | none | never |
| auth.no.access.read | GET /auth/no-access | read | workspace | read | none | never |
| auth.signed.out.read | GET /auth/signed-out | read | workspace | read | none | never |
| auth.front.channel.logout.read | GET /auth/front-channel-logout | read | workspace | read | none | never |
| auth.github.start.read | GET /auth/github/start | read | workspace | read | none | never |
| auth.github.callback.read | GET /auth/github/callback | read | workspace | read | none | never |
| healthz.read | GET /healthz | read | workspace | read | none | never |
| readyz.read | GET /readyz | read | workspace | read | none | never |
| brand.read | GET /brand/:file | read | workspace | read | none | never |
| pages.read | GET/HEAD pages | read | workspace | read | none | never |

## Browser capabilities

| Capability | Status | Reason | Exposure | Source |
| --- | --- | --- | --- | --- |
| validation.shacl | needs-shared-implementation | The worker invokes a shared validator, but no reviewed server operation exposes it. | resources-prompts | src/app/validation/shacl.worker.ts |
| validation.editor | browser-only-by-design | Editor diagnostics depend on the current unsaved buffer and worker lifecycle. | never | src/app/editor/lint.worker.ts |
| lineage.assets | needs-shared-implementation | Asset ranking is implemented in the browser lineage model without a server operation. | later | src/app/odcs/lineage.ts |
| lineage.traversal | needs-shared-implementation | Browser lineage traversal has no reviewed server operation. | later | src/app/odcs/lineage-pierce.ts |
| graph.layout | browser-only-by-design | Node coordinates are presentation state for the browser canvas. | never | src/app/graph/layout.ts |
