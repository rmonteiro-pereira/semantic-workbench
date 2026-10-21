# Research: Sign-In, Roles and Access Control (v0.4.0)

Each decision lists what was chosen, why, and what was rejected. Library versions were installed
and exercised under Bun 1.4.0 in an isolated scratch project on 2026-10-21; the measurements
below come from that probe.

## R1 OpenID Connect client: `openid-client` 6.8.8

- **Decision**: `openid-client` 6.8.8 (MIT, maintained by the author of `jose`, built on
  `oauth4webapi`; Web Crypto and `fetch` only, no Node-specific APIs). Used for discovery,
  authorization URL with PKCE and nonce, code exchange with ID-token validation, refresh,
  userinfo, end-session URL and the generic grant used for on-behalf-of (R8).
- **Evidence**: under Bun 1.4.0 `randomPKCECodeVerifier`, `calculatePKCECodeChallenge`,
  `discovery`, `authorizationCodeGrant`, `refreshTokenGrant`, `genericGrantRequest` and
  `buildEndSessionUrl` import and run; installed size 236 KB plus `oauth4webapi` 332 KB.
- **Client authentication**: client secret (Keycloak, simple Entra setups) or `private_key_jwt`
  with a client assertion. On Azure the recommended Entra credential is a federated identity
  credential that trusts the container's managed identity: the server asks the platform identity
  endpoint for a token for `api://AzureADTokenExchange` and sends it as the client assertion, so
  no client secret exists anywhere.
- **Rejected**: MSAL Node (Entra-only, Keycloak would need a second path; larger); Azure built-in
  authentication ("Easy Auth"; ties the app to one platform, no Keycloak path, harder to test
  locally); browser-side tokens with MSAL.js or keycloak-js (tokens in the browser, the
  live-update stream cannot send an `Authorization` header, owner chose server-held sessions);
  hand-written OIDC on `oauth4webapi` alone (more security-critical code to own).

## R2 Bearer token validation: `jose` 6.2.13

- **Decision**: `jose` 6.2.13 (MIT, 412 KB installed) `jwtVerify` with `createRemoteJWKSet` on the
  provider's `jwks_uri` (cached, refreshed on unknown `kid`, at most once per 5 minutes).
  Checks: signature (RS256/ES256 only), issuer, audience (the workbench API), `exp`/`nbf` with
  300 s tolerance, required role `Agent` (Entra app role on the application; Keycloak client role
  on the service account), Entra `tid` and `idtyp=app`.
- **Evidence**: sign/verify round trip with an RS256 key pair under Bun 1.4.0.
- **Rejected**: token introspection per call (network call per request, Keycloak-only).

## R3 Policy engine: Cedar through `@cedar-policy/cedar-wasm` 4.14.0

- **Decision**: `@cedar-policy/cedar-wasm` 4.14.0 (Apache-2.0), imported as
  `@cedar-policy/cedar-wasm/nodejs`, server side only. Policies preparsed once
  (`preparsePolicySet`, `preparseSchema`) and evaluated with `statefulIsAuthorized`.
- **Evidence (Bun 1.4.0)**: module load 17.6 ms; correct allow/deny with role hierarchy, entity
  attributes and a `forbid` override; 5,000 preparsed decisions in 357 ms (about 0.07 ms each);
  500 decisions re-parsing the policy text each time took 96 ms (about 0.19 ms each). The default
  ESM entry (`@cedar-policy/cedar-wasm`) fails under Bun because it imports the `.wasm` file as an
  ES module; the `/nodejs` entry (loads the binary with `fs`) works. Package size 13 MB on disk
  (4.2 MB WASM per entry); never shipped to the browser.
- **Filtering cost**: file read rules depend only on project and path pattern (FR-032), so
  `filter()` evaluates one decision per (principal, action, project, matching rule set) and
  memoises it for the request; a 5,000-file workspace in 20 projects needs tens of evaluations,
  not 5,000. The 150 ms budget of SC-006 is checked by `tests/auth/filter-perf.test.ts`.
