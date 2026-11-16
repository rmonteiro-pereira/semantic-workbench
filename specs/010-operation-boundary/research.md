# Research: Operation Boundary

Each entry gives the decision, the evidence in the code at the base commit, and what was rejected.
The governing decision (M1) is not reopened; this file settles how to carry it out.

## R1. Where the authorization steps live today

**Evidence.** `createAccessMiddleware` in `src/server/auth/middleware.ts` (538 lines) holds three
kinds of work in one closure:

1. Request authentication, in `dispatch`: the per-address limits (`limitedResponse`), the local
   Host and Origin check (`localCheck`, supplied by the handler), bearer validation
   (`bearerIdentity`), the cross-site check (`validCsrf`), and principal resolution (`resolve`).
2. Routing, in `dispatch`: `routeFor(method, pathname, mode)`, the refusal of an application client
   on a row without a client action (`clientRouteRefusal`), the `public` short cut, the page login
   redirect and the audited anonymous denial.
3. Operation authorization and audit, in `execute`: scope creation, the no-grant refusal, trash
   target resolution, `routeDecision` (with the local-only rule for `setIdentity`, the pass for
   body-targeted rows and for clients), the Steward audit scope, hidden-response audit, the
   `WriteAccessError` conversion in `refusedTarget`, the audit append with outcome and 404
   normalisation.

The handler then reads identity back from the request by symbol: `requestScope`, `requestReader`
and `requestAuditProjects` (`request-scope.ts`), `remoteCredentialsOf` (`remote-credentials.ts`),
`requestAuditId` and `requestSourceIp` (`request.ts`), and `actorOf` (`routes/admin.ts`).

**Decision.** Move group 3, together with the helpers only it uses, into `operation-boundary.ts`;
move the network-facing part of group 1 into `request-authentication.ts`; leave group 2's
HTTP-specific parts (page redirect, anonymous audit) in `middleware.ts`, which shrinks to an HTTP
adapter. Keep the order of every step. The move is mechanical: functions are relocated, not
rewritten, so a reviewer can diff them.

**Rejected.** Extracting every handler body into request-free operations (option B of the MCP
review). It touches about twenty route modules and is not a prerequisite (M1). The twin keeps
the handlers' `Request` signature, which also keeps their input validation and limits in one place.

## R2. How the twin carries identity without cookies

**Evidence.** `credentialFor(request, host)` in `remote-credentials.ts` calls `deps.session(request)`,
which resolves the session from the request's cookie (`readCookie` in `sessions.ts`). A twin request
has no cookie by design (M1: "without forged cookies").

**Decision.** `attachIdentity(request, caller)` in `request-scope.ts` sets every symbol in one place
and adds `requestSession`. `deps.session` consults `requestSession` first, so a twin finds the
session its caller was minted with. A request that has the symbol never falls back to cookies; a
request that does not behaves as before.

**Rejected.** Constructing a cookie header for the twin: it would put a session id into a request
object that tool code can see, and `SameSite` and `__Host-` rules would have to be imitated.

## R3. Minting callers

**Decision.** `caller.ts` keeps a module-private `WeakSet` of minted callers. `mintCaller` is
exported only to `request-authentication.ts`, to the HTTP adapter and, later, to the MCP
authenticator of 006. `operate` calls `assertMinted(caller)`. A structural type alone would let
tool code build a caller literal, so the runtime check is the guard and the type is a convenience.

**Rejected.** A signed caller (HMAC over its fields): the process trusts its own memory, and a
signature adds key handling for no gain.

## R4. Keeping a twin on the row it names

**Evidence.** `routeFor` is a first-match scan over `ROUTE_ACTIONS` using patterns such as
`([^/]+)` and `(.+)`; row order matters (explanations precede generic file reads).

**Decision.** The builder fills the row's own path template with encoded parameters, so the string
it produces matches the intended pattern. The boundary then compares `routeFor(...).row` with the
inventory's row for the named operation and refuses a mismatch. A generated test feeds hostile
values (FR-011) to every parameterized row shape.

