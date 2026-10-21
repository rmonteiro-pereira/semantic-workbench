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

## 4. Container

```sh
docker build -t semantic-workbench:0.4.0 .
docker run --rm -p 4310:4310 -v "$PWD/.data:/data" --env-file .env.server semantic-workbench:0.4.0
curl -fsS localhost:4310/healthz && curl -fsS localhost:4310/readyz
```

Restart the container and confirm the session and data survive (SC-009); start a second
container on the same volume and confirm it refuses to serve (FR-122).

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
5. Deploy to Azure Container Apps (one replica, Azure Files at `/data`, cache on local disk),
   sign in with users of each role, push to Azure DevOps as an Editor and check the push author.

## 6. Admin panel

As `dave`: assign a project to a domain, map a group to Steward, run **Access check** for
`alice`, edit a rule with **Dry run**, roll back, try to deactivate the last Admin (refused),
export the audit log filtered to today.
