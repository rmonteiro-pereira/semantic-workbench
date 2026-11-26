# Tool contract tables

Two tables that tests read, so the registry, the route table and this page cannot drift apart.
`docs/mcp.md` explains the endpoint for people who use it.

## Tools

Every tool is the twin of one route. The four hints are set independently and the server never relies
on a hint. `save_file` replaces bytes that may not be in Git yet, so it is destructive; `delete_file`
moves to the trash and is recoverable, so it is not. Idempotent is true for every write because a
repeat with the same arguments has no further effect: a conflict for the precondition-protected
tools, the original result for the receipt-backed ones. Open-world is false everywhere because
nothing reaches outside the workbench.

| Tool | Twin route | Action | readOnly | destructive | idempotent | openWorld | Retry class |
|------|------------|--------|----------|-------------|------------|-----------|-------------|
| `explain_metric` | `GET .../files/*/explain/:metric` | read | true | false | true | false | repeatable |
| `get_findings` | `GET .../files/*` | read | true | false | true | false | repeatable |
| `get_mapping_catalog` | `GET /api/agent/catalog` | read | true | false | true | false | repeatable |
| `get_mapping_context` | `GET /api/agent/context` | read | true | false | true | false | repeatable |
| `git_branches` | `GET .../git/branches` | history | true | false | true | false | repeatable |
| `git_diff` | `GET .../git/diff` | history | true | false | true | false | repeatable |
| `git_file_versions` | `GET .../git/versions` | history | true | false | true | false | repeatable |
| `git_log` | `GET .../git/log` | history | true | false | true | false | repeatable |
| `git_show` | `GET .../git/show` | history | true | false | true | false | repeatable |
| `git_status` | `GET .../git/status` | history | true | false | true | false | repeatable |
| `list_files` | `GET /api/documents` | read | true | false | true | false | repeatable |
| `list_projects` | `GET /api/projects` | read | true | false | true | false | repeatable |
| `list_trash` | `GET /api/trash` | read | true | false | true | false | repeatable |
| `plan_query` | `POST /api/agent/plan` | read | true | false | true | false | repeatable |
| `read_file` | `GET .../files/*` | read | true | false | true | false | repeatable |
| `validate_text` | `POST .../files/*/validate` (new) | edit | true | false | true | false | repeatable |
| `check_standard` | `POST .../compile/check` | read | true | false | true | false | repeatable |
| `compile_standard` | `POST .../compile` | export | true | false | true | false | repeatable |
| `create_file` | `PUT .../files/*` with null base | edit | false | false | true | false | precondition-protected |
| `save_file` | `PUT .../files/*` | edit | false | true | true | false | precondition-protected |
| `delete_file` | `DELETE .../files/*` | delete | false | false | true | false | receipt-backed |
| `restore_file` | `POST /api/trash/:entry/restore` | restoreOwn | false | false | true | false | receipt-backed |
| `git_commit` | `POST .../git/commit` | commit | false | false | true | false | receipt-backed |

Receipt keys are scoped to the person and connection, or to the single local capability
caller. Older receipts are local only. An unrelated caller's key is equivalent to an
unknown key. For the owner, the operation boundary rechecks current grants and scopes
on the original targets before returning a recorded result. Ended connections receive
the normal bearer refusal.

Usage counters (`SW_USAGE_COUNTERS=on`) count three of these tools, through their twin routes and with the origin `mcp`: `get_mapping_context` (`agent.context.read`), `plan_query` (`agent.plan`) and `explain_metric` (`metrics.explain`). No other tool is counted, including `get_mapping_catalog` and every file read. The counting is done by the operation boundary after the answer exists, so a tool cannot skip it or change the answer. `tests/usage/usage-mcp-tools.test.ts` drives the three tools through a reference client.

The same three tools carry published agent context and status flags: `get_mapping_context` in `aiContext` and in `governance` on each governed concept, `plan_query` in `governance` (`kind`, `name`, `status`, `replacedBy`, `reason`), and `explain_metric` in `conceptGovernance`. Each flag holds only `status`, `replacedBy` and `reason`. Owner, steward, classification and notes are never in an answer. `tests/mcp/agent-context-tools.test.ts` publishes the governed fixture project and checks each tool for every one of these fields by name.

