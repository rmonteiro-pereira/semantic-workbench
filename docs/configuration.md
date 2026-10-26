# Configuration

The server reads its environment at startup. Changes require a restart unless they are Admin
settings explicitly applied at runtime. `src/server/config.ts` and
`src/server/observability/settings.ts` implement the checks described here. They report invalid
variable names without printing secret values.

Local mode needs no identity configuration. Server mode requires a valid provider setup, a
public origin, a session key and bootstrap Admins. [Server operation](server-mode.md) explains
sign-in, grants, personal working copies and operational behavior.

## Set variables and start

POSIX shell, serving a built local frontend:

```sh
bun run build
DATA_DIR=/path/to/workbench-data SW_SERVE_STATIC=1 bun src/server/index.ts
```

PowerShell:

```powershell
bun run build
$env:DATA_DIR = "C:\workbench-data"
$env:SW_SERVE_STATIC = "1"
bun src/server/index.ts
```

For shared-server startup, use
[the complete required-variable example](server-mode.md#start-a-server).
To load a deliberately selected environment file with Bun:

```sh
bun --env-file .env.server src/server/index.ts
```

`.env.server.example` is the loopback Keycloak development profile. Copy it only for that profile,
generate its session key before startup, and never reuse its credentials on a production target.
Compose loads the selected environment file through its service configuration. Keep real secrets
out of the repository and use the deployment's secret store.

## Common runtime settings

| Variable | Default and purpose |
| --- | --- |
| `SW_MODE` | `local`; accepts `local` or `server` |
| `SW_HOST` | `127.0.0.1`; local mode accepts only a loopback host |
| `SW_PORT` | `4310`; whole number from 1 to 65535 |
| `DATA_DIR` | `data`; root for definitions and durable workspace state |
| `SW_CACHE_DIR` | Unset; keeps `cache.sqlite` in the data root |
| `SW_BRAND_DIR` | Unset; uses the shipped brand bundle |
| `SW_SERVE_STATIC` | Only `1` enables local built-frontend serving |
| `SW_IN_CONTAINER` | Only `1` enables container-specific startup guidance |
| `SW_VERSION` | Unset; optional build version reported by health |
| `SW_COMMIT` | Unset; optional build revision reported by health |
| `CONTAINER_APP_REVISION` | Platform-provided revision identity, if present |
| `SW_LOG_LEVEL` | `info`; debug/info/warn/error/silent, case-insensitive |

Server mode always serves `dist/`, regardless of `SW_SERVE_STATIC`. Development Vite remains a
separate frontend and serves its own public assets. Local mode rejects a non-loopback bind;
changing only `SW_HOST` does not turn it into a safely authenticated network service.

A configured brand directory must exist and be readable. Missing or invalid individual bundle
files retain defaults; an unusable configured directory refuses startup. See
[brand format and limits](theme.md#white-labelling).

`SW_CACHE_DIR` names a folder, not a database filename. The index becomes
`<SW_CACHE_DIR>/cache.sqlite`; without it, the path is `<DATA_DIR>/cache.sqlite`. Use local disk
for this rebuildable index when the durable data root is a network share.

## Required server identity settings

| Variable | Requirement |
| --- | --- |
| `SW_PUBLIC_URL` | External HTTPS origin, without path/query/fragment |
| `SW_OIDC_ISSUER` | Provider issuer; HTTPS outside loopback development |
| `SW_OIDC_CLIENT_ID` | Workbench application/client ID |
| `SW_SESSION_KEY` | 32 random bytes encoded as base64 |
| `SW_BOOTSTRAP_ADMINS` | Nonempty comma-separated verified addresses or stable IDs |

Generate a session key once and retain it securely:

```sh
openssl rand -base64 32
```

PowerShell without OpenSSL:

```powershell
$bytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $random.GetBytes($bytes)
    $env:SW_SESSION_KEY = [Convert]::ToBase64String($bytes)
} finally {
    $random.Dispose()
}
```

Persist the generated value in the approved secret store; the environment assignment above lasts
only for that shell and its children. Repeated-byte or malformed keys are refused. Rotating the
key ends prior sessions and invalidates in-flight sign-ins. The server logs and removes session
records it cannot decrypt; people must sign in again.
Do not regenerate a key on every ordinary restart.

A non-loopback HTTP public URL is refused. A loopback HTTP public URL is a development-only
exception with different cookie flags. An HTTP issuer is allowed only when both issuer and public
origin are loopback. Entra accepts only approved Microsoft login hosts without a port, or the
explicit loopback mock case. Use the tenant's v2 issuer and follow
[the App Registration setup](../deploy/README.md#entra-app-registration).

### Choose one client credential

Configure exactly one mechanism:

- `SW_OIDC_CLIENT_SECRET`: the provider's confidential-client secret.
- `SW_OIDC_CLIENT_CERTIFICATE_KEY` plus `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT`: Entra certificate
  credentials. The key is PEM content, not a filename; the thumbprint is SHA-256 hex (64 characters,
  preferred) or SHA-1 hex (40), with optional colon separators.
- `SW_OIDC_CLIENT_ASSERTION`: `managed-identity` for a configured platform federation, or a private
  key file path for supported Keycloak/generic assertions. A bare key path is refused for Entra;
  use its certificate pair or managed-identity mechanism.

Certificate pairs are Entra-only. Supplying multiple mechanisms, a missing pair value or an
invalid key/thumbprint refuses startup. Azure platform assertions depend on the provider's
federated credential and the platform identity endpoint; the string alone does not configure them.

### Provider and directory options

| Variable | Default and meaning |
| --- | --- |
| `SW_OIDC_PROVIDER` | `generic`; `entra`, `keycloak` or `generic` |
| `SW_ENTRA_TENANT_ID` | Required only for Entra; accepted tenant identity |
| `SW_OIDC_SCOPES` | Default OIDC scopes, plus the workbench API scope for Entra |
| `SW_GROUP_CLAIM` | `groups`; group IDs for Entra, names/paths for Keycloak |
| `SW_GROUP_OVERAGE` | `directory`; accepts `directory` or `off` |
| `SW_GRAPH_URL` | `https://graph.microsoft.com`; permitted directory endpoint |
| `SW_API_AUDIENCE` | Unset/empty; refuses all agent bearer tokens |
| `SW_TRUSTED_PROXY_HOPS` | `0`; whole number from 0 to 5 |

Default OIDC scopes are `openid profile email offline_access`. Entra adds
`api://<client ID>/access_as_user` so its access token can support on-behalf-of exchange.
The provider setting chooses both claim normalization and the library: Entra uses MSAL Node;
Keycloak/generic use `openid-client`.

Graph endpoints are restricted to the configured Microsoft public/national-cloud endpoints:
`graph.microsoft.com`, `graph.microsoft.us`, `dod-graph.microsoft.us` and
`microsoftgraph.chinacloudapi.cn`, over HTTPS. The test stand-in may use loopback HTTP only with a
loopback public origin. A token-bearing directory request is not sent to an arbitrary custom URL.

Agent audiences are comma-separated accepted `aud` values. Configure the actual workbench API
audience and explicit project/domain grants; neither an audience nor provider roles alone grant
access. [Agent setup](agent-runtime.md#agent-clients-in-server-mode) describes the supported
token shape.

Trusted proxy hops affect client identity for rate limiting and anonymous audit throttling. The
server takes that entry from the right of `X-Forwarded-For`; leftmost untrusted additions are not
accepted as the client. Zero ignores the header. Network policy conditions still use the socket
peer. Azure Container Apps ingress normally requires one trusted hop, as checked by preflight.

## Remote Git and server commit identity

| Variable | Default and meaning |
| --- | --- |
| `SW_ADO_OBO` | Enabled for Entra unless exactly `false`; off for other providers |
| `SW_GITHUB_CLIENT_ID` | Optional; must be paired with its secret |
| `SW_GITHUB_CLIENT_SECRET` | Optional; must be paired with its client ID |
| `SW_GITHUB_HOST` | `github.com`; bare host, optional port, not a URL |
| `SW_COMMITTER_NAME` | `Semantic Workbench`; technical server Git committer |
| `SW_COMMITTER_EMAIL` | `workbench@localhost`; technical server Git committer |

Azure DevOps exchange also requires provider consent and `remote.azureDevOpsObo: true` in Admin
settings. GitHub connection requires a configured OAuth/App callback. Remote-host permission is
managed separately in `admin/settings.json`, not inferred from these variables. Server tokens
remain in encrypted sessions and command-scoped askpass environments.

The signed-in person is the author of a server commit. The technical committer is separate and
does not follow a white-label brand. Local mode keeps machine/repository Git identity and helper
configuration rather than using server OAuth settings.

## Logging and telemetry

| Variable | Default and meaning |
| --- | --- |
| `SW_LOG_LEVEL` | `info`; operational stdout level in both modes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Unset; no telemetry export |
| `SW_TRACE_SAMPLE_RATIO` | `0.1` when export is enabled; finite number from 0 to 1 |
| `SW_TELEMETRY_ACTOR_SALT` | Unset; a new pseudonym key is generated each startup |

Local mode never exports telemetry, even if a connection string is present. Server mode loads
exporters only when a nonempty valid connection string enables them. It requires an
`InstrumentationKey` GUID. If an ingestion endpoint is supplied, it must be HTTPS on an allowed
Application Insights host; otherwise the service's supported default applies. Values are not
printed in configuration errors.

Trace sampling is validated/used only when export is enabled. Metrics and logs are not trace
sampled. A configured actor salt makes pseudonyms stable across restarts; use a secret with
appropriate entropy rather than a public identifier. Without it, correlation lasts only for the
current server run. [Server observability](server-mode.md#logging-telemetry-and-outbound-traffic)
explains redaction and the difference between stdout, audit and export.

## Settings that are not environment variables

Admin-managed configuration lives in the versioned `DATA_DIR/admin/` repository:

- Custom role definitions and grants to groups/verified addresses.
- Domains, project access, restricted paths and protected branches.
- Agent client grants and deactivated identities.
- Session idle/absolute lifetime, classification levels and remote-host/credential policy.

Roles are not read from provider app-role claims. Keep `SW_BOOTSTRAP_ADMINS` configured for initial
access and recovery, but use reviewed Admin changes for ordinary grants and settings.

Platform-managed values such as `IDENTITY_ENDPOINT` and `IDENTITY_HEADER` support Azure client
assertions. They are not sample secrets to invent by hand. Internal `SW_GIT_USERNAME`,
`SW_GIT_TOKEN` and `SW_GIT_HOST` are per-command child-process values, not startup credentials.
Exporter usage-reporting switches are set by application code, not required operator settings.

## Container defaults and build identity

The image sets `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1`,
`SW_IN_CONTAINER=1` and `SW_PORT=4310`. Local mode retains loopback binding and host networking.
A network-facing shared server sets `SW_MODE=server`, a public HTTPS origin and the intended host,
commonly `0.0.0.0` behind its configured ingress.

`SW_VERSION`, `SW_COMMIT`, `SW_SOURCE` and `SW_CREATED` are image build arguments/labels where
supported; version/commit are also runtime metadata. The image builder derives revision and
creation details. The current package has no `version`, so default version metadata is `dev`
unless explicitly supplied in the supported build path. Git tags do not silently change that.
Real tag deployment must satisfy the separate package-version and source-revision guards.

`CONTAINER_APP_REVISION` identifies an Azure revision for ownership/handover and telemetry. Without
it, the lease uses version/commit identity or `dev`. This identity is not a license to run multiple
active writers on one data root.

## Development and validation variables

These configure tools rather than normal server behavior:

| Variable | Purpose |
| --- | --- |
| `SW_BASE_URL` | Browser-test frontend URL; default loopback port 5173 |
| `UI_URL` | Legacy browser URL fallback |
| `SW_CONTAINER_PORT` | Container-test base port; default 4310, successor also required |
| `SW_SCREENSHOT_DIR` | Screenshot output for supporting suites |
| `SW_THEME` | `dark` selects dark-mode capture where supported |
| `SW_ONLY` | Capture screen-name substring filter |
| `RESPONSIVE_ONLY` | Focused responsive-check prefix, not a complete gate |
| `RESPONSIVE_MUTATION` | Internal deliberate-fault selector |

Do not carry selectors into a claimed complete validation run. `test:container --port` overrides
its environment base. Delivery pipeline variable groups and their separate build/deploy inputs
are documented in [target setup](../deploy/README.md), not read as application configuration.

## Data layout and upgrades

```text
DATA_DIR/
  projects/       repositories or roots containing declared subprojects
  worktrees/      personal server working copies
  state/          registry, views, drafts, journals, sessions and audit
  admin/          versioned access configuration
  trash/          recoverable deleted content and metadata
  backup/         protected legacy migration copies
  cache.sqlite    rebuildable index unless SW_CACHE_DIR moves it
```

Back up the complete root with the application stopped. Git remotes are not backups of sessions,
drafts, Admin settings, trash or personal view state. Stop before deleting a rebuildable index;
startup recreates it by scanning the files.

On first startup with an old `workbench.sqlite`, migration copies the legacy database and its
WAL/SHM files under `backup/`, reads the copy and writes original document bytes into staged project
folders. Hash verification precedes registration. Old document IDs are mapped through
`state/legacy-ids.json`. The original database is not modified. Git and a usable identity are
required; without them migration waits and reports why.

Moving a local data root to shared-server mode needs access/domain initialization and the
published-checkout checks in
[the deployment guide](../deploy/README.md#moving-a-data-folder-from-local-mode-to-server-mode).
Do not simply expose a local-mode listener to the network.
