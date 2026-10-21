# Audit Log Contract

One JSON object per line in `data/state/audit/YYYY-MM.jsonl` and on stdout (prefixed by nothing;
the line itself has `"type":"audit"`).

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"audit"` | |
| `at` | ISO 8601 UTC | |
| `requestId` | string | also returned as `X-Request-Id` |
| `principal` | `{id, kind, name?, clientId?}` | `local` in local mode |
| `action` | string | action of policy-model.md, or `signIn`, `signOut`, `sessionEnded`, `policyReload`, `adminChange` |
| `resource` | `{type, project?, path?, branch?, metric?, entry?, area?}` | paths only, never content |
| `decision` | `'allow'\|'deny'` | |
| `rules` | string[] | deciding policy ids |
| `reason` | string? | e.g. `guarded:classification`, `not-readable`, `last-admin` |
| `outcome` | `'ok'\|'failed'\|'refused'` | result of the operation after an allow |
| `snapshot` | `{roles, groups, domains, resourceAttrs}` | for policy dry runs; no names of unreadable items beyond the resource itself |
| `version` | string? | admin repository commit for `adminChange` |
| `prev` | hex | SHA-256 of the previous line in the file |

Never present: tokens, cookies, secrets, document text, diff text, commit messages.

Audited: sign-in (success and failure), sign-out, session expiry by Admin, every 401/403/404 that
came from a decision, every write of FR-050, approvals and guarded changes, remote operations,
remote and clone changes, Admin changes and rollbacks, agent calls, policy reloads, bootstrap
Admin use. Reads that are allowed are not audited, except agent calls and exports of agent
context.
