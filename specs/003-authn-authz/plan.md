# Implementation Plan: Sign-In, Roles and Access Control for Local and Server Modes (v0.4.0)

**Branch**: `003-authn-authz` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-authn-authz/spec.md`

> **Builds on 002.** This branch was created from `origin/002-lineage-and-ux` (at `c7ed432`,
> phases 1–5 of 002 done). Implementation of 003 MUST NOT start until 002 is merged into `main`;
> then rebase `003-authn-authz` onto `main`, re-run the route inventory
> (`tests/auth/route-actions.ts` fails on any unmapped route) and update
> [contracts/http-api.md](./contracts/http-api.md) if 002 changed or dropped planned routes
> (identity, credential helper, clone, repository projects, metrics aliases).

## Summary

v0.4.0 adds a server mode for teams next to the unchanged local mode. The Bun server becomes a
confidential OpenID Connect client (`openid-client`, code + PKCE) holding encrypted sessions and
tokens; the browser holds only an HttpOnly cookie. There is no workbench sign-in screen: an
unauthenticated page goes straight to the provider, and the workbench serves only a **No access**
page and a signed-out confirmation. Roles come only from access grants that Admins make in the
Admin panel, to Entra groups (by object ID, display name resolved) or to people by verified
e-mail address, with a workspace, domain or project scope; Entra app roles are not used. Admins
can also create custom roles next to the four built-in ones; roles compile to Cedar policies and
grants become entity relations (research R22, R23). Every route and server-side derivation calls one
decision boundary (`authorize`/`filter`) backed by Cedar policies evaluated in-process
(`@cedar-policy/cedar-wasm/nodejs`). Read access is per project and path; the server sends only
readable files, filters events, history, trash, drafts, suggestions and agent context, and
answers 404 for hidden resources. Guards compare parsed documents before and after each write
for metric status and classification rules. In server mode each Editor gets a Git worktree per
repository on a personal branch, commits carry the signed-in author, and remote operations use the
person's delegated token (Entra on-behalf-of for Azure DevOps, GitHub user token). An Admin panel
(dialogs) manages access grants, custom roles, project access, policies (structured and raw, dry
run, versioned in an administration Git repository with rollback), an access simulator, the audit
log and settings. A multi-stage, non-root container image runs both modes (local mode through
host networking), is built right after the foundations with a Docker Compose setup (local profile;
`keycloak` compatibility profile), and every later phase is verified against it. The target uses
Microsoft Entra ID only: automated sign-in tests, in the local gate and in the target pipeline,
run against a mock OpenID provider shipped in the repository (Entra-shaped claims, overage, a
Graph stand-in); Keycloak is a compatibility suite on the owner's machine. The
GitHub repository runs nothing automatically: the owner runs the whole quality gate, the image
build, the Trivy scan and the SPDX bill of materials locally through package scripts
(`ci:validate`, `image:build`, `image:scan`, `image:sbom`, `test:container`). The CI/CD pipeline
is a deliverable for the target environment: a multi-stage Azure DevOps `azure-pipelines.yml`
(Validate, Image, Deploy with smoke test and automatic rollback, plus a manual rollback pipeline)
that only calls those scripts, pushes to the target's Azure Container Registry and deploys version
tags to Azure Container Apps (one replica, Azure Files data root, Key Vault, managed identity)
through Azure Resource Manager service connections with workload identity federation, gated by an
Azure DevOps environment with approvals and checks. Target values are parameters and one variable
group; the definition is checked locally by a schema and rules lint and a dry run. Azure resources
and Azure DevOps items are created by hand from a guide; no infrastructure as code. Releases reach
the target's Azure Repos mirror by a documented hand-over (push, or Git bundle); the real trial
deployment is an owner acceptance step run from a runbook, and the implementation is done when
`pipeline:lint`, `pipeline:dry-run` and the container suites pass locally ([research.md](./research.md)
R6, R14, R17–R21).

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Bun 1.4 (API, tests), Vite+ 1.2 (build)

**Primary Dependencies**: existing (`yaml`, `ajv`, `node-sql-parser`, CodeMirror, React Flow,
ELK); **new, server only**: `openid-client` 6.8.8 (MIT, 236 KB + `oauth4webapi` 332 KB),
`jose` 6.2.13 (MIT, 412 KB), `@cedar-policy/cedar-wasm` 4.14.0 (Apache-2.0, 13 MB on disk, 4.2 MB
WASM loaded; never bundled for the browser). All three verified under Bun 1.4.0 (research R1–R3).
Network: only the identity provider (discovery, JWKS, token, end-session, Graph
`checkMemberGroups` for overage and `GET /groups/{id}` for granted group names; on Azure the
platform managed-identity endpoint for the Entra client assertion) and Git hosts on explicit action
— allowed by constitution 3.1.0 Principle I. Machine Git ≥ 2.40.

**Storage**: unchanged project layout plus `data/worktrees/`, `data/admin/` (Git), per-person
state under `data/state/users/`, encrypted sessions, append-only audit JSONL, instance lock
([data-model.md](./data-model.md)). Cache optionally on container local disk (`SW_CACHE_DIR`).

**Testing**: `bun test` (unit + HTTP on temp `DATA_DIR` with the mock OpenID provider built on
`jose`, in process), authorization test matrix (`tests/auth/matrix.test.ts`), Playwright suites
`test:auth` (mock OpenID provider on loopback, Entra shape), `test:admin`, `test:two-editors`;
Keycloak compatibility suite `test:auth:keycloak` (Keycloak 26 container, owner's machine, outside
the gate and the pipeline); mutation suite
additions; container checks (`test:container`: the suites of `scripts/container-suites.ts`
against the image); pipeline tests (`tests/pipeline/`: pipeline rules against the pinned Azure
Pipelines schema, deploy, version check and rollback logic with a fake Azure client, smoke test,
dry run). Local build: `ci:validate`, `image:*`, `pipeline:lint`, `pipeline:dry-run` (Docker or
Podman, Trivy binary or pinned Trivy image). CI/CD for the target: Azure DevOps Pipelines
(`azure-pipelines.yml`, `azure-pipelines-rollback.yml`, templates in `deploy/azure-devops/`), Azure
CLI; nothing runs on GitHub; no new runtime dependency.

**Target Platform**: local: workstation (Linux incl. WSL2) on loopback, directly or as a container
with host networking; server: Linux container on Azure Container Apps (App Service alternative,
not covered by the pipeline), one replica, HTTPS ingress; build and test: the owner's machine;
pipeline: the target's Azure DevOps Linux agents with Docker (`ubuntu-latest` by default).

**Project Type**: web application (`src/` frontend, `server/` Bun API).

**Performance Goals**: filtering ≤ 150 ms on the project listing and ≤ 10% on full load for
5,000 files / 20 projects (SC-006; preparsed Cedar decision ≈ 0.07 ms, memoised per rule class);
sign-in ≤ 5 s against the mock provider and local Keycloak (SC-005); container ready ≤ 30 s on the examples (SC-009).

**Constraints**: constitution 3.1.0; byte-exact files (no redaction); nothing executed; tokens
never in the browser; single instance per data root; no plain-text credentials; local mode
unchanged.

**Scale/Scope**: teams of tens of people, tens of repositories, tens of grants and custom roles;
10 user stories, 100 FRs, 19 success criteria; 66 routes in the matrix (57 implemented + 9 planned
by 002) plus about 30 new.

No NEEDS CLARIFICATION remain: owner decisions are binding; OP-1 to OP-5 resolved with the
recommended defaults and confirmed by the owner; OP-8 (host networking for local mode in a
container, Docker Desktop setting documented) accepted by the owner; the former OP-6 (registry)
and OP-7 (GitHub approval gate) are withdrawn by the decision to run nothing on GitHub and deliver
an Azure DevOps pipeline (spec Clarifications); OP-9 (Entra only on the target, Keycloak as a
local compatibility suite, mock OpenID provider in the pipeline), OP-10 (trial run by the owner
from a runbook) and OP-11 (Azure Repos mirror, release hand-over) are decided by the owner;
OP-12 (no sign-in screen), OP-13 (Admin-panel grants by Entra group or e-mail as the only role
source, no app roles) and OP-14 (custom roles with members by group or e-mail) are decided by the
owner.

## Constitution Check (v3.1.0)

*Gate before Phase 0 and re-checked after Phase 1 design.*

| Principle | How the plan complies | Pre | Post |
| --- | --- | --- | --- |
| I. Local and Server Modes | `SW_MODE` selects the mode. Local: loopback binding enforced (refuses other hosts), origin/host checks kept, implicit Admin through the same boundary, machine credentials. Server: OIDC code + PKCE confidential client, `__Host-` HttpOnly cookie, tokens server-side, bearer only on `/api/agent/*`, refuses to start without complete config and valid policies, frontend and API on one origin. Outbound: provider endpoints (incl. Graph `checkMemberGroups` and `GET /groups/{id}` for the groups named in grants and restricted paths, as Principle I of 3.0.1 allows; on-behalf-of token endpoint) and Git hosts on explicit action; delegated credentials via `GIT_ASKPASS` per command, never in Git config, sessions encrypted. Remote change and clone are Admin with host allow-list. Repositories only under `data/projects/`, `data/worktrees/`, `data/admin/`. Server never sends unreadable files, paths, events or counts. Container: local mode keeps loopback through host networking (OP-8, no exception needed); server mode binds the container interface as allowed; data root is the mounted volume. The local scripts and the target pipeline add no runtime network call | ✅ | ✅ |
| II. Byte-Exact Source Preservation | Files are sent whole or not at all; no redaction. Metric demotion to `proposed` uses the existing item-level edit (only the `status` scalar changes). Admin configuration files are written byte-exact through the same atomic save | ✅ | ✅ |
| III. One Validation Rule Set | Guards reuse the shared parsers from `src/`; the browser uses the same guard module to disable controls; access JSON validated with a pinned application schema through the same Ajv setup | ✅ | ✅ |
| IV. Atomic, Hash-Checked File Persistence | Saves unchanged (hash-checked, atomic) in each working copy; per-person drafts/views/suggestion state; trash entries record `owner` and keep unpublished work on project delete (journaled); sessions and users state atomic; audit append-only with hash chain; access configuration in `data/admin/` Git, one commit per change. Git queue keyed by base repository covers all worktrees; argument arrays, prompts off, timeouts; `core.autocrlf=false` and (SMB) `core.filemode=false` | ✅ | ✅ |
| V. Pinned Official Standards | No standard schema changes; new application schema `schemas/semantic-workbench-access-v1.json` pinned and labelled; classification level ordering labelled as an application reading of ODCS free text | ✅ | ✅ |
| VI. Verification Gate | Unit, matrix, browser suites per story; geometry checks for Admin dialogs and header menu. New mutants: decision ignores domain; filter returns unfiltered list; 404 replaced by 403 (existence leak); SSE send skips filter; replay skips filter; draft served to non-owner; trash lists others' entries; git show ignores path rule; agent context falls back to unreadable project; bearer accepted outside agent routes; cookie without HttpOnly/Secure; CSRF header not required; ID-token nonce unchecked; `tid` unchecked; overage failure grants membership; unverified e-mail (or guest UPN) matches an e-mail grant; e-mail compared case-sensitively; provider app role grants a role; signed-in person without a grant admitted; workspace grant reaches a project without a domain; custom role accepts the `admin` action; built-in role deleted; custom role in use deleted without confirmation; custom role condition dropped by the compiler; unauthenticated page served a workbench page instead of the provider redirect; signed-out page starts a sign-in; self-approval allowed; approved metric edit not demoted; classification change allowed to Editor; guard skipped in save-batch/pull/revert; push to protected branch by Editor; publish not fast-forward; commit author not principal; credential written to `.git/config`; remote change by non-Admin; last-Admin guard off; invalid policy activated; deactivated principal allowed; audit entry missing for denial; second instance not refused; hand-over serves before the lock is taken; readiness before recovery; smoke test ignores a version mismatch; smoke test accepts an unauthenticated 200; rollback skipped on smoke failure; preflight accepts more than one replica; version check accepts a tag older than the last deployed version; pipeline lint accepts a step that is not a package script; pipeline lint accepts a Keycloak reference; server accepts an `http://` issuer with a non-loopback public URL; server accepts a directory URL other than Microsoft Graph. `bun run ci:validate` runs the whole gate on the owner's machine (its `container` step reruns the browser suites against the image) and the target pipeline's Validate and Image stages call the same steps | ✅ | ✅ |
| VII. Honest Claims | README: both modes, configuration, Entra (primary, the target's provider) and Keycloak (compatibility) guides, what the mock OpenID provider does and does not cover, role matrix and what each role sees, outbound calls, delegated credentials, single-instance limit and scale path, the documented residual exposure of commit messages; container and Compose use (Docker Desktop host networking setting); the local build scripts; the Azure DevOps pipeline, the Azure resources and Azure DevOps items the target sets up by hand, the release hand-over to the mirror; the trial is reported as owner acceptance, not claimed before the owner's report; counts from tests | ✅ | ✅ |
| VIII. Readable Code | New modules are named after the domain (sign-in, sessions, access grants, roles, audit), start with a short header, carry JSDoc on exports and keep functions and components small; Oxfmt layout, Oxlint and the comment-ID check run in `bun --bun run check` and in the pipeline's Validate stage; test names are plain sentences | ✅ | ✅ |

Technical Constraints: one authorization boundary (`server/auth/authorize.ts`) used by every
route (enforced by the route→action table test); Cedar evaluated in-process; single instance per
data root (`instance.lock`; during a revision hand-over the waiting instance serves only health
endpoints, so one instance at most serves the data root, FR-123); new dependencies justified
above (R1–R3), server only; the container, the local scripts and the pipeline add no runtime
dependency; nothing runs automatically on the GitHub repository (FR-130).

## Project Structure

### Documentation (this feature)

```text
specs/003-authn-authz/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── policy-model.md
│   ├── sse-events.md
│   ├── audit-log.md
│   ├── configuration.md
│   ├── delivery-pipeline.md
│   └── ui-contracts.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── index.ts                      # mode selection, binding rules, static dist/ when SW_SERVE_STATIC=1, instance lock
├── handler.ts                    # authentication middleware, CSRF, route → action, 401/403/404 mapping
├── config.ts                     # new: environment parsing and validation (contracts/configuration.md)
├── auth/                         # new
│   ├── oidc.ts                   # openid-client: discovery, login, callback, refresh, logout
│   ├── sessions.ts               # session store, AES-GCM persistence, expiry, end-session
│   ├── principal.ts              # claim normalisation (Entra, Keycloak, generic), verified address
│   ├── directory.ts              # Microsoft Graph: overage (checkMemberGroups), group display names
│   ├── grants.ts                 # pure: match grants by group or verified e-mail, scope expansion
│   ├── role-compiler.ts          # pure: built-in and custom roles → Cedar policies, holders schema
│   ├── access-admin.ts           # roles and grants: validate, compile, delete-in-use confirmation
│   ├── policies.ts               # Admin rules: list, validate, templates → Cedar text
│   ├── bearer.ts                 # jose JWKS validation for agent clients
│   ├── authorize.ts              # decision boundary: authorize(), filter(), AccessView, memo
│   ├── cedar.ts                  # Cedar WASM loader, preparse, entity builder (User/Group/Email/RoleHolder)
│   ├── guards.ts                 # before/after diff of guarded pointers (shared parsers)
│   ├── audit.ts                  # JSONL append, hash chain, stdout mirror, retention, query/export
│   ├── admin-repo.ts             # data/admin Git repository: load, validate, commit, history, rollback
│   ├── admin-guard.ts            # last-Admin guard, bootstrap Admins
│   ├── dry-run.ts                # matrix + audit snapshot replay
│   └── remote-credentials.ts     # OBO (Azure DevOps), GitHub user tokens, askpass env
├── bin/sw-askpass                # new: prints username/token from its env (no storage)
├── projects/
│   ├── worktrees.ts              # new: per-person copies, personal branches, publish, pull-default, idle release
│   ├── workspace.ts              # documentsFor(view), per-copy scanning, owner on trash
│   ├── state.ts                  # per-person drafts/views/suggestions; users registry
│   ├── events.ts                 # tagged events, per-connection filter, access/published events
│   ├── git.ts, scm.ts, trash.ts, cache.ts (copy-aware keys, SW_CACHE_DIR)
├── routes/{auth.ts (redirect, callback, logout, No access, Signed out, error pages),
│           me.ts,admin.ts,audit.ts,health.ts, existing routes wrapped}
policies/{schema.cedarschema,baseline.cedar,builtin-roles.json,matrix-cases.json}
schemas/semantic-workbench-access-v1.json
src/
├── auth/{useMe.ts,can.ts,guards-client.ts}   # /api/me, capability checks, shared guard use
├── admin/{AdminLauncher.tsx,UsersDialog.tsx,RolesAccessDialog.tsx,GrantForm.tsx,RoleEditor.tsx,
│          PoliciesDialog.tsx,PolicyEditor.tsx,AccessCheckDialog.tsx,ProjectAccessDialog.tsx,
│          AuditDialog.tsx,SettingsDialog.tsx,VersionHistory.tsx}
├── projects/{api.ts (X-SW-Request, 401 → reload, which redirects to the provider), Sidebar.tsx (role badge, hidden count)}
├── scm/{BranchPicker.tsx (in use by), SourceControl.tsx (Publish, Pull from default), ConnectAccount.tsx}
├── metrics/ (Approve/Deprecate actions, unverified owner), odcs/PropertyEditors.tsx (guard-aware)
└── main.tsx (person menu, Admin entry, hide/disable by capability)
tests/auth/ (principal, grants, role-compiler, directory, auth-pages, sessions, bearer, authorize, filter-perf, guards, worktrees, admin-repo, audit, matrix, route-actions)
tests/helpers/mock-oidc.ts          # mock OpenID provider (Entra/Keycloak/generic shapes, Graph stand-in)
tests/fixtures/{auth-workspace/, keycloak/realm.json}
scripts/{mock-oidc.ts (loopback runner),auth-browser-check.ts,auth-keycloak-check.ts (compatibility),admin-browser-check.ts,two-editors-check.ts; mutation-tests.ts additions}
server/{routes/health.ts,projects/instance-lock.ts,static.ts}   # health with version, hand-over lock, dist/ serving
Dockerfile, .dockerignore, compose.yaml, .env.server.example, .trivyignore
azure-pipelines.yml, azure-pipelines-rollback.yml   # for the target's Azure DevOps; never run here
deploy/README.md                  # target setup: Azure resources, Azure DevOps items, release hand-over (no infrastructure as code)
deploy/trial-runbook.md           # owner trial: steps, expected outputs, report block (owner acceptance)
deploy/azure-devops/{templates/{setup-steps,validate-jobs,image-jobs,deploy-steps}.yml,
                     schema/service-schema.json, sample-variables.yml}
scripts/{ci-validate.ts,gate-suites.ts,image.ts,pipeline-lint.ts,pipeline-dry-run.ts,
         container-check.ts,container-suites.ts,deploy.ts,deploy-smoke.ts}
tests/pipeline/{azure-pipelines.test.ts,deploy.test.ts,deploy-smoke.test.ts,dry-run.test.ts,fake-azure.ts}
(no .github/workflows/, no .github/dependabot.yml: FR-130)
```

**Structure Decision**: same web-application layout; all access logic in `server/auth/` behind
`authorize`/`filter`; per-person Git in `server/projects/worktrees.ts`; Admin UI as dialogs in
`src/admin/`; pure logic (claim mapping, grant matching, role compilation, guards, filters,
last-Admin guard, dry run) in plain modules for unit and mutation tests.

## Delivery phases (detail in tasks.md)

0. Prerequisite: 002 merged; rebase; refresh route inventory.
1. Setup: dependencies, config, fixtures (auth workspace, Keycloak realm), mock OpenID provider.
2. Foundations: principal model with the verified address, grant matching, role compiler for
   the built-in roles, decision boundary with Cedar and baseline policies, route →
   action table, request middleware with local implicit Admin, audit writer, admin repository
   loader with bootstrap Admins. Local mode suites green.
3. US9 part 1 (P1): container image, static serving and health, instance lock with revision
   hand-over, Compose local profile, suites runnable against the image.
4. US10 part 1 (P1): local build scripts and the Azure DevOps pipeline definition: `ci:validate`,
   `image:build|scan|sbom|push`, gate suite list, `azure-pipelines.yml` stages Validate and Image,
   pipeline rules test, `pipeline:lint` and `pipeline:dry-run`.
5. US1 sign-in and sessions (direct redirect to the provider, **No access** and signed-out
   pages, server mode skeleton, live updates) against the mock OpenID
   provider; server suites in the container step against the mock; Keycloak compatibility suite
   and Compose `keycloak` profile (owner's machine, outside the gate and the pipeline).
6. US9 part 2 + US10 part 2 (P1): Azure delivery definition: deploy, version check, smoke test and
   rollback scripts (tested against a fake Azure client), Deploy stage, rollback pipeline, target
   setup guide with the release hand-over, and the owner trial runbook. The trial itself is owner
   acceptance (the implementer has no access), run with the test fixture workspace.
7. US2 read filtering everywhere (lists, derivations, SSE, Git history, trash, drafts).
8. US3 role enforcement on every write and capability-driven UI.
9. US8 Admin panel (users, roles and access grants by group or e-mail, custom roles, projects,
   policies with dry run and history, access check, audit, settings, last-Admin guard).
10. US4 per-person working copies, publish, authorship.
11. US5 metric and classification guards.
12. US6 delegated remote credentials.
13. US7 agent clients.
14. Polish: README, verification record, full matrix and mutation run, security review.

The container comes right after the foundations (owner decision): from Phase 4 on, every phase
ends with `bun run ci:validate` green on the owner's machine, including the `container` step that
reruns the phase's browser checks against the image and the `pipeline` step (`pipeline:lint`,
`pipeline:dry-run`). Nothing runs on the GitHub repository. Azure delivery comes right after US1
because server mode cannot start without a provider; its code is verified locally (fake Azure
client, dry run), and until Phases 7–9 are done any Azure environment holds only the test fixture
workspace.
US8 sits right after US3 because every later server-mode story is only testable through grants the
panel manages (the fixture can seed `data/admin/` directly for earlier phases).

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Per-person Git worktrees (copy-aware cache and watchers) | owner decision; shared working tree lets one person's switch or pull rewrite everyone's files | shared tree with Steward-only Git actions blocks Editors from branching and still mixes uncommitted work |
| Administration Git repository for access configuration | versioning, diff and rollback of policies and grants with authorship | JSON state files with a hand-written version log re-implement history; project repositories let editors grant themselves access |
| Roles compiled to Cedar, grants as entity relations | custom roles with conditions must be decided by the same engine the access check explains; grant changes must not regenerate policies (R22) | roles computed in TypeScript and passed as attributes (conditions outside the policy language, access check cannot name the deciding rule); one policy per grant (policy set grows with people) |
| Cedar WASM (13 MB, server only) | owner decision; reviewable, schema-validated policy language for the raw editor and simulator | TypeScript-only rules cannot be edited safely by Admins; documented as fallback (R3) |
| Single instance per data root | in-process locks, event ring, cache | multi-instance coordination is out of scope for v0.4.0; scale path documented (R14) |
| Revision hand-over in the instance lock | single revision mode waits for the new revision to be ready before stopping the old one; a plain refusal would block every update | stopping the app before each deployment (manual downtime, not automatable without extra rights) |
| Host networking for local mode in a container | keeps the loopback rule of Principle I unchanged (OP-8, accepted) | binding `0.0.0.0` in local mode inside a container needs a constitution amendment |
| Package scripts as the only implementation of pipeline steps | the owner builds and tests locally and the target's pipeline must run exactly the same steps (R18) | inline pipeline scripts cannot be run or tested on the owner's machine |
| Mock OpenID provider in the repository | the target pipeline must not depend on Keycloak or any external provider, yet must cover the sign-in flow and Entra claim mapping (OP-9) | Keycloak in the pipeline (rejected by the owner); a real test tenant (secrets and network on the agents); a third-party mock image (no Entra overage or Graph stand-in) |
| Pipeline definition shipped but never run from this repository; checked by schema lint and dry run | the target uses Azure DevOps; the repository runs nothing automatically (owner decision) | GitHub Actions (rejected by the owner); an untested definition (would fail first at the target) |
