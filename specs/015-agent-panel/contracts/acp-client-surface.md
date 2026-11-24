# Contract: what the workbench offers an agent as a protocol client

Protocol revision 1 (schema release 1.32.0, verified 2026-11-17, see research R1). Method names:
`initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/update`,
`session/request_permission`, `fs/read_text_file`, `fs/write_text_file`.

## Capabilities advertised

| Ability | Offered | Notes |
| --- | --- | --- |
| Read a text file (`fs.readTextFile`) | yes | virtual path (absolute, as the protocol requires), optional `line` (1-based) and `limit` (lines) |
| Write a text file (`fs.writeTextFile`) | yes | guarded; see below; the protocol's write carries no base version |
| Terminal (`terminal`: false) | **no** | any `terminal/*` request answers method not found (-32601) |
| Anything else, including `elicitation/create` and `authenticate` | no | method not found, nothing runs; an agent that cannot start without authentication ends the session with `protocol-error` and a sentence saying so |

## Virtual paths

`<root>/<project slug>/<path inside the project>`, where `<root>` is the fixed text `/workbench`.
Refused: any other prefix, a `..` or `.` segment, an empty segment, a backslash, a drive letter,
a control character, an encoded separator (`%2f`, `%5c`), a path longer than 1,024 bytes.
No answer contains a server path.

## Read

1. Parse and check the path.
2. Run `files.read` as the `acp` caller through the boundary.
3. Return the text (line window applied) and record the version in the session.
4. Errors: not available (hidden and missing alike), too large (over 2,000,000 bytes), not text,
   rate limited.

## Write

1. Parse and check the path and text size (at most 2,000,000 bytes).
2. Run `files.read` as the `acp` caller to obtain the current authorized version.
3. If the file exists: the session must hold a version for the path (else refuse: read first), and
   it must equal the current one (else refuse: changed). If it does not exist: use create
   semantics (`files.save` with no base).
4. Run `files.save` with the recorded version as the base. Validation findings refuse an invalid
   text. A guard rewrite returns the stored text.
5. On success record the new version, add an accepted change card with before and after.
6. A repeat of the same text where the file already holds exactly that text and the recorded version
   is the version this session wrote: answer applied, add no card, write no second audit record.

| Refusal | Agent is told | Panel card reason |
| --- | --- | --- |
| no recorded version | read the file first | `unread` |
| version differs | the file changed since it was read | `changed` |
| invalid text | the findings | `invalid` |
| hidden or missing target (existing path semantics) | not available | `not-available` |
| guard refusal | the guard's sentence | `guard` |
| rate limit | try again later | `rate-limited` |

## Questions

A `session/request_permission` is forwarded to the panel. The reply is outcome `selected` with one
offered `optionId`, or outcome `cancelled`. It is sent exactly once. When the person cancels the
turn (`session/cancel`), every pending question is answered `cancelled` at once, as the protocol
requires.

## Agent to client notifications

`agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update` and `plan` (the agent's
task list): forwarded to the panel as
plain text events. Unknown kinds become a `notice` naming the kind and size.

## What the workbench sends the agent when creating a session

`session/new` with the virtual root as `cwd` and `mcpServers: []`; no credentials. The session creation
request is the only place the workbench could name tool servers and it names none.

## Not offered

Plan, context, explanation, commit, push, publish, delete, move, import, administration, remote
and terminal operations.
