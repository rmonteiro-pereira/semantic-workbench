# Delivery Pipeline Contract (local scripts → Azure DevOps Pipelines → Azure Container Apps)

Design and reasons in [research.md](../research.md) R6 and R18–R21. The GitHub repository runs nothing
automatically (FR-130): it holds no workflow and no bot configuration. The owner runs every step
locally with the scripts below; the target organisation imports the pipeline definition into
Azure DevOps from its own Azure Repos mirror (release hand-over below), and the pipeline calls the
same scripts. The target uses Microsoft Entra ID only: no stage starts or depends on Keycloak or
any identity provider outside the agent; sign-in is tested against the mock OpenID provider
(FR-141).

## Local scripts (package.json)

| Script | What it runs | Needs |
| --- | --- | --- |
| `ci:validate` | `scripts/ci-validate.ts`: steps `verify` (`check`, `bun test`, `build`), `mutation`, `browser` (every suite of `scripts/gate-suites.ts`, isolated data roots; the sign-in suites start the mock OpenID provider themselves), `image` (`image:build`, `image:scan`, `image:sbom`), `container` (`test:container`, local and server groups, the server group against the mock OpenID provider; `deploy:smoke --loopback` against the server-mode container), `pipeline` (`pipeline:lint`, `pipeline:dry-run`). `--step <name>` (repeatable) and `--suite <name>` select a subset, `--keep-going` runs every step; JUnit XML and `summary.json` in `out/ci/`; non-zero exit naming the failed steps | Bun, Playwright Chromium, Docker or Podman |
| `image:build` | `scripts/image.ts build`: Docker or Podman (auto, `--engine` to force), build arguments `SW_VERSION` (`package.json`) and `SW_COMMIT` (`git rev-parse HEAD`, `-dirty` suffix when the tree is dirty), tags `semantic-workbench:sha-<commit>` and `semantic-workbench:dev`; `--tag` adds tags | container runtime |
| `image:scan` | `scripts/image.ts scan`: Trivy (local binary, else the Trivy image pinned by digest), `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1`, `.trivyignore`; `out/image/trivy.json` and `trivy.sarif` | container runtime |
| `image:sbom` | `scripts/image.ts sbom`: Trivy SPDX JSON to `out/image/sbom.spdx.json` | container runtime |
| `image:push` | `scripts/image.ts push --registry <name>.azurecr.io`: pushes `sha-<commit>`, prints the digest; refuses a `-dirty` commit; signs in to the registry itself (`az acr login`, using the current Azure CLI session); optional locally, used by the pipeline | `az` signed in |
| `test:container` | `scripts/container-check.ts` with the suites of `scripts/container-suites.ts`; server group: starts `scripts/mock-oidc.ts` on host loopback and the image in server mode against it | container runtime, host networking |
| `mock-oidc` | `scripts/mock-oidc.ts --port <p> --shape entra\|keycloak\|generic`: runs the mock OpenID provider alone (manual sign-in, debugging); the checks start it themselves | none |
| `test:auth:keycloak` | Keycloak compatibility suite (`scripts/auth-keycloak-check.ts`): starts the pinned Keycloak with the test realm, runs the sign-in check, removes the container; fails without a container runtime. Not part of `ci:validate` or the pipeline; run on the owner's machine before each release | container runtime |
| `pipeline:lint` | `scripts/pipeline-lint.ts`: schema validation and repository rules (below) | none |
| `pipeline:dry-run` | `scripts/pipeline-dry-run.ts --run pr\|main\|tag:<vX.Y.Z>`: expands parameters with `deploy/azure-devops/sample-variables.yml`, prints stages, jobs, steps and conditions; `--execute` also runs the local steps and the Azure steps against the fake Azure client | as the executed steps |
| `deploy:check-version` | `scripts/deploy-version.ts --tag <vX.Y.Z>`: tag version core equals `package.json`; not older than the highest version ever promoted (the highest version tag in the registry; rollbacks add no tags) | `az` signed in (`--fake` offline) |
| `deploy:azure` | `scripts/deploy.ts deploy --digest <sha256:…> --version <v> --commit <sha>` | `az` signed in (pipeline: service connection) |
| `deploy:smoke` | `scripts/deploy-smoke.ts <public-url> <version> <commit> [--loopback]` | network to the URL |
| `deploy:rollback` | `scripts/deploy.ts rollback --to previous\|<vX.Y.Z>` | `az` signed in |

