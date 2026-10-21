# Delivery Pipeline Contract (GitHub Actions → Azure Container Apps)

Design and reasons in [research.md](../research.md) R17–R20. Owner open points: OP-6 (registry),
OP-7 (approval gate on the GitHub plan).

## Workflows

| File | Trigger | Jobs (in order) | Azure access |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request`, `push` (branches only) | `verify`, `mutation`, `browser` (matrix), `keycloak`, `image` (build, Trivy, SBOM), `container` (suites against the image), `publish` (push to `main` only) | `publish` only, publisher identity |
| `.github/workflows/release.yml` | `push` tags `v*` | `check` (on `main`, green `ci.yml` run with `publish`), `deploy` (environment `production`: rescan, promote, preflight, update, smoke, rollback on failure), `github-release` | `deploy` only, deployer identity |
| `.github/workflows/rollback.yml` | `workflow_dispatch` (`version`) | `deploy` (environment `production`: resolve digest, preflight, update, smoke) | deployer identity |
| `.github/dependabot.yml` | weekly | `github-actions`, `docker`, `npm` | none |

Required status checks on `main`: `verify`, `mutation`, `browser`, `keycloak`, `image`,
`container`.

## Image

- Registry `<ACR_NAME>.azurecr.io/semantic-workbench`.
- Tags: `sha-<40-hex commit>` and `main` on pushes to `main`; `vX.Y.Z` (and pre-release forms)
  added to the same digest on release. Deployments always use `@sha256:<digest>`.
- Labels: `org.opencontainers.image.version`, `.revision`, `.source`, `.created`.
- Artifacts per build: `sbom.spdx.json` (SPDX JSON), `trivy.sarif`; attached to the GitHub release
  for version tags.
- Scan gate: critical or high with a fix fails; `.trivyignore` lines need `# reason; expires
  YYYY-MM-DD`, checked by `tests/ci/workflows.test.ts`.

## Repository variables (no secrets)

| Variable | Meaning |
| --- | --- |
| `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | tenant and subscription of the deployment |
| `AZURE_CLIENT_ID_PUBLISHER` | client id of `id-sw-publisher` (federated subject `ref:refs/heads/main`) |
| `AZURE_CLIENT_ID_DEPLOYER` | client id of `id-sw-deployer` (federated subject `environment:production`) |
| `ACR_NAME` | registry name |
| `ACA_NAME`, `ACA_RESOURCE_GROUP` | container app and its resource group |
| `SW_PUBLIC_URL` | public URL the smoke test calls |
| `SW_DEPLOYERS` | only under the OP-7 fallback: actors allowed to dispatch a deployment |

## Azure resources the pipeline expects (created by hand, `deploy/azure/README.md`)

| Resource | Settings the pipeline relies on | Roles |
| --- | --- | --- |
| Resource group | holds everything below | — |
| Log Analytics workspace | receives container stdout (audit mirror) | — |
| Container Apps environment | consumption profile; Azure Files storage registered | — |
| Storage account + file share | NFS (premium) or SMB with `uid=1000,gid=1000` mount options | — |
| Key Vault (RBAC) | `sw-session-key`, provider and GitHub secrets | app identity: Key Vault Secrets User |
| Container registry (Basic, admin user off) | repository `semantic-workbench` | app identity: `AcrPull`; publisher and deployer: `AcrPush` |
| Container app | single revision mode, min = max replicas 1, ingress 4310, probes `/healthz` and `/readyz`, volume `/data`, system identity, env of configuration.md with Key Vault references | deployer: Contributor on this resource only |
| `id-sw-publisher`, `id-sw-deployer` | user-assigned identities with GitHub federated credentials | as above |
| Entra app registration (sign-in) | quickstart §5 | — |

## Deploy preflight (fails the deployment, names the setting)

Revision mode `Single`; `minReplicas = maxReplicas = 1`; a volume mounted at `/data` of type
`AzureFile` or `NfsAzureFile`; system-assigned identity present; registry configured with that
identity; `SW_MODE=server`; `SW_HOST=0.0.0.0`; ingress target port 4310.

## Smoke test (`scripts/deploy-smoke.ts <public-url> <version> <commit>`)

Exit 0 only when: `/healthz` reports the version and commit; `/readyz` 200 within 3 minutes;
`GET /api/projects` without cookie → 401 with no project name in the body; `/auth/login` → 302 to
the configured issuer with `code_challenge_method=S256`; `Strict-Transport-Security`,
`Content-Security-Policy` and `X-Content-Type-Options` present; the sign-in state cookie is
`Secure; HttpOnly`. Output: one line per check, JSON summary for the job summary.

## Deploy script (`scripts/deploy.ts`)

Preflight, record of the running digest, update, wait for the revision, smoke test and rollback
live in one script; Azure calls go through a small client interface (Azure CLI in the workflow, a
fake in `tests/ci/deploy.test.ts`), so the decision logic is unit- and mutation-tested.

## Rollback

Automatic: the digest running before the update is recorded; on smoke failure it is deployed
again and smoke-tested with its own version and commit; the run fails in both cases. Manual:
`rollback.yml` with a version tag, through the same approval.
