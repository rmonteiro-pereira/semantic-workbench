# Data Model: Person Sign-In for Agent Connections

Types are described by what they hold. Field names are those the code and the checked-in schema
will use. Nothing here names MCP except the resource address, so another transport can reuse the
connection.

## Program registration (administration repository, `programs.json`)

| Field | Meaning and limit |
| --- | --- |
| `formatVersion` | `1` |
| `programs[]` | At most 50 entries |
| `clientId` | Chosen by the Admin. 3 to 64 characters of `A-Z a-z 0-9 . _ -`. Unique, compared case-sensitively |
| `name` | 1 to 80 characters, shown on the consent page |
| `description` | 0 to 500 characters, shown on the consent page |
| `redirectUris[]` | 1 to 5 exact addresses (FR-011). Each at most 512 characters. No fragment, wildcard or credentials |
| `scopes[]` | Subset of the offered scope vocabulary the program may request; never contains `administration` in this release |
| `setupNote` | 0 to 1,000 characters of plain text shown on the consent page and the setup-credential page |

There is no secret field. A document with an unknown field is refused.

## Scope

A name from `read, validate, edit, commit, remote, publish, administration`. The mapping to
operation effects is a constant table (research R8). A scope set is stored as a sorted list without
duplicates.

## Pending request (memory only)

| Field | Meaning |
| --- | --- |
| `id` | 16 random bytes, base64url; also carried in the consent form |
| `clientId`, `redirectUri`, `scopes`, `state`, `codeChallenge`, `resource` | From the authorization request after validation |
| `sessionReference` | Hash of the session id that opened it; a decision from another session is refused |
| `expiresAt` | 10 minutes after creation (the existing sign-in attempt lifetime) |

At most 1,000 pending requests are held; the oldest expire first. A decision consumes the entry.

## Authorization code and setup credential (memory only)

| Field | Meaning |
| --- | --- |
| `hash` | Keyed hash of the value shown to the program or person |
| `kind` | `code` or `setup` |
| `clientId`, `redirectUri` (code only), `scopes`, `resource` | Binding |
| `codeChallenge` | Code only |
| `person` | Principal id |
| `sessionReference` | Hash of the owning session id |
| `expiresAt` | 60 seconds for a code, 10 minutes for a setup credential |
| `spent` | Set on first presentation; a spent code stays recorded until it would have expired, so a second use is recognised |

## Connection (durable, `state/connections/<id>.json`)

| Field | Meaning |
| --- | --- |
| `formatVersion` | `1` |
| `id` | 16 random bytes, base64url (22 characters). This is the id audit records and lists use |
| `person` | Principal id |
| `clientId` | Program registered at the time |
| `scopes` | Granted scope set |
| `resource` | The resource address the tokens are bound to |
| `sessionReference` | Hash of the owning session id |
| `createdAt`, `lastUsedAt` | Times. `lastUsedAt` is written at most once a minute |
| `access` | Keyed hash and expiry of the current access token |
| `refresh` | Keyed hash of the current refresh token |
| `retiredRefresh[]` | At most 8 keyed hashes of retired refresh tokens, newest first |
| `generation` | Number of refreshes so far |
| `state` | `active` or `ended` |
| `endedAt`, `endReason` | Set when ended. Reasons: `session-ended`, `signed-out`, `expired`, `deactivated`, `no-access`, `revoked-by-person`, `revoked-by-admin`, `program-removed`, `scope-removed`, `replay`, `code-reuse` |

No value in this record can be used as a credential. On end, the token hashes are removed and the
record stays for 7 days so the lists can show it.

## Connection view (what lists return)

`id`, `clientId`, program `name` at the time, `origin` (`mcp` or `acp`), `scopes`, `createdAt`, `lastUsedAt`, `state`,
`endReason`, and for Admins the person's display name. Never a hash, a session reference or a token.

## Caller additions

The caller of feature 010 already carries `principal`, `origin`, `connection`, `scope` and
`session`. Connections supply their stored origin (`mcp` or `acp`), `connection` = the connection id, `scope` = the
effects of the scope set, and `session` = the live session found by reference. No field is added to
the caller.

## Audit record additions

None to the schema of feature 010. New `action` values for connection events are listed in
`contracts/connection-management.md`; the record's `connection` field holds the id.

## State transitions

```text
(browser) pending request --allow--> code --exchange--> connection[active]
(browser) setup page -------create-> setup credential --exchange--> connection[active]
connection[active] --refresh--> connection[active] (generation + 1)
connection[active] --session ends / person revokes / admin revokes / program removed / replay--> connection[ended]
```
