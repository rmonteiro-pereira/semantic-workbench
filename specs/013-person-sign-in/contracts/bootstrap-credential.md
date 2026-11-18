# Contract: setup credential and the bridge

## The credential

32 random bytes, base64url, prefixed `swsetup_` so a person can tell what it is and a log scanner
can find it. Valid for at most 10 minutes. Single use. Bound to person, program, scopes, resource
and the creating session. Held only as a keyed hash, in memory.

## Exchange

`POST /oauth/token` with `grant_type=urn:semantic-workbench:grant-type:setup`, `setup_credential`,
`client_id`, `resource`. Success and failure answers are those of `oauth-endpoints.md`. The
credential is spent by the first presentation. The connection created is the same record as in the
browser flow; its `endReason` vocabulary is the same.

## Never in

Audit records, logs, metric labels, address bars, tool arguments, document content, error messages,
state files (the hash is in memory only and the connection record does not hold it). Audit records
say "setup credential created" and "exchanged" with the connection id.

## The bridge (`scripts/mcp-stdio.ts`, from 006)

Added arguments, all optional; local mode behaviour is unchanged:

| Input | Meaning |
| --- | --- |
| `SW_SERVER_URL` | Server address; presence selects server mode |
| `SW_CLIENT_ID` | Registered agent program id |
| `--sign-out` | Remove the local cache after signing out or revoking in the workbench |
| `SW_SETUP_CREDENTIAL` | The credential, read from the environment once and then removed from the process environment |
| `--setup-credential-file <path>` | Alternative: read the credential from a file that only the current user can read |

Behaviour: discover the metadata; exchange the credential if no agent credential file exists;
write `{ server, clientId, accessToken, accessExpiresAt, refreshToken }` to
`<config folder>/semantic-workbench/connections/<hash of server address>.json`, owner-only (mode
0600 in a 0700 directory, or an access list limited to the user on Windows), refusing to run if the restriction cannot
be set; forward each stdio message to `POST /api/mcp` with the bearer; refresh before expiry and
when a call answers 401 once; when refresh answers `invalid_grant`, delete the file and answer every
call with an error that says to create a new setup credential. It never prints a credential or a
token and never writes one to standard error.
