# Feature Specification: Person Sign-In for Agent Connections

**Feature Branch**: `013-person-sign-in`

**Created**: 2026-11-17

**Status**: Draft

**Input**: A person who works on a team server wants to connect their own agent, such as Codex CLI,
to the workbench's MCP endpoint and have it act as them, with their roles, for as long as their
browser session lives. Today bearer tokens are accepted only for application identities on the agent
API, and the MCP endpoint (feature 006) is mounted in local mode only. Decisions M2 to M5 give this
its own feature: the workbench is the authorization server for its own MCP resource behind the
existing organization sign-in, issues its own opaque tokens, takes its client list from the
administration repository, and ties every connection to the browser session that authorized it. A
single-use setup credential created in the browser lets headless team clients connect too. The tools
themselves, the local capability, resources and prompts, application grants and delegated
administration are not part of it.

## Summary

- A person connects a **registered agent program** to the team server in the browser: they are
  already signed in, a server-rendered page names the program, the scopes and what each can do, and
  one explicit choice issues a single-use code. The program trades it for an access token and a
  refresh token at the workbench's own token endpoint.
- A **connection** is the durable record of that trade. It belongs to one person, one program, one
  scope set and one browser session. When the session ends for any reason, so does the connection.
  Agent traffic never keeps the browser session alive.
- An Admin keeps the list of registered programs (name, exact redirect addresses, documented setup)
  in the administration repository, through the same proposal, dry run, receipt and one-commit-per-
  change flow as every other access document. The workbench never fetches a program's metadata.
- A **setup credential** created in the browser and used once lets a headless program on a remote
  shell or container obtain the same connection, with the same scopes and the same session limit.
  No long-lived personal token exists.
- The MCP endpoint in server mode accepts only workbench-issued bearer tokens. It ignores cookies
  and never falls back to them. Four unauthenticated answers exist, nothing more: two metadata
  documents, the token endpoint and the bearer challenge.
- Default scopes are read, edit, validate and commit to the authoring branch. Remote, publish and
  administration are separate choices. Scopes only narrow a person's roles; roles are rechecked on
  every call.
- Every consent, issue, refresh, replay, revocation and expiry is audited with the connection id.
  People list and revoke their own connections; Admins list and revoke any.
- The connection model does not mention MCP in its records. The agent panel (feature 015) reuses it
  for its own transport.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A person connects an agent in the browser (Priority: P1)

Maria is signed in to the team server. She adds the workbench to her agent program using the
documented configuration. The program opens her browser at the workbench. The workbench shows what
the program is, what it will be allowed to do, that it can pass what it reads to its own model
provider, and asks her to allow or deny. She allows. The program receives its tokens and lists the
tools she may use.

**Why this priority**: it is the point of the feature; without it a person cannot use their agent
against the shared server.

**Independent Test**: a test client performs the whole flow against the server with a mock identity
provider and then calls the MCP endpoint.

**Acceptance Scenarios**:

1. **Given** a registered program and a signed-in person, **When** the program starts the flow with a
   code challenge, **Then** the person sees one consent page naming the program, the default scopes
   in plain words, and the sentence about onward use by the agent's model provider.
2. **Given** the person allows, **When** the program trades the code with the matching verifier,
   **Then** it receives an access token and a refresh token, and a call to the MCP endpoint lists
   exactly the tools the person could use.
3. **Given** the person denies, **Then** the program is sent back with an access-denied error, no
   code exists and one denial is audited.
4. **Given** a person who is not signed in, **When** the program opens the authorization address,
   **Then** the person is sent through the normal sign-in and returns to the same consent page.
5. **Given** a second use of the same code, **Then** the trade fails and every token the code
   produced is revoked.
6. **Given** a redirect address that is not registered exactly, **Then** no page asks for consent and
   the person sees a plain error that does not redirect anywhere.

---

### User Story 2 - A connection lives and dies with the browser session (Priority: P1)

Maria signs out at the end of the day. Her agent's next call fails with a challenge that tells it to
connect again. Another day, her Admin deactivates her: the agent stops at its next call. A third day
her role loses edit rights on a project: the agent's next save in that project is refused, while
reads continue.

**Why this priority**: M5 is what keeps delegated Git credentials, revocation and audit honest.

**Independent Test**: end the session, expire it, deactivate the person and change a grant in a
test, each time calling through the token before and after.

