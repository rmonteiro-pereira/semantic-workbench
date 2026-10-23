# Feature Specification: Logging and Telemetry (v0.5.0)

**Feature Branch**: `005-observability`

**Created**: 2026-10-23

**Status**: Implemented on the branch; awaiting the v0.5.0 release gate

**Input**: The owner wants the server to log in a form operators can search, and to report traces,
metrics and logs to Azure Monitor (Application Insights) when it runs as a team server. Browser
errors and slow operations should reach the same place through the API. Local mode must stay
silent on the network. The owner approved this and the matching constitution amendment (3.2.0) on
2026-10-23.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An operator reads and filters the server log (Priority: P1)

An operator runs the container and opens its log. Every line is one JSON object with a level, an
event name and the fields that explain it. Each request leaves one line with its method, route
template, status, duration and a pseudonymous actor, plus the request id that the browser also
received in the `X-Request-Id` response header. A developer running locally sees the same events
as short readable lines.

**Why this priority**: it is useful on day one, needs no Azure resource and carries no privacy
decision beyond redaction.

**Independent Test**: start the server in each mode, make requests, and read stdout.

**Acceptance Scenarios**:

1. **Given** server mode, **When** a request is handled, **Then** stdout gains one JSON line
   `http.request` whose `requestId` equals the response's `X-Request-Id`, whose `route` is the
   template (for example `/api/projects/:slug/files/*`) and which holds no raw path or query.
2. **Given** `SW_LOG_LEVEL=warn`, **When** requests succeed, **Then** no `http.request` line
   appears for them, and failures still do.
3. **Given** local mode, **When** a request is handled, **Then** the line is readable
   (`12:30:45 INFO  http.request ... actor=local`) and nothing is sent anywhere.
4. **Given** an error whose text holds a token, a cookie, a signed token, an address with
   credentials or a file location, **When** it is logged, **Then** those parts are replaced.
5. **Given** a log line written deep in the code while a request is handled, **Then** it carries
   the same request id.

---

### User Story 2 - An operator sees traces, metrics and logs in Application Insights (Priority: P1)

An operator sets a connection string (from Key Vault) on the container. The server then exports
a span per request and for Git commands, scans, saves, policy reloads and sign-in steps, metrics
for the same work, and its log lines, all labelled with the service, version, commit and mode.
Without the connection string, or in local mode, none of it happens.

**Why this priority**: it is the point of the release.

**Independent Test**: an in-memory exporter stands in for Azure Monitor; a subprocess proves the
off path.

**Acceptance Scenarios**:

1. **Given** server mode and a connection string, **When** requests, Git commands, a scan, a
   save, a policy reload and a refused bearer token happen, **Then** the spans and metrics listed
   in FR-009 and FR-010 are exported with the documented attributes.
2. **Given** telemetry on, **Then** a log line carries the `traceId` and `spanId` of its request,
   and the same log is exported through the log bridge.
3. **Given** no connection string, **Or** local mode with a connection string set, **Then** the
   OpenTelemetry SDK and the Azure exporter are never loaded and no socket is opened.
4. **Given** telemetry on, **Then** no exported span, metric or log holds a token, an
   authorization code, document text, a file name, a project name or a person's name, address or
   identity-provider id.
5. **Given** a connection string that names a host other than Application Insights, **Then**
   start-up refuses, naming the variable and not repeating the value.

---

### User Story 3 - Browser errors and slow operations reach telemetry (Priority: P2)

When telemetry is on, a signed-in page sends JavaScript errors, unhandled rejections, its page
load time and operations that ran over their budget (graph layout, validation, save) to the
workbench API. The server records them like its own telemetry.

**Why this priority**: it completes the picture, and depends on story 2.

**Independent Test**: a browser check with a mocked API throws an error in the page and reads the
request the page sends.

**Acceptance Scenarios**:

1. **Given** telemetry on, **When** a script error is thrown, **Then** the page posts a report to
   `/api/telemetry/browser`, whose message has its quoted text replaced.
