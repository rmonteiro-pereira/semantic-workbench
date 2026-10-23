# Tasks: Logging and Telemetry (v0.5.0)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)

**Prerequisites**: constitution 3.2.0 (amended in this feature).

Status: all tasks are done on branch `005-observability`; the release gate is recorded with the
v0.5.0 release.

## Phase 1: Constitution and dependencies

- [x] T001 Amend `.specify/memory/constitution.md` to 3.2.0 with a Sync Impact Report
- [x] T002 Add the pinned dependencies to `package.json` and `bun.lock`
- [x] T003 Write `specs/005-observability/` (spec, plan, research, tasks)

## Phase 2: Structured logging (User Story 1)

- [x] T004 [US1] `server/observability/settings.ts`: `SW_LOG_LEVEL`, formats; read by `server/config.ts`
- [x] T005 [US1] `server/observability/redaction.ts` and `tests/observability/redaction.test.ts`
- [x] T006 [US1] `server/observability/log.ts` and `tests/observability/log.test.ts`
- [x] T007 [US1] `server/observability/request-context.ts`, `http-request.ts`; wrap the access middleware; `tests/observability/request-log.test.ts`
- [x] T008 [US1] Replace every console call in `server/` with the logger and update the tests that read the old lines
- [x] T009 [US1] `tests/helpers/quiet-logging.ts` and `bunfig.toml` keep routine lines out of test output

## Phase 3: Telemetry export (User Story 2)

- [x] T010 [US2] `server/observability/tracing.ts`, `metrics.ts`
- [x] T011 [US2] `server/observability/telemetry.ts`, `pipeline.ts`, `azure-backends.ts`; start and stop in `server/index.ts`
- [x] T012 [US2] Spans and metrics for Git (`git-command.ts`), scans and validation (`workspace-work.ts`), policy reloads (`admin-repo.ts`), sign-in steps (`authentication.ts`), event streams (`events.ts`), authentication failures (`middleware.ts`)
- [x] T013 [US2] `/healthz` reports telemetry status (`server/routes/health.ts`)
- [x] T014 [US2] `tests/observability/settings.test.ts`, `telemetry-off.test.ts`, `azure-backends.test.ts`, `telemetry-export.test.ts`, `git-command.test.ts`

## Phase 4: Browser reports (User Story 3)

- [x] T015 [US3] `src/observability/browser-report.ts` (schema, limits, budgets) and `tests/observability/browser-report.test.ts`
- [x] T016 [US3] `server/routes/browser-reports.ts`, `server/observability/browser-report-recorder.ts`; route inventory row, authorization matrix example, guard exemption, audit exemption
- [x] T017 [US3] `src/observability/reporter.ts`, `page-reporting.ts`; wire `lint.ts`, `autosave.ts`, `FullGraph.tsx`, `main.tsx`, `useMe.ts`; `/api/me` flag
- [x] T018 [US3] `tests/observability/browser-report-route.test.ts`, `reporter.test.ts`
- [x] T019 [US3] `scripts/telemetry-browser-check.ts` (`test:telemetry`), gate suite and pipeline matrix entry

## Phase 5: Deployment and documentation (User Story 4)

- [x] T020 [US4] `deploy/README.md`, `deploy/trial-runbook.md`, `specs/003-authn-authz/contracts/configuration.md`, `.env.server.example`
- [x] T021 [US4] `scripts/deploy.ts` preflight (Key Vault references) and `scripts/deploy-smoke.ts` (`--expect-telemetry`), with tests
- [x] T022 README section "Logging and telemetry", `ARCHITECTURE.md` code map and cross-cutting concern

## Phase 6: Mutation and gate

- [x] T023 Mutants and cases: `scripts/observability-mutants.ts`, `observability-cases.ts`, wired in `mutation-tests.ts` and `mutation-case.ts`
- [x] T024 Update the older mutation cases that read the previous log lines
- [x] T025 Run the gate: `bun test`, `check`, `build`, `test:mutation`, affected browser suites, `test:auth`, `test:container`