An ontology split into a root and parts is still read and written one file at a time. `read_file`, `save_file`, `create_file` and `delete_file` treat a root or a part as an ordinary file, and no tool merges a set. A save to a root or a part is refused with "The ontology set could not be checked." when the caller cannot read every file of the set, as it is in the browser. `validate_text` checks the proposed text of that file alone and returns its single-file findings. For a root or a part it also returns `setNotChecked`, read with the same rule as the browser's file read (`GET /api/projects/:slug/files/*`): `true` when the caller cannot read every file of the saved set or its providers, so the set was not checked and an empty findings list does not mean the set passes. The notice describes the saved set, so a file not saved yet has none, and the set findings themselves stay in the browser. `tests/mcp/validate-set-notice.test.ts` compares the tool with the file read for a full and a partial reader. The five mesh operations, `mesh.graph`, `mesh.providers.list`, `mesh.dependencies.read`, `mesh.dependencies.update` and `mesh.dependents.read`, have no tool yet: their routes are listed below as a later increment.

A `git_commit` answer is `{ commit, branch, files }`, plus `movedFrom` when the commit left the default branch and `altered` (the paths whose committed bytes differ from the listed versions) when a hook or filter rewrote them. An altered commit is a success, so its receipt is kept.

## Route dispositions

Every row of `ROUTE_ACTIONS` in `src/server/auth/route-actions.ts` is an exposed tool, a named later
increment, or not an agent operation, with a reason. A test fails when a row of the route table is
missing here, when a row here no longer exists, or when a `tool:` entry names a tool that is not in
the table above. The static page fallback row is not an operation and is left out.

