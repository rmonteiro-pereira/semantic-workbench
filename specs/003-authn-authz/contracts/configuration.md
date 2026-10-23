# Configuration Contract (environment variables)

| Variable | Mode | Required | Meaning |
| --- | --- | --- | --- |
| `SW_MODE` | both | no (`local`) | `local` or `server` |
| `DATA_DIR` | both | no (`data/`) | data root; `/data` in the container |
| `SW_CACHE_DIR` | both | no (data root) | SQLite cache folder; container local disk recommended |
| `SW_HOST`, `SW_PORT` | both | no (`127.0.0.1`, 4310) | local mode refuses non-loopback `SW_HOST` |
| `SW_PUBLIC_URL` | server | yes | external HTTPS origin, e.g. `https://workbench.example.org` |
| `SW_OIDC_ISSUER` | server | yes | provider issuer URL (Entra: `https://login.microsoftonline.com/<tid>/v2.0`); an `http://` issuer is refused unless `SW_PUBLIC_URL` is a loopback URL (mock OpenID provider and Keycloak compatibility only, FR-141); for Entra it must be `https://<login host>/<SW_ENTRA_TENANT_ID>/v2.0` without a port on `login.microsoftonline.com`, `login.microsoftonline.us`, `login.chinacloudapi.cn` or `login.partner.microsoftonline.cn`, or a loopback host only when `SW_PUBLIC_URL` is loopback (the mock provider), else start-up stops |
| `SW_OIDC_CLIENT_ID` | server | yes | the App Registration's application (client) ID |
| `SW_OIDC_CLIENT_CERTIFICATE_KEY` | server/entra | one of (preferred for Entra) | PEM private key of the App Registration's certificate (`-----BEGIN PRIVATE KEY-----`); Key Vault reference; set together with the thumbprint |
| `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT` | server/entra | with the key | the certificate's thumbprint in hex, SHA-256 (64 characters, preferred) or SHA-1 (40); colons are ignored; Key Vault reference or plain value |
| `SW_OIDC_CLIENT_SECRET` | server | one of | secret reference |
| `SW_OIDC_CLIENT_ASSERTION` | server | one of | `managed-identity` (Entra federated credential of `id-sw-app`; uses the platform identity endpoint; passed to MSAL as its client assertion) or, for Keycloak and generic providers only, a private key path |
| `SW_OIDC_SCOPES` | server | no | default `openid profile email offline_access` (+ `api://<client>/access_as_user` for Entra) |
| `SW_OIDC_PROVIDER` | server | no (`generic`) | `entra`, `keycloak`, `generic`: the claim mapping preset and the sign-in library (`entra` signs in through MSAL Node; the others through `openid-client`) |
| `SW_ENTRA_TENANT_ID` | server/entra | yes for Entra | `tid` allow-list |
| `SW_GROUP_CLAIM` | server | no (`groups`) | claim holding group ids (Entra) or names/paths (Keycloak) matched against group grants |
| `SW_GROUP_OVERAGE` | server/entra | no (`directory`) | `directory` (Graph checkMemberGroups) or `off` |
| `SW_GRAPH_URL` | server/entra | no (`https://graph.microsoft.com`) | Microsoft Graph base URL for overage resolution and group display-name lookups (an app-only token is sent there); accepted values: the Microsoft Graph endpoints of the public and national clouds, or a loopback `http://` URL when `SW_PUBLIC_URL` is loopback (the mock OpenID provider's stand-in in tests); anything else refuses start-up |
| `SW_API_AUDIENCE` | server | yes for agents | comma-separated accepted `aud` values of bearer tokens; for Entra the API app's client id (v2 access tokens) |
| `SW_SESSION_KEY` | server | yes | 32 bytes base64; encrypts sessions. Keep it across restarts: a different key ends every session and in-flight sign-in (unreadable session files are deleted and logged as `session-unreadable`) |
| `SW_BOOTSTRAP_ADMINS` | server | yes (≥ 1) | comma-separated e-mail addresses (matched case-insensitively against the verified address only) or stable ids (`tid:oid`) that always hold Admin (break-glass) |
| `SW_TRUSTED_PROXY_HOPS` | server | no (`0`) | whole number from 0 to 5: how many reverse proxies in front of the workbench append to `X-Forwarded-For`. Rate limits and anonymous audit throttling then use the entry that many places from the right (parsed as an address; IPv6 counts as its /64); entries to its left are ignored because the client writes them. `0` uses the socket peer and ignores the header. Network policy rules still compare the socket peer. Anything else refuses start-up. Azure Container Apps ingress is one proxy, so deployment sets `1` and the preflight checks it |
| `SW_COMMITTER_NAME`, `SW_COMMITTER_EMAIL` | server | no (`Semantic Workbench`, `workbench@localhost`) | committer identity of server commits; the author is always the signed-in person |
| `SW_GITHUB_HOST`, `SW_GITHUB_CLIENT_ID`, `SW_GITHUB_CLIENT_SECRET` | server | no (host `github.com`) | GitHub OAuth app or GitHub App for **Connect GitHub** user tokens; client id and secret together or neither; the host is a bare host name (`github.com` or a GitHub Enterprise host, with an optional port), never a URL; callback `<SW_PUBLIC_URL>/auth/github/callback` |
| `SW_ADO_OBO` | server/entra | no (`true` with `SW_OIDC_PROVIDER=entra`, otherwise always off) | Azure DevOps on-behalf-of; `false` turns it off. It also needs `remote.azureDevOpsObo: true` in `admin/settings.json` |
| `SW_LOG_LEVEL` | both | no (`info`) | `debug`, `info`, `warn`, `error` or `silent`; anything else refuses start-up. Server mode writes JSON lines to stdout, local mode readable lines (added in 0.5.0, see `specs/005-observability`) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | server | no (telemetry off) | Application Insights connection string, a Key Vault reference. Needs `InstrumentationKey=<guid>`; an `IngestionEndpoint` must be an `https://` Application Insights host or start-up is refused (the value is never printed). Ignored in local mode, which never exports telemetry |
| `SW_TRACE_SAMPLE_RATIO` | server | no (`0.1`) | share of traces kept, 0 to 1; metrics and logs are not sampled. Used only with a connection string |
| `SW_TELEMETRY_ACTOR_SALT` | server | no (random at each start) | secret that keys the pseudonym standing for each person in logs and telemetry; a Key Vault reference when set. With it, pseudonyms are stable across restarts |
| `SW_IN_CONTAINER` | both | no (`1` in the image) | local mode logs that host networking is required (OP-8) |
| `SW_SERVE_STATIC` | both | no (`0`; `1` in the image) | the Bun server serves `dist/` itself (always in server mode and in the container) |
| `SW_VERSION`, `SW_COMMIT` | both | no (set by the image build) | reported by `/healthz`; checked by the smoke test |
| `CONTAINER_APP_REVISION` | server | no (set by Azure Container Apps) | revision recorded in `instance.lock`; `SW_VERSION+SW_COMMIT` (else `dev`) when absent (FR-122, FR-123) |

Container image defaults: `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1`,
`SW_PORT=4310`. Local mode in the container keeps `SW_HOST=127.0.0.1` and runs with host
networking (OP-8; on Docker Desktop, host networking must be enabled in its settings); on Azure
Container Apps server mode sets `SW_HOST=0.0.0.0` (checked by the deploy preflight). The Azure
DevOps pipeline parameters and variable group, and the variables the local build and deploy
scripts read (not read by the server), are listed in [delivery-pipeline.md](./delivery-pipeline.md).

No variable configures roles: provider roles are not read for people, and every role comes from
the access grants in the Admin panel (or `SW_BOOTSTRAP_ADMINS`).

Start-up refuses server mode when a required variable is missing or invalid, naming it. Secrets
are read once and never logged; on Azure they are Key Vault references resolved by the platform.