**Acceptance Scenarios**:

1. **Given** a connection, **When** the person signs out, **Then** the next call with its access
   token and its refresh token both fail, and expiry is audited once.
2. **Given** a session that reaches its idle limit while the agent keeps calling, **Then** agent
   calls did not extend it, the session ends on schedule and the connection ends with it.
3. **Given** a person deactivated by an Admin, **Then** the next call fails and the connection is
   ended.
4. **Given** a grant change that removes edit on one project, **Then** the next edit call there is
   refused with the same answer as for the browser and an unrelated project still works.
5. **Given** a restart of the server, **Then** connections whose sessions survive the restart still
   work and the others are gone.
6. **Given** a person's own list, **When** they revoke one connection, **Then** that connection's
   next call fails and their other connections and their browser session are untouched.

---

### User Story 3 - An Admin controls which programs may connect (Priority: P1)

An Admin registers Codex CLI and the bundled reference client, with their exact redirect addresses,
and publishes the documented configuration to the team. Later they remove one program; every
connection of that program ends. A person cannot connect a program nobody registered.

**Why this priority**: M3 replaces open registration with an administered list; it is the control
that keeps the unauthenticated surface small.

**Independent Test**: the Admin flow in the browser against the mock identity provider, then the
connect flow with registered and unregistered programs.

**Acceptance Scenarios**:

1. **Given** the Admin section for agent programs, **When** an Admin adds a program, previews the
   change, and confirms, **Then** one commit lands in the administration repository and the program
   can start the flow.
2. **Given** a proposal with an invalid or non-exact redirect address, **Then** the preview refuses
   it with a reason naming the field.
3. **Given** a registered program removed by an Admin, **Then** its connections end and its next
   token trade or call fails.
4. **Given** the dry run, **Then** it lists the programs and how many connections each would lose.
5. **Given** an unregistered `client_id` at the token endpoint and an invalid one for a registered
   program, **Then** the two answers are byte-identical.

---

### User Story 4 - A headless agent connects with a setup credential (Priority: P2)

Chen works in a remote shell with no browser. In the workbench, in his own browser, he chooses
"Set up a headless agent", picks the program and scopes, reads the same consent text and confirms.
The page shows one setup credential, once. He runs the bridge with it on the remote machine; the
bridge exchanges it and keeps the resulting agent credential in protected storage. The setup
credential is spent.

**Why this priority**: M4 keeps containers and remote shells inside the complete scope, but the
browser flow already serves most people.

**Independent Test**: create, exchange and reuse a credential in a test; run the bridge against a
test server.

**Acceptance Scenarios**:

1. **Given** a created credential, **When** it is exchanged once within its lifetime, **Then** the
   result is the same kind of connection as in Story 1, bound to the same person, program, scopes and
   session.
2. **Given** a second exchange, an exchange after expiry, an exchange with another program's id or
   after the creating session ended, **Then** each fails with the same answer and no connection is
   created.
3. **Given** the credential, **Then** it never appears in an audit record, a log line, a tool
   argument, a document, a metric label or a URL.
4. **Given** the bridge, **When** it finishes, **Then** the agent credential is in a file only the
   current operating-system user can read, and the bridge never prints it.
5. **Given** the page is reloaded after creation, **Then** the credential is not shown again.

---

### User Story 5 - The person chooses what the connection may do (Priority: P2)

Maria connects a program that only needs to read and validate. She leaves remote, publish and
administration off. The program can read and check proposed text, and a save or commit is refused as
outside its scope even though Maria herself could do it in the browser. Later she connects a second
program with the remote scope after reading that it can use her Git credential to push.

**Why this priority**: M9 keeps push and publication from being a side effect of connecting.

**Independent Test**: tokens issued with different scopes call listed and unlisted operations.

**Acceptance Scenarios**:

1. **Given** default scopes only, **Then** the tool list omits push, publication and administration
   operations, and a direct call to one is refused with the scope reason.
2. **Given** the remote scope chosen, **Then** the consent page says in plain words that the agent
   can use the person's Git credential held by the server to push.
3. **Given** the publish scope chosen, **Then** the consent page says that the agent can move what
   every consumer reads.
4. **Given** the administration scope, **Then** it is not offered in this release and a request that
   names it is refused as an unknown scope.
