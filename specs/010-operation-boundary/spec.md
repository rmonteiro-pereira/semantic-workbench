# Feature Specification: Operation Boundary

**Feature Branch**: `010-operation-boundary`

**Created**: 2026-11-16

**Status**: Draft

**Input**: The workbench will gain an MCP endpoint whose tools must be authorized exactly like
their HTTP twins (decision M1). Today the access middleware cannot be called by anything except a
network request: identity is resolved from cookies and headers, the action is fixed from the method
and path before the body is read, and the checks that make a request safe are spread over the
middleware and the route handlers. This feature splits that middleware so that an operation can be
authorized and executed through the same boundary whether it arrives as an HTTP request or as an
in-process twin request built by a tool, with the caller already authenticated. It also changes the
audit record and the dry-run sample so that MCP traffic is attributable and cannot distort access
reviews (M14), and it adds the checked-in operation inventory that proves nothing is exposed
without an owner, an action and a limit (M17). The MCP route, tools and person sign-in are not part
of it; feature 006 builds on this one.

## Summary

- One function, the **operation boundary**, takes an already authenticated **caller** and a **twin
  request** and runs route selection, authorization, the existing handler, refusal mapping and
  audit as one unit. The HTTP server uses the same function; there is no second authorization path.
- Request authentication (rate limits, local Host and Origin checks, bearer tokens, the cross-site
  check, sessions) becomes a separate stage that produces the caller. Nothing that a tool supplies
  can choose an action, a resource or a route.
- The audit record gains `origin`, `tool` and `connection`, records the semantic outcome
  of an operation even when the failure travels inside HTTP 200, and keeps every old record
  verifiable. The dry-run sample reads writes and denials separately from deduplicated MCP reads, so
  read volume cannot evict the decisions an Admin needs to review.
- Tool lists are computed from effective permissions on at least one target, not from role names,
  and every invocation checks its real targets again.
- `policies/operation-inventory.json` lists every route row with its service, action, targets,
  handler checks, limits, side effects and MCP exposure, and a test fails when a route is added,
  removed or changed without it.
- No HTTP behaviour changes. A characterization suite recorded before the refactor and checked in
  proves it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An operation is authorized the same way from either transport (Priority: P1)

A developer building the MCP tools (feature 006) maps each tool to the route it mirrors. The tool
builds a twin request, hands it to the operation boundary together with the caller that the MCP
endpoint authenticated, and receives the same status, body and audit outcome that the browser would
get for the same operation. The developer writes no authorization code in the tool.

**Why this priority**: it is the point of the feature. Without it, MCP either skips handler checks
(a commit tool that pushes without the push decision) or re-implements them.

**Independent Test**: a test-only caller and twin requests exercise every operation with a
handler-level check, and a table of cases compares the HTTP and twin answers.

**Acceptance Scenarios**:

1. **Given** a person who may commit but not push, **When** a twin `POST .../git/commit` with
   `push: true` is dispatched, **Then** the answer is the refusal the HTTP route gives, one denial
   record is written, and no commit is made.
2. **Given** a body-targeted save naming two files where the person may edit only one, **When** the
   twin is dispatched, **Then** nothing is written, the refused target is audited as a denial, and
   the answer equals the HTTP answer.
3. **Given** a file the person may not read, **When** a twin read names it, **Then** the answer and
   the audit reason are identical to those for a file that does not exist.
4. **Given** a trash entry, **When** a twin restore names it, **Then** the decision uses the entry's
   real action and target, as the HTTP route does.
5. **Given** a twin that names a route row different from the operation it claims, **When** it is
   dispatched, **Then** the boundary refuses it before any handler runs.
6. **Given** a caller that was not produced by request authentication, **When** it is passed to the
   boundary, **Then** the boundary refuses it.

---

### User Story 2 - HTTP behaviour does not change (Priority: P1)

An operator upgrades. Every browser, script and agent client keeps working unchanged: same
statuses, bodies, headers, refusal wording, audit records and rate limits.

**Why this priority**: the refactor touches the one path every request takes. A regression here is a
security regression.

**Independent Test**: the characterization suite, recorded on the commit before the refactor,
passes on the refactored code without edits.

**Acceptance Scenarios**:

