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

**Tests**: Required. Constitution 3.1.0 Principle VI mandates unit/API tests, an isolated browser
check per user-visible change, targeted mutants for new decision logic, geometry assertions for
layout work, and the authorization test matrix. Test tasks come first in each phase and must fail
before the implementation tasks that follow.

**Organization**: Setup and foundations, then the container (US9 part 1), the local build scripts
and the Azure DevOps pipeline definition (US10 part 1), sign-in (US1), the Azure delivery
definition (US9 part 2, US10 part 2), then the remaining stories in priority order (P1: US2, US3,
US8; P2: US4, US5, US6, US7). Each phase ends with every existing suite green in local mode
(`bun test`, `check`, `build`, `test:ui`, `test:responsive`, `test:edges`,
`test:grouping-validation`, `test:examples:ui`, the 002 suites, `test:mutation`) plus its own
checks. From Phase 4 on, each phase ends with `bun run ci:validate` green on the owner's machine
(there is no CI service: the GitHub repository runs nothing, FR-130), including the `container`
step and the `pipeline` step (`pipeline:lint`, `pipeline:dry-run`): every browser check a phase
adds is listed in `scripts/gate-suites.ts` and registered in `scripts/container-suites.ts` (local
or server group), so it runs locally, against the image and in the pipeline's Validate stage;
`tests/pipeline/azure-pipelines.test.ts` (T120) fails when a `test:*` script is missing from
those lists without a recorded reason.

