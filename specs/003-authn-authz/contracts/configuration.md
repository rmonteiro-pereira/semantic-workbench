# Configuration Contract (environment variables)

| Variable | Mode | Required | Meaning |
| --- | --- | --- | --- |
| `SW_MODE` | both | no (`local`) | `local` or `server` |
| `DATA_DIR` | both | no (`data/`) | data root; `/data` in the container |
| `SW_CACHE_DIR` | both | no (data root) | SQLite cache folder; container local disk recommended |
| `SW_HOST`, `SW_PORT` | both | no (`127.0.0.1`, 4310) | local mode refuses non-loopback `SW_HOST` |
| `SW_PUBLIC_URL` | server | yes | external HTTPS origin, e.g. `https://workbench.example.org` |
| `SW_OIDC_ISSUER` | server | yes | provider issuer URL (Entra: `https://login.microsoftonline.com/<tid>/v2.0`) |
| `SW_OIDC_CLIENT_ID` | server | yes | |
| `SW_OIDC_CLIENT_SECRET` | server | one of | secret reference |
| `SW_OIDC_CLIENT_ASSERTION` | server | one of | `managed-identity` (Entra federated credential of `id-sw-app`; uses the platform identity endpoint) or a private key path |
| `SW_OIDC_SCOPES` | server | no | default `openid profile email offline_access` (+ `api://<client>/access_as_user` for Entra) |
| `SW_OIDC_PROVIDER` | server | no (`generic`) | `entra`, `keycloak`, `generic` (claim mapping preset) |
| `SW_ENTRA_TENANT_ID` | server/entra | yes for Entra | `tid` allow-list |
| `SW_ROLE_CLAIM` | server | no | override claim path for roles |
| `SW_GROUP_CLAIM` | server | no (`groups`) | |
| `SW_GROUP_OVERAGE` | server/entra | no (`directory`) | `directory` (Graph checkMemberGroups) or `off` |
| `SW_API_AUDIENCE` | server | yes for agents | expected `aud` of bearer tokens |
| `SW_SESSION_KEY` | server | yes | 32 bytes base64; encrypts sessions |
| `SW_BOOTSTRAP_ADMINS` | server | yes (≥ 1) | comma-separated emails or stable ids that always hold Admin (break-glass) |
| `SW_COMMITTER_NAME`, `SW_COMMITTER_EMAIL` | server | no | committer identity of server commits |
| `SW_GITHUB_HOST`, `SW_GITHUB_CLIENT_ID`, `SW_GITHUB_CLIENT_SECRET` | server | no | GitHub OAuth/App for user tokens |
| `SW_ADO_OBO` | server/entra | no (`true`) | Azure DevOps on-behalf-of |
| `SW_IN_CONTAINER` | both | no (`1` in the image) | local mode logs that host networking is required (OP-8) |
| `SW_SERVE_STATIC` | both | no (`0`; `1` in the image) | the Bun server serves `dist/` itself (always in server mode and in the container) |
| `SW_VERSION`, `SW_COMMIT` | both | no (set by the image build) | reported by `/healthz`; checked by the smoke test |
| `CONTAINER_APP_REVISION` | server | no (set by Azure Container Apps) | revision recorded in `instance.lock`; `SW_VERSION+SW_COMMIT` (else `dev`) when absent (FR-122, FR-123) |

Container image defaults: `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1`,
`SW_PORT=4310`. Local mode in the container keeps `SW_HOST=127.0.0.1` and runs with host
networking (OP-8); on Azure Container Apps server mode sets `SW_HOST=0.0.0.0` (checked by the
deploy preflight). Pipeline variables (GitHub, not read by the server) are listed in
[delivery-pipeline.md](./delivery-pipeline.md).

Start-up refuses server mode when a required variable is missing or invalid, naming it. Secrets
are read once and never logged; on Azure they are Key Vault references resolved by the platform.