5. **Given** a scope the person's roles do not allow, **Then** consent shows it as unavailable and the
   token never carries more authority than the roles.

---

### User Story 6 - Stolen or replayed credentials end the connection (Priority: P2)

A refresh token leaks and is used twice. The second use is recognised, the whole connection ends, the
person sees it in their list as revoked for suspected replay, and the audit log has one record.

**Why this priority**: refresh rotation without replay detection would give an attacker a quiet,
permanent copy.

**Independent Test**: use a refresh token twice, and a code twice, in a test.

**Acceptance Scenarios**:

1. **Given** a refresh token already exchanged, **When** it is presented again, **Then** the
   connection is revoked, the current tokens stop working and a replay record is written.
2. **Given** a PKCE verifier that does not match, **Then** the code is spent and the trade fails.
3. **Given** a token issued for one program or resource presented for another, **Then** it is refused
   as if unknown.
4. **Given** a flood of bad token requests from one address, **Then** the rate limit answers and the
   audit log records a bounded number of anonymous denials.

---

### Edge Cases

- A cookie is sent to the MCP endpoint together with a valid or invalid bearer. The cookie is ignored
  in both cases; an invalid bearer never falls back to the cookie.
- A bearer token of the existing application kind (an identity-provider JWT) is sent to the MCP
  endpoint. It is refused: the endpoint accepts workbench-issued tokens only in this release.
- A workbench-issued token is sent to the agent API or any other route. It is refused: it is valid
  for the MCP resource only.
- The consent page is opened in two tabs and both are allowed. Each issues a separate single-use
  code; both are valid until used or expired.
- A person has the maximum number of live connections and connects another. The oldest unused one is
  not removed silently: the page says the limit is reached and links to the list.
- The program's redirect receives the code in a query string. The code is single use, short lived and
  bound to the program and the person, and the consent response sets no-store headers.
- A browser back button returns to the consent page after a decision. The decision form is bound to
  one pending request and a repeat answers that the request is finished.
- Authorization requests in flight when the server restarts are lost. The program starts again.
- The identity provider is unreachable at the moment of an agent call. The call uses the session as it
  is; it never contacts the provider to continue, so an outage does not end connections.
- A connection whose person is removed from every grant. The next call is refused as no access and
  the connection stays listed as ended.
- A very long program name, redirect address or client description is shown in full on the consent
  page, in the Admin section and in the person's list, wrapping instead of being cut.
- A setup credential created on the consent page is copied by a screen reader or a phone user. The
  page works at narrow width and the credential wraps without clipping.
- The Admin removes the program while a consent page for it is open. The decision is refused as
  expired.

## Requirements *(mandatory)*

### Functional Requirements

**Endpoint surface**

- **FR-001**: In server mode the workbench MUST act as the authorization server for its own MCP
  resource. It MUST publish a protected-resource metadata document that names the MCP resource and
  its authorization server, and an authorization-server metadata document that lists only what it
  supports: the authorization-code grant, the refresh grant, the setup grant of FR-034, PKCE with
  S256, public clients without a secret, and no registration endpoint.
- **FR-002**: The only requests answered without an authenticated principal MUST be the two
  metadata documents, the token endpoint, and the bearer challenge of the MCP endpoint. Every other
  new endpoint MUST require the person's browser session or a valid access token.
- **FR-003**: The unauthenticated endpoints MUST accept bounded input (a maximum body size and
  parameter lengths), MUST be rate limited by source address, MUST set no cookie, MUST return no
  document content and MUST NOT disclose whether a client exists.
- **FR-004**: Dynamic client registration MUST NOT be exposed, and the server MUST NOT fetch any
  address supplied by a caller, including client metadata documents and redirect addresses.
- **FR-005**: In local mode none of these endpoints exist and the local capability of feature 006 is
  unchanged.
- **FR-006**: The metadata documents MUST derive every address from the configured public address of
  the server, never from request headers.
- **FR-007**: The bearer challenge MUST be a 401 on an unauthenticated or invalid-bearer call to the
  MCP endpoint, with a header that points to the protected-resource metadata, and MUST carry no
  reason that distinguishes a missing, expired or revoked token.
- **FR-008**: A refusal at an unauthenticated endpoint MUST be audited at most once per source address
  per window, as other anonymous denials are, so that a loop of bad requests cannot fill the log.

**Client registration**

