# Feature Specification: MCP Server for Agent Clients

**Feature Branch**: `006-mcp-server`

**Created**: 2026-11-15

**Status**: Draft

**Input**: The owner wants agents to reach the workbench through the Model Context Protocol (MCP)
as well as through the existing agent HTTP API. The workbench receives the agent's requests; it
does not call a language model. An agent panel over the Agent Client Protocol follows as a
separate feature (007) and will hand this MCP server to the agent it hosts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A local agent reads grounded metadata through MCP (Priority: P1)

A person runs the workbench in local mode and adds it to their agent (Claude Code, Codex, an
editor assistant) as an MCP server. The agent lists the workbench's tools, discovers the projects
and mappings, reads the context of a mapping and asks for a query plan. It gets the same answers
the Mappings view and the agent HTTP API give.

**Why this priority**: it is the whole value of the feature for one person on one machine and
needs no identity setup.

**Independent Test**: start local mode with the Mapped commerce example, connect an MCP client and
call each tool.

**Acceptance Scenarios**:

1. **Given** local mode, **When** a client lists tools, **Then** it receives `list_projects`,
   `list_mappings`, `get_context`, `plan_query` and `explain_metric`, each with a description and
   an input schema.
2. **Given** the Mapped commerce example, **When** the client calls `get_context` for its mapping,
   **Then** the result equals the body of `GET /api/agent/context` for the same project and
   mapping.
3. **Given** the same example, **When** the client calls `plan_query` with `gross_revenue` and
   `customers.region`, **Then** the result equals the body of `POST /api/agent/plan` for the same
   request.
4. **Given** a client that only speaks MCP over standard input and output, **When** the person
   starts the shipped bridge command, **Then** the same tools work through it.
5. **Given** a saved correction to a definition, **When** the client calls a tool again, **Then**
   the result reflects the saved file. An unsaved draft is never read.

---

### User Story 2 - A granted agent client uses MCP on a team server (Priority: P2)

An Admin has already granted an agent application some projects. That application connects to the
team server's MCP endpoint with its bearer token and sees only what its grant allows.

**Why this priority**: it reuses the access model that exists; it adds reach, not new rules.

**Independent Test**: run server mode against the mock identity provider, grant a client one
project and call the tools with its token.

**Acceptance Scenarios**:

1. **Given** a client granted one project, **When** it calls `list_projects`, **Then** it sees
   only that project.
2. **Given** that client, **When** it names a project it cannot read, **Then** the tool answers
   exactly as it does for a project that does not exist.
3. **Given** an invalid or missing token, **When** the endpoint is called, **Then** the answer is
   401 with a Bearer challenge, before any tool runs.
4. **Given** a valid client without an active grant, **Then** the answer is 403.
5. **Given** any tool call by a client, **Then** the audit log records the client and the tool
   name, as it does for the HTTP agent API.
6. **Given** a signed-in person's browser session, **When** it calls the endpoint through the
   normal cookie and request-header boundary, **Then** the tools answer with that person's view.

---

### User Story 3 - An agent is told why a request was refused (Priority: P3)

When a tool cannot answer (a missing argument, an unresolved reference, an unsafe join, a formula
supplied by the caller), the agent receives a tool error with the same plain message the HTTP API
gives, so it can explain the refusal instead of inventing SQL.

**Why this priority**: refusals are part of the planner's contract; an agent that sees only a
generic failure will work around them.

**Independent Test**: call each tool with the bad inputs listed below and compare messages with
the HTTP API.

**Acceptance Scenarios**:

1. **Given** `plan_query` with an `expression`, raw SQL or a metric object, **Then** the call is
   refused with the message the HTTP API uses, and no plan is produced.
2. **Given** `get_context` without a mapping, **Then** the error names the tool that lists
   mappings.
3. **Given** a plan the planner refuses (alternative join paths, unknown additivity), **Then** the
   result carries the planner's refusal and findings, not a transport error.

---

### Edge Cases

- A request in a protocol revision the server does not support is refused with the list of
  supported revisions.
- A request body over the size limit of the agent API is refused before it is parsed.
- A method the server does not implement (resources, prompts, sampling) answers "method not
  found"; the server never advertises them.
- A batch or notification that needs no answer does not run a tool twice.
- A bearer token sent to the MCP endpoint next to a valid cookie is judged alone, as on the rest
  of the agent API.
- A tool call during a workspace rescan answers from the last complete index or reports that the
  workspace is not ready; it never returns a partial model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workbench MUST expose an MCP endpoint under the agent API path, in local and
  server mode, over the protocol's HTTP transport.
- **FR-002**: The endpoint MUST offer exactly five tools: list projects, list mappings, read
  context (optionally narrowed to concepts), request a query plan, and explain a metric.
- **FR-003**: Every tool MUST return what the matching HTTP operation returns for the same caller
  and arguments. Both paths MUST call one shared implementation.
- **FR-004**: The endpoint MUST be read-only. No tool creates, changes, deletes, commits or
  publishes anything.
- **FR-005**: The endpoint MUST apply the caller's existing access: the implicit Admin in local
  mode, a granted agent client by bearer token, or a signed-in person. Hidden projects, paths and
  references MUST stay indistinguishable from missing ones.
- **FR-006**: The endpoint MUST keep the plan request rule: stored metric and field ids only;
  expressions, raw SQL and formula overrides are refused.
- **FR-007**: Every tool call MUST be audited with the caller and the tool name. Refused tokens
  MUST NOT be written to any log.
- **FR-008**: The endpoint MUST NOT execute a plan, contact a warehouse, call a language model,
  fetch a remote document or open an outbound connection to the client.
- **FR-009**: The endpoint MUST hold no per-client session state between requests.
- **FR-010**: The workbench MUST ship a bridge command that lets a client speaking MCP over
  standard input and output use a running workbench.
- **FR-011**: The endpoint MUST be covered by the route inventory, so an unmapped MCP route fails
  closed like any other protected route.
- **FR-012**: The documentation MUST show how to connect a common agent in each mode, list the
  tools, and state the limits above.

### Key Entities

- **Tool**: a named read operation with a description and an input schema, mapped one-to-one to an
  existing agent operation.
- **Agent client**: the application or person calling; already defined by the access model, with
  no new grant type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person connects an agent to a local workbench and gets a query plan for the Mapped
  commerce example by following the documentation, with no step outside it.
- **SC-002**: For every tool and every example project, the MCP result and the HTTP result are
  equal.
- **SC-003**: Every access test that exists for the agent HTTP API passes unchanged when run
  through the MCP endpoint.
- **SC-004**: No existing route, response or permission changes; the full quality gate passes.
- **SC-005**: Mutation tests on the tool dispatch and argument checks leave no surviving mutant
  that widens access or accepts a caller-supplied formula.

## Assumptions

- Agent clients on a team server keep using Entra application tokens. Interactive sign-in for MCP
  clients (the protocol's own authorization flow) and Keycloak or generic client tokens are out of
  scope.
- Write tools, MCP resources and prompts are out of scope.
- The constitution already permits this: agent-facing endpoints supply deterministic context and
  planning to a caller that owns language interpretation. No amendment is needed.
- The protocol revision and library are chosen in the plan, after checking the current
  specification and the library's behaviour under Bun.
- The agent panel (007) is a separate feature. There the agent also comes to the workbench: the
  person starts it and it connects in; the workbench does not launch it or call its model.
