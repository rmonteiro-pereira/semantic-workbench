# Implementation Plan: First MCP Release, Local Read, Validated Edit and Commit

**Branch**: `006-mcp-server` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-mcp-server/spec.md`

## Summary

Local mode gains one route, `POST /api/mcp`, that speaks the Model Context Protocol (revision
2026-07-28, with the earlier era served request and response). It offers 21 tools: read definitions
and findings, validate proposed text, patch or replace a file, create, delete and restore a file,
inspect Git, read the published mapping context and plans, and commit selected files. The route
does only transport work: it checks the request, authenticates a per-installation local capability,
bounds the body and hands the message to the official library. Each tool call is rebuilt as an
in-process request to the existing HTTP route that does the same thing and runs through the
operation boundary (feature 010), so route selection, authorization, content guards, version checks
and the audit record are the browser's own. The workbench answers requests and calls no language
model. Server mode does not mount the endpoint. Person sign-in, application grants, the remaining
workspace and remote operations, resources and prompts, and administration are later increments.

## Technical Context

**Language/Version**: TypeScript 5.7, Bun 1.4.0 (unchanged)

**Primary Dependencies**: new, server only: `@modelcontextprotocol/server` 2.4.0 (Apache-2.0),
`@modelcontextprotocol/core` 2.4.0 and `zod`, which the server package requires; about 16.5 MB on
disk (7.0, 1.4 and 8.1 MB, measured), never in the browser bundle. Development only:
`@modelcontextprotocol/client` 2.4.0 for the conformance suite. Application code uses plain JSON
Schema through the library's ajv entry (`fromJsonSchema` with `AjvJsonSchemaValidator`), and the
repository already depends on `ajv`. Exact versions are pinned in `package.json` and `bun.lock`.

**Protocol**: revision 2026-07-28 with `server/discover`, mirrored headers and the error codes in
[contracts/mcp-conformance.md](./contracts/mcp-conformance.md). The earlier era is served by the
library's stateless fallback (`legacy: 'stateless'`). Resources, prompts and `subscriptions/listen`
are not registered.

**Checked under Bun 1.4.0 on 2026-11-16**: `createMcpHandler(factory).fetch(request)` takes and
returns standard web objects; discovery, header and version errors, result metadata, annotations
and plain-schema validation behave as the conformance contract lists; the handler authenticates
nothing. Details in [research.md](./research.md), D2.

**Storage**: two small files under `<data root>/state/`: the local capability and the receipt store.
Both are durable state in the sense of Principle IV. The SQLite cache is untouched.

**Testing**: `bun test` under `tests/mcp/` plus extensions to `tests/auth/`; a conformance suite
driving the mounted route with the reference client and raw requests; an acceptance script
(`bun run test:mcp`); a browser check that an agent's save refreshes an open editor and that audit
records show in the Admin panel; targeted mutants in `scripts/mcp-mutants.ts`.

**Target Platform**: the developer's machine, local mode, loopback only.

**Project Type**: web service (Bun API with a React frontend); this feature is server only.

**Performance Goals**: no throughput goal. Bounds instead: every call ends within its deadline and
under the result cap on the largest example and on a generated project of 20,000 files.

**Constraints**: no new outbound call; the 2,000,000-byte document limit; no transport session; no
route, response or permission of the browser changes except the fixes listed in the spec's SC-011.

**Scale/Scope**: one local principal, several concurrent tool calls from one agent, 21 tools.

### Dependencies on other features

006 does not re-specify these; it states what it needs so each feature can check the seam.

| Feature | What 006 needs | If it is late |
|---------|----------------|---------------|
| 010 operation boundary | One function that takes an already resolved principal, an origin tag and a `Request`, selects the route, runs authorization, target checks and the handler, maps refusals and writes the one audit record; a way to mark the transport row unaudited and without a blanket action; room for the extra audit fields; a check that asks whether the principal holds an action on at least one permissible target, used to filter `tools/list` | tools cannot be dispatched; no tool ships. Only `src/server/mcp/dispatch.ts` adapts to 010's exact signature |
| 008 published snapshot | The agent routes and the explain route read the published snapshot and report its id; a way to ask whether a commit would advance the published ref; the reasons a project is not published | the four published-only tools are not registered; the other 17 ship |
| 009 item addresses | Nothing in this release; tools take a project and a path | no effect; locators are adopted by a later increment |
| Constitution amendments (`constitution-tessera`) | Principle I (authenticated agent authoring and the local capability, the content statement), IV (receipts as durable state), VI (tools in the matrix, new mutants), VII (the model statement) | tasks that mount tools wait; the reading foundation can be built |

### Defaults and where they come from

None of these came from a measurement. "Existing" means the value equals a constant already in the
repository; "assumed" means chosen here and changeable without changing a requirement.

| Name | Default | Source |
|------|---------|--------|
| Local capability size | 32 random bytes | assumed; 256 bits is a common minimum for a bearer secret |
| Global request cap | 12,004,096 bytes | existing: the save route's envelope, 6 times the document limit plus 4,096 (`routes/files.ts`) |
| Per-tool request cap | 64,000 bytes, and the global cap for `save_file`, `create_file`, `validate_text` | existing: the git and agent routes read bodies with a 64,000-byte limit |
| Result cap | 32,768 bytes of text per result | assumed; about 8,000 tokens at four bytes per token, under the 10,000-token warning Claude Code documents (cited in the review) |
| Page size | 50 default, 200 maximum | assumed |
| Calls per second per principal | 20, burst 40 | assumed; the HTTP boundary allows 200 requests per second (existing `DEFAULT_REQUEST_LIMITS`) |
| Concurrent calls per principal | 4 | assumed |
| Call deadline | 30 seconds | assumed; the server's idle limit is 255 seconds (existing) |
| Cursor lifetime | 10 minutes | assumed |
| Receipt retention | 7 days | assumed; no decision gives a value |
| Dry-run groups | 600 writes and denials, 300 de-duplicated reads | assumed; they sum under the existing 1,000 |
| Audit retention | the configured value; built-in 400 days | existing |
| Randomized race runs | 200 | assumed |
| Generated large project | 20,000 files | assumed |

## Constitution Check

*Gate: passes before research and again after design. Version 3.2.0 is the text in this branch; the
amendments on `constitution-tessera` are named by the principle they change.*

- **I. Local and Server Modes**: *Needs an amendment.* Local mode keeps the loopback binding, the
  cross-origin refusal and the loopback `Host` rule, and the MCP route is stricter (every `Origin`
  refused, exact `Host`). The implicit Admin principal is used through the same decision boundary.
  The rule "Agent-facing endpoints supply deterministic context and planning" no longer describes a
  route that writes; the amendment for authenticated agent authoring and the local capability
  covers it. Server mode is untouched: the endpoint is absent, bearer tokens stay on the agent API,
  and no token issuing is introduced. No new outbound call. The rationale "your definitions stay on
  your machine" gains the content statement (M11).
- **II. Byte-Exact Source Preservation**: patches change only the patched ranges; a full-text save
  returns the stored source when a guard rewrote it; reads by range are explicit and versioned, never
  silent truncation; no access control redacts a file. Pass.
- **III. One Validation Rule Set**: `validate_text` runs the save pipeline's validation and guards
  through a twin route, and findings come from the same cache the editor reads. Browser-only layers
  (SHACL) are named as not covered. Pass, with that stated limit.
- **IV. Atomic, Hash-Checked Persistence**: saves are the existing atomic, base-hash-checked path;
  commits run under the repository serialization with expected branch, head and file versions;
  receipts are durable state written atomically and added to the list of such state by the
  amendment. Pass.
- **V. Pinned Official Standards**: no schema snapshot changes. The protocol revision and the
  library versions are pinned and recorded. Pass.
- **VI. Verification Gate**: every tool is in the authorization matrix with every test role and
  scope; the new route rows are in the matrix; targeted mutants cover dispatch, caps, receipts,
  cursors, the capability check and the published-ref refusal; a browser check covers the editor
  refresh and the audit view, and the audit view change goes through the UI regression comparison
  (the view before and after, captured from a fresh worktree); `bun test`, `bun --bun run check`, `bun --bun run build` and
  `test:mutation` run. Pass.
- **VII. Honest Claims**: README and `docs/mcp.md` describe only what ships; the tool list and
  counts are produced by code and compared by a test; limits (browser-only validation, no push, no
  server mode, residual injection risk, not a sandbox against the same operating-system user) are
  stated as plainly as features. Pass.
- **VIII. Readable Code**: one module per concern (see the structure), each with a header comment;
  functions near 40 lines; comments plain, with no feature or task ids; the formatter runs on every
  changed file. Pass.
- **Technical Constraints**: the dependency is justified above (licence, size, maintainer, pinned,
  no runtime network); every tool goes through the one authorization boundary; the 2,000,000-byte
  limit is kept; single-instance state (limiters, cursors) is in process by design. Pass.
- **Workflow and gates**: destructive actions (delete to trash, restore) already exist in the UI;
  the gate list in the constitution is the done-definition of every step below. Pass.

Post-design re-check: no new violation. The one open item is the dependency on the Principle I
amendment, recorded in the dependency table.

## Project Structure

### Documentation (this feature)

```text
specs/006-mcp-server/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/
│   ├── mcp-tools.md          # every tool: input, result, hints, retry class, twin route
│   ├── mcp-inventory.md      # every route row: tool, later increment, or not an agent operation
│   ├── mcp-conformance.md    # every protocol requirement and the test that proves it
│   ├── mcp-local-access.md   # capability, order of checks, bridge, threat model
│   └── mcp-audit.md          # fields, outcome mapping, dry-run groups
└── tasks.md
```

### Source Code (repository root)

```text
src/server/routes/mcp.ts                 # POST /api/mcp: runs the gate, then the library; nothing else
src/server/mcp/
├── request-gate.ts                      # pure decision: method, Origin, Host, content type, capability
├── local-capability.ts                  # create, read when changed, rotate, compare in constant time
├── body-limits.ts                       # streaming caps, per-tool cap chosen from the tool name
├── server-factory.ts                    # builds the McpServer for one request from the registry
├── tool-registry.ts                     # the 21 tool definitions, sorted; checked against the contract
├── tool-definition.ts                   # the tool shape: schema, hints, twin, retry class, run
├── twin-dispatch.ts                     # builds the twin request, calls the boundary, maps the answer
├── tool-results.ts                      # result shape, error codes, caps, byte ranges
├── cursors.ts                           # opaque cursors bound to query, generation, caller, expiry
├── receipts.ts                          # durable receipts: write before, complete after, verify at start
├── call-limits.ts                       # rate, concurrency and deadline per caller
└── tools/
    ├── projects-and-files.ts            # list_projects, list_files, read_file, get_findings, list_trash
    ├── validation.ts                    # validate_text
    ├── editing.ts                       # save_file, create_file, delete_file, restore_file
    ├── source-control.ts                # git_status, git_diff, git_log, git_branches, git_file_versions, git_show, git_commit
    └── published-context.ts             # get_mapping_catalog, get_mapping_context, plan_query, explain_metric