- **Fallback (documented, not built)**: (a) if a later Bun breaks the `/nodejs` entry, use the
  `/web` entry and instantiate the WASM bytes explicitly with `WebAssembly.instantiate`; (b) if
  WASM cannot run at all, a TypeScript evaluator of the same baseline and of the structured rule
  templates (no raw-policy editor) passes the same authorization test matrix; raw Cedar policies
  would be disabled until the engine returns. The decision boundary (`authorize`/`filter`) hides
  the engine, so neither fallback touches routes.
- **Rejected**: OPA/Rego (sidecar or heavier WASM build, second language for reviewers);
  Casbin (weak for attribute conditions on nested resources, no schema validation of policies);
  plain TypeScript only (no reviewable, validated policy language for the Admin panel's editor).

## R4 Sessions and CSRF

- **Decision**: opaque 256-bit session id in cookie `__Host-sw-session` (`Secure; HttpOnly;
  SameSite=Lax; Path=/`, no `Domain`). Session records in memory, persisted to
  `data/state/sessions/<sha256(id)>.json` encrypted with AES-256-GCM (Web Crypto) under
  `SW_SESSION_KEY` (32 random bytes, base64, from Key Vault); the file name is a hash so the
  cookie value is never on disk. Inactivity 8 h, absolute 24 h (Admin-editable). Lax (not Strict)
  so the first navigation from a link or from the provider's redirect carries the cookie.
- **CSRF**: existing Origin check against `SW_PUBLIC_URL` plus a required `X-SW-Request: 1` header
  on every non-GET request (the frontend's fetch wrapper adds it; HTML forms cannot).
- **Sign-in state**: PKCE verifier, `state` and `nonce` kept in a short-lived (10 min) signed
  `__Host-sw-auth` cookie bound to the attempt; `returnTo` restricted to same-origin paths.
- **Rejected**: JWT session cookies (cannot be revoked; tokens would grow past cookie limits);
  cookie-only encrypted sessions (Admin cannot end a session).

## R5 Microsoft Entra ID specifics

- App registration (single tenant) with redirect `https://<host>/auth/callback`, front-channel
  logout URL, app roles `Viewer`, `Editor`, `Steward`, `Admin` (users/groups) and `Agent`
  (applications). Roles assigned to groups so `roles` carries RBAC and tokens stay small.
- Groups claim: "Groups assigned to the application" (recommended: emits only assigned groups,
  avoiding overage); otherwise security groups with overage handling: when the ID token carries
  `hasgroups` or `_claim_names.groups`, the server calls Microsoft Graph
  `POST /users/{oid}/checkMemberGroups` with the configured group ids (at most 20 per call) using
  an app-only token (application permission `GroupMember.Read.All`, admin consent). Failure →
  no domain membership, message shown, audit entry.
- Stable id `tid:oid` (`sub` is pairwise per application). `tid` must equal `SW_ENTRA_TENANT_ID`.
  Optional claims `email`, `upn`; display name from `name`.
- Scopes at sign-in: `openid profile email offline_access api://<client-id>/access_as_user` so
  the session holds an access token for the workbench API usable for on-behalf-of (R8).

## R6 Keycloak and automated tests

- Keycloak 26 container (`quay.io/keycloak/keycloak:26.4`, pinned by digest in the workflow)
  started with `start-dev --import-realm` and `tests/fixtures/keycloak/realm.json`: confidential
  client `semantic-workbench` (PKCE S256 required), client roles Viewer/Editor/Steward/Admin,
  group membership mapper (`groups`, full path off), client `sw-agent` and `sw-agent-ungranted`
  with service accounts holding client role `Agent`.
- Test users: `alice` (Sales, Editor), `bob` (Sales, Steward), `carol` (HR, Viewer),
  `dave` (Admin), `erin` (no role), `frank` (Sales + Finance group, Editor).
- CI: the `keycloak` job of `.github/workflows/ci.yml` (R18) runs `docker run` for
  Keycloak (service containers cannot pass `start-dev` arguments), waits for
  `/realms/workbench/.well-known/openid-configuration`, then `bun run test:auth:keycloak`
  (Playwright: sign-in form, role header, sign-out, live updates, agent client credentials).
  Locally the same script starts the container with Docker or Podman when available and skips
  with a clear message otherwise; unit tests use an in-process stub provider (`jose` keys).
- Entra: manual checklist in quickstart.md, results recorded in verification.md.

## R7 Per-person Git working copies

- **Layout**: base checkout `data/projects/<repo>/` (holds `.git`, kept detached at the default
  branch tip in server mode, never edited); working copies
  `data/worktrees/<userKey>/<repo>/` created with
  `git worktree add -b work/<handle> <path> <default>` and `git worktree lock`. `userKey` is
  `u` + 20 hex of SHA-256(`tid:oid` or `iss|sub`), so folder names hold no personal data.
- **Branches**: Git refuses to check out one branch in two worktrees; the UI shows "in use by
  <name>" from `git worktree list --porcelain` joined with the users registry (OP-1).
- **Publish**: in the person's copy, check `git merge-base --is-ancestor <default> HEAD`, then
  `git update-ref refs/heads/<default> <new> <old>` (compare-and-swap) and
  `git -C <base> checkout --detach <default>`; not a fast-forward → refused with **Pull from
  default branch** (`git merge --no-ff <default>` in the copy). With a remote, pushing the default
  branch is followed by the same local update; fetch fast-forwards the local default when
  possible.
- **Authorship**: `git -c user.name=<service> -c user.email=<service>` as committer and
  `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` from the principal, `--trailer "Signed-in-user: <tid:oid>"`
  (Git ≥ 2.32; workbench requires 2.40).
- **Serialization**: the existing per-repository queue (002 T011) keys on the base repository, so
  all copies of one repository share it (index locks of different worktrees are separate but
  refs and objects are shared).
- **Indexing**: the SQLite cache keys files by (copy id, project, path) and entities by blob
  hash, so identical content across copies is parsed once. Watchers start when a person's copy is
  first used and stop after 30 minutes idle (FR-076).
- **Local mode**: unchanged; no worktrees, the repository folder is the working tree.
- **Rejected**: shared tree with Git actions restricted to Stewards (owner chose per-person
  copies; Editors could not branch); one full clone per person (duplicates objects, slower).

## R8 Remote credentials in server mode

- **Passing**: each remote command runs with `-c credential.helper=` (clears inherited helpers),
  `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=<server>/bin/sw-askpass` and the username/token in
  environment variables of that single child process. Nothing is written to `.git/config`;
  `redactCredentials` keeps removing userinfo from shown URLs; tokens are masked in audit and
  error text.
- **Azure DevOps** (`dev.azure.com`, `*.visualstudio.com`): on-behalf-of grant
  (`urn:ietf:params:oauth:grant-type:jwt-bearer`, `requested_token_use=on_behalf_of`) with the
  session's workbench-API access token, scope `499b84ac-1321-427f-aa17-267ca6975798/.default`;
  token kept in the encrypted session until expiry. Requires the API permission "Azure DevOps
  user_impersonation" with consent.
- **GitHub** (`github.com` or a configured GitHub Enterprise host): GitHub App user-to-server
  token (expiring, with refresh token) or OAuth App token through **Connect GitHub**
  (`/auth/github/start` → `/auth/github/callback`, `state` bound to the session). Tokens stored
  only in the encrypted session; ended with it.
- **Other hosts**: refused in server mode unless an Admin allows the host and selects "no
  credential" (public remotes).
- **Rejected**: shared PAT or deploy key in Key Vault (hides who pushed; owner rejected).

## R9 Read filtering architecture

- `AccessView` per request: readable projects, per-project path predicate (restricted patterns),
  writable set, role per domain; built from the decision boundary with memoisation.
- `ws.documentsFor(view)` replaces `ws.documents()` in the agent routes, metrics, KPI/metric
  preview, delete impact, suggestions and the legacy document list; project listing returns
  `hiddenFiles: n` per readable project; unreadable → `NotFoundError`.
- Git read routes filter paths (`git log --name-only` post-filtered; `show`/`diff`/`versions`
  refuse unreadable paths with 404).
- Exports are client-side over data already filtered; agent-context export uses the filtered
  context.

## R10 Live updates per principal

- The hub stores each event with tags (`project`, `paths`, `owner`, `copy`) computed at emit
  time; each connection carries its principal and copy id; send and replay apply the read filter;
  the global `suggestions {open}` count becomes per person. On access-configuration change or
  session end the server sends `resync` and closes affected streams.

## R11 Guarded-field checks

- `server/auth/guards.ts` parses before and after with the shared parsers (`src/` modules used
  by validation) and produces a list of changed JSON pointers with their kinds (metric status,
  metric body, ODCS classification, critical data element, team, roles, protected property
  subtree). The policy boundary decides each guarded change (action `editGuarded` with the
  pointer kind and classification level as context). Metric demotion (FR-063) rewrites only the
  `status` value through the existing item-level edit, preserving bytes elsewhere
  (Principle II).
- The browser uses the same module to disable controls before a save (Principle III spirit).

## R12 Audit log

- JSON Lines `data/state/audit/YYYY-MM.jsonl`, appended with `O_APPEND`, flushed per entry; each
  line carries `prev` (SHA-256 of the previous line) so truncation or edits are detectable;
  mirrored to stdout as one JSON object per line (Container Apps sends stdout to Log Analytics).
- Entry fields in [contracts/audit-log.md](./contracts/audit-log.md), including a compact request
  snapshot (principal roles and groups, action, resource attributes) used by the policy dry run.
- Retention: files older than 400 days deleted at start-up and daily (configurable).

## R13 Administration repository

- `data/admin/` is a Git repository created at first start in server mode (and in local mode on
  first Admin-panel change). Files: `policies/*.cedar` (Admin rules, one per file with an
  `@id`/`@enabled` annotation), `roles.json`, `assignments.json`, `projects.json`, `agents.json`,
  `deactivated.json`, `settings.json`, validated against the pinned application schema
  `schemas/semantic-workbench-access-v1.json`. Baseline policies and the Cedar schema ship in the
  product under `policies/` and are read-only.
- Each change: hash-checked atomic writes, then one commit authored by the Admin with a message
  generated from the change; rollback = new commit restoring the chosen version's files. History,
  diff and versions reuse `server/projects/git.ts` and the diff view.
- Dry run: evaluate the authorization matrix fixture and the last 1,000 audit snapshots under the
  current and the proposed policy set; report the differences.
- Last-Admin guard: after applying the change in memory, count active principals whose effective
  role is Admin among people seen within the session lifetime plus bootstrap Admins
  (`SW_BOOTSTRAP_ADMINS`); zero → refuse.
- **Rejected**: JSON state files with a hand-made version log; storing policies in project
  repositories (editors could grant themselves access).

## R14 Azure deployment shape

- **Primary**: Azure Container Apps, one container app, revision mode single, `minReplicas = 1`,
  `maxReplicas = 1`, external HTTPS ingress to port 4310, session affinity irrelevant (one
  replica). System-assigned managed identity reads Key Vault secrets (`SW_SESSION_KEY`, provider
  client secret if used, GitHub app secret), pulls from Azure Container Registry (`AcrPull`, R19)
  and is the federated credential of the Entra app. Liveness probe `/healthz`, readiness probe
  `/readyz`, termination grace period 30 s.
- **Storage**: data root on an Azure Files share mounted at `/data` (NFS on a premium storage
  account where the region supports it for Container Apps; SMB otherwise, with mount options
  `uid=1000,gid=1000,dir_mode=0750,file_mode=0640` so the non-root user owns the files, and
  `core.filemode=false` set on managed repositories). The SQLite cache lives on the container's
  local disk (`SW_CACHE_DIR=/tmp/sw-cache`): it is rebuildable (Principle IV), and SQLite file
  locking on network shares is unreliable.
- **Image**: see R17.
- **Single instance and revision updates**: `data/state/instance.lock` holds host, pid, revision
  (`CONTAINER_APP_REVISION`, set by the platform; elsewhere `SW_VERSION+SW_COMMIT` of the image,
  else `dev`, so two containers of one image count as the same revision) and a heartbeat every
  10 s. In single revision mode Container Apps starts the new revision and waits until it is
  ready before it stops the old one; a new instance that refused to become ready while the old
  one holds the lock would block the update forever. Therefore (FR-122, FR-123): a live lock of
  the **same** revision means a second replica → refuse to serve and stay not-ready; a live lock
  of a **different** revision means a revision update → report ready, answer 503 with
  `Retry-After: 5` on every non-health route, and take the lock as soon as the old instance
  releases it in its SIGTERM handler or its heartbeat is older than 30 s. Two instances never
  serve one data root; the interruption is the old instance's shutdown plus at most 30 s
  (SC-017). The deploy job also refuses to deploy unless min and max replicas are 1 (FR-139).
- **No infrastructure as code** (owner decision): the resources are created by hand following
  `deploy/azure/README.md`, which lists them (R20) with portal and Azure CLI steps; the deploy job
  checks the settings that matter before every deployment.
- **Alternative**: App Service (Web App for Containers), Azure Storage mount (SMB), Always On,
  one instance, same environment variables; not covered by the pipeline.
- **Scale path (documented only)**: move locks to a lease service (for example blob leases),
  events to a shared bus, sessions to a shared store, keep per-instance caches; per-person copies
  stay on the shared volume.

## R15 Serving the frontend in server mode

- The Bun server serves `dist/` (built by `vp build`) with `Content-Security-Policy`
  (`default-src 'self'`; `worker-src 'self' blob:` for layout workers), `X-Content-Type-Options`,
  `Referrer-Policy: same-origin`, HSTS. Local mode keeps the Vite dev server and proxy.

## R16 Testing strategy

- Unit: claim normalisation (Entra, Keycloak, overage), session crypto and expiry, cookie flags,
  CSRF, decision boundary on the baseline policies, guards, filters, last-Admin guard, admin
  repository versioning, audit chain.
- Authorization test matrix: `tests/auth/matrix.test.ts` enumerates every route (table in
  [contracts/http-api.md](./contracts/http-api.md)) × users (anonymous, Viewer, Editor, Steward,
  Admin, deactivated, agent granted/ungranted) × target (readable, unreadable, guarded) using the
  stub provider and a fixture workspace with three domains; asserts status codes and scans every
  body and SSE frame for marker strings planted in unreadable files.
- Browser: `test:auth` (stub provider), `test:auth:keycloak` (real Keycloak), `test:admin`,
  `test:two-editors`, all on isolated data roots.
- Mutants: listed in plan.md Constitution Check VI.

## R17 Container image and Docker Compose

- **Image** (`Dockerfile`, multi-stage, every base pinned by digest):
  1. `deps`: `oven/bun:1.4` with `bun install --frozen-lockfile`.
  2. `build`: copies the sources, runs `bun --bun run build` (frontend to `dist/`).
  3. `prod-deps`: `bun install --frozen-lockfile --production`.
  4. `runtime`: `oven/bun:1.4-slim` plus the distribution's `git` package, provided its version is
     2.40 or later (the build runs `git --version` and fails below 2.40; if the Debian base ships an
     older Git, the Alpine variant `oven/bun:1.4-alpine` is used instead, which the WASM policy
     engine supports since it needs no native code). Copies `server/`, `src/` modules the server
     imports, `policies/`, `schemas/`, `dist/` and the production `node_modules`. `USER bun`
     (uid 1000), `ENV DATA_DIR=/data SW_CACHE_DIR=/tmp/sw-cache SW_SERVE_STATIC=1`, `VOLUME /data`,
     `EXPOSE 4310`, labels `org.opencontainers.image.{version,revision,source,created}` and the
     same values as `SW_VERSION`/`SW_COMMIT` from build arguments. `HEALTHCHECK` runs a two-line
     Bun `fetch` of `/healthz` (no curl in the image). Entry point `bun server/index.ts`, receiving
     SIGTERM directly (exec form) so the instance lock is released.
- **Local mode in the container**: Principle I keeps local mode on loopback; with Docker's default
  bridge network a process bound to the container's `127.0.0.1` cannot be reached through a
  published port. Host networking (`network_mode: host`) makes the container share the host's
  loopback, so the unchanged loopback rule applies (OP-8). Docker Engine and Podman support it;
  Docker Desktop needs its host networking option. Rejected: binding `0.0.0.0` in local mode when
  a container is detected (violates Principle I; the server cannot see the host publish address).
- **Writable data root check**: at start-up the server writes and removes a probe file under the
  data root; failure stops start-up naming the path and the uid (FR-125).
- **Compose** (`compose.yaml`): profile `local` → service `workbench` (image built from the
  Dockerfile, `network_mode: host`, `SW_MODE=local`, `./.data:/data`); profile `server` →
  `keycloak` (`quay.io/keycloak/keycloak:26.4` pinned by digest, `start-dev --import-realm`, the
  test realm mounted read-only, port published on `127.0.0.1:8080` only) and `workbench-server`
  (`network_mode: host`, `SW_MODE=server`, `SW_HOST=127.0.0.1`, `SW_PUBLIC_URL=http://localhost:4310`,
  issuer `http://localhost:8080/realms/workbench`, secrets from `.env.server`, which is ignored by
  Git and created from `.env.server.example`). Both the browser and the server reach Keycloak at
  the same `localhost` URL, so the issuer matches.
- **Running the suites against the image**: browser checks read their base URL from
  `SW_BASE_URL` (default the dev server); `scripts/container-check.ts` builds or takes an image,
  starts it with a temporary data folder, waits for `/readyz`, and runs the suites listed in
  `scripts/container-suites.ts` against it (local mode suites, and from US1 on the server suites
  through the compose server profile).

## R18 Continuous integration and delivery with GitHub Actions

- **`ci.yml`** (pull requests, pushes to any branch but not tags): jobs
  `verify` (Bun pinned to 1.4.x, `bun install --frozen-lockfile`, `bun --bun run check`,
  `bun test`, `bun --bun run build`), `mutation` (`bun run test:mutation`), `browser` (matrix over
  the browser suites, Playwright Chromium installed with its system dependencies, dev server
  started in the job, screenshots uploaded on failure), `keycloak` (R6), `image` (Buildx with the
  GitHub Actions cache, image exported to the job, Trivy scan with `--severity CRITICAL,HIGH
  --ignore-unfixed --exit-code 1` and `.trivyignore` entries carrying a reason and an expiry that
  a test checks, Trivy SPDX JSON bill of materials uploaded as an artifact), `container` (needs
  `image`; runs `scripts/container-check.ts` for local and server suites against that image) and
  `publish` (push to `main` only, after every other job; R19, R20). Concurrency cancels superseded
  pull-request runs. Default permissions `contents: read`; `id-token: write` only on `publish`.
- **`release.yml`** (tags `v*`): `check` without Azure access (tag commit is an ancestor of
  `origin/main` and its `ci.yml` run on `main` succeeded including the `publish` job, read
  through the GitHub API, so a tag without a published image fails before any approval), then
  `deploy` in environment `production` (required reviewers; concurrency group `production`, never
  cancelled). Only after approval, with the deployer identity: image `sha-<commit>` exists in the
  registry, Trivy rescan of its digest, promotion to `vX.Y.Z` on the same digest with `docker
  buildx imagetools create` (no rebuild), preflight of the container app settings (FR-139), record
  of the running image digest, `az containerapp update --image
  <registry>/semantic-workbench@<digest>`, wait for the new revision to run and be ready,
  `scripts/deploy-smoke.ts`, and on failure redeploy of the recorded digest and a second smoke
  test, then fail. A last job `github-release` (contents write) creates the release with the
  bill of materials and the scan report. The job summary lists both digests and results. Registry
  steps sit after the approval because a tag push gets the OIDC subject
  `ref:refs/tags/<tag>`, which no federated credential matches; only the environment subject
  does.
- **`rollback.yml`** (manual dispatch with input `version`, environment `production`): resolves the
  version tag to its digest and runs the same deploy and smoke steps.
- **Smoke test** (`scripts/deploy-smoke.ts`, also run against the compose server profile in the
  `container` job so its logic is tested on every change): `/healthz` version and commit equal the
  release; `/readyz` 200 within 3 minutes; `GET /api/projects` without a cookie → 401 with no
  project names; `/auth/login` → 302 to the configured issuer with `code_challenge_method=S256`;
  HSTS, CSP, `X-Content-Type-Options` present; the sign-in cookie is `Secure; HttpOnly`.
- **Hardening**: actions pinned by commit with Dependabot (`github-actions`, `docker`, `npm`
  ecosystems) proposing updates; no `pull_request_target`; fork pull requests get no secrets and
  no token issuance, and `publish`/`deploy` never run for them; `tests/ci/workflows.test.ts` parses
  the workflows and fails on an unpinned action, a job with write permissions it does not need, a
  `secrets.` reference in an Azure sign-in, or a quality-gate script missing from the `browser`
  matrix or the container suite list.
- **Rejected**: one workflow file for everything (release approval would block the whole run);
  rebuilding the image on tag (the released digest would not be the tested one); Azure DevOps
  Pipelines (the code and reviews live on GitHub).

## R19 Registry: Azure Container Registry

- **Decision**: Azure Container Registry, Basic tier, admin user disabled, repository
  `semantic-workbench`. Tags: `sha-<commit>` (immutable by convention), `main` (moving), `vX.Y.Z`
  (promoted). The container app pulls with its managed identity (`AcrPull`); the publish identity
  holds `AcrPush`; the deploy identity holds `AcrPush` (to add version tags) and rights on the
  container app only.
- **Why**: the GitHub repository is private, so a GHCR package would be private too, and Azure
  Container Apps can pull a private GHCR image only with a stored personal access token, a
  long-lived secret the owner excluded. ACR keeps every pull and push on federated or managed
  identities, inside the same tenant as the deployment.
- **Cost and retention**: Basic tier has a monthly fee and a storage quota; a retention rule
  (documented manual step) removes untagged manifests, and commit tags older than 90 days that no
  version tag points to may be deleted by hand.
- **Rejected**: GHCR (stored token for private pulls; free and simpler if the repository and image
  become public, in which case anonymous pulls need no credential); Docker Hub (external account,
  rate limits).
- Open for the owner: OP-6 (accept the registry's cost, or make the repository public and use
  GHCR).

## R20 GitHub to Azure trust and the resources the pipeline expects

- **Workload identity federation**: two user-assigned managed identities with federated
  credentials (issuer `https://token.actions.githubusercontent.com`, audience
  `api://AzureADTokenExchange`):
  - `id-sw-publisher`, subject `repo:rmonteiro-pereira/semantic-workbench:ref:refs/heads/main`;
    role `AcrPush` on the registry.
  - `id-sw-deployer`, subject `repo:rmonteiro-pereira/semantic-workbench:environment:production`;
    roles `AcrPush` on the registry and Contributor on the container app resource only (no
    subscription or resource-group write). If the update also needs the Container Apps
    environment's join action, a custom role limited to that action is added on the environment;
    the final role set is recorded by T133 and written in the guide.
  `azure/login` receives client id, tenant id and subscription id from repository variables
  (`AZURE_CLIENT_ID_PUBLISHER`, `AZURE_CLIENT_ID_DEPLOYER`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`), none of which is a secret. Environment-based subjects avoid the exact
  match limits of tag subjects (`v*` cannot be expressed as one subject). Under the OP-7 fallback
  (no required reviewers on the plan) the deploy workflow runs by manual dispatch on `main` and the
  deployer's federated subject is `ref:refs/heads/main`; the workflow then checks that the actor
  is listed in `SW_DEPLOYERS` before any Azure step.
- **Resources** (manual, `deploy/azure/README.md`): resource group; Log Analytics workspace;
  Container Apps environment (consumption profile) with the Azure Files storage registered;
  storage account and file share; Key Vault (RBAC mode) with `SW_SESSION_KEY` and provider and
  GitHub secrets; container registry; container app (single revision mode, one replica, ingress
  4310, system identity with `AcrPull` and Key Vault Secrets User, volume at `/data`, probes,
  environment variables of contracts/configuration.md with secret references); the two pipeline
  identities; the Entra app registration for sign-in (quickstart §5).
- **GitHub settings** (manual, same guide): ruleset on `main` requiring the `ci.yml` checks and a
  pull request; ruleset restricting creation of `v*` tags to the owner; environment `production`
  with required reviewers and a deployment rule for `v*` tags (or the OP-7 fallback); repository
  variables above plus `ACR_NAME`, `ACA_NAME`, `ACA_RESOURCE_GROUP`, `SW_PUBLIC_URL`.