Every Azure-touching script reads its target values from environment variables named as in the
variable group below, fails naming any missing one before calling Azure, and accepts `--fake` to
use the fake Azure client (`tests/pipeline/fake-azure.ts`).

## Pipeline files

| File | Trigger | Content |
| --- | --- | --- |
| `azure-pipelines.yml` | CI trigger on `main` and tags `v*` of the target's Azure Repos mirror of this repository; pull-request validation through the target's branch policy on that mirror; `pr: none` | stages `Validate`, `Image`, `Deploy` |
| `azure-pipelines-rollback.yml` | `trigger: none`, `pr: none`; run manually | stage `Rollback` |
| `deploy/azure-devops/templates/validate-jobs.yml`, `image-jobs.yml`, `deploy-steps.yml`, `setup-steps.yml` | — | shared templates (Bun pinned, frozen install, Playwright browsers) |
| `deploy/azure-devops/schema/service-schema.json` | — | pinned copy of the Azure Pipelines YAML schema used by `pipeline:lint` |
| `deploy/azure-devops/sample-variables.yml` | — | sample parameter and variable values for the dry run (no real identifiers) |

### Stages

| Stage | Runs when | Jobs and steps |
| --- | --- | --- |
| `Validate` | every run | jobs `verify`, `mutation`, `browser` (literal matrix, one leg per suite of `scripts/gate-suites.ts`, kept equal by the pipeline check; the `auth` leg signs in against the mock OpenID provider on the agent's loopback with Entra-shaped claims), `pipeline` (`pipeline:lint`, `pipeline:dry-run`); each step `bun run ci:validate -- --step <name>`; `PublishTestResults@2` for the JUnit files; screenshots published on failure |
| `Image` | after `Validate` | on `v*` runs first a job `check` (`AzureCLI@2` with the push connection, read only): `bun run deploy:check-version`, so a wrong tag fails before anything is pushed and before the Deploy stage asks for approval; then `bun run ci:validate -- --step image --step container`; `PublishPipelineArtifact@1` for `out/image/` (bill of materials, scan report); on `main` and `v*` only: `AzureCLI@2` with `${{ parameters.acrServiceConnection }}` → `bun run image:push -- --registry $(ACR_NAME).azurecr.io` (signs in to the registry itself); digest passed as an output variable |
| `Deploy` | after `Image`, only for `refs/tags/v*`; stage-level `lockBehavior: runLatest` | deployment job on environment `${{ parameters.deployEnvironment }}` (strategy `runOnce`; environment approvals and checks run before the stage starts): `checkout: self` and `setup-steps.yml` (deployment jobs do not check out by default), then `AzureCLI@2` with `${{ parameters.deployServiceConnection }}` → `bun run image:scan -- --ref <registry>@<digest>` (the script signs in to the registry), then `bun run deploy:azure` (preflight; promote the version tag on the same digest with `docker buildx imagetools create --tag <registry>/semantic-workbench:vX.Y.Z <registry>/semantic-workbench@<digest>`, which needs only `AcrPush`, no rebuild; record the running revision; update by digest; wait for running and ready; `deploy:smoke`; automatic rollback on failure); summary with digest, revisions and smoke results |
| `Rollback` (rollback pipeline) | manual, queued on the tag ref `refs/tags/vX.Y.Z` of the version to restore (so the environment's branch control admits it); parameter `target` = `tag` (default: the version of the ref) or `previous` | stage-level `lockBehavior: runLatest`; deployment job on the same environment with `checkout: self` and `setup-steps.yml`: `bun run deploy:rollback -- --to <vX.Y.Z\|previous>` (preflight, deploy, smoke). The YAML and scripts come from the tag ref, so the rollback pipeline works for tags from the first version that ships it (`v0.4.0-alpha.1`) on. For `previous`, it is queued on the tag of the version currently deployed, and the smoke test expects the version and commit of the restored revision's image labels |

Approvals and checks belong to the environment (configured by the target): approval by named
people or a group, branch control allowing only `refs/tags/v*`, and the exclusive lock check. The
one-at-a-time behaviour comes from that check together with `lockBehavior: runLatest`, which is
declared at stage level on `Deploy` and `Rollback` (the check itself has no such option), so only
the newest waiting run proceeds.

### Parameters (compile time) and variable group (no secrets)

| Name | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `variableGroup` | parameter | `semantic-workbench-target` | variable group holding the values below |
| `acrServiceConnection` | parameter | `sw-azure-push` | ARM service connection (workload identity federation) with `AcrPush` on the registry |
| `deployServiceConnection` | parameter | `sw-azure-deploy` | ARM service connection (workload identity federation) with `AcrPush` and container-app update rights; may equal the push connection if the target accepts the wider identity |
| `deployEnvironment` | parameter | `production` | Azure DevOps environment holding the approvals and checks |
| `agentPool` / `vmImage` | parameter | `''` / `ubuntu-latest` | self-hosted Linux pool with Docker, or the Microsoft-hosted image |
| `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID` | variable | — | subscription and tenant of the deployment |
| `ACR_NAME` | variable | — | target registry name; repository `semantic-workbench` |
| `ACA_RESOURCE_GROUP`, `ACA_ENVIRONMENT`, `ACA_NAME` | variable | — | resource group, Container Apps environment and app |
| `APP_IDENTITY_NAME` | variable | `id-sw-app` | user-assigned identity of the container app |
| `KEY_VAULT_NAME` | variable | — | vault whose secret references the app uses |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` | variable | — | sign-in application; compared with the app's `SW_ENTRA_TENANT_ID` and `SW_OIDC_CLIENT_ID` |
| `SW_PUBLIC_URL` | variable | — | public URL the smoke test calls |

Service connection names, environment name and variable group name are parameters because Azure
DevOps resolves and authorises them when the run is compiled; runtime variables cannot name them.

## Pipeline check (`pipeline:lint`, `tests/pipeline/azure-pipelines.test.ts`)

Fails when: a file does not validate against the pinned schema; a stage among `Validate`, `Image`,
`Deploy` is missing or out of order; outside `setup-steps.yml` (pinned Bun install,
`bun install --frozen-lockfile`, Playwright Chromium with system dependencies) a `script`/`bash`
step or an `AzureCLI@2` inline script does anything but `bun run <script>` with a script present in
package.json (registry sign-in happens inside the scripts); a deployment job lacks `checkout: self`
and the setup template; the `Validate` stage lacks the `pipeline` job; the `browser`
matrix legs differ from `scripts/gate-suites.ts`; any file mentions Keycloak, a Keycloak image,
`test:auth:keycloak`, the `keycloak` Compose profile or a `services:` container (no identity
provider outside the agent); a task other than `AzureCLI@2`,
`PublishTestResults@2` and `PublishPipelineArtifact@1` is used; a task is not pinned to a major
version; a container image is
not pinned by digest; a variable is marked secret, a secret-looking literal appears, or
`addSpnToEnvironment: true` is set; `azureSubscription` is anything but a service-connection
parameter; the Deploy stage has no `refs/tags/v*` condition or is not a deployment job on
`${{ parameters.deployEnvironment }}`; a gate `test:*` script of package.json is missing from
`scripts/gate-suites.ts`, from `scripts/container-suites.ts` without a recorded exclusion, or from
the `browser` matrix (`test:auth:keycloak` is a recorded exclusion: compatibility suite run on the owner's machine); `.trivyignore` lines lack `# reason; expires YYYY-MM-DD` or are expired;
`.github/workflows/` or `.github/dependabot.yml` exists (FR-130).

## Image

- Local tags `semantic-workbench:sha-<commit>` and `:dev`; registry
  `<ACR_NAME>.azurecr.io/semantic-workbench` with `sha-<40-hex commit>` (pushed by `Image` on
  `main` and `v*`) and `vX.Y.Z` (and pre-release forms) on the same digest after a version
  deployment's approval. Deployments always use `@sha256:<digest>`.
- Labels: `org.opencontainers.image.version`, `.revision`, `.source`, `.created`.
- Artifacts per build: `sbom.spdx.json` (SPDX JSON), `trivy.json`, `trivy.sarif` (local `out/image/`;
  pipeline artifacts in the target).
- Scan gate: critical or high with a fix fails; ignore entries need a reason and an unexpired date.

## Azure resources and Azure DevOps items the target sets up (by hand, `deploy/README.md`)

| Item | Settings the pipeline relies on | Roles |
| --- | --- | --- |
| Resource group | holds the resources below | — |
| Log Analytics workspace | receives container stdout (audit mirror) | — |
| Container Apps environment | consumption profile; Azure Files storage registered (an NFS share needs an environment with its own virtual network; SMB otherwise) | — |
| Storage account + file share | NFS (premium) or SMB with `uid=1000,gid=1000` mount options | — |
| Key Vault (RBAC) | `sw-session-key`, provider and GitHub app secrets | `id-sw-app`: Key Vault Secrets User |
| Container registry (admin user off) | repository `semantic-workbench`; retention rule for untagged manifests | `id-sw-app`: `AcrPull`; push and deploy identities: `AcrPush` (pushing and tagging; no import right needed) |
| Container app | single revision mode, min = max replicas 1, ingress 4310, probes `/healthz` and `/readyz`, volume `/data`, identity `id-sw-app`, env of configuration.md with Key Vault references | deploy identity: Contributor on this resource only, plus, if required, the environment join action and Managed Identity Operator on `id-sw-app` (assigning a user-assigned identity); final set recorded by the owner's trial report |
| `id-sw-app` | user-assigned identity of the container app (created first); federated credential of the Entra sign-in app | as above |
| Entra app registration (sign-in) | quickstart §5: no app roles; groups claim, optional claims `email`, `upn`, `xms_edov`; application permission `GroupMember.Read.All` with admin consent | — |
| Service connections `sw-azure-push`, `sw-azure-deploy` | Azure Resource Manager, workload identity federation (automatic, or manual with the target's own app registration or managed identity, copying the issuer and subject shown on the service connection page), scoped as above; pipeline permission granted only to the two pipelines | as above |
| Environment `production` | approvals, branch control (`refs/tags/v*`), exclusive lock | — |
| Variable group `semantic-workbench-target` | the variables above, none secret; pipeline permission granted only to the two pipelines | — |
| Agent pool | Microsoft-hosted `ubuntu-latest` or a self-hosted Linux pool with Docker | — |
| Azure Repos mirror | repository in the target project, updated only by the release hand-over below | people who hand releases over: Contribute and Create tag |
| Pipelines | `azure-pipelines.yml` and `azure-pipelines-rollback.yml` imported from the target's Azure Repos mirror of this repository (never connected to this GitHub repository, so nothing runs on it); branch policy on `main` requiring the `Validate` and `Image` stages for pull requests | — |

## Deploy preflight (fails the deployment, names the setting)

Revision mode `Single`; `minReplicas = maxReplicas = 1`; a volume mounted at `/data` of type
`AzureFile` or `NfsAzureFile`; user-assigned identity `APP_IDENTITY_NAME` attached; registry
configured with that identity; `SW_MODE=server`; `SW_HOST=0.0.0.0`; ingress target port 4310;
secret references point to `KEY_VAULT_NAME`; `SW_OIDC_CLIENT_ID` and `SW_ENTRA_TENANT_ID` equal
the variable group's Entra values.

## Smoke test (`deploy:smoke <public-url> <version> <commit>`)

Exit 0 only when: `/readyz` reports state `serving` within 3 minutes (`handover` is waited out);
`/healthz` reports the commit and the `package.json` version of that commit; `GET /api/projects`
without cookie → 401 with no project name in the body; `GET /` without cookie → 302 straight to
the provider (no workbench sign-in page); `/auth/login` → 302 to the
`authorization_endpoint` of `<issuer>/.well-known/openid-configuration` with
`code_challenge_method=S256`; `Strict-Transport-Security`, `Content-Security-Policy` and
`X-Content-Type-Options` present; the sign-in state cookie is `Secure; HttpOnly`. `--loopback`
relaxes only HSTS and the `Secure` flag. Output: one line per check and a JSON summary.

## Deploy script (`scripts/deploy.ts`)

Version check, preflight, record of the running revision and digest, update, wait for the
revision, smoke test and rollback live in one script; Azure calls go through a small client
interface (Azure CLI on the agent or the owner's machine, a fake in `tests/pipeline/deploy.test.ts`
and in the dry run), so the decision logic is unit- and mutation-tested.

## Rollback

Automatic: the revision running before the update is recorded; on smoke failure it is restored as
a new revision (`az containerapp revision copy --from-revision <recorded>`, same image digest and
configuration) and smoke-tested with its own version and commit; the run fails in both cases.
Manual: `azure-pipelines-rollback.yml`, queued on a version tag ref, deploys that version (resolved
to its digest in the registry) or, with `target: previous`, restores the revision before the
active one, through the same environment; runs on a non-tag ref are refused.

## Release hand-over to the target's Azure Repos mirror (`deploy/README.md`, FR-142)

Nothing connects the mirror or the pipeline to this GitHub repository. For each release:

1. The owner runs `bun run ci:validate` on the release commit, sets the `package.json` version and
   creates the annotated tag `vX.Y.Z` (pre-releases `vX.Y.Z-alpha.N`).
2. Hand-over, one of:
   - **Push** (someone with mirror access and a clone of this repository):
     `git remote add target <mirror-url>` once; `git push target vX.Y.Z^{commit}:refs/heads/release/vX.Y.Z`;
     open a pull request from `release/vX.Y.Z` into `main` (the branch policy runs Validate and
     Image) and complete it; then `git push target vX.Y.Z`. The tag points to the release commit
     whatever merge type the pull request used, so the tag run builds exactly that commit. Tags
     are not subject to branch policies; pushing one needs the Create tag permission.
   - **Git bundle** (no shared access): the owner runs
     `git bundle create semantic-workbench-vX.Y.Z.bundle vX.Y.Z` and
     `sha256sum semantic-workbench-vX.Y.Z.bundle > semantic-workbench-vX.Y.Z.bundle.sha256` and
     sends both files; the receiver runs `sha256sum -c` and `git bundle verify`, fetches the tag
     from the bundle into a clone of the mirror (`git fetch <bundle> 'refs/tags/*:refs/tags/*'`)
     and continues as for **Push**. Commits and the
     tag keep their identifiers, so `/healthz` and the `sha-` image tag name the same commit as
     this repository.
   - **Source archive** (fallback): `git archive --format=tar.gz vX.Y.Z` committed into the
     mirror; the mirror's commit differs, so the receiver records "release vX.Y.Z = mirror commit
     <sha>" in the tag message.
3. The tag run waits for the `production` environment's approval, then deploys (stages above).

## Owner trial runbook (`deploy/trial-runbook.md`, FR-143; owner acceptance)

Run by the owner on the trial organisation and subscription; the implementer has no access and
does not run it. Each step lists the command or portal action, the expected output and a pass or
fail box:

1. Azure resources and Azure DevOps items from `deploy/README.md` (table above); expected: every
   item present, the variable group holds no secret.
2. Release hand-over of `v0.4.0-alpha.1` (above); expected: the mirror shows the same commit.
3. Preview run of both pipelines; expected: Validate, Image, Deploy for a tag; no Keycloak.
4. `main` run; expected: Validate and Image pass, `sha-<commit>` in the registry
   (`az acr repository show-tags`), bill of materials and scan report as artifacts.
5. Tag run; expected: version check passes, approval requested; after approval rescan, version
   tag on the same digest, new revision, smoke test passes; time from approval to smoke result
   (SC-015).
6. Entra checklist (quickstart §5): direct redirect to Entra with no workbench sign-in screen;
   a bootstrap Admin grants a role to an Entra group and to an e-mail address; members of the
   group and the person with that address get their roles; a user without a grant sees **No
   access**; sign-out lands on **Signed out**; push to Azure DevOps as an Editor shows the
   person as author.
7. Restart of the revision: sessions and data survive; revision update hand-over interruption
   measured (SC-017).
8. Rollback drill: rollback pipeline with `previous`; time until the previous revision serves
   (SC-015).
9. No stored credential: repository, pipeline and variable group hold none; service connection
   sign-ins are federated (SC-016); final deploy role set noted.

Report block (copied into `specs/003-authn-authz/verification.md` under "Owner trial", with
subscription, tenant, registry and resource identifiers replaced by placeholders):

```text
Trial date:            Release: vX.Y.Z  Commit: <40 hex>  Hand-over: push | bundle | archive
Step 1..9:             pass | fail, one line each with the observed output or the error text
Digest deployed:       sha256:<…>       Revisions: <before> -> <after>
SC-015 approval->smoke: <min>  rollback: <min>      SC-017 interruption: <s>
Deploy role set:       <roles and scopes>
Open issues:           <one line each; each becomes a follow-up task>
```