1. **Given** the recorded cases (every route example, each caller kind, allowed and refused), **When**
   they run against the refactored server, **Then** each status, normalized body, selected response
   headers and audit record equals the recording.
2. **Given** the existing test suite, **When** it runs, **Then** it passes; any test changed only
   because it named a moved internal is listed in the pull request description.
3. **Given** each mutation of the new boundary (an authorization step skipped, reordered or applied
   to the wrong request), **When** the mutation suite runs, **Then** a test fails.

---

### User Story 3 - The audit log says where an operation came from (Priority: P1)

An Admin reviewing the audit log sees which records came from the browser, from MCP or from ACP,
which tool was called, and whether it truly succeeded. A tool call that failed inside an HTTP 200
envelope is recorded as failed. The log still verifies, including months written before this
feature.

**Why this priority**: M14 makes audit attribution the replacement for Git markers (M10), and a
record that says `ok` for a failed tool call is wrong.

**Independent Test**: write records of both shapes into one chain and run `audit:verify`; query by
origin and tool.

**Acceptance Scenarios**:

1. **Given** a record written by this feature, **When** it is read back, **Then** `origin`, `tool`
   and `connection` are present when supplied and absent otherwise.
2. **Given** audit months written before this feature, **When** `bun run audit:verify` runs on them
   alone and on them followed by new records, **Then** both pass.
3. **Given** a twin whose response is HTTP 200 with a failed result, **When** the caller supplies the
   outcome classifier, **Then** the record's outcome is `failed`.
4. **Given** one tool call, **Then** exactly one record is written for it, and none for the outer
   POST that carried it.
5. **Given** an Admin or Steward querying the log, **When** they filter by origin or tool, **Then**
   they see only the records they could already see.

---

### User Story 4 - Agent reads cannot hide a dry run's evidence (Priority: P2)

An Admin previews a policy change. The dry run replays recent decisions. An agent has made tens of
thousands of reads since the last human write, and the replay still contains the last writes and
denials.

**Why this priority**: without it, M14's "audit every read" would silently make dry runs
meaningless.

**Independent Test**: a log with many MCP read records and a few writes yields a sample that holds
every write.

**Acceptance Scenarios**:

1. **Given** 50,000 MCP read records followed by 300 write and denial records, **When** a dry run is
   built, **Then** all 300 are in the sample.
2. **Given** repeated identical MCP reads, **When** the sample is built, **Then** each distinct
   decision appears once.
3. **Given** a log with no MCP records, **When** a dry run is built, **Then** the result equals the
   result before this feature.

---

### User Story 5 - A client sees only the tools it could use (Priority: P2)

A person whose role allows reading and editing one project connects an agent. The tool list shows
the operations that person could perform somewhere, in a stable order, and omits administration,
purge and anything outside the connection's scope. Calling a listed tool on a target the person may
not touch is still refused.

**Why this priority**: M17 requires lists by effective permission; role names are wrong for custom
roles and conditional grants.

**Independent Test**: custom roles with path and project conditions, compared with the list.

**Acceptance Scenarios**:

1. **Given** a custom role granting `edit` only on `docs/**` of one project, **When** the list is
   computed, **Then** it includes the save operations.
2. **Given** a person with read access only, **Then** no write operation is listed.
3. **Given** a listed operation and a target the caller may not edit, **When** it is invoked,
   **Then** it is refused.
4. **Given** two callers with equal permissions and different role names, **Then** their lists are
   equal.

---

### User Story 6 - Every operation is inventoried before it can be exposed (Priority: P2)

A developer adds a route. The build fails until the route has an entry in the operation inventory
with its service, action, targets, handler checks, limits, side effects and MCP exposure. Anyone
reading the inventory can answer "what can an agent do, with what authority, and what does it
touch".

**Why this priority**: M17 and both reviews say "the whole workbench" is claimed without an
inventory; later increments (006 and its successors) are planned against this table.

**Independent Test**: delete or edit one entry or one route row and watch the test fail.

**Acceptance Scenarios**:

1. **Given** the current route rows, **Then** each has exactly one inventory entry and no entry is
   stale.
2. **Given** a row whose action, client action or target kind differs from its entry, **Then** the
   test fails naming the row.
