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
  credential that trusts the container app's user-assigned managed identity `id-sw-app` (R14;
  Microsoft documents managed-identity federation with user-assigned identities, and its object
  id survives re-creating the app): the server asks the platform identity
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

- Keycloak 26 container (`quay.io/keycloak/keycloak:26.4`, pinned by digest in the test script)
  started with `start-dev --import-realm` and `tests/fixtures/keycloak/realm.json`: confidential
  client `semantic-workbench` (PKCE S256 required), client roles Viewer/Editor/Steward/Admin,
  group membership mapper (`groups`, full path off), client `sw-agent` and `sw-agent-ungranted`
  with service accounts holding client role `Agent`.
- Test users: `alice` (Sales, Editor), `bob` (Sales, Steward), `carol` (HR, Viewer),
  `dave` (Admin), `erin` (no role), `frank` (Sales + Finance group, Editor).
- `bun run test:auth:keycloak` starts Keycloak with Docker or Podman (`docker run`, realm mounted
  read-only, port on `127.0.0.1:8080`), waits for
  `/realms/workbench/.well-known/openid-configuration`, then runs the Playwright check (sign-in
  form, role header, sign-out, live updates, agent client credentials) and removes the container.
  Run alone without a container runtime it skips with a clear message; under `ci:validate`
  (`--require-container`) it fails instead. The pipeline's `keycloak` job runs the same step on
  the agent, so the Keycloak container is started by the script, not declared as an Azure
  Pipelines service container: a service container takes an image, options, environment, ports
  and volumes but no start command, and the Keycloak image needs `start-dev --import-realm`
  (a derived test image would have to be built and published before the job starts). Unit tests
  use an in-process stub provider (`jose` keys).
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
  replica). A user-assigned managed identity `id-sw-app`, created before the app so its roles exist
  at first pull, reads Key Vault secrets (`SW_SESSION_KEY`, provider client secret if used, GitHub
  app secret), pulls from Azure Container Registry (`AcrPull`, R19) and is the federated
  credential of the Entra app. Liveness probe `/healthz`, readiness probe
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
  of a **different** revision means a revision update → report ready with state `handover`,
  answer 503 with `Retry-After: 5` on every non-health route, run no recovery, migration or scan
  and write nothing under the data root, and take the lock as soon as the old instance releases
  it in its SIGTERM handler or its heartbeat is older than 30 s; then recover, scan and report
  `serving`. A second replica of the same revision is detected before it can take the lock
  because both read the lock first; the refusing instance re-checks every 10 s. Two instances never
  serve one data root; the interruption is the old instance's shutdown plus at most 30 s
  (SC-017). The deploy job also refuses to deploy unless min and max replicas are 1 (FR-139).
- **No infrastructure as code** (owner decision): the resources are created by hand following
  `deploy/README.md`, which lists them (R20) with portal and Azure CLI steps; the deploy job
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
     same values as `SW_VERSION`/`SW_COMMIT` from build arguments. `SW_VERSION` is the
     `package.json` version (the image does not depend on any tag: it is built on the owner's
     machine and in pipeline runs of `main` and of tags alike, and the version tag is added to the
     registry digest only at deployment; the version check requires the tag's version core to
     equal it). `HEALTHCHECK` runs a two-line
     Bun `fetch` of `/healthz` (no curl in the image). Entry point `bun server/index.ts`, receiving
     SIGTERM directly (exec form) so the instance lock is released.
- **Local mode in the container**: Principle I keeps local mode on loopback; with Docker's default
  bridge network a process bound to the container's `127.0.0.1` cannot be reached through a
  published port. Host networking (`network_mode: host`) makes the container share the host's
  loopback, so the unchanged loopback rule applies (OP-8). Docker Engine and Podman support it;
  Docker Desktop needs host networking turned on (4.34 or later: **Settings → Resources → Network
  → Enable host networking**, **Apply & restart**; Linux containers only), documented in the
  README and quickstart. Accepted by the owner. Rejected: binding `0.0.0.0` in local mode when a
  container is detected (violates Principle I; the server cannot see the host publish address).
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

## R18 Local build scripts and the Azure DevOps pipeline

- **Owner decisions**: the GitHub repository runs nothing automatically (no workflows, no
  Dependabot, no publishing or deployment from it); the owner builds, tests and scans on their own
  machine; the CI/CD pipeline is a deliverable for the target environment, which uses Azure DevOps
  Pipelines. Consequence: one set of package scripts is the single implementation of every
  verification, build and deployment step, the owner runs them locally, and the pipeline only
  calls them (contract: [delivery-pipeline.md](./contracts/delivery-pipeline.md)).
