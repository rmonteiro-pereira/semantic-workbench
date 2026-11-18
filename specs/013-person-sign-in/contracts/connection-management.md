# Contract: connection management and audit

## Routes

| Route | Action | Who | Meaning |
| --- | --- | --- | --- |
| `GET /api/connections` | viewOwnState | the signed-in person | Own connections, newest first, with views of `data-model.md` |
| `DELETE /api/connections/:id` | viewOwnState | the owner | Revokes one of their own connections (reason `revoked-by-person`); an id that is not theirs answers 404 |
| `GET /api/admin/connections` | admin | Admin | Every connection with the person's name |
| `DELETE /api/admin/connections/:id` | admin | Admin | Revokes any connection (reason `revoked-by-admin`) |
| `GET /oauth/authorize`, `POST /oauth/consent`, `GET/POST /oauth/setup` | viewOwnState | session | Browser pages |

These rows join the operation inventory as browser operations, not agent operations: pages use
`dispatch: { no: 'page' }`, the list and revoke routes use `{ no: 'browser-only' }`. The four
unauthenticated answers are public rows with `{ no: 'public' }`.

Browser cookie writes need the existing `X-SW-Request` header and origin check.

## Audit actions

| Action | Written when | Origin |
| --- | --- | --- |
| `connection.consent` | allow or deny at the consent page (outcome records which) | http |
| `connection.setup-created` | setup credential created | http |
| `connection.issued` | code or setup credential exchanged | connection origin (`mcp` or `acp`) |
| `connection.refreshed` | refresh succeeded | connection origin (`mcp` or `acp`) |
| `connection.replay` | retired refresh token or spent code presented | connection origin (`mcp` or `acp`) |
| `connection.revoked` | person or Admin revocation | http |
| `connection.ended` | end for any other reason, with the reason | http for session end; connection origin when noticed at a call |
| `connection.refused` | a token request refused (bounded like anonymous denials) | mcp for an unbound token request |

Each carries the connection id when one exists, the person when known, the program id and the scope
set. None carries a token, code, credential, verifier, hash or session reference.

## Ending connections

One service ends connections. It is called by: the session end signal, the periodic sweep, the
revocation routes, the program removal effect of a confirmed registration change, and replay
detection. Ending is idempotent and writes one audit record per connection. Events and long-running
work opened through a connection listen to the service's end signal.

Lists include `origin` (`mcp` or `acp`), also shown in revocation confirmations. Ending an ACP
connection notifies the bound panel session through `onConnectionEnded`. Token refresh retains
origin, and transport adapters refuse another origin. Receipts are owned by the person and
connection that created them and recheck current authorization before replay.
