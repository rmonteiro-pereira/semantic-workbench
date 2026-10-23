# Implementation Plan: Logging and Telemetry (v0.5.0)

**Branch**: `005-observability` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-observability/spec.md`

## Summary

The server gets one structured logger and, in server mode only, opt-in OpenTelemetry export to
Azure Monitor. The logger replaces every ad-hoc console call, writes JSON lines (server) or
readable lines (local), redacts by field name and by value, and tags each line with the request id
and a pseudonymous actor through `AsyncLocalStorage`. The access middleware wraps each request in
a context, a server span and a finished-request log line that names the route template.
Spans and metrics come from the OpenTelemetry API, which does nothing until the SDK is registered;
the SDK, the Azure exporter and the context manager are loaded by a dynamic import that runs only
when telemetry is on, so the off path loads nothing and opens no socket. Browsers send errors and
timings to `POST /api/telemetry/browser`, a checked, size-limited, rate-limited route that exists
only while telemetry is on; the server turns them into counters and log lines. The constitution is
amended to 3.2.0 to allow exactly this.

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server) and React 19 (browser), as before.

**Primary Dependencies**: new, pinned to exact versions (see Dependency justification):
`@azure/monitor-opentelemetry-exporter` 1.0.0-beta.32, `@opentelemetry/api` 1.10.0,
`@opentelemetry/api-logs` 0.200.0, `@opentelemetry/sdk-logs` 0.200.0,
`@opentelemetry/sdk-metrics` 2.12.0, `@opentelemetry/sdk-trace-base` 2.12.0,
`@opentelemetry/resources` 2.12.0, `@opentelemetry/context-async-hooks` 2.12.0.

**Storage**: none. Logs go to stdout; telemetry goes to Application Insights; the audit log is
untouched.

**Testing**: `bun test` (`tests/observability/`), `test:mutation` (`scripts/observability-*.ts`),
`test:telemetry` (browser), `test:container`.

**Target Platform**: the existing container on Azure Container Apps; local mode on a developer
machine.

**Project Type**: web service plus single-page app (unchanged).

**Performance Goals**: no measurable change to request latency with telemetry off. One request adds
one async context entry, one span lookup that returns a no-op, and one log line.

**Constraints**: local mode makes no network call for telemetry (constitution I); no document
content, path, query string, secret or person's identity in any record; exports never delay a
response.

**Scale/Scope**: one instance per data root; tens of people; tens of requests per second at peak.

## Constitution Check

Checked against constitution 3.2.0 (amended by this feature).

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | Local mode: telemetry is forced off in `readTelemetry`, no SDK is imported, a subprocess test proves no socket is opened, and the browser never receives `browserReports: true`. Server mode: the only new destination is the Application Insights host named in the operator's connection string, validated against Microsoft's ingestion hosts at start-up. Browsers talk only to the workbench API. No document content in any record (redaction tests, export test). Audit log unchanged. |
| II. Byte-Exact Source Preservation | No file is read or written by this feature. |
| III. One Validation Rule Set | Validation is timed, never changed. The same `validateInput` runs; a wrapper records its duration. |
| IV. Atomic, Hash-Checked File Persistence | Untouched. Git runs through the same `spawnGit`; the wrapper only measures and never changes arguments, environment, cwd or timeouts. |
| V. Pinned Official Standards | Untouched. |
| VI. Verification Gate | Unit, export, subprocess, route and browser tests; mutants for redaction, the off guard, report validation and limits, the reporter and the audit exemption; the new route is in the route inventory, the authorization matrix and the guard inventory (exempt, with its reason). |
| VII. Honest Claims | README gains "Logging and telemetry" with every record type, the outbound call, the limits and the pseudonym decision; counts are from tests. |
| VIII. Readable Code | One module per concept under `server/observability/`, functions under 40 lines, comments explain why, no IDs in comments. |
| Technical Constraints | New dependencies are justified below and make only the call Principle I now allows. Input limits unchanged. |
| Development Workflow | Gate: `bun test`, `check`, `build`, `test:mutation`, affected browser suites, `test:auth`, `test:container`. |

No exception is needed, so Complexity Tracking is empty.

## Decisions

The reasons and rejected alternatives are in [research.md](./research.md).

1. **Logger as a module singleton with injected writers.** `log` delegates to a logger configured
   once by `configureLogging`; tests build their own with `createLogger`. Existing code called
   `console` directly, so a singleton is the smallest change that reaches every call site.
2. **Request context through `AsyncLocalStorage`.** Any log line, at any depth, carries the request
   id and actor without passing them down.
3. **API-only instrumentation in application code.** Application code imports `@opentelemetry/api`
   only. The SDK is imported in `pipeline.ts`, reached only through
   `await import('./pipeline')` in `telemetry.ts`.
4. **Actor pseudonym.** The decision is below.
5. **Sampling.** `ApplicationInsightsSampler` at `SW_TRACE_SAMPLE_RATIO`, default 0.1, so
   Application Insights can scale counts back up; metrics and logs are unsampled, so failures are
   always visible.
6. **Browser reports through the API.** One strict schema shared by browser and server in
   `src/observability/browser-report.ts`; the server re-scrubs.

### Actor pseudonym (decision)

Logs and telemetry identify a person only as `user-<16 hex>` (or `client-<16 hex>` for an agent
client): an HMAC-SHA-256 of the principal key, keyed by `SW_TELEMETRY_ACTOR_SALT`.

- Hashing is chosen over sending the principal key or the identity-provider id because the key is
  an unsalted hash of the provider id, so anyone who knows a person's object id could compute it
  and look the person up in telemetry. With a secret salt they cannot.
- The salt is optional. Unset, each start uses a random salt: pseudonyms still tie one person's
  requests together within a run, and nothing is stored or linkable across restarts. Setting it
  makes pseudonyms stable across restarts and revisions, for operators who want to follow one
  person over days; it lives in Key Vault like other secrets.
- Operators who need to name a person use the request id: the audit log holds the same id next to
  the full principal.
- No name, e-mail address, user name or group appears in logs or telemetry.

### Dependency justification

| Package | Why | Licence | Unpacked size | Runtime effect |
|---|---|---|---|---|
| `@azure/monitor-opentelemetry-exporter` 1.0.0-beta.32 | Microsoft's exporter for traces, metrics and logs to Application Insights, configured by connection string. The only supported way to reach Application Insights from OpenTelemetry without the larger distro | MIT | 2.1 MB, plus the Azure core packages it needs (about 6 MB) | loaded only when telemetry is on |
| `@opentelemetry/api` 1.10.0 | The stable instrumentation API; a no-op without an SDK | Apache-2.0 | 1.9 MB (mostly declarations) | always loaded, does nothing |
| `@opentelemetry/api-logs` 0.200.0 | Log bridge API; the exporter requires this line | Apache-2.0 | 0.7 MB | always loaded (the bridge is a no-op) |
| `@opentelemetry/sdk-trace-base`, `sdk-metrics`, `sdk-logs`, `resources` | The SDK pieces the exporter plugs into | Apache-2.0 | 0.3, 3.4, 3.9 and 1.4 MB | loaded only when telemetry is on |
| `@opentelemetry/context-async-hooks` 2.12.0 | Makes spans nest across `await`, so a Git span sits under its request | Apache-2.0 | 0.1 MB | loaded only when telemetry is on |

- **Maintenance.** The OpenTelemetry packages are maintained by the CNCF project. The Azure
  exporter is published by the Azure SDK team; its `latest` tag is still a 1.0.0 beta, and its
  logs line (`api-logs` and `sdk-logs` 0.200) is experimental. All versions are pinned exactly
  and move together; an upgrade is a deliberate change with the export test as its gate.
- **Network.** Neither library calls out unless an exporter is constructed with a connection
  string, which happens only on the enabled path.
- **Total.** About 25 new packages, 35 MB in `node_modules`, mostly declarations and source maps.
  The browser bundle is unchanged: none of them is imported from `src/`. The image grows by the
  same amount and its start-up is unchanged with telemetry off.
- **Alternatives rejected**: `@azure/monitor-opentelemetry` (the distro: auto-instrumentation
  hooks Node's HTTP modules and adds live-metrics connections, which the constitution does not
  want by default); `applicationinsights` (the older SDK, own API); hand-written HTTP export (a
  wire format to maintain).

## Project Structure

### Documentation (this feature)

```text
specs/005-observability/
├── spec.md
├── plan.md
├── research.md
└── tasks.md
```

### Source Code (repository root)

```text
server/observability/
├── settings.ts          # SW_LOG_LEVEL, connection string checks, sampling ratio, off reasons
├── redaction.ts         # by field name and by value
├── log.ts               # the logger, levels, formats, sinks
├── request-context.ts   # AsyncLocalStorage context, actor pseudonym
├── http-request.ts      # per-request context, span, metric and log line; route templates
├── tracing.ts           # withSpan / withSpanSync over the API
├── metrics.ts           # instruments and their recorders
├── git-command.ts       # Git span, metric and argument summary
├── workspace-work.ts    # scan and validation measurement
├── browser-report-recorder.ts # accepted reports become metrics and log lines
├── telemetry.ts         # decision, dynamic load, shutdown
└── pipeline.ts          # SDK providers and exporters (loaded only when on)
server/routes/browser-reports.ts        # POST /api/telemetry/browser
src/observability/
├── browser-report.ts    # shared schema, limits, budgets, scrubbing
├── reporter.ts          # queue, batching, limits
└── page-reporting.ts # listeners, page load, sender, timing wrapper
tests/observability/
scripts/observability-cases.ts, scripts/observability-mutants.ts, scripts/telemetry-browser-check.ts
```

**Structure Decision**: the repository's existing layout. A new folder `server/observability/`
holds the cross-cutting concept, named after the domain; the route lives with the other routes;
the browser files live in `src/observability/` because browser and server share the schema, as
they share `validation`.

## Complexity Tracking

None.
