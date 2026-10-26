# Shared-server operation

Server mode serves one team's definitions behind OpenID Connect sign-in. The server enforces
permissions for every request. Browser capabilities explain available actions; they are not an
authorization boundary. Local mode remains a loopback-only, single-person workspace with an
implicit Admin.

Use [the configuration reference](configuration.md) for environment variables and defaults,
[the Azure setup guide](../deploy/README.md) for infrastructure and pipeline configuration, and
[the acceptance runbook](../deploy/trial-runbook.md) for checks against a real deployment.

## Start a server

Install with `bun install --frozen-lockfile`, then build with `bun run build`. Register the Web
redirect URI `<SW_PUBLIC_URL>/auth/callback`, post-logout URI `<SW_PUBLIC_URL>/auth/signed-out` and
front-channel logout URI `<SW_PUBLIC_URL>/auth/front-channel-logout` with the identity provider.

Supply secrets through the environment or a secret store. This shell example shows the required
shape, not production credentials:

```sh
export SW_MODE=server
export SW_HOST=0.0.0.0
export SW_PUBLIC_URL=https://workbench.example.org
export SW_OIDC_PROVIDER=entra
export SW_OIDC_ISSUER=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0
export SW_ENTRA_TENANT_ID=YOUR-TENANT-ID
export SW_OIDC_CLIENT_ID=YOUR-CLIENT-ID
export SW_OIDC_CLIENT_SECRET=YOUR-SECRET
export SW_SESSION_KEY="$(openssl rand -base64 32)"
export SW_BOOTSTRAP_ADMINS=admin@example.org
export DATA_DIR=/path/to/workbench
bun src/server/index.ts
```

Keep the same session key across restarts. Certificate credentials or managed-identity assertions
can replace the client secret; configure exactly one supported credential mechanism. Never commit
secrets or generate a fresh session key on every production startup.

Startup checks configuration, writable storage, the instance lease, provider discovery and policy
validity before workspace traffic is served. Server mode serves the built `dist/` frontend with
CSP and security headers. A non-loopback HTTP public URL is refused. Loopback HTTP is a development
exception, not a production transport.

## Identity providers

### Microsoft Entra ID

Entra sign-in uses MSAL Node on the server. Configure a single-tenant App Registration, the groups
claim and the supported identity claims. The token cache is per session and remains inside its
encrypted server record. Tenant and issuer restrictions are enforced independently of the UI.

People's roles come from workbench grants, not provider app-role claims. Group grants use Entra
object IDs. Verified-address grants accept a domain-verified e-mail claim or an eligible home-tenant
member identity; guest `#EXT#` identifiers and unverified addresses do not count.

Large group lists can be resolved through Microsoft Graph. Only group IDs named in grants or
restricted paths are checked, in batches of up to twenty. Lookup failure supplies no membership,
shows an explanation and is audited. Directory permissions also support group display names.