3. **Given** browser-only capabilities such as SHACL validation, **Then** each has an entry with the
   reason it is not an operation yet and the increment that will add it.
4. **Given** the inventory, **Then** a generated table in `docs/` matches it byte for byte.

---

### Edge Cases

- A twin path containing `..`, an encoded slash, a query or a fragment in a parameter value cannot
  select another row (FR-011).
- A twin body larger than its operation's limit is refused by the builder; the route's own limit
  still applies as well.
- A response object is marked hidden by a handler and then cloned by the outcome classifier: the
  hidden mark is read before any clone is made.
- The audit write for a denial fails: the answer is 503, as for HTTP. The audit write for an allowed
  operation fails after it ran: the operation stands and the failure is logged, as for HTTP.
- A caller whose session ended between listing and invocation: the invocation is decided on the
  current state and refused; the list is advisory.
- A streaming route (the event stream) and every public route (sign-in, health, static pages) are
  not dispatchable; they are listed in the inventory with that reason.
- A twin operation that needs the caller's delegated Git credential finds it through the caller's
  session, never through a cookie.
- Operations that return success with a partly failed effect (for example a commit whose push
  failed) carry a classifier recorded in the inventory.
- Local mode: the caller is the implicit local principal; the Host and Origin rules belong to the
  network request that carries the MCP call, not to the twin.
- A tool name that is not an inventory id never reaches the audit record.

## Requirements *(mandatory)*

### Functional Requirements

**Separating authentication from operation authorization**

- **FR-001**: Request authentication MUST be one stage, separate from operation authorization. It
  holds the per-address rate limits, the local Host and Origin check, bearer validation, the
  cross-site check and session or principal resolution, and it yields a caller or a response. The
  order of these checks MUST NOT change for HTTP.
- **FR-002**: A caller MUST carry the principal, the origin (`http` or `mcp`), the source
  address, a reference to the session that owns the person's delegated credentials, and optionally a
  connection id and a connection scope. A caller MUST be creatable only by authentication code; the
  boundary MUST refuse any value it did not mint.
- **FR-003**: One function, the operation boundary, MUST accept a caller and a request and run, in
  this order, route selection from method and path (`routeFor`), the substitution of the client
  action for an application client, the refusal of rows that clients or twins may not use, the
  authorization decision, the route handler, refusal mapping and audit. The HTTP server MUST call
  this function for every request that passes authentication.
- **FR-004**: The boundary MUST contain, once, each behaviour that the current `execute` function
  provides: the no-grant and deactivated refusal, trash target resolution and the switch from
  `restoreOwn` to the entry's real action, the Steward audit scope, the local-only rule for identity
  settings, the pass for body-targeted rows and for application clients on workspace rows,
  conversion of a handler's `WriteAccessError` into an audited refusal, the audit of a hidden
  response as a denial, the audit record with outcome, and 404 normalisation in server mode.
- **FR-005**: Everything a handler reads about identity from the request (access scope, reader,
  working-copy context, remote credential mode, audit id, source address, audit scope and the
  session for delegated credentials) MUST be attached in one function, for HTTP and twin requests
  alike. A twin request MUST obtain a person's delegated Git credential through the caller's session
  reference and MUST NOT read a cookie or an `Authorization` header.
- **FR-006**: Public rows (sign-in, sign-out, health, brand files, static pages) and the event
  stream MUST NOT be dispatchable through the boundary as twins. A twin that matches one MUST be
  refused as unmapped.

**Twin requests**

- **FR-007**: A twin request MUST be built by one builder from an inventory operation id and its
  parameters. The builder MUST percent-encode each path parameter and the splat, serialize the query
  and the JSON body, set only `Content-Type`, accept an abort signal, and never set `Cookie`,
  `Authorization`, `Origin`, `Host` or forwarding headers.
- **FR-008**: The boundary MUST verify that the row matched by `routeFor` is the row of the named
  operation, and refuse the call before authorization otherwise.
- **FR-009**: A tool argument MUST NOT choose an action, a resource, a row or an audit field. Action
  and resource come from the matched row and the handler; origin, tool and connection come from the
  caller and the inventory.
