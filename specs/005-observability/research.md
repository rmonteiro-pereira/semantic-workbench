# Research: Logging and Telemetry (v0.5.0)

Each entry gives the decision, why, and what was rejected.

## R1 Export path: OpenTelemetry SDK pieces with the Azure Monitor exporter

**Decision.** Use the OpenTelemetry API in application code and, when telemetry is on, the SDK
packages (`sdk-trace-base`, `sdk-metrics`, `sdk-logs`, `resources`) with
`@azure/monitor-opentelemetry-exporter`, configured by the connection string.

**Why.** The owner asked for OpenTelemetry traces, metrics and logs into Application Insights
through the Azure exporter. The pieces are what the exporter plugs into, and wiring them by hand
keeps every network-relevant choice visible: which exporters exist, which sampler, which providers.

**Rejected.** `@azure/monitor-opentelemetry` (the distro) registers auto-instrumentations that
patch Node's HTTP modules and can open a live-metrics connection; that is more outbound behaviour
than Principle I's amendment allows. `applicationinsights` (the classic SDK) has its own API and
would not give OpenTelemetry spans. A hand-written exporter would mean owning a wire format.

## R2 Running under Bun

**Finding.** The SDK, the exporter and `AsyncLocalStorage` load and work under Bun 1.4; the export
test runs real providers with in-memory exporters. The Azure exporters were also constructed and
shut down with every socket forbidden (`tests/observability/azure-backends.test.ts`). Sending to
Azure was not tested, by design: no test may contact Azure.

**Finding: usage reporting.** Constructing the Azure exporters starts the exporter's own usage
reporting ("Statsbeat"): a request to the cloud metadata address and later one to a Microsoft
endpoint. That is a destination the amendment does not allow and an operator did not choose, so
`azure-backends.ts` sets `APPLICATION_INSIGHTS_NO_STATSBEAT` and
`APPLICATIONINSIGHTS_STATSBEAT_DISABLED` before loading the exporter. A test and a mutant guard it.
The second variable is for later exporter versions; in 1.0.0-beta.32 only the first has an effect.

## R3 Proving the off path

**Decision.** Three checks. (a) A subprocess starts telemetry in local mode, in server mode without
a string and in local mode with a string, runs instrumented calls, forbids `net`, `tls` and
`fetch`, and then lists `require.cache` for SDK and exporter modules; a control run that loads one
proves the listing sees them. (b) A static walk of `server/index.ts`'s imports (non-dynamic only)
must not reach those packages. (c) A mutant removes the guard in `startTelemetry` and in
`readTelemetry`.

**Why.** `bun test` runs files in one process, so loaded-module checks need a fresh process.
Bun's `plugin` resolve hooks do not see node_modules resolution, so module listing plus a static
walk is the dependable pair.

## R4 Where the guard lives

**Decision.** Two places. `readTelemetry` (in `settings.ts`, called by `readConfig`) returns "off"
for local mode and for a missing string, so no other code ever sees a connection string in local
mode. `startTelemetry` returns before any import when the settings are off.

**Why.** The settings are decided once, in the one module that reads the environment, as the
constitution's technical constraints expect, and the loader cannot be reached with an enabled
setting by accident.

## R5 One logger, console as the sink

**Decision.** `log` is a module-level facade over a logger set once by `configureLogging`. The
default writer calls `console.log` and `console.error` at call time.

**Why.** The server called `console` from about thirty places; a facade reaches all of them with
one import each. Writing through the console at call time keeps existing tests that spy on it
working, and keeps one stream for platforms that collect stdout. Rejected: passing a logger
through every constructor (large signature changes for no gain here).

## R6 Redaction by name and by value

**Decision.** A field whose name contains a secret, content or location word is dropped whatever it
holds; every other string value is scanned and bounded. Fields the logger itself writes (`event`,
`route`, `method`, `requestId`) are trusted.

**Why.** Name-only redaction misses a token inside an error message; value-only redaction misses
content that does not look like anything. Together they fail safe: an author who names a field
`source` loses it, not leaks it. The cost is that useful names containing a flagged word (`file`,
`path`) cannot be used, which the README states.

**Limit.** Free text that is neither a pattern nor quoted (for example a sentence from a document
in a browser error message) cannot be detected. Browser messages are therefore also cut to 200
characters, have quoted text replaced, and never include the message line of a stack.

## R7 Route templates

**Decision.** The route for logs, spans and metric labels is the matched row of the route
inventory (`server/auth/route-actions.ts`) with its method removed; unmatched requests are
`unmatched`; server pages are `pages`.

**Why.** The inventory is already the one list of entry points and has a fixed size, so label
cardinality is bounded and no raw path (project names, file names, identifiers) can enter a metric.

## R8 Actor pseudonym

**Decision.** `user-` or `client-` plus 16 hex of HMAC-SHA-256(salt, principal key), with the salt
from `SW_TELEMETRY_ACTOR_SALT` or random per start. See the plan for the reasoning.

**Rejected.** The raw provider id (personal data in a third-party store); the existing
`principal.key` (an unsalted hash that anyone holding an object id can recompute); the e-mail
address or name (personal data). A stable unsalted default was rejected so that the safe setting is
the default.

## R9 Sampling

**Decision.** `ApplicationInsightsSampler` at a configurable ratio, default 0.1; metrics and logs
unsampled.

**Why.** A team server with tens of people produces modest volume, so a full sample would be
affordable, but 0.1 keeps ingestion costs predictable by default while the unsampled metrics give
exact counts and the unsampled error logs keep every failure findable. The Application Insights
sampler records the ratio on each span so the portal scales counts back up. Operators who want
every trace set `1`.

## R10 Browser reports

**Decision.** Reports go only to the workbench API. The page learns whether to send from `/api/me`,
queues in memory until then and discards the queue if the answer is no. The route reuses the
existing `viewOwnState` action (any signed-in person with a grant may act on their own state) and is
exempt from the audit log when allowed.

**Why.** No new action means no change to the policy model or the roles. Auditing a stream of
timing reports would drown the security record; refusals are still audited.

**Rejected.** `navigator.sendBeacon` (cannot carry the `X-SW-Request` header the server requires of
every write); a separate unauthenticated endpoint (abuse); sending to Application Insights from the
browser (Principle I).

**Budgets.** Validation 500 ms (findings within 500 ms of a typing pause), graph layout 2000 ms
(the first view within 2 s) and save 2000 ms (an edit visible to open tabs within 2 s). No budget
was changed to make a measurement pass.

## R11 Request ids

The access middleware already generated an id per request and returned it as `X-Request-Id`; the
audit log already stores it. The feature reuses that id rather than adding a second one, and makes
it ambient through `AsyncLocalStorage` so log lines no longer need it passed down.

## R12 Tests used instead of Azure

An in-memory collecting exporter replaces Azure Monitor in `telemetry-export.test.ts`; it receives
what the real exporter would receive, after the same providers, samplers and processors. The
pipeline smoke check reads `/healthz` and nothing else. The first real send happens at the owner
trial, step 11 of `deploy/trial-runbook.md`.
