# Contract: the relay and its connection

## The relay program

`scripts/acp-relay.ts --session <code> [--url <workbench url>] -- <agent command and arguments>`

- Starts the agent command as a child process of the person's own machine and speaks the protocol
  with it over its standard input and output.
- Never listens on a port. Opens only outbound HTTP to the workbench url.
- Local mode: reads the local capability file (as the MCP bridge does) for each request; the
  capability is sent only in the `Authorization` header.
- Server mode: takes the single-use connection credential from a protected environment variable
  named by the panel's command (`SW_ACP_CREDENTIAL`), exchanges it once, and keeps the resulting
  connection token in memory only. The credential never appears on the command line.
- Exits when the workbench ends the session, when the agent exits (after reporting it), or on
  interrupt (it stops the agent first).

## Requests from the relay

| Request | Purpose |
| --- | --- |
| `POST /api/acp/relay/:session/hello` | present the code once; get the link and the resume number |
| `POST /api/acp/relay/:session/frames` | send numbered agent frames; the answer acknowledges |
| `GET /api/acp/relay/:session/stream` | server-sent events carrying numbered workbench frames; `Last-Event-ID` resumes |
| `POST /api/acp/relay/:session/bye` | tell the workbench the agent exited, with a closed reason |

Every request: `Origin` header refused (a relay is not a browser), no cookies read, exact Host check
in local mode, bounded JSON body (1,048,576 bytes plus envelope), per-address rate limit, the same
answer for unknown, ended and foreign sessions.

## Liveness

The relay sends a ping frame comment every 15 seconds on the posting side. The workbench ends the
link after 45 seconds without any request, and the session with `relay-lost` when the link is not
re-established in that time. A reconnecting relay presents the link's last acknowledged numbers.

## What 015 needs from 013 (server mode)

1. **Credential creation**: the browser asks for a single-use credential naming the relay client,
   the person, the panel session id and the effects `read` and `localWrite`. The credential is shown
   once and expires in 10 minutes.
2. **Authentication**: a function that, given the relay's request, returns a minted caller with
   origin `acp`, the person's principal, the connection id, the connection scope and the session
   reference, or a refusal with the same answer for every failure.
3. **Revocation signal**: a subscription by connection id that fires on sign-out, expiry,
   deactivation and revocation, with the reason.
4. **Registered client**: a client record of the relay kind, or a documented Admin registration.
5. Agent traffic MUST NOT call the session store's "touch".

## What 015 needs from 006 (local mode)

1. The local capability file reader and its comparison function.
2. The call-limit settings and the per-call deadline.
3. The twin request pieces already on this base (010): `buildTwinRequest`, `mintCaller`,
   `operate`; the `validate` twin route added by 006 when text is checked before a save.

## Same answer rule

An unknown session, an ended session, another person's session, a wrong code, a reused code and an
expired code all answer HTTP 404 with the same empty body and the same timing class.
