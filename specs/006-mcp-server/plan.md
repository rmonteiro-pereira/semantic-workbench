# Implementation Plan: MCP Server for Agent Clients

**Branch**: `006-mcp-server` | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-mcp-server/spec.md`

## Summary

The workbench gains one route, `POST /api/agent/mcp`, that speaks the Model Context Protocol and
offers the existing agent operations as five read-only tools. The route sits behind the access
middleware that already guards `/api/agent/*`, so identity, filtering and audit are unchanged.
The four agent operations move out of `src/server/handler.ts` into one module that both the HTTP
routes and the MCP tools call, which is what keeps the two answers equal. A small bridge script
lets clients that only speak MCP over standard input and output reach a running workbench. The
workbench answers requests; it opens no connection to the client and calls no language model.

## Technical Context

**Language/Version**: TypeScript 5.7, Bun 1.4 (unchanged)

**Primary Dependencies**: **new, server only**: `@modelcontextprotocol/server` 2.4.0 (Apache-2.0,
published 2026-10-23; depends on `@modelcontextprotocol/core` and `zod`; 17 MB on disk for the
three packages, never bundled for the browser). Registry and install checked on 2026-11-15.

**Protocol**: revision 2026-07-28, the current one. It is stateless: no `initialize` handshake and
no `Mcp-Session-Id`; each request carries its version in `_meta`. That matches a server that keeps
no agent session. Clients still on 2025-11-25 are served by the library's stateless fallback from
the same tool definitions.

**Checked under Bun 1.4.0** (scratch probe, 2026-11-15): `createMcpHandler(factory).fetch(request)`
takes a standard `Request` and returns a standard `Response`. A 2026-07-28 `tools/list` and
`tools/call` answered as JSON with `resultType: "complete"`; a 2025-11-25 `initialize` and
`tools/list` answered through the fallback as an event stream. No Node HTTP server, Express or
Hono is involved.

**Why the library and not hand-written JSON-RPC**: five tools on a stateless protocol are small,
but clients of two protocol eras exist today, and the library serves both from one definition and
tracks header and error-code rules that changed in this revision. Rejected: hand-written dispatch
(no new package, but the workbench would own two wire formats and their drift). Rejected:
`@modelcontextprotocol/sdk` 1.32.2 (the older line; pulls Express, Hono and CORS packages the
server does not use).

**Authentication**: none in the library. Its handler takes already-validated identity as a
pass-through and never reads headers, so the workbench's middleware stays the only place a caller
is recognised. The protocol's own OAuth flow is out of scope.

**Storage**: none. **Testing**: `bun test`, the route inventory test, the access-boundary tests,
mutation targets. **Performance**: a tool call costs what the matching HTTP call costs; the
server object is built per request, so its construction must stay free of I/O.

**Constraints**: request bodies keep the agent API's 64 000-byte limit; the route answers `POST`
only; no outbound connection; no per-client state.

## Constitution Check

- **Modes (I)**: the route exists in both modes with the caller each mode already defines. Pass.
- **No hosted service, content stays local (Technical Constraints)**: the server calls nothing.
  It answers a caller with filtered metadata, which the constitution assigns to agent-facing
  endpoints. Pass, no amendment.
- **Verification gate (VI)**: parity, access and mutation tests listed below. Pass when they run.
- **Honest claims (VII)**: documentation states read-only, no execution, no model call. Pass.
- **Readable code (VIII)**: `handler.ts` loses its inline agent branches. Pass.

One point needs the owner's decision before tasks are written: `explain_metric` is reachable
today only by signed-in people (`GET /api/projects/:slug/files/*path/explain/:metric` has no
client action). Offering it as a tool gives bearer clients a new read, through the same Reader
filter. The plan below includes it behind the `agentRead` action; dropping it removes one tool
and nothing else.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-server/
├── spec.md
├── plan.md
├── contracts/mcp-tools.md   # tool names, input schemas, result and error shapes
└── tasks.md
```

### Source Code (repository root)

```text
src/server/agent/
├── operations.ts        # new: listProjects, listMappings, readContext, planQuery, explainMetric
│                        #      for one Reader; the argument checks now inline in handler.ts
└── mcp/
    ├── tools.ts         # new: the five tool definitions, each calling operations.ts
    └── server.ts        # new: builds the per-request McpServer for a Reader
src/server/routes/
├── agent.ts             # new: the four HTTP routes, moved from handler.ts
└── mcp.ts               # new: POST /api/agent/mcp, passes the request to the library handler
src/server/auth/route-actions.ts   # one row: POST /api/agent/mcp, read, clientAction agentRead
scripts/mcp-stdio.ts     # new: bridge from standard input and output to a running workbench
tests/agent/             # parity, tool contract and access tests next to the existing agent tests
```

**Structure Decision**: tools live under `src/server/agent/` because they are another face of the
agent planner, not a new domain. The route file holds only transport, as `ARCHITECTURE.md`
requires of `src/server/routes/`.

## Approach

1. **Extract, no behaviour change.** Move the agent branches and their helpers (`agentProjects`,
   `agentDocuments`, `requireMappingInProject`, the plan body checks) from `handler.ts` into
   `agent/operations.ts` and `routes/agent.ts`. Existing agent tests must pass untouched.
2. **Tools.** Each tool validates its arguments with the same rules as its HTTP twin, calls the
   operation with the request's Reader and returns the JSON as structured content plus the same
   JSON as text. A refusal (`BadRequestError`, a planner refusal) becomes a tool error carrying
   the same message; hidden and missing stay identical.
3. **Route.** `routes/mcp.ts` builds the handler once and calls `handler.fetch(request)`; the
   factory reads the Reader the middleware attached. `GET` and `DELETE` answer 405.
4. **Access and audit.** One `route-actions.ts` row. The audit record adds the tool name. The
   local-mode error rule in `handler.ts` (every agent error as HTTP 400) does not apply to the MCP
   route, whose errors travel inside JSON-RPC.
5. **Local-mode safety.** A loopback JSON endpoint that needs no credentials can be reached by a
   web page through DNS rebinding. Check what the existing local boundary already refuses and add
   the library's Host and Origin validation for this route if it is not covered.
6. **Bridge.** `scripts/mcp-stdio.ts` forwards each line to the workbench URL in `SW_URL` with an
   optional bearer token from the environment, and writes the answer back.
7. **Docs.** `docs/agent-runtime.md` (connecting an agent, the tools), `docs/configuration.md`
   (bridge variables), README stack table and integrations section, `ARCHITECTURE.md` code map,
   the integrations diagram, `CHANGELOG.md`.

## Verification

- **Parity**: for every example project, each tool's structured result equals the HTTP body.
- **Access**: the agent API's access tests run again through `tools/call`: ungranted project,
  hidden path, invalid token (401 before any tool), valid client without a grant (403), bearer
  beside a cookie.
- **Contract**: `tools/list` equals `contracts/mcp-tools.md`; unknown method, oversized body,
  unsupported revision and a 2025-11-25 client.
- **Inventory**: `tests/auth/route-actions.ts` covers the new route.
- **Mutations**: drop the Reader from an operation, accept `expression` in `plan_query`, skip the
  project check, skip the audit record. Each must be killed.
- **Gate**: `bun run check`, `bun test`, `bun run ci:validate`.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|----------|------------|--------------------------------------|
| Three server packages (`server`, `core`, `zod`) | Serve two protocol eras from one definition | Hand-written dispatch would own both wire formats |
| `zod` beside `ajv` | The library's tool schemas are written in it | Its ajv entry validates JSON Schema, to be tried in tasks; if it removes `zod` from application code, use it |
