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
| `SW_OIDC_CLIENT_ASSERTION` | server | one of | `managed-identity` (Entra federated credential) or a private key path |
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

Start-up refuses server mode when a required variable is missing or invalid, naming it. Secrets
are read once and never logged; on Azure they are Key Vault references resolved by the platform.