**Task IDs**: IDs T001–T114 are unchanged from the first task list; the container and pipeline
revision moved T104–T110 (former Phase 11) into Phases 3, 5 and 6, reworded T032 and T104–T110,
and added T115–T133. The second revision (nothing runs on GitHub; Azure DevOps pipeline for the
target) rewrote T107, T109 and T120–T133 in place, keeping their IDs (133 tasks in 15
phases). The third revision (owner answers OP-9 to OP-11: Entra only on the target, mock OpenID
provider in the gate and pipeline, Keycloak as a local compatibility suite, trial as owner
acceptance, release hand-over to the target's mirror) rewrote T004, T006, T008, T027, T031, T036, T037,
T107–T109, T111, T113, T120, T121, T123, T125, T127, T128 and T133 in place and added the Owner
acceptance section (OA-1 to OA-3, not implementer tasks); still 133 tasks in 15 phases. The
fourth revision (owner decisions OP-12 to OP-14: no sign-in screen, access grants by Entra group
or e-mail as the only role source, custom roles) rewrote T005–T007, T009–T014, T023, T025, T027, T030,
T031, T033, T035–T037, T057, T058, T060, T062, T063, T066, T067, T070, T071, T073–T075, T100,
T102, T108, T111 and OA-2 in place and added T134–T142: 142 tasks in 15 phases. Phases are
therefore not in numeric ID order; the phase headings give the order of work.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[USn]**: US1 sign-in, US2 read filtering, US3 role enforcement, US4 working copies, US5
  governance guards, US6 remote credentials, US7 agent clients, US8 Admin panel, US9 container
  and Azure, US10 local build scripts and Azure DevOps pipeline
- Paths are repository-relative

---

## Phase 0: Rebase on 002 (prerequisite)

- [X] T001 After 002 merges, rebase `003-authn-authz` onto `main`; resolve conflicts only in specs/003-authn-authz/ and .specify/memory/constitution.md (002 must not have changed the constitution beyond 2.1.0; if it did, merge the changes into 3.0.0 and note them in the Sync Impact Report)
- [X] T002 Re-run the route inventory against server/routes/** and server/handler.ts and update the route list of specs/003-authn-authz/contracts/http-api.md for any route 002 added, renamed or dropped

---

## Phase 1: Setup

- [X] T003 Add `openid-client` 6.8.8, `jose` 6.2.13 and `@cedar-policy/cedar-wasm` 4.14.0 (exact versions) to package.json and bun.lock; record size and licence in specs/003-authn-authz/research.md R1–R3
- [X] T004 [P] Configuration module server/config.ts (FR-001, FR-003) parsing and validating every variable of contracts/configuration.md (mode, required server variables, loopback-only `SW_HOST` in local mode, `SW_PUBLIC_URL` origin, `http://` issuer and `SW_GRAPH_URL` only under a loopback public URL and Graph limited to the Microsoft endpoints (FR-141), 32-byte `SW_SESSION_KEY`, at least one `SW_BOOTSTRAP_ADMINS`); tests in tests/auth/config.test.ts
- [X] T005 [P] Fixture workspace tests/fixtures/auth-workspace/: domains Sales, HR, Finance; projects sales-contracts (Sales; restricted path `finance/**` → Finance group and one e-mail address), sales-metrics (Sales; metrics in draft/proposed/approved with owners), hr-people (HR), shared-reference (domain Shared, everyone with access can read), no-domain project; cross-project mapping and ontology references; marker strings `LEAK-<project>-<path>` in every unreadable file; seeded data/admin/ files: `projects.json` with the domains, `roles.json` with the custom role "Metric reviewer" (read group plus `approveMetric` limited to document type metric), `grants.json` with the grants of research R6 (group grants by Entra object ID with display names, e-mail grants for bob, gina and hank, a project-scoped e-mail grant naming the no-domain project, Admin by group), `agents.json`; a Keycloak variant of `grants.json` keyed by group names
- [X] T006 [P] Mock OpenID provider tests/helpers/mock-oidc.ts with loopback runner scripts/mock-oidc.ts and package script `mock-oidc` (research R6, FR-141), built on `jose` and `Bun.serve`: discovery, JWKS with two keys and rotation, authorize with a test-user chooser page (PKCE S256 required, `state`, `nonce`, exact redirect URI), token (authorization code with verifier check, refresh token returning current groups and addresses, client credentials, on-behalf-of grant for T094's stubbed issuance), end-session honouring `post_logout_redirect_uri`, Graph stand-in `POST /v1.0/users/{oid}/checkMemberGroups` and `GET /v1.0/groups/{id}` (each can be told to fail); claim shapes `entra` (default: issuer with tenant id, `oid`, `tid`, pairwise `sub`, `name`, `preferred_username`, `upn` (guest UPN with `#EXT#`), `email`, `xms_edov`, `groups` as GUIDs, `roles` only where a user carries app roles to prove they are ignored, `idtyp=app`/`azp` for applications, overage via `hasgroups` or `_claim_names`/`_claim_sources`), `keycloak` (`email`, `email_verified`, group names) and `generic`; test controls (change groups and addresses, lifetimes, clock offset, forced errors); users and groups of research R6 (alice, bob with `Bob@Example.org`, carol, dave, erin without grant but with an `Admin` app role, frank, gina guest with an unverified address, hank with the custom role, olga with group overage), agent clients sw-agent (granted sales-contracts) and sw-agent-ungranted; self-tests in tests/auth/mock-oidc.test.ts
- [X] T007 [P] Keycloak realm tests/fixtures/keycloak/realm.json matching T006 users (except the overage user olga), groups, `email_verified` per user (false for gina), group mapper and service accounts, no client roles, for the compatibility suite (research R6)
- [X] T008 [P] Script entries test:auth, test:auth:keycloak (compatibility suite, outside the gate), test:admin, test:two-editors and mock-oidc in package.json (pointing to scripts created in later phases)
- [X] T009 [P] Pin schemas/semantic-workbench-access-v1.json (custom roles, grants, projects with domains, agents, deactivated, settings per data-model.md, including the grant and role rules: role id pattern, lower-case addr-spec, scope kinds, conditions) and list it in schemas/README.md as an application schema

---

## Phase 2: Foundational (blocking prerequisites)

- [X] T010 [P] Unit tests for claim normalisation in tests/auth/principal.test.ts (FR-020, FR-022, FR-024): Entra `tid:oid`, `groups`, `hasgroups`/`_claim_names` overage, `idtyp=app`; `roles` ignored for people; verified address = `email` with `xms_edov=true`, else `upn`/`preferred_username`, never a UPN with `#EXT#`, `email` without `xms_edov` ignored; Keycloak `email` only with `email_verified=true`, group paths; generic; addresses trimmed and lower-cased
- [X] T011 Principal model and claim mapper in server/auth/principal.ts (data-model Principal with `verifiedEmail`; `key` = `u` + 20 hex of SHA-256(id)); users registry `state/users.json` with groups, verified address, `access` and unique branch `handle` in server/projects/state.ts
- [X] T134 [P] Unit tests for grant matching and scope expansion in tests/auth/grants.test.ts (FR-024, FR-025, FR-027): group grant matches a member (Entra ids compared case-insensitively, Keycloak names exactly); e-mail grant matches the verified address in any letter case; unverified `email`, guest UPN and Keycloak `email_verified=false` never match; no matching grant → empty list (No access); a person matched by a group grant and an e-mail grant receives both roles; workspace scope covers projects with a domain and never a project without one, except for Admin, which reaches every project; a project-scoped grant naming a project without a domain reaches it; domain and project scopes; `admin` only at workspace scope; deactivated → empty; bootstrap Admin added; provider app roles change nothing
- [X] T135 Grant matching in server/auth/grants.ts (pure functions of data-model "Grant resolution": `resolveGrants`, scope expansion into RoleHolder ids, last-Admin count input), used by server/auth/principal.ts, server/auth/cedar.ts and server/auth/admin-guard.ts
- [X] T012 [P] Cedar schema policies/schema.cedarschema (User, Group, Email, RoleHolder, AccessSet and the other entities of data-model.md; `holders` record type left to the generated fragment), baseline policies policies/baseline.cedar (B6, B8, F1–F8 of contracts/policy-model.md) and built-in roles policies/builtin-roles.json (Appendix B as permissions) (FR-021, FR-031 to FR-035)
- [X] T136 [P] Unit tests for the role compiler in tests/auth/role-compiler.test.ts (FR-026, FR-027): built-in roles compile to policies that reproduce Appendix B; a custom role with conditions (branch, path, document type, highest level) compiles to valid Cedar and permits only matching resources; the generated `holders` record type lists every role; `admin` in a custom role, an unknown action, a condition on an action that cannot carry it and a role id that is not a Cedar identifier are refused; built-in roles cannot be redefined from `roles.json`
- [X] T137 Role compiler server/auth/role-compiler.ts (pure: roles → `permit` policies with ids `role:<roleId>:<n>` and the generated schema fragment, contracts/policy-model.md "Role compiler"), loaded with the baseline by server/auth/cedar.ts
- [X] T013 [P] Unit tests for the decision boundary over the baseline and the compiled built-in roles: role matrix of spec Appendix B row by row through grants of each scope kind, union of two roles from a group grant and an e-mail grant, restricted path by group and by e-mail, signed-in person without grant denied everything, 404 vs 403 status, memoisation per rule class, invalid policy set refuses to load, local implicit Admin, classification never affects reading (FR-030 to FR-036), in tests/auth/authorize.test.ts
- [X] T014 Cedar loader server/auth/cedar.ts (import `@cedar-policy/cedar-wasm/nodejs`, preparse schema plus the generated fragment and the policy set from T137, entity builder for User/Group/Email/RoleHolder/AccessSet/Domain/Repository/Project/File/Metric/Branch/TrashEntry/Workspace with grants expanded into RoleHolder parents by T135, rebuilt on grant, role, domain or project change)
- [X] T015 Decision boundary server/auth/authorize.ts: `authorize`, `filter`, `AccessView` (readable projects, path predicate, roles), per-request memo, 404/403 mapping (contracts/policy-model.md)
- [X] T016 [P] Performance test tests/auth/filter-perf.test.ts: 5,000 files in 20 projects, project listing filter ≤ 150 ms and full load ≤ 10% over local mode (SC-006)
- [X] T017 [P] Route → action table tests/auth/route-actions.ts and test tests/auth/route-actions.test.ts that fails when any route in server/routes/** or server/handler.ts lacks a row (contracts/http-api.md)
- [X] T018 Request middleware in server/handler.ts: resolve principal (local implicit Admin, or session/bearer placeholders returning 401 until US1), call `authorize` for the route's action before the route runs, map decisions to 401/403/404, attach `X-Request-Id` (FR-002, FR-004, FR-030, FR-036)
- [X] T019 [P] Unit tests for the audit writer (fields of contracts/audit-log.md, hash chain `prev`, no token/content fields, stdout mirror, monthly files, retention 400 days; FR-100, FR-101) in tests/auth/audit.test.ts
- [X] T020 Audit writer server/auth/audit.ts and calls from the middleware for every deny and every write action
- [X] T021 [P] Unit tests for the administration repository (create at first use, load and validate against schemas/semantic-workbench-access-v1.json, one commit per change authored by the Admin, history, diff, rollback as new commit, hash-checked writes) in tests/auth/admin-repo.test.ts
- [X] T022 Administration repository server/auth/admin-repo.ts on `data/admin/` reusing server/projects/git.ts; Admin rules from `data/admin/policies/*.cedar` merged with the baseline in server/auth/cedar.ts
- [X] T023 [P] Unit tests for the last-Admin guard and bootstrap Admins (removing the last Admin grant, narrowing the last Admin group grant, removing the last Admin's e-mail grant, deactivating the last Admin, a forbid on Admin, bootstrap always Admin by verified address or stable id and never by an unverified address, bootstrap use audited) in tests/auth/admin-guard.test.ts
- [X] T024 Last-Admin guard server/auth/admin-guard.ts
- [X] T025 Mutants: decision ignores grant scope; workspace grant reaches a project without a domain; unverified e-mail matches an e-mail grant; guest UPN used as address; e-mail compared case-sensitively; provider app role grants a role; signed-in person without a grant allowed; custom role condition dropped by the compiler; custom role accepts `admin`; 404 replaced by 403; invalid policy accepted at load; last-Admin guard off; audit entry missing for a denial — in scripts/mutation-tests.ts

**Checkpoint**: every route passes through the boundary; local mode suites green with the
implicit Admin.

---

## Phase 3: User Story 9 (part 1) - Container image and local Compose (Priority: P1)

**Goal**: one image that runs local mode (and, from Phase 5, server mode), with health, a
non-root user, the data root as a volume, single-instance lock with revision hand-over, and the
existing browser suites runnable against it.

**Independent Test**: `bun test tests/auth/instance-lock.test.ts tests/server/health-static.test.ts`
and `bun run test:container` (local group).

- [X] T104 [P] [US9] Single-instance lock tests in tests/auth/instance-lock.test.ts: revision identity (`CONTAINER_APP_REVISION`, else `SW_VERSION+SW_COMMIT`, else `dev`), heartbeat every 10 s, refusing instance re-checks every 10 s, stale lock (older than 30 s) taken over, live lock of the same revision → refuse and not ready (FR-122), live lock of a different revision → ready, 503 with `Retry-After` on non-health routes, take-over on release or staleness (FR-123), release on SIGTERM
- [X] T115 [P] [US9] Tests in tests/server/health-static.test.ts: `/healthz` returns `{ok, version, commit}` and no workspace data without sign-in; `/readyz` 503 until lock, recovery and first scan, then `state: serving`; under hand-over `state: handover` before any recovery, scan or data-root write, recovery only after the lock is taken (FR-123); `SW_SERVE_STATIC=1` serves `dist/` with SPA fallback and keeps the local-mode origin and host checks; non-writable data root stops start-up naming path and uid (FR-124, FR-125)
- [X] T105 [US9] Instance lock with revision hand-over in server/projects/instance-lock.ts and server/index.ts (revision identity as in T104; data-model Instance lock)
- [X] T116 [US9] Static serving of `dist/` in server/static.ts (both modes when `SW_SERVE_STATIC=1`), `/healthz` and `/readyz` in server/routes/health.ts, writable data root probe at start-up in server/index.ts, start-up hint in local mode when `SW_IN_CONTAINER=1` (set by the image) that host networking (Compose local profile) is required (FR-124, FR-125; moved out of T032)
- [X] T106 [US9] Dockerfile and .dockerignore: multi-stage (`deps`, `build`, `prod-deps`, `runtime`), bases pinned by digest, runtime `oven/bun:1.4-slim` or `-alpine` with Git ≥ 2.40 asserted at build, `USER bun`, `VOLUME /data`, `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1`, OCI labels and `SW_VERSION`/`SW_COMMIT` from build arguments, `HEALTHCHECK` with a Bun fetch of `/healthz`, exec-form entry point (research R17, FR-120)
- [X] T117 [P] [US9] compose.yaml (build arguments `SW_VERSION` from package.json and `SW_COMMIT` from `git rev-parse HEAD`, passed through the environment by `image:build` and documented for direct `docker compose` use) with profile `local` (`network_mode: host`, `SW_MODE=local`, `./.data:/data`); `.data/` and `.env.server` added to .gitignore (OP-8, FR-126)
- [X] T118 [US9] Browser checks read `SW_BASE_URL` (default the dev server) through scripts/browser-check.ts; replace hard-coded `http://127.0.0.1:5173` in scripts/*.ts; no behaviour change against the dev server
- [X] T110 [US9] Container check scripts/container-check.ts and suite list scripts/container-suites.ts, script `test:container` in package.json: build (or take `--image`), run local mode with host networking and a temporary data folder, assert uid ≠ 0, `git --version` ≥ 2.40, labels, health and ready, run the local suite group against `http://127.0.0.1:4310`, restart keeps data, a second container of the same image on the same volume with `SW_PORT=4311` answers 503 on `/readyz` and logs the single-replica constraint (SC-009 local part)
- [X] T119 [US9] Mutants: second instance of the same revision not refused; hand-over serves data before taking the lock; hand-over instance runs recovery before taking the lock; `/readyz` reports `serving` before recovery (outside a hand-over); `/healthz` includes workspace data — in scripts/mutation-tests.ts

**Checkpoint**: the image runs local mode and passes the local browser suites.

---

## Phase 4: User Story 10 (part 1) - Local build scripts and the Azure DevOps pipeline definition (Priority: P1)

**Goal**: one local command runs the whole quality gate, the image build, scan and bill of
materials and the suites against the image; the repository ships an Azure DevOps pipeline whose
Validate and Image stages call exactly those scripts, checked locally by a schema lint and a dry
run; nothing runs on GitHub.

**Independent Test**: `bun test tests/pipeline/`; `bun run ci:validate` green; with a deliberately
failing unit test it fails naming `verify`; `bun run pipeline:dry-run -- --run pr` and
`--run main` print the expected stages and steps.

- [X] T120 [P] [US10] Pipeline rules test tests/pipeline/azure-pipelines.test.ts (parses azure-pipelines.yml, azure-pipelines-rollback.yml and deploy/azure-devops/templates/*.yml with `yaml`): every rule of the pipeline check in contracts/delivery-pipeline.md (stage order, script steps call package scripts outside the setup template, allowed tasks pinned to a major version, images pinned by digest, no secret variables or secret-looking literals, `addSpnToEnvironment` not true, `azureSubscription` only from service-connection parameters, Deploy only for `refs/tags/v*` as a deployment job on the environment parameter, every gate `test:*` script of package.json in scripts/gate-suites.ts and in scripts/container-suites.ts or a recorded exclusion, `.trivyignore` entries with reason and unexpired date, no mention of Keycloak, a Keycloak image, `test:auth:keycloak` or the `keycloak` Compose profile and no `services:` container in any pipeline file, `test:auth:keycloak` only as a recorded exclusion) and no `.github/workflows/` or `.github/dependabot.yml` in the repository (FR-130, FR-132, FR-133, FR-134, FR-136, FR-140, SC-019)
- [X] T121 [US10] Local gate runner scripts/ci-validate.ts and gate suite list scripts/gate-suites.ts, script `ci:validate` in package.json: steps `verify`, `mutation`, `browser` (sign-in suites included from T109, against the mock OpenID provider), `image`, `container`, `pipeline` in that order (no Keycloak step); `--step` (repeatable), `--suite`, `--keep-going`; container-runtime steps fail instead of skipping; JUnit XML and `summary.json` in out/ci/; non-zero exit naming the failed steps; `out/` added to .gitignore (FR-131)
- [X] T122 [US10] Image scripts scripts/image.ts with package scripts `image:build` (Docker or Podman, `SW_VERSION`/`SW_COMMIT` build arguments, `-dirty` suffix, tags `semantic-workbench:sha-<commit>` and `:dev`), `image:scan` (Trivy binary or pinned Trivy image, CRITICAL/HIGH with fix, .trivyignore, `--ref` for a registry digest, JSON and SARIF in out/image/), `image:sbom` (SPDX JSON in out/image/), `image:push` (`--registry`, refuses `-dirty`, prints the digest); tests of argument building and ignore-file parsing in tests/pipeline/image.test.ts (FR-131, FR-132)
- [X] T123 [US10] azure-pipelines.yml with templates deploy/azure-devops/templates/setup-steps.yml (pinned Bun, frozen install, Playwright Chromium), validate-jobs.yml and image-jobs.yml: parameters and variable group of contracts/delivery-pipeline.md, triggers (`main`, tags `v*`), stage Validate (jobs `verify`, `mutation`, `browser` as a literal matrix equal to scripts/gate-suites.ts (auth leg from T109), `pipeline`, no Keycloak and no service containers, each `bun run ci:validate -- --step …`, test results and failure screenshots published), stage Image (on tag runs a first `check` job calling `deploy:check-version` with the push connection; `ci:validate --step image --step container`, bill of materials and scan report as pipeline artifacts, push to the target registry through `AzureCLI@2` with the push service connection on `main` and `v*` only after checking every variable-group value, digest as output variable); deploy/azure-devops/sample-variables.yml with placeholder values (FR-133, FR-134)
- [X] T124 [US10] `pipeline:lint` (scripts/pipeline-lint.ts: pinned copy of the Azure Pipelines schema in deploy/azure-devops/schema/service-schema.json validated with the existing Ajv setup, plus the rules of T120) and `pipeline:dry-run` (scripts/pipeline-dry-run.ts: parameter expansion with sample-variables.yml, conditions for `pr`, `main` and `tag:<v>` runs, printed plan, `--execute` runs local steps and Azure steps on the fake client of tests/pipeline/fake-azure.ts); tests in tests/pipeline/dry-run.test.ts (plan per run kind; a step present in the pipeline but not in `ci:validate` fails); record the first full `ci:validate` duration against SC-013 in specs/003-authn-authz/verification.md (FR-140, SC-018)

**Checkpoint**: `ci:validate` is the gate for every later phase; the pipeline's Validate and Image
stages are defined, linted and dry-run.

---

## Phase 5: User Story 1 - Sign in to a team workbench, and nothing changes locally (Priority: P1) 🎯 MVP

**Goal**: server mode with OIDC single sign-on and no workbench sign-in screen (direct redirect,
**No access** and signed-out pages), encrypted server sessions, cookie-authenticated live
updates; local mode unchanged.

**Independent Test**: `bun test tests/auth/oidc.test.ts tests/auth/sessions.test.ts
tests/auth/auth-pages.test.ts` and
`bun run test:auth` (sign-in part) with the mock OpenID provider (Entra shape).

- [X] T026 [P] [US1] Unit tests for sessions: AES-256-GCM persistence under `SW_SESSION_KEY`, file named by SHA-256 of the id, idle 8 h / absolute 24 h expiry, survives restart, end-session, cookie `__Host-sw-session` with `Secure; HttpOnly; SameSite=Lax; Path=/` (loopback development exception documented, non-loopback `http://` public URL refused), in tests/auth/sessions.test.ts (FR-011 to FR-013)
- [X] T027 [P] [US1] Unit tests for the OIDC flow against the mock OpenID provider (Entra shape, and Keycloak shape for the mapping): PKCE S256, `state` and `nonce` checked, issuer/audience/signature/expiry with 300 s skew, JWKS key rotation, Entra `tid` allow-list, `returnTo` same-origin only, principals without a grant and deactivated principals sent to No access, refresh re-reads groups and the address and re-matches grants, logout calls end-session with `post_logout_redirect_uri` = `/auth/signed-out`, `http://` issuer refused with a non-loopback public URL, in tests/auth/oidc.test.ts (FR-010, FR-012, FR-017, FR-141)
- [X] T028 [P] [US1] Unit tests for CSRF: non-GET without `X-SW-Request: 1` or with a foreign Origin → 403 in server mode, in tests/auth/csrf.test.ts (FR-016)
- [X] T138 [P] [US1] Tests for the pages outside the workspace in tests/auth/auth-pages.test.ts (FR-018): unauthenticated `GET /` and any page → 302 to the provider's authorization endpoint with PKCE S256, `state`, `nonce` and the path kept as `returnTo`, API → 401; `/auth/no-access` shows the display name and verified address (or username), the "an Admin must grant you access" sentence and a **Sign out** form that works without scripts (per-session token, Origin checked; a form without the token or from another origin → 403), contains no project, file or count, and redirects to `/` for a person with access; `/auth/signed-out` never sets `__Host-sw-auth` or redirects to the provider; the sign-in error page names the reason and offers **Try again**; an API call by a person without a grant → `403 {error: 'no access'}`
- [X] T029 [US1] Session store server/auth/sessions.ts
- [X] T030 [US1] OIDC client server/auth/oidc.ts with `openid-client` (discovery, login, callback, refresh, logout; client secret, private key or managed-identity client assertion) and routes `/auth/login`, `/auth/callback`, `/auth/logout` in server/routes/auth.ts; an unauthenticated page request starts the sign-in at once (302 to the provider) from the middleware of server/handler.ts, so no workbench sign-in page exists (FR-018)
- [X] T031 [US1] Directory client server/auth/directory.ts (app-only token, `SW_GRAPH_URL`: default Microsoft Graph, the mock's stand-in in tests, timeouts) and Entra group overage: `checkMemberGroups` for the group ids named in grants and restricted paths, failure → no group membership plus message and audit, called from server/auth/principal.ts (FR-022)
- [X] T032 [US1] Mode selection and binding in server/index.ts: local refuses non-loopback, server requires valid config and policies, always serves `dist/` (T116) with CSP and security headers (research R15) (FR-003 to FR-005)
- [X] T033 [US1] `GET /api/me` in server/routes/me.ts with roles per workspace and project, role names and role sources (group grant, e-mail grant, bootstrap) (contracts/http-api.md)
- [X] T139 [US1] Server-rendered pages **No access**, **Signed out** and sign-in error in server/routes/auth.ts (minimal HTML with the shared stylesheet, no workspace data; contracts/ui-contracts.md), and the middleware rule that sends a signed-in person without a grant, or a deactivated one, to **No access** (pages) or `403 {error: 'no access'}` (API) in server/handler.ts, audited with `reason: no-grant` (FR-018, FR-021)
- [X] T034 [US1] Live-update stream authenticates by cookie and closes on sign-out, expiry or End session (`access` event) in server/projects/events.ts and server/routes/events.ts (FR-014)
- [X] T035 [US1] Frontend: fetch wrapper adds `X-SW-Request: 1` and reloads the page on 401 (the server then redirects to the provider) in src/projects/api.ts; `useMe` hook src/auth/useMe.ts; person menu with name, verified address, role names, **Sign out** in src/main.tsx (contracts/ui-contracts.md)
- [X] T036 [US1] Browser check scripts/auth-browser-check.ts (part 1), starting the mock OpenID provider on loopback itself with the fixture's grants: the first request goes straight to the mock's authorize page (no workbench sign-in page) and returns to the requested path; sign-in for each test user (Entra shape), header role from a group grant (alice) and from an e-mail grant matched case-insensitively (bob), erin (no grant, app role `Admin` in her token) and gina (guest, unverified address) see **No access** with their name and address and can sign out, no token in `document.cookie`/storage/responses, live updates arrive, group change applied at refresh, overage user olga gets the Sales grant through the Graph stand-in and a forced Graph failure shows the no-membership message, sign-out closes the stream and lands on **Signed out**, which does not sign in again until **Sign in again**, session expiry redirects to the provider, sign-in under 5 s (SC-005, SC-019); geometry of the three pages across the viewport matrix; local-mode smoke unchanged
- [X] T037 [US1] Mutants: cookie without HttpOnly or Secure; CSRF header not required; nonce unchecked; `tid` unchecked; overage failure grants membership; unauthenticated page served instead of the provider redirect; signed-out page starts a sign-in; No access page includes workspace data; session not expired after absolute lifetime; `http://` issuer accepted with a non-loopback public URL; `SW_GRAPH_URL` outside the allowed endpoints accepted — in scripts/mutation-tests.ts
- [X] T108 [US1] Keycloak compatibility suite scripts/auth-keycloak-check.ts behind `test:auth:keycloak` (Keycloak 26 pinned by digest with tests/fixtures/keycloak/realm.json and the Keycloak variant of the fixture grants via Docker or Podman, readiness wait on the realm discovery document, container removed afterwards, fails naming the missing runtime when none is present; direct redirect to Keycloak's login form, sign-in for each user, roles from group and e-mail grants, **No access** for erin and gina (`email_verified=false`), sign-out to **Signed out**, live updates, agent client credentials; SC-005); outside `ci:validate` and the pipeline, run on the owner's machine (research R6)
- [X] T109 [US1] Sign-in in the gate and the pipeline without Keycloak: `test:auth` listed in scripts/gate-suites.ts and as a leg of the `browser` matrix in deploy/azure-devops/templates/validate-jobs.yml (it starts the mock OpenID provider on the agent's loopback); `test:auth:keycloak` recorded as an exclusion in scripts/gate-suites.ts; `pipeline:lint` and tests/pipeline/azure-pipelines.test.ts fail on a Keycloak reference or a service container (rule of T120); `pipeline:dry-run -- --run pr` shows the auth leg and no Keycloak (FR-131, FR-134, SC-019)
- [X] T125 [US1] Server group in scripts/container-suites.ts, run by `test:container` (so by the `container` step of `ci:validate` and the Image stage): the check starts the mock OpenID provider on host loopback and the image in server mode with host networking against it; sign-in as each test user, sign-in within 30 s of start, restart keeps the session and data, second container on `SW_PORT=4311` refused as in T110, a container of a different revision (other `SW_COMMIT`) on the same volume waits in `handover` and takes over within shutdown + 30 s after the first stops (SC-009, SC-017 local measurement). Compose compatibility profile `keycloak` in compose.yaml (`keycloak` with the test realm on `127.0.0.1:8080`, `workbench-server` with host networking, loopback public URL) and .env.server.example with development-only values, for the owner's machine only (FR-126)

**Checkpoint**: sign-in works with the mock OpenID provider, in the container and (compatibility,
owner's machine) with Keycloak; local mode unchanged; `ci:validate` green with the sign-in suites
and the server container group, none of which needs Keycloak.

---

## Phase 6: User Story 9 (part 2) and User Story 10 (part 2) - Azure delivery definition (Priority: P1)

**Goal**: the Deploy stage and the rollback pipeline for the target: version check, approval
through the environment, rescan, promotion on the same digest, deployment by digest to Azure
Container Apps through workload identity federation, smoke test and automatic rollback, all in
scripts that run locally against a fake Azure client; the target setup guide.

**Independent Test**: `bun test tests/pipeline/`; `bun run pipeline:dry-run -- --run
tag:v0.4.0-alpha.1 --execute` (deploy, smoke failure and rollback paths on the fake client);
`bun run test:container`. These are the done criteria; the real trial is owner acceptance OA-1.

- [X] T126 [P] [US10] Deploy logic tests in tests/pipeline/deploy.test.ts with the fake Azure client: version check refuses a tag whose version core differs from `package.json` or is older than the highest version ever promoted (highest version tag in the registry), before any Azure write; promotion uses `imagetools create` on the recorded digest, never import or rebuild; missing variable-group values named before any call; preflight refuses each wrong setting by name (revision mode, replicas, volume, identity, registry identity, mode, host, port, Key Vault references, Entra client and tenant); the active revision and digest are recorded before the update; the update uses the digest; the version tag is added only after a passing preflight and before the update; smoke failure copies the recorded revision, smoke-tests it and fails; manual rollback resolves `previous` or the version of its tag ref to a revision or digest and refuses non-tag refs (FR-135, FR-138, FR-139)
- [X] T127 [P] [US10] Smoke test tests in tests/pipeline/deploy-smoke.test.ts against a local Bun server: each check of contracts/delivery-pipeline.md failing alone fails the smoke; `state: handover` is waited out and never accepted as ready; the authorization endpoint is read from discovery (mock OpenID provider in Entra and Keycloak shapes); version compared with `package.json`, commit exactly; `--loopback` relaxes only HSTS and the `Secure` flag (FR-137)
- [X] T128 [US10] Smoke test scripts/deploy-smoke.ts and script `deploy:smoke` (one line per check, JSON summary); the `container` step of `ci:validate` runs it with `--loopback` against the server-mode container of T125 (mock OpenID provider)
- [X] T129 [US10] Deploy script scripts/deploy.ts with scripts `deploy:check-version`, `deploy:azure` and `deploy:rollback` (version check, preflight, record, update, wait for running and ready revision, smoke, automatic rollback by revision copy; Azure CLI client, `--fake` client; reads the variable-group names from the environment), runnable on the owner's machine after `az login`
- [X] T130 [US10] Deploy stage in azure-pipelines.yml with deploy/azure-devops/templates/deploy-steps.yml: condition `refs/tags/v*`, stage-level `lockBehavior: runLatest`; deployment job on `${{ parameters.deployEnvironment }}` with `checkout: self` and the setup template, `AzureCLI@2` with the deploy service connection: `image:scan --ref` on the digest from the Image stage, then `deploy:azure` (preflight, promotion with `docker buildx imagetools create` on the same digest, update, smoke, rollback); summary with digests, revisions and smoke results (FR-135, FR-136, FR-137, FR-138)
- [X] T131 [US10] azure-pipelines-rollback.yml (`trigger: none`, `pr: none`, queued on the tag ref of the version to restore, parameter `target` = `tag` or `previous`, same parameters and variable group, stage-level `lockBehavior: runLatest`, deployment job on the same environment with checkout and setup calling `deploy:rollback`; for `previous` the smoke expects the restored image's labels); both pipelines pass `pipeline:lint` and appear in the dry run (FR-138, FR-140)
- [X] T107 [P] [US9] Target setup guide deploy/README.md (no infrastructure as code, FR-139): every Azure resource, setting and role of contracts/delivery-pipeline.md with portal and Azure CLI steps (resource group, Log Analytics, Container Apps environment, storage account and share with mount options, Key Vault, registry with retention rule, container app in single revision mode with one replica, probes, volume and identity, the app identity `id-sw-app` created and granted `AcrPull` and Key Vault Secrets User before the app); every Azure DevOps item (the two Azure Resource Manager service connections with workload identity federation and their role assignments, pipeline permissions limited to the two pipelines, environment with approvals, branch control and exclusive lock, variable group with every value and none secret, agent pool, import of both pipelines, branch policy for pull requests, preview run); release hand-over to the target's Azure Repos mirror (release branch, pull request into `main`, then the tag; or Git bundle with SHA-256 checksum and `git bundle verify`, source archive as fallback with the commit mapping recorded; the mirror never fetches from this repository) (FR-142); App Service alternative; scale path
- [X] T132 [US10] Mutants: smoke test ignores a version mismatch; smoke test accepts an unauthenticated 200; smoke test accepts `state: handover`; rollback skipped after a failed smoke; preflight accepts more than one replica; version check accepts a tag older than the last deployed version; pipeline lint accepts a step that is not a package script — in scripts/mutation-tests.ts
- [X] T133 [US10] Owner trial runbook deploy/trial-runbook.md (FR-143, contract in contracts/delivery-pipeline.md): numbered steps with the command or portal action, the expected output and a pass/fail box for set-up from deploy/README.md, hand-over of `v0.4.0-alpha.1`, preview run, `main` run, tag run with approval and smoke test, the Entra checklist of quickstart §5, restart and revision hand-over (SC-017), rollback drill (SC-015), no stored credential (SC-016), final deploy role set; the report block with identifiers as placeholders; and an empty "Owner trial" section in specs/003-authn-authz/verification.md where the report is recorded. Check every command of the runbook against the dry run (`pipeline:dry-run --execute`) and the scripts' `--help`. Running the trial is OA-1, not this task

**Checkpoint**: the delivery definition is complete and verified locally; a target can deploy and
roll back; any Azure environment holds only fixture data until Phases 7–9 are done.

---

## Phase 7: User Story 2 - See only what you may see (Priority: P1)

**Goal**: the server never sends unreadable files, paths, events or counts.

**Independent Test**: `bun test tests/auth/matrix.test.ts` (read part) and `bun run test:auth`
(hidden files part).

- [X] T038 [P] [US2] Authorization test matrix tests/auth/matrix.test.ts (read part): every read route of tests/auth/route-actions.ts × users of T006 × readable/unreadable targets; asserts status and scans every body for `LEAK-` markers and unreadable paths/project names (SC-001, SC-002)
- [X] T039 [P] [US2] SSE filter tests in tests/auth/events-filter.test.ts: live and replayed events, multi-item events reduced, per-person suggestions count, `access` event and close on grant change
- [X] T040 [P] [US2] Git history filter tests in tests/auth/git-filter.test.ts: log lists readable paths only and `hiddenCommits`, show/diff/versions 404 for restricted or removed-restricted paths
- [X] T041 [US2] `documentsFor(view)` and readable listings in server/projects/workspace.ts; `GET /api/projects` returns readable projects with `hiddenFiles`; unreadable project/file → NotFoundError (FR-040, FR-045)
- [X] T042 [US2] Replace `ws.documents()` with `documentsFor(view)` in server/handler.ts (agent catalog/context/plan, `/api/documents`), server/routes/metrics.ts, server/routes/kpis.ts and the 002 metrics routes; agent context resolves ontologies and models only within readable projects in server/agent/runtime.ts (FR-041)
- [X] T043 [US2] Delete impact (`hiddenReferences`), suggestions computed over readable files, conflict messages without names for unreadable occupants (move, import, restore) in server/projects/workspace.ts, server/projects/suggestions.ts, server/projects/trash.ts (FR-045)
- [X] T044 [US2] Tagged events and per-connection filtering, filtered replay, per-person suggestions count in server/projects/events.ts (contracts/sse-events.md, FR-042)
- [X] T045 [US2] Git read routes filtered in server/routes/git.ts and server/projects/scm.ts (FR-043)
- [X] T046 [US2] Trash listing/undo/restore/purge filtered by readable paths and ownership; drafts owner-only in server/routes/trash.ts, server/routes/drafts.ts (FR-044)
- [X] T047 [US2] `/api/status` reduced for non-Admins in server/routes/projects.ts (FR-047)
- [X] T048 [US2] UI: "N files you cannot open" line per project in src/projects/Sidebar.tsx; unresolved-reference stubs unchanged in lineage and mapping graph
- [X] T049 [US2] Browser check scripts/auth-browser-check.ts (part 2): Sales Viewer sees no HR project, restricted files counted, search/lineage/mapping graph/metrics/document export/agent-context export contain no markers (FR-046)
- [X] T050 [US2] Mutants: filter returns unfiltered list; SSE send skips filter; replay skips filter; draft served to non-owner; trash lists others' entries; git show ignores path rule; agent context falls back to an unreadable project — in scripts/mutation-tests.ts

**Checkpoint**: zero leaked markers across the read matrix.

---

## Phase 8: User Story 3 - Roles decide what you can do (Priority: P1)

**Goal**: every write authorised by role and scope; UI follows capabilities.

**Independent Test**: `bun test tests/auth/matrix.test.ts` (write part) and `bun run test:auth`
(controls part).

- [X] T051 [P] [US3] Matrix write part in tests/auth/matrix.test.ts: every write route × users × readable/unreadable targets; Viewer 403/404, Editor allowed in own domain, cross-project move needs both sides, Admin-only actions (purge, clear, delete project, remote, clone, register projects, status details); denials leave files, Git state, drafts and state unchanged (byte compare) and are audited (FR-050, FR-052)
- [X] T052 [US3] Wrap every write route with its action and target resource(s) in server/routes/*.ts and server/handler.ts, including 002 routes (commit with paths/push, revert, clone, repository projects, subfolder delete mode, metrics); identity and credential-helper routes 404 in server mode
- [X] T053 [US3] Capability helper src/auth/can.ts from `/api/me` plus each project's `actions` (built-in and custom roles alike); hide or disable (with reason tooltip) controls in src/main.tsx, src/projects/Sidebar.tsx, src/projects/Trash.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx, src/metrics/MetricsView.tsx, src/edit/*.tsx, src/odcs/PropertyEditors.tsx (FR-051, contracts/ui-contracts.md)
- [X] T054 [US3] Browser check scripts/auth-browser-check.ts (part 3): controls per role, crafted requests refused; geometry of the person menu and disabled tooltips across the viewport matrix in scripts/responsive-ui-tests.ts
- [X] T055 [US3] Project creation by a Steward assigns one of the creator's domains (dialog choice when several); Admin may leave it without domain; tests in tests/auth/project-create.test.ts, implementation in server/routes/projects.ts, server/routes/clone.ts and src/projects/ProjectDialogs.tsx (FR-053)
- [X] T056 [US3] Mutants: write route skips authorize; cross-project move checks only the source; Viewer allowed to save drafts — in scripts/mutation-tests.ts

**Checkpoint**: P1 enforcement complete; grants seeded in fixtures.

---

## Phase 9: User Story 8 - Admin panel: control roles, policies and access (Priority: P1)

**Goal**: Admins grant roles to Entra groups and to people by e-mail, create custom roles with
members, manage users, project access and policies (structured and raw, dry run, history,
rollback), check access, review and export audit, and see settings, without being able to remove
the last Admin.

**Independent Test**: `bun test tests/auth/admin-api.test.ts tests/auth/dry-run.test.ts
tests/auth/directory.test.ts` and
`bun run test:admin`.

- [X] T057 [P] [US8] API tests for `/api/admin/*` and `/api/audit*` in tests/auth/admin-api.test.ts: Admin-only (Steward only audit of own domains), schema validation, `baseVersion` stale → 409, each change one commit in data/admin with author and message, sessions ended on deactivate, `access` event on change, secrets never returned; grants: a group grant and an e-mail grant (stored lower-cased) give their members the role at the next request, a duplicate grant, an unknown role, domain or project and `admin` with a non-workspace scope → 400; roles: create, edit and delete a custom role, built-in role change or deletion → 400, `admin` action → 400, deleting a role with grants → 409 with the affected people, then accepted with `confirmDeleteInUse` and role plus grants removed in one commit; a person without a grant who receives one leaves **No access** at the next request (FR-025, FR-026, FR-102 to FR-114)
- [X] T058 [P] [US8] Dry-run tests in tests/auth/dry-run.test.ts: changed decisions over the matrix fixture and the last 1,000 audit snapshots; "what changes for whom" for a grant change, a custom role edit and a custom role deletion lists exactly the people and clients whose actions change, with gained and lost actions per project and access kept, gained or lost; activation of a policy, role or grant change refused without a matching dry run or with validation errors; rollback restores previous decisions for every matrix case (SC-012)
- [X] T059 [P] [US8] Policy template tests in tests/auth/policy-templates.test.ts: each template of contracts/policy-model.md generates valid Cedar; a `forbid` on Admin without narrowing condition is rejected; Admin rules cannot override baseline forbids (FR-107)
- [X] T140 [P] [US8] Directory lookup tests in tests/auth/directory.test.ts against the mock's Graph stand-in: `GET /api/admin/groups/:id` returns the display name; a lookup failure or timeout returns `resolved: false` and the grant is still saved by ID; names refreshed when the panel opens; the app-only token goes only to the allowed directory endpoint; Keycloak mode returns the group name itself (FR-025)
- [X] T060 [US8] Admin API server/routes/admin.ts: users (list, search, filter "no access", deactivate, reactivate), roles, grants, group name lookup through server/auth/directory.ts, projects with domains, agents, settings, versions, diff, rollback, sessions, provider status, `check`, `who-can` (contracts/http-api.md)
- [X] T141 [US8] Role and grant service in server/auth/access-admin.ts: validate `roles.json` and `grants.json` (data-model rules), compile with T137 and validate the whole policy set before activation, refuse built-in role changes and `admin` in custom roles, delete-in-use confirmation with the affected people from the dry run, remove a deleted role's grants in the same commit, last-Admin guard through T024, close the live-update streams of affected people (FR-025, FR-026, FR-109, FR-110)
- [X] T061 [US8] Policy service: list baseline and Admin rules, validate (Cedar `checkParsePolicySet` + schema validation with line/column), templates → Cedar text, enable/disable via `@enabled`, in server/auth/policies.ts
- [X] T062 [US8] Dry run server/auth/dry-run.ts (matrix fixture shipped as data in policies/matrix-cases.json generated from tests/auth/route-actions.ts; audit snapshot replay; "what changes for whom" over users.json and agent clients for role, grant and project changes)
- [X] T063 [US8] Access simulator and who-can in server/auth/authorize.ts (`explain` returning the matching grants, the roles they give, the deciding rules and the attributes; hypothetical principals described by groups and an e-mail address; who-can lists groups, e-mail addresses, people and clients with their actions) (FR-111)
- [X] T064 [US8] Audit query and export (JSONL, CSV) with Steward domain scoping in server/routes/audit.ts and server/auth/audit.ts (FR-102)
- [X] T065 [P] [US8] Admin launcher and dialog shell src/admin/AdminLauncher.tsx (header **Admin** entry, Admins only; local implicit Admin) reusing src/projects/Modal.tsx size variants
- [X] T066 [P] [US8] Users & groups dialog src/admin/UsersDialog.tsx (search, verified address, group names, role source chips: group grant, e-mail grant, bootstrap; "no access" filter with **Grant access** opening the grant form prefilled with the address; deactivate/reactivate, end sessions, check access shortcut) (FR-104)
- [X] T067 [P] [US8] Roles & access dialog src/admin/RolesAccessDialog.tsx: **Grants** tab (table of every grant, add, change, remove) and **Roles** tab (built-in roles read-only with **Duplicate as custom role**; custom roles list; **Delete** with the confirmation listing affected people) using src/admin/RoleEditor.tsx (name, description, actions checklist grouped as Appendix B, optional condition row per action, members as grants) (FR-105, FR-026)
- [X] T142 [P] [US8] Grant form src/admin/GrantForm.tsx shared by both tabs and by Users & groups: member kind Entra group (object ID field, display name looked up and shown, "name not resolved" otherwise) or e-mail (address field, normalised to lower case on save), role picker with built-in and custom roles, scope (whole workspace, domains, projects; workspace only for Admin), dry-run result before saving (FR-025)
- [X] T068 [P] [US8] Policies dialog src/admin/PoliciesDialog.tsx and src/admin/PolicyEditor.tsx (template forms, raw editor with CodeMirror and inline validation, dry-run result, enable/disable, delete) (FR-106, FR-108)
- [X] T069 [P] [US8] Version history src/admin/VersionHistory.tsx (who/when/message, diff with the existing diff view, **Roll back**) (FR-109)
- [X] T070 [P] [US8] Access check dialog src/admin/AccessCheckDialog.tsx (principal from Users or hypothetical by groups and e-mail; decision, matching grants, roles, rules, attributes; who can access a project or path) (FR-111)
- [X] T071 [P] [US8] Project access dialog src/admin/ProjectAccessDialog.tsx (domain list and each project's domain, everyone-with-access-can-read, listed Stewards (informational), restricted paths with groups or e-mail addresses, protected branches, protected classification level, agent client grants) (FR-112)
- [X] T072 [P] [US8] Audit dialog src/admin/AuditDialog.tsx (filters, paging, export) and Settings dialog src/admin/SettingsDialog.tsx (provider status, session lifetimes, remote-credential policy, active sessions) (FR-113)
- [X] T073 [US8] Last-Admin guard message and bootstrap Admin indication in every Admin save path, including grant removal and narrowing and custom role deletion (server/routes/admin.ts, src/admin/*.tsx) (FR-110)
- [X] T074 [US8] Browser check scripts/admin-browser-check.ts: quickstart §6 end to end (group grant with the looked-up name, e-mail grant in mixed case taking effect for erin, custom role with members and its "what changes for whom" dry run, deletion confirmation, built-in role deletion refused); SC-011 timing (assign domain, grant a role to a group and to an address, check access within 3 minutes of scripted steps); geometry of every Admin dialog across the viewport matrix
- [X] T075 [US8] Mutants: invalid policy activated; activation without dry run; role or grant change activated without dry run; built-in role deleted; custom role in use deleted without confirmation; deleted role's grants left behind; Admin rule overrides a baseline forbid; deactivated principal allowed; Steward sees audit of other domains — in scripts/mutation-tests.ts

**Checkpoint**: P1 complete; the team deployment is administrable from the UI.

---

## Phase 10: User Story 4 - Your own working copy in server mode (Priority: P2)

**Goal**: per-person worktrees, personal branches, per-person state, publish, authored commits.

**Independent Test**: `bun test tests/auth/worktrees.test.ts` and `bun run test:two-editors`.

- [X] T076 [P] [US4] Worktree tests in tests/auth/worktrees.test.ts: creation on first use on `work/<handle>` (unique handle), base checkout detached and never edited, branch in use elsewhere refused with name, publish fast-forward via compare-and-swap `update-ref`, not fast-forward → 409, pull-default merge, Git queue shared by all copies of a repository, idle release keeps files and drafts (FR-070 to FR-077)
- [X] T077 [P] [US4] Authorship tests in tests/auth/authorship.test.ts: author = principal name/email, committer = service, trailer `Signed-in-user: <id>`; identity routes 404 in server mode
- [X] T078 [US4] Working copies server/projects/worktrees.ts (`git worktree add -b`, `lock`, list porcelain → in-use map, publish, pull-default, removal) and copy-aware paths in server/projects/paths.ts
- [X] T079 [US4] Copy-aware scanning, cache keys (copy, project, path) with entities by blob hash, watchers per active copy with 30-minute idle release, `SW_CACHE_DIR` in server/projects/workspace.ts, server/projects/cache.ts, server/projects/watcher.ts
- [X] T080 [US4] Per-person drafts, views, grouping corrections and suggestion state under `state/users/<userKey>/` in server/projects/state.ts and server/handler.ts (grouping routes)
- [X] T081 [US4] Viewer reads the published state; Editor+ reads their copy; `published` event in server/projects/workspace.ts and server/projects/events.ts
- [X] T082 [US4] Commits with author env, service committer and trailer in server/projects/git.ts; publish and pull-default routes in server/routes/git.ts
- [X] T083 [US4] Server-mode project delete and clear: list unpublished work, store per-person patches and drafts in the trash entry, remove worktrees, journaled, in server/projects/trash.ts (data-model Trash entry)
- [X] T084 [US4] UI: branch picker "in use by", **Publish to <default>**, **Pull from <default>**, identity dialog hidden in server mode, in src/scm/BranchPicker.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx
- [X] T085 [US4] Browser check scripts/two-editors-check.ts: two contexts (alice, frank) on one repository; edits, stage, commit, switch, pull never affect the other; authors correct; publish visible to carol-like Viewer of Sales (SC-007)
- [X] T086 [US4] Mutants: commit author not principal; publish not fast-forward; switch to a branch in use; draft keyed without person; base checkout edited; push or publish to a protected branch by an Editor — in scripts/mutation-tests.ts

---

## Phase 11: User Story 5 - Governed metrics and protected classifications (Priority: P2)

**Goal**: server-side metric lifecycle and classification guards on every write path.

**Independent Test**: `bun test tests/auth/guards.test.ts` and the matrix guard cases.

- [X] T087 [P] [US5] Guard tests in tests/auth/guards.test.ts: status to approved/deprecated by Editor refused; self-approval refused for every role; approved metric changed by non-approver stored as proposed with only the `status` bytes changed; description-only change keeps approved; classification/criticalDataElement/team/roles change needs Steward; property at or above protected level needs Steward; level aliases and unmapped values → `internal`; owner match by email/username case-insensitive, unverified owners (FR-060 to FR-067)
- [X] T088 [P] [US5] Matrix guard cases in tests/auth/matrix.test.ts across Source save, save-batch, item edit, legacy document save, metric save, import with replace, revert and pull (whole operation refused, guarded pointers named) (FR-066)
- [X] T089 [US5] Guard engine server/auth/guards.ts using the shared parsers (research R11) and `editGuarded`/`approveMetric` decisions; demotion through the item-level edit
- [X] T090 [US5] Apply guards in every content write path: server/routes/files.ts, server/routes/kpis.ts and metrics routes, server/handler.ts (`POST /api/documents`), server/projects/workspace.ts (import replace, save-batch), server/projects/scm.ts (revert, pull, pull-default preflight)
- [X] T091 [US5] UI: **Approve** / **Deprecate** actions for Stewards (disabled with reason otherwise, never for own metrics), "unverified owner" badge, owner picker from Users, guard-aware classification editors via src/auth/guards-client.ts in src/metrics/MetricDetail.tsx, src/metrics/MetricWizard.tsx, src/odcs/PropertyEditors.tsx
- [X] T092 [US5] Browser check scripts/auth-browser-check.ts (part 4): lifecycle as alice and bob; Editor classification edit refused
- [X] T093 [US5] Mutants: self-approval allowed; approved metric edit not demoted; classification change allowed to Editor; guard skipped in save-batch; guard skipped in pull — in scripts/mutation-tests.ts

---

## Phase 12: User Story 6 - Remote Git with your own credentials (Priority: P2)

**Goal**: delegated credentials per person and command; Admin-only remote changes with host
allow-list.

**Independent Test**: `bun test tests/auth/remote-credentials.test.ts`.

- [X] T094 [P] [US6] Tests in tests/auth/remote-credentials.test.ts with a local credential-checking Git HTTP test server (Bun) and stubbed token issuance: Azure DevOps OBO token used for that person only; GitHub connect flow then push; missing credential → 428 `{connect}`; token absent from .git/config, files under the data root, logs, audit and responses; host not allowed → 400; remote change and clone by non-Admin → 403; local mode unchanged (FR-080 to FR-084)
- [X] T095 [US6] OBO and GitHub token handling server/auth/remote-credentials.ts; routes `/auth/github/start` and `/auth/github/callback` in server/routes/auth.ts
- [X] T096 [US6] Askpass helper server/bin/sw-askpass and per-command environment (`-c credential.helper=`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS`) for fetch/pull/push/sync/clone in server/projects/git.ts; masking in error text
- [X] T097 [US6] Host allow-list and Admin-only remote/clone/register-projects decisions in server/routes/git.ts, server/routes/clone.ts, server/routes/repos.ts
- [X] T098 [US6] UI: **Connect GitHub** / Azure DevOps status in the person menu and a connect prompt on 428 in src/scm/ConnectAccount.tsx and src/scm/SourceControl.tsx; credential guide shown in local mode only
- [X] T099 [US6] Mutants: credential written to .git/config; remote change by non-Admin; host allow-list skipped; remote operation without explicit action — in scripts/mutation-tests.ts

---

## Phase 13: User Story 7 - Agents call the API with their own identity (Priority: P2)

**Goal**: client-credentials access to the agent routes, scoped by Admin grants.

**Independent Test**: `bun test tests/auth/bearer.test.ts`.

- [X] T100 [P] [US7] Tests in tests/auth/bearer.test.ts: granted client sees only granted mappings without any app role in its token; ungranted client (valid token) → 403 and audited; bearer outside `/api/agent/*` → 401; expired, wrong signature, wrong audience, wrong issuer, wrong tenant, not an application token → 401 and audited; context does not resolve ontologies from ungranted projects (FR-015, FR-090, FR-091)
- [X] T101 [US7] Bearer validation server/auth/bearer.ts with `jose` remote JWKS (cache, refresh on unknown `kid` at most every 5 minutes, RS256/ES256 only)
- [X] T102 [US7] Client principals keyed by `azp`/`appid` and grants from `agents.json` (the only authorisation of a client; no app role read) in server/auth/principal.ts and server/auth/authorize.ts; audit of every agent call
- [X] T103 [US7] Mutants: bearer accepted outside agent routes; audience unchecked; client grant ignored — in scripts/mutation-tests.ts

---

## Phase 14: Polish and cross-cutting

- [ ] T111 [P] README: both modes, configuration table, Entra guide (primary and the target's provider: no app roles, groups claim, optional claims `email`, `upn`, `xms_edov`, `GroupMember.Read.All` for overage and group names, federated credential, Azure DevOps permission), how access is granted (no sign-in screen, Admin-panel grants by Entra group or e-mail, the verified-address rule and its trust in the tenant's address administration, custom roles, No access page), Keycloak guide (compatibility), what the mock OpenID provider covers and what only the Entra checklist covers, role matrix and what each role sees, Admin panel, bootstrap Admin break-glass recovery, outbound calls of server mode (including the platform managed-identity endpoint when `SW_OIDC_CLIENT_ASSERTION=managed-identity`), delegated credentials, per-person working copies and publishing, audit log, single-instance limit and scale path, residual exposure of commit messages; running the image with Compose (both profiles, host networking and the Docker Desktop setting), the local build scripts (`ci:validate`, `image:*`, `pipeline:*`, `deploy:*`), the Azure DevOps pipeline, the release hand-over to the target's mirror and the links to deploy/README.md and deploy/trial-runbook.md, and that the GitHub repository runs nothing automatically; counts from tests (constitution VII, FR-121)
- [ ] T112 [P] docs/agent-runtime.md: authentication for agent clients and project grants
- [ ] T113 Full authorization matrix and mutation run through `bun run ci:validate`, plus `bun run test:auth:keycloak` (compatibility) on the owner's machine; record commands, counts and durations in specs/003-authn-authz/verification.md (SC-001 to SC-014, SC-017 local part, SC-018, SC-019); SC-010 (Entra), SC-015, SC-016 (federated sign-in) and the trial are recorded from the owner's report (OA-1, OA-2)
- [ ] T114 Security review of the diff (cookie flags, CSRF, redirects, token handling, path rules, Git argument handling, image user and contents, pipeline permissions and service-connection scopes, absence of stored secrets) with findings fixed or recorded in specs/003-authn-authz/verification.md

---

## Dependencies & Execution Order

- Phase 0 (after 002 merges) → Phase 1 → Phase 2 → Phase 3 (container) → Phase 4 (local build
  scripts and pipeline definition) → Phase 5 (US1) → Phase 6 (Azure delivery definition) →
  Phases 7–13 → Phase 14.
- In Phase 2, T135 and T137 come before T014 (the entity builder expands grants and loads the
  compiled roles); T024 uses T135 for the Admin count.
- Phase 3 needs Phase 2 only (local mode through the boundary); T118 before T110.
- Phase 4 needs Phase 3 (the `image` and `container` steps build and run the image); T121 and T122
  before T123; T124 after T120 and T123.
- US1 (Phase 5) before every server-mode story; T139 follows T138 and needs T030 and T135; T125
  needs T110, T030 and T006; T109 needs T036, T120 and T121; T108 needs T007 and T030 (it gates nothing).
- Phase 6 needs US1 (server mode cannot start without a provider) and Phase 4; T128 and T129
  follow their tests T127 and T126; T130–T131 need T129; T133 needs T107 and T131. No task needs
  Azure or Azure DevOps access; OA-1 to OA-3 follow the tasks they name and block no task.
- US2 and US3 after Phase 6 (or after US1); T051 extends T038 (shared matrix file).
- US8 after US3 (Admin API reuses the write authorization and the matrix); earlier phases seed
  `data/admin/` (grants, custom role, domains) from the fixture. T141 needs T137, T024 and T062;
  T060 uses T031's directory client after T140; T067 and T066 use T142.
- US4 after US3; US5 after US4 (guards on pull and pull-default use the copy model); US6 after
  US4 (remote operations run in copies); US7 after US2 (agent filtering).
- Phase 14 last.

### Parallel opportunities

- Phase 1: T004–T009 together after T003.
- Phase 2: T010, T012, T013, T016, T017, T019, T021, T023, T134, T136 together; implementations
  follow their tests.
- Phase 3: T104, T115, T117 together; T106 in parallel with T105/T116.
- Phase 4: T120 with T121 and T122, then T123, then T124.
- US1: T026–T028 and T138 together; T108 in parallel with T029–T035. Phase 6: T126, T127, T107 together.
  US2: T038–T040 together. US8: T057–T059 and T140 together, then dialogs T065–T072 and T142 in
  parallel with the API tasks T060–T064 and T141.
- After US3: US7 (Phase 13) in parallel with US8 and US4.

## Implementation Strategy

- **Container first**: Phases 0–4 give an image that runs today's product, built, scanned and
  tested on the owner's machine by `ci:validate`, with the pipeline's Validate and Image stages
  defined and dry-run.
- **MVP**: add Phases 5–8 (sign-in, Azure delivery definition, read filtering, role enforcement)
  with access seeded from files: a secure, deployable but file-administered team deployment.
- **P1 complete**: add Phase 9 (Admin panel). From here a target may load real contracts.
- **Increment 2**: Phases 10–13 (working copies, governance guards, remote credentials, agents).
- **Release v0.4.0** after Phase 14 with `ci:validate` green on the owner's machine (every suite,
  also against the image, plus `pipeline:lint` and `pipeline:dry-run`), the README updated, and
  the pipeline definition, deployment guide and trial runbook ready; the owner hands the tag over
  to the target's mirror and runs the trial (OA-1), and the tag is deployed by the target's
  pipeline.

## Owner acceptance (run by the owner; not implementer tasks)

The implementer has no access to the trial Azure DevOps organisation and subscription or to the
real Entra tenant (OP-10). These steps are not counted among the 142 tasks and do not block any
task; their reports are recorded in specs/003-authn-authz/verification.md, and each failed step
becomes a follow-up task (for example through `/speckit-converge`).

- [ ] OA-1 Trial deployment from deploy/trial-runbook.md (after T133, from Phase 6 on with the fixture workspace; repeated for the release tag after Phase 14): every step ticked, report block returned (SC-015, SC-016, SC-017 on Azure, final deploy role set)
- [ ] OA-2 Entra checklist of quickstart §5 on the real tenant (part of OA-1 step 6): direct redirect to Entra, grants by group (name resolved) and by e-mail, **No access** for a user without grant and for an unverified guest, custom role, overage, removal from a group at refresh, signed-out page, Azure DevOps push author (SC-010)
- [ ] OA-3 Release hand-over of each tag to the target's Azure Repos mirror as documented in deploy/README.md (FR-142); the mirror holds the same commit and tag
