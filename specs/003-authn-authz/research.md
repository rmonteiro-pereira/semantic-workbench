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
- CI: GitHub Actions workflow `.github/workflows/auth-keycloak.yml` runs `docker run` for
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
  client secret if used, GitHub app secret) and is the federated credential of the Entra app.
- **Storage**: data root on an Azure Files share mounted at `/data` (NFS on a premium storage
  account where the region supports it for Container Apps; SMB otherwise, with
  `core.filemode=false` set on managed repositories). The SQLite cache lives on the container's
  local disk (`SW_CACHE_DIR=/tmp/sw-cache`): it is rebuildable (Principle IV), and SQLite file
  locking on network shares is unreliable.
- **Image**: `oven/bun:1.4` base plus Git ≥ 2.40, built frontend in `dist/`, non-root user,
  `HEALTHCHECK` on `/healthz`; `/readyz` turns ready after recovery and the first scan.
- **Single instance**: `data/state/instance.lock` with host, pid and a heartbeat every 10 s; a
  second instance seeing a heartbeat younger than 30 s refuses to serve (FR-122). During a
  revision update the new revision becomes ready only after the old one stops (SIGTERM handler
  releases the lock), which gives a short planned downtime.
- **Alternative**: App Service (Web App for Containers), Azure Storage mount (SMB), Always On,
  one instance, same environment variables.
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
