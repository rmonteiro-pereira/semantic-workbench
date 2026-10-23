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
| `suppressed` | number? | refusals of the same kind from the same client address left out of the log since the previous record |
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

Refusals that name nobody (a request without a session to a protected route, `reason:
sign-in-required`; a refused bearer token; a failed sign-in) are recorded for the first 20 of each
kind per source address, then once a minute per source address and kind, so an unauthenticated
loop cannot fill the data volume. The next record admitted for that address and kind carries
`suppressed: n`, the number of refusals left out since the previous one, so the volume is not
lost. Requests over the per-address rate limit (HTTP 429) are not
audited. A refusal of a known principal is always recorded.

The sign-in record is durable before a session is created. If that audit write fails, the
request returns 503 and creates no session file. Session removal continues even when its
`sessionEnded` hook fails; the failure is logged so one record cannot stop expiry of the rest.

When an audit write fails after an operation already ran (an allowed write, or the `adminChange`
record of a committed administration change), the operation stands and one JSON line goes to
stderr: `{"type":"audit-failure", at, requestId, action, version?, reason}`, where `version` is the
administration commit.

Reading records (`GET /api/audit` and its export) is scoped per reader. An Admin reads every
record. A Steward reads the records of the projects they are allowed `readAudit` on, minus the
records whose `resource.path` they may not `read`: a restricted path stays hidden from a Steward
who is not listed on it, because the record names the file and who opened it. Records without a
path are kept.
