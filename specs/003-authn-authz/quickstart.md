# Quickstart: validating v0.4.0

Prerequisites: Bun 1.4+, Git 2.40+, Docker or Podman (Keycloak checks), Playwright browsers.
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
# http://127.0.0.1:4310, no sign-in, workspace in ./.data
SW_BASE_URL=http://127.0.0.1:4310 bun run test:ui # same suite against the image
bun run test:container                            # builds the image, runs every suite of scripts/container-suites.ts
```

Server profile (from Phase 5): `cp .env.server.example .env.server`, then

```sh
docker compose --profile server up --build        # Keycloak on 127.0.0.1:8080 + workbench in server mode
curl -fsS localhost:4310/healthz && curl -fsS localhost:4310/readyz
bun scripts/deploy-smoke.ts http://localhost:4310 dev $(git rev-parse HEAD) --loopback
```

Sign in as `alice` (password `test`). Restart the `workbench-server` service and confirm the
session and data survive (SC-009); start a second container of the same revision on the same
volume and confirm it refuses to serve (FR-122). Check `docker compose exec workbench-server id -u`
is not 0.

Without host networking (Docker Desktop with the option off) local mode is unreachable by design
(OP-8); use server mode or enable host networking.

## 5. Microsoft Entra ID (manual, recorded in verification.md)

1. App registration (single tenant), redirect `https://<host>/auth/callback`, app roles Viewer,
   Editor, Steward, Admin (users/groups) and Agent (applications); assign roles to groups.
2. Token configuration: groups claim "Groups assigned to the application"; optional claims
   `email`, `upn`.
3. Expose an API `api://<client-id>` with scope `access_as_user`; add API permission Azure DevOps
   `user_impersonation`; for overage, application permission `GroupMember.Read.All`; grant admin
   consent.
4. Credential: federated credential for the Container App's managed identity (or a secret in Key
   Vault).
5. Create the Azure resources of [delivery-pipeline.md](./contracts/delivery-pipeline.md) by hand
   following `deploy/azure/README.md`, deploy through the pipeline (§7), sign in with users of
   each role, push to Azure DevOps as an Editor and check the push author.

## 6. Admin panel

As `dave`: assign a project to a domain, map a group to Steward, run **Access check** for
`alice`, edit a rule with **Dry run**, roll back, try to deactivate the last Admin (refused),
export the audit log filtered to today.

## 7. Pipeline (from Phase 4; delivery from Phase 6)

1. Open a pull request: `ci.yml` runs `verify`, `mutation`, `browser`, `keycloak`, `image`,
   `container`; all must pass before merge. A failing unit test or an unignored fixable
   critical/high finding fails the run.
2. Merge: `publish` pushes `sha-<commit>` and `main` to the registry (check with
   `az acr repository show-tags -n <acr> --repository semantic-workbench`).
3. `git tag v0.4.0-alpha.1 && git push origin v0.4.0-alpha.1`: `release.yml` checks the tag,
   waits for approval in `production`, then rescans, promotes, deploys and smoke-tests; the job
   summary shows the digest and the smoke result.
4. Rollback drill: run `rollback.yml` with the previous version and confirm the smoke test passes
   on it. The automatic rollback path is covered on every change by `tests/ci/deploy.test.ts`
   (`scripts/deploy.ts` against a fake Azure client) and recorded once on Azure in
   verification.md.
5. Confirm the repository, its environments and variables hold no Azure or registry secret
   (SC-016).