- **FR-010**: The builder MUST refuse a body larger than the operation's request limit in the
  inventory. The route's own limit MUST still apply to the twin.
- **FR-011**: For hostile parameter values (`../`, `%2f`, `?`, `#`, control characters, very long
  and non-ASCII strings) the matched row MUST equal the intended row or the build MUST fail.

**Concrete targets and parity**

- **FR-012**: Concrete-target checks (commit paths, push, revert, branch switch, publish, clone
  address, body-named files, trash restore targets) MUST remain in the handlers and the modules they
  call, and MUST run for every twin call. No copy of them is made for MCP.
- **FR-013**: For each operation with a handler check, a parity table MUST run the same case through
  HTTP and through the boundary with a twin and compare status, normalized body and audit record
  (ignoring request id, time, chain hash, origin, tool and connection). Cases: allowed, denied
  action, denied target, hidden target, missing target, and, for body-targeted rows, one denied
  target among several.
- **FR-014**: A twin MUST NOT expose a difference between hidden and missing resources in caller-visible
  status, headers, body or timing class in server mode. Audit records remain the privileged security
  record and preserve HTTP selection: a hidden trash entry records a `not-readable` denial; a missing
  entry records nothing.
- **FR-015**: A caller MAY carry a connection scope that narrows its authority to a set of effects
  (read, local write, commit, remote, publish, administration). The boundary MUST check the static
  effects of the operation from the inventory, and handlers MUST be able to require a dynamic effect
  (commit with push needs the remote effect). A scope never widens authority, and a caller without
  one (every HTTP caller) MUST see no difference. A refusal by scope is a 403 audited with reason
  `connection-scope`. The scope values and their consent are defined by the sign-in feature.

**Listing by effective permission**

- **FR-016**: The boundary MUST provide `availableOperations(caller)`, which returns the dispatchable
  operations the caller may perform on at least one target, decided with the same pass logic as
  invocation and the same policy evaluation. It MUST NOT read role names.
- **FR-017**: The list MUST be in deterministic order (by operation id), MUST omit operations
  outside the caller's connection scope, and MUST depend only on the caller's permissions.
- **FR-018**: Listing MUST NOT replace invocation checks. Every invocation MUST decide on current
  state and its real targets.
- **FR-019**: For conditional permissions the list MUST probe the sample resources that tell the
  role conditions apart, as the dry run does, so a role limited by path or document type still
  lists the operations it can perform.

**Audit record**

- **FR-020**: The audit input and record MUST gain optional `origin` (`http`, `mcp`), `tool`
  (an inventory operation id) and `connection` (an opaque id of at most 64 characters from a fixed alphabet). A
  record without `origin` means HTTP. Values outside these sets MUST make the append fail rather
  than be stored.
- **FR-021**: A test MUST fail when a field of the audit input is neither serialized nor on an
  explicit list of fields that are intentionally not stored.
- **FR-022**: The hash chain MUST keep covering raw stored lines. Months written before this feature
  MUST verify alone and when followed by new records, `audit:verify` and the mirror checks MUST
  behave as before, and a checked-in fixture of old-format months MUST be part of the test suite.
- **FR-023**: Query and export MUST accept `origin` and `tool` filters. The JSON Lines export MUST
  carry every stored field. The CSV export MUST keep its existing columns in their order and append
  the new ones. Visibility rules for Admins and Stewards MUST NOT change.
- **FR-024**: Operations whose caller origin is not `http` MUST be audited when allowed, including
  plain reads, once per operation. The audit rule for HTTP callers MUST NOT change.
- **FR-025**: Protocol-call recording and its method vocabulary are deferred until the first
  transport caller. The operation boundary MUST NOT expose an unused protocol-recording API.
- **FR-026**: The boundary MUST accept an optional outcome classifier from the caller. It receives a
  clone of a bounded, non-streamed response and returns `ok`, `refused`, `failed` or `degraded`.
  Without one, the outcome comes from the status as today. The record MUST carry the classified
  outcome.
- **FR-027**: One operation MUST produce exactly one audit record: a denial, or an allow with its
  outcome. The outer request that carries a tool call MUST NOT produce a second one. Audit failures
  MUST behave as for HTTP (503 on a denial, a logged failure after an allowed operation ran).
