# Implementation Plan: MCP Server for the Whole Workbench

**Branch**: `006-mcp-server` | **Date**: 2026-11-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-mcp-server/spec.md`

## Summary

The workbench gains one route, `POST /api/mcp`, that speaks the Model Context Protocol and offers
what a person can do in the browser as tools: read the workspace, change definitions with
validation, use source control and administer access, plus resources and prompts. Each tool is a
thin adapter over the service the matching HTTP route already calls, and each names the route
action it needs, so the existing access boundary, content guards, version checks, dry run and
audit decide every call. On a team server a person connects an agent by signing in; agent
applications with a bearer token stay read-only. The workbench answers requests and calls no
language model. Delivery is in five steps that are each usable alone.

## Technical Context

**Language/Version**: TypeScript 5.7, Bun 1.4 (unchanged)

**Primary Dependencies**: **new, server only**: `@modelcontextprotocol/server` 2.4.0 (Apache-2.0,
published 2026-10-23; depends on `@modelcontextprotocol/core` and `zod`; 17 MB on disk for the
three packages, never bundled for the browser). Registry and install checked on 2026-11-15.

**Protocol**: revision 2026-07-28, the current one. It is stateless: no `initialize` handshake and
no `Mcp-Session-Id`; each request carries its version in `_meta`. Clients still on 2025-11-25 are
served by the library's stateless fallback from the same definitions. Change notices for
resources use the revision's `subscriptions/listen` stream, fed by the events the workspace
already sends to browsers.

**Checked under Bun 1.4.0** (scratch probe, 2026-11-15): `createMcpHandler(factory).fetch(request)`
takes a standard `Request` and returns a standard `Response`; a 2026-07-28 `tools/list` and
`tools/call` and a 2025-11-25 `initialize` and `tools/list` all answered. Not yet checked:
resources, prompts, `subscriptions/listen` and the library's authorization helpers.

**Why the library and not hand-written JSON-RPC**: with tools, resources, prompts, subscriptions
and two protocol eras, the workbench would own a large wire format. Rejected:
`@modelcontextprotocol/sdk` 1.32.2 (the older line; pulls Express, Hono and CORS packages).

**Authentication**: the library does none; it passes through the identity the workbench's
middleware resolved. Person sign-in for agents is research item R1 below.

**Storage**: none for the protocol. Person connections (R1) are stored beside sessions.

**Constraints**: `POST` only apart from what the protocol's sign-in discovery needs; request body
limits per tool, matching the route each maps to; no per-client state; no new outbound call.

## Research before tasks

- **R1, sign-in for a person's agent.** The protocol expects an OAuth authorization server that
  the client discovers from the workbench. Entra does not register arbitrary agent clients on
  demand, so the likely design is that the workbench is the authorization server for its own MCP
  endpoint: it sends the person through the existing provider sign-in, then issues its own
  short-lived token bound to that person's session, revocable with it. To decide: this against
  using the provider directly with a pre-registered public client; token format and lifetime;
  which client registration method to accept; whether this needs a constitution amendment (the
  workbench becomes a token issuer). Keycloak and generic providers must work the same way.
- **R2, what a client grant means.** Agent applications gain the wider read tools in their
  granted projects. Confirm the Cedar change (`agentRead` on the read route actions, or a mapping
  of read tools onto it) and the dry-run and Access check wording.
- **R3, local-mode exposure.** A loopback endpoint that needs no credentials and can now write
  and commit must not be reachable by a web page. Check what the local boundary refuses today and
  add Host and Origin validation, and decide whether local mode needs a per-install token for
  the endpoint.
- **R4, long actions.** Clone, pull and push report progress and can be cancelled. Map them to
  an operation id returned by the tool plus follow and cancel tools, not to held-open requests.
- **R5, schemas.** Whether the library's ajv entry lets tool inputs be plain JSON Schema, so
  application code does not gain a second validation library.
- **R6, client behaviour.** Which common agent clients honour effect annotations and sign-in, to
  word the documentation and to know what the server must enforce alone (all of it).

## Constitution Check

- **Modes (I)**: both modes, with the caller each already defines. Pass.
- **Byte preservation, atomic hash-checked saves (II, IV)**: writes go through the existing save
  and journal services with a base version. Pass by construction; SC-004 tests it.
- **One validation rule set (III)**: validation tools call `src/shared/validation/`. Pass.
- **No hosted service, content stays local**: the server answers a caller. Pass.
- **Token issuing (R1)**: not covered by the constitution today. **Open until R1 is decided.**
- **Verification gate (VI)**: listed below. **Readable code (VIII)**: one adapter per tool group.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-server/
├── spec.md
├── plan.md
├── research.md              # R1–R6
├── contracts/
│   ├── mcp-tools.md         # every tool: input, result, effect class, route action
│   ├── mcp-resources.md     # addresses, versions, change notices
│   ├── mcp-prompts.md       # prompt texts and arguments
│   └── mcp-authorization.md # discovery, sign-in, token, revocation
└── tasks.md
```