src/server/routes/validate.ts            # POST /api/projects/:slug/files/*/validate (the new twin)
src/server/auth/route-actions.ts         # rows for the MCP transport and the validate twin
src/server/auth/audit.ts                 # serializer lists the new fields; retention passed in
src/server/auth/dry-run.ts               # replay built from separate groups
src/server/projects/workspace/document-save.ts  # the validate-without-write step shared by save and validation
src/server/routes/git.ts, src/server/projects/scm.ts  # optional commit preconditions checked inside the repository serialization
src/app/admin/AuditSection.tsx           # shows the tool beside the action; nothing else in the view changes
src/server/handler.ts                    # mounts the route in local mode; passes audit retention
scripts/mcp-stdio.ts                     # the bridge
scripts/mcp-capability.ts                # `bun run mcp:rotate`
scripts/mcp-acceptance.ts                # `bun run test:mcp`, the scripted run and refused cases
scripts/mcp-browser-check.ts             # editor refresh and audit view
scripts/mcp-mutants.ts                   # targeted mutants, imported by mutation-tests.ts
tests/mcp/                               # contract, conformance, gate, bounds, receipts, race and parity tests
docs/mcp.md                              # new: connect, tools, limits, content statement
docs/mcp-acceptance.md                   # new: exact client versions and configuration of the acceptance run
README.md, ARCHITECTURE.md, docs/agent-runtime.md, docs/configuration.md, CHANGELOG.md
```

**Structure Decision**: `src/server/mcp/` is one area with one module per concern; the route file
stays thin like the other files in `src/server/routes/`. Nothing outside the route and the handler
imports the area, but the tool definitions and hints are plain data so the later agent panel can
import them. Tools are grouped by what they do (as `src/server/routes/` groups routes), not one file
per tool.

## Approach

**One request.** `routes/mcp.ts` receives the request. `request-gate.ts` decides the method, `Origin`,
`Host` and content type; `local-capability.ts` compares the bearer value; `body-limits.ts` reads the
body under its caps; then `server-factory.ts` builds a `McpServer` from the registry and the
library's `createMcpHandler(...).fetch` answers. The library enforces discovery, headers and error
codes. A tool's `run` builds its twin request in `twin-dispatch.ts`, calls the operation boundary
with the local principal and the `mcp` origin, and maps status and JSON to the result shape.

**Authorization.** The tool that runs is the one in the parsed body. Its twin route's row, target
checks and guards decide the call; no module under `src/server/mcp/` reads project files or decides
access. A test compares each tool's twin with the route inventory and with the matrix.

**Writes.** `save_file` and `create_file` call the existing save through the twin, so the base-hash
check and byte preservation are unchanged; `twin-dispatch.ts` adds the "unchanged" flag and the
disclosed guard rewrite to the answer. `delete_file`, `restore_file` and `git_commit` go through
`receipts.ts`: normalize the arguments, look up the key, write `pending`, call the twin, write `done`.
`git_commit` first checks the expected branch, head and file versions under the repository
serialization, in the same critical section as the commit. The twin never receives `push`.

**Audit.** The transport row is unaudited. The dispatched twin writes the record with the new fields;
`audit.ts` lists them so they survive serialization, and `handler.ts` passes the retention.

**Bounds.** Caps are applied as the body streams, results are cut into pages and ranges, and
`call-limits.ts` limits rate, concurrency and deadline per caller. Cancellation closes the twin
request's work; a write that has begun finishes atomically.

## Delivery steps

Each step ends with the full gate green and its documentation written (Principle VII), and each is
usable alone.

1. **Foundation and discovery.** Dependencies, gate, capability, rotate script, bridge, body caps,
   server factory with an empty registry, the conformance suite for C1 to C11 and C14 to C19,
   route-inventory test, audit fields and retention plumbing, dry-run groups. Depends on the
   Principle I amendment for merge, not for development. Result: a connectable endpoint with no tools.
2. **Reading.** The eleven read tools that need no snapshot: `list_projects`, `list_files`,
   `read_file`, `get_findings`, `list_trash` and the six Git inspection tools; paging, ranges,
   cursors; parity and matrix tests.
3. **Published context.** The four published-only tools; the "not published" results. Waits for 008.
4. **Validation and saving.** The validate twin and `validate_text`; `save_file`, `create_file`; the
   unchanged and guard-rewrite disclosures; write-safety tests, byte comparison, the editor refresh
   check.
5. **Delete, restore, receipts.** Receipt store, `delete_file`, `restore_file`; crash-at-each-step
   tests.
6. **Commit.** `git_commit` with its preconditions, the published-ref refusal, the race tests.
7. **Documentation and acceptance.** `docs/mcp.md`, README, ARCHITECTURE.md, CHANGELOG, the
   acceptance script with Codex CLI, the acceptance record with exact client versions.

## Verification

- **Parity**: each tool equals its twin's normalized result on every shipped example project.
- **Authorization matrix**: every tool with every test role and scope through the same dispatcher;
  hidden equals missing; no unreadable byte in any answer; custom roles and multi-target cases where
  the twin has them.
- **Conformance**: the table in the conformance contract, through the mounted route.
- **Local access**: the refused cases in SC-008, DNS rebinding, `Origin: null`, a simple form post, a
  malformed `Host`; a scan of logs, audit and errors for the capability value.
- **Write safety**: byte comparison after patch saves; stale version refused; invalid text never
  replaces a definition; guard rewrite disclosed; person's draft kept.
- **Commit safety**: randomized interleavings of staging, committing and switching; only listed
  paths and versions committed; published branch refused.
- **Retry and recovery**: stop the server at each journaled step of delete, restore and commit and
  retry with the same key.
- **Bounds**: results under the cap; a 2,000,000-byte file reproduced from ranges; a project of
  20,000 files; stale cursors; rate and concurrency.
- **Audit**: one record per call; old records verify; replay sample keeps writes after 5,000 reads.
- **Mutations** (each must be killed): the capability check removed; `Origin` check removed; `Host`
  check loosened; the tool's twin swapped for a read route; the base-version check skipped; the
  receipt lookup skipped; the argument hash ignored; `push` forwarded to the commit; the published
  branch refusal removed; the head check removed; a cursor accepted across principals; the result cap
  removed; the unpublished source returned by a published-only tool; a hidden path answering
  differently from a missing one; the audit field dropped by the serializer.
- **Gate**: `bun test`, `bun --bun run check`, `bun --bun run build`, `test:mutation`, `test:mcp`,
  `test:ui` and the suites the constitution lists.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|----------|------------|--------------------------------------|
| Three server packages (`server`, `core`, `zod`) | Discovery, mirrored headers, error codes and two protocol eras from one definition | Hand-written dispatch would own that wire format and its conformance |
| A local capability file | Host and Origin checks do not authenticate local processes that choose their headers (M8) | No credential leaves every local user and container with a write and commit surface |
| A receipt store | Delete, restore and commit cannot be made safe to retry by a version check (M13) | Retrying blindly can delete, restore or commit twice |
| A new twin route for validation | Validation of proposed text has no route to dispatch through, and tools without a twin are not allowed (M1) | A tool calling the validator directly would bypass the boundary |
| A tool registry beside the route table | Tools need schemas, hints and retry classes the route table does not hold | Generating tools from routes exposes HTTP shapes awkward for agents and couples the two formats |