2. **Given** telemetry off or local mode, **Then** the page sends nothing, and the route answers
   404.
3. **Given** a report with an unknown field, a value over its limit or an unknown kind, **Then**
   the API answers 400 and records nothing.
4. **Given** a person who sends more than the allowance, **Then** the API answers 429 with
   `Retry-After`.
5. **Given** a page that is not signed in, **Then** the API answers 401.
6. **Given** any page, **Then** it contacts no host other than the workbench.

---

### User Story 4 - A deployer turns it on without surprises (Priority: P2)

The deployment guide lists `APPLICATIONINSIGHTS_CONNECTION_STRING` (a Key Vault reference) and
`SW_LOG_LEVEL`, the trial runbook covers checking that data arrives, and the pipeline's smoke test
can confirm that telemetry is configured through `/healthz`, which says whether it is on and never
where it sends.

**Independent Test**: `pipeline:lint`, `deploy:smoke` unit tests and `test:container` with
telemetry off.

### Edge Cases

- Azure Monitor is unreachable: exports fail quietly in the SDK, requests are not delayed, and the
  server keeps serving. Shutdown waits at most five seconds for a final flush.
- The connection string is rotated: a restart picks it up; there is no hot reload.
- A request is aborted mid-stream (the event stream): the span ends when the response headers are
  returned; the open stream count falls when the connection closes.
- A log field is named like a secret by accident (`token`, `path`, `source`): it is dropped.
  Operational counts must use other names (`files`, not `fileCount`).
- A browser error message quotes document text: quoted parts are replaced before sending and
  again on the server. Unquoted fragments of text cannot be detected; the message is also cut to
  200 characters and stack message lines are never sent.
- Two instances during a hand-over: both export; `service.instance.id` is the revision name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST write its operational output through one logger module
  (`server/observability/log.ts`); no other server module writes to the console, except the audit
  log's own mirror and failure line, which stay unchanged, and the askpass program.
- **FR-002**: The logger MUST write JSON lines on stdout in server mode and readable lines in
  local mode, and MUST honour `SW_LOG_LEVEL` (`debug`, `info`, `warn`, `error`, `silent`; default
  `info`; any other value refuses start-up).
- **FR-003**: Every request handled by the access middleware MUST get a new request id, returned
  in `X-Request-Id`, and MUST produce one `http.request` line with method, route template, status,
  duration in milliseconds and actor. Log lines written while the request is handled MUST carry its
  id and actor.
- **FR-004**: When a span is active, log lines MUST carry its `traceId` and `spanId`.
- **FR-005**: Log fields MUST be redacted by name (secrets, cookies, authorization, sessions,
  document content, file locations, query strings, addresses) and by value (bearer and basic
  credentials, signed tokens, address user information, query strings of addresses, secret-like
  assignments, file locations), and bounded in length, depth and array size.
- **FR-006**: The actor MUST be `local` in local mode, `anonymous` before sign-in, and otherwise
  `user-` or `client-` followed by 16 hex characters of an HMAC-SHA-256 of the principal key,
  keyed by `SW_TELEMETRY_ACTOR_SALT` (a new random value at each start when unset).
- **FR-007**: The audit log MUST be unchanged. Browser reports are not audited when allowed;
  refusals still are.