**Rejected.** Letting tools pass a raw path: any later change to row order could silently retarget a
tool.

## R5. Streams, public rows and one-shot dispatch

**Evidence.** `GET /api/events` reads `Last-Event-ID` and the abort signal (`projects/events.ts:167`,
`:227`); the public rows answer before anyone is signed in; `GET /api/projects/:slug/export` returns
a download.

**Decision.** The inventory marks each row `dispatchable` or not, with a reason (`stream`,
`public`, `page`, `redirect`). A first version dispatches one-shot request and response routes only.
Exports and downloads are dispatchable but flagged `binary` so 006 maps them deliberately.
Subscriptions are separate work (M16).

## R6. Semantic outcome

**Evidence.** `outcome(status)` in `middleware.ts` classifies `2xx` as `ok`, `409`, `412` and `428` as
`refused`, everything else as `failed`. An MCP tool failure travels inside the outer HTTP 200.
Handlers map typed errors to statuses in `routes/http.ts`.

**Decision.** For twins, the status default already gives the right result for failures that the
handlers map to statuses, because the twin's own response is classified, not the outer POST's.
For a 2xx whose body reports a failed or partial effect, the caller passes a classifier. It receives
`response.clone()` only when the response is bounded and not a stream. The hidden-response check
(`hiddenResponses.has(response)`) runs on the original before any clone. The inventory records
which operations need a classifier; a task reviews every dispatchable route for this and may find
none.

**Rejected.** Writing the audit record from the MCP layer after mapping: it creates two records and
lets tool code skip the audit.

## R7. Audit record changes and old-record verification

