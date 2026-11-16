# Data Model: Operation Boundary

Types are described by what they hold, not by implementation. Field names are those the code and the
checked-in inventory use.

## Caller

The authenticated party of one operation. Created only by `mintCaller`; every other value is refused.

| Field | Meaning |
| --- | --- |
| `principal` | The resolved `Principal` (person, application client or local) with its matched grants |
| `origin` | `http`, `mcp` or `acp` |
| `sourceIp` | Direct peer address, as policies compare it |
| `session` | Reference to the session that owns the person's delegated credentials; absent for clients and local mode |
| `connection` | Opaque connection id (at most 64 characters of `A-Z a-z 0-9 _ -`), absent for HTTP |
| `scope` | Optional list of allowed effects (see Effect); absent means no narrowing |

## Operation call

| Field | Meaning |
| --- | --- |
| `caller` | A minted caller |
| `request` | The request: the network request for HTTP, a twin request for tools |
| `operation` | Inventory id the call claims (twins only); the matched row must be its row |
| `tool` | The tool name written to the audit; must equal an inventory id |
| `outcome` | Optional classifier `(response) -> ok | refused | failed | degraded` |

Result: the `Response`, and the request id used for the audit record.

## Protocol call record

For calls that are not operations (discovery, listing, resource, prompt, subscription open and
close, denial): `caller`, `method` from a fixed list, `decision`, optional `reason`, `outcome`. One
audit record per call.

## Inventory entry (`policies/operation-inventory.json`)

One per route row, keyed by the row's `path` string (for example `POST /api/projects/:slug/git/commit`).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable operation id, lowercase dotted (`git.commit`); unique; the only value allowed as an audit `tool` |
| `service` | string | The module that owns the behaviour (`projects/scm`, `projects/workspace`, `auth/access-admin`) |
| `action` | Action | Must equal the row's action |
| `clientAction` | `agentRead` or absent | Must equal the row's client action |
| `targets` | `workspace`, `project`, `file`, `path`, `body` or `handler` | How the concrete target is known: from the path, the body, or only inside the handler |
| `handlerChecks` | string[] | Names from the check vocabulary the handler runs |
| `input.query` | string[] | Query keys the handler reads |
| `input.body` | string[] | Body fields the handler reads |
| `limits.request` | constant name or `none` | The byte limit constant that bounds the body |
| `limits.response` | `bounded`, `paged`, `binary` or `stream` | How the answer is bounded |
| `limits.work` | `light`, `scan`, `git`, `network` | Cost class, input to 006's concurrency limits |
| `effects` | Effect[] | What the operation can do; the connection scope is checked against it |
| `dispatch` | `twin` or `{ no: reason }` | Whether a twin may be dispatched; reasons: `public`, `stream`, `page`, `redirect`, `browser-only` |
| `outcomeClassifier` | string or absent | Name of a classifier for a 2xx body that reports failure |
| `exposure.increment` | enum | `local-edit`, `team-sign-in`, `workspace-scm`, `resources-prompts`, `administration`, `later`, `never` |
| `exposure.reason` | string | Required for `never`, `later` and any `dispatch: { no }` |

### Vocabularies

- **Effect**: `read`, `localWrite`, `commit`, `remote`, `publish`, `administration`, `destroy`,
  `credential`.
- **Handler check**: `authorizeWrite`, `authorizeGitPaths`, `authorizeGitPush`,
  `authorizeRepository`, `authorizeCheckout`, `authorizePublish`, `creationDomain`,
  `remoteAddress`, `trashTarget`, `bodyTargets`. Each names one function or one step of
  `operation-boundary.ts`; each must be exercised by a parity case.
- **Origin**: `http`, `mcp`, `acp`.
- **Protocol method** (audit `method`): `discover`, `tools/list`, `tools/call`, `resources/list`,
  `resources/read`, `resources/subscribe`, `prompts/list`, `prompts/get`, `subscriptions/listen`.
  Feature 006 may extend the list by changing it here.

## Browser capability (same file, `browserCapabilities`)

| Field | Meaning |
| --- | --- |
| `id` | Stable id (`validation.shacl`) |
| `summary` | What it does in the browser |
| `status` | `needs-shared-implementation` or `browser-only-by-design` |
| `reason` | Why it is not an operation yet |
| `increment` | The increment that adds it, or `never` with a reason |

## Audit record (extended)

Existing fields are unchanged (`type`, `at`, `prev`, `requestId`, `principal`, `action`, `resource`,
`decision`, `rules`, `reason`, `outcome`, `snapshot`, `version`, `suppressed`). New optional fields:

| Field | Type | Notes |
| --- | --- | --- |
| `origin` | `mcp` or `acp` | Not written for `http`; absence means HTTP |
| `tool` | inventory id | Never an argument or a path |
| `method` | protocol method | For protocol-call records |
| `connection` | opaque id | Names a connection, never a person; the principal already does |

## Replay sample

| Part | Contents | Bound |
| --- | --- | --- |
| Configured cases | `policies/matrix-cases.json` times matrix principals | fixed |
| Stratum A | newest replayable records that are not MCP or ACP reads | 1,000 (`MAX_AUDIT_SNAPSHOTS`) |
| Stratum B | newest replayable MCP and ACP reads, one per (identity snapshot, action, resource attributes) | 500 (`MAX_READ_SNAPSHOTS`) |

## Connection scope

A list of Effect values. The static effects of an operation must all be in the list; a handler may
require one more at run time (`requireEffect`). Absent scope: no narrowing.
