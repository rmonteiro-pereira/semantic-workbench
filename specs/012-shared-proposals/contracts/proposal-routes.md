# Contract: proposal routes

All routes are project-scoped, in server mode only. Each is a row in `src/server/auth/route-actions.ts`,
an entry in `policies/operation-inventory.json`, and runs through the operation boundary. `:slug` is any
project of the repository; the proposal is found by `:id` inside that project's repository.

| Operation id | Route | Row action | Handler checks | Effects | Body limit |
| --- | --- | --- | --- | --- | --- |
| proposals.list | GET /api/projects/:slug/proposals | read | none (filtered by reader) | read | none |
| proposals.read | GET /api/projects/:slug/proposals/:id | read | none (filtered by reader) | read | none |
| proposals.diff | GET /api/projects/:slug/proposals/:id/diff | history | none (filtered by reader) | read | none |
| proposals.create | POST /api/projects/:slug/proposals | branch | authorizeProposal | localWrite | GIT_REQUEST_LIMIT |
| proposals.work | POST /api/projects/:slug/proposals/:id/work | branch | authorizeProposal, authorizeCheckout | localWrite | GIT_REQUEST_LIMIT |
| proposals.synchronize | POST /api/projects/:slug/proposals/:id/synchronize | pull | authorizeProposal | localWrite | GIT_REQUEST_LIMIT |
| proposals.contribute | POST /api/projects/:slug/proposals/:id/contribute | commit | authorizeProposal, authorizeGitPaths | localWrite | GIT_REQUEST_LIMIT |
| proposals.check | GET /api/projects/:slug/proposals/:id/promotion-check | publish | authorizeProposal | read | none |
| proposals.promote | POST /api/projects/:slug/proposals/:id/promote | publish | authorizeProposal, authorizePublish | publish | GIT_REQUEST_LIMIT |
| proposals.close | POST /api/projects/:slug/proposals/:id/close | publish | authorizeProposal | localWrite | GIT_REQUEST_LIMIT |
| proposals.restore | POST /api/projects/:slug/proposals/:id/restore | publish | authorizeProposal | localWrite | GIT_REQUEST_LIMIT |

Inventory exposure for all rows: increment `workspace-scm`, reason "branch operations are offered to
agents by the later workspace operations increment".

## Requests and answers

Errors use the existing JSON error shape. A proposal the reader may not see answers 404 with the same
body as a missing one.

- **create** body `{ name, projects[] }` answers 201 with the proposal view. Refusals: 400 name or set
  invalid, 403 authority, 409 limit reached or no published commit.
- **work** body `{ expectedBranch, expectedHead }` (the person's current branch and HEAD as the client
  last saw them) answers 200 `{ branch, head }`. Refuses 409 on a dirty copy or a changed branch or HEAD.
- **synchronize** body `{ expectedBranch, expectedHead }` answers 200 `{ merged: true, head }` or
  200 `{ merged: false, conflicted: [paths] }` leaving the merge on the branch.
- **contribute** body `{ expectedTip, branchHead }` answers 200 with the new view. Refusals: 409
  `stale-tip`, 409 `not-descendant`, 403 `outside-declared-projects` naming only readable projects,
  403 authority or guard.
- **check** answers 200 with the promotion check result (data-model.md).
- **promote** body `{ expectedTip }` answers 200 `{ published, previous, commit }`. Refusals as in
  check, as 403 or 409 with the same reasons.
- **close** and **restore** answer 200 with the view; **restore** may answer 409 `name-taken` or `limit`.
- **diff** query `path` and optional `project`; answers the file at the proposal base and at the tip,
  bounded like the existing source-control diff, for one readable file.

## Audit

One record per mutating call, with the operation id as `tool`, `proposal`, `projects` and `commits`.
Reads write no record, as for other HTTP reads.
