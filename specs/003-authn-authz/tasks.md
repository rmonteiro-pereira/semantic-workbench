---
description: "Task list for Sign-In, Roles and Access Control for Local and Server Modes (003)"
---

# Tasks: Sign-In, Roles and Access Control for Local and Server Modes (v0.4.0)

**Input**: Design documents from `specs/003-authn-authz/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

> **Builds on 002 — rebase first.** This branch was cut from `origin/002-lineage-and-ux`. Do not
> start Phase 1 until 002 is merged into `main`; then complete Phase 0 (rebase and route
> refresh). Every task below assumes the 002 code (commit with paths/push, revert, identity,
> clone, repository projects, subfolder projects, metrics routes) is present.

**Tests**: Required. Constitution 3.0.0 Principle VI mandates unit/API tests, an isolated browser
check per user-visible change, targeted mutants for new decision logic, geometry assertions for
layout work, and the authorization test matrix. Test tasks come first in each phase and must fail
before the implementation tasks that follow.

**Organization**: Setup and foundations, then one phase per user story in priority order (P1:
US1, US2, US3, US8; P2: US4, US5, US6, US7; P3: US9). Each phase ends with every existing suite
green in local mode (`bun test`, `check`, `build`, `test:ui`, `test:responsive`, `test:edges`,
`test:grouping-validation`, `test:examples:ui`, the 002 suites, `test:mutation`) plus its own
checks.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[USn]**: US1 sign-in, US2 read filtering, US3 role enforcement, US4 working copies, US5
  governance guards, US6 remote credentials, US7 agent clients, US8 Admin panel, US9 Azure
  deployment
- Paths are repository-relative

---

## Phase 0: Rebase on 002 (prerequisite)

- [ ] T001 After 002 merges, rebase `003-authn-authz` onto `main`; resolve conflicts only in specs/003-authn-authz/ and .specify/memory/constitution.md (002 must not have changed the constitution beyond 2.1.0; if it did, merge the changes into 3.0.0 and note them in the Sync Impact Report)
- [ ] T002 Re-run the route inventory against server/routes/** and server/handler.ts and update the route list of specs/003-authn-authz/contracts/http-api.md for any route 002 added, renamed or dropped

---

## Phase 1: Setup

- [ ] T003 Add `openid-client` 6.8.8, `jose` 6.2.13 and `@cedar-policy/cedar-wasm` 4.14.0 (exact versions) to package.json and bun.lock; record size and licence in specs/003-authn-authz/research.md R1–R3
- [ ] T004 [P] Configuration module server/config.ts parsing and validating every variable of contracts/configuration.md (mode, required server variables, loopback-only `SW_HOST` in local mode, `SW_PUBLIC_URL` origin, 32-byte `SW_SESSION_KEY`, at least one `SW_BOOTSTRAP_ADMINS`); tests in tests/auth/config.test.ts
- [ ] T005 [P] Fixture workspace tests/fixtures/auth-workspace/: domains Sales, HR, Finance; projects sales-contracts (Sales; restricted path `finance/**` → Finance group), sales-metrics (Sales; metrics in draft/proposed/approved with owners), hr-people (HR), shared-reference (everyone can read), no-domain project; cross-project mapping and ontology references; marker strings `LEAK-<project>-<path>` in every unreadable file; seeded data/admin/ files
- [ ] T006 [P] Stub OpenID provider tests/helpers/stub-oidc.ts (discovery, JWKS, authorize, token, end-session, client credentials) built on `jose`, with users alice (Sales Editor), bob (Sales Steward), carol (HR Viewer), dave (Admin), erin (no role), frank (Sales Editor + Finance group), and agent clients sw-agent (granted sales-contracts) and sw-agent-ungranted; Entra-shaped and Keycloak-shaped claim modes, overage mode
- [ ] T007 [P] Keycloak realm tests/fixtures/keycloak/realm.json matching T006 users, groups, client roles, group mapper and service accounts (research R6)
- [ ] T008 [P] Script entries test:auth, test:auth:keycloak, test:admin, test:two-editors in package.json (pointing to scripts created in later phases)
- [ ] T009 [P] Pin schemas/semantic-workbench-access-v1.json (roles, assignments, projects, agents, deactivated, settings per data-model.md) and list it in schemas/README.md as an application schema

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T010 [P] Unit tests for claim normalisation (Entra `tid:oid`, `roles`, `groups`, `hasgroups`/`_claim_names` overage, `idtyp=app`; Keycloak `resource_access.<client>.roles`, group paths; generic) and effective-role computation (domain role, project assignment, bootstrap Admin, highest role wins, deactivated) in tests/auth/principal.test.ts
- [ ] T011 Principal model and claim mapper in server/auth/principal.ts (data-model Principal; `key` = `u` + 20 hex of SHA-256(id)); users registry `state/users.json` with unique branch `handle` in server/projects/state.ts
- [ ] T012 [P] Cedar schema policies/schema.cedarschema and baseline policies policies/baseline.cedar (B1–B8, F1–F7 of contracts/policy-model.md)
- [ ] T013 [P] Unit tests for the decision boundary over the baseline: role matrix of spec Appendix B row by row, 404 vs 403 status, memoisation per rule class, invalid policy set refuses to load, local implicit Admin, in tests/auth/authorize.test.ts
- [ ] T014 Cedar loader server/auth/cedar.ts (import `@cedar-policy/cedar-wasm/nodejs`, preparse schema and policy set, entity builder for User/Group/Role/Domain/Repository/Project/File/Metric/Branch/TrashEntry/Workspace)
- [ ] T015 Decision boundary server/auth/authorize.ts: `authorize`, `filter`, `AccessView` (readable projects, path predicate, roles), per-request memo, 404/403 mapping (contracts/policy-model.md)
- [ ] T016 [P] Performance test tests/auth/filter-perf.test.ts: 5,000 files in 20 projects, project listing filter ≤ 150 ms and full load ≤ 10% over local mode (SC-006)
- [ ] T017 [P] Route → action table tests/auth/route-actions.ts and test tests/auth/route-actions.test.ts that fails when any route in server/routes/** or server/handler.ts lacks a row (contracts/http-api.md)
- [ ] T018 Request middleware in server/handler.ts: resolve principal (local implicit Admin, or session/bearer placeholders returning 401 until US1), call `authorize` for the route's action before the route runs, map decisions to 401/403/404, attach `X-Request-Id`
- [ ] T019 [P] Unit tests for the audit writer (fields of contracts/audit-log.md, hash chain `prev`, no token/content fields, stdout mirror, monthly files, retention 400 days) in tests/auth/audit.test.ts
- [ ] T020 Audit writer server/auth/audit.ts and calls from the middleware for every deny and every write action
- [ ] T021 [P] Unit tests for the administration repository (create at first use, load and validate against schemas/semantic-workbench-access-v1.json, one commit per change authored by the Admin, history, diff, rollback as new commit, hash-checked writes) in tests/auth/admin-repo.test.ts
- [ ] T022 Administration repository server/auth/admin-repo.ts on `data/admin/` reusing server/projects/git.ts; Admin rules from `data/admin/policies/*.cedar` merged with the baseline in server/auth/cedar.ts
- [ ] T023 [P] Unit tests for the last-Admin guard and bootstrap Admins (removing the last mapping, deactivating the last Admin, a forbid on Admin, bootstrap always Admin, bootstrap use audited) in tests/auth/admin-guard.test.ts
- [ ] T024 Last-Admin guard server/auth/admin-guard.ts
- [ ] T025 Mutants: decision ignores domain; 404 replaced by 403; invalid policy accepted at load; last-Admin guard off; audit entry missing for a denial — in scripts/mutation-tests.ts

**Checkpoint**: every route passes through the boundary; local mode suites green with the
implicit Admin.

---

## Phase 3: User Story 1 - Sign in to a team workbench, and nothing changes locally (Priority: P1) 🎯 MVP

**Goal**: server mode with OIDC sign-in, encrypted server sessions, cookie-authenticated live
updates; local mode unchanged.

**Independent Test**: `bun test tests/auth/oidc.test.ts tests/auth/sessions.test.ts` and
`bun run test:auth` (sign-in part) with the stub provider.

- [ ] T026 [P] [US1] Unit tests for sessions: AES-256-GCM persistence under `SW_SESSION_KEY`, file named by SHA-256 of the id, idle 8 h / absolute 24 h expiry, survives restart, end-session, cookie `__Host-sw-session` with `Secure; HttpOnly; SameSite=Lax; Path=/` (loopback development exception documented), in tests/auth/sessions.test.ts
- [ ] T027 [P] [US1] Unit tests for the OIDC flow against the stub provider: PKCE S256, `state` and `nonce` checked, issuer/audience/signature/expiry with 300 s skew, Entra `tid` allow-list, `returnTo` same-origin only, role-less and deactivated principals refused, refresh re-reads roles, logout calls end-session, in tests/auth/oidc.test.ts
- [ ] T028 [P] [US1] Unit tests for CSRF: non-GET without `X-SW-Request: 1` or with a foreign Origin → 403 in server mode, in tests/auth/csrf.test.ts
- [ ] T029 [US1] Session store server/auth/sessions.ts
- [ ] T030 [US1] OIDC client server/auth/oidc.ts with `openid-client` (discovery, login, callback, refresh, logout; client secret, private key or managed-identity client assertion) and routes `/auth/login`, `/auth/callback`, `/auth/logout` in server/routes/auth.ts
- [ ] T031 [US1] Entra group overage: `checkMemberGroups` for configured group ids with an app-only token, failure → no membership plus message and audit, in server/auth/principal.ts (FR-022)
- [ ] T032 [US1] Mode selection and binding in server/index.ts: local refuses non-loopback, server requires valid config and policies, serves `dist/` with CSP and security headers (research R15), `/healthz` and `/readyz` in server/routes/health.ts
- [ ] T033 [US1] `GET /api/me` in server/routes/me.ts (contracts/http-api.md)
- [ ] T034 [US1] Live-update stream authenticates by cookie and closes on sign-out, expiry or End session (`access` event) in server/projects/events.ts and server/routes/events.ts
- [ ] T035 [US1] Frontend: fetch wrapper adds `X-SW-Request: 1` and sends 401 to `/auth/login?returnTo=` in src/projects/api.ts; `useMe` hook src/auth/useMe.ts; person menu with name, role, **Sign out** in src/main.tsx; no-access page
- [ ] T036 [US1] Browser check scripts/auth-browser-check.ts (part 1): sign-in for each test user via the stub provider, header role, no token in `document.cookie`/storage/responses, live updates arrive, sign-out closes the stream, session expiry returns to sign-in; local-mode smoke unchanged
- [ ] T037 [US1] Mutants: cookie without HttpOnly or Secure; CSRF header not required; nonce unchecked; `tid` unchecked; overage failure grants membership; session not expired after absolute lifetime — in scripts/mutation-tests.ts

**Checkpoint**: sign-in works with the stub provider; local mode unchanged.

---

## Phase 4: User Story 2 - See only what you may see (Priority: P1)

**Goal**: the server never sends unreadable files, paths, events or counts.

**Independent Test**: `bun test tests/auth/matrix.test.ts` (read part) and `bun run test:auth`
(hidden files part).

- [ ] T038 [P] [US2] Authorization test matrix tests/auth/matrix.test.ts (read part): every read route of tests/auth/route-actions.ts × users of T006 × readable/unreadable targets; asserts status and scans every body for `LEAK-` markers and unreadable paths/project names (SC-001, SC-002)
- [ ] T039 [P] [US2] SSE filter tests in tests/auth/events-filter.test.ts: live and replayed events, multi-item events reduced, per-person suggestions count, `access` event and close on grant change
- [ ] T040 [P] [US2] Git history filter tests in tests/auth/git-filter.test.ts: log lists readable paths only and `hiddenCommits`, show/diff/versions 404 for restricted or removed-restricted paths
- [ ] T041 [US2] `documentsFor(view)` and readable listings in server/projects/workspace.ts; `GET /api/projects` returns readable projects with `hiddenFiles`; unreadable project/file → NotFoundError (FR-040, FR-045)
- [ ] T042 [US2] Replace `ws.documents()` with `documentsFor(view)` in server/handler.ts (agent catalog/context/plan, `/api/documents`), server/routes/metrics.ts, server/routes/kpis.ts and the 002 metrics routes; agent context resolves ontologies and models only within readable projects in server/agent/runtime.ts (FR-041)
- [ ] T043 [US2] Delete impact (`hiddenReferences`), suggestions computed over readable files, conflict messages without names for unreadable occupants (move, import, restore) in server/projects/workspace.ts, server/projects/suggestions.ts, server/projects/trash.ts (FR-045)
- [ ] T044 [US2] Tagged events and per-connection filtering, filtered replay, per-person suggestions count in server/projects/events.ts (contracts/sse-events.md, FR-042)
- [ ] T045 [US2] Git read routes filtered in server/routes/git.ts and server/projects/scm.ts (FR-043)
- [ ] T046 [US2] Trash listing/undo/restore/purge filtered by readable paths and ownership; drafts owner-only in server/routes/trash.ts, server/routes/drafts.ts (FR-044)
- [ ] T047 [US2] `/api/status` reduced for non-Admins in server/routes/projects.ts (FR-047)
- [ ] T048 [US2] UI: "N files you cannot open" line per project in src/projects/Sidebar.tsx; unresolved-reference stubs unchanged in lineage and mapping graph
- [ ] T049 [US2] Browser check scripts/auth-browser-check.ts (part 2): Sales Viewer sees no HR project, restricted files counted, search/lineage/mapping graph/metrics/agent export contain no markers
- [ ] T050 [US2] Mutants: filter returns unfiltered list; SSE send skips filter; replay skips filter; draft served to non-owner; trash lists others' entries; git show ignores path rule; agent context falls back to an unreadable project — in scripts/mutation-tests.ts

**Checkpoint**: zero leaked markers across the read matrix.

---

## Phase 5: User Story 3 - Roles decide what you can do (Priority: P1)

**Goal**: every write authorised by role and scope; UI follows capabilities.

**Independent Test**: `bun test tests/auth/matrix.test.ts` (write part) and `bun run test:auth`
(controls part).

- [ ] T051 [P] [US3] Matrix write part in tests/auth/matrix.test.ts: every write route × users × readable/unreadable targets; Viewer 403/404, Editor allowed in own domain, cross-project move needs both sides, Admin-only actions (purge, clear, delete project, remote, clone, register projects, status details); denials leave files, Git state, drafts and state unchanged (byte compare) and are audited (FR-050, FR-052)
- [ ] T052 [US3] Wrap every write route with its action and target resource(s) in server/routes/*.ts and server/handler.ts, including 002 routes (commit with paths/push, revert, clone, repository projects, subfolder delete mode, metrics); identity and credential-helper routes 404 in server mode
- [ ] T053 [US3] Capability helper src/auth/can.ts from `/api/me` plus per-project role; hide or disable (with reason tooltip) controls in src/main.tsx, src/projects/Sidebar.tsx, src/projects/Trash.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx, src/metrics/MetricsView.tsx, src/edit/*.tsx, src/odcs/PropertyEditors.tsx (FR-051, contracts/ui-contracts.md)
- [ ] T054 [US3] Browser check scripts/auth-browser-check.ts (part 3): controls per role, crafted requests refused; geometry of the person menu and disabled tooltips across the viewport matrix in scripts/responsive-ui-tests.ts
- [ ] T055 [US3] Mutants: write route skips authorize; cross-project move checks only the source; Viewer allowed to save drafts — in scripts/mutation-tests.ts

**Checkpoint**: P1 enforcement complete; grants seeded in fixtures.

---

## Phase 6: User Story 8 - Admin panel: control roles, policies and access (Priority: P1)

**Goal**: Admins manage users, role mappings, assignments, project access, policies (structured
and raw, dry run, history, rollback), check access, review and export audit, and see settings,
without being able to remove the last Admin.

**Independent Test**: `bun test tests/auth/admin-api.test.ts tests/auth/dry-run.test.ts` and
`bun run test:admin`.

- [ ] T056 [P] [US8] API tests for `/api/admin/*` and `/api/audit*` in tests/auth/admin-api.test.ts: Admin-only (Steward only audit of own domains), schema validation, `baseVersion` stale → 409, each change one commit in data/admin with author and message, sessions ended on deactivate, `access` event on change, secrets never returned (FR-102 to FR-114)
- [ ] T057 [P] [US8] Dry-run tests in tests/auth/dry-run.test.ts: changed decisions over the matrix fixture and the last 1,000 audit snapshots; activation refused without a matching dry run or with validation errors; rollback restores previous decisions for every matrix case (SC-012)
- [ ] T058 [P] [US8] Policy template tests in tests/auth/policy-templates.test.ts: each template of contracts/policy-model.md generates valid Cedar; a `forbid` on Admin without narrowing condition is rejected; Admin rules cannot override baseline forbids (FR-107)
- [ ] T059 [US8] Admin API server/routes/admin.ts: users (list, search, deactivate, reactivate), roles, assignments, projects, agents, settings, versions, diff, rollback, sessions, provider status, `check`, `who-can` (contracts/http-api.md)
- [ ] T060 [US8] Policy service: list baseline and Admin rules, validate (Cedar `checkParsePolicySet` + schema validation with line/column), templates → Cedar text, enable/disable via `@enabled`, in server/auth/policies.ts
- [ ] T061 [US8] Dry run server/auth/dry-run.ts (matrix fixture shipped as data in policies/matrix-cases.json generated from tests/auth/route-actions.ts; audit snapshot replay)
- [ ] T062 [US8] Access simulator and who-can in server/auth/authorize.ts (`explain` returning deciding rules and attributes; hypothetical principals by groups/roles) (FR-111)
- [ ] T063 [US8] Audit query and export (JSONL, CSV) with Steward domain scoping in server/routes/audit.ts and server/auth/audit.ts (FR-102)
- [ ] T064 [P] [US8] Admin launcher and dialog shell src/admin/AdminLauncher.tsx (header **Admin** entry, Admins only; local implicit Admin) reusing src/projects/Modal.tsx size variants
- [ ] T065 [P] [US8] Users & groups dialog src/admin/UsersDialog.tsx (search, role source chips, deactivate/reactivate, end sessions, check access shortcut) (FR-104)
- [ ] T066 [P] [US8] Roles dialog src/admin/RolesDialog.tsx (matrix view, group/app-role/client-role mappings, per-project assignments) (FR-105)
- [ ] T067 [P] [US8] Policies dialog src/admin/PoliciesDialog.tsx and src/admin/PolicyEditor.tsx (template forms, raw editor with CodeMirror and inline validation, dry-run result, enable/disable, delete) (FR-106, FR-108)
- [ ] T068 [P] [US8] Version history src/admin/VersionHistory.tsx (who/when/message, diff with the existing diff view, **Roll back**) (FR-109)
- [ ] T069 [P] [US8] Access check dialog src/admin/AccessCheckDialog.tsx (decision, rules, attributes; who can access a project or path) (FR-111)
- [ ] T070 [P] [US8] Project access dialog src/admin/ProjectAccessDialog.tsx (domain, everyone-can-read, readers, stewards, restricted paths, protected branches, protected classification level, agent client grants) (FR-112)
- [ ] T071 [P] [US8] Audit dialog src/admin/AuditDialog.tsx (filters, paging, export) and Settings dialog src/admin/SettingsDialog.tsx (provider status, session lifetimes, remote-credential policy, active sessions) (FR-113)
- [ ] T072 [US8] Last-Admin guard message and bootstrap Admin indication in every Admin save path (server/routes/admin.ts, src/admin/*.tsx) (FR-110)
- [ ] T073 [US8] Browser check scripts/admin-browser-check.ts: quickstart §6 end to end; SC-011 timing (assign domain, map group, check access within 3 minutes of scripted steps); geometry of every Admin dialog across the viewport matrix
- [ ] T074 [US8] Mutants: invalid policy activated; activation without dry run; Admin rule overrides a baseline forbid; deactivated principal allowed; Steward sees audit of other domains — in scripts/mutation-tests.ts

**Checkpoint**: P1 complete; the team deployment is administrable from the UI.

---

## Phase 7: User Story 4 - Your own working copy in server mode (Priority: P2)

**Goal**: per-person worktrees, personal branches, per-person state, publish, authored commits.

**Independent Test**: `bun test tests/auth/worktrees.test.ts` and `bun run test:two-editors`.

- [ ] T075 [P] [US4] Worktree tests in tests/auth/worktrees.test.ts: creation on first use on `work/<handle>` (unique handle), base checkout detached and never edited, branch in use elsewhere refused with name, publish fast-forward via compare-and-swap `update-ref`, not fast-forward → 409, pull-default merge, Git queue shared by all copies of a repository, idle release keeps files and drafts (FR-070 to FR-077)
- [ ] T076 [P] [US4] Authorship tests in tests/auth/authorship.test.ts: author = principal name/email, committer = service, trailer `Signed-in-user: <id>`; identity routes 404 in server mode
- [ ] T077 [US4] Working copies server/projects/worktrees.ts (`git worktree add -b`, `lock`, list porcelain → in-use map, publish, pull-default, removal) and copy-aware paths in server/projects/paths.ts
- [ ] T078 [US4] Copy-aware scanning, cache keys (copy, project, path) with entities by blob hash, watchers per active copy with 30-minute idle release, `SW_CACHE_DIR` in server/projects/workspace.ts, server/projects/cache.ts, server/projects/watcher.ts
- [ ] T079 [US4] Per-person drafts, views, grouping corrections and suggestion state under `state/users/<userKey>/` in server/projects/state.ts and server/handler.ts (grouping routes)
- [ ] T080 [US4] Viewer reads the published state; Editor+ reads their copy; `published` event in server/projects/workspace.ts and server/projects/events.ts
- [ ] T081 [US4] Commits with author env, service committer and trailer in server/projects/git.ts; publish and pull-default routes in server/routes/git.ts
- [ ] T082 [US4] Server-mode project delete and clear: list unpublished work, store per-person patches and drafts in the trash entry, remove worktrees, journaled, in server/projects/trash.ts (data-model Trash entry)
- [ ] T083 [US4] UI: branch picker "in use by", **Publish to <default>**, **Pull from <default>**, identity dialog hidden in server mode, in src/scm/BranchPicker.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx
- [ ] T084 [US4] Browser check scripts/two-editors-check.ts: two contexts (alice, frank) on one repository; edits, stage, commit, switch, pull never affect the other; authors correct; publish visible to carol-like Viewer of Sales (SC-007)
- [ ] T085 [US4] Mutants: commit author not principal; publish not fast-forward; switch to a branch in use; draft keyed without person; base checkout edited — in scripts/mutation-tests.ts

---

## Phase 8: User Story 5 - Governed metrics and protected classifications (Priority: P2)

**Goal**: server-side metric lifecycle and classification guards on every write path.

**Independent Test**: `bun test tests/auth/guards.test.ts` and the matrix guard cases.

- [ ] T086 [P] [US5] Guard tests in tests/auth/guards.test.ts: status to approved/deprecated by Editor refused; self-approval refused for every role; approved metric changed by non-approver stored as proposed with only the `status` bytes changed; description-only change keeps approved; classification/criticalDataElement/team/roles change needs Steward; property at or above protected level needs Steward; level aliases and unmapped values → `internal`; owner match by email/username case-insensitive, unverified owners (FR-060 to FR-067)
- [ ] T087 [P] [US5] Matrix guard cases in tests/auth/matrix.test.ts across Source save, save-batch, item edit, legacy document save, metric save, import with replace, revert and pull (whole operation refused, guarded pointers named) (FR-066)
- [ ] T088 [US5] Guard engine server/auth/guards.ts using the shared parsers (research R11) and `editGuarded`/`approveMetric` decisions; demotion through the item-level edit
- [ ] T089 [US5] Apply guards in every content write path: server/routes/files.ts, server/routes/kpis.ts and metrics routes, server/handler.ts (`POST /api/documents`), server/projects/workspace.ts (import replace, save-batch), server/projects/scm.ts (revert, pull, pull-default preflight)
- [ ] T090 [US5] UI: **Approve** / **Deprecate** actions for Stewards (disabled with reason otherwise, never for own metrics), "unverified owner" badge, owner picker from Users, guard-aware classification editors via src/auth/guards-client.ts in src/metrics/MetricDetail.tsx, src/metrics/MetricWizard.tsx, src/odcs/PropertyEditors.tsx
- [ ] T091 [US5] Browser check scripts/auth-browser-check.ts (part 4): lifecycle as alice and bob; Editor classification edit refused
- [ ] T092 [US5] Mutants: self-approval allowed; approved metric edit not demoted; classification change allowed to Editor; guard skipped in save-batch; guard skipped in pull — in scripts/mutation-tests.ts

---

## Phase 9: User Story 6 - Remote Git with your own credentials (Priority: P2)

**Goal**: delegated credentials per person and command; Admin-only remote changes with host
allow-list.

**Independent Test**: `bun test tests/auth/remote-credentials.test.ts`.

- [ ] T093 [P] [US6] Tests in tests/auth/remote-credentials.test.ts with a local credential-checking Git HTTP test server (Bun) and stubbed token issuance: Azure DevOps OBO token used for that person only; GitHub connect flow then push; missing credential → 428 `{connect}`; token absent from .git/config, files under the data root, logs, audit and responses; host not allowed → 400; remote change and clone by non-Admin → 403; local mode unchanged (FR-080 to FR-084)
- [ ] T094 [US6] OBO and GitHub token handling server/auth/remote-credentials.ts; routes `/auth/github/start` and `/auth/github/callback` in server/routes/auth.ts
- [ ] T095 [US6] Askpass helper server/bin/sw-askpass and per-command environment (`-c credential.helper=`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS`) for fetch/pull/push/sync/clone in server/projects/git.ts; masking in error text
- [ ] T096 [US6] Host allow-list and Admin-only remote/clone/register-projects decisions in server/routes/git.ts, server/routes/clone.ts, server/routes/repos.ts
- [ ] T097 [US6] UI: **Connect GitHub** / Azure DevOps status in the person menu and a connect prompt on 428 in src/scm/ConnectAccount.tsx and src/scm/SourceControl.tsx; credential guide shown in local mode only
- [ ] T098 [US6] Mutants: credential written to .git/config; remote change by non-Admin; host allow-list skipped; remote operation without explicit action — in scripts/mutation-tests.ts

---

## Phase 10: User Story 7 - Agents call the API with their own identity (Priority: P2)

**Goal**: client-credentials access to the agent routes, scoped by Admin grants.

**Independent Test**: `bun test tests/auth/bearer.test.ts`.

- [ ] T099 [P] [US7] Tests in tests/auth/bearer.test.ts: granted client sees only granted mappings; ungranted sees none; bearer outside `/api/agent/*` → 401; expired, wrong signature, wrong audience, wrong issuer, missing `Agent` role → 401 and audited; context does not resolve ontologies from ungranted projects (FR-015, FR-090, FR-091)
- [ ] T100 [US7] Bearer validation server/auth/bearer.ts with `jose` remote JWKS (cache, refresh on unknown `kid` at most every 5 minutes, RS256/ES256 only)
- [ ] T101 [US7] Client principals and grants from `agents.json` in server/auth/principal.ts and server/auth/authorize.ts; audit of every agent call
- [ ] T102 [US7] Mutants: bearer accepted outside agent routes; audience unchecked; client grant ignored — in scripts/mutation-tests.ts

---

## Phase 11: User Story 9 - Run it as a container on Azure (Priority: P3)

**Goal**: reproducible image, Azure deployment template and guide, Keycloak CI.

**Independent Test**: quickstart §3 and §4.

- [ ] T103 [P] [US9] Single-instance lock tests in tests/auth/instance-lock.test.ts (heartbeat, stale lock taken over after 30 s, second live instance refused, release on SIGTERM) (FR-122)
- [ ] T104 [US9] Instance lock in server/index.ts and server/projects/instance-lock.ts
- [ ] T105 [P] [US9] Dockerfile and .dockerignore: `oven/bun:1.4` base, Git ≥ 2.40, `vp build` output, non-root user, `/data` volume, `SW_CACHE_DIR=/tmp/sw-cache`, `HEALTHCHECK` on `/healthz` (research R14)
- [ ] T106 [P] [US9] Azure template deploy/azure/containerapp.bicep (Container Apps environment, app with min=max replicas 1, external ingress to 4310, system-assigned identity, Key Vault secret references, Azure Files mount at `/data`) and deploy/azure/README.md (App Service alternative, scale path)
- [ ] T107 [US9] Keycloak browser check scripts/auth-keycloak-check.ts (start Keycloak 26 with tests/fixtures/keycloak/realm.json via Docker or Podman, skip with a message when absent; sign-in for each user, roles, sign-out, live updates, agent client credentials; SC-005)
- [ ] T108 [US9] GitHub Actions workflow .github/workflows/auth-keycloak.yml (Keycloak pinned by digest via `docker run`, readiness wait, `bun install`, `bun run build`, `bun run test:auth:keycloak`)
- [ ] T109 [US9] Container smoke check scripts/container-smoke.ts: build, run with a temp volume, health and ready, sign-in with the stub provider, restart keeps session and data, second container refused (SC-009)

---

## Phase 12: Polish and cross-cutting

- [ ] T110 [P] README: both modes, configuration table, Entra guide (app roles, groups claim, overage permission, federated credential, Azure DevOps permission), Keycloak guide, role matrix and what each role sees, Admin panel, bootstrap Admin break-glass recovery, outbound calls of server mode, delegated credentials, per-person working copies and publishing, audit log, single-instance limit and scale path, residual exposure of commit messages; counts from tests (constitution VII, FR-121)
- [ ] T111 [P] docs/agent-runtime.md: authentication for agent clients and project grants
- [ ] T112 Full authorization matrix and mutation run; record commands, counts, durations and the manual Entra checklist results in specs/003-authn-authz/verification.md (SC-001 to SC-012)
- [ ] T113 Security review of the diff (cookie flags, CSRF, redirects, token handling, path rules, Git argument handling) with findings fixed or recorded in specs/003-authn-authz/verification.md

---

## Dependencies & Execution Order

- Phase 0 (after 002 merges) → Phase 1 → Phase 2 → stories.
- US1 (Phase 3) before every server-mode story; local-mode work in Phase 2 needs no sign-in.
- US2 and US3 after US1; US2 before US3's matrix write part only for the shared matrix file
  (T051 extends T038).
- US8 after US3 (Admin API reuses the write authorization and the matrix); earlier phases seed
  `data/admin/` from the fixture.
- US4 after US3; US5 after US4 (guards on pull and pull-default use the copy model); US6 after
  US4 (remote operations run in copies); US7 after US2 (agent filtering); US9 after US1 (can run
  in parallel with P2 stories once US1 is done).
- Phase 12 last.

### Parallel opportunities

- Phase 1: T004–T009 together after T003.
- Phase 2: T010, T012, T013, T016, T017, T019, T021, T023 together; implementations follow their
  tests.
- US1: T026–T028 together. US2: T038–T040 together. US8: T056–T058 together, then dialogs
  T064–T071 in parallel with the API tasks T059–T063.
- After US3: US7 (Phase 10) and US9 (Phase 11) in parallel with US8 and US4.

## Implementation Strategy

- **MVP**: Phases 0–5 (rebase, setup, foundations, sign-in, read filtering, role enforcement)
  with access seeded from files: a secure but file-administered team deployment.
- **P1 complete**: add Phase 6 (Admin panel). Tag a pre-release.
- **Increment 2**: Phases 7–10 (working copies, governance guards, remote credentials, agents).
- **Release v0.4.0** after Phase 11 (Azure, Keycloak CI) and Phase 12 with every suite green and
  the README updated.
