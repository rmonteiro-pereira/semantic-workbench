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
phases). Phases are therefore not in numeric ID order; the phase headings give the order of work.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[USn]**: US1 sign-in, US2 read filtering, US3 role enforcement, US4 working copies, US5
  governance guards, US6 remote credentials, US7 agent clients, US8 Admin panel, US9 container
  and Azure, US10 local build scripts and Azure DevOps pipeline
- Paths are repository-relative

---

## Phase 0: Rebase on 002 (prerequisite)

- [ ] T001 After 002 merges, rebase `003-authn-authz` onto `main`; resolve conflicts only in specs/003-authn-authz/ and .specify/memory/constitution.md (002 must not have changed the constitution beyond 2.1.0; if it did, merge the changes into 3.0.0 and note them in the Sync Impact Report)
- [ ] T002 Re-run the route inventory against server/routes/** and server/handler.ts and update the route list of specs/003-authn-authz/contracts/http-api.md for any route 002 added, renamed or dropped

---

## Phase 1: Setup

- [ ] T003 Add `openid-client` 6.8.8, `jose` 6.2.13 and `@cedar-policy/cedar-wasm` 4.14.0 (exact versions) to package.json and bun.lock; record size and licence in specs/003-authn-authz/research.md R1–R3
- [ ] T004 [P] Configuration module server/config.ts (FR-001, FR-003) parsing and validating every variable of contracts/configuration.md (mode, required server variables, loopback-only `SW_HOST` in local mode, `SW_PUBLIC_URL` origin, 32-byte `SW_SESSION_KEY`, at least one `SW_BOOTSTRAP_ADMINS`); tests in tests/auth/config.test.ts
- [ ] T005 [P] Fixture workspace tests/fixtures/auth-workspace/: domains Sales, HR, Finance; projects sales-contracts (Sales; restricted path `finance/**` → Finance group), sales-metrics (Sales; metrics in draft/proposed/approved with owners), hr-people (HR), shared-reference (everyone can read), no-domain project; cross-project mapping and ontology references; marker strings `LEAK-<project>-<path>` in every unreadable file; seeded data/admin/ files
- [ ] T006 [P] Stub OpenID provider tests/helpers/stub-oidc.ts (discovery, JWKS, authorize, token, end-session, client credentials) built on `jose`, with users alice (Sales Editor), bob (Sales Steward), carol (HR Viewer), dave (Admin), erin (no role), frank (Sales Editor + Finance group), and agent clients sw-agent (granted sales-contracts) and sw-agent-ungranted; Entra-shaped and Keycloak-shaped claim modes, overage mode
- [ ] T007 [P] Keycloak realm tests/fixtures/keycloak/realm.json matching T006 users, groups, client roles, group mapper and service accounts (research R6)
- [ ] T008 [P] Script entries test:auth, test:auth:keycloak, test:admin, test:two-editors in package.json (pointing to scripts created in later phases)
- [ ] T009 [P] Pin schemas/semantic-workbench-access-v1.json (roles, assignments, projects, agents, deactivated, settings per data-model.md) and list it in schemas/README.md as an application schema

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T010 [P] Unit tests for claim normalisation (Entra `tid:oid`, `roles`, `groups`, `hasgroups`/`_claim_names` overage, `idtyp=app`; Keycloak `resource_access.<client>.roles`, group paths; generic) and effective-role computation (domain role, project assignment, bootstrap Admin, highest role wins, deactivated) in tests/auth/principal.test.ts (FR-020, FR-021, FR-023)
- [ ] T011 Principal model and claim mapper in server/auth/principal.ts (data-model Principal; `key` = `u` + 20 hex of SHA-256(id)); users registry `state/users.json` with unique branch `handle` in server/projects/state.ts
- [ ] T012 [P] Cedar schema policies/schema.cedarschema and baseline policies policies/baseline.cedar (B1–B8, F1–F7 of contracts/policy-model.md; FR-031 to FR-035)
- [ ] T013 [P] Unit tests for the decision boundary over the baseline: role matrix of spec Appendix B row by row, 404 vs 403 status, memoisation per rule class, invalid policy set refuses to load, local implicit Admin, classification never affects reading (FR-030 to FR-036), in tests/auth/authorize.test.ts
- [ ] T014 Cedar loader server/auth/cedar.ts (import `@cedar-policy/cedar-wasm/nodejs`, preparse schema and policy set, entity builder for User/Group/Role/Domain/Repository/Project/File/Metric/Branch/TrashEntry/Workspace)
- [ ] T015 Decision boundary server/auth/authorize.ts: `authorize`, `filter`, `AccessView` (readable projects, path predicate, roles), per-request memo, 404/403 mapping (contracts/policy-model.md)
- [ ] T016 [P] Performance test tests/auth/filter-perf.test.ts: 5,000 files in 20 projects, project listing filter ≤ 150 ms and full load ≤ 10% over local mode (SC-006)
- [ ] T017 [P] Route → action table tests/auth/route-actions.ts and test tests/auth/route-actions.test.ts that fails when any route in server/routes/** or server/handler.ts lacks a row (contracts/http-api.md)
- [ ] T018 Request middleware in server/handler.ts: resolve principal (local implicit Admin, or session/bearer placeholders returning 401 until US1), call `authorize` for the route's action before the route runs, map decisions to 401/403/404, attach `X-Request-Id` (FR-002, FR-004, FR-030, FR-036)
- [ ] T019 [P] Unit tests for the audit writer (fields of contracts/audit-log.md, hash chain `prev`, no token/content fields, stdout mirror, monthly files, retention 400 days; FR-100, FR-101) in tests/auth/audit.test.ts
- [ ] T020 Audit writer server/auth/audit.ts and calls from the middleware for every deny and every write action
- [ ] T021 [P] Unit tests for the administration repository (create at first use, load and validate against schemas/semantic-workbench-access-v1.json, one commit per change authored by the Admin, history, diff, rollback as new commit, hash-checked writes) in tests/auth/admin-repo.test.ts
- [ ] T022 Administration repository server/auth/admin-repo.ts on `data/admin/` reusing server/projects/git.ts; Admin rules from `data/admin/policies/*.cedar` merged with the baseline in server/auth/cedar.ts
- [ ] T023 [P] Unit tests for the last-Admin guard and bootstrap Admins (removing the last mapping, deactivating the last Admin, a forbid on Admin, bootstrap always Admin, bootstrap use audited) in tests/auth/admin-guard.test.ts
- [ ] T024 Last-Admin guard server/auth/admin-guard.ts
- [ ] T025 Mutants: decision ignores domain; 404 replaced by 403; invalid policy accepted at load; last-Admin guard off; audit entry missing for a denial — in scripts/mutation-tests.ts

**Checkpoint**: every route passes through the boundary; local mode suites green with the
implicit Admin.

---

## Phase 3: User Story 9 (part 1) - Container image and local Compose (Priority: P1)

**Goal**: one image that runs local mode (and, from Phase 5, server mode), with health, a
non-root user, the data root as a volume, single-instance lock with revision hand-over, and the
existing browser suites runnable against it.

**Independent Test**: `bun test tests/auth/instance-lock.test.ts tests/server/health-static.test.ts`
and `bun run test:container` (local group).

- [ ] T104 [P] [US9] Single-instance lock tests in tests/auth/instance-lock.test.ts: revision identity (`CONTAINER_APP_REVISION`, else `SW_VERSION+SW_COMMIT`, else `dev`), heartbeat every 10 s, refusing instance re-checks every 10 s, stale lock (older than 30 s) taken over, live lock of the same revision → refuse and not ready (FR-122), live lock of a different revision → ready, 503 with `Retry-After` on non-health routes, take-over on release or staleness (FR-123), release on SIGTERM
- [ ] T115 [P] [US9] Tests in tests/server/health-static.test.ts: `/healthz` returns `{ok, version, commit}` and no workspace data without sign-in; `/readyz` 503 until lock, recovery and first scan, then `state: serving`; under hand-over `state: handover` before any recovery, scan or data-root write, recovery only after the lock is taken (FR-123); `SW_SERVE_STATIC=1` serves `dist/` with SPA fallback and keeps the local-mode origin and host checks; non-writable data root stops start-up naming path and uid (FR-124, FR-125)
- [ ] T105 [US9] Instance lock with revision hand-over in server/projects/instance-lock.ts and server/index.ts (revision identity as in T104; data-model Instance lock)
- [ ] T116 [US9] Static serving of `dist/` in server/static.ts (both modes when `SW_SERVE_STATIC=1`), `/healthz` and `/readyz` in server/routes/health.ts, writable data root probe at start-up in server/index.ts, start-up hint in local mode when `SW_IN_CONTAINER=1` (set by the image) that host networking (Compose local profile) is required (FR-124, FR-125; moved out of T032)
- [ ] T106 [US9] Dockerfile and .dockerignore: multi-stage (`deps`, `build`, `prod-deps`, `runtime`), bases pinned by digest, runtime `oven/bun:1.4-slim` or `-alpine` with Git ≥ 2.40 asserted at build, `USER bun`, `VOLUME /data`, `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1`, OCI labels and `SW_VERSION`/`SW_COMMIT` from build arguments, `HEALTHCHECK` with a Bun fetch of `/healthz`, exec-form entry point (research R17, FR-120)
- [ ] T117 [P] [US9] compose.yaml with profile `local` (`network_mode: host`, `SW_MODE=local`, `./.data:/data`); `.data/` and `.env.server` added to .gitignore (OP-8, FR-126)
- [ ] T118 [US9] Browser checks read `SW_BASE_URL` (default the dev server) through scripts/browser-check.ts; replace hard-coded `http://127.0.0.1:5173` in scripts/*.ts; no behaviour change against the dev server
- [ ] T110 [US9] Container check scripts/container-check.ts and suite list scripts/container-suites.ts, script `test:container` in package.json: build (or take `--image`), run local mode with host networking and a temporary data folder, assert uid ≠ 0, `git --version` ≥ 2.40, labels, health and ready, run the local suite group against `http://127.0.0.1:4310`, restart keeps data, a second container of the same image on the same volume with `SW_PORT=4311` answers 503 on `/readyz` and logs the single-replica constraint (SC-009 local part)
- [ ] T119 [US9] Mutants: second instance of the same revision not refused; hand-over serves data before taking the lock; hand-over instance runs recovery before taking the lock; `/readyz` reports `serving` before recovery (outside a hand-over); `/healthz` includes workspace data — in scripts/mutation-tests.ts

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

- [ ] T120 [P] [US10] Pipeline rules test tests/pipeline/azure-pipelines.test.ts (parses azure-pipelines.yml, azure-pipelines-rollback.yml and deploy/azure-devops/templates/*.yml with `yaml`): every rule of the pipeline check in contracts/delivery-pipeline.md (stage order, script steps call package scripts outside the setup template, allowed tasks pinned to a major version, images pinned by digest, no secret variables or secret-looking literals, `addSpnToEnvironment` not true, `azureSubscription` only from service-connection parameters, Deploy only for `refs/tags/v*` as a deployment job on the environment parameter, every gate `test:*` script of package.json in scripts/gate-suites.ts and in scripts/container-suites.ts or a recorded exclusion, `.trivyignore` entries with reason and unexpired date) and no `.github/workflows/` or `.github/dependabot.yml` in the repository (FR-130, FR-132, FR-133, FR-136, FR-140)
- [ ] T121 [US10] Local gate runner scripts/ci-validate.ts and gate suite list scripts/gate-suites.ts, script `ci:validate` in package.json: steps `verify`, `mutation`, `browser`, `keycloak` (added in T109), `image`, `container`, `pipeline` in that order; `--step` (repeatable), `--suite`, `--keep-going`; container-runtime steps fail instead of skipping; JUnit XML and `summary.json` in out/ci/; non-zero exit naming the failed steps; `out/` added to .gitignore (FR-131)
- [ ] T122 [US10] Image scripts scripts/image.ts with package scripts `image:build` (Docker or Podman, `SW_VERSION`/`SW_COMMIT` build arguments, `-dirty` suffix, tags `semantic-workbench:sha-<commit>` and `:dev`), `image:scan` (Trivy binary or pinned Trivy image, CRITICAL/HIGH with fix, .trivyignore, `--ref` for a registry digest, JSON and SARIF in out/image/), `image:sbom` (SPDX JSON in out/image/), `image:push` (`--registry`, refuses `-dirty`, prints the digest); tests of argument building and ignore-file parsing in tests/pipeline/image.test.ts (FR-131, FR-132)
- [ ] T123 [US10] azure-pipelines.yml with templates deploy/azure-devops/templates/setup-steps.yml (pinned Bun, frozen install, Playwright Chromium), validate-jobs.yml and image-jobs.yml: parameters and variable group of contracts/delivery-pipeline.md, triggers (`main`, tags `v*`), stage Validate (jobs `verify`, `mutation`, `browser` matrix from scripts/gate-suites.ts, each `bun run ci:validate -- --step …`, test results and failure screenshots published), stage Image (`ci:validate --step image --step container`, bill of materials and scan report as pipeline artifacts, push to the target registry through `AzureCLI@2` with the push service connection on `main` and `v*` only, digest as output variable); deploy/azure-devops/sample-variables.yml with placeholder values (FR-133, FR-134)
- [ ] T124 [US10] `pipeline:lint` (scripts/pipeline-lint.ts: pinned copy of the Azure Pipelines schema in deploy/azure-devops/schema/service-schema.json validated with the existing Ajv setup, plus the rules of T120) and `pipeline:dry-run` (scripts/pipeline-dry-run.ts: parameter expansion with sample-variables.yml, conditions for `pr`, `main` and `tag:<v>` runs, printed plan, `--execute` runs local steps and Azure steps on the fake client of tests/pipeline/fake-azure.ts); tests in tests/pipeline/dry-run.test.ts (plan per run kind; a step present in the pipeline but not in `ci:validate` fails); record the first full `ci:validate` duration against SC-013 in specs/003-authn-authz/verification.md (FR-140, SC-018)

**Checkpoint**: `ci:validate` is the gate for every later phase; the pipeline's Validate and Image
stages are defined, linted and dry-run.

---

## Phase 5: User Story 1 - Sign in to a team workbench, and nothing changes locally (Priority: P1) 🎯 MVP

**Goal**: server mode with OIDC sign-in, encrypted server sessions, cookie-authenticated live
updates; local mode unchanged.

**Independent Test**: `bun test tests/auth/oidc.test.ts tests/auth/sessions.test.ts` and
`bun run test:auth` (sign-in part) with the stub provider.

- [ ] T026 [P] [US1] Unit tests for sessions: AES-256-GCM persistence under `SW_SESSION_KEY`, file named by SHA-256 of the id, idle 8 h / absolute 24 h expiry, survives restart, end-session, cookie `__Host-sw-session` with `Secure; HttpOnly; SameSite=Lax; Path=/` (loopback development exception documented, non-loopback `http://` public URL refused), in tests/auth/sessions.test.ts (FR-011 to FR-013)
- [ ] T027 [P] [US1] Unit tests for the OIDC flow against the stub provider: PKCE S256, `state` and `nonce` checked, issuer/audience/signature/expiry with 300 s skew, Entra `tid` allow-list, `returnTo` same-origin only, role-less and deactivated principals refused, refresh re-reads roles, logout calls end-session, in tests/auth/oidc.test.ts (FR-010, FR-012, FR-017)
- [ ] T028 [P] [US1] Unit tests for CSRF: non-GET without `X-SW-Request: 1` or with a foreign Origin → 403 in server mode, in tests/auth/csrf.test.ts (FR-016)
- [ ] T029 [US1] Session store server/auth/sessions.ts
- [ ] T030 [US1] OIDC client server/auth/oidc.ts with `openid-client` (discovery, login, callback, refresh, logout; client secret, private key or managed-identity client assertion) and routes `/auth/login`, `/auth/callback`, `/auth/logout` in server/routes/auth.ts
- [ ] T031 [US1] Entra group overage: `checkMemberGroups` for configured group ids with an app-only token, failure → no membership plus message and audit, in server/auth/principal.ts (FR-022)
- [ ] T032 [US1] Mode selection and binding in server/index.ts: local refuses non-loopback, server requires valid config and policies, always serves `dist/` (T116) with CSP and security headers (research R15) (FR-003 to FR-005)
- [ ] T033 [US1] `GET /api/me` in server/routes/me.ts (contracts/http-api.md)
- [ ] T034 [US1] Live-update stream authenticates by cookie and closes on sign-out, expiry or End session (`access` event) in server/projects/events.ts and server/routes/events.ts (FR-014)
- [ ] T035 [US1] Frontend: fetch wrapper adds `X-SW-Request: 1` and sends 401 to `/auth/login?returnTo=` in src/projects/api.ts; `useMe` hook src/auth/useMe.ts; person menu with name, role, **Sign out** in src/main.tsx; no-access page
- [ ] T036 [US1] Browser check scripts/auth-browser-check.ts (part 1): sign-in for each test user via the stub provider, header role, no token in `document.cookie`/storage/responses, live updates arrive, sign-out closes the stream, session expiry returns to sign-in; local-mode smoke unchanged
- [ ] T037 [US1] Mutants: cookie without HttpOnly or Secure; CSRF header not required; nonce unchecked; `tid` unchecked; overage failure grants membership; session not expired after absolute lifetime — in scripts/mutation-tests.ts
- [ ] T108 [US1] Keycloak browser check scripts/auth-keycloak-check.ts (start Keycloak 26 with tests/fixtures/keycloak/realm.json via Docker or Podman, skip with a message when absent; sign-in for each user, roles, sign-out, live updates, agent client credentials; SC-005)
- [ ] T109 [US1] Keycloak step: `keycloak` step of scripts/ci-validate.ts running `test:auth:keycloak` with `--require-container` (Keycloak pinned by digest, readiness wait on the realm discovery document, container removed afterwards), and the `keycloak` job of the Validate stage in deploy/azure-devops/templates/validate-jobs.yml calling it on the agent (research R6, FR-131, FR-134)
- [ ] T125 [US1] Compose profile `server` in compose.yaml (`keycloak` with the test realm on `127.0.0.1:8080`, `workbench-server` with host networking, loopback public URL) and .env.server.example with development-only values; server group in scripts/container-suites.ts (sign-in as each test user, restart keeps the session and data, second container on `SW_PORT=4311` refused as in T110, sign-in within 30 s of start) run by `test:container` and therefore by the `container` step of `ci:validate` and the Image stage (FR-126, SC-009)

**Checkpoint**: sign-in works with the stub provider, with Keycloak and in the container; local
mode unchanged; `ci:validate` green with the `keycloak` step.

---

## Phase 6: User Story 9 (part 2) and User Story 10 (part 2) - Azure delivery definition (Priority: P1)

**Goal**: the Deploy stage and the rollback pipeline for the target: version check, approval
through the environment, rescan, promotion on the same digest, deployment by digest to Azure
Container Apps through workload identity federation, smoke test and automatic rollback, all in
scripts that run locally against a fake Azure client; the target setup guide.

**Independent Test**: `bun test tests/pipeline/`; `bun run pipeline:dry-run -- --run
tag:v0.4.0-alpha.1 --execute` (deploy, smoke failure and rollback paths on the fake client);
quickstart §7 in a trial organisation and subscription when available.

- [ ] T126 [P] [US10] Deploy logic tests in tests/pipeline/deploy.test.ts with the fake Azure client: version check refuses a tag whose version core differs from `package.json` or is older than the highest version tag in the registry, before any Azure write; missing variable-group values named before any call; preflight refuses each wrong setting by name (revision mode, replicas, volume, identity, registry identity, mode, host, port, Key Vault references, Entra client and tenant); the active revision and digest are recorded before the update; the update uses the digest; the version tag is added only after a passing preflight and before the update; smoke failure copies the recorded revision, smoke-tests it and fails; manual rollback resolves `previous` or the version of its tag ref to a revision or digest and refuses non-tag refs (FR-135, FR-138, FR-139)
- [ ] T127 [P] [US10] Smoke test tests in tests/pipeline/deploy-smoke.test.ts against a local Bun server: each check of contracts/delivery-pipeline.md failing alone fails the smoke; `state: handover` is waited out and never accepted as ready; the authorization endpoint is read from discovery (Keycloak-shaped and Entra-shaped stubs); version compared with `package.json`, commit exactly; `--loopback` relaxes only HSTS and the `Secure` flag (FR-137)
- [ ] T128 [US10] Smoke test scripts/deploy-smoke.ts and script `deploy:smoke` (one line per check, JSON summary); the `container` step of `ci:validate` runs it with `--loopback` against the Compose server profile
- [ ] T129 [US10] Deploy script scripts/deploy.ts with scripts `deploy:check-version`, `deploy:azure` and `deploy:rollback` (version check, preflight, record, update, wait for running and ready revision, smoke, automatic rollback by revision copy; Azure CLI client, `--fake` client; reads the variable-group names from the environment), runnable on the owner's machine after `az login`
- [ ] T130 [US10] Deploy stage in azure-pipelines.yml with deploy/azure-devops/templates/deploy-steps.yml: condition `refs/tags/v*`; job `check` with the push service connection (`deploy:check-version`) before any approval; deployment job on `${{ parameters.deployEnvironment }}` with `lockBehavior: runLatest`, `AzureCLI@2` with the deploy service connection: `image:scan --ref` on the digest from the Image stage, then `deploy:azure` (preflight, promotion with `az acr import` inside the registry, update, smoke, rollback); summary with digests, revisions and smoke results (FR-135, FR-136, FR-137, FR-138)
- [ ] T131 [US10] azure-pipelines-rollback.yml (`trigger: none`, `pr: none`, queued on the tag ref of the version to restore, parameter `target` = `tag` or `previous`, same parameters and variable group, deployment job on the same environment calling `deploy:rollback`); both pipelines pass `pipeline:lint` and appear in the dry run (FR-138, FR-140)
- [ ] T107 [P] [US9] Target setup guide deploy/README.md (no infrastructure as code, FR-139): every Azure resource, setting and role of contracts/delivery-pipeline.md with portal and Azure CLI steps (resource group, Log Analytics, Container Apps environment, storage account and share with mount options, Key Vault, registry with retention rule, container app in single revision mode with one replica, probes, volume and identity, the app identity `id-sw-app` created and granted `AcrPull` and Key Vault Secrets User before the app); every Azure DevOps item (the two Azure Resource Manager service connections with workload identity federation and their role assignments, pipeline permissions limited to the two pipelines, environment with approvals, branch control and exclusive lock, variable group with every value and none secret, agent pool, import of both pipelines, branch policy for pull requests, preview run); App Service alternative; scale path
- [ ] T132 [US10] Mutants: smoke test ignores a version mismatch; smoke test accepts an unauthenticated 200; smoke test accepts `state: handover`; rollback skipped after a failed smoke; preflight accepts more than one replica; version check accepts a tag older than the last deployed version; pipeline lint accepts a step that is not a package script — in scripts/mutation-tests.ts
- [ ] T133 [US10] Trial run in an Azure DevOps organisation and Azure subscription made available for it (owner or target), with the fixture workspace: setup from deploy/README.md, preview run, `main` run, tag `v0.4.0-alpha.1`, approval, smoke, Entra sign-in, restart keeps sessions and data, revision update hand-over measured (SC-017), rollback drill (SC-015), no stored Azure or registry secret (SC-016), final deploy role set; recorded in specs/003-authn-authz/verification.md. Until such an organisation exists, the dry run of T124 is the recorded evidence and this task stays open

**Checkpoint**: the delivery definition is complete and verified locally; a target can deploy and
roll back; any Azure environment holds only fixture data until Phases 7–9 are done.

---

## Phase 7: User Story 2 - See only what you may see (Priority: P1)

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
- [ ] T049 [US2] Browser check scripts/auth-browser-check.ts (part 2): Sales Viewer sees no HR project, restricted files counted, search/lineage/mapping graph/metrics/document export/agent-context export contain no markers (FR-046)
- [ ] T050 [US2] Mutants: filter returns unfiltered list; SSE send skips filter; replay skips filter; draft served to non-owner; trash lists others' entries; git show ignores path rule; agent context falls back to an unreadable project — in scripts/mutation-tests.ts

**Checkpoint**: zero leaked markers across the read matrix.

---

## Phase 8: User Story 3 - Roles decide what you can do (Priority: P1)

**Goal**: every write authorised by role and scope; UI follows capabilities.

**Independent Test**: `bun test tests/auth/matrix.test.ts` (write part) and `bun run test:auth`
(controls part).

- [ ] T051 [P] [US3] Matrix write part in tests/auth/matrix.test.ts: every write route × users × readable/unreadable targets; Viewer 403/404, Editor allowed in own domain, cross-project move needs both sides, Admin-only actions (purge, clear, delete project, remote, clone, register projects, status details); denials leave files, Git state, drafts and state unchanged (byte compare) and are audited (FR-050, FR-052)
- [ ] T052 [US3] Wrap every write route with its action and target resource(s) in server/routes/*.ts and server/handler.ts, including 002 routes (commit with paths/push, revert, clone, repository projects, subfolder delete mode, metrics); identity and credential-helper routes 404 in server mode
- [ ] T053 [US3] Capability helper src/auth/can.ts from `/api/me` plus per-project role; hide or disable (with reason tooltip) controls in src/main.tsx, src/projects/Sidebar.tsx, src/projects/Trash.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx, src/metrics/MetricsView.tsx, src/edit/*.tsx, src/odcs/PropertyEditors.tsx (FR-051, contracts/ui-contracts.md)
- [ ] T054 [US3] Browser check scripts/auth-browser-check.ts (part 3): controls per role, crafted requests refused; geometry of the person menu and disabled tooltips across the viewport matrix in scripts/responsive-ui-tests.ts
- [ ] T055 [US3] Project creation by a Steward assigns one of the creator's domains (dialog choice when several); Admin may leave it without domain; tests in tests/auth/project-create.test.ts, implementation in server/routes/projects.ts, server/routes/clone.ts and src/projects/ProjectDialogs.tsx (FR-053)
- [ ] T056 [US3] Mutants: write route skips authorize; cross-project move checks only the source; Viewer allowed to save drafts — in scripts/mutation-tests.ts

**Checkpoint**: P1 enforcement complete; grants seeded in fixtures.

---

## Phase 9: User Story 8 - Admin panel: control roles, policies and access (Priority: P1)

**Goal**: Admins manage users, role mappings, assignments, project access, policies (structured
and raw, dry run, history, rollback), check access, review and export audit, and see settings,
without being able to remove the last Admin.

**Independent Test**: `bun test tests/auth/admin-api.test.ts tests/auth/dry-run.test.ts` and
`bun run test:admin`.

- [ ] T057 [P] [US8] API tests for `/api/admin/*` and `/api/audit*` in tests/auth/admin-api.test.ts: Admin-only (Steward only audit of own domains), schema validation, `baseVersion` stale → 409, each change one commit in data/admin with author and message, sessions ended on deactivate, `access` event on change, secrets never returned (FR-102 to FR-114)
- [ ] T058 [P] [US8] Dry-run tests in tests/auth/dry-run.test.ts: changed decisions over the matrix fixture and the last 1,000 audit snapshots; activation refused without a matching dry run or with validation errors; rollback restores previous decisions for every matrix case (SC-012)
- [ ] T059 [P] [US8] Policy template tests in tests/auth/policy-templates.test.ts: each template of contracts/policy-model.md generates valid Cedar; a `forbid` on Admin without narrowing condition is rejected; Admin rules cannot override baseline forbids (FR-107)
- [ ] T060 [US8] Admin API server/routes/admin.ts: users (list, search, deactivate, reactivate), roles, assignments, projects, agents, settings, versions, diff, rollback, sessions, provider status, `check`, `who-can` (contracts/http-api.md)
- [ ] T061 [US8] Policy service: list baseline and Admin rules, validate (Cedar `checkParsePolicySet` + schema validation with line/column), templates → Cedar text, enable/disable via `@enabled`, in server/auth/policies.ts
- [ ] T062 [US8] Dry run server/auth/dry-run.ts (matrix fixture shipped as data in policies/matrix-cases.json generated from tests/auth/route-actions.ts; audit snapshot replay)
- [ ] T063 [US8] Access simulator and who-can in server/auth/authorize.ts (`explain` returning deciding rules and attributes; hypothetical principals by groups/roles) (FR-111)
- [ ] T064 [US8] Audit query and export (JSONL, CSV) with Steward domain scoping in server/routes/audit.ts and server/auth/audit.ts (FR-102)
- [ ] T065 [P] [US8] Admin launcher and dialog shell src/admin/AdminLauncher.tsx (header **Admin** entry, Admins only; local implicit Admin) reusing src/projects/Modal.tsx size variants
- [ ] T066 [P] [US8] Users & groups dialog src/admin/UsersDialog.tsx (search, role source chips, deactivate/reactivate, end sessions, check access shortcut) (FR-104)
- [ ] T067 [P] [US8] Roles dialog src/admin/RolesDialog.tsx (matrix view, group/app-role/client-role mappings, per-project assignments) (FR-105)
- [ ] T068 [P] [US8] Policies dialog src/admin/PoliciesDialog.tsx and src/admin/PolicyEditor.tsx (template forms, raw editor with CodeMirror and inline validation, dry-run result, enable/disable, delete) (FR-106, FR-108)
- [ ] T069 [P] [US8] Version history src/admin/VersionHistory.tsx (who/when/message, diff with the existing diff view, **Roll back**) (FR-109)
- [ ] T070 [P] [US8] Access check dialog src/admin/AccessCheckDialog.tsx (decision, rules, attributes; who can access a project or path) (FR-111)
- [ ] T071 [P] [US8] Project access dialog src/admin/ProjectAccessDialog.tsx (domain, everyone-can-read, readers, stewards, restricted paths, protected branches, protected classification level, agent client grants) (FR-112)
- [ ] T072 [P] [US8] Audit dialog src/admin/AuditDialog.tsx (filters, paging, export) and Settings dialog src/admin/SettingsDialog.tsx (provider status, session lifetimes, remote-credential policy, active sessions) (FR-113)
- [ ] T073 [US8] Last-Admin guard message and bootstrap Admin indication in every Admin save path (server/routes/admin.ts, src/admin/*.tsx) (FR-110)
- [ ] T074 [US8] Browser check scripts/admin-browser-check.ts: quickstart §6 end to end; SC-011 timing (assign domain, map group, check access within 3 minutes of scripted steps); geometry of every Admin dialog across the viewport matrix
- [ ] T075 [US8] Mutants: invalid policy activated; activation without dry run; Admin rule overrides a baseline forbid; deactivated principal allowed; Steward sees audit of other domains — in scripts/mutation-tests.ts

**Checkpoint**: P1 complete; the team deployment is administrable from the UI.

---

## Phase 10: User Story 4 - Your own working copy in server mode (Priority: P2)

**Goal**: per-person worktrees, personal branches, per-person state, publish, authored commits.

**Independent Test**: `bun test tests/auth/worktrees.test.ts` and `bun run test:two-editors`.

- [ ] T076 [P] [US4] Worktree tests in tests/auth/worktrees.test.ts: creation on first use on `work/<handle>` (unique handle), base checkout detached and never edited, branch in use elsewhere refused with name, publish fast-forward via compare-and-swap `update-ref`, not fast-forward → 409, pull-default merge, Git queue shared by all copies of a repository, idle release keeps files and drafts (FR-070 to FR-077)
- [ ] T077 [P] [US4] Authorship tests in tests/auth/authorship.test.ts: author = principal name/email, committer = service, trailer `Signed-in-user: <id>`; identity routes 404 in server mode
- [ ] T078 [US4] Working copies server/projects/worktrees.ts (`git worktree add -b`, `lock`, list porcelain → in-use map, publish, pull-default, removal) and copy-aware paths in server/projects/paths.ts
- [ ] T079 [US4] Copy-aware scanning, cache keys (copy, project, path) with entities by blob hash, watchers per active copy with 30-minute idle release, `SW_CACHE_DIR` in server/projects/workspace.ts, server/projects/cache.ts, server/projects/watcher.ts
- [ ] T080 [US4] Per-person drafts, views, grouping corrections and suggestion state under `state/users/<userKey>/` in server/projects/state.ts and server/handler.ts (grouping routes)
- [ ] T081 [US4] Viewer reads the published state; Editor+ reads their copy; `published` event in server/projects/workspace.ts and server/projects/events.ts
- [ ] T082 [US4] Commits with author env, service committer and trailer in server/projects/git.ts; publish and pull-default routes in server/routes/git.ts
- [ ] T083 [US4] Server-mode project delete and clear: list unpublished work, store per-person patches and drafts in the trash entry, remove worktrees, journaled, in server/projects/trash.ts (data-model Trash entry)
- [ ] T084 [US4] UI: branch picker "in use by", **Publish to <default>**, **Pull from <default>**, identity dialog hidden in server mode, in src/scm/BranchPicker.tsx, src/scm/SourceControl.tsx, src/scm/CommitDialog.tsx
- [ ] T085 [US4] Browser check scripts/two-editors-check.ts: two contexts (alice, frank) on one repository; edits, stage, commit, switch, pull never affect the other; authors correct; publish visible to carol-like Viewer of Sales (SC-007)
- [ ] T086 [US4] Mutants: commit author not principal; publish not fast-forward; switch to a branch in use; draft keyed without person; base checkout edited; push or publish to a protected branch by an Editor — in scripts/mutation-tests.ts

---

## Phase 11: User Story 5 - Governed metrics and protected classifications (Priority: P2)

**Goal**: server-side metric lifecycle and classification guards on every write path.

**Independent Test**: `bun test tests/auth/guards.test.ts` and the matrix guard cases.

- [ ] T087 [P] [US5] Guard tests in tests/auth/guards.test.ts: status to approved/deprecated by Editor refused; self-approval refused for every role; approved metric changed by non-approver stored as proposed with only the `status` bytes changed; description-only change keeps approved; classification/criticalDataElement/team/roles change needs Steward; property at or above protected level needs Steward; level aliases and unmapped values → `internal`; owner match by email/username case-insensitive, unverified owners (FR-060 to FR-067)
- [ ] T088 [P] [US5] Matrix guard cases in tests/auth/matrix.test.ts across Source save, save-batch, item edit, legacy document save, metric save, import with replace, revert and pull (whole operation refused, guarded pointers named) (FR-066)
- [ ] T089 [US5] Guard engine server/auth/guards.ts using the shared parsers (research R11) and `editGuarded`/`approveMetric` decisions; demotion through the item-level edit
- [ ] T090 [US5] Apply guards in every content write path: server/routes/files.ts, server/routes/kpis.ts and metrics routes, server/handler.ts (`POST /api/documents`), server/projects/workspace.ts (import replace, save-batch), server/projects/scm.ts (revert, pull, pull-default preflight)
- [ ] T091 [US5] UI: **Approve** / **Deprecate** actions for Stewards (disabled with reason otherwise, never for own metrics), "unverified owner" badge, owner picker from Users, guard-aware classification editors via src/auth/guards-client.ts in src/metrics/MetricDetail.tsx, src/metrics/MetricWizard.tsx, src/odcs/PropertyEditors.tsx
- [ ] T092 [US5] Browser check scripts/auth-browser-check.ts (part 4): lifecycle as alice and bob; Editor classification edit refused
- [ ] T093 [US5] Mutants: self-approval allowed; approved metric edit not demoted; classification change allowed to Editor; guard skipped in save-batch; guard skipped in pull — in scripts/mutation-tests.ts

---

## Phase 12: User Story 6 - Remote Git with your own credentials (Priority: P2)

**Goal**: delegated credentials per person and command; Admin-only remote changes with host
allow-list.

**Independent Test**: `bun test tests/auth/remote-credentials.test.ts`.

- [ ] T094 [P] [US6] Tests in tests/auth/remote-credentials.test.ts with a local credential-checking Git HTTP test server (Bun) and stubbed token issuance: Azure DevOps OBO token used for that person only; GitHub connect flow then push; missing credential → 428 `{connect}`; token absent from .git/config, files under the data root, logs, audit and responses; host not allowed → 400; remote change and clone by non-Admin → 403; local mode unchanged (FR-080 to FR-084)
- [ ] T095 [US6] OBO and GitHub token handling server/auth/remote-credentials.ts; routes `/auth/github/start` and `/auth/github/callback` in server/routes/auth.ts
- [ ] T096 [US6] Askpass helper server/bin/sw-askpass and per-command environment (`-c credential.helper=`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS`) for fetch/pull/push/sync/clone in server/projects/git.ts; masking in error text
- [ ] T097 [US6] Host allow-list and Admin-only remote/clone/register-projects decisions in server/routes/git.ts, server/routes/clone.ts, server/routes/repos.ts
- [ ] T098 [US6] UI: **Connect GitHub** / Azure DevOps status in the person menu and a connect prompt on 428 in src/scm/ConnectAccount.tsx and src/scm/SourceControl.tsx; credential guide shown in local mode only
- [ ] T099 [US6] Mutants: credential written to .git/config; remote change by non-Admin; host allow-list skipped; remote operation without explicit action — in scripts/mutation-tests.ts

---

## Phase 13: User Story 7 - Agents call the API with their own identity (Priority: P2)

**Goal**: client-credentials access to the agent routes, scoped by Admin grants.

**Independent Test**: `bun test tests/auth/bearer.test.ts`.

- [ ] T100 [P] [US7] Tests in tests/auth/bearer.test.ts: granted client sees only granted mappings; ungranted sees none; bearer outside `/api/agent/*` → 401; expired, wrong signature, wrong audience, wrong issuer, missing `Agent` role → 401 and audited; context does not resolve ontologies from ungranted projects (FR-015, FR-090, FR-091)
- [ ] T101 [US7] Bearer validation server/auth/bearer.ts with `jose` remote JWKS (cache, refresh on unknown `kid` at most every 5 minutes, RS256/ES256 only)
- [ ] T102 [US7] Client principals and grants from `agents.json` in server/auth/principal.ts and server/auth/authorize.ts; audit of every agent call
- [ ] T103 [US7] Mutants: bearer accepted outside agent routes; audience unchecked; client grant ignored — in scripts/mutation-tests.ts

---

## Phase 14: Polish and cross-cutting

- [ ] T111 [P] README: both modes, configuration table, Entra guide (app roles, groups claim, overage permission, federated credential, Azure DevOps permission), Keycloak guide, role matrix and what each role sees, Admin panel, bootstrap Admin break-glass recovery, outbound calls of server mode (including the platform managed-identity endpoint when `SW_OIDC_CLIENT_ASSERTION=managed-identity`), delegated credentials, per-person working copies and publishing, audit log, single-instance limit and scale path, residual exposure of commit messages; running the image with Compose (both profiles, host networking and the Docker Desktop setting), the local build scripts (`ci:validate`, `image:*`, `pipeline:*`, `deploy:*`), the Azure DevOps pipeline and the link to deploy/README.md, and that the GitHub repository runs nothing automatically; counts from tests (constitution VII, FR-121)
- [ ] T112 [P] docs/agent-runtime.md: authentication for agent clients and project grants
- [ ] T113 Full authorization matrix and mutation run through `bun run ci:validate`; record commands, counts, durations and the manual Entra checklist results in specs/003-authn-authz/verification.md (SC-001 to SC-018)
- [ ] T114 Security review of the diff (cookie flags, CSRF, redirects, token handling, path rules, Git argument handling, image user and contents, pipeline permissions and service-connection scopes, absence of stored secrets) with findings fixed or recorded in specs/003-authn-authz/verification.md

---

## Dependencies & Execution Order

- Phase 0 (after 002 merges) → Phase 1 → Phase 2 → Phase 3 (container) → Phase 4 (local build
  scripts and pipeline definition) → Phase 5 (US1) → Phase 6 (Azure delivery definition) →
  Phases 7–13 → Phase 14.
- Phase 3 needs Phase 2 only (local mode through the boundary); T118 before T110.
- Phase 4 needs Phase 3 (the `image` and `container` steps build and run the image); T121 and T122
  before T123; T124 after T120 and T123.
- US1 (Phase 5) before every server-mode story; T125 needs T110 and T030; T109 needs T108 and T121.
- Phase 6 needs US1 (server mode cannot start without a provider) and Phase 4; T128 and T129
  follow their tests T127 and T126; T130–T131 need T129; T133 needs T107, T131 and a trial
  organisation and subscription (it does not block code work or later phases).
- US2 and US3 after Phase 6 (or after US1: only T133 needs Azure); T051 extends T038 (shared
  matrix file).
- US8 after US3 (Admin API reuses the write authorization and the matrix); earlier phases seed
  `data/admin/` from the fixture.
- US4 after US3; US5 after US4 (guards on pull and pull-default use the copy model); US6 after
  US4 (remote operations run in copies); US7 after US2 (agent filtering).
- Phase 14 last.

### Parallel opportunities

- Phase 1: T004–T009 together after T003.
- Phase 2: T010, T012, T013, T016, T017, T019, T021, T023 together; implementations follow their
  tests.
- Phase 3: T104, T115, T117 together; T106 in parallel with T105/T116.
- Phase 4: T120 with T121 and T122, then T123, then T124.
- US1: T026–T028 together; T108 in parallel with T029–T035. Phase 6: T126, T127, T107 together.
  US2: T038–T040 together. US8: T057–T059 together, then dialogs T065–T072 in parallel with the
  API tasks T060–T064.
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
  the pipeline definition ready for the target to import; the tag is deployed by the target's
  pipeline (trial run T133 when an organisation is available).
