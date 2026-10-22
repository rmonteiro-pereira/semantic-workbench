# Quickstart: validating v0.4.0

Prerequisites: Bun 1.4+, Git 2.40+, Docker Engine, Docker Desktop (host networking enabled, §4)
or Podman (image, container suites, Keycloak compatibility suite), Playwright browsers. Everything below runs on
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

## 2. Server mode with the mock OpenID provider (no container, no external provider)

```sh
bun test tests/auth            # claims (Entra, Keycloak, overage, verified e-mail), grants, role
                               # compiler, sessions, guards, filters, matrix
bun run build                 # the auth check serves dist/ without Vite
bun run test:auth              # browser: starts the mock provider (Entra shape) on loopback; direct
                               # redirect, sign-in, refresh, sign-out page, No access (erin, gina),
                               # group and e-mail grants, overage user olga, hidden files
```

Expected: matrix reports 0 mismatches and 0 leaked markers (SC-001, SC-002); every sign-in case of
SC-019 passes. This is what the target pipeline runs; it needs no network.

Manual run against the mock: `bun run mock-oidc -- --port 8081 --shape entra` prints its issuer
(`http://127.0.0.1:8081/<tenant-id>/v2.0`), client id and secret; start the server as below with
`SW_OIDC_PROVIDER=entra`, that issuer, `SW_ENTRA_TENANT_ID=<tenant-id>` and
`SW_GRAPH_URL=http://127.0.0.1:8081/graph`, and pick a test user on the chooser page (the mock's
page, standing in for Entra; the workbench has none). Access comes from the grants seeded in the
fixture's `data/admin/grants.json`: `alice`, `carol`, `frank`, `olga` and `dave` by group, `bob`
and `hank` by e-mail (bob's token spells his address `Bob@Example.org`); `erin` has no grant and
an Admin app role in her token, `gina` is a guest whose e-mail grant cannot match an unverified
address: both see **No access**.

## 3. Keycloak compatibility suite (owner's machine; not in `ci:validate` or the pipeline)

```sh
bun run test:auth:keycloak     # starts quay.io/keycloak/keycloak:26.4 with tests/fixtures/keycloak/realm.json
```

Run it before each release and record the result in verification.md. Manual run: start Keycloak
with the realm (or `docker compose --profile keycloak up -d keycloak`), then

```sh
bun run build
SW_MODE=server SW_PUBLIC_URL=http://127.0.0.1:4310 SW_OIDC_PROVIDER=keycloak \
SW_OIDC_ISSUER=http://127.0.0.1:8080/realms/workbench SW_OIDC_CLIENT_ID=semantic-workbench \
SW_OIDC_CLIENT_SECRET=semantic-workbench-test-secret SW_SESSION_KEY=$(openssl rand -base64 32) \
SW_BOOTSTRAP_ADMINS=dave@example.org DATA_DIR=$(mktemp -d) bun server/index.ts
```

(`http://localhost` is accepted only when `SW_PUBLIC_URL` is a loopback URL; the cookie then
drops `Secure` and the `__Host-` prefix, for development only.) Copy the fixture's `data/admin/`
into the data folder for the seeded grants (Keycloak group names instead of Entra object IDs).
Sign in as `alice`, `bob`, `carol`, `dave`, `erin`, `gina` (password `test-<username>`,
for example `test-alice`; `gina` has
`email_verified=false`); compare with the spec's role matrix.

## 4. Container (available from Phase 3)

```sh
docker compose --profile local up --build         # local mode from the image, host networking
# http://127.0.0.1:4310, no sign-in, workspace in ./.data (your real data: never run suites here)
bun run test:container                            # builds the image, runs every suite of scripts/container-suites.ts
                                                  # against a container with a temporary data folder
```

Server mode in the container (from Phase 5): `bun run test:container` also runs the server group:
it starts the mock OpenID provider on host loopback and the image in server mode against it, signs
in as each test user, restarts the container (sessions and data survive, SC-009), starts a second
container of the same image on the same volume with `SW_PORT=4311` (`/readyz` 503, log names the
single-replica constraint, FR-122), starts a container of a different revision on the same volume
(hand-over within shutdown + 30 s, SC-017), checks the user id is not 0, and runs
`deploy:smoke --loopback`.

Keycloak compatibility profile (owner's machine): `cp .env.server.example .env.server`,
generate a session key with `openssl rand -base64 32` and set `SW_SESSION_KEY`.
The copied `.env.server` will not start until that key is generated. Then seed
`.server-workspace/admin` as described in README §Sign-in testing. Then

```sh
export SW_VERSION=$(bun -e 'console.log(require("./package.json").version ?? "dev")') SW_COMMIT=$(git rev-parse HEAD)
docker compose --profile keycloak up --build -d   # Keycloak on 127.0.0.1:8080 + workbench in server mode
curl -fsS localhost:4310/healthz && curl -fsS localhost:4310/readyz
bun run deploy:smoke -- http://localhost:4310 "$SW_VERSION" "$SW_COMMIT" --loopback
```

Sign in as `alice` (password `test-alice`) at `http://127.0.0.1:4310`.

Without host networking local mode is unreachable by design (OP-8). Docker Desktop: 4.34 or
later, **Settings → Resources → Network → Enable host networking**, then **Apply & restart**
(Linux containers only). Docker Engine on Linux or WSL2 and Podman need no setting.

## 5. Microsoft Entra ID on the real tenant (manual checklist, run by the owner, recorded in verification.md)

The target uses Entra only. The mock covers the flow and claim mapping; this checklist covers
what the mock cannot (conditional access, consent, tenant token lifetimes, real Graph and Azure
DevOps permissions).

1. App registration (single tenant), redirect `https://<host>/auth/callback`, front-channel
   logout URL, post-sign-out redirect `https://<host>/auth/signed-out`. No app roles are needed
   (roles come from the workbench's access grants).
2. Token configuration: groups claim "Security groups" emitting group IDs (or "Groups assigned
   to the application" if the target assigns the granted groups to the enterprise application,
   which avoids overage); optional claims `email`, `upn` and `xms_edov` on the ID token.
3. Expose an API `api://<client-id>` with scope `access_as_user`; add API permission Azure DevOps
   `user_impersonation`; application permission `GroupMember.Read.All` (overage resolution and
   group display names); grant admin consent.
4. Credential: federated credential for the container app's user-assigned identity `id-sw-app` (or a secret in Key
   Vault).
5. Create the Azure resources and Azure DevOps items of
   [delivery-pipeline.md](./contracts/delivery-pipeline.md) by hand following `deploy/README.md`
   and deploy through the target's pipeline (§7).
6. Open the workbench URL in a private window: the browser goes straight to the Entra sign-in
   (no workbench sign-in screen). Sign in as a bootstrap Admin (`SW_BOOTSTRAP_ADMINS`).
7. In **Admin → Roles & access**, add a grant for an Entra security group by object ID (the
   group's display name appears beside the ID) and a grant for one person's e-mail address
   written in mixed case. Members of the group and that person sign in and get their roles; a
   tenant user with neither sees **No access** with their name and address and can sign out; a
   guest user granted by e-mail without `xms_edov` sees **No access**.
8. Create a custom role, add a group as member scoped to one domain, and confirm its permissions
   in **Access check** and in the member's session.
9. Overage: a user in more groups than the token carries signs in and gets the roles of a
   granted group (Graph `checkMemberGroups`); with the Graph permission removed, the person sees
   the no-membership message, group names show "name not resolved", and an audit entry is
   written.
10. Remove a user from a granted group in Entra: after the next token refresh (or **End
    session**), the role is gone. Sign out: the browser lands on **Signed out** and is not
    signed in again until **Sign in again**.
11. Push to Azure DevOps as an Editor and check the push author.

## 6. Admin panel

As `dave`: assign a project to a domain; in **Roles & access** grant Steward on Sales to a
group by object ID (display name shown) and Editor on one project to `Erin@Example.org` (erin
gets access at her next request); create the custom role "Metric reviewer" (approve metrics,
document type metric) with a group member scoped to Sales and check the "what changes for whom"
dry run; run **Access check** for `alice` and for a hypothetical person described by groups and
an address; delete the custom role (confirmation lists the affected people); edit a rule with
**Dry run**, roll back, try to deactivate the last Admin and to delete a built-in role (both
refused), export the audit log filtered to today.

## 7. Local build and the Azure DevOps pipeline (from Phase 4; delivery from Phase 6)

On your machine:

```sh
bun run ci:validate                     # the whole gate: verify, mutation, browser,
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

`pipeline:lint` also confirms that no pipeline file mentions Keycloak or a service container
(SC-019). These local results, with the container suites, are the implementation's done criteria
for delivery.

Release hand-over (owner): tag the release, then push it to a `release/vX.Y.Z` branch of the
target's Azure Repos mirror, merge that into `main` by pull request and push the tag, or send a
Git bundle with its checksum (`git bundle create semantic-workbench-vX.Y.Z.bundle vX.Y.Z`) to
someone with mirror access; details in `deploy/README.md`.

In the target (owner acceptance; the implementer has no access): follow
`deploy/trial-runbook.md` step by step on the trial organisation and subscription (set-up,
hand-over, preview run, `main` run, tag run with approval and smoke test, Entra checklist of §5,
restart and hand-over, rollback drill, no stored credential), tick each expected output, and
return the filled report block; it is recorded in verification.md under "Owner trial", and each
failed step becomes a follow-up task.