- **`ci:validate`** (`scripts/ci-validate.ts`): runs the steps `verify` (`check`, `bun test`,
  `build`), `mutation`, `browser` (every suite listed in `scripts/gate-suites.ts`, the single list
  of quality-gate browser suites, each on an isolated data root with its own dev server port),
  `keycloak`, `image` (`image:build`, `image:scan`, `image:sbom`), `container` (`test:container`,
  then `deploy:smoke --loopback` against the Compose server profile) and `pipeline`
  (`pipeline:lint`, `pipeline:dry-run`). Steps run in that order and stop at the first failing
  step unless `--keep-going`; `--step` and `--suite` select a subset, which is how the pipeline
  splits Validate into parallel jobs. It writes JUnit XML (for `PublishTestResults@2`) and a JSON
  summary to `out/ci/`. The steps that need a container runtime fail instead of skipping.
- **Image scripts** (`scripts/image.ts`): `build` with Docker or Podman (the first found; `--engine`
  forces one), build arguments from `package.json` and `git rev-parse HEAD` (a dirty tree gets a
  `-dirty` commit suffix that `image:push` refuses); `scan` and `sbom` with Trivy, using a local
  `trivy` binary or else the `aquasec/trivy` image pinned by digest (so the owner needs only a
  container runtime), `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1`, `.trivyignore`
  entries with `# reason; expires YYYY-MM-DD` checked by the pipeline check; `push` to a registry
  given on the command line; `push` and `scan --ref` sign in to the registry themselves with the
  current Azure CLI session (`az acr login`), so the pipeline needs no inline Azure commands.
