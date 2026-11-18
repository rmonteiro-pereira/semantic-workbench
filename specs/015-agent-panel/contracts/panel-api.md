# Contract: the browser routes of the panel

All routes require a signed-in person in server mode, or the local principal in local mode, and
carry the usual cross-site checks. None is an agent operation (inventory exposure `never`).

| Route | Purpose | Notes |
| --- | --- | --- |
| `POST /api/acp/sessions` | create a session; body `{ confirmReplace? }` | answers `{ id, code, command, statement, scopes, expiresAt }`; server mode also creates the credential through 013 |
| `GET /api/acp/sessions/:id/events` | server-sent events of panel events | numbered; `Last-Event-ID` catches up from the buffer |
| `POST /api/acp/sessions/:id/prompt` | send a prompt | `{ text, files: [path] }`, text at most 100,000 bytes, at most 20 files |
| `POST /api/acp/sessions/:id/cancel` | cancel the running turn | |
| `POST /api/acp/sessions/:id/questions/:question` | answer a question | `{ option }` or `{ cancel: true }` |
| `DELETE /api/acp/sessions/:id` | end the session | reason `closed` |

Undo of a change is not a panel route: the browser uses the ordinary file save with the version the
change card holds.

Errors: 404 for a session that is unknown, ended and gone, or not the caller's; 409 when a second
session needs `confirmReplace`; 413 for an oversize body; 429 when rate limited. Bodies are
`{ error: <plain sentence> }`.

## Events

`session` (state, agent name, scopes), `message` (id, role, text piece, done), `reasoning`,
`tool` (id, title, status), `tasks` (list of entries with status), `change` (card),
`question`, `notice`, `turn` (started, finished, cancelled), `ended` (reason). Text fields are plain
strings. The stream sends a comment line every 15 seconds so proxies keep it open.

## Statement and scopes shown

The statement is the fixed text in FR-003. The scopes read: "Read files you may read" and "Change
files you may edit". Nothing about commit, push or publish is offered here, and the panel says
that those need a separate connection of the agent's own.
