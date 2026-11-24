# Research: First MCP Release

Each entry gives the decision, the reason and what was rejected. "Checked" means a command was run
or a file opened on 2026-11-16 in this worktree; "documented" means a published page or the
decisions document says so and it was not re-run. Decision ids (E, M, R) refer to the owner's
decisions document. The old plan's research items R1 to R6 are answered here or moved to later
increments, as the table at the end shows.

## D1. How a tool obtains the same authorization as its HTTP twin (M1)

**Decision**: a tool builds its twin request (method, path, query, JSON body) and the route layer
runs it through the operation boundary of feature 010 with the local principal already resolved and
an `mcp` origin tag. Route selection, target checks, content guards, refusal mapping and the audit
outcome come from that one function. The tool table is a table of tool name to twin route that a
test compares with the route inventory.

**Reason (checked)**: the middleware picks one action from method and path before the body is read
(`src/server/auth/middleware.ts`, `routeFor` then `execute`), `POST /api/mcp` would have one row for
every tool, and concrete target checks live inside handlers that take the `Request`
(`src/server/routes/git.ts`: commit paths at the `authorizeGitPaths` call, optional push at
`authorizeGitPush`). A "thin adapter over the service" would either skip those checks or copy them,
a second authorization path. The old test "tool action equals route action" would pass in both
cases, so the new test compares the whole twin, its target checks included.

**Rejected**: extracting every handler into request-free operations first (about twenty route
modules; M1 says not to make it a prerequisite); calling `ws.*` directly from tools.

**Consequence**: 006 consumes 010's boundary and does not specify it. What 006 needs from it is
listed in the plan's dependency table. Moving the four agent routes out of `handler.ts`, which the
old plan did first, is no longer needed.

## D2. Library and what it does (M15)

**Decision**: `@modelcontextprotocol/server` 2.4.0, exact version, with `@modelcontextprotocol/core`
2.4.0 and `zod`, which the library requires. Application code uses plain JSON Schema through the
library's ajv entry and imports no zod.

**Checked** (scratch project, Bun 1.4.0, package installed from the registry):

- Licence Apache-2.0; footprint on disk 7.0 MB for the server package, 1.4 MB for core and 8.1 MB
  for zod, about 16.5 MB in all, server side only and never bundled for the browser.
- `createMcpHandler(factory).fetch(request)` takes a standard `Request` and returns a `Response`.
  The factory runs once per request, so it must be cheap.
- With the 2026-07-28 envelope the handler answers `server/discover` (supported versions,
  capabilities, `resultType: complete`, `ttlMs: 0`, `cacheScope: private`); `tools/list` carries the
  same result metadata and the tool annotations; a missing or disagreeing `MCP-Protocol-Version` or
  `Mcp-Method` or `Mcp-Name` header answers 400 with code -32020; an unsupported version answers 400
  with -32022 and the supported list; an unknown method answers 404 with -32601; `GET` and `DELETE`
  answer 405; a body without the client-capabilities envelope answers 400 with -32602.
- An invalid tool argument becomes a tool result with `isError: true` and the validator's text, using
  `fromJsonSchema(schema, new AjvJsonSchemaValidator())`. No zod import was needed.
- A 2025-era `initialize` is served statelessly (an event-stream answer) by the default
  `legacy: 'stateless'` setting. Such clients get no change notices.
- The default body cap is 4,194,304 bytes (`DEFAULT_MAX_REQUEST_BODY_SIZE`), set by the option
  `maxRequestBodySize`. The save route allows a larger envelope, so the endpoint reads its own body
  under its own caps first (D6).
- The handler authenticates nothing and, as documented, validates no `Host` and no `Origin` itself;
  it exports helper functions for both, which this feature does not use because the route's own gate
  is stricter (D3).

**Documented, not re-run**: the library also offers resources, prompts, `subscriptions/listen`,
tasks and bearer helpers; none is used in this release.

**Rejected**: hand-written JSON-RPC (a large wire format across two protocol eras);
`@modelcontextprotocol/sdk` 1.32.2 (the older line; whether it pulls Express and Hono was not
checked and does not matter once 2.x is chosen).