- **FR-028**: The boundary MUST emit metrics labelled only by origin, operation id and outcome, and
  MUST NOT put arguments, paths, resource names or content in any label, log field or span.
- **FR-029**: The audit retention configured in the administration settings MUST reach every audit
  log the server constructs, and one audit log per data root MUST serve the middleware, the
  administration service and the authentication code.

**Dry-run sample**

- **FR-030**: The dry-run replay MUST be built from separate bounded strata: the configured matrix
  cases; the newest replayable records that are not MCP or ACP reads (the whole current window); and
  the newest replayable MCP and ACP reads deduplicated by identity snapshot, action and resource.
- **FR-031**: The strata sizes MUST be named constants with their source stated. With no MCP or ACP
  records in the log the sample MUST equal the sample before this feature.
- **FR-032**: Protocol-call records (FR-025) and subscription events MUST NOT become replay cases.

**Operation inventory**

- **FR-033**: `policies/operation-inventory.json` MUST contain one entry per row of `ROUTE_ACTIONS`,
  keyed by the row's path, with: a stable domain operation id, handler-check coverage, request
  limit, response bound, side effects, dispatchability with a reason when not, a typed classifier
  name when needed, and MCP exposure. Actions, client actions and initial resource kinds belong
  only to route rows. Unused service and hand-copied input descriptions MUST NOT be duplicated.
- **FR-034**: It MUST also list the browser-only capabilities that the whole-workbench claim covers
  (at least SHACL validation) with their status and increment.
- **FR-035**: A test MUST fail when a route row has no entry or an entry has no row, when an entry's
  id is duplicated, when a required field is empty, when a value is
  outside its vocabulary, when a limit names a constant that does not exist, and when a handler
  check named in the inventory is not covered by a parity case.
- **FR-036**: A generated table in `docs/` MUST be produced from the inventory and checked for drift.
- **FR-037**: No dispatcher, tool or adapter outside the auth boundary module MAY call the access
  control's `forRequest` or build an access scope. A test MUST scan for it.

**No HTTP change**

- **FR-038**: A characterization suite MUST be recorded on the commit before the refactor and
  checked in. It MUST cover every route example for every caller kind (local, each built-in role,
  a custom role, an application client, anonymous, deactivated, without grants), both allowed and
  refused, and compare status, normalized body, selected headers and audit fields.
- **FR-039**: The characterization suite and the existing suite MUST pass on the refactored code.
  Tests changed only because an internal moved MUST be listed in the pull request description.
- **FR-040**: Mutation cases MUST cover the boundary: each authorization step removed, the order of
  steps changed, the client action not substituted, the hidden audit removed, the 404 normalisation
  removed, the caller check removed and the row-match check removed.

**Documentation and governance**

- **FR-041**: ARCHITECTURE.md, the audit contract and tamper-evidence guide, the policy model, the
  README's description of the audit log, and the changelog MUST describe the new boundary, fields
  and inventory in the same change.
