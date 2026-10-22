# Audit Log Contract

One JSON object per line in `data/state/audit/YYYY-MM.jsonl` and on stdout (prefixed by nothing;
the line itself has `"type":"audit"`).

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"audit"` | |
| `at` | ISO 8601 UTC | |
| `requestId` | string | also returned as `X-Request-Id` |
| `principal` | `{id, kind, name?, clientId?}` | `local` in local mode |
| `action` | string | action of policy-model.md, or `signIn`, `signOut`, `sessionEnded`, `directoryLookup`, `policyReload`, `adminChange` |
| `resource` | `{type, project?, path?, branch?, metric?, entry?, area?, role?, grant?}` | paths only, never content |
| `decision` | `'allow'\|'deny'` | |
| `rules` | string[] | deciding policy ids |
| `reason` | string? | e.g. `guarded:classification`, `not-readable`, `last-admin`, `no-grant`, `email-unverified` |
| `outcome` | `'ok'\|'failed'\|'refused'\|'degraded'` | result of the operation after an allow |
| `snapshot` | `{grants: [grantId], roles: [roleId], groups, emailMatched: boolean, resourceAttrs}` | for policy dry runs; no names of unreadable items beyond the resource itself |
| `version` | string? | admin repository commit for `adminChange` |
| `prev` | hex | SHA-256 of the previous line in the file |

Never present: tokens, cookies, secrets, document text, diff text, commit messages.

Audited: sign-in (success, failure, and refusal for lack of a grant with `reason: no-grant`), sign-out, session expiry by Admin, every 401/403/404 that
came from a decision, every write of FR-050, approvals and guarded changes, remote operations,
remote and clone changes, Admin changes and rollbacks (custom role created, changed or deleted
with `confirmDeleteInUse`; grant added, changed or removed), agent calls, policy reloads, bootstrap
Admin use. Reads that are allowed are not audited, except agent calls and exports of agent
context.

Authentication uses `signIn`, `signOut`, and `sessionEnded`. A failed directory lookup uses
`directoryLookup`, decision `allow`, outcome `degraded`, and reason `directory-unavailable`.
It carries the enclosing request id during both sign-in and refresh; it does not record a
sign-in refusal when direct grants still permit access. Protocol failures use `tenant-mismatch`,
`attempt-invalid`, `token-invalid`, or `provider-unreachable`; display text is never an audit reason.

The sign-in record is durable before a session is created. If that audit write fails, the
request returns 503 and creates no session file. Session removal continues even when its
`sessionEnded` hook fails; the failure is logged so one record cannot stop expiry of the rest.
