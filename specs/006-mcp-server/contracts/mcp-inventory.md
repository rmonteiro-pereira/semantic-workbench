# Contract: route inventory

Every row of `ROUTE_ACTIONS` in `src/server/auth/route-actions.ts` maps to an exposed tool, a named
later increment, or a reason it is not an agent operation (decision M17). A test reads the route
table and this file and fails when a row is missing here, when a row here no longer exists, or when
a `tool:` entry names a tool that is not in [mcp-tools.md](./mcp-tools.md). The static page fallback
row is not an operation and is excluded by that test. Rows added by this feature are listed first.

| Row | Disposition | Note |
|-----|-------------|------|
| `POST /api/mcp` | transport | local mode only; unaudited itself, each dispatched twin writes the one record |
| `POST /api/projects/:slug/files/*/validate` | tool: validate_text | new twin; needs the right to edit that file |
| `POST /api/projects/:slug/item-addresses/resolve` | later: Remaining workspace and source-control operations | item locators (009) are adopted by a later increment |
| `POST /api/projects/:slug/item-addresses/reconcile/*` | later: Remaining workspace and source-control operations | item locators (009) are adopted by a later increment |
| `POST /api/projects/:slug/git/adopt` | later: Remaining workspace and source-control operations | publication (008) needs the publish scope |
| `POST /api/projects/:slug/git/acknowledge-publication` | not an agent operation | dismisses a personal notice in the browser |
| `GET /api/preview/catalog` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `GET /api/preview/context` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `POST /api/preview/plan` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `GET /api/me` | not an agent operation | the endpoint already knows its caller |
| `GET /auth/style.css` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /api/events` | later: Resources and prompts | M15, M16 |
| `POST /api/telemetry/browser` | not an agent operation | browser error and timing reports |
| `GET /api/status` | not an agent operation | readiness appears inside tool results as not_ready |
| `GET /api/projects` | tool: list_projects |  |
| `GET /api/trash` | tool: list_trash |  |
| `GET /api/suggestions` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/documents` | tool: list_files |  |
| `POST /api/projects` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/import` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/clear` | later: Remaining workspace and source-control operations | destroys the workspace; the browser-approval rule of M6 applies |
| `POST /api/clone` | later: Remaining workspace and source-control operations | remote operation; needs the remote scope (M9) |
| `POST /api/documents` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/examples/:name` | later: Remaining workspace and source-control operations | M17, M13 |
| `PATCH /api/projects/:slug` | later: Remaining workspace and source-control operations | M17, M13 |
| `DELETE /api/projects/:slug` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/move` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/import` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/projects/:slug/export` | later: Remaining workspace and source-control operations | export leaves the workbench; needs its own scope |
| `POST /api/projects/:slug/save-batch` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/gitignore` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/projects/:slug/metrics` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/projects/:slug/delete-impact` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/metrics` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/projects/:slug/people` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/metrics/preview` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/kpis` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/projects/:slug/kpis/preview` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/projects/:slug/files/*/explain/:metric` | tool: explain_metric |  |
| `GET /api/projects/:slug/files/*` | tool: read_file, get_findings |  |
| `PUT /api/projects/:slug/files/*` | tool: save_file, create_file |  |
| `DELETE /api/projects/:slug/files/*` | tool: delete_file |  |
| `GET /api/drafts` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/drafts/:slug/*` | later: Remaining workspace and source-control operations | M17, M13 |
| `PUT /api/drafts/:slug/*` | later: Remaining workspace and source-control operations | M17, M13 |
| `DELETE /api/drafts/:slug/*` | later: Remaining workspace and source-control operations | M17, M13 |
| `DELETE /api/trash` | later: Remaining workspace and source-control operations | purge is irreversible; the browser-approval rule of M6 applies |
| `DELETE /api/trash/:entry` | later: Remaining workspace and source-control operations | purge is irreversible; the browser-approval rule of M6 applies |
| `POST /api/trash/:entry/undo` | later: Remaining workspace and source-control operations | same effect as restore through another entry point |
| `POST /api/trash/:entry/restore` | tool: restore_file |  |
| `POST /api/suggestions/:id/accept` | later: Remaining workspace and source-control operations | M17, M13 |
| `POST /api/suggestions/:id/reject` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/git/credential-helper` | not an agent operation | describes machine credential configuration; credentials never cross the tool boundary |
| `GET /api/projects/:slug/git/status` | tool: git_status |  |
| `GET /api/projects/:slug/git/diff` | tool: git_diff |  |
| `GET /api/projects/:slug/git/branches` | tool: git_branches |  |
| `GET /api/projects/:slug/git/folder` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `GET /api/projects/:slug/git/log` | tool: git_log |  |
| `GET /api/projects/:slug/git/versions` | tool: git_file_versions |  |
| `GET /api/projects/:slug/git/show` | tool: git_show |  |
| `GET /api/projects/:slug/git/identity` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `PUT /api/projects/:slug/git/identity` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/stage` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/unstage` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/commit` | tool: git_commit | push never sent |
| `POST /api/projects/:slug/git/revert` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/switch` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/fetch` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/pull` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/sync` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/push` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/cancel` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/publish` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/pull-default` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/projects/:slug/git/push-default` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `PUT /api/projects/:slug/git/remote` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `DELETE /api/projects/:slug/git/remote` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `PUT /api/projects/:slug/git/folder` | later: Remaining workspace and source-control operations | M9, M12, M17 |
| `POST /api/clone/:operation/cancel` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/repos/:repo/project-candidates` | later: Remaining workspace and source-control operations | M17, M13 |
| `PUT /api/repos/:repo/projects` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/agent/projects` | tool: list_projects | the application API shape; the tool lists what the person can read |
| `GET /api/agent/catalog` | tool: get_mapping_catalog |  |
| `GET /api/agent/context` | tool: get_mapping_context |  |
| `POST /api/agent/plan` | tool: plan_query |  |
| `GET /api/documents/:id/grouping` | later: Remaining workspace and source-control operations | M17, M13 |
| `PUT /api/documents/:id/grouping` | later: Remaining workspace and source-control operations | M17, M13 |
| `GET /api/admin/users` | later: Administration | M6 |
| `GET /api/admin/roles` | later: Administration | M6 |
| `GET /api/admin/grants` | later: Administration | M6 |
| `GET /api/admin/projects` | later: Administration | M6 |
| `GET /api/admin/agents` | later: Administration | M6 |
| `GET /api/admin/settings` | later: Administration | M6 |
| `GET /api/admin/policies` | later: Administration | M6 |
| `GET /api/admin/versions` | later: Administration | M6 |
| `GET /api/admin/sessions` | later: Administration | M6 |
| `GET /api/admin/provider` | later: Administration | M6 |
| `GET /api/admin/who-can` | later: Administration | M6 |
| `GET /api/admin/groups/:id` | later: Administration | M6 |
| `GET /api/admin/versions/:v/diff` | later: Administration | M6 |
| `PUT /api/admin/roles` | later: Administration | M6 |
| `PUT /api/admin/grants` | later: Administration | M6 |
| `PUT /api/admin/projects` | later: Administration | M6 |
| `PUT /api/admin/agents` | later: Administration | M6 |
| `PUT /api/admin/settings` | later: Administration | M6 |
| `PUT /api/admin/policies` | later: Administration | M6 |
| `POST /api/admin/users/:id/deactivate` | later: Administration | M6 |
| `POST /api/admin/users/:id/reactivate` | later: Administration | M6 |
| `POST /api/admin/policies/validate` | later: Administration | M6 |
| `POST /api/admin/policies/template` | later: Administration | M6 |
| `POST /api/admin/policies/dry-run` | later: Administration | M6 |
| `POST /api/admin/check` | later: Administration | M6 |
| `POST /api/admin/versions/:v/rollback` | later: Administration | M6 |
| `DELETE /api/admin/sessions/:principal` | later: Administration | M6 |
| `GET /api/audit` | later: Administration | M6 |
| `GET /api/audit/export` | later: Administration | M6 |
| `GET /auth/login` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/callback` | not an agent operation | sign-in, health and static pages are not agent operations |
| `POST /auth/logout` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/no-access` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/signed-out` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/front-channel-logout` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/github/start` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /auth/github/callback` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /healthz` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /readyz` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /brand/:file` | not an agent operation | sign-in, health and static pages are not agent operations |

Totals at the time of writing: 19 existing rows give a tool, 83 are later increments and 16 are not
agent operations. The test prints the counts, and the documentation quotes the printed values.
