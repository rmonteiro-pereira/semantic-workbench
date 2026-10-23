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

An SMB share ignores letter case: it opens `FINANCE/plan.yaml` as `finance/plan.yaml`. The
workbench therefore refuses a request that spells an existing name in another case, and a new
name that differs from a sibling only in case, so a rule for a restricted folder cannot be
bypassed. Names that two people on a case-sensitive system keep apart (`Notes.yaml` and
`notes.yaml`) cannot live in one project on this share. NFS is case-sensitive like the Git
checkouts the workbench keeps there; prefer NFS when the environment allows it.

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

Register the Entra App Registration as described in
[Entra App Registration](#entra-app-registration) below, then run every step of
[quickstart §5](../specs/003-authn-authz/quickstart.md#5-microsoft-entra-id-on-the-real-tenant-manual-checklist-run-by-the-owner-recorded-in-verificationmd).
Do not create workbench app roles for people: roles come from the Admin panel's grants. The
application's managed identity and the pipeline federation are separate trusts.

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
| Ingress | External HTTPS only, target port 4310: `external` true, `allowInsecure` false, no CORS policy (or only `SW_PUBLIC_URL` as the allowed origin), transport `auto`, `http` or `http2` |
| Probes | HTTP liveness `/healthz`, readiness `/readyz`, port 4310; allow startup recovery |
| Volume | AzureFile or NfsAzureFile mounted at `/data`, using the registered share |
| Identity | Attach `id-sw-app`; registry pull uses this same identity |
| Secrets | Key Vault references to the chosen vault, resolved by `id-sw-app` |
| Runtime | `SW_MODE=server`, `SW_HOST=0.0.0.0`, `SW_PORT=4310`, `DATA_DIR=/data` |
| Proxy | `SW_TRUSTED_PROXY_HOPS=1`: Container Apps ingress is one proxy, so rate limits use the client address it forwards instead of its own |
| Cache | `SW_CACHE_DIR=/tmp/sw-cache` on ephemeral disk |
| Brand (optional) | `SW_BRAND_DIR=/brand` with an AzureFile volume holding `logo.svg`, `logo-mark.svg`, `favicon.svg`, `brand.json` and `brand.css`, mounted read-only at `/brand`; see White-labelling in the main README. Without it the shipped brand is used |
| Public URL | `SW_PUBLIC_URL=https://<host>`, equal to the pipeline variable `SW_PUBLIC_URL` |
| Provider | `SW_OIDC_PROVIDER=entra`, `SW_ENTRA_TENANT_ID=<tenant>`, `SW_OIDC_CLIENT_ID=<client>` |
| Discovery | `SW_OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0` |
| Credential | Certificate (preferred): `SW_OIDC_CLIENT_CERTIFICATE_KEY` secret reference and `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT`; or `SW_OIDC_CLIENT_ASSERTION=managed-identity`; or `SW_OIDC_CLIENT_SECRET` secret reference |
| Agents | `SW_API_AUDIENCE=<client>` (the `aud` of version 2 access tokens) |
| Sessions | `SW_SESSION_KEY` references `sw-session-key` |
| Bootstrap | `SW_BOOTSTRAP_ADMINS` contains at least one verified address or stable tenant/object ID |

Use **Container Apps → Edit and deploy** for these settings. CLI counterparts are
`az containerapp create --help`, `az containerapp update --help`,
`az containerapp revision set-mode --help`, `az containerapp identity assign --help`,
`az containerapp registry set --help`, and `az containerapp secret set --help`.
For optional agent audience, GitHub OAuth, committer and group configuration use the
[configuration contract](../specs/003-authn-authz/contracts/configuration.md). Secrets are always
platform references. Deployment preflight names drift before promoting or updating an image,
including ingress that allows plain HTTP, a CORS policy for another origin, and an app
`SW_PUBLIC_URL` that differs from the variable group.

### Entra App Registration

The workbench signs people in to Entra on the server with Microsoft's MSAL library and this one
App Registration. Agent clients request tokens for the API it exposes. Create it in the
Microsoft Entra admin center under **App registrations → New registration**:

1. **Name and audience.** Any name, for example `semantic-workbench`; supported account types
   **Accounts in this organizational directory only** (single tenant).
2. **Authentication.** Add the **Web** platform with two redirect URIs:
   `https://<host>/auth/callback` (sign-in) and `https://<host>/auth/signed-out` (Entra sends the
   browser there after sign-out; it accepts only a registered URI). Set **Front-channel logout
   URL** to `https://<host>/auth/front-channel-logout`: when the person signs out of another
   application, Entra loads it with the tenant's issuer and its session id (`sid`), and the
   workbench ends the sessions that sign-in started. It needs no cookie, so anyone who knows a
   `sid` can end that session; Entra keeps the `sid` private, and the route only ever ends
   sessions. Leave both implicit grant boxes (access tokens, ID tokens) cleared and **Allow
   public client flows** off.
3. **Credential.** Choose one, in this order of preference:
   - **Certificate.** In the Key Vault choose **Certificates → Generate/Import** with content type
     PEM, download the public `.cer`, and upload it under **Certificates & secrets →
     Certificates**. Reference the certificate's secret
     (`https://<vault>.vault.azure.net/secrets/<certificate-name>`) from the container app as
     `SW_OIDC_CLIENT_CERTIFICATE_KEY`; the PEM holds the private key and the certificate, and
     the server reads the key. Set `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT` to the SHA-256
     thumbprint, `openssl x509 -in <certificate>.pem -noout -fingerprint -sha256 | cut -d= -f2`
     (colons are ignored; a 40-character SHA-1 thumbprint also works). Rotate by adding the new
     certificate beside the old one, switching both settings, then removing the old one.
   - **Federated credential.** Under **Certificates & secrets → Federated credentials** add the
     scenario **Managed identity** with `id-sw-app` and set
     `SW_OIDC_CLIENT_ASSERTION=managed-identity`. No secret exists anywhere.
   - **Client secret.** Create one under **Client secrets**, store it in Key Vault and reference
     it as `SW_OIDC_CLIENT_SECRET`. Note its expiry date.
4. **Token configuration.** **Add groups claim → Security groups** (group IDs) for the ID and
   access tokens, or **Groups assigned to the application** if the granted groups are assigned
   to the enterprise application, which avoids overage. **Add optional claim → ID** with
   `email`, `upn`, `xms_edov`, `sid` (front-channel logout names it) and `login_hint` (sent
   back as `logout_hint`, so sign-out does not ask which account), and **Add optional claim →
   Access** with `idtyp` (agent tokens without it are refused). When a person belongs to more groups than fit in a token,
   Entra leaves them out and marks the overage; the server then asks Microsoft Graph which of the
   granted groups the person is in (needs `GroupMember.Read.All` below; `SW_GROUP_OVERAGE=off`
   disables it).
5. **API permissions.** Microsoft Graph delegated `openid`, `profile`, `email`, `offline_access`
   and `User.Read`. Add the Microsoft Graph application permission `GroupMember.Read.All` only
   for the Graph lookups: overage resolution and the group names the Admin panel shows. Azure
   DevOps delegated `user_impersonation` when people push to Azure Repos through the workbench.
   **Grant admin consent** for the tenant.
6. **Expose an API.** Set the Application ID URI to `api://<client-id>`. Add the scope
   `access_as_user` (who can consent: admins and users); the server asks for it at sign-in and
   uses that token for on-behalf-of exchanges. Agent clients request
   `api://<client-id>/.default` with their own registration or managed identity (see
   [agent runtime](../docs/agent-runtime.md#agent-clients-in-server-mode)). An app role for
   them, for example `Workbench.Agent` with allowed member type **Applications**, is optional:
   the workbench never reads roles, and an agent reaches only the projects and domains an Admin
   granted its client ID (**Admin → Projects**, stored in `admin/agents.json`).
7. **Access token version 2.** In **Manifest** set `requestedAccessTokenVersion` in the `api`
   section to `2` (`accessTokenAcceptedVersion` in the older manifest format). Agent tokens then
   carry the version 2 issuer that `SW_OIDC_ISSUER` names and the client ID as `aud`, which is
   what `SW_API_AUDIENCE` must hold.

Where each value of the registration goes:

| App Registration value | Container app setting | Pipeline variable |
| --- | --- | --- |
| Directory (tenant) ID | `SW_ENTRA_TENANT_ID`; `SW_OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0` (national clouds: `login.microsoftonline.us`, `login.chinacloudapi.cn` or `login.partner.microsoftonline.cn`; no port) | `ENTRA_TENANT_ID` (preflight compares both) |
| Application (client) ID | `SW_OIDC_CLIENT_ID`, `SW_API_AUDIENCE` | `ENTRA_CLIENT_ID` (preflight compares `SW_OIDC_CLIENT_ID`) |
| Redirect URI origin | `SW_PUBLIC_URL` | `SW_PUBLIC_URL` |
| Certificate private key (Key Vault certificate) | `SW_OIDC_CLIENT_CERTIFICATE_KEY=secretref:<name>` | none; preflight requires a Key Vault reference |
| Certificate SHA-256 thumbprint | `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT` | none |
| Federated credential for `id-sw-app` | `SW_OIDC_CLIENT_ASSERTION=managed-identity` | `APP_IDENTITY_NAME` |
| Client secret (Key Vault secret) | `SW_OIDC_CLIENT_SECRET=secretref:<name>` | none; preflight requires a Key Vault reference |
| Groups claim | `SW_GROUP_CLAIM` (default `groups`) | none |
| `GroupMember.Read.All` | `SW_GROUP_OVERAGE=directory` (default) | none |

Secrets never enter the variable group: the container app resolves each `secretref` from Key
Vault with `id-sw-app`.

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
  --logs-workspace-key "$(az monitor log-analytics workspace get-shared-keys \
    --resource-group <resource-group> \
    --workspace-name <logs> \
    --query primarySharedKey \
    --output tsv)"
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

For NFS choose a premium FileStorage account and NFS share instead of the SMB example. Read
the workspace key with the command substitution shown, never type it into a command, and enter
storage keys only through the target's secure provisioning session or portal; do not retain
substituted commands in reports. Allow role propagation before creating the app
with the portal settings table. Confirm the final inspected template matches every row.

## Azure DevOps

1. Create an Azure Repos mirror in the target project. Grant the release operator Contribute and
   Create tag. In **Repos → Repositories → Security**, set **Create tag** for the path
   `refs/tags/v*` to Allow for the release operator only and Deny for everyone else, including
   the project administrators and the build service. A tag on any commit starts a deployable
   run, so the tag permission is a release permission. The mirror must never fetch from this
   repository; use the hand-over below.
2. In **Project settings → Service connections**, create Azure Resource Manager connections
   `sw-azure-push`, `sw-azure-pull` and `sw-azure-deploy`, using workload identity federation.
   Automatic federation
   can manage its app registration. For manual federation copy the issuer and subject displayed
   on the connection page into the target's app registration or user-assigned identity; never
   construct those strings or store a client secret.
3. Grant the push connection **AcrPush** on the registry and the custom role in
   [`registry-tag-lock-role.json`](registry-tag-lock-role.json) (it locks `sha-<commit>` right
   after the push). Grant the pull connection **AcrPull**
   on the registry: the tag check only lists tags, so it holds no push right. Grant the deploy
   connection **AcrPush** on the registry, the custom role in
   [`container-app-deployer-role.json`](container-app-deployer-role.json) on the container app
   resource only, and the custom role in
   [`registry-tag-lock-role.json`](registry-tag-lock-role.json) on the registry (it lets
   `deploy:azure` make the promoted tags read-only). Both role files list the resource group as
   assignable scope; assign each at the container app or the registry. A registry in the
   ABAC repository-permissions mode needs the data actions
   `Microsoft.ContainerRegistry/registries/repositories/metadata/read` and `write` in
   `DataActions` instead of the two actions. Do not grant **Contributor** on the
   container app: it includes `listSecrets` and the exec token (`getAuthToken`), which would
   let a deployment run read the app's secrets or open a shell in it. The custom role allows
   `Microsoft.App/containerApps/read`, `write`, `revisions/*` and the
   `Microsoft.App/locations/containerappOperationStatuses/read` and
   `containerappOperationResults/read` actions only. If the trial proves it necessary, add a custom role with only the environment join
   action on the environment, and **Managed Identity Operator** on `id-sw-app` when assigning
   that identity. Record the final roles and scopes in the trial report; do not grant
   subscription-wide Contributor.
4. Create environment `production` under **Pipelines → Environments**. Configure named approvers,
   branch control permitting only `refs/tags/v*`, and an exclusive lock. Both YAML stages use
   `lockBehavior: runLatest`, so the latest waiting run proceeds. The same environment protects
   rollback. Approvers open the run, find the tag's commit (`Build.SourceVersion`) and check
   that it is the commit of the merged pull request on `main` before approving.
   `deploy:check-version` already refuses a commit that is not an ancestor of `origin/main`;
   the approver's check covers what that script cannot know, that the commit is the release.
   **Branch control on the three service connections is mandatory.** Pull-request build
   validation runs the pull request's own YAML, so without it a changed pipeline could use a
   connection outside the environment checks. Under **Service connections → connection →
   Approvals and checks → Branch control**, allow only these refs:

   | Connection | Allowed branches | Verify branch protection |
   | --- | --- | --- |
   | `sw-azure-deploy` | `refs/tags/v*` | off |
   | `sw-azure-push` | `refs/heads/main`, `refs/tags/v*` | on |
   | `sw-azure-pull` | `refs/tags/v*` | off |

   Tags have no branch policies, so Verify branch protection would block a connection that
   only tag runs use; for those two, the allowed refs and the Create tag permission of step 1
   are the protection. Only the push connection also serves `main`, whose branch policy of
   step 8 the check verifies. The trial confirms this (step 10).
5. Create **Library → Variable groups → semantic-workbench-target**. Enter every value below,
   none marked secret. Restrict this group and both service connections to the two imported
   pipelines; disable access for all pipelines.
6. Choose Microsoft-hosted `ubuntu-latest`, or a self-hosted Linux pool with Docker/buildx,
   Azure CLI and network access to the target. Set compile-time `agentPool` or `vmImage`.
7. Import `azure-pipelines.yml` and `azure-pipelines-rollback.yml` from the mirror. Set parameters
   `variableGroup`, `acrServiceConnection`, `acrPullServiceConnection`,
   `deployServiceConnection`, `deployEnvironment`, `agentPool`, `vmImage` to target names. Never replace them with runtime connection macros.
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
non-secret values and sign in with `az login`. The tag check reads `SOURCE_REF` and
`SOURCE_VERSION` (the tagged commit, `HEAD` when unset) and needs the full history of the
mirror, because it requires that commit to be on `origin/main` (the pipeline checks out with
`fetchDepth: 0` for it); deployment also
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

After smoke passes, `deploy:azure` promotes the version tag and then locks `sha-<commit>` and
the version tag, in that order, with `az acr repository update --image semantic-workbench:<tag>
--write-enabled false`. `AcrPush` can rewrite any unlocked tag, and manual rollback trusts both.
The deploy connection needs the registry role in
[`registry-tag-lock-role.json`](registry-tag-lock-role.json) for this. Failed updates or smoke
checks never promote or lock a tag.

`image:push` locks `sha-<commit>` right after its first push and checks that the tag still
points to the digest the push reported. It never overwrites an existing `sha-<commit>`: a later
run on the same commit keeps the tag only if it is locked and the image's revision and version
labels name that commit and the package version, and then scans and lists the bill of materials
of that digest by reference. An unlocked or mislabelled tag stops the run.

If a run stops between the two locks, run the pipeline again on the same tag. The promotion
step sees the version tag already on the deployed digest and skips it, and the locks are applied
again; a version tag that points to another digest stops the run.

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

## Moving a data folder from local mode to server mode

Files deleted in local mode went to the trash without a commit, so the repository folders under
`data/projects/` report them as deleted, and a publish refuses to move files over a changed
checkout. At every start in server mode the workbench restores those files from the last commit,
leaves their trash entries in place, and writes one line to standard output:
`{"type":"published-checkout-restored","repo":"<folder>","paths":["<path>", ...]}`. Starting again
finds nothing to restore and writes nothing.

Any other change in a repository folder of `data/projects/` (an edited or untracked file, or a
deletion with no trash entry) stops the start with a message naming the paths. Commit or discard
them with Git in that folder, then start again.

## Alternatives and scaling

App Service for Containers is an alternative target, not supported by these Container Apps
scripts. Use one Linux instance, persistent Azure Files at `/data`, managed identity for registry
and Key Vault, HTTPS and the same environment/probes. Its owner must supply and validate a
separate deployment/rollback adapter before using it.

Scale vertically first. Multiple replicas cannot safely share the Git workspace. A horizontal
scale design needs repository ownership partitioning or coordinated storage/leases and shared
session handling; changing the replica count alone is unsafe. Keep SQLite cache on local disk.

Administration state also lives in the server process and is not shared between replicas:

- dry-run receipts, which an Admin's save or rollback must present to the replica that issued
  them;
- the administration save lock, which orders concurrent Admin changes;
- the short-lived cache of directory group names.

A second replica would refuse saves whose dry run ran on the other replica, and two Admins could
save at once without the lock. The deploy preflight (`bun run deploy:azure`) already refuses a
container app whose minimum or maximum replica count is not 1, so keep the
`--min-replicas 1 --max-replicas 1` setting above.
