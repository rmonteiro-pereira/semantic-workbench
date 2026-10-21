# Quickstart: validating v0.4.0

Prerequisites: Bun 1.4+, Git 2.40+, Docker Engine, Docker Desktop (host networking enabled, §4)
or Podman (Keycloak checks, image, container suites), Playwright browsers. Everything below runs on
your own machine; nothing runs on the GitHub repository.
Contracts: [http-api.md](./contracts/http-api.md), [configuration.md](./contracts/configuration.md).

## 1. Local mode is unchanged

```sh
bun install
bun test && bun --bun run check && bun --bun run build
bun run dev            # http://127.0.0.1:5173, no sign-in, header shows Admin
bun run test:ui && bun run test:responsive && bun run test:mutation
```

Expected: every v0.3.0 suite passes; `SW_HOST=0.0.0.0 bun server/index.ts` refuses to start.

## 2. Server mode with the stub provider (no container)

```sh
bun test tests/auth            # claims, sessions, guards, filters, matrix with the stub provider
bun run test:auth              # browser: sign-in, roles, hidden files, Admin panel, two editors
```

Expected: matrix reports 0 mismatches and 0 leaked markers (SC-001, SC-002).

## 3. Server mode against Keycloak

```sh
bun run test:auth:keycloak     # starts quay.io/keycloak/keycloak:26.4 with tests/fixtures/keycloak/realm.json
```

Manual run: start Keycloak with the realm, then

```sh
SW_MODE=server SW_PUBLIC_URL=http://localhost:4310 SW_OIDC_PROVIDER=keycloak \
SW_OIDC_ISSUER=http://localhost:8080/realms/workbench SW_OIDC_CLIENT_ID=semantic-workbench \
SW_OIDC_CLIENT_SECRET=dev-secret SW_SESSION_KEY=$(openssl rand -base64 32) \
SW_BOOTSTRAP_ADMINS=dave@example.org DATA_DIR=$(mktemp -d) bun run build && bun server/index.ts
```

(`http://localhost` is accepted only when `SW_PUBLIC_URL` is a loopback URL; the cookie then
drops `Secure` and the `__Host-` prefix, for development only.) Sign in as `alice`, `bob`,
`carol`, `dave`, `erin` (password `test`); compare with the spec's role matrix.

## 4. Container (available from Phase 3)

```sh
docker compose --profile local up --build         # local mode from the image, host networking
# http://127.0.0.1:4310, no sign-in, workspace in ./.data (your real data: never run suites here)
bun run test:container                            # builds the image, runs every suite of scripts/container-suites.ts
                                                  # against a container with a temporary data folder
```

Server profile (from Phase 5): `cp .env.server.example .env.server`, then

```sh
docker compose --profile server up --build        # Keycloak on 127.0.0.1:8080 + workbench in server mode
curl -fsS localhost:4310/healthz && curl -fsS localhost:4310/readyz
bun scripts/deploy-smoke.ts http://localhost:4310 dev $(git rev-parse HEAD) --loopback
```

Sign in as `alice` (password `test`). Restart the `workbench-server` service and confirm the
session and data survive (SC-009); start a second container of the same image on the same
volume with `SW_PORT=4311` and confirm `/readyz` on 4311 is 503 and its log names the
single-replica constraint (FR-122). Check `docker compose exec workbench-server id -u`
is not 0.

Without host networking local mode is unreachable by design (OP-8). Docker Desktop: 4.34 or
later, **Settings → Resources → Network → Enable host networking**, then **Apply & restart**
(Linux containers only). Docker Engine on Linux or WSL2 and Podman need no setting.

## 5. Microsoft Entra ID (manual, recorded in verification.md)

1. App registration (single tenant), redirect `https://<host>/auth/callback`, app roles Viewer,
   Editor, Steward, Admin (users/groups) and Agent (applications); assign roles to groups.
2. Token configuration: groups claim "Groups assigned to the application"; optional claims
   `email`, `upn`.
3. Expose an API `api://<client-id>` with scope `access_as_user`; add API permission Azure DevOps
   `user_impersonation`; for overage, application permission `GroupMember.Read.All`; grant admin
   consent.
4. Credential: federated credential for the container app's user-assigned identity `id-sw-app` (or a secret in Key
   Vault).
5. Create the Azure resources and Azure DevOps items of
   [delivery-pipeline.md](./contracts/delivery-pipeline.md) by hand following `deploy/README.md`,
   deploy through the target's pipeline (§7), sign in with users of each role, push to Azure
   DevOps as an Editor and check the push author.

## 6. Admin panel

As `dave`: assign a project to a domain, map a group to Steward, run **Access check** for
`alice`, edit a rule with **Dry run**, roll back, try to deactivate the last Admin (refused),
export the audit log filtered to today.

## 7. Local build and the Azure DevOps pipeline (from Phase 4; delivery from Phase 6)

On your machine:

```sh
bun run ci:validate                     # the whole gate: verify, mutation, browser, keycloak,
                                        # image (build, scan, sbom), container, pipeline
bun run ci:validate -- --step verify    # one step; --suite <name> for one browser suite
bun run image:build && bun run image:scan && bun run image:sbom   # out/image/sbom.spdx.json
bun run pipeline:lint                   # azure-pipelines*.yml against the pinned schema and rules
bun run pipeline:dry-run -- --run tag:v0.4.0-alpha.1 --execute   # stages, conditions, fake Azure
```

Expected: a failing unit test, an unignored fixable critical or high finding, or a pipeline step
that is not a package script fails the run and names the step; the dry run shows Validate and
Image for a pull request, Image push for `main`, and Deploy only for the tag, with the deploy and
rollback decisions taken against the fake Azure client. `ls .github/workflows` finds nothing.

In the target (trial organisation and subscription, recorded in verification.md):

1. Set up the items of `deploy/README.md`: service connections with workload identity federation,
   environment `production` with approvals, branch control and exclusive lock, variable group
   `semantic-workbench-target`, agent pool; import `azure-pipelines.yml` and
   `azure-pipelines-rollback.yml`; run a preview run to check the expansion.
2. Run the pipeline on `main`: Validate and Image pass, `sha-<commit>` appears in the registry
   (`az acr repository show-tags -n <acr> --repository semantic-workbench`), the bill of materials
   and scan report are pipeline artifacts.
3. Push tag `v0.4.0-alpha.1`: the version check passes, the run waits for approval, then rescans,
   tags, deploys by digest and smoke-tests; the summary shows the digest and the smoke result.
4. Rollback drill: run the rollback pipeline with `previous` and confirm the smoke test passes. The
   automatic rollback path is covered locally by `tests/pipeline/deploy.test.ts` and the dry run.
5. Confirm the repository, the pipeline definition and the variable group hold no secret and that
   every Azure sign-in used the federated service connections (SC-016).
