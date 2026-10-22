# Target setup

This guide is run by the target owner. The repository runs no automation and the implementer
never connects to the target. Use fixture data until workspace filtering and administration
are complete. Provision resources by hand; this guide is not infrastructure as code.

The [delivery contract](../specs/003-authn-authz/contracts/delivery-pipeline.md) is the complete
settings and roles checklist. The [trial runbook](trial-runbook.md) records acceptance.

## Azure resources, in order

In the Azure portal select the target subscription and create a resource group. Create a Log
Analytics workspace in it, then a Container Apps environment using a consumption workload
profile and that workspace for container stdout and audit logs. The corresponding Azure CLI
command families are `az group create --help`, `az monitor log-analytics workspace create --help`
and `az containerapp env create --help`. Use the target's approved region and network.

Create a storage account and file share in **Storage accounts → File shares**. Choose premium
NFS if the environment has its own virtual network; otherwise use SMB. Register the share in
**Container Apps environment → Azure Files**. Mount SMB with `uid=1000,gid=1000`; for NFS prepare
ownership for uid/gid 1000 before starting the app. CLI entry points are
`az storage account create --help`, `az storage share-rm create --help`, and
`az containerapp env storage set --help`. Keep storage access keys in the platform's storage
configuration, never the repository or pipeline variable group.

Create an Azure Container Registry, disable its admin user, and use repository
`semantic-workbench`. In **Policies → Retention**, enable deletion of untagged manifests after
the target's retention period (use a registry tier supporting retention). Keep every version
tag; remove unused commit tags only under the target's policy. CLI equivalents are
`az acr create --help`, `az acr update --help`, and `az acr config retention update --help`.

Create an RBAC-mode Key Vault. Add `sw-session-key` (32 random bytes encoded as base64), and,
if used, provider and GitHub application secrets in **Secrets**. Never put these values in
commands saved with the release. Use `az keyvault create --help` for the CLI creation options.
Keep the session key stable across revisions and restarts; rotation ends sessions.

Before creating the container app, create the user-assigned identity `id-sw-app` in **Managed
Identities**. Grant it **AcrPull** on the registry and **Key Vault Secrets User** on the vault
through each resource's **Access control (IAM)**. CLI entry points are
`az identity create --help` and `az role assignment create --help`. Wait for role propagation
before the first pull. These roles belong to the app identity, not the pipeline identity.