- **FR-042**: The constitution MUST say that every operation, whatever transport it arrives by, goes
  through the operation boundary, and that the verification gate covers the operation inventory.
  The wording is supplied to the constitution amendments drafted on `constitution-tessera`; this
  feature does not edit the constitution itself (see the plan's Constitution Check).

### Key Entities

- **Caller**: the authenticated party of one operation: principal, origin, source address, session
  reference, optional connection id and scope. Minted by authentication only.
- **Operation**: one thing the workbench does, identified by a stable id, implemented by exactly one
  route row.
- **Twin request**: an in-process request built from an operation and its parameters, carrying no
  credentials.
- **Operation boundary**: route selection, authorization, handler, refusal and audit as one
  function.
- **Operation call**: caller, twin request, optional operation id, optional outcome
  classifier.
- **Inventory entry**: the contract row of one operation (FR-033).
- **Audit record (extended)**: the existing record plus origin, tool and connection.
- **Replay stratum**: a bounded group of audit records used by the dry run.
- **Connection scope**: the set of effects a connection may use.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The characterization suite has zero differences before and after the refactor across
  all recorded cases (at least every route row times every caller kind).
- **SC-002**: For 100% of operations that have a handler check, the parity table shows equal
  status, normalized body and audit record between HTTP and twin for every case listed in FR-013.
- **SC-003**: The number of code paths that decide access for an operation is one: the scan of
  FR-037 finds no other caller of `forRequest` or scope construction outside the boundary, the
  authentication stage and the existing policy modules it lists.
- **SC-004**: A checked-in fixture of old-format audit months verifies with `audit:verify` unchanged,
  alone and followed by new records; no existing audit test is edited to pass.
- **SC-005**: With 50,000 MCP read records and 300 write and denial records, the replay holds all 300
  and at most the read stratum's cap of reads; with no MCP records the replay is identical to the
  recorded replay.
- **SC-006**: 100% of route rows have an inventory entry and vice versa; adding a route row without
  an entry fails the suite.
- **SC-007**: Every mutation in FR-040 is detected by the mutation suite.
- **SC-008**: Tool lists for ten role and condition fixtures (built-in, custom, path-limited,
  document-type-limited, application client, no grants) equal the expected operation sets, and equal
  lists result for equal permissions under different role names.
- **SC-009**: Hostile parameter values (FR-011) never change the matched row in a generated test of
  at least 500 cases per parameterized row shape.
- **SC-010**: The new documentation passes the repository's check, and no claim in it names behaviour
  that is not covered by a test.

## Assumptions

- **Listing cost — accepted gap.** The current measured listing time is **63.6 ms**, replacing
  the initial 50 ms estimate. Listing runs once per tool listing, never writes audit records and
  grants nothing; invocation re-checks the actual target. Before feature 006 ships MCP, measure
  client listing and Admin project-rule listing with at least 100 projects, because those cases
  skip the representative-project shortcut. The measurement and any required optimization are
  a follow-up for feature 006, not a permission cache in this boundary.

- **Origins** are `http` and `mcp`. ACP support is deferred until its first transport caller.
- **Outcome classification.** Most routes map failures to non-2xx statuses, so the status default is
  right for them. Where a 2xx body reports a failed or partial effect, the inventory names a
  classifier. A task reviews every dispatchable route for this; none is assumed to exist.
- **Strata sizes.** The write and denial stratum keeps today's window of 1,000 records. The MCP read
  stratum starts at 500 distinct decisions. Both are tunable constants chosen here without
  measurement; the read cap is revisited with the first real MCP audit volumes.
- **Inventory location.** The inventory is JSON in `policies/`, beside the replay matrix, because it
  is read by tests, the dry run and the listing code. No JSON Schema file is added: a typed parser
  in the test validates it, which avoids implying a pinned-standard schema (constitution
  Principle V).
- **Rate limits.** The outer MCP request is limited once, at authentication. Per-principal
  concurrency and expensive-operation limits belong to 006 (M17); the boundary neither counts nor
  limits twins.
- **Connection scopes** are defined, issued and consented to by the sign-in feature (M2, M9). This
  feature only provides the narrowing seam and its tests.
- **Idempotency and receipts** (M13) are not part of the boundary. A twin is a normal request.
- **The outer MCP row.** Feature 006 declares it as unaudited, grants no workspace action, and
  admits no cookies. This feature only requires that the boundary never relies on it for
  authorization.
- **Background completion.** Correlating a job's completion with its initiating call is built
  with the jobs of 006. The audit record's request id is the correlation key.
- Bun, TypeScript, the Cedar policy engine and the existing test and mutation tooling are used as
  they are. No new dependency is added.

## Out of Scope

- The MCP route, tools, protocol conformance, resources, prompts, subscriptions and bridge (006).
- Person sign-in, tokens, registered clients and connection scopes themselves (M2 to M5, M9).
- Extracting request-free domain functions from handlers (M1 keeps this incremental).
- Per-principal concurrency and size limits of tools (006, M17).
- Idempotency receipts (M13).
- Changing what any HTTP route does, including its guards or limits (R2's necessary security fixes
  are separate features).

## Clarifications

### 2026-11-16 — decided by the integrator

Hidden equals missing concerns the caller-visible response, including status, headers, body and
timing class. The caller cannot read the audit log. Preserve existing HTTP audit outcomes for twins:
a hidden trash entry writes a `not-readable` denial, while a missing entry writes no record.


Questions raised while specifying, answered from the decisions and the code. None is left for the
owner.

- **Q1. Do twin operations pass through the per-address rate limiter?** No. The outer request is
  limited once at authentication (FR-001). A twin has no network address of its own, and counting
  twins would let one MCP call exhaust a browser user's allowance. Per-principal tool limits are
  006's (M17). Source: M1, M17.
- **Q2. Which origins exist?** `http` and `mcp` (FR-020); ACP is deferred until its first caller.
- **Q3. How does an operation's outcome reach the audit when the HTTP status says success?** Through
  an optional classifier that the caller supplies and that reads a clone of a bounded response
  (FR-026). Cloning only a non-streamed response keeps memory bounded, and the hidden-response mark
  is read before the clone. Source: M14, MCP review (Astra, finding 11).
- **Q4. What does a refusal by connection scope look like?** A 403 with reason `connection-scope`,
  audited as a denial. Listing omits the operation (FR-015, FR-016). Source: M9.
- **Q5. Do MCP reads of hidden resources behave like missing ones?** Yes, with the same caller-visible status, headers, body
  and timing class as HTTP; privileged audit outcomes are asserted separately (FR-014). Source: M17, MCP review (Fable, M1 risks).
- **Q6. Where do the inventory and its schema live, and who validates it?** JSON in `policies/`,
  validated by a typed parser in the test (Assumptions). Source: M17, constitution Principle V.
- **Q7. Does the boundary store idempotency receipts?** No (Out of Scope). Source: M13.
- **Q8. How are old and new audit records told apart?** An absent `origin` means HTTP; no version
  number is added because every new field is optional and the chain hashes raw lines (FR-020,
  FR-022). Source: M14, MCP review (Astra, finding 11).
- **Q9. Should HTTP reads become audited too?** No. The HTTP audit rule is unchanged (FR-024).
  Source: R2, "no existing behavior changes".
- **Q10. Where does a twin get a person's delegated Git credential, since it carries no cookie?**
  From the session reference on the caller (FR-005). The credential service reads the session from
  the request's cookie today, so it is extended to read the caller's reference first. Source: M5, M9
  and the session-owned credentials in `remote-credentials.ts`.
- **Q11. What stops a tool from reaching a different route than it names?** The builder encodes
  parameters, and the boundary compares the matched row with the operation's row (FR-007, FR-008,
  FR-011). Source: M1, MCP review (Fable, B1).