**Test client**: `@modelcontextprotocol/client` 2.4.0 exists in the registry. It is a development
dependency used for the conformance suite and the acceptance script, never shipped.

## D3. Local access (M8)

**Decision**: a 32-byte random capability, written once to `<data root>/state/mcp-capability` with
owner-only permissions, sent as `Authorization: Bearer <value>`. The route refuses, before parsing,
any `Origin` header, any `Host` that is not exactly the server's own loopback name and port, any
content type but JSON, any method but `POST`. The comparison is constant time. The bridge reads the
file and never prints it. A rotate script replaces the file, and the route re-reads it when its
modification time changes, so no restart is needed.

**Checked**: the boundary already refuses an `Origin` outside four allowed values and any
non-loopback `Host` (`src/server/handler.ts`, `localCheck`), and local mode binds only to loopback.
The old research item R3 asked whether to "add Host and Origin validation"; it exists and stays. What
it does not do is authenticate native local processes, which choose their own headers, and it accepts
the development server origins on port 5173. A browser page on any allowed origin can therefore call
other routes today; for the MCP route every `Origin` is refused instead, which is stricter and
needs no allow-list.

**Limits stated in the documentation (M8)**: not isolation from a hostile process with the same
operating-system user's file access, not a repair of other local routes, not a multi-user sandbox.

**Rejected**: no credential at all (Fable review, M9); a long-lived token handed to tools; an
operating-system socket (clients of the first release speak HTTP or the bridge).

## D4. Published-only reads (E4, E5)

**Decision**: the catalog, context, plan and explanation tools dispatch to the existing agent routes
and the explain route. Making those routes read the published snapshot is feature 008's change, which
also covers the HTTP agent API; the tools therefore inherit it. 006 adds an acceptance test that
fails if any of the four tools returns bytes of an unpublished edit, and a rule that if 008 has not
landed the four tools are not registered.

**Checked**: the agent document selector today uses the request's ordinary reader
(`agentDocuments` in `src/server/handler.ts` calls `ws.documentsFor(requestReader(request))`), which
can select unpublished work. Local mode has no published snapshot yet; the existing
`published-checkout.ts` and `unpublished-work.ts` concern server-mode checkouts and trash entries,
not a snapshot reader.

**Rejected**: a separate MCP-only snapshot reader (two sources of "published").

## D5. Tools without a twin today (M17, M6 of the Fable review)

**Checked**: there is no server route for validating proposed text, and findings are returned inside
the file read (`readFile` in `src/server/projects/workspace.ts` returns the cached findings). Lineage
and model search exist only in browser code (`src/app/workspace/hooks/useLineage.tsx`); a search for
"lineage" under `src/shared` and `src/server` finds nothing. SHACL validation runs only in the
browser (`docs/agent-runtime.md`, "Deliberate limits").

**Decision**: this release adds one twin, `POST /api/projects/:slug/files/*/validate`, which runs the
same save pipeline up to and including the guards and stops before the write; it needs the right to
edit that file. Findings paging is a projection of the file read. Lineage, search and the parsed
model are a later increment, because they need shared implementations first. "Validation" in this
release means exactly what the save endpoint enforces; browser-only layers are named as not covered.

## D6. Bounds (M17)

**Decision**: caps are enforced while the body streams in, and results are bounded by construction.

- Request body: a global maximum equal to the save route's envelope, and a per-tool cap picked from
  the `Mcp-Name` header before reading; clients of the earlier era send no name, so they get the
  global maximum and the per-tool cap is checked again after parsing.
- Results: a byte cap on text content. Lists use cursors; byte ranges carry a version.
- Computation: Git log and file versions take a limit; diffs take a context and a byte cap; findings
  are projected from a file that is already bounded by the 2,000,000-byte document limit.
- Per principal: calls per second, concurrent calls and a deadline; the library's own request
  context cancels work when a response closes.

The numeric defaults and their sources are in the plan's table; none comes from a measurement, so
each is tagged "assumed" except where it equals an existing constant.

## D7. Retry safety (M13)

**Decision**: three classes. Reads are repeatable. Save and create are precondition-protected by the
version check (a retry after success is a conflict that says the file already equals the proposed
text). Delete, restore and commit are receipt-backed.