**Evidence.** `record()` in `audit.ts` selects fields with `pick`, so unknown input fields are
dropped (the MCP review's point). The chain hashes the stored line of the previous record
(`linkBroken`, `verifyAuditChain`), not the parsed fields.

**Decision.** Add `origin`, `tool`, `method` and `connection` to `AuditInput` and `record()`, with
validators. Because the verifier hashes lines and parses only `prev`, old and new records chain
together without a version number. The reader returns parsed lines, so old records simply lack
the fields. A serializer-completeness test enumerates `AuditInput` keys against the serializer so a
future field cannot be silently dropped again. CSV export appends the new columns after the existing
ones, so scripts that read columns by position keep working.

**Rejected.** A `schema: 2` field: it adds a second way to say "new" next to `origin`, and an older
server reading a newer log would gain nothing from it.

## R8. Dry-run strata

**Evidence.** `compare()` in `access-admin.ts` calls `audit.recent(MAX_AUDIT_SNAPSHOTS, isReplayable)`;
`replayDecisions` then slices the newest 1,000 again. `recent` scans months from newest to oldest
and stops once enough records match.

**Decision.** Replace the single call with `replaySample(audit)`:

1. Stratum A: the newest 1,000 replayable records that are not MCP or ACP reads. This is today's
   window for every log that has none, so the result is unchanged for existing logs.
2. Stratum B: the newest replayable MCP and ACP reads, deduplicated by (identity snapshot, action,
   resource attributes), up to a cap of 500 distinct decisions.
3. The configured matrix cases stay as they are.

`recent` is extended to fill both strata in one backward scan, stopping when both are full or the
retained months are exhausted. The cost is bounded by retention (400 days by default).

**Rejected.** Not auditing MCP reads (the first option in the Fable review): M14 chose to audit them.
Writing reads to a separate file: it would split the hash chain.

## R9. Listing by effective permission

**Evidence.** `routeDecision` passes a body-targeted or client row when the action is allowed on any
readable project (`scope.view().readableProjects`). `dry-run.ts` builds sample resources
(`projectResources`) that every role condition tells apart.

**Decision.** Use one pure `routeVerdict(scope, row, mode, target)` for
both invocation and listing, so the two cannot drift. Listing probes each readable project with the
dry run's sample resources (exported from `dry-run.ts` unchanged) and the workspace resource for
workspace rows. A path-limited custom role therefore lists save operations. The result contains only
operation ids.

**Cost.** Listing runs the policy evaluation operations times projects times samples. The plan sets
a measured bound (see the plan's performance goal) and caches nothing across calls; per-call private
caching headers are 006's.

**Rejected.** Listing by built-in role name; probing only the project resource (misses
path-conditioned roles).

## R10. Connection scope seam

**Decision.** `connection-scope.ts` defines the effect vocabulary used by the inventory (`read`,
`localWrite`, `commit`, `remote`, `publish`, `administration`, `destroy`, `credential`). A caller
carries an optional list of allowed effects. `operate` checks the inventory's static effects before
the decision; `requireEffect(request, effect)` lets a handler assert a dynamic effect (commit with
`push: true` requires `remote`). With no scope, both are no-ops.

**Rejected.** Mapping scopes to actions in policy: M9 says scopes narrow role authority and are
checked by effect, not by tool name.

## R11. Inventory format and tests

**Decision.** JSON in `policies/operation-inventory.json`, typed and parsed by
`src/server/auth/operation-inventory.ts`, which the boundary also uses for the row match and the
listing. The test iterates `ROUTE_ACTIONS` (the same source `route-actions.test.ts` uses) and the
guard inventory's vocabulary. Limits are named by constant (for example `MAX_INPUT_BYTES * 6 + 4096`
is exported as `FILE_SAVE_REQUEST_LIMIT`) so a test can resolve them. The generated table in
`docs/operations.md` comes from `scripts/operation-inventory-table.ts` and is compared in a test.

**Rejected.** A TypeScript constant array: it cannot be reviewed as data and invites logic in the
table. A JSON Schema document: Principle V reserves `schemas/` for pinned official standards and the
workbench's own formats, and a typed parser is enough here.

## R12. Proving no HTTP change

**Decision.** Before touching code, record an HTTP characterization: for every entry of
`routeExamples` (`tests/auth/route-actions.ts`) and every caller fixture of
`tests/helpers/auth-identities.ts` plus a custom role, local mode and an application client, record
status, normalized body, selected headers (`X-Request-Id` present, `Content-Type`, `WWW-Authenticate`,
`Retry-After`) and audit fields except time, request id and chain hash. Store it as
`tests/fixtures/characterization/http-v1.json`, with the recorder in
`scripts/record-http-characterization.ts`. The test replays it. The recording is committed before
the first refactor commit, so the base is demonstrable from history.

**Rejected.** Relying on the existing 100-plus auth tests: they were not written to detect a changed
step order or a changed refusal body.

## R13. Retention plumbing

**Evidence.** `admin-repo.ts` defines `audit.retentionDays` in the settings (default 400).
`createAuditLog` is called without it in `handler.ts` (production construction when no log is
passed) and in `authentication.ts` (which also passes a mirror). Two logs for one data root can
chain from the same last line independently.

**Decision.** One audit log per data root, built once in server start-up with the mirror and the
configured retention, and passed to the handler, administration and authentication. Tests construct
their own as before. The task first confirms whether production really builds two (the plan lists
the check) and fixes it either way so the retention reaches the log.

## R14. Metrics and logs

**Evidence.** `recordRequest(route, method, status, durationMs)` labels by route template, so every
MCP call would be one route. `observability/redaction.ts` already drops fields named like content.

**Decision.** Add `recordOperation(origin, operation, outcome, durationMs)` with labels drawn from
two closed sets (origins and inventory ids). The outer request keeps its route-template metric.
Spans for twins are children of the outer request's span, named by operation id.

## R15. What the constitution says now

**Evidence.** Technical Constraints: "Every route and every server-side derivation MUST obtain its
access decision from the one authorization boundary... no route decides access by itself."
Principle VI: "Every new route MUST be added to the matrix."

**Decision.** Both sentences are about HTTP routes. See the plan's Constitution Check for the
amendment this feature needs.