- **Pipeline definition** (`azure-pipelines.yml`, multi-stage YAML, templates under
  `deploy/azure-devops/templates/`): `Validate` (jobs `verify`, `mutation`, `browser` literal
  matrix kept equal to `scripts/gate-suites.ts` by the pipeline check because Azure DevOps compiles
  the matrix before any script runs, `keycloak`, `pipeline`; each one `ci:validate` step), `Image`
  (on tag runs first a `check` job with `deploy:check-version`, so a wrong tag fails before any push
  and before approval; Azure DevOps evaluates an environment's approvals and checks before the
  stage that uses it starts, so the check cannot sit in the Deploy stage; then image steps and
  container suites; on `main` and `v*` runs, `AzureCLI@2` with the push service connection and
  `image:push`; the digest becomes an output variable), `Deploy` (only `refs/tags/v*`: a
  deployment job on the environment, which checks out the repository explicitly since deployment
  jobs do not, then rescan by digest and `deploy:azure`, which runs the preflight, promotes the
  version tag on the same digest with `docker buildx imagetools create` (needs only `AcrPush`;
  `az acr import` would need the import action, which `AcrPush` lacks), and deploys). A tag run
  builds its own image in `Image`; the deployed digest is the one this run built, scanned and
  tested (the digest differs from the `main` run's because of the creation label, which is why
  promotion uses this run's digest).
  `azure-pipelines-rollback.yml` (manual) is queued on the tag ref of the version to restore, so
  the environment's branch control (`refs/tags/v*`) admits it, and deploys that version, or with
  `target: previous` the revision before the active one, through the same environment. The YAML
  and scripts come from that tag ref, so it works for tags from `v0.4.0-alpha.1` on; for
  `previous` it is queued on the tag of the version currently deployed and the smoke test expects
  the restored image's own version and commit labels. Bun is installed at a pinned version by the shared setup template; Playwright
  Chromium is installed with its system dependencies.
- **Triggers**: CI trigger on `main` and tags `v*` of the target's Azure Repos mirror of this
  repository; pull-request validation through the target's branch policy on `main`; `pr: none`.
  The pipeline is never connected to this GitHub repository, so pushes here trigger nothing
  (FR-130).
- **One deployment at a time**: the environment's exclusive lock check plus `lockBehavior:
  runLatest` declared at stage level on `Deploy` and `Rollback` (the check has no such option)
  serialise deployments and rollbacks and drop older waiting runs.
- **Local validation of the definition**: `pipeline:lint` validates the YAML files against a pinned
  copy of the published Azure Pipelines schema (Ajv, as for the other pinned schemas) and applies
  the repository rules (stage order, steps call package scripts, tasks pinned to a major version,
  images pinned by digest, no secret variables, service connections only from parameters, Deploy
  conditioned on version tags and run as a deployment job on the environment parameter, every
  gate suite present, no `.github/workflows/` or `.github/dependabot.yml`). `pipeline:dry-run`
  expands template parameters with sample values, evaluates the stage and step conditions for a
  pull request, a `main` run and a tag, prints the resulting plan, and with `--execute` runs the
  local steps and the Azure steps against the fake Azure client. When the target has imported the
  pipeline, Azure DevOps' preview run (`previewRun: true` of the Runs API) returns the fully
  expanded YAML without running it; the guide lists it as the target's first check.
- **Smoke test** (`deploy:smoke`, also run against the Compose server profile in the `container`
  step so its logic runs on every validation): `/readyz` reports state `serving` within 3 minutes
  (state `handover` is waited out); `/healthz` commit equals the deployed commit and version equals
  the `package.json` version; `GET /api/projects` without a cookie → 401 with no project names;
  `/auth/login` → 302 to the `authorization_endpoint` of the issuer's discovery document (Keycloak
  and Entra differ) with `code_challenge_method=S256`; HSTS, CSP, `X-Content-Type-Options`
  present; the sign-in cookie is `Secure; HttpOnly`.
- **Rollback**: the deploy script records the active revision before the update; on smoke failure
  `az containerapp revision copy --from-revision <recorded>` creates a new revision with the
  previous image digest and configuration (in single revision mode an inactive revision cannot run
  beside the active one, so the previous revision is restored by copying it), waits for it and
  smoke-tests it; the run fails either way.
- **Dependency updates**: no bot runs on the repository; pinned digests (base images, Keycloak,
  Trivy), the Bun version and package versions are reviewed by the owner (`bun outdated`, the scan
  results) as part of each release.
- **Rejected**: GitHub Actions (owner decision: the repository runs nothing); rebuilding the image
  in the Deploy stage (the deployed digest would not be the scanned and tested one); an Azure
  Pipelines service container for Keycloak (no start command, R6); pipeline-only logic in inline
  scripts (could not be run or tested locally).

## R19 Registry: the target's Azure Container Registry

- **Decision**: images are built on the owner's machine and never published from the repository;
  the target pipeline pushes to the target's own Azure Container Registry (admin user disabled),
  repository `semantic-workbench`, tags `sha-<commit>` and `vX.Y.Z` (added only by deployments).
  The container app pulls with its managed identity (`AcrPull`); the pipeline pushes through the
  push service connection (`AcrPush`). The former open point on the registry (OP-6) is withdrawn.
- **Retention**: a registry retention rule (documented manual step) removes untagged manifests;
  commit tags that no version tag points to may be deleted by the target after a period it
  chooses; version tags are kept so rollback can reach any earlier version.

## R20 Azure DevOps to Azure trust and what the target sets up

- **Workload identity federation**: Azure Resource Manager service connections of type workload
  identity federation; Azure DevOps shows the issuer and subject to use on the service connection
  page (their format has changed over time, so the guide tells the target to copy them rather than
  build them); Azure DevOps creates the federated
  credential on an app registration it manages (automatic) or the target points the connection
  at its own app registration or user-assigned managed identity (manual). No secret is stored.
  Two connections by default: `sw-azure-push` (`AcrPush` on the registry) and `sw-azure-deploy`
  (`AcrPush` on the registry and Contributor on the container app resource only; if the update
  also needs the Container Apps environment's join action, a custom role limited to that action on
  the environment, and Managed Identity Operator on `id-sw-app` if assigning the user-assigned
  identity requires it; the final set is recorded by T133). `AzureCLI@2` uses them with
  `addSpnToEnvironment: false`, so no token reaches the scripts' environment beyond the Azure CLI
  session.
- **Protection**: each service connection and the variable group grant pipeline permission only
  to the two pipelines of this repository; the environment `production` carries approvals,
  branch control (`refs/tags/v*`) and an exclusive lock; the service connections may carry the
  same branch control check.
- **Azure resources** (manual, `deploy/README.md`): resource group; Log Analytics workspace;
  Container Apps environment (consumption profile) with the Azure Files storage registered;
  storage account and file share; Key Vault (RBAC mode) with `SW_SESSION_KEY` and provider and
  GitHub app secrets; container registry; container app (single revision mode, one replica,
  ingress 4310, user-assigned identity `id-sw-app` with `AcrPull` and Key Vault Secrets User,
  created and granted before the app so the first pull works, volume at `/data`, probes,
  environment variables of contracts/configuration.md with secret references); the Entra app
  registration for sign-in (quickstart §5).
- **Azure DevOps items** (manual, same guide): the two service connections; environment
  `production` with approvals and checks; variable group `semantic-workbench-target` (values of
  delivery-pipeline.md, none secret); agent pool (Microsoft-hosted `ubuntu-latest` or self-hosted
  Linux with Docker); import of `azure-pipelines.yml` and `azure-pipelines-rollback.yml`; branch
  policy on `main` requiring the pipeline for pull requests; a preview run to check the expansion.
- **Parameters versus variables**: service connection, environment and variable group names are
  compile-time parameters (Azure DevOps authorises protected resources when the run is compiled,
  so runtime variables cannot name them); every other target value is a variable of the group.
