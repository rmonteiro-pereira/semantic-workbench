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
tokens; the browser holds only an HttpOnly cookie. Every route and server-side derivation calls one
decision boundary (`authorize`/`filter`) backed by Cedar policies evaluated in-process
(`@cedar-policy/cedar-wasm/nodejs`). Read access is per project and path; the server sends only
readable files, filters events, history, trash, drafts, suggestions and agent context, and
answers 404 for hidden resources. Guards compare parsed documents before and after each write
for metric status and classification rules. In server mode each Editor gets a Git worktree per
repository on a personal branch, commits carry the signed-in author, and remote operations use the
person's delegated token (Entra on-behalf-of for Azure DevOps, GitHub user token). An Admin panel
(dialogs) manages role mappings, assignments, project access, policies (structured and raw, dry
run, versioned in an administration Git repository with rollback), an access simulator, the audit
log and settings. A container image targets Azure Container Apps with one replica and an Azure
Files data root ([research.md](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Bun 1.4 (API, tests), Vite+ 1.2 (build)

**Primary Dependencies**: existing (`yaml`, `ajv`, `node-sql-parser`, CodeMirror, React Flow,
ELK); **new, server only**: `openid-client` 6.8.8 (MIT, 236 KB + `oauth4webapi` 332 KB),
`jose` 6.2.13 (MIT, 412 KB), `@cedar-policy/cedar-wasm` 4.14.0 (Apache-2.0, 13 MB on disk, 4.2 MB
WASM loaded; never bundled for the browser). All three verified under Bun 1.4.0 (research R1–R3).
Network: only the identity provider (discovery, JWKS, token, end-session, Graph
`checkMemberGroups` for overage) and Git hosts on explicit action — allowed by constitution 3.0.0
Principle I. Machine Git ≥ 2.40.

**Storage**: unchanged project layout plus `data/worktrees/`, `data/admin/` (Git), per-person
state under `data/state/users/`, encrypted sessions, append-only audit JSONL, instance lock
([data-model.md](./data-model.md)). Cache optionally on container local disk (`SW_CACHE_DIR`).

**Testing**: `bun test` (unit + HTTP on temp `DATA_DIR` with a stub OIDC provider built on
`jose`), authorization test matrix (`tests/auth/matrix.test.ts`), Playwright suites `test:auth`,
`test:auth:keycloak` (Keycloak 26 container), `test:admin`, `test:two-editors`; mutation suite
additions; GitHub Actions workflow for Keycloak.

**Target Platform**: local: workstation (Linux incl. WSL2) on loopback; server: Linux container
on Azure Container Apps (App Service alternative), one replica, HTTPS ingress.

**Project Type**: web application (`src/` frontend, `server/` Bun API).

**Performance Goals**: filtering ≤ 150 ms on the project listing and ≤ 10% on full load for
5,000 files / 20 projects (SC-006; preparsed Cedar decision ≈ 0.07 ms, memoised per rule class);
sign-in ≤ 5 s against local Keycloak (SC-005); container ready ≤ 30 s on the examples (SC-009).

**Constraints**: constitution 3.0.0; byte-exact files (no redaction); nothing executed; tokens
never in the browser; single instance per data root; no plain-text credentials; local mode
unchanged.

**Scale/Scope**: teams of tens of people, tens of repositories; 9 user stories, 76 FRs, 12 success
criteria; 66 routes in the matrix (57 implemented + 9 planned by 002) plus about 30 new.

No NEEDS CLARIFICATION remain: owner decisions are binding; OP-1 to OP-5 resolved with
recommended defaults (spec Clarifications).

## Constitution Check (v3.0.0)

*Gate before Phase 0 and re-checked after Phase 1 design.*

| Principle | How the plan complies | Pre | Post |
| --- | --- | --- | --- |
| I. Local and Server Modes | `SW_MODE` selects the mode. Local: loopback binding enforced (refuses other hosts), origin/host checks kept, implicit Admin through the same boundary, machine credentials. Server: OIDC code + PKCE confidential client, `__Host-` HttpOnly cookie, tokens server-side, bearer only on `/api/agent/*`, refuses to start without complete config and valid policies, frontend and API on one origin. Outbound: provider endpoints (incl. Graph `checkMemberGroups` for configured groups, on-behalf-of token endpoint) and Git hosts on explicit action; delegated credentials via `GIT_ASKPASS` per command, never in Git config, sessions encrypted. Remote change and clone are Admin with host allow-list. Repositories only under `data/projects/`, `data/worktrees/`, `data/admin/`. Server never sends unreadable files, paths, events or counts | ✅ | ✅ |
| II. Byte-Exact Source Preservation | Files are sent whole or not at all; no redaction. Metric demotion to `proposed` uses the existing item-level edit (only the `status` scalar changes). Admin configuration files are written byte-exact through the same atomic save | ✅ | ✅ |
| III. One Validation Rule Set | Guards reuse the shared parsers from `src/`; the browser uses the same guard module to disable controls; access JSON validated with a pinned application schema through the same Ajv setup | ✅ | ✅ |
| IV. Atomic, Hash-Checked File Persistence | Saves unchanged (hash-checked, atomic) in each working copy; per-person drafts/views/suggestion state; trash entries record `owner` and keep unpublished work on project delete (journaled); sessions and users state atomic; audit append-only with hash chain; access configuration in `data/admin/` Git, one commit per change. Git queue keyed by base repository covers all worktrees; argument arrays, prompts off, timeouts; `core.autocrlf=false` and (SMB) `core.filemode=false` | ✅ | ✅ |
| V. Pinned Official Standards | No standard schema changes; new application schema `schemas/semantic-workbench-access-v1.json` pinned and labelled; classification level ordering labelled as an application reading of ODCS free text | ✅ | ✅ |
| VI. Verification Gate | Unit, matrix, browser suites per story; geometry checks for Admin dialogs and header menu. New mutants: decision ignores domain; filter returns unfiltered list; 404 replaced by 403 (existence leak); SSE send skips filter; replay skips filter; draft served to non-owner; trash lists others' entries; git show ignores path rule; agent context falls back to unreadable project; bearer accepted outside agent routes; cookie without HttpOnly/Secure; CSRF header not required; ID-token nonce unchecked; `tid` unchecked; overage failure grants membership; self-approval allowed; approved metric edit not demoted; classification change allowed to Editor; guard skipped in save-batch/pull/revert; push to protected branch by Editor; publish not fast-forward; commit author not principal; credential written to `.git/config`; remote change by non-Admin; last-Admin guard off; invalid policy activated; deactivated principal allowed; audit entry missing for denial; second instance not refused | ✅ | ✅ |
| VII. Honest Claims | README: both modes, configuration, Entra and Keycloak guides, role matrix and what each role sees, outbound calls, delegated credentials, single-instance limit and scale path, the documented residual exposure of commit messages; counts from tests | ✅ | ✅ |

Technical Constraints: one authorization boundary (`server/auth/authorize.ts`) used by every
route (enforced by the route→action table test); Cedar evaluated in-process; single instance per
data root (`instance.lock`); new dependencies justified above (R1–R3), server only.

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
│   └── ui-contracts.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── index.ts                      # mode selection, binding rules, static dist/ in server mode, instance lock
├── handler.ts                    # authentication middleware, CSRF, route → action, 401/403/404 mapping
├── config.ts                     # new: environment parsing and validation (contracts/configuration.md)
├── auth/                         # new
│   ├── oidc.ts                   # openid-client: discovery, login, callback, refresh, logout
│   ├── sessions.ts               # session store, AES-GCM persistence, expiry, end-session
│   ├── principal.ts              # claim normalisation (Entra, Keycloak, generic), overage via Graph
│   ├── bearer.ts                 # jose JWKS validation for agent clients
│   ├── authorize.ts              # decision boundary: authorize(), filter(), AccessView, memo
│   ├── cedar.ts                  # Cedar WASM loader, preparse, entity builder
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
├── routes/{auth.ts,me.ts,admin.ts,audit.ts,health.ts, existing routes wrapped}
policies/{schema.cedarschema,baseline.cedar}
schemas/semantic-workbench-access-v1.json
src/
├── auth/{useMe.ts,can.ts,guards-client.ts}   # /api/me, capability checks, shared guard use
├── admin/{AdminLauncher.tsx,UsersDialog.tsx,RolesDialog.tsx,PoliciesDialog.tsx,PolicyEditor.tsx,
│          AccessCheckDialog.tsx,ProjectAccessDialog.tsx,AuditDialog.tsx,SettingsDialog.tsx,VersionHistory.tsx}
├── projects/{api.ts (X-SW-Request, 401 → sign-in), Sidebar.tsx (role badge, hidden count)}
├── scm/{BranchPicker.tsx (in use by), SourceControl.tsx (Publish, Pull from default), ConnectAccount.tsx}
├── metrics/ (Approve/Deprecate actions, unverified owner), odcs/PropertyEditors.tsx (guard-aware)
└── main.tsx (person menu, Admin entry, hide/disable by capability)
tests/auth/ (principal, sessions, bearer, authorize, filter-perf, guards, worktrees, admin-repo, audit, matrix, route-actions)
tests/fixtures/{auth-workspace/, keycloak/realm.json}
scripts/{auth-browser-check.ts,auth-keycloak-check.ts,admin-browser-check.ts,two-editors-check.ts; mutation-tests.ts additions}
Dockerfile, .dockerignore, deploy/azure/{containerapp.bicep,README.md}, .github/workflows/auth-keycloak.yml
```

**Structure Decision**: same web-application layout; all access logic in `server/auth/` behind
`authorize`/`filter`; per-person Git in `server/projects/worktrees.ts`; Admin UI as dialogs in
`src/admin/`; pure logic (claim mapping, guards, filters, last-Admin guard, dry run) in plain
modules for unit and mutation tests.

## Delivery phases (detail in tasks.md)

0. Prerequisite: 002 merged; rebase; refresh route inventory.
1. Setup: dependencies, config, fixtures (auth workspace, Keycloak realm), stub provider.
2. Foundations: principal model, decision boundary with Cedar and baseline policies, route →
   action table, request middleware with local implicit Admin, audit writer, admin repository
   loader with bootstrap Admins. Local mode suites green.
3. US1 sign-in and sessions (server mode skeleton, static serving, health, live updates).
4. US2 read filtering everywhere (lists, derivations, SSE, Git history, trash, drafts).
5. US3 role enforcement on every write and capability-driven UI.
6. US8 Admin panel (users, roles, projects, policies with dry run and history, access check,
   audit, settings, last-Admin guard).
7. US4 per-person working copies, publish, authorship.
8. US5 metric and classification guards.
9. US6 delegated remote credentials.
10. US7 agent clients.
11. US9 container, Azure deployment, Keycloak CI.
12. Polish: README, verification record, full matrix and mutation run.

US8 sits right after US3 because every later server-mode story is only testable through grants the
panel manages (the fixture can seed `data/admin/` directly for earlier phases).

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Per-person Git worktrees (copy-aware cache and watchers) | owner decision; shared working tree lets one person's switch or pull rewrite everyone's files | shared tree with Steward-only Git actions blocks Editors from branching and still mixes uncommitted work |
| Administration Git repository for access configuration | versioning, diff and rollback of policies and grants with authorship | JSON state files with a hand-written version log re-implement history; project repositories let editors grant themselves access |
| Cedar WASM (13 MB, server only) | owner decision; reviewable, schema-validated policy language for the raw editor and simulator | TypeScript-only rules cannot be edited safely by Admins; documented as fallback (R3) |
| Single instance per data root | in-process locks, event ring, cache | multi-instance coordination is out of scope for v0.4.0; scale path documented (R14) |