Agent clients and Azure DevOps remote access need additional App Registration settings. Follow
[the complete Entra setup](../deploy/README.md#entra-app-registration) rather than treating a basic
browser sign-in as proof of those integrations.

### Keycloak and generic OIDC

Keycloak and generic OIDC use `openid-client`, not MSAL. Keycloak grants match group names or
paths, and e-mail grants require `email_verified=true`. The supplied Keycloak realm and Compose
profile are compatibility/development fixtures. Their passwords and loopback cookie exception
must not be reused for production.

Entra application tokens are the supported server-mode agent credential. Keycloak/generic client
tokens are not accepted as workbench agent clients. See [the agent guide](agent-runtime.md).

## Loopback Keycloak profile

This profile is for development compatibility, not a production identity setup. It needs a
container engine with host networking, free ports 4310/8080 and a data folder writable by UID 1000.
Do not run another local API on 4310 at the same time.

In a POSIX shell, prepare the sample profile and fixture access configuration:

```sh
cp .env.server.example .env.server
mkdir -p .server-workspace/admin
cp tests/fixtures/auth-workspace/admin/*.json .server-workspace/admin/
cp tests/fixtures/auth-workspace/admin-keycloak/grants.json .server-workspace/admin/grants.json
```

Generate a session key using
[the configuration instructions](configuration.md#required-server-identity-settings),
and put that value in `.env.server` before starting. The shell environment alone does not replace
an explicitly blank value in this service's environment file. Prepare `.server-workspace` ownership
for UID 1000, then start the profile:

```sh
docker compose --profile keycloak up --build -d
```

`podman compose` can be used with the corresponding rootless ownership preparation. Keycloak
listens on `http://127.0.0.1:8080`; the workbench is on `http://127.0.0.1:4310`. Startup retries
while realm import finishes. Fixture passwords are `test-<username>`, for example `test-alice`;
use the fixture identities rather than inventing provider roles. See
`tests/fixtures/auth-workspace/README.md` for the identities/grants.

```sh
docker compose --profile keycloak down
```

The profile uses `.server-workspace`, not the automated checks' disposable roots. Keep it separate
from real definitions and never reuse its credentials outside loopback.

## Sign-in, sessions and sign-out

An unauthenticated page request redirects directly to the provider and returns to the requested
path. There is no application-owned login form. An anonymous API request receives 401.
A signed-in person with no grant, or a deactivated identity, receives the identity-only
**No access** page; workspace API requests receive 403, including `/api/me`.

**Signed out** stays signed out until **Sign in again** is selected. Sign-in failures display a
safe reason with a retry action. Invalid attempts/tokens or tenant mismatches receive 400;
provider unavailability receives 503. Health probes, minimal authentication pages and the
sanitized known brand files are public. Workspace pages, assets and API data remain gated.

Sessions use opaque 256-bit identifiers in an HttpOnly, SameSite=Lax cookie. HTTPS uses
`__Host-sw-session` with Secure and Path=/. Tokens remain encrypted with AES-256-GCM in
`state/sessions/`; separate keys are derived for encryption, sign-in attempts and provider indexes.
A loopback HTTP development session drops Secure and the `__Host-` prefix.

Default lifetimes are eight hours idle and twenty-four hours absolute. Admin settings can change
them. Last-seen persistence is limited to once per minute, so a restart can shorten the idle
window by up to sixty seconds. Refresh rechecks identity, groups and grants. A refused refresh
ends the session; a provider outage returns 503 without destroying an otherwise valid session.

Changing `SW_SESSION_KEY` ends old sessions and in-flight attempts. Unreadable session records
are discarded with a `session-unreadable` log entry instead of preventing startup.

Sign-in attempts have ten-minute signed cookies and a persistent replay ledger. Sign-out, expiry,
Admin session termination and provider-initiated logout close affected live-update streams.
Front-channel logout uses the provider session ID and rejects a mismatching issuer. It is not a
password or browser-token collection endpoint.

Cookie-authenticated writes require `X-SW-Request: 1` and an Origin matching `SW_PUBLIC_URL`.
Script-free sign-out forms use a per-session CSRF token instead.

## Roles, grants and readable views

A grant assigns a built-in or custom role to a group or verified e-mail address at workspace,
domain or project scope. E-mail matching is case-insensitive. `SW_BOOTSTRAP_ADMINS` supplies the
first Admin and break-glass identities; keep it configured using verified addresses or stable
identity IDs. Provider app roles do not bypass grant matching.

A normal workspace-scoped grant covers projects assigned to domains, not unassigned projects.
An unassigned project needs an explicit project grant; built-in Admin access is the exception.
Domain grants cover only their named domains. This keeps an unassigned project from silently
becoming readable through a broad workspace grant.

| Role | Actions within its permitted scope |
| --- | --- |
| Viewer | Read definitions/history, own view settings and project export |
| Editor | Viewer actions plus file edits, imports, drafts and project Git |
| Steward | Editor plus approvals, protected edits, publishing and project creation/rename |
| Admin | Administration, all projects, purge/clear, remotes, clone and registration |

Custom roles select actions and conditions; they cannot contain the `admin` action. Scope and
attribute policies can further restrict the role. The server checks crafted API requests even
when a control is disabled in the browser.

Hidden targets receive the same 404 shape as missing resources. A readable target without write
permission receives 403. Moves require access at both ends. Project listings, search, metrics,
lineage, exports, agent context and events are filtered before exposing hidden content. A
restricted-path count can say how many files cannot be opened without naming them. References
into hidden files remain unresolved.

Git history filters unreadable paths, but a visible commit message can still mention sensitive
information; keep secrets out of commit messages. Case variants of paths are refused so a
case-insensitive storage volume cannot bypass path rules.

Drafts, grouping state and suggestion dismissals are personal. Drafts have size/count limits;
trash listings and restores check original paths and matching restore permissions. Administration
changes reload affected browser sessions through access events. Non-Admins receive only limited
mode/readiness/Git information from `/api/status`.

## Personal working copies and publishing

The published state lives under `DATA_DIR/projects/<repo>/`, detached at the repository's default
branch. Viewers read it. Someone allowed to edit initially reads it too; their first permitted
write creates a personal Git worktree under `worktrees/<userKey>/<repo>/` on `work/<handle>`.
Read-only requests never create a copy. An unborn repository needs Git 2.42 or newer for orphan
worktrees.

Branches, staging, uncommitted changes, drafts and view state are isolated per person. Another
person's personal branch cannot be selected even when not currently held by a worktree. Other
branches show their holder and cannot be checked out by two copies. Repository Git operations
are serialized across its worktrees.

| Action | Effect |
| --- | --- |
| Commit | Commits in your copy with your identity as author |
| Pull from default | Locally merges published changes into your branch |
| Publish to default | Steward/Admin fast-forward of the shared default branch |
| Fetch/Pull/Sync/Push | Explicit remote action from your copy with your credential |
| Push default | Sends already published state to the remote; does not publish first |

Publishing checks the exact proposed commits, requires a fast-forward and uses compare-and-swap.
If another publish won the race, pull from the default branch first. A fetch can follow a remote
default branch only when the caller may publish and the content guards accept it. Otherwise the
fetch succeeds without moving the published state. Diverged histories are not silently joined.

Publishing never pushes by itself. Pulling from the local default branch never contacts a remote.
Protected branches require publish permission. An interrupted publication is repaired at startup.
Copies idle for thirty minutes stop being watched but retain their files, index and drafts.

Deleting a project can archive each person's unpublished work and drafts in the trash entry.
Copy-local file deletions restore to the same owner's copy. Admin repository manifests are also
written into the Admin's copy and need publication to reach readers.

## Governed content

Content guards apply to direct saves, item edits, imports, multi-file operations, pull/revert,
branch changes, moves and trash restore/undo. A write target is authorized before mutation; guards
compare the before/after content under the appropriate repository lock.

- Approval and deprecation require the matching permission. A person cannot approve or deprecate
  their own metric.
- Editing an approved metric beyond its description without approval permission demotes its
  stored status to proposed. The response identifies demoted content.
- Changing ODCS classification, critical-data markers, team/roles or a protected property requires
  `editGuarded` permission. Built-in Steward/Admin roles include it; appropriately scoped custom
  roles can grant it too. The default protected threshold is confidential, ordered as
  public < internal < confidential < restricted; configured aliases apply.
- Pull, revert, restore and similar incoming-content operations are judged as the caller's writes.
  They refuse unauthorized guarded changes instead of silently demoting imported content.
- A refusal rejects the whole operation before workspace bytes change. The response identifies
  guarded pointers only in readable files.

The metric detail explains disabled Approve/Deprecate actions. Deprecation uses a multiline reason
with actions that remain together on phone screens. An owner who cannot be matched to a known
eligible identity is shown as unverified. Owner choices are filtered to people who may read the
project. Property editors retain read-only classification explanations where needed.

## Remote Git

Server mode uses HTTPS and the configured allowed-host list. Only Admins set remotes, clone or
register repository projects. A push URL must remain on the same allowed host. Canonical host and
path checks run before commands; helper transports and ambiguous host syntax are refused.

- **Azure DevOps:** Entra on-behalf-of exchange supplies a personal token when the App Registration
  has the delegated permission and both environment/admin policy enable it. A missing exchange
  returns 428 and offers sign-in again.
- **GitHub:** **Connected accounts → Connect GitHub** establishes session-scoped consent. A remote
  command can prompt for that connection and resume afterward. Register the GitHub callback URI.
- **Other allowed hosts:** public remotes are reached without an application-supplied credential.

Tokens stay in the encrypted session. Git receives a credential for one command through askpass
and child-process environment, never a saved password, global helper or `.git/config` entry.
Fetch uses the credential; local merge/filter steps do not receive it. Partial-clone blob fetches
use the same command-scoped credential. Tokens and secret-bearing output are redacted.

This differs from local mode, which uses the machine's own Git helper/SSH configuration.

## Administration and audit

**Admin** opens a full page while retaining the workspace state. Browser Back/reload follows
`#/admin/<section>`. Sections cover projects/access, grants, roles, users/groups, policies, audit,
settings and access checks. Editors replace their list in place; dialogs are used for review and
confirmation rather than nesting whole administration screens.

Access changes require a **Dry run** followed by **Confirm**. The review is bound to the proposal
and current version. Editing the proposal invalidates it; a stale version must be reopened and
reviewed again. The server replays configured matrix cases, recent audit snapshots and known
identities without changing live policies during preview.

Each accepted change makes one Admin-authored commit in `DATA_DIR/admin/`. History compares
versions. Rollback is a new reviewed commit, not a history rewrite. Last-Admin and bootstrap
checks refuse changes that could lock out administration. Bootstrap identities cannot be
deactivated. User deactivation/reactivation ends their existing sessions.

Raw Cedar rules must validate, including disabled rules. Forbid rules cannot cover the Admin
action. Time-window policies use UTC; network policies use the direct socket peer, not forwarded
client headers. Behind ingress, that peer is ingress rather than the end user.

Allowed writes and refused requests are recorded in monthly hash-chained audit files under
`state/audit/`, without credentials or document content. Allowed agent reads are audited too.
Retention is 400 days. Anonymous denial records are throttled and carry suppressed counts.
Audit export is filtered to the caller's readable scope.

```sh
bun run audit:verify /path/to/data/state/audit
```

For external anchors, truncation detection, failure behavior and limits, see
[audit tamper evidence](audit-tamper-evidence.md).

## Logging, telemetry and outbound traffic

Operational logging is separate from the security audit. Server mode writes JSON lines to stdout;
local mode writes readable lines. `SW_LOG_LEVEL` selects the level. Request IDs link API responses,
operational records and audit entries. Actors are pseudonyms, not names or e-mail addresses.
Free-text stdout redaction is best effort; the telemetry export field allow-list is stricter.

Telemetry is off by default and never exports in local mode. In server mode, a valid
`APPLICATIONINSIGHTS_CONNECTION_STRING` enables Azure Monitor exporters through OpenTelemetry.
The SDK/exporter pipeline is loaded only when enabled. Trace sampling defaults to 0.1; metrics and
logs are not sampled. Exporter usage reporting is disabled. Export is asynchronous, and shutdown
allows at most five seconds for a final flush.

Spans cover HTTP, Git subcommands, scans, validation, access reload and authentication. Exported
fields exclude raw paths, document text, credentials, addresses and Git output. Browser errors,
unhandled rejections, page load timing and slow operations go only to the workbench API, never
directly to a third-party browser collector. Reports are bounded, schema-checked and rate-limited;
clicks, keystrokes and document content are not collected. `/healthz` reports whether telemetry is
enabled without disclosing the ingestion destination.

Quoted-text scrubbing cannot reliably recognize unquoted sensitive text inside arbitrary error
messages. The Azure exporter is a beta package; automated checks use in-memory exporters, not a
real Azure service. No alerting, general usage analytics or automatic instrumentation is claimed.

Outbound traffic is limited to configured identity/directory integrations, managed-identity token
assertions, explicit Git/GitHub/Azure DevOps operations, and enabled telemetry export. Identity
refresh and telemetry are background-capable; remote repository synchronization is not automatic.
No database source is contacted and no previewed SQL is executed.

## Operating limits and recovery

Run exactly one active application replica per data root. Git ownership, administration locks,
dry-run receipts and policy caches are not a horizontally coordinated service. A same-revision
second instance remains not ready. A different revision can report handover readiness while
workspace traffic receives 503 and Retry-After until the old lease is released or expires.
Recovery and scanning occur only after ownership is acquired. Clocks on shared storage must be
synchronized.

Use `/healthz` for liveness/build identity and `/readyz` for ownership, recovery and scan readiness.
A handover state is not proof that workspace requests are already being served. Follow the target
runbook for readiness, smoke tests and rollback.

Behind a trusted reverse proxy, set `SW_TRUSTED_PROXY_HOPS` to the actual trusted hop count.
This affects rate-limit source identity, not network-policy peer matching. Excess requests receive
429 and Retry-After. Unexpected server errors return a generic 500 with a request ID; redacted
causes remain in server logs. Hidden resources retain 404 rather than leaking their existence.

Back up the complete data root while the app is stopped. Project Git remotes do not include
personal drafts, Admin/session state, grouping state or trash. Stop the application before
removing a disposable SQLite cache, and expect it to rescan on startup. Keep the cache on local
disk when the durable data root is on a share. Scale vertically first; horizontal scale requires
repository partitioning or coordinated leases/storage and shared session handling.