- **FR-009**: Registered agent programs MUST live in the administration repository as one access
  document, validated against a schema, changed only through the existing proposal, dry run, receipt
  and confirmation flow, one commit per change.
- **FR-010**: A registration MUST hold a client id the Admin chooses, a display name, a short
  description, one to five exact redirect addresses, the scopes the program may request, and optional
  documentation text shown to the person. It MUST NOT hold a secret.
- **FR-011**: A redirect address MUST be an absolute address that is either `https`, or `http` on a
  loopback host with an explicit port, or a custom scheme registered by name. It MUST NOT contain a
  fragment, wildcard or credentials. Comparison MUST be exact, byte for byte after normalizing nothing.
- **FR-012**: The dry run of a registration change MUST list added, changed and removed programs and,
  for each removed or narrowed one, how many live connections would end.
- **FR-013**: Removing a program, or removing a redirect address or a scope it needs, MUST end the
  affected connections when the change is confirmed.
- **FR-014**: The first release MUST ship documented configurations for the two programs of the
  acceptance matrix, Codex CLI and the bundled reference client, and MUST state that other programs
  work only when an Admin registers them and are not claimed to be compatible.

**Authorization request and consent**

- **FR-015**: The authorization address MUST require the person's browser session. An anonymous
  request MUST go through the normal sign-in and come back to the same request.
- **FR-016**: A request MUST be refused, without redirecting to the program, when the client id is
  unknown, the redirect address is not exactly one registered, the response type is not code, the
  code challenge is missing or not S256, the resource is not this server's MCP resource, or a scope is
  unknown or not allowed for the program.
- **FR-017**: A request MUST carry a resource indicator naming the MCP resource, and every token
  issued MUST be bound to that resource, the program and the connection.
- **FR-018**: The consent page MUST show the program's name and description, the person it will act
  as, each requested scope with what it allows in plain words, the length of the connection (until
  sign-out or session end), and the statement of FR-063.
- **FR-019**: The consent decision MUST be a form post protected by the session's request token, and
  MUST apply to exactly one pending request created by the authorization request. A repeated or
  stale post MUST NOT issue a second code.
- **FR-020**: Issuing a code MUST require an explicit allow. A deny or a closed page MUST issue
  nothing.
- **FR-021**: An authorization code MUST be single use, valid for at most one minute, bound to the
  program, redirect address, challenge, resource, scopes, person and session, and MUST never appear
  in an audit record, log line or metric label.
- **FR-022**: The authorization response MUST return the state value the program sent, unchanged, and
  MUST NOT put a token in an address.
- **FR-023**: Consent pages MUST be sent with headers that forbid caching, framing and referrer
  disclosure, and MUST carry no script.
- **FR-024**: A person MAY hold at most the configured number of live connections; reaching it MUST
  stop a new consent with a message that links to the list.

**Tokens**

- **FR-025**: Access and refresh tokens MUST be opaque random values of at least 256 bits, stored
  only as keyed hashes, compared in constant time, and shown to the program once.
- **FR-026**: Access tokens MUST expire after a short fixed time. A refresh token MUST stay valid only
  until the connection or its session ends; no refresh lifetime independent of the session exists.
- **FR-027**: The token endpoint MUST verify, for the code grant, the code, the program, the redirect
  address, the verifier against the stored S256 challenge and the resource. Any failure MUST spend
  the code.
- **FR-028**: A refresh MUST issue a new access token and a new refresh token and retire the old
  refresh token. Presenting a retired refresh token MUST revoke the whole connection and write a
  replay record.
- **FR-029**: Using a code twice MUST revoke the tokens that code produced.
- **FR-030**: A token MUST be accepted only on the MCP resource. It MUST be refused on every other
  route, including the agent API.
- **FR-031**: Token and connection state MUST be written atomically in the data root, never only in
  memory, and a restart MUST keep connections whose sessions survive.
- **FR-032**: The keyed hash key MUST be derived from the server's secret session key and MUST NOT
  be stored in the data root. Changing the session key MUST end every connection with every session.
- **FR-033**: Token responses MUST carry no-store headers and MUST NOT include a person's name, roles
  or any document content.

**Setup credential**

- **FR-034**: A signed-in person MUST be able to create a setup credential for one registered
  program and one scope set after the same consent text as FR-018. The credential MUST be valid for at
  most ten minutes, usable once, bound to the person, program, scopes and creating session, and
  exchanged at the token endpoint.