- **Q12. Is the audit retention bug in scope?** Yes (FR-029): M14 requires it before high-volume
  reads. The configured value never reaches the log the middleware builds.
- **Q13. What counts as "at least one permissible target" for listing?** The same sample resources
  that tell role conditions apart, as in the dry run (FR-019). Source: M17.

## Traceability

| Decision or finding | Requirements | Tasks |
| --- | --- | --- |
| M1 (twin request through shared boundary) | FR-001 to FR-011, FR-012, FR-013 | T005 to T016 |
| MCP review (Fable) B1: action fixed before body, `execute` holds eleven behaviours | FR-003, FR-004, FR-008, FR-040 | T008, T009, T013, T044 |
| MCP review (Fable) B1: target checks in handlers | FR-012, FR-013, FR-014 | T016, T017 |
| MCP review (Fable) B1: identity read by symbol | FR-005, FR-006 | T007, T013, T014 |
| MCP review (Astra) 2: separate authentication from authorization, no action-equality proof | FR-001, FR-003, FR-013 | T006, T010, T016 |
| M9 (effects, scopes narrow authority) | FR-015 | T015 |
| M14 (audit schema, replay strata, retention) and MCP reviews (Fable M8, Astra 11) | FR-020 to FR-032 | T019 to T032 |
| M17 (tool lists by effective permission) | FR-016 to FR-019 | T033 to T036 |
| M17 (inventory of every operation) and MCP review (Astra 12, Fable inventory) | FR-033 to FR-037 | T018, T037 to T043 |
| R2 (no existing behaviour changes, mutation and recovery gates) | FR-038 to FR-040, SC-001, SC-007 | T001 to T004, T010, T021, T044, T045, T050 |
| E23 (constitution amendment), project documentation rules | FR-041, FR-042, SC-010 | T046 to T049, T051 |
