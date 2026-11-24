# Implementation Plan: Person Sign-In for Agent Connections

**Branch**: `012-independent-specs` (documents) | implementation branch to be cut at the batch | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-person-sign-in/spec.md`

## Summary

A new server folder, `src/server/connections/`, holds the authorization server's domain code: scope
mapping, program registrations, PKCE, token hashing, the in-memory store of pending requests, codes
and setup credentials, the durable connection store and one connection service that issues, refreshes
and ends connections. Two thin route files expose it: public and browser endpoints
(`routes/oauth.ts`) and connection management (`routes/connections.ts`, plus Admin routes). The
session store gains a lookup by reference that does not touch last-seen time and a second listener
for ended sessions, which is how a connection dies with its browser session. Registrations are a new
access document, `programs.json`, edited through the existing Admin proposal, dry run and receipt
flow. In server mode the MCP endpoint of feature 006 gets a second request gate that accepts only
connection tokens and mints a person caller with origin `mcp`, the connection id, the connection's
effects and the owning session. Three browser pages are rendered on the server in the sign-in
pages' style; the person's dialog and two Admin sections are React. The bridge learns a server
address and the setup credential.

The reasoning and rejected alternatives are in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript on Bun 1.4 (server, bridge); React 19 for three small UI parts.

**Primary Dependencies**: none new. `node:crypto` (HMAC, HKDF, random bytes), the existing Ajv for
the registrations schema, the existing session store, audit log, operation boundary (010) and, from
006, the protocol library already chosen there.

**Storage**: `data/state/connections/<id>.json` (new, atomic JSON); `programs.json` in the
administration repository (new document, one commit per change). Pending requests, codes and setup
credentials are memory only.

**Testing**: `bun test` of new folders `tests/connections/` and new files under `tests/auth/` and
`tests/mcp/` (006); one browser check `scripts/connections-browser-check.ts`; targeted mutants in
`scripts/connections-mutation-cases.ts`.

**Target Platform**: server mode on one container; local mode unchanged.

**Project Type**: web service plus single-page app plus a command-line bridge.

**Performance Goals** (chosen here, to be measured and recorded; none derived from a measurement):
bearer resolution (hash lookup, session lookup, principal rebuild) adds no more than 5 ms median to a
tool call on the test fixture; the token endpoint answers in under 50 ms median without contacting
anything outside the process.

**Constraints**: no outbound call; no cookie on unauthenticated answers; no token, code, credential
or verifier in any file or log; files of about 400 lines, functions of about 40; one statement per
line; comments say why and carry no IDs.

**Scale/Scope**: tens of people, at most 10 live connections each, at most 50 registered programs.

## Constitution Check

Checked against the constitution in this worktree (4.0.1).

| Principle | How the plan complies |
|---|---|
| I. Local and Server Modes | This plan is the "Agent connections" bullet of server mode: the workbench as authorization server behind the sign-in; opaque tokens as keyed hashes; PKCE S256, one-use codes, exact redirect, client and resource binding, explicit consent, refresh rotation with replay revocation; connections bound to the browser session; default scopes and separately selected ones; four unauthenticated answers, bounded, rate limited, no cookie, no content, same answer for unknown and invalid clients; no dynamic registration and no fetch of caller-supplied addresses. Local mode gets none of it. The README sentence about onward use is on the consent page. Administration scope not offered, so the delegated-administration bullet is not exercised. |
| II. Byte-Exact Source Preservation | No document is read or written. |
| III. One Validation Rule Set | The registrations schema is validated by the same module in browser and server. |
| IV. Atomic, Hash-Checked File Persistence | Connection records are atomic JSON state; access configuration (registered programs) lives in the administration repository, one commit per change; tokens only as keyed hashes. |
| V. Pinned Official Standards | No standard is pinned or edited. The protocol texts are read in research and recorded, never fetched at run time. |
| VI. Verification Gate | New decision logic gets targeted mutants (FR-073); every new route joins the matrix and the operation inventory with a parity case; browser check for the new screens. The full gate runs once on the integrated batch. |
| VII. Honest Claims | Documentation states: not a sandbox, onward use by the agent's provider, daily reconnection, supported programs only after an acceptance run. |
| VIII. Readable Code | Modules named for concepts, no `utils`; one concern per file; no IDs in comments. |
| Technical Constraints | Every operation still goes through the operation boundary; the MCP gate authenticates and bounds but grants no action. New runtime dependency: none. Single-instance rule unchanged. |

Complexity Tracking is empty.

## Design

### Modules (all new unless marked)

| Module | Concept |
| --- | --- |
| `src/server/connections/scopes.ts` | The scope vocabulary, defaults, effects of each, and what the consent text says |
| `src/server/connections/programs.ts` | Typed parse of `programs.json`, redirect rules, lookups by client id |
| `src/server/connections/pkce.ts` | S256 challenge check |
| `src/server/connections/token-keys.ts` | HKDF key derivation, token generation, keyed hash, constant-time compare |
| `src/server/connections/pending-grants.ts` | Memory store of pending requests, codes and setup credentials with expiry and spent marks |
| `src/server/connections/connection-store.ts` | Durable store: one file per connection, in-memory index by token hash |
| `src/server/connections/connection-service.ts` | Issue, refresh, end, sweep, resolve a call into a caller; the one place that ends connections |
| `src/server/connections/consent-pages.ts` | HTML of the consent, setup, setup-result and error pages |
| `src/server/connections/server-metadata.ts` | The two metadata documents and the challenge header |
| `src/server/routes/oauth.ts` | Public documents and token endpoint; browser pages |
| `src/server/routes/connections.ts` | Person's list and revoke |
| `src/server/routes/admin-connections.ts` | Admin list and revoke; programs get/put/preview |
| `src/server/mcp/server-mode-gate.ts` (from 006's folder) | The bearer gate of the MCP endpoint in server mode |
| `src/app/auth/AgentConnectionsDialog.tsx` | The person's dialog |
| `src/app/admin/AgentProgramsSection.tsx`, `AgentConnectionsSection.tsx` | The two Admin sections |
| `scripts/connections-browser-check.ts`, `scripts/connections-mutation-cases.ts` | Browser and mutation checks |
| `docs/agent-connections.md` | Guide for people and Admins |

### Flow of one connection

1. The program starts at `/oauth/authorize`. `routes/oauth.ts` finds the browser session through the
   existing authentication (`authentication.session(request)`), validates the request against the
   registrations and creates a pending request. It renders the consent page.
2. `POST /oauth/consent` checks the session's request token, takes the pending request (single
   use), intersects the chosen scopes with what the person's roles can ever use, and stores a code
   bound as in `data-model.md`. It answers 303 to the program.
3. `POST /oauth/token` hands the grant to `connection-service`, which spends the code, checks every
   binding, creates the connection record, and returns tokens whose keyed hashes are stored.
4. A call to `POST /api/mcp` goes to the server-mode gate: Origin, content type, bearer lookup, then
   `connection-service.resolve(token)` returns the person and session or ends the connection. The
   route mints the caller (`origin: mcp`, connection id, effects, session) and continues exactly as
   in local mode: tool list by `availableOperations`, tool calls through the boundary.
5. A session end calls the service, which ends every connection of that session and audits it.

### Changes to existing code

- `src/server/auth/sessions.ts`: add `getByReference(reference)` that never touches last-seen time,
  and `onEnded(listener)` so the connection service hears about every end, beside the existing
  `ended` option that authentication uses for audit.
- `src/server/auth/authentication.ts`: derive and expose the connection key material, expose
  `sessions` and `principalFor` to the connection service, mount the connection service's end
  listener, and keep `/oauth/*` pages on the same session resolution as `/auth/*`.
- `src/server/auth/request-authentication.ts`: the MCP path in server mode is never authenticated by
  cookie; the existing bearer branch (identity-provider JWTs) is limited to `/api/agent/` as today
  and refuses the MCP path; unauthenticated rows for the four answers are public.
- `src/server/auth/route-actions.ts`: rows for the new routes, public rows for the four answers.
- `src/server/auth/rate-limit.ts`: add the token endpoint and metadata paths to `SIGN_IN_PATHS`.
- `src/server/auth/admin-repo.ts`, `access-config.ts`, `access-admin.ts`,
  `schemas/semantic-workbench-access-v1.json`: the `programs` document and area. The existing
  `agents` area is untouched.
- `src/server/handler.ts`: build the connection service and register the new route groups; mount
  the MCP endpoint in server mode (006 mounts it in local mode only).
- 006: `src/server/mcp/request-gate.ts` stays for local mode; `src/server/routes/mcp.ts` selects the
  gate by mode and mints the caller per request in server mode; `scripts/mcp-stdio.ts` gains the
  server address and setup credential inputs.
- `src/shared/auth/` and policies: none. The own-connections routes use the existing `viewOwnState`
  action and the Admin routes use `admin`.

### Patterns used

- **State machine as pure functions** for code, setup credential and refresh states, so the mutants
  and the tests exercise decisions without I/O.
- **Adapter** for the two gates of the MCP route (local capability, connection token) behind one
  "authenticate this request into a caller" function. Problem: two modes, one tool path.
- **Observer** for session end: the store already has listeners; the service subscribes. Problem:
  connections must end at the instant of the session's end, whichever code path ends it.

## Defaults and where they come from

None of these came from a measurement. "Existing" means a constant already in the repository;
"assumed" means chosen here and tunable without changing a requirement.

| Name | Default | Source |
| --- | --- | --- |
| Authorization code lifetime | 60 seconds | assumed; the standard asks for short, one minute is enough to complete a redirect |
| Pending request lifetime | 10 minutes | existing: sign-in attempt cookies last ten minutes (`docs/server-mode.md`) |
| Access token lifetime | 10 minutes | assumed |
| Refresh token lifetime | the session's | decision M5 |
| Setup credential lifetime | 10 minutes | assumed |
| Token entropy | 32 random bytes | existing: session ids are 256 bits (`docs/server-mode.md`) |
| Retired refresh hashes kept | 8 | assumed |
| Live connections per person | 10 | assumed |
| Ended record retention | 7 days | assumed; the 006 receipt retention is also 7 days |
| `lastUsedAt` write interval | 1 minute | existing: session last-seen persistence is limited to once per minute |
| Registered programs | 50 | assumed |
| Redirect addresses per program | 5, 512 characters each | assumed |
| Token endpoint body | 4,096 bytes, parameter 2,048 characters | assumed |
| `state` length | 512 characters | assumed |
| Pending request count | 1,000 | assumed |
| Rate limits | the sign-in allowance | existing: `DEFAULT_REQUEST_LIMITS.signIn` |
| Sweep interval | 1 minute | assumed |
| Bridge refresh margin | 60 seconds before expiry | assumed |

## Files this feature owns

Everything in the "new" rows of the module table, `tests/connections/`, the new files named in the
quickstart, `docs/agent-connections.md`, `scripts/connections-*.ts`, `src/app/auth/AgentConnectionsDialog.tsx`,
`src/app/admin/AgentProgramsSection.tsx`, `src/app/admin/AgentConnectionsSection.tsx`,
`src/server/mcp/server-mode-gate.ts`.

## Shared files it touches

| File | What changes | Also touched by |
| --- | --- | --- |
| `src/server/handler.ts` | Build the service, register routes, mount MCP in server mode | 006 (mounts MCP, local); 012, 014, 015 (their routes) |
| `src/server/auth/route-actions.ts` | New rows, one block | 012, 014, 015, 006 |
| `policies/operation-inventory.json`, `schemas/semantic-workbench-operations-v1.json` | New entries; vocabulary unchanged (`team-sign-in` exists) | 006, 012, 014, 015 |
| `policies/matrix-cases.json` | Matrix cases | 006, 012, 014, 015 |
| `docs/operations.md` | Regenerated, never hand merged | all |
| `src/server/auth/sessions.ts`, `authentication.ts` | Reference lookup, end listener | none known |
| `src/server/auth/request-authentication.ts`, `middleware.ts` | MCP path rules | 006 (adds its row) |
| `src/server/auth/rate-limit.ts` | `SIGN_IN_PATHS` | none |
| `src/server/auth/admin-repo.ts`, `access-config.ts`, `access-admin.ts`, `schemas/semantic-workbench-access-v1.json` | `programs` document and area | none |
| `src/server/routes/admin.ts` | Only the document list for versions, if needed | none |
| `tests/fixtures/characterization/http-v1.json` | The administration document list gains `programs.json`; re-recorded for that field only | none |
| `src/server/mcp/request-gate.ts`, `routes/mcp.ts` (006) | Mode selection; per-request caller | 006 |
| `scripts/mcp-stdio.ts` (006) | Server address, setup credential | 006, 015 (the relay may reuse the connection file helper) |
| `src/server/config.ts`, `docs/configuration.md` | None expected: no new setting. If a limit becomes configurable, one line each | 014, 015 |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `docs/server-mode.md`, `docs/mcp.md` (006), `docs/user-guide.md`, `docs/development.md` | New sections | all four, 006 |
| `package.json`, `scripts/gate-suites.ts`, `scripts/mutation-tests.ts`, `scripts/ci-validate.ts` | One script and suite each | all four |
| `src/app/auth/PersonMenu.tsx` | One menu item | 015 (agent panel entry) |
| `src/app/admin/admin-sections.ts`, `AdminPage.tsx`, `api.ts`, `types.ts`, `admin.css` | Two sections | none known |
| `scripts/terminology-check.ts` word list | New terms | any UI feature |

## Overlaps with the other features

- **006**: the largest. Server-mode mounting, the gate, the caller and the bridge change 006's files.
  Everything in `src/server/connections/`, the pages, the admin routes, the schema and the UI can be
  built and tested on this base with a stub caller; only tasks marked "needs 006" wait.
- **015 (agent panel)**: reuses `connection-service` to create a connection for its relay and listens
  to the end signal. Keep `createConnectionForSession` and `onConnectionEnded` exported and
  transport-neutral. 015 adds origin `acp`; this feature records `connection` the same way.
- **Agreement with 015 (relay connections)**: a connection record carries the origin it was created
  for, `mcp` (default) or `acp`. `createConnectionForSession` accepts the client program, the scopes
  and the origin, and `resolve` returns a caller with that origin. The relay of 015 is an ordinary
  registered program (M3): the Admin registers it using the documented configuration that 015 adds to
  its documentation, and no program is built in. Issue, refresh and replay events keep the connection origin. Browser setup creation and
  revocation use `http`; unbound token refusals retain the token endpoint’s `mcp` origin. Both plans use the inventory dispatch value `public` for routes that answer without a
  session and `browser-only` for browser pages that are never agent operations.
The joined contract uses `createConnectionForSession({ session, clientId, scopes, origin })`
with named scopes `read` and `edit`, not effect names or a panel session id. The relay exchanges
the returned setup credential at the token endpoint, then `resolve` preserves origin `acp`.
The panel binds the connection at authenticated hello and subscribes to `onConnectionEnded`.
Both transports reject tokens of the other origin; receipts keep person/connection ownership
and current authorization. The MCP route contract classifies browser panel and ACP transport
rows without exposing new MCP tools. This reconciles the older relay contract’s panel-id/effect wording
with the transport-neutral service instead of adding a second connection API.

- **014 (counters)**: counts by caller origin; ignores the connection id. No code overlap beyond the
  boundary hook, which this feature does not touch.
- **012 (proposals)**: no code overlap. Both add inventory rows and matrix cases (contiguous blocks)
  and Admin or SCM UI; the only shared UI files are `PersonMenu.tsx` (015) and nothing of 012.
- **Operation inventory vocabulary**: no new value. If review finds a need for an `increment` that
  says "browser-only", that is an overlap to settle across all four.

## Project Structure

### Documentation

```text
specs/013-person-sign-in/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
├── contracts/ oauth-endpoints.md, client-registration.md, consent-and-scopes.md,
│              bootstrap-credential.md, connection-management.md
└── checklists/ requirements.md, analysis.md
```

### Source Code

```text
src/server/connections/   scopes, programs, pkce, token-keys, pending-grants,
                          connection-store, connection-service, consent-pages, server-metadata
src/server/routes/        oauth.ts, connections.ts, admin-connections.ts
src/server/mcp/           server-mode-gate.ts                  (006 folder)
src/app/auth/             AgentConnectionsDialog.tsx
src/app/admin/            AgentProgramsSection.tsx, AgentConnectionsSection.tsx
tests/connections/        scopes, programs, pkce, token-keys, pending-grants, connection-store,
                          connection-service
tests/auth/               oauth-public-surface, connection-flow, connection-lifetime,
                          programs-admin, programs-schema, connection-secrets
tests/mcp/                server-mode-gate, connection-parity                (006)
scripts/                  connections-browser-check.ts, connections-mutation-cases.ts
docs/                     agent-connections.md
```

**Structure Decision**: domain code in one folder named for the concept, routes thin, UI beside the
screens it extends. Nothing is added under `src/server/auth/` except the changes listed, because
authentication code stays where it is.

## UI

Server-rendered pages: styled by `authStylesheet()` (`src/server/routes/auth-stylesheet.ts`), whose
tokens come from `src/shared/theme/theme.css`; layout rules for scope rows, the code box and stacked
buttons are added to the layout string in that file (a shared file; any feature needing sign-in-page
style changes would also touch it). The setup credential is shown in a bordered box that wraps with
`overflow-wrap: anywhere`.

React parts: the dialog uses `Modal` (`src/app/projects/Modal.tsx`) like `ConnectedAccountsDialog`;
the Admin sections use the layout and the review flow of `src/app/admin/` (`ReviewChange.tsx`,
`AdminNotices.tsx`, `SelectField.tsx`, `ListInput.tsx`), with the same tokens and CSS file.

States for every list: loading (the existing status text pattern), empty ("No agent programs
yet. Add one so people can connect."), error (plain sentence with a retry control), long text (names,
descriptions and redirect addresses wrap; no `text-overflow`, no `line-clamp`, no fixed-width labels).
Phone width: one column, buttons stack, tables become stacked rows as the Admin pages already do. Light
and dark come from tokens only; the `check:theme` script enforces it. The text-never-clips rule
applies to every new string.

## Delivery phases

1. **Foundation on this base**: scopes, programs, PKCE, token keys, pending grants, connection store
   and service (with a stub session source), metadata, token endpoint, programs document and Admin
   routes, session lookup and end listener.
2. **Browser parts on this base**: authorize and consent pages, setup pages, person's routes and
   dialog, Admin sections.
3. **Needs 006**: server-mode gate, caller per request, tool list and call parity, bridge, acceptance
   run, documentation of supported programs.
4. **Gate hand-off**: documentation, mutants, browser check; then one task that hands to the batch
   gate and the architecture review.

## Complexity Tracking

No violations.