- **FR-035**: The exchange MUST produce the same connection as the browser flow, and no more
  authority: the same scope limit, the same session binding and the same revocation.
- **FR-036**: The credential MUST be shown once on a page that forbids caching, MUST NOT appear in an
  address, and MUST never be written to an audit record, a log, a metric, a tool argument or a
  document. Records name the connection id and the credential's creation, never its value.
- **FR-037**: An exchange MUST fail identically when the credential is unknown, spent, expired, for
  another program, or its session has ended.
- **FR-038**: The bridge MUST accept a server address and the credential, exchange it, and keep the
  agent credential in a file readable only by the current operating-system user, refusing to run
  when it cannot set that restriction. It MUST never print the credential or the tokens.
- **FR-039**: The bridge MUST refresh the access token itself and MUST tell the person plainly to
  reconnect when refresh fails because the connection ended.
- **FR-040**: No long-lived personal access token, device-login flow or credential that outlives the
  browser session MUST exist.

**Lifetime and revocation**

- **FR-041**: A connection MUST end when its browser session ends for any reason: sign-out,
  provider-initiated logout, idle or absolute expiry, administrator termination, deactivation of the
  person, or a changed session secret.
- **FR-042**: Agent calls MUST NOT update the session's last-seen time and MUST NOT extend any
  session lifetime.
- **FR-043**: On every call the server MUST resolve the person's current roles and grants and decide
  the operation through the operation boundary with the connection's scopes as a narrowing limit.
  A removed grant MUST reduce the next call; a person with no remaining grants or who is deactivated
  MUST end the connection.
- **FR-044**: A person MUST be able to list their own connections (program, scopes, created, last
  used, state) and revoke any of them. Revocation MUST take effect on the next call and MUST NOT end
  the browser session or other connections.
- **FR-045**: An Admin MUST be able to list every connection and revoke any, with the person and
  program named, and MUST NOT see tokens or hashes.
- **FR-046**: Ended connections MUST stay listed with their end reason for a bounded time, then be
  removed with their hashes.
- **FR-047**: Streaming or long-running work opened through a connection MUST stop when the
  connection ends. This feature supplies the end signal; the work that listens belongs to the
  features that open it.
- **FR-048**: A call MUST NOT contact the identity provider to continue a connection. Provider
  failures MUST NOT end connections.
- **FR-049**: A connection whose person has no grants, whose program is removed, or whose scope is no
  longer allowed for its program MUST be ended at the next call or at the next sweep, whichever comes
  first.

**MCP endpoint in server mode**

- **FR-050**: In server mode the MCP endpoint MUST be mounted and MUST authenticate only workbench-
  issued bearer tokens. It MUST ignore cookies, MUST NOT require the cross-site request header of
  browser writes, and MUST NOT fall back to a cookie when a bearer is invalid.
- **FR-051**: The caller the endpoint creates MUST be a person caller with origin `mcp`, a connection
  id, the connection's scope as effects, and a reference to the owning session so delegated Git
  credentials are found through it and never through a cookie.
- **FR-052**: The tool list MUST be computed from the connection's effects and the person's
  effective permissions; a tool outside the scopes MUST be absent, and a direct call to one MUST be
  refused with the connection-scope reason.
- **FR-053**: The existing browser and agent-API behaviour MUST NOT change: same statuses, bodies,
  cookies and audit records, shown by the characterization suite of feature 010. The one reviewed
  difference is that the list of administration documents gains the registrations document.
- **FR-054**: The request gate of local mode (loopback host, capability header) MUST remain for local
  mode only, and server mode MUST apply its own checks in a fixed order: method, origin (refuse any
  browser origin), content type, bearer, connection state.
- **FR-055**: The hidden-equals-missing rule MUST hold for every answer to a connection, as for the
  browser.

**Scopes**

- **FR-056**: The scope vocabulary MUST be read, edit, validate, commit, remote, publish and
  administration. The first four are the defaults, offered pre-selected.
- **FR-057**: Each scope MUST map to a fixed set of operation effects, and the mapping MUST be shown
  in the consent text and tested against the operation inventory so that no operation is reachable
  by a scope that does not name its effects.
- **FR-058**: The administration scope MUST NOT be offered or accepted until the administration
  increment ships. The scope's name stays reserved and its absence MUST be documented.