### Source Code (repository root)

```text
src/server/mcp/
├── server.ts            # builds the per-request server for one caller
├── tool.ts              # the tool shape: name, schema, effect class, route action, run
├── registry.ts          # all tools; filters by what the caller may do
├── results.ts           # paging, size limits, service errors to tool errors
├── tools/
│   ├── workspace.ts     # projects, files, source, drafts, trash
│   ├── model.ts         # parsed model, search, lineage
│   ├── validation.ts    # findings for a file, a project and proposed text
│   ├── metrics.ts       # list, explain, preview, create metrics and KPIs
│   ├── mappings.ts      # catalog, context, query plan
│   ├── editing.ts       # save, create, move, delete, restore, import
│   ├── source-control.ts# status, diff, log, stage, commit, branches, remote actions
│   └── administration.ts# read, check, propose, dry run, confirm, roll back, audit
├── resources.ts         # files and contexts as resources; change notices from workspace events
├── prompts.ts           # the five prompts
└── authorization.ts     # discovery documents and token checks (after R1)
src/server/agent/operations.ts   # the agent operations, moved out of handler.ts
src/server/routes/agent.ts       # their four HTTP routes, moved out of handler.ts
src/server/routes/mcp.ts         # POST /api/mcp: transport only
src/server/auth/route-actions.ts # the MCP route; tools resolve to existing actions
scripts/mcp-stdio.ts             # bridge from standard input and output
tests/mcp/                       # parity, access, contract and write-safety tests
```

**Structure Decision**: `src/server/mcp/` is its own area because it now spans every domain, not
only the agent planner. It may import services; nothing imports it except its route. Each tool
names an existing route action, and one test asserts that every tool's action equals the action
of the HTTP route it mirrors, so the two cannot drift.

## Approach

**How a tool is authorized.** The middleware resolves the caller once for `POST /api/mcp`. The
route action for that request is then taken from the tool being called, with the concrete project
and path from its arguments, and passed through the same decision and write-target checks an HTTP
request gets. A tool the caller's roles do not allow is absent from `tools/list` and refused by
name.

**Delivery steps** (each ends with the gate green and the docs updated):

1. **Foundation and reading.** Extract the agent operations from `handler.ts` with no behaviour
   change. Route, registry, paging, error mapping, audit origin, local-mode exposure (R3), the
   stdio bridge. All read tools. Local mode, plus bearer applications read-only (R2).
2. **Editing and validation.** Validate-proposed-text, save against a version, create, move,
   delete, restore, drafts, metrics and KPIs, import. Effect classes and confirmation arguments.
   Local mode only.
3. **Source control.** Status to commit first, then branches and revert, then remote actions with
   follow and cancel (R4).
4. **Team server.** Person sign-in (R1), working-copy behaviour, connection listing and
   revocation in the Admin panel, the constitution amendment if R1 needs one.
5. **Resources, prompts, administration.** Resources with change notices; prompts; administration
   tools behind the dry-run receipt and last-Admin guard.

## Verification

- **Parity**: each tool's result equals its HTTP twin for the same caller and input, on every
  example project.
- **Access**: the existing per-route access tests are re-run through the mapped tool for local
  Admin, Reader, Editor, Admin and agent application; the tool-to-action test above; hidden
  equals missing in tools, resources and notices.
- **Write safety**: byte-for-byte comparison after agent saves; stale version refused; invalid
  text never replaces a definition; guard refusals; retry after a lost answer.
- **Administration**: confirm without a matching dry run refused; last Admin kept; application
  token refused.
- **Contract**: `tools/list`, resources and prompts equal the contracts; unsupported revision,
  oversized body, a 2025-11-25 client.
- **Mutations**: drop the caller from a service call, map a write tool to a read action, skip the
  version check, skip the dry-run receipt, accept `expression` in a plan, leak a hidden path in a
  notice. Each must be killed.
- **Gate**: `bun run check`, `bun test`, `bun run ci:validate`, and a browser check that an
  agent's save refreshes an open editor.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|----------|------------|--------------------------------------|
| Three server packages (`server`, `core`, `zod`) | Tools, resources, prompts, subscriptions and two protocol eras from one definition | Hand-written dispatch would own all of that wire format |
| The workbench issuing tokens (if R1 confirms) | A person's agent needs their identity without a pasted secret, on any provider | Bearer applications cannot write by design; provider-direct sign-in needs each agent client registered in the tenant |
| A tool registry beside the route table | Tools need schemas, effect classes and filtering the route table does not hold | Generating tools from routes would expose HTTP shapes that are awkward for an agent and couple the two formats |