A receipt is written before the effect as `pending` and completed after it. The existing journal
(Principle IV) already completes or rolls back an interrupted multi-file operation; the receipt
reads the journal's outcome at start so a retry after a crash answers with the real result or
`uncertain`. The receipt store is durable state under `<data root>/state/mcp-receipts`, written
atomically.

**Checked**: only saves are version-protected today (`src/server/projects/workspace/document-save.ts`
re-checks the base hash under the write lock). Creation under a workspace-chosen name,
move-with-keep-both, import, delete to trash, restore and commit are not protected by a version, so
a retried call can repeat the effect. Tools never expose "choose a free name".

## D8. Commit safety and a shared working copy (M12)

**Checked**: the working copy is person-scoped (`src/server/projects/working-copies.ts`), so a person
and an agent share one branch, index and drafts. A version check on one file does not stop a commit
from taking another actor's staged files.

**Decision**: the commit tool names every path with the version it expects, plus the expected branch
and head. The check and the execution run under one repository serialization, the commit takes only
the listed paths, and other staged work is untouched. A commit on the published branch is refused
(E4, M9). The same-person race is a stated limit: it produces a conflict to re-read, never a wider
commit.

## D9. Audit (M14)

**Checked**: browser reads by `GET` are not audited, while every MCP call is a `POST`; the audit
serializer keeps only listed fields (`pick` in `src/server/auth/audit.ts`), so a new field written
without changing it is silently dropped; the dry run replays the newest 1,000 replayable records
(`MAX_AUDIT_SNAPSHOTS` in `src/server/auth/dry-run.ts`); the running log is created without the
configured retention (`createAuditLog({ dir })` in `src/server/handler.ts`), so it uses the built-in
400 days.

**Decision**: the MCP route's own row is unaudited; each dispatched twin writes the one record, with
the added fields `origin`, `tool`, `method`, `connection` and `result`. The serializer lists the new
fields and older records keep their shape and their chain. The dry run builds separate bounded groups
for writes and denials and for de-duplicated reads. The retention option is passed through.

## D10. The stdio bridge

**Decision**: `scripts/mcp-stdio.ts` reads JSON-RPC messages from standard input, adds the
`MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers from each message so the server's
mirrored-header check passes, adds the capability, posts to the running server and writes each answer
to standard output. It starts nothing and opens no port. When the server is not running, or runs in
server mode, it answers the first request with a JSON-RPC error that says what to do.

**Open point checked by an acceptance test, not assumed**: how Codex CLI and the reference client
send requests over standard input in revision 2026-07-28 (with or without the envelope). The bridge
forwards both shapes unchanged, and the acceptance matrix records the observed behaviour.

## D11. Clients (M15)

Initial acceptance matrix: Codex CLI and the reference client from the same library line. Other
clients may work and are promised nothing. Claude Code and Codex documentation says they support
HTTP and standard-input servers and browser sign-in (documented in the reviews, not re-run here);
their handling of effect hints is not confirmed, so hints are descriptive and the server enforces
everything. The exact versions tested go into the release acceptance record.

## D12. Constitution (E23)

Amendments are drafted on `constitution-tessera`. This feature depends on those that cover:
Principle I (authenticated agent authoring in local mode and the local capability; the sentence that
agent-facing endpoints "supply deterministic context and planning" becomes untrue), Principle IV
(receipts as durable state), Principle VI (every tool in the authorization matrix; new mutants) and
Principle VII (the content statement, M11). The token and public-endpoint rules MCP sign-in needs
belong to the later sign-in feature.

## Answers to the old plan's research items

| Old item | Answer |
|----------|--------|
| R1 sign-in for a person's agent | Own later feature (M2 to M5); not in 006 |
| R2 what a client grant means | Later increment (M7); application grants unchanged on upgrade |
| R3 local-mode exposure | D3: capability, every `Origin` refused, exact `Host`, JSON only |
| R4 long actions | Later increment with remote operations (M16, M17); none here |
| R5 schemas | D2: plain JSON Schema through the ajv entry, no zod in application code |
| R6 client behaviour | D11: Codex CLI and the reference client; the server enforces everything |