- **FR-059**: Irreversible operations (permanent purge, destruction of a workspace or history) MUST
  NOT be reachable by any scope in this release.
- **FR-060**: The consent page MUST show a scope as unavailable, with the reason, when none of the
  person's roles could ever use it, and the token MUST NOT carry it.

**Audit, telemetry and messages**

- **FR-061**: The following MUST each write one audit record with the connection id: consent given,
  consent denied, setup credential created, code or setup credential exchanged, refresh, replay
  detected, revocation by the person, revocation by an Admin, expiry or end with its reason, and a
  refused token request. Records MUST carry no token, code, credential, verifier or hash.
- **FR-062**: Operations performed through a connection MUST be audited with origin `mcp` and the
  connection id by the operation boundary; this feature adds nothing to that path.
- **FR-063**: The consent page and the documentation MUST say, in these words: "Semantic Workbench
  does not call a language model. When you connect an external agent, that agent can receive
  definitions you authorize and may send them to its model provider; its configuration and policies
  govern that onward use."
- **FR-064**: Metrics for these endpoints MUST be labelled only by endpoint, grant type and outcome
  and MUST NOT carry client id, person, address or token fragments.
- **FR-065**: The consent page MUST state that the agent acts with the person's roles, may read what
  they may read, and that the connection ends when they sign out.

**Interface**

- **FR-066**: The consent, setup-credential and error pages MUST be server-rendered with the sign-in
  pages' stylesheet and tokens, work without script, work in light and dark, and be usable at 320
  CSS pixels wide.
- **FR-067**: The Admin MUST have a section for agent programs (list, add, edit, remove, preview,
  confirm) and one for agent connections (list, revoke), using the existing Admin layout, controls
  and review flow.
- **FR-068**: The person menu MUST offer an entry for the person's connections, opening a dialog that
  lists them, revokes one, and starts the setup credential page. Local mode MUST show neither.
- **FR-069**: Every list MUST have empty, loading, error and long-text states. No text MUST be cut,
  clipped or shortened with an ellipsis; long names, redirect addresses and descriptions wrap.
- **FR-070**: Destructive actions (revoke, remove a program) MUST say what will end and require one
  confirmation that names it.

**Documentation and gates**

- **FR-071**: README, the server-mode guide, the configuration guide, the architecture map, the new
  agent-connection guide, the MCP guide and the operation inventory page MUST describe the feature
  and its limits in the same change as the code, including that it is not a sandbox, that connected
  agents may forward content to their model provider, and the supported-program list.
- **FR-072**: Every new operation MUST have an operation inventory entry, a route row, a parity case
  and an authorization matrix case; the public rows MUST be exactly the four of FR-002.
- **FR-073**: Targeted mutants MUST cover code and refresh single use, PKCE check, redirect
  comparison, resource and program binding, replay revocation, session binding, scope narrowing and
  token validation.
- **FR-074**: A test MUST fail when a durable or logged value contains a token, code, setup
  credential or verifier.
- **FR-075**: A browser check and screenshots MUST cover the consent page, the setup-credential page,
  the error pages, the person's dialog and both Admin sections in light, dark, desktop and phone
  width, with empty, loading, error and long-text states.

### Key Entities

- **Agent program (registration)**: an administered entry that says which programs may ask to connect:
  id, name, description, exact redirect addresses, allowed scopes, setup text.
- **Pending request**: one authorization request waiting for the person's decision, in memory only.
- **Authorization code**: a single-use, one-minute proof that the person allowed one request.
- **Setup credential**: a single-use, ten-minute proof created in the browser for a headless program.
- **Connection**: the durable record of one person, one program, one scope set and one session, with
  the hashes of its current access and refresh tokens and a few retired refresh hashes.
- **Scope**: a named permission class that maps to operation effects and narrows the person's roles.
- **Connection event**: an audit record about the life of a connection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A test client completes browser consent, token trade, tool listing and one tool call in
  server mode against the mock identity provider, and every acceptance scenario of Stories 1 to 6
  has a test.
- **SC-002**: Across all token-endpoint failure modes (unknown program, wrong redirect, wrong
  verifier, spent code, retired refresh token, wrong resource, expired credential) the caller-visible
  answers for unknown and invalid clients are identical in status, headers and body.