- **FR-008**: Telemetry MUST be off when the server runs in local mode (whatever the environment
  holds), and when `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset. When off, the OpenTelemetry
  SDK, the Azure Monitor exporter and the context manager MUST NOT be loaded, and no socket MUST be
  opened for telemetry.
- **FR-009**: When on, the server MUST create spans for: each HTTP request (name `METHOD route`),
  each Git command (`git <subcommand>`, with option names and an argument count, never argument
  values), each project scan and reindex (`workspace.scan`), validation on save (`validation`),
  administration policy reloads (`admin.policy.reload`) and sign-in steps (`auth.login.start`,
  `auth.callback.token-exchange`, `auth.callback.resolve-principal`, `auth.callback.create-session`,
  `auth.refresh`, `auth.logout`).
- **FR-010**: When on, the server MUST record metrics: `sw.http.server.requests` and
  `sw.http.server.duration` by route, method and status; `sw.git.command.duration` and
  `sw.git.command.failures` by subcommand; `sw.workspace.scan.duration`;
  `sw.validation.duration` by trigger (scan, save); `sw.sse.active_streams`; `sw.auth.failures` by
  reason; and the browser metrics of FR-014.
- **FR-011**: Log records MUST be exported through the OpenTelemetry log bridge when on, after the
  level filter.
- **FR-012**: Resource attributes MUST be `service.name`, `service.version`, `service.instance.id`
  (the Container Apps revision), `sw.commit` and `sw.mode`. Trace sampling MUST be configurable
  with `SW_TRACE_SAMPLE_RATIO` (0 to 1, default 0.1); metrics and logs are not sampled.
- **FR-013**: `POST /api/telemetry/browser` MUST exist in the route inventory with the action
  `viewOwnState`, be answered 404 while telemetry is off, be limited to 32 KiB and 20 reports per
  request and to a burst of 10 and 0.5 requests per second per person, and accept only the
  documented report shapes (strict fields, length limits, known operations).
- **FR-014**: The server MUST turn accepted reports into the counters `sw.browser.errors` (by
  kind), `sw.browser.operation.duration` (by operation), `sw.browser.over_budget` (by operation)
  and `browser.error` and `browser.slow-operation` log lines. Budgets are 500 ms for validation,
  2000 ms for graph layout and 2000 ms for save; a page load has none.
- **FR-015**: The browser MUST collect only errors, unhandled rejections, page load time and slow
  operations; MUST hold them in memory until `/api/me` says reports are wanted and discard them
  otherwise; MUST send at most 100 reports per page load; MUST replace quoted text in messages and
  never send stack message lines; and MUST NOT contact any host other than the workbench.
- **FR-016**: `/api/me` MUST say whether reports are wanted (`telemetry.browserReports`), and
  `/healthz` MUST say whether telemetry is on, never where it sends.
- **FR-017**: A connection string whose ingestion endpoint is not an https Application Insights
  host MUST refuse start-up without repeating the value.
- **FR-018**: The deployment documentation, the trial runbook and the variable list MUST list the connection-string Key Vault reference and `SW_LOG_LEVEL`. Pipeline tests MUST
  NOT contact Azure.

### Key Entities

- **Log record**: time, level, event name, redacted fields, request id, actor, optional trace and
  span ids.
- **Telemetry settings**: off with a reason (`local-mode`, `no-connection-string`) or on with a
  connection string and sampling ratio.
- **Browser report**: an error or rejection (name, scrubbed message, top stack frames) or an
  operation timing (operation, duration).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With telemetry off, a subprocess that starts the server's telemetry in local mode,
  in server mode without a string and with a string set loads no SDK module and attempts no
  socket (`tests/observability/telemetry-off.test.ts`).
- **SC-002**: An in-memory exporter receives every span and metric of FR-009 and FR-010 with the
  documented attributes, and none of the secrets, document text or personal details the test puts
  into the requests (`tests/observability/telemetry-export.test.ts`).
- **SC-003**: Every mutant of redaction, the telemetry-off guard, report validation and limits and
  the reporter is detected by `test:mutation`.
- **SC-004**: `test:telemetry` shows a thrown error reaching the report route with a mocked API and
  no request leaving the workbench's host.
- **SC-005**: The existing gate (unit tests, check, build, mutation, browser suites, `test:auth`,
  `test:container`) passes with telemetry off, and request latency is unchanged within noise: the
  off path adds one async context entry and one log line per request.

## Assumptions

- Application Insights is workspace-based and its connection string is stored in Key Vault, like
  the other secrets.
- Container logs are already collected by the platform; the JSON lines make them searchable there
  without Application Insights.
- Azure Monitor's own sampling and retention settings apply to what arrives.
- Out of scope: auto-instrumentation of libraries, distributed trace propagation to Git remotes,
  alert rules and workbooks, click or usage analytics, session replay, and any telemetry in local
  mode.