Register the single-tenant Entra sign-in application following every step of
[quickstart §5](../specs/003-authn-authz/quickstart.md#5-microsoft-entra-id-on-the-real-tenant-manual-checklist-run-by-the-owner-recorded-in-verificationmd).
Register `/auth/callback` and `/auth/signed-out` under the public HTTPS origin; configure groups
and optional claims `email`, `upn`, `xms_edov`, the `access_as_user` scope, Azure DevOps delegated
permission and application `GroupMember.Read.All` with admin consent. Do not create workbench
app roles. Configure a federated credential trusting `id-sw-app`, or keep a client secret in
Key Vault. The application's managed identity and the pipeline federation are separate trusts.

Create the app in **Container Apps** with the environment, identity and registry above. For its
initial revision use an existing target-approved image pinned by digest; the pipeline needs one
running revision to record and restore. Bootstrap that image with the local image scripts on
an owner machine after `az login`, using the variable group values below. Review each script's
help first. A release must declare its version in `package.json` before it is built and tagged.

```sh
bun run image:build -- --help
bun run image:scan -- --help
bun run image:push -- --help
```

Configure the app using **Revisions**, **Scale**, **Ingress**, **Volumes**, **Identity**,
**Secrets**, and **Containers → Environment variables / Health probes**:

| Setting | Required value |
| --- | --- |
| Revision mode | Single |
| Replicas | Minimum 1, maximum 1; never scale this shared Git workspace horizontally |
| Ingress | External HTTPS, target port 4310 |
| Probes | HTTP liveness `/healthz`, readiness `/readyz`, port 4310; allow startup recovery |
| Volume | AzureFile or NfsAzureFile mounted at `/data`, using the registered share |
| Identity | Attach `id-sw-app`; registry pull uses this same identity |
| Secrets | Key Vault references to the chosen vault, resolved by `id-sw-app` |
| Runtime | `SW_MODE=server`, `SW_HOST=0.0.0.0`, `SW_PORT=4310`, `DATA_DIR=/data` |
| Cache | `SW_CACHE_DIR=/tmp/sw-cache` on ephemeral disk |
| Public URL | `SW_PUBLIC_URL=https://<host>` |
| Provider | `SW_OIDC_PROVIDER=entra`, `SW_ENTRA_TENANT_ID=<tenant>`, `SW_OIDC_CLIENT_ID=<client>` |
| Discovery | `SW_OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0` |
| Credential | `SW_OIDC_CLIENT_ASSERTION=managed-identity`, or `SW_OIDC_CLIENT_SECRET` secret reference |
| Sessions | `SW_SESSION_KEY` references `sw-session-key` |
| Bootstrap | `SW_BOOTSTRAP_ADMINS` contains at least one verified address or stable tenant/object ID |

Use **Container Apps → Edit and deploy** for these settings. CLI counterparts are
`az containerapp create --help`, `az containerapp update --help`,
`az containerapp revision set-mode --help`, `az containerapp identity assign --help`,
`az containerapp registry set --help`, and `az containerapp secret set --help`.
For optional agent audience, GitHub OAuth, committer and group configuration use the
[configuration contract](../specs/003-authn-authz/contracts/configuration.md). Secrets are always
platform references. Deployment preflight names drift before promoting or updating an image.

### CLI creation and inspection

These are owner-operated examples. Replace every placeholder before running them. Use portal
steps above for probe definitions and mounted volumes; inspect the resulting template with the
last command rather than storing a resource template in this repository.

```sh
az group create --name <resource-group> --location <region>
az monitor log-analytics workspace create --resource-group <resource-group> --workspace-name <logs>
az containerapp env create \
  --name <environment> \
  --resource-group <resource-group> \
  --location <region> \
  --logs-workspace-id <workspace-customer-id> \
  --logs-workspace-key <workspace-key>
az storage account create \
  --name <storage-account> \
  --resource-group <resource-group> \
  --location <region> \
  --sku Standard_LRS
az storage share-rm create \
  --resource-group <resource-group> \
  --storage-account <storage-account> \
  --name <share> \
  --quota 100
az acr create \
  --name <registry> \
  --resource-group <resource-group> \
  --sku Premium \
  --admin-enabled false
az acr config retention update \
  --registry <registry> \
  --status enabled \
  --days 30 \
  --type UntaggedManifests
az keyvault create \
  --name <vault> \
  --resource-group <resource-group> \
  --location <region> \
  --enable-rbac-authorization true
az identity create --name id-sw-app --resource-group <resource-group>
az role assignment create \
  --assignee-object-id <app-identity-principal-id> \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope <registry-resource-id>
az role assignment create \
  --assignee-object-id <app-identity-principal-id> \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope <vault-resource-id>
az containerapp revision set-mode --name <app> --resource-group <resource-group> --mode single
az containerapp update \
  --name <app> \
  --resource-group <resource-group> \
  --min-replicas 1 \
  --max-replicas 1
az containerapp show --name <app> --resource-group <resource-group> --output json
```

For NFS choose a premium FileStorage account and NFS share instead of the SMB example. Enter
workspace and storage keys only through the target's secure provisioning session or portal;
do not retain substituted commands in reports. Allow role propagation before creating the app
with the portal settings table. Confirm the final inspected template matches every row.

## Azure DevOps

1. Create an Azure Repos mirror in the target project. Grant the release operator Contribute and
   Create tag. The mirror must never fetch from this repository; use the hand-over below.
2. In **Project settings → Service connections**, create Azure Resource Manager connections
   `sw-azure-push` and `sw-azure-deploy`, using workload identity federation. Automatic federation
   can manage its app registration. For manual federation copy the issuer and subject displayed
   on the connection page into the target's app registration or user-assigned identity; never
   construct those strings or store a client secret.
3. Grant the push connection **AcrPush** on the registry. Grant the deploy connection **AcrPush**
   on the registry and **Contributor** on the container app resource only. If the trial proves
   it necessary, add a custom role with only the environment join action on the environment,
   and **Managed Identity Operator** on `id-sw-app` when assigning that identity. Record the
   final roles and scopes in the trial report; do not grant subscription-wide Contributor.
4. Create environment `production` under **Pipelines → Environments**. Configure named approvers,
   branch control permitting only `refs/tags/v*`, and an exclusive lock. Both YAML stages use
   `lockBehavior: runLatest`, so the latest waiting run proceeds. The same environment protects
   rollback. Service connections may also have branch control.
5. Create **Library → Variable groups → semantic-workbench-target**. Enter every value below,
   none marked secret. Restrict this group and both service connections to the two imported
   pipelines; disable access for all pipelines.
6. Choose Microsoft-hosted `ubuntu-latest`, or a self-hosted Linux pool with Docker/buildx,
   Azure CLI and network access to the target. Set compile-time `agentPool` or `vmImage`.
7. Import `azure-pipelines.yml` and `azure-pipelines-rollback.yml` from the mirror. Set parameters
   `variableGroup`, `acrServiceConnection`, `deployServiceConnection`, `deployEnvironment`,
   `agentPool`, `vmImage` to target names. Never replace them with runtime connection macros.
8. In **Repos → Branches → main → Branch policies**, require build validation with the main
   pipeline for pull requests. Validate and Image must pass before completion.
9. Use the Azure DevOps Runs API with `previewRun: true` for each imported pipeline, selecting
   the tag ref for rollback. Inspect the returned expanded YAML: Validate, Image, tag-only
   Deploy; manual Rollback; no external identity service. This portal/API action is owner-only.

| Variable | Target value |
| --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Deployment subscription |
| `AZURE_TENANT_ID` | Deployment tenant |
| `ACR_NAME` | Registry name, without `.azurecr.io` |
| `ACA_RESOURCE_GROUP` | App resource group |
| `ACA_ENVIRONMENT` | Container Apps environment name |
| `ACA_NAME` | Container app name |
| `APP_IDENTITY_NAME` | `id-sw-app` |
| `KEY_VAULT_NAME` | Vault name |
| `ENTRA_TENANT_ID` | Sign-in tenant |
| `ENTRA_CLIENT_ID` | Sign-in application ID |
| `SW_PUBLIC_URL` | Public HTTPS origin |

The sample file contains placeholders, not credentials. For local commands export these same
non-secret values and sign in with `az login`. The tag check reads `SOURCE_REF`; deployment also
reads `IMAGE_DIGEST` and `BUILD_COMMIT`. The manifest supplies the expected version.
`image:scan -- --ref-env IMAGE_REF` reads its digest reference from the environment, keeping
pipeline macros out of shell command text. `--ref <registry/repository@digest>` remains available.
Rollback reads `ROLLBACK_TARGET` (`tag` or `previous`), or explicit `--to`.

## Local preview and rollback

```sh
bun run pipeline:lint
bun run pipeline:dry-run -- --run pr
bun run pipeline:dry-run -- --run main
bun run pipeline:dry-run -- --run tag:v0.4.0-alpha.1 --execute
bun run pipeline:dry-run -- --pipeline rollback --run tag:v0.4.0-alpha.1
bun run deploy:azure -- --fake --help
bun run deploy:rollback -- --help
bun run deploy:smoke -- --help
```

Dry-run execution first exercises successful deployment, failed smoke with automatic restoration,
and both manual rollback paths against the fake client for a tag run, then executes local gate
steps. Azure steps are printed, never executed. It requires sockets, Chromium and containers
for the full local gate. Fake metadata is explicitly synthetic; it does not certify a release.
`deploy:azure -- --fake` supplies fixture metadata when the checkout has no package version;
`--fake --fail-smoke` deliberately exits nonzero after smoke-tested recovery. Real deployment
always requires the manifest version and explicit digest/commit inputs.

Queue manual rollback on `refs/tags/vX.Y.Z`, with `target=tag` to resolve that registry tag to a
digest, verify it equals `sha-<commit>` for its commit label, and rescan it before updating.
With `target=previous`, select the newest promoted version tag below the active version,
excluding the active digest and failed digests; refuse if none exists. Creation times after
automatic restore do not determine release order. Both paths record the active revision and
automatically restore it on update or smoke failure.
Smoke expects restored image labels, not the checked-out version. Non-tag refs are refused.
Automatic rollback copies the revision recorded before update, waits and smoke-tests it, and
still fails the deployment run. Retain revision history as well as version tags. The first
bootstrap deployment must have a running digest-pinned revision available for recovery.

A rollback run uses the selected Git tag's own pipeline YAML and scripts. Tags older than
this delivery (`v0.4.0`) cannot be rolled back through this pipeline. Retain eligible Git tags,
registry version tags and their `sha-<commit>` tags.

After smoke passes and the version tag is promoted, lock the tag on the owner's target:

```sh
az acr repository update --name "$ACR_NAME" \
  --image "semantic-workbench:<release-tag>" --write-enabled false
```

`AcrPush` can rewrite version tags unless they are locked. Locking preserves the promoted
release's identity; commit-digest verification and rescanning also protect manual rollback.
Failed updates or smoke checks never promote a version tag.

## Release hand-over

Set and validate the package version before tagging. Run the complete `bun run ci:validate` on
the release commit. Create the annotated tag, then use one of these owner-operated routes:

```sh
git remote add target <mirror-url>
git push target v0.4.0-alpha.1^{commit}:refs/heads/release/v0.4.0-alpha.1
```

Open and complete a pull request from `release/v0.4.0-alpha.1` into `main`, waiting for the branch
policy. Then push the tag, which still points to the original release commit:

```sh
git push target v0.4.0-alpha.1
```

Without shared access, send a bundle and checksum:

```sh
git bundle create semantic-workbench-v0.4.0-alpha.1.bundle v0.4.0-alpha.1
sha256sum semantic-workbench-v0.4.0-alpha.1.bundle > semantic-workbench-v0.4.0-alpha.1.bundle.sha256
sha256sum -c semantic-workbench-v0.4.0-alpha.1.bundle.sha256
git bundle verify semantic-workbench-v0.4.0-alpha.1.bundle
git fetch ./semantic-workbench-v0.4.0-alpha.1.bundle 'refs/tags/*:refs/tags/*'
```

The receiver verifies both files, fetches into a mirror clone, and follows the release branch,
pull request, then tag sequence above. Commit and tag identifiers stay unchanged. As a fallback,
`git archive --format=tar.gz --output=release.tar.gz v0.4.0-alpha.1` supplies source; the receiver
commits it in the mirror and records `release v0.4.0-alpha.1 = mirror commit <sha>` in the tag
message. The image and health commit then refer to the mirror commit. Never configure a scheduled
mirror sync or a pipeline connection to this repository.

## Alternatives and scaling

App Service for Containers is an alternative target, not supported by these Container Apps
scripts. Use one Linux instance, persistent Azure Files at `/data`, managed identity for registry
and Key Vault, HTTPS and the same environment/probes. Its owner must supply and validate a
separate deployment/rollback adapter before using it.

Scale vertically first. Multiple replicas cannot safely share the Git workspace. A horizontal
scale design needs repository ownership partitioning or coordinated storage/leases and shared
session handling; changing the replica count alone is unsafe. Keep SQLite cache on local disk.