- **SC-003**: After sign-out, expiry, deactivation, program removal or revocation, the next call with
  the old access token fails in 100% of generated cases, and agent calls over a full idle window leave
  the session's last-seen time unchanged.
- **SC-004**: For each scope combination, the tool list and a direct call of every inventory
  operation agree with the scope-to-effects table; no operation is reachable without its effects.
- **SC-005**: A scan of every file the feature writes (state files, audit log, logs, metrics output)
  after a full flow finds no token, code, credential or verifier.
- **SC-006**: The set of requests answered without a principal equals exactly the four of FR-002 in a
  test that walks every route row.
- **SC-007**: The characterization suite of feature 010 shows zero HTTP differences for the existing
  routes, except the one listed in FR-053.
- **SC-008**: Every mutation of FR-073 is detected by the mutation suite.
- **SC-009**: The consent, setup, error, dialog and Admin screens show no clipped or overlapping text
  in the responsive and clipping suites at the widths those suites use, light and dark.
- **SC-010**: The documentation passes the repository's checks, and each limit it states (not a
  sandbox, onward use by the agent's provider, daily reconnection, supported programs) is also
  stated on the consent page or in the setup guide.

## Assumptions

- Feature 006 is merged first, or alongside: its endpoint, tool registry, caller minting and bridge
  are the base. Foundation work that does not need it is listed in the plan.
- The existing identity provider sign-in, session store, administration repository and audit log are
  used as they are. No new runtime dependency is added unless research shows the authorization
  server needs one.
- Public clients only: a program that cannot keep a secret relies on PKCE and the exact redirect.
- Token lifetimes, limits and sizes in the plan are chosen without measurement and are tunable.
- The workbench never calls the provider because an agent called. Provider tokens are refreshed only
  by browser requests and by the existing remote-credential path.
- Single instance per data root, as today.
- Protocol facts about the 2026-07-28 authorization revision that cannot be checked offline are
  research tasks in the plan; the spec states required behaviour, not the wording of the protocol.

## Out of Scope

- Delegated administration and its scope (M6), application grants and history capability (M7), the
  local token (M8, already in 006), resources, prompts and subscriptions, remaining workspace and
  source-control operations.
- Dynamic client registration, fetching client metadata documents, confidential clients, a device
  login flow, long-lived personal access tokens, tokens usable outside the MCP resource.
- Making tool calls, tools themselves, receipts and their retention (006).
- The agent panel's transport (015); this feature only keeps the connection model reusable.
- Per-agent branches or working copies (M12).

## Decisions made while specifying

No clarify round took place. Each choice below follows the decisions file and is the most
conservative reading where the file is silent.

| # | Choice | Reason | Follows |
| --- | --- | --- | --- |
| 1 | Public clients only; no client secret field exists. | A secret in a registration would need storage and rotation rules the decisions do not give, and PKCE with an exact redirect is the control M2 names. | M2, M3 |
| 2 | Redirect comparison is exact, with no loopback port wildcard. Whether Codex CLI can pin its callback port is a research task; if it cannot, it is not listed as supported. | M2 says exact registered redirect validation; a wildcard would loosen it. | M2, M15 |
| 3 | The setup credential is a second way to obtain an authorization-code-like grant, exchanged at the same token endpoint. | M4 asks for the same scoped connection. Reusing the token endpoint keeps the unauthenticated list at four, as Principle I states. | M4, Principle I |
| 4 | Pending requests, codes and setup credentials live in memory only; connections and token hashes are durable. A restart loses only things valid for minutes. | Smallest durable surface; losing a minute-long code is harmless. | M2, Principle IV |
| 5 | Access token lifetime is short (10 minutes); refresh tokens live exactly as long as the session; the refresh grace for a crash after rotation is none. | M5 forbids an independent refresh lifetime; a retired token reused is replay and must revoke. | M2, M5 |
| 6 | Agent calls do not contact the provider and do not touch the session's last-seen time. | M5: agent traffic does not extend browser idle time. | M5 |
| 7 | The `validate` scope maps to the read effect, because validation writes nothing. | The effect vocabulary has no validate effect and M9 lists validation among the defaults. | M9 |
| 8 | The `administration` scope exists in the vocabulary and is not offered or accepted. | M6 belongs to the administration increment. | M6, M18 |
| 9 | No scope reaches irreversible deletion. | M6 requires a browser approval bound to exact targets. | M6 |
| 10 | Consent shows scopes the person's roles cannot use as unavailable instead of hiding them. | The person should see why a program cannot do what it asks. Narrowing still comes from roles on every call. | M9 |
| 11 | The Admin sees connections and can revoke them, but never tokens. A person sees only their own. | Consistent with hidden-equals-missing and the least disclosure that allows revocation. | M5, E19 spirit |
| 12 | Token endpoint events are audited with origin `mcp` and the connection id; consent and revocation done in the browser use origin `http` with the connection id. | The audit origin names the transport that carried the act. | M14 |
| 13 | A person may hold at most 10 live connections. | A bound avoids unbounded stores; no decision gives a number. | none |
| 14 | A token issued here is valid on the MCP resource only. Identity-provider JWTs stay valid on the agent API only. | Constitution: the MCP endpoint ignores cookies and has its own tokens. | M2, Principle I |
| 15 | The 401 challenge never says why. | Same answer for unknown and invalid. | M2, Principle I |
| 16 | The consent form is server-rendered without script. | The sign-in pages are script-free and need no new browser surface. | Principle I |
| 17 | The Admin section for programs is separate from the existing "agent client grants", which stay for application identities. | Applications and people are different grant kinds (M7). | M3, M7 |