| Row | Disposition | Note |
|-----|-------------|------|
| `POST /api/mcp` | transport | mode-specific authentication; unaudited itself, each dispatched twin writes the one record |
| `GET /.well-known/oauth-protected-resource/api/mcp` | transport metadata | protected resource discovery |
| `GET /.well-known/oauth-protected-resource` | transport metadata | root discovery alias |
| `GET /.well-known/oauth-authorization-server` | transport metadata | authorization server discovery |
| `POST /oauth/token` | transport authorization | code, setup and refresh exchanges |
| `GET /oauth/authorize` | browser connection management | opens consent |
| `POST /oauth/consent` | browser connection management | consumes consent |
| `GET /oauth/setup` | browser connection management | opens setup |
| `POST /oauth/setup` | browser connection management | issues a setup credential |
| `GET /api/connections` | browser connection management | lists the person's connections |
| `DELETE /api/connections/:id` | browser connection management | revokes the person's connection |
| `GET /api/admin/connections` | browser administration | lists all connections |
| `DELETE /api/admin/connections/:id` | browser administration | revokes a connection |
| `GET /api/admin/programs` | browser administration | reads registrations |
| `PUT /api/admin/programs` | browser administration | saves reviewed registrations |
| `POST /api/admin/programs/preview` | browser administration | previews registration changes |
| `POST /api/projects/:slug/files/*/validate` | tool: validate_text | new twin; needs the right to edit that file |
| `POST /api/projects/:slug/item-addresses/resolve` | later: Remaining workspace and source-control operations | item addresses are adopted by a later increment |
| `POST /api/projects/:slug/item-addresses/reconcile/*` | later: Remaining workspace and source-control operations | item addresses are adopted by a later increment |
| `POST /api/projects/:slug/git/adopt` | later: Remaining workspace and source-control operations | publication needs the publish scope |
| `POST /api/projects/:slug/git/acknowledge-publication` | not an agent operation | dismisses a personal notice in the browser |
| `GET /api/preview/catalog` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `GET /api/preview/context` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `POST /api/preview/plan` | not an agent operation | browser authoring previews; protocol callers read the published snapshot |
| `GET /api/me` | not an agent operation | the endpoint already knows its caller |
| `GET /auth/style.css` | not an agent operation | sign-in, health and static pages are not agent operations |
| `GET /api/events` | later: Resources and prompts |  |
| `POST /api/telemetry/browser` | not an agent operation | browser error and timing reports |
| `GET /api/status` | not an agent operation | the endpoint answers or it does not |
| `GET /api/projects` | tool: list_projects |  |
| `GET /api/trash` | tool: list_trash |  |
| `GET /api/suggestions` | later: Remaining workspace and source-control operations |  |
| `GET /api/documents` | tool: list_files |  |
| `POST /api/projects` | later: Remaining workspace and source-control operations |  |
| `POST /api/import` | later: Remaining workspace and source-control operations |  |
| `POST /api/clear` | later: Remaining workspace and source-control operations | destroys the workspace; it needs an approval given in the browser |
| `POST /api/clone` | later: Remaining workspace and source-control operations | remote operation; needs the remote scope |
| `POST /api/documents` | later: Remaining workspace and source-control operations |  |
| `POST /api/examples/:name` | later: Remaining workspace and source-control operations |  |
| `PATCH /api/projects/:slug` | later: Remaining workspace and source-control operations |  |
| `DELETE /api/projects/:slug` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/move` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/import` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/export` | later: Remaining workspace and source-control operations | export leaves the workbench; needs its own scope |
| `POST /api/projects/:slug/save-batch` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/gitignore` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/metrics` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/delete-impact` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/metrics` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/people` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/metrics/preview` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/kpis` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/kpis/preview` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/files/*/explain/:metric` | tool: explain_metric |  |
| `GET /api/projects/:slug/files/*` | tool: read_file, get_findings |  |
| `PUT /api/projects/:slug/files/*` | tool: save_file, create_file |  |
| `DELETE /api/projects/:slug/files/*` | tool: delete_file |  |
| `GET /api/drafts` | later: Remaining workspace and source-control operations |  |
| `GET /api/drafts/:slug/*` | later: Remaining workspace and source-control operations |  |
| `PUT /api/drafts/:slug/*` | later: Remaining workspace and source-control operations |  |
| `DELETE /api/drafts/:slug/*` | later: Remaining workspace and source-control operations |  |
| `DELETE /api/trash` | later: Remaining workspace and source-control operations | purge is irreversible; it needs an approval given in the browser |
| `DELETE /api/trash/:entry` | later: Remaining workspace and source-control operations | purge is irreversible; it needs an approval given in the browser |
| `POST /api/trash/:entry/undo` | later: Remaining workspace and source-control operations | same effect as restore through another entry point |
| `POST /api/trash/:entry/restore` | tool: restore_file |  |
| `POST /api/suggestions/:id/accept` | later: Remaining workspace and source-control operations |  |
| `POST /api/suggestions/:id/reject` | later: Remaining workspace and source-control operations |  |
| `GET /api/git/credential-helper` | not an agent operation | describes machine credential configuration; credentials never cross the tool boundary |
| `GET /api/projects/:slug/git/status` | tool: git_status |  |
| `GET /api/projects/:slug/git/diff` | tool: git_diff |  |
| `GET /api/projects/:slug/git/branches` | tool: git_branches |  |
| `GET /api/projects/:slug/git/folder` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/git/log` | tool: git_log |  |
| `GET /api/projects/:slug/git/versions` | tool: git_file_versions |  |
| `GET /api/projects/:slug/git/show` | tool: git_show |  |
| `GET /api/projects/:slug/git/identity` | later: Remaining workspace and source-control operations |  |
| `PUT /api/projects/:slug/git/identity` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/stage` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/unstage` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/commit` | tool: git_commit | push never sent, so a commit on a `work/` or `proposal/` branch stays in the workbench as that rule requires |
| `POST /api/projects/:slug/git/revert` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/switch` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/fetch` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/pull` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/sync` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/push` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/cancel` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/publish` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/pull-default` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/git/push-default` | later: Remaining workspace and source-control operations |  |
| `PUT /api/projects/:slug/git/remote` | later: Remaining workspace and source-control operations |  |
| `DELETE /api/projects/:slug/git/remote` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/usage` | later: Remaining workspace and source-control operations | a person reads usage counts in the browser; a tool for them is a later increment |
| `GET /api/mesh` | later: Remaining workspace and source-control operations | the published mesh graph; agent access is a later increment |
| `GET /api/mesh/providers` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/dependencies` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/dependencies/update` | later: Remaining workspace and source-control operations | writes the dependency manifest after a person reviews it |
| `GET /api/projects/:slug/dependents` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/compile/check` | tool: check_standard |  |
| `POST /api/projects/:slug/compile` | tool: compile_standard |  |
| `GET /api/projects/:slug/compile/bundle` | not an agent operation | a binary download for the browser; agents page `compile_standard` |
| `POST /api/projects/:slug/compile/convert` | later: Remaining workspace and source-control operations | rewrites a source file; not an agent operation yet |
| `GET /api/projects/:slug/item-diff` | not an agent operation | a browser display aid; agents read the published snapshot |
| `GET /api/projects/:slug/proposals` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/proposals/:id` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/proposals/:id/diff` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/proposals` | later: Remaining workspace and source-control operations | proposals are a person's work; agent access is a later increment |
| `POST /api/projects/:slug/proposals/:id/work` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/proposals/:id/synchronize` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/proposals/:id/contribute` | later: Remaining workspace and source-control operations |  |
| `GET /api/projects/:slug/proposals/:id/promotion-check` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/proposals/:id/promote` | later: Remaining workspace and source-control operations | promotion publishes, so it stays with a person |
| `POST /api/projects/:slug/proposals/:id/close` | later: Remaining workspace and source-control operations |  |
| `POST /api/projects/:slug/proposals/:id/restore` | later: Remaining workspace and source-control operations |  |
| `PUT /api/projects/:slug/git/folder` | later: Remaining workspace and source-control operations |  |
| `POST /api/clone/:operation/cancel` | later: Remaining workspace and source-control operations |  |
| `GET /api/repos/:repo/project-candidates` | later: Remaining workspace and source-control operations |  |
| `PUT /api/repos/:repo/projects` | later: Remaining workspace and source-control operations |  |
| `GET /api/agent/projects` | tool: list_projects | the application API shape; the tool lists what the person can read |
| `GET /api/agent/catalog` | tool: get_mapping_catalog |  |
| `GET /api/agent/context` | tool: get_mapping_context |  |
| `POST /api/agent/plan` | tool: plan_query |  |
| `GET /api/documents/:id/grouping` | later: Remaining workspace and source-control operations |  |
| `PUT /api/documents/:id/grouping` | later: Remaining workspace and source-control operations |  |
| `GET /api/admin/users` | later: Administration |  |
| `GET /api/admin/roles` | later: Administration |  |
| `GET /api/admin/grants` | later: Administration |  |
| `GET /api/admin/projects` | later: Administration |  |
| `GET /api/admin/agents` | later: Administration |  |
| `GET /api/admin/settings` | later: Administration |  |
| `GET /api/admin/policies` | later: Administration |  |
| `GET /api/admin/versions` | later: Administration |  |
| `GET /api/admin/sessions` | later: Administration |  |
| `GET /api/admin/provider` | later: Administration |  |
| `GET /api/admin/who-can` | later: Administration |  |
| `GET /api/admin/groups/:id` | later: Administration |  |
| `GET /api/admin/versions/:v/diff` | later: Administration |  |
| `PUT /api/admin/roles` | later: Administration |  |
| `PUT /api/admin/grants` | later: Administration |  |
| `PUT /api/admin/projects` | later: Administration |  |
| `PUT /api/admin/agents` | later: Administration |  |
| `PUT /api/admin/settings` | later: Administration |  |
| `PUT /api/admin/policies` | later: Administration |  |
| `POST /api/admin/users/:id/deactivate` | later: Administration |  |
| `POST /api/admin/users/:id/reactivate` | later: Administration |  |
| `POST /api/admin/policies/validate` | later: Administration |  |
| `POST /api/admin/policies/template` | later: Administration |  |
| `POST /api/admin/policies/dry-run` | later: Administration |  |
| `POST /api/admin/check` | later: Administration |  |
| `POST /api/admin/versions/:v/rollback` | later: Administration |  |
| `DELETE /api/admin/sessions/:principal` | later: Administration |  |
| `GET /api/audit` | later: Administration |  |
| `GET /api/audit/export` | later: Administration |  |
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
| `POST /api/acp/sessions` | browser agent panel | creates a conversation and a relay setup credential in server mode |
| `GET /api/acp/sessions/:id/events` | browser agent panel | streams the person's conversation events |
| `POST /api/acp/sessions/:id/prompt` | browser agent panel | sends a prompt to the connected agent |
| `POST /api/acp/sessions/:id/cancel` | browser agent panel | cancels the current turn and pending questions |
| `POST /api/acp/sessions/:id/questions/:question` | browser agent panel | answers a permission question without widening scope |
| `DELETE /api/acp/sessions/:id` | browser agent panel | ends the person's conversation |
| `POST /api/acp/relay/:session/hello` | ACP transport | authenticates the relay, authorizes with origin acp and spends the session code |
| `POST /api/acp/relay/:session/frames` | ACP transport | authenticates and authorizes numbered agent frames with origin acp |
| `GET /api/acp/relay/:session/stream` | ACP transport | authenticates and authorizes the relay event stream with origin acp |
| `POST /api/acp/relay/:session/bye` | ACP transport | authenticates and authorizes the relay ending with origin acp |
