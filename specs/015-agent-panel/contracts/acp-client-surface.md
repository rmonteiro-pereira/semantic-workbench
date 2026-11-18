# Contract: what the workbench offers an agent as a protocol client

Method names are those to be verified in task T001; the contract is stated by behaviour.

## Capabilities advertised

| Ability | Offered | Notes |
| --- | --- | --- |
| Read a text file | yes | virtual path, optional line window |
| Write a text file | yes | guarded; see below |
| Terminal | **no** | any terminal request answers "unsupported" |
| Anything else | no | unsupported, nothing runs |

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

A permission question is forwarded to the panel. The reply sent to the agent is one offered option
id or "cancelled". It is sent exactly once.

## Agent to client notifications

Message pieces, reasoning pieces, tool activity, the agent's task list: forwarded to the panel as
plain text events. Unknown kinds become a `notice` naming the kind and size.

## What the workbench sends the agent when creating a session

The virtual root as working directory; no tool servers; no credentials. The session creation
request is the only place the workbench could name tool servers and it names none.

## Not offered

Plan, context, explanation, commit, push, publish, delete, move, import, administration, remote
and terminal operations.