### Gaps and contradictions found in the decisions file

1. **Setup credential and the token endpoint.** Principle I (via M2) says the token endpoint
   authenticates "by code, PKCE or refresh token". M4's setup credential is none of these by name.
   Resolved as decision 3: it is treated as a code issued without a redirect. The constitution's
   wording could add "or setup credential" in the next patch.
2. **Refresh rotation versus M5's "no independent refresh lifetime".** Both hold only if the refresh
   token is valid exactly while the session lives. Resolved as decision 5.
3. **"Validate" is a default scope but not an effect.** M9 lists it; the operation inventory
   vocabulary does not (decision 7).
4. **Codex CLI is named as a matrix client in M15, but nothing in the decisions shows it can use a
   pre-registered public client with a fixed callback port.** Research task R2 settles it; the
   outcome can shrink the supported list.
5. **No numbers are given** for code, access token, setup credential and connection limits.
6. **Origin of sign-in events.** M14 speaks of MCP origin for tool calls; endpoint events have no
   stated origin (decision 12).
7. **"Explicit connection revocation" has no stated actor.** M5 does not say whether an Admin may
   revoke another person's connection. Allowed here (FR-045); it only narrows access.
8. **The unauthenticated list names a bearer challenge, but the MCP endpoint is not a separate
   route.** It is one of the four answers because it is the MCP row's own 401.

## Dependencies

- **Feature 006 (MCP server, local read, edit, validate, commit; 21 tools).** Required. This feature
  mounts 006's endpoint in server mode, changes its request gate, and reuses its bridge, tool
  registry and call attribution. 006 is not on this base; the plan separates work that can start
  without it.
- **Feature 010 (operation boundary, merged).** Required and present: callers, connection scope,
  inventory, audit origin and connection fields.
- **Tessera format types (feature 011).** None. No document format is read or changed.
- **Feature 012 (shared proposals).** None in code. Both add routes and inventory rows.
- **Feature 014 (usage counters).** None. Counters count by caller origin and ignore connection
  identity.
- **Feature 015 (agent panel).** 015 reuses the connection model for its own transport. This feature
  keeps connection records transport-neutral and exposes the creation and revocation operations
  015 needs.

## Traceability

| Decision | Requirements | Stories |
| --- | --- | --- |
| M2 own sign-in feature, workbench as authorization server | FR-001 to FR-008, FR-015 to FR-033, FR-050 | 1, 6 |
| M3 administered registrations, no metadata fetch | FR-004, FR-009 to FR-014, FR-067 | 3 |
| M4 headless bootstrap | FR-034 to FR-040 | 4 |
| M5 connection lifetime | FR-026, FR-041 to FR-049 | 2 |
| M9 scopes | FR-052, FR-056 to FR-060 | 5 |
| M11 content statement | FR-018, FR-063, FR-065 | 1 |
| M1 and M14 boundary and audit | FR-051, FR-055, FR-061, FR-062 | 1, 2 |
| Principle I and IV | FR-002, FR-031, FR-032, FR-050 | all |
| R2 gates | FR-071 to FR-075 | all |
