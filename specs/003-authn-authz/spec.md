# Feature Specification: Sign-In, Roles and Access Control for Local and Server Modes (v0.4.0)

**Feature Branch**: `003-authn-authz`

**Created**: 2026-10-21

**Status**: Clarified (open points OP-1 to OP-5 confirmed by the owner; OP-8 accepted by the
owner; OP-12 to OP-14 decided by the owner). Revised 2026-10-21 for the owner's container and
delivery-pipeline changes (US9 raised to P1 and moved right after foundations; US10 added), and
revised again the same day: the repository runs nothing automatically, the owner builds and tests
locally, and the delivery pipeline is an Azure DevOps Pipelines definition for the target
environment. Revised a third time the same day for the owner's answers on the target environment
(OP-9 to OP-11, decided): the target uses Microsoft Entra ID only, so the pipeline never starts
Keycloak and covers sign-in with a mock OpenID provider; the trial deployment is an owner
acceptance step run from a runbook; the target imports releases into its own Azure Repos mirror.
Revised a fourth time the same day for the owner's decisions on sign-in and access (OP-12 to
OP-14): there is no sign-in screen in the workbench; access is granted in the Admin panel to Entra
groups or to individual e-mail addresses, and Entra app roles are not needed; Admins can create
custom roles. Constitution 3.1.0 applies (3.0.0, a wording patch for the group-name lookup, and principle VIII Readable Code carried over from 2.2.0).

**Builds on**: feature 002 (`002-lineage-and-ux`, v0.3.0). This branch starts from
`origin/002-lineage-and-ux` and is rebased onto `main` after 002 merges; every route, dialog and
state file that 002 adds (commit with paths and push, revert, identity, credential helper, clone,
repository projects, subfolder projects, metrics routes) is in scope for the access rules below.

**Input**: Owner's decisions for the release after v0.3.0:

- The workbench runs in two modes. **Local mode** is today's product: one person, loopback only,
  no sign-in, the person acts as an implicit Administrator. **Server mode** serves a team from a
  container on Azure (Azure Container Apps or App Service); it requires sign-in.
- Sign-in uses any OpenID Connect provider, optimised for Microsoft Entra ID; Keycloak is also
  supported and is tested automatically against a Keycloak container; Entra is verified manually
  and documented.
- Sessions are held by the server: the server is the confidential client (authorization code with
  PKCE), the browser holds only an HttpOnly, Secure, SameSite cookie, tokens never reach the
  browser, and live updates keep working with that cookie. Bearer tokens (client credentials) are
  accepted only for machine callers of the agent API.
- Four roles: **Viewer**, **Editor**, **Steward**, **Admin**, taken from Entra app roles assigned
  to groups (Keycloak: client roles). Group membership decides which domains and projects a person
  belongs to. Entra's group overage (too many groups for the token) is handled.
- Attribute rules cover everything in the authorization inventory: projects and domains, ODCS
  classification, metric ownership and status (the Steward of the domain approves; nobody approves
  their own metric; editing an approved metric returns it to proposed, enforced by the server),
  Git actions (commit, push, pull, branch, remote, clone), trash and drafts, the agent API,
  exports and administration.
- Reading is granted per project and per file: a visible file is visible whole; classification
  restricts editing, not reading. The server never sends a file the person may not read. Every
  list, search, lineage, mapping graph, agent context, live update, diff, history, trash entry and
  suggestion is filtered. Hidden items are shown as counts, never by name.
- One policy engine, Cedar, runs inside the server process behind a single decision boundary.
- In server mode each person gets their own Git worktree per repository (own branch, drafts and
  pull); commits are authored by the signed-in person.
- Remote Git operations use the person's own delegated credentials (Entra on-behalf-of for Azure
  DevOps; GitHub user token through OAuth or a GitHub App). Credentials are never stored long-term
  in plain text. Changing a remote address is an Administrator action.
- Security-relevant actions are written to an audit log (who, what, when, decision).
- Constitution amendment to 3.0.0 approved (two modes in Principle I, per-person state in IV,
  authorization mutants and a test matrix in VI, README covers both modes in VII, new dependency
  rule covers the policy engine and sign-in libraries). No query execution and byte-exact sources
  stay unchanged.
- A single running instance is acceptable for v0.4.0; the path to more instances is documented.
- An Admin panel (Admin only; the implicit Admin in local mode) controls RBAC, attribute rules and
  access: users and groups with the source of each role and local deactivation; the role matrix,
  group-to-role mappings and per-project assignments; policies through a structured editor and a
  raw editor with validation, versioning, diff, rollback and a dry run; an access simulator;
  per-project access lists, stewards and classification levels; the audit log viewer with export;
  provider, session and remote-credential settings. Changes apply at once but can never remove
  the last Admin (guard plus an environment-configured bootstrap Admin for recovery); every change
  is audited; one dialog per area, nothing added to the main screen but its entry.
- **Revision (same day)**: the container and Azure deployment become P1 and come early. The
  container image is multi-stage, runs on Bun as a non-root user with a health check, keeps the data
  root on a mounted volume and also runs in local mode without sign-in; Docker Compose runs it
  locally, including a Keycloak for development; then Azure Container Apps (single replica, Azure
  Files, Key Vault, managed identity). The container exists right after the foundations and every
  later phase is verified in the container as well.
- **Revision (same day, superseding an earlier GitHub Actions plan)**: the GitHub repository runs
  nothing automatically (no workflows, no image publishing, no deployment from the repository).
  The owner builds, tests and scans the image on their own machine. The CI/CD pipeline is a
  deliverable for the target environment, which uses **Azure DevOps Pipelines**: the repository
  ships a multi-stage `azure-pipelines.yml` for the target organisation to import, with the stages
  Validate (type check, unit tests, build, mutation suite, Playwright browser suites, Keycloak
  sign-in tests against a Keycloak container), Image (build, vulnerability scan, software bill of
  materials, push to the target's own Azure Container Registry) and Deploy (Azure Container Apps,
  single replica, through an Azure Resource Manager service connection using workload identity
  federation, no stored secrets; production gated by an Azure DevOps environment with approvals
  and checks), a smoke test after deployment, automatic rollback to the previous revision when it
  fails, and a manual rollback pipeline. Everything target-specific (subscription, resource group,
  registry, Container Apps environment and app, Key Vault, Entra app and tenant) is a parameter or
  a variable-group value; the guide lists what the target sets up (service connection,
  environments, variable group, agent pool). Every step the pipeline runs is a package script the
  owner also runs locally (for example `bun run ci:validate`, `image:build`, `image:scan`,
  `image:sbom`); Docker Compose (with the Keycloak profile) stays for local runs. Infrastructure as
  code is out of scope.
- **Revision (owner answers on the target environment, supersedes the Keycloak parts above)**:
  "Keycloak is the compatibility, we won't be using it on the target." The target uses Microsoft
  Entra ID only, and Entra stays the primary, optimised provider. The Azure DevOps pipeline MUST
  NOT start or depend on Keycloak: Keycloak becomes a local compatibility suite (Compose profile
  `keycloak` and `test:auth:keycloak`) run on the owner's machine. Sign-in tests in the gate and
  in the target pipeline use a self-contained mock OpenID provider started by the test scripts
  (discovery, signing keys, authorization code with PKCE, refresh, client credentials, sign-out,
  Entra-shaped claims `oid`, `tid`, `roles`, `groups` and group overage `_claim_names`), so the
  Validate stage covers the sign-in flow and the Entra claim mapping without any external
  provider. A manual Entra checklist for the real tenant stays documented. The implementer has
  no access to the trial Azure DevOps organisation and subscription: the real trial deployment is
  an owner acceptance step run from a step-by-step runbook; the implementation is done when
  `pipeline:lint`, `pipeline:dry-run` and the container suites pass locally. The target imports
  each release into its own Azure Repos mirror; nothing connects to this GitHub repository, and
  the deployment guide documents the hand-over.
- **Revision (owner decisions on sign-in and access, supersedes the role source above)**: "No need
  for a sign-in screen." In server mode an unauthenticated page request goes straight to the
  identity provider (Entra ID single sign-on; Keycloak in compatibility mode) and the person comes
  back signed in. The workbench keeps only two pages of its own: **No access** for a signed-in
  person who has not been granted access, and a signed-out confirmation. "Admin will add by Entra
  group or by e-mail." Access is granted explicitly in the Admin panel: an Admin adds an Entra
  group (by object ID, display name resolved) or a person by e-mail address and gives a role with
  a project or domain scope. These grants are the source of workbench roles; Entra app roles are
  not used, so the target tenant needs no app-role setup. "At role creation too." Admins can
  create custom roles next to the four built-in roles, choose their permissions, and add their
  members the same way, by group or e-mail with an optional scope. The bootstrap Admins of the
  environment stay as break-glass.

Evidence for the current state: the authorization inventory of the 002 working tree (38 resource
types, 57 implemented and 9 planned routes, 45 UI action groups, 42 policy attributes) is
summarised in Appendix A.

## Clarifications

### Session 2026-10-21 (clarify pass; confirmed by the owner)

The owner's decisions above settle modes, provider, session model, roles, rule coverage, read
granularity, policy engine, per-person worktrees, remote credentials, audit and the Admin panel.
Five points were left open; each was resolved with the recommended option, and the owner
confirmed all five (OP-1 to OP-5, **confirmed by the owner**).

- Q: How do people share work when each has a personal working copy, including in repositories
  without a remote? → A (OP-1): Each working copy starts on a personal branch `work/<handle>`
  (handle from the email's local part, made unique) created from the default branch. A person may
  switch to any branch that no other working copy has checked out; a branch in use elsewhere is
  shown as "in use by <display name>". **Publish** fast-forwards the default (or another
  protected) branch to the person's commit inside the repository, with no network; if it is not a
  fast-forward the person first runs **Pull from default branch** (a merge into their branch) and
  repairs conflicts. With a remote, pushing the default branch also fast-forwards the local
  default branch, and a pull that fetches it fast-forwards it when possible. The published state
  (base checkout, detached at the default branch tip) is refreshed after every such update.
- Q: What exactly does "classification restricts editing" mean? → A (OP-2): Two guards. (1)
  Changing a classification, critical-data-element, team or roles value needs Steward of the
  domain. (2) Changing anything inside a property classified at or above the protected level
  (default `confidential`, levels `public < internal < confidential < restricted`, other values
  mapped by Admins, unmapped treated as `internal`) needs Steward of the domain. Reading is never
  affected. An Admin may set a per-project protected level.
- Q: Are projects the person cannot read counted ("3 projects you cannot open")? → A (OP-3): No.
  Unreadable projects are absent, without count, so people outside a domain learn nothing about
  it; counts appear only for hidden files inside a readable project, hidden commits in history and
  references in delete impact. Admins see all projects.
- Q: How are metric `owner` and `steward` matched to people for the no-self-approval rule? → A
  (OP-4): Case-insensitive match against the principal's email or username. Existing free-text
  values that match nobody are shown as "unverified" and count as no owner; the wizard offers
  people from the Users list. Approval also requires Steward role in the metric's domain; a named
  `steward` value is informative, not a grant.
- Q: Where do policies, role mappings and assignments live? → A (OP-5): In an administration Git
  repository at `data/admin/` (outside `data/projects/`, never listed as a project, never given a
  remote). One commit per Admin change, authored by the Admin, gives history, diff and rollback
  with the Git machinery the workbench already has, keeps files reviewable as text, and survives
  the cache being deleted. Rejected: JSON state files with a hand-made version log (re-implements
  history), and the policies inside project repositories (a project's editors could grant
  themselves access).

### Session 2026-10-21 (container and pipeline revision)

The registry and approval-gate questions raised for a GitHub-hosted pipeline (formerly OP-6 and
OP-7) no longer apply and are withdrawn: images are built on the owner's machine, the target's
pipeline pushes to the target's own Azure Container Registry, and production approval is an
Azure DevOps environment with approvals and checks that the target configures.

- Q: How does local mode run in a container when it may bind only to loopback? → A (OP-8,
  **accepted by the owner**): the container in local mode uses host networking
  (`network_mode: host`), so the server binds the host's `127.0.0.1` and the constitution's
  loopback rule holds unchanged. This works with Docker Engine (Linux, WSL2) and Podman. Docker
  Desktop needs host networking turned on: Docker Desktop 4.34 or later, **Settings → Resources →
  Network → Enable host networking**, then **Apply & restart** (Linux containers only). Rejected:
  binding the container interface and publishing the port only on the host's loopback (the server
  cannot verify the publish address, so Principle I would need an amendment).

### Session 2026-10-21 (owner answers on the target environment, decided)

- Q: Does the target pipeline run the Keycloak sign-in tests? → A (OP-9, **decided by the
  owner**): No. The target uses Microsoft Entra ID only. The pipeline neither starts nor depends
  on Keycloak or any other external provider; its Validate stage runs the sign-in suites against
  the mock OpenID provider (FR-141) with Entra-shaped claims, including group overage. Keycloak
  remains a supported provider, verified by the compatibility suite `test:auth:keycloak` and the
  Compose `keycloak` profile on the owner's machine, outside `ci:validate` and outside the
  pipeline. Entra on the real tenant is verified with the manual checklist (quickstart §5).
- Q: Who runs the trial deployment in the trial Azure DevOps organisation and subscription? → A
  (OP-10, **decided by the owner**): the owner. The implementer has no access; the real trial is
  an owner acceptance step run from the trial runbook (FR-143) with expected outputs and a report
  block the owner returns. The implementation's done criteria are `pipeline:lint`,
  `pipeline:dry-run` and the container suites passing locally (inside `ci:validate`).
- Q: How does the target get the code? → A (OP-11, **decided by the owner**): the target imports
  from its own Azure Repos mirror; nothing connects to this GitHub repository. Each release is
  handed over by pushing the release commit and tag to the mirror, or by copying a Git bundle (or,
  as a fallback, a source archive) that someone with mirror access imports (FR-142).

### Session 2026-10-21 (owner decisions on sign-in and access, decided)

- Q: Does the workbench show its own sign-in screen? → A (OP-12, **decided by the owner**): No.
  An unauthenticated page request is answered with a redirect straight to the provider's
  authorization endpoint (with PKCE, `state` and `nonce`) and the person returns signed in to the
  page they asked for; API requests get 401. The workbench has only the pages that cannot be
  avoided: **No access** (a signed-in person without any grant, or a deactivated one: who they
  are signed in as, that an Admin must grant access, and **Sign out**), **Signed out** (the
  provider returns there after sign-out; sending the person to the workspace instead would sign
  them in again silently through single sign-on) and a plain sign-in error page with **Try
  again** for a failed callback (FR-018).
- Q: Where do workbench roles come from? → A (OP-13, **decided by the owner**, design
  recommended and adopted): from **access grants** made in the Admin panel. A grant gives one role
  to one member, an Entra group (by object ID, its display name resolved from the directory for
  readability) or one person by e-mail address (matched case-insensitively against the verified
  address of the sign-in, FR-024), within a scope: the whole workspace, some domains or some
  projects. Grants are the only source of workbench roles for people. Entra app roles are not
  read, so the target tenant needs no app-role setup; Keycloak client roles are not read either.
  Agent clients are authorised by the Admin's client grant, without an `Agent` app role. A person
  with no matching grant sees **No access**. The bootstrap Admins of `SW_BOOTSTRAP_ADMINS` always
  hold Admin (break-glass). Group overage handling stays, because group grants need the person's
  full group membership. Rejected: Entra app roles as the source (needs app-role setup and an
  Entra administrator for every change, and cannot express project or domain scope), and app
  roles and grants combined (two sources to reconcile and audit).
- Q: Can Admins define roles beyond Viewer, Editor, Steward and Admin? → A (OP-14, **decided by
  the owner**): Yes. The four built-in roles stay as presets that cannot be deleted or changed. An
  Admin can create a custom role with a name, a description and a set of permissions (actions of
  the role matrix, each optionally limited by conditions such as branch, path, document type or
  classification level); custom roles cannot hold the `admin` action, so only the built-in Admin
  manages access. While creating or editing a role the Admin adds its members exactly as access
  grants: by Entra group and/or by e-mail, with an optional scope. A person's effective
  permissions are the union of every role they receive through their groups and their e-mail,
  each within its scope; the baseline prohibitions and guards then apply. Deleting a custom role
  in use needs a confirmation that lists the affected people; the last-Admin guard still holds;
  role changes are versioned, audited and dry-run ("what changes for whom") like policies
  (FR-026, FR-027).

### Session 2026-10-22 (owner decision on the Entra sign-in library, decided)

- Q: Which library signs people in to Entra? → A (**decided by the owner**): Microsoft's MSAL
  Node with an Azure App Registration, on the server (authorization code with PKCE, the existing
  server-side session and HttpOnly cookie, so no token reaches the browser). Generic OpenID
  Connect providers and Keycloak keep the generic OpenID client. The App Registration's
  credential is a certificate (preferred) or a client secret, both from Key Vault references, or
  the federated credential of the container app's managed identity. Agent clients get their
  tokens with MSAL as well; the server keeps validating them against the provider's keys
  (FR-010, FR-011, FR-141).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in to a team workbench, and nothing changes locally (Priority: P1)

A data steward opens the team's workbench URL. There is no workbench sign-in screen: the browser
goes straight to the organisation's identity provider (Entra ID single sign-on; Keycloak in
compatibility mode), and she lands on the workspace already signed in, with her name and role in
the header. Live updates arrive as before. She signs out from the header and sees a short
"You are signed out" page. A colleague who signs in before an Admin has granted him access sees
a **No access** page naming the account he is signed in with. On his laptop, a developer runs the
workbench locally exactly as in v0.3.0: no sign-in, every action available.

**Why this priority**: without an identity there is nothing to authorise; and local mode is the
existing product that must not regress.

**Independent Test**: start the server in server mode against the mock OpenID provider with
Entra-shaped claims and seeded access grants, sign in as each test user through the browser,
check the direct redirect to the provider, header, live updates, token refresh, sign-out with
the signed-out page, session expiry and the **No access** page for the users without a matching
grant; start in local mode and run every existing suite
unchanged. On the owner's machine, the Keycloak compatibility suite repeats the sign-in against
the Keycloak test realm.

**Acceptance Scenarios**:

1. **Given** server mode with a configured provider, **When** an unauthenticated browser requests
   any page or API route, **Then** pages redirect straight to the provider's authorization
   endpoint (no workbench sign-in page in between) and return to the requested page after
   sign-in, and API routes answer 401 without any workspace data.
2. **Given** a successful sign-in, **When** the workspace loads, **Then** the header shows the
   person's display name and effective role, and the browser holds only the session cookie (no
   access, ID or refresh token is readable by page scripts or present in any response body).
3. **Given** a signed-in session, **When** the live-update stream connects, **Then** it
   authenticates with the session cookie and delivers events.
4. **Given** a signed-in session, **When** the person chooses **Sign out**, **Then** the server
   session ends, the provider's sign-out is invoked, the live-update stream closes, and the
   provider returns the browser to the **Signed out** page, which does not sign the person in
   again until they choose **Sign in again**.
5. **Given** local mode, **When** the workbench starts, **Then** no sign-in is offered, the person
   acts as Admin, the API binds to loopback only, and all v0.3.0 behaviour and suites pass.
6. **Given** server mode without a complete provider configuration, **When** the server starts,
   **Then** it refuses to start and says which setting is missing; local mode refuses to bind
   anything other than loopback.
7. **Given** a signed-in person matched by no access grant (by group or by verified e-mail) and
   not a bootstrap Admin, **When** sign-in completes, **Then** they see the **No access** page
   with the name and address they are signed in as, a sentence saying that an Admin must grant
   them access, and **Sign out**; no workspace data is sent and every API route answers
   `403 {error: 'no access'}`. App roles in their token change nothing.
8. **Given** a person whose only matching grant is by e-mail, **When** the token's e-mail claim
   is not verified (Entra `email` without `xms_edov`, a guest UPN, or Keycloak
   `email_verified=false`), **Then** the grant does not match and they see **No access**.

---

### User Story 2 - See only what you may see (Priority: P1)

An analyst in the Sales domain signs in. The Projects tree lists the Sales projects and the shared
reference project; HR projects do not appear at all. In a Sales project, one folder is restricted
to the finance group, so the tree says "2 files you cannot open" without names. Search, the
lineage graph, the mapping graph, metric explanations, the agent context, delete impact,
suggestions, trash, drafts, Source Control diffs and file history never reveal those files or HR
content. A lineage edge to a hidden contract appears as an unresolved reference showing only the
name already written in the visible file.

**Why this priority**: the team deployment is only acceptable if confidential contracts stay
confined to their domain; every view today is built from the full workspace.

**Independent Test**: with the authorization test matrix fixture (three domains, restricted
paths, cross-project references), sign in as each test user and compare every API response and
every live-update frame against the expected readable set; any byte of an unreadable file fails
the test.

**Acceptance Scenarios**:

1. **Given** projects in domains Sales and HR, **When** a Sales-only Viewer lists projects,
   **Then** only Sales projects (and projects granted to everyone) are returned, with no count or
   name of HR projects.
2. **Given** a readable project with restricted files, **When** the person lists it, **Then** the
   restricted files are omitted and the project shows "N files you cannot open".
3. **Given** a file the person cannot read, **When** they request it, its draft, its history, a
   diff of it or its trash entry by path or id, **Then** the answer is 404, the same as for a
   path that does not exist.
4. **Given** a visible mapping that references an ontology in an unreadable project, **When** the
   agent context, the mapping graph or a metric explanation is built, **Then** only readable
   documents are used; the reference is reported as unresolved and the hidden document's content
   and path are not included.
5. **Given** another person edits an HR file, **When** the Sales analyst is connected to live
   updates, **Then** no event, replayed event or count about that file reaches the analyst.
6. **Given** a repository whose history contains a restricted file, **When** the analyst views
   history, **Then** commits are listed with their readable paths only, and a commit that touched
   only unreadable paths is shown as "1 commit with changes you cannot open" without message.
7. **Given** a move, import or restore whose target path is occupied by a file the person cannot
   read, **When** the conflict is reported, **Then** it says the target is unavailable without
   naming the occupying file.
8. **Given** the person's group membership or a project's grant changes, **When** the change takes
   effect, **Then** their live-update stream is closed and the next load reflects the new set.

---

### User Story 3 - Roles decide what you can do (Priority: P1)

A Viewer browses and exports what they can read but sees no edit, commit or delete controls. An
Editor edits files, creates metrics, commits and pushes feature branches. A Steward also
changes classifications, approves metrics of their domain and publishes to protected branches.
An Admin manages access, remotes, clones and workspace-wide deletion. Every refusal comes from
the server, so a crafted request is refused exactly as a hidden button would be.

**Why this priority**: read filtering without write control would let any signed-in person
rewrite any readable contract; the role matrix is the core of the release.

**Independent Test**: the authorization test matrix calls every route with every test user and
compares each answer with the expected decision in the role matrix (FR-030); the browser check
confirms that controls are hidden or disabled with a reason for each role.

**Acceptance Scenarios**:

1. **Given** a Viewer, **When** they send any write request (save, save-batch, item edit, metric
   save, import, move, delete, restore, stage, commit, branch, pull, push, gitignore, grouping of
   another person), **Then** the server answers 403 for a readable target and 404 for an
   unreadable one, writes nothing and records the denial in the audit log.
2. **Given** an Editor of the Sales domain, **When** they edit, commit and push a Sales file on
   their own branch, **Then** each step succeeds.
3. **Given** an Editor, **When** they change an ODCS `classification` value, **Then** the save is
   refused with a message naming the guarded field and the role that may change it.
4. **Given** any role, **When** the UI renders, **Then** actions the person may not perform are
   hidden, or shown disabled with the reason when hiding would confuse (for example **Approve**).
5. **Given** an Admin, **When** they open **Projects** and **Roles & access**, **Then** they can
   assign projects to domains, restrict paths to groups or people, grant roles to groups and
   e-mail addresses and grant agent clients, and the change applies to the next request.

---

### User Story 4 - Your own working copy in server mode (Priority: P2)

Two Editors work on the same repository at the same time. Each has their own working copy,
branch, drafts, staged changes and view settings; one switching branch, staging or pulling never
changes the other's files. Commits carry the signed-in person as author. When an Editor
publishes to the repository's default branch, Viewers and the next pull of the other Editor see
the change.

**Why this priority**: with a shared working tree one person's branch switch rewrites everyone's
files; collaboration must happen through commits.

**Independent Test**: two signed-in Editors in two browser contexts on one repository: edit the
same file on different branches, stage, commit, switch, pull; assert each person's files, drafts
and Source Control state are unaffected by the other, and that commit authors match the
identities.

**Acceptance Scenarios**:

1. **Given** server mode and an Editor opening a repository for the first time, **When** the
   workspace loads, **Then** a personal working copy on a personal branch is created from the
   default branch, and the person edits only that copy.
2. **Given** two Editors with working copies, **When** one stages, commits, switches branch or
   pulls, **Then** the other's files, drafts, staged changes and branch are unchanged.
3. **Given** a commit in server mode, **When** it is created, **Then** its author is the
   signed-in person's display name and email from the provider and it carries a trailer with the
   person's stable id; the Git identity dialog is not offered in server mode.
4. **Given** drafts, grouping corrections and view settings, **When** two people work on the same
   file, **Then** each person's drafts and view settings are their own and are never listed to the
   other.
5. **Given** a Viewer, **When** they read a repository, **Then** they see the published state of
   its default branch and get no working copy.
6. **Given** one person with two tabs open on the same file of their working copy, **When**
   both tabs save, **Then** the existing hash check refuses the stale save (two people never
   share a working copy).

---

### User Story 5 - Governed metrics and protected classifications (Priority: P2)

An Editor proposes a metric. The Steward of the metric's domain reviews and approves it; the
Editor who owns it cannot approve it. Later an Editor changes the approved metric's expression:
the server saves it as **proposed** again and the Steward sees it in the review list. Changing
the classification of a column, or editing a column classified at or above the protected level,
needs a Steward of that domain.

**Why this priority**: approved metrics and classifications are the governance promises of the
product; today the status rules live only in the wizard and can be bypassed through Source.

**Independent Test**: metric lifecycle and classification fixtures run through every write path
(Source save, save-batch, item editor, metric wizard, legacy document save, import with replace,
revert, pull) with each test user; each change is accepted or refused per FR-060 to FR-067.

**Acceptance Scenarios**:

1. **Given** an Editor saving a metric with status draft or proposed, **When** the save arrives by
   any write path, **Then** it is accepted.
2. **Given** an Editor, **When** a save sets a metric's status to approved or deprecated, **Then**
   it is refused.
3. **Given** the Steward of the metric's domain who is also its owner, **When** they approve it,
   **Then** it is refused (no self-approval); another Steward of the domain may approve.
4. **Given** an approved metric, **When** a non-Steward changes anything in it other than its
   description, **Then** the server stores it with status proposed and says so.
5. **Given** a column classified `confidential`, **When** an Editor changes that column, **Then**
   the save is refused; reading the file is unaffected.
6. **Given** a pull or revert that would bring in a guarded change, **When** the person lacks the
   right, **Then** the operation is refused before any file changes and names the guarded items
   (by pointer in readable files only).

---

### User Story 6 - Remote Git with your own credentials (Priority: P2)

An Editor pushes their branch to the team's Azure DevOps repository. The server obtains a token
for Azure DevOps on behalf of the signed-in person; the push is attributed to that person in
Azure DevOps. For a GitHub remote, the person connects their GitHub account once per session and
pushes with their own user token. An Admin is the only one who can add or change a remote
address or clone a repository.

**Why this priority**: a container has no interactive credential helper, and a shared credential
would hide who pushed; pointing a remote elsewhere is an exfiltration path.

**Independent Test**: against a local bare repository served through a credential-checking test
Git server, run fetch, pull and push as each test user with stubbed token issuance; assert the
credential used belongs to that person, is never written to disk in plain text or logs, and that
remote changes by non-Admins are refused.

**Acceptance Scenarios**:

1. **Given** an Azure DevOps remote and a signed-in Editor, **When** they push, **Then** the server
   uses a token obtained on their behalf, the push succeeds under their identity, and the token
   appears in no file, log, response or Git configuration.
2. **Given** a GitHub remote and a person who has not connected GitHub, **When** they press
   **Push**, **Then** they are asked to connect their GitHub account and the push continues after
   consent.
3. **Given** an Editor or Steward, **When** they try to add or change a remote address or clone,
   **Then** the server refuses; an Admin may do so, and the change is audited.
4. **Given** a remote host not on the allowed host list, **When** an Admin sets that address,
   **Then** it is refused with the list of allowed hosts.
5. **Given** local mode, **When** a remote operation runs, **Then** the machine's own Git
   credential configuration is used as in v0.3.0.

---

### User Story 7 - Agents call the API with their own identity (Priority: P2)

An automation registered in Entra calls the agent catalog, context and plan with a client
credentials token. It sees only the mappings of projects an Admin granted to it, and its calls
appear in the audit log under its client id.

**Why this priority**: external agents are the most likely automated consumers of the workspace
and today can read everything.

**Independent Test**: obtain client-credentials tokens (Entra-shaped application tokens) from the
mock OpenID provider for a granted and an ungranted client; call the three agent routes and
compare results with the grants.

**Acceptance Scenarios**:

1. **Given** a valid application token of the configured tenant from a client an Admin granted
   (no app role required), **When** it calls
   `/api/agent/catalog`, **Then** only mappings in granted projects are listed.
2. **Given** a bearer token, **When** it calls any route outside `/api/agent/*`, **Then** the answer
   is 401.
3. **Given** an expired, wrongly signed, wrong-audience or wrong-issuer token, **When** it calls an
   agent route, **Then** the answer is 401 and the attempt is audited.
4. **Given** a mapping whose ontology lives in a project not granted to the client, **When** the
   context is built, **Then** the ontology is not resolved from that project.

---

### User Story 8 - Admin panel: control roles, policies and access (Priority: P1)

An Admin opens **Admin** from the header. Each area opens in its own dialog, never crowding the
main screen: **Users & groups** lists everyone seen through sign-in with their effective roles and
the grant each role comes from, and can deactivate a person locally; **Roles & access** is where
access is given: on its **Grants** tab the Admin adds an Entra group (pasting its object ID; the
group's display name is looked up and shown) or a person's e-mail address, picks a role and a
scope (whole workspace, some domains or some projects), and sees every grant in one table; on its
**Roles** tab the Admin sees the four built-in roles with their permissions (read-only) and
creates or edits custom roles: name, description, permissions chosen from the actions of the role
matrix with optional conditions, and members added the same way as grants, by group or e-mail with
an optional scope; **Policies** lists the attribute rules, edits common rules through a structured
form (classification level, metric ownership, Git limits, branch protection) or
as raw policy text with validation, with a dry run, version history, diff and rollback; **Access
check** answers "can X do Y on Z?" with the decision and the rules that produced it, and "who can
access this project or file?"; **Projects** sets each project's domain, restricted paths and
the Stewards listed for information; **Audit** filters and exports the audit log; **Settings** shows
the provider connection, session settings and remote-credential policy. In local mode the panel is
available to the implicit Admin (identity-related areas say they apply to server mode).

**Why this priority**: P1, because every other server-mode story depends on it. Projects without
a domain are readable only by Admins (FR-031) and nobody but the bootstrap Admins has a role until
an Admin grants one, so a team deployment is unusable until an Admin can assign domains, grant
roles to groups and people and check the result; without a panel this would mean editing
state files inside a container, which is error-prone and unaudited. Policy history, rollback and
the simulator are what make immediate-effect changes safe.

**Independent Test**: as the Admin test user, use every dialog to add a group grant and an e-mail
grant, create a custom role with members, change policies, and verify through the simulator and
through the next API responses of the affected test users that the change applied; try to remove the
last Admin and confirm the refusal; break a policy in the raw editor and confirm it is not
activated; roll back a version and confirm the previous decisions return; find every change in the
audit view.

**Acceptance Scenarios**:

1. **Given** an Admin, **When** they open **Users & groups**, **Then** every person seen through
   sign-in is listed with display name, verified e-mail address, last sign-in, provider groups
   (with resolved names), effective roles per domain and project, and the source of each role
   (group grant naming the group, e-mail grant, bootstrap Admin), searchable by name, e-mail or
   group.
2. **Given** an Admin, **When** they deactivate a person, **Then** that person's sessions end at
   once, their next sign-in is refused with a message, the provider is not changed, and the action
   is audited; reactivation restores access.
3. **Given** an Admin, **When** they grant Steward on domain D to an Entra group by its object ID,
   **Then** the group's display name is shown next to the ID (or "name not resolved" with the ID
   kept when the directory lookup fails), and the simulator and the next request of every member
   reflect the grant.
4. **Given** an Admin, **When** they grant Editor on one project to `Alice@Example.org`, **Then**
   the address is stored as `alice@example.org`, and the person whose verified address is
   `alice@example.org` in any letter case receives Editor on that project at the next request.
5. **Given** an Admin, **When** they create the custom role "Metric reviewer" with the actions
   read and approve metrics, limited to documents of type metric, and add a group and an e-mail
   address as members scoped to domain Sales, **Then** those members receive exactly those
   permissions in Sales projects, in addition to the permissions of their other roles, and the
   access check shows the custom role as the source.
6. **Given** a built-in role, **When** an Admin tries to delete it or change its permissions,
   **Then** the request is refused; **Given** a custom role that still has members, **When** the
   Admin deletes it, **Then** a confirmation lists the people who would lose permissions, and
   only after confirmation the role and its grants are removed in one version.
7. **Given** an Admin editing a policy, a role or a grant, **When** they save, **Then** the
   change is validated against the schema, a dry run shows which decisions of the authorization
   test matrix and of the last 1,000 audited decisions would change and, for role and grant
   changes, what changes for whom (each known person and agent client with the actions gained or
   lost per project), and it is activated only after confirmation; an invalid change is never
   activated.
8. **Given** a version history of policies, roles or grants, **When** an Admin opens a version,
   **Then** they see who changed what and when, a diff against the current version, and **Roll
   back**, which creates a new version equal to the chosen one.
9. **Given** any change that would leave no active Admin (removing the last Admin grant,
   narrowing the last Admin group grant, deactivating the last Admin, a policy forbidding Admin
   actions), **When** it is saved, **Then** it is refused with the reason; the bootstrap Admin
   configured in the environment always keeps Admin and is the documented break-glass
   recovery.
10. **Given** the access check, **When** an Admin asks whether person X (a known person, or one
    not yet signed in described by groups and an e-mail address) may perform action Y on
    resource Z, **Then** the answer shows allow or deny, the matching grants, the roles they give
    (built-in or custom), the rules that decided it and the attributes used; "who can access"
    lists groups, e-mail addresses, people and agent clients with their effective actions.
11. **Given** a Steward, **When** they open **Audit**, **Then** only entries about projects of
    their domains are listed; every other Admin area is unavailable to them.
12. **Given** any security-relevant action (FR-100), **When** it is decided, **Then** one audit
    entry records time, person or client, action, resource, decision, reason and request id, and
    the audit view filters by person, action, resource, decision and time and exports the
    filtered entries.

---

### User Story 9 - Run it as a container, locally and on Azure (Priority: P1)

A developer runs `docker compose --profile local up` and gets the workbench in local mode from the
image, on `http://127.0.0.1:4310`, without sign-in, with the workspace in a folder on their
machine. With `--profile keycloak` the same compose file also starts a development Keycloak and
runs the image in server mode against it (the compatibility setup); the container check runs the
image in server mode against the mock OpenID provider without any external provider. An Admin
deploys the same image to Azure Container Apps with
a mounted file share for the data root, the provider settings and secrets from Key Vault, a
managed identity and a single replica. The README gives the steps for Entra (app registration,
groups claim, optional claims for the verified e-mail address, the directory permission for
overage and group names; no app roles), for Keycloak (realm, client, group mapper, verified
e-mail) and the Azure resources to create by hand.

**Why this priority**: P1 and early, by owner decision. The container is the shape server mode
ships in; building it right after the foundations means every later story is verified in the
image as well as on the developer machine, and image or platform problems (non-root file access,
network shares, health probes, revision updates) surface while the code is still small.

**Independent Test**: build the image; run it in local mode with a mounted folder and run the
local browser suites against it; run it in server mode against the mock OpenID provider, sign
in, restart the container and confirm sessions and data survive; start a second container on the
same volume and confirm it refuses to serve; start a container of a different revision on the
same volume and confirm the hand-over. The Compose `keycloak` profile repeats the sign-in on the
owner's machine; the Azure guide is followed on the trial subscription by the owner (owner
acceptance, trial runbook).

**Acceptance Scenarios**:

1. **Given** the image and a mounted data folder, **When** the container starts in local mode,
   **Then** it serves the built frontend and the API on `127.0.0.1` of the host without sign-in,
   as the implicit Admin, and the local browser suites pass against it.
2. **Given** the image, **When** it is inspected and started, **Then** the process runs as a
   non-root user, the data root is a volume, the image carries its version and commit, and the
   container health check calls the liveness endpoint.
3. **Given** the image in server mode behind the platform ingress, **When** it starts, **Then** it
   serves the built frontend and the API on one HTTPS origin, and health endpoints answer without
   sign-in and without workspace data.
4. **Given** the image in server mode against the mock OpenID provider (container check) or the
   Compose `keycloak` profile (compatibility, owner's machine), **When** it starts, **Then** a
   person can sign in to the containerised workbench with a test user.
5. **Given** a restart, **When** a signed-in person reloads, **Then** their session is still valid
   (until its normal expiry) and all files, worktrees, drafts and audit entries are intact.
6. **Given** more than one replica of the same revision, **When** the second starts, **Then** it
   detects the live instance on the same data root and refuses to serve, naming the
   single-replica constraint.
7. **Given** a revision update on Azure Container Apps, **When** the new revision starts while the
   old one still runs, **Then** the new one waits without serving data, takes over when the old
   one releases the data root at shutdown, and the interruption lasts at most the shutdown time
   plus 30 seconds.

---

### User Story 10 - Verified locally with one command, delivered by the target's Azure DevOps pipeline (Priority: P1)

The owner changes the code on their machine and runs `bun run ci:validate`: type check, unit and
API tests, build, mutation suite, every browser suite of the quality gate (sign-in included,
against the mock OpenID provider), the image build, scan and bill of materials, the suites against
the image and the check of the pipeline definition all run, and any failure stops the run with a
summary. Nothing runs on the GitHub repository. For a release the owner hands the tagged commit
over to the target's Azure Repos mirror. The repository ships `azure-pipelines.yml`; the target
organisation imports it from its mirror into Azure DevOps, fills one variable group and sets up a service connection, an environment and
an agent pool from the guide. On the target, every run validates and builds the image with the
same scripts; runs of `main` and of version tags push the image to the target's registry; a
version tag `v0.4.0` waits for the approvals and checks of the target's `production` environment,
deploys the image by digest to Azure Container Apps signing in through workload identity
federation, runs a smoke test and, if it fails, returns to the previous revision. A manual
rollback pipeline puts an earlier version back through the same approvals.

**Why this priority**: P1, by owner decision. The verification gate of the constitution is only
reliable when one command runs all of it, and the target environment needs a reproducible,
approved, reversible delivery that runs exactly what the owner ran.

**Independent Test**: on the owner's machine, introduce a failing unit test and a base image with
a fixable critical vulnerability and confirm `ci:validate` and `image:scan` fail; confirm the
pipeline check rejects a pipeline step that is not a package script, an unpinned container image
and a secret variable; run the pipeline dry run and confirm the stages, conditions and steps for a
pull request, a `main` run and a version tag, with the deploy and rollback logic exercised against
a fake Azure client; confirm the pipeline references no Keycloak and that its Validate stage
signs in against the mock OpenID provider; confirm the repository holds no workflow or bot
configuration. Owner acceptance (the implementer has no access): on the trial Azure DevOps
organisation and subscription, the owner follows the trial runbook (hand-over to the mirror,
import, configure from the guide, tag, approve, deployment, smoke test, rollback, no stored
credential, Entra sign-in) and returns the filled report.

**Acceptance Scenarios**:

1. **Given** the owner's machine with Bun, Playwright browsers and Docker or Podman, **When** they
   run `bun run ci:validate`, **Then** type check, unit and API tests, build, mutation suite,
   browser suites (sign-in against the mock OpenID provider included), image build, image scan,
   bill of materials, the suites against the image and the pipeline check all run, and a failure of any of them gives a non-zero
   exit and names the failed step.
2. **Given** the image scan (`bun run image:scan`), **When** it finds a critical or high
   vulnerability that has a fix, **Then** it fails unless the finding is listed in the ignore file
   with a reason and an expiry date that has not passed.
3. **Given** the pipeline definition, **When** `bun run pipeline:lint` runs, **Then** it validates
   the definition against the pinned Azure Pipelines schema and the repository's rules (stages
   Validate, Image, Deploy; every script step calls a package script; container images pinned by
   digest; no secret variable; Azure access only through the service-connection parameter) and
   fails on any violation.
4. **Given** `bun run pipeline:dry-run`, **When** it runs for a pull request, a `main` run and a
   version tag, **Then** it lists the stages, jobs and steps that would run with their conditions,
   runs the local steps for real and the Azure steps against a fake Azure client, and fails if a
   step would differ from what `ci:validate` runs.
5. **Given** the pipeline imported in the target organisation with its variable group, service
   connection, environment and agent pool, **When** a run of `main` or of a version tag passes the
   Validate and Image stages, **Then** the image is pushed to the target's registry tagged with the
   commit, and the bill of materials and scan report are kept as pipeline artifacts.
6. **Given** a version tag `v*` whose version core equals the `package.json` version of its commit
   and is not older than the highest version ever promoted, **When** the environment's approvals and checks
   pass, **Then** the pipeline signs in to Azure through the service connection with a short-lived
   federated token, rescans the image, tags the same digest with the version and deploys it by
   digest as a new revision; without approval nothing is deployed; a tag that fails the version
   rule fails before the approval request.
7. **Given** a deployed revision whose smoke test fails, **When** the failure is detected, **Then**
   the previous revision is restored as a new revision, the smoke test is repeated on it, and the
   run fails with both results in its summary.
8. **Given** an Admin of the target, **When** they run the rollback pipeline for an earlier version
   or for the previous revision, **Then** it is deployed after the same approvals and smoke-tested.
9. **Given** the GitHub repository, **When** anything is pushed to it, **Then** nothing runs: the
   repository contains no workflow and no bot configuration, and a test fails if one is added.
10. **Given** the pipeline definition, **When** the pipeline check runs, **Then** it fails if any
    stage starts or references Keycloak, a Keycloak image, `test:auth:keycloak` or an identity
    provider outside the agent; the Validate stage's sign-in suites run against the mock OpenID
    provider started by the test script on the agent's loopback, with Entra-shaped claims
    (`oid`, `tid`, `upn`, `email`, `xms_edov`, `groups`, group overage) and token refresh.
11. **Given** a release tag in this repository, **When** the owner follows the hand-over of the
    deployment guide (push to the target's mirror, or a Git bundle imported by someone with
    mirror access), **Then** the mirror holds the same commit and tag, and the target pipeline's
    image reports that commit in `/healthz`.

---

### Edge Cases

- Entra token with group overage (`hasgroups` or `_claim_names`): the server resolves membership
  only for the groups named in grants and restricted paths, through the directory, and treats a
  failed lookup as "no group membership" with a visible message, never as full access.
- Group membership changes in the provider while a session is open: the change applies at the
  next token refresh (at most the provider's access-token lifetime, default about 60 minutes); a
  change of grants or roles in the Admin panel applies at the next request; an Admin can end a
  person's sessions immediately.
- A person receives several roles (through several groups, their e-mail, or both): their
  permissions are the union of those roles, each within its grant's scope; a role never extends
  to projects outside its grant's scope, except Admin, which is granted workspace-wide only.
- A person's e-mail address or UPN is changed in the tenant: e-mail grants follow the new address
  at the next sign-in or refresh; the Users list and the audit log keep the stable id, so the
  history stays attributable. The README states that e-mail grants trust the tenant's
  administration of addresses.
- A token carries an e-mail claim that is not verified (Entra `email` without `xms_edov`, a guest
  account's UPN containing `#EXT#`, Keycloak `email_verified=false`): e-mail grants never match
  it; group grants still apply.
- An Entra group named in a grant is deleted or renamed: a deleted group simply matches nobody
  (the grant shows "name not resolved" until an Admin removes it); a rename shows the new name the
  next time the Admin panel resolves names; the grant is keyed by object ID, so it is unaffected.
- A custom role is deleted while people hold it only through that role: after confirmation they
  lose its permissions at the next request and see **No access** if no other grant matches.
- A project with no domain assigned: readable only by Admins until an Admin assigns it (default
  deny), and the Admin sees it flagged "no domain".
- A file moved between projects in different domains: needs write rights on both; history in the
  target repository starts at the move commit.
- A restricted path pattern added after files exist: the files disappear from listings of people
  outside the group at their next request; their drafts of those files are kept but not served
  until access returns.
- A person's working copy has uncommitted changes when an Admin deletes the project: the
  confirmation lists the people with unpublished work, and their changes are kept in the trash
  entry.
- Session cookie stolen: it is bound to HTTPS, HttpOnly and SameSite, expires after inactivity,
  and state-changing requests also require the request header and Origin checks (FR-016).
- Clock skew between the provider and the container: token time checks allow at most 5 minutes.
- Two browser tabs of one person: they share one session and one working copy; base-hash checks
  still protect saves.
- Policy files fail validation at start-up: the server refuses to start in server mode; nothing
  falls back to "allow".
- A commit message names a restricted file: history shows commit messages of commits that touch
  at least one readable path as written; this residual exposure is documented (messages are
  written by people with write access to that repository).
- A person signs in for the first time while a branch named like their personal branch exists:
  the next free name is used.
- Remote token expires during a long push: the operation fails with the Git error and the person
  re-runs it; no credential prompt appears in the container.
- Local mode on a non-loopback address is requested: the server refuses and explains that server
  mode with sign-in is required. In a container this includes local mode started without host
  networking (or on Docker Desktop with host networking turned off): the server binds loopback
  inside the container, is unreachable, and its start-up log says to use the compose local profile
  and, on Docker Desktop, to enable host networking (OP-8).
- The mounted data folder is not writable by the container's non-root user (wrong owner on a
  bind mount or wrong mount options on Azure Files): start-up stops with the path and the user id
  instead of failing on the first save.
- A revision update starts the new revision while the old one holds the data root: the new one
  answers 503 with `Retry-After` on every route except health until the old one releases the lock
  at shutdown or its heartbeat is older than 30 seconds (FR-123).
- The smoke test fails after a deployment: the previous revision is restored; if it fails its
  smoke test too, the run fails, says so, and the app is left on the previous revision for a
  person to investigate.
- A version tag whose version core differs from `package.json`, or that is older than the version
  promoted earlier: the run fails in the Image stage, before any push or approval request, naming
  the reason.
- A new critical vulnerability is published between the image build and the deployment: the
  rescan in the Deploy stage fails, nothing is deployed, and the fix is a new commit and tag.
- Two version tags are pushed in quick succession: the environment's exclusive-lock check lets one
  deployment or rollback run at a time and keeps only the newest waiting run; the version rule
  refuses a tag older than the highest version ever promoted.
- `ci:validate` on a machine without Docker or Podman: the image and container steps fail with a
  message saying a container runtime is required (they never pass by skipping); each other step
  can still be run alone with `--step`. The Keycloak compatibility suite also fails, naming the
  missing runtime.
- The mock OpenID provider's issuer is configured on a real deployment by mistake: server mode
  refuses an `http://` issuer unless the public URL is a loopback address, so the mock (loopback
  `http://` only) can never sign people in to a deployed instance; the mock is not part of the
  image.
- A release is handed to the mirror as a source archive instead of a Git bundle: the mirror's
  commit differs from this repository's, so the image's commit and `sha-` tag name the mirror's
  commit; the guide recommends the bundle (same commit) and says how to record the mapping when
  an archive is used.
- The pipeline is imported with an incomplete variable group or missing service connection: the
  first step that needs a value fails naming the variable (the Image stage's push step checks the
  whole variable group), before any image is pushed or anything is deployed.
- A person is signed in during a deployment: sessions are persisted under the data root and
  survive the new revision; requests during the hand-over get 503 and the browser retries.
- Pre-release tags (for example `v0.4.0-alpha.1`) deploy to the same environment; until the
  read filtering, role enforcement and Admin panel stories are delivered, that environment holds
  only the test fixture workspace, never real contracts.

## Requirements *(mandatory)*

### Functional Requirements

#### Modes

- **FR-001**: The workbench MUST run in exactly one of two modes, chosen by configuration at start:
  **local** (default) and **server**.
- **FR-002**: Local mode MUST behave as v0.3.0: loopback binding, origin and host checks, no
  sign-in, and one implicit principal with the Admin role used for every authorization decision.
  All v0.3.0 suites MUST pass unchanged in local mode.
- **FR-003**: Local mode MUST refuse to bind to a non-loopback address. Server mode MUST refuse to
  start unless the provider, session secret, public URL and policy files are configured and valid.
- **FR-004**: In server mode every route except the `/auth/*` routes and pages and the health
  endpoints MUST require an authenticated principal; health endpoints MUST return no workspace
  data.
- **FR-005**: In server mode the server MUST serve the built frontend and the API from one origin
  so the session cookie is first-party.

#### Authentication and sessions

- **FR-010**: Server mode MUST sign people in through any OpenID Connect provider using the
  authorization code flow with PKCE, the server acting as a confidential client. Microsoft Entra
  ID is the primary, optimised provider (the only one on the target) and Keycloak MUST also be
  supported; both MUST be documented. Automated sign-in tests in `ci:validate` and in the target
  pipeline MUST use the mock OpenID provider (FR-141); Keycloak MUST be exercised by the
  compatibility suite `test:auth:keycloak` on the owner's machine; Entra on a real tenant is
  verified with the manual checklist. Entra sign-in MUST use Microsoft's MSAL Node library with
  an Azure App Registration (certificate preferred, client secret, or managed-identity federated
  credential); Keycloak and generic providers use a generic OpenID Connect client. MSAL's token
  cache MUST be kept per session inside the encrypted session record (FR-011) and MUST NOT be
  written anywhere else.
- **FR-011**: The browser MUST receive only an opaque session identifier in a cookie that is
  HttpOnly, Secure, SameSite=Lax and host-only. Access, ID and refresh tokens MUST stay on the
  server and MUST NOT appear in any response body, URL, log or audit entry. Only when the public
  URL is a loopback `http://` address (development and tests) may the cookie omit `Secure`; the
  server MUST refuse a non-loopback `http://` public URL.
- **FR-012**: Sessions MUST expire after a period of inactivity and after an absolute lifetime
  (defaults in Assumptions); sign-out MUST end the server session and call the provider's
  sign-out endpoint when it has one.
- **FR-013**: Sessions MUST survive a server restart until their normal expiry; stored session data
  (including tokens) MUST be encrypted at rest with a key supplied by configuration.
- **FR-014**: The live-update stream MUST authenticate with the session cookie and MUST close when
  the session ends, expires or the person's access changes.
- **FR-015**: Bearer tokens MUST be accepted only on `/api/agent/*`. They MUST be validated
  for signature against the provider's published keys, issuer, audience, expiry and not-before
  (5 minutes clock skew), MUST be application tokens (Entra `idtyp=app` and the configured
  tenant) and MUST come from a client id an Admin granted (FR-090); no app role is required.
- **FR-016**: State-changing requests in server mode MUST pass the Origin check against the public
  URL and carry a custom request header that cross-site forms cannot send. The one exception is
  sign-out from the script-free pages (**No access**): an HTML form `POST /auth/logout` that
  passes the Origin check and carries a per-session token embedded in the page.
- **FR-017**: The provider's ID token and userinfo MUST be validated (issuer, audience, nonce,
  signature, expiry); for Entra the tenant id MUST match the configured tenant.
- **FR-018**: The workbench MUST NOT have a sign-in screen of its own. In server mode an
  unauthenticated request for a page MUST be answered with a redirect straight to the provider's
  authorization endpoint (PKCE S256, `state`, `nonce`, the requested same-origin path kept for the
  return); API routes MUST answer 401. The only workbench pages outside the workspace MUST be:
  **No access** (shown to a signed-in person who matches no access grant and is not a bootstrap
  Admin, or who is deactivated: the display name and verified address they are signed in as, a
  sentence that an Admin must grant access, and a **Sign out** link), **Signed out** (the
  post-sign-out return address: a confirmation and a **Sign in again** link, never an automatic
  sign-in) and a sign-in error page (provider unreachable, tenant mismatch, `state` or `nonce`
  mismatch: the reason and **Try again**). None of them carries workspace data.

#### Principal, roles and groups

- **FR-020**: The server MUST build one normalised principal from the provider's claims: stable id
  (Entra `tid`+`oid`; otherwise issuer+`sub`), display name, username, verified e-mail address
  (FR-024), groups, and whether it is a person or a client application. One mapping layer MUST
  serve Entra and Keycloak. Provider roles (Entra app roles, Keycloak client roles) MUST NOT be
  read for people.
- **FR-021**: The built-in roles MUST be Viewer, Editor, Steward and Admin, with the permissions of
  Appendix B; they cannot be deleted or changed. A person's roles MUST come only from access
  grants (FR-025) and from `SW_BOOTSTRAP_ADMINS` (FR-110). A signed-in person who receives no
  role MUST see the **No access** page (FR-018) and every API route MUST answer them
  `403 {error: 'no access'}`.
- **FR-022**: Group membership MUST be read from the groups claim (Entra group object IDs;
  Keycloak group names or paths from the group mapper). For Entra group overage the server MUST
  resolve membership of the groups named in grants and restricted paths through the directory
  and MUST treat a failure as no group membership, shown to the person.
- **FR-023**: Viewer ⊂ Editor ⊂ Steward in allowed actions. Admin holds every action on every
  project, including projects without a domain, subject to the rules that apply to everyone (no
  self-approval, guarded fields still audited). Wherever this specification requires "Steward in the
  project's domain", a principal whose effective permissions on that project include the action in
  question (through the built-in Steward role or a custom role) satisfies it.
- **FR-024**: The verified e-mail address of a person MUST be: for Entra, the `email` claim when
  the token also carries `xms_edov=true`, otherwise the UPN (`upn`, or `preferred_username` of a
  v2 token) unless it is a guest UPN containing `#EXT#`; for Keycloak and generic providers, the
  `email` claim only when `email_verified` is true. Otherwise the person has no verified address.
  Addresses MUST be compared trimmed and lower-cased. An unverified e-mail claim MUST never match
  an e-mail grant or a bootstrap Admin entry.
- **FR-025**: Access MUST be granted explicitly in the Admin panel. An access grant gives one role
  (built-in or custom) to one member, an Entra group by object ID (Keycloak: group name or path)
  or one person by e-mail address, within a scope: the whole workspace, a list of domains or a
  list of projects (Admin: whole workspace only). A group grant matches a person whose groups
  (after overage resolution) contain the group; an e-mail grant matches a person whose verified
  address equals the grant's address. When an Admin enters a group object ID, the server MUST
  look up its display name in the directory and store it for display; a failed lookup MUST keep
  the grant (keyed by the ID) and show "name not resolved". The workspace scope covers every
  project with a domain; a project without a domain is covered only by grants that name it.
- **FR-026**: Admins MUST be able to create, edit and delete custom roles: a unique name, a
  description and a set of permissions, each an action of the role matrix (any except `admin`)
  optionally limited by conditions (branch pattern, path pattern, document type, highest
  classification level); members are added as access grants of that role (FR-025). Built-in roles
  MUST NOT be deletable or editable. Deleting a custom role that has grants MUST require a
  confirmation listing the people and agent clients who would lose permissions, and MUST remove
  the role and its grants in one version.
- **FR-027**: A principal's effective permissions on a resource MUST be the union of the
  permissions of every role it receives through matching grants whose scope covers the resource
  (and of the bootstrap Admin role), with each permission's conditions applied; the baseline
  prohibitions (FR-107), restricted paths (FR-032), guards (FR-060 to FR-067) and deactivation
  then apply. Role and grant definitions MUST be compiled into the policy set evaluated by the
  decision boundary (FR-030), so the access check, the dry run and the matrix see the same
  decisions.

#### Authorization model

- **FR-030**: Every route and every server-side derivation MUST obtain its decision from one
  authorization boundary (`authorize` for a single action, `filter` for a set of resources). No
  route may decide access by itself. The decisions MUST follow the role matrix in Appendix B
  combined with the attribute conditions of FR-031 to FR-036.
- **FR-031**: A project MUST be readable by a person only when a role they receive through a grant
  covering the project includes reading, or the project is readable by everyone with access (any
  person with at least one grant), or the person is Admin. A project without a domain MUST be
  readable only by Admins and by grants that name it.
- **FR-032**: Within a readable project, Admins MAY restrict path patterns to groups or to people
  by e-mail address; a file matching a restricted pattern MUST be readable only by those groups'
  members, those people and Admins. File
  rules MUST depend only on the project and the path (never on content), so history and trash are
  decided the same way as the current tree.
- **FR-033**: Classification MUST NOT restrict reading.
- **FR-034**: Write decisions MUST also depend on the role in the project's domain, the target
  branch (protected branches), the guarded fields of FR-060 to FR-067 and, for cross-project
  operations, the rights on both sides.
- **FR-035**: Policies MUST be evaluated in-process with no network call; policy files and their
  schema MUST be versioned in the repository and validated at start-up; an invalid policy MUST
  stop the server (no fallback to allow).
- **FR-036**: For unreadable resources the server MUST answer 404 with the same body as a missing
  resource; for readable resources where the action is not allowed it MUST answer 403 with the
  reason (the role or guard required).

#### Read filtering everywhere

- **FR-040**: Project and file listings, file reads, the legacy document list, findings and every
  response that contains file content or paths MUST include only readable files.
- **FR-041**: Server-side derived data — agent catalog, agent context (including cross-project
  resolution), query plans, metric lists and explanations, metric previews, delete impact,
  grouping suggestions, validation findings — MUST be computed over the person's readable
  document set only.
- **FR-042**: Live-update events, including replayed events, MUST be filtered per connection by
  the same read decision; workspace-wide counts MUST be computed per person.
- **FR-043**: Git status, diff, branches, log, versions and show MUST include only readable paths;
  a commit that touches only unreadable paths MUST be summarised as a count without message,
  author or paths.
- **FR-044**: Trash listings, restore, undo and purge MUST include only entries whose original
  paths are readable by the person; drafts MUST be visible only to their owner.
- **FR-045**: Where a listing within a readable project omits files, the response MUST include the
  number omitted; conflicts with unreadable occupants MUST be reported without their names.
  Projects the person cannot read MUST NOT be counted or named anywhere (OP-3).
- **FR-046**: Exports and the agent-context export MUST contain only what the person could read
  through the API at that moment.
- **FR-047**: `/api/status` MUST return paths, recovery details and migration details only to
  Admins.

#### Write permissions

- **FR-050**: Every write path (file save, save-batch, item edit, legacy document save, metric
  save, import, examples, move, gitignore, revert, delete, restore, undo, purge, clear, grouping,
  drafts, suggestion accept/dismiss, project create/rename/delete, repository project
  registration, Git stage/unstage/commit/branch/switch/fetch/pull/push/sync/cancel, remote, clone,
  identity) MUST be authorised before any byte is written or any Git command runs.
- **FR-051**: The UI MUST hide actions the person cannot perform, or show them disabled with the
  reason where the action's absence would confuse; the UI MUST NOT be the enforcement point.
- **FR-052**: A denied write MUST leave files, Git state, drafts and state files unchanged.
- **FR-053**: A project created by a Steward (new project, import as a new project, example,
  clone by an Admin on behalf of a domain) MUST be assigned at creation to a domain the creator
  is Steward of (chosen in the dialog when there are several), so the creator can read it; only
  Admins may create a project without a domain.

#### Metric and classification governance

- **FR-060**: The server MUST compare the parsed document before and after every write (all paths
  in FR-050 that change content, and pull/revert/import-replace) with the shared validation
  modules and apply the guards FR-061 to FR-066.
- **FR-061**: Setting a metric's status to `approved` or `deprecated` MUST require Steward in the
  metric's domain (the project's domain) or Admin.
- **FR-062**: A person MUST NOT approve a metric whose `owner` identifies them (no self-approval),
  regardless of role.
- **FR-063**: Changing an approved metric (any field except `description`) by a person who may
  not approve it MUST store it with status `proposed`; the response MUST say so.
- **FR-064**: Changing the value of an ODCS `classification`, `criticalDataElement`, contract
  `team` or `roles` MUST require Steward in the project's domain or Admin.
- **FR-065**: Changing any part of an ODCS property (and its quality rules) whose classification
  is at or above the protected level (default: `confidential`; levels `public < internal <
  confidential < restricted`; other values mapped by Admins, unmapped values count as
  `internal`; per-project level settable by Admins) MUST require Steward in the project's domain
  or Admin (OP-2).
- **FR-066**: A guarded change refused inside a multi-file operation (save-batch, pull, revert,
  import) MUST refuse the whole operation and name the guarded pointers.
- **FR-067**: Metric `owner` and `steward` values MUST be matched against the principal's email or
  username (case-insensitive); values that match no person are treated as "no owner" for the
  self-approval rule and shown as unverified (OP-4). A `steward` value is informative and never
  grants approval rights.

#### Per-person working copies (server mode)

- **FR-070**: In server mode each person with Editor or higher MUST get a personal Git working copy
  per repository, created on first use from the repository's default branch on a personal branch,
  under the data root.
- **FR-071**: Branch, index, staged changes, drafts, view settings and grouping corrections MUST be
  per person; no Git or save operation of one person may change another person's files or state.
- **FR-072**: Viewers and people without a working copy MUST read the published state of the
  default branch, maintained by the server in the repository's base checkout, which nobody edits.
- **FR-073**: Commits in server mode MUST have the signed-in person as author (name and email from
  the provider) and the service as committer, and carry a `Signed-in-user:` trailer with the
  person's stable id. The Git identity dialog MUST be available only in local mode.
- **FR-074**: Publishing to the default branch or any protected branch MUST require Steward in the
  project's domain or Admin and MUST be a fast-forward; the published state MUST update for all
  readers after a publish (OP-1).
- **FR-075**: Git operations MUST stay serialised per repository across all working copies.
- **FR-076**: Working copies idle for a configured period MUST release their file watchers and
  cache memory without losing files or drafts.
- **FR-077**: Each working copy MUST start on a personal branch `work/<handle>`; a branch checked
  out in another working copy MUST NOT be switched to and MUST be shown as in use by that person;
  **Pull from default branch** MUST merge the default branch into the person's branch (OP-1).

#### Remote credentials

- **FR-080**: In server mode remote Git operations MUST use the signed-in person's own delegated
  credential: for Azure DevOps a token obtained on their behalf from Entra; for GitHub a user
  token obtained through an OAuth or GitHub App consent of that person.
- **FR-081**: Credentials MUST be passed to Git only for the duration of one command, through a
  mechanism that writes nothing to Git configuration; they MUST NOT be stored in plain text, and
  stored refresh credentials MUST be encrypted and end with the session.
- **FR-082**: Adding or changing a remote address and cloning MUST require Admin; remote hosts
  MUST be on a configured allow-list.
- **FR-083**: Remote operations MUST still run only on an explicit action and never in the
  background.
- **FR-084**: A person who lacks a connected credential for the remote's host MUST be offered the
  consent flow, then the operation continues.

#### Agent API

- **FR-090**: `/api/agent/catalog`, `/context` and `/plan` MUST accept the browser session or a
  client-credentials bearer token. A client's readable projects MUST be exactly those an Admin
  granted to its client id.
- **FR-091**: Agent responses MUST be computed over the caller's readable documents only (FR-041).

#### Administration and audit

- **FR-100**: The server MUST append one audit entry for: sign-in, sign-out, session expiry by
  Admin, denied requests, every write of FR-050, approvals and guarded-field changes, remote
  operations, remote and clone changes, access-grant and role changes, sign-ins refused for lack
  of a grant, agent calls (allowed and denied),
  and policy reloads. Each entry MUST record time, principal id and display name or client id,
  action, resource (project, path or entity id), decision, reason (rule id), outcome and request
  id; never document content or credentials.
- **FR-101**: Audit entries MUST be append-only on disk under the data root and also written to the
  standard output stream as structured lines for the platform's log collection.
- **FR-102**: Admins MUST be able to view, filter (person, action, resource, decision, time range)
  and export (JSON Lines and CSV) the audit log in the UI; Stewards MUST see entries about
  projects of their domains only.

#### Admin panel

- **FR-103**: An **Admin** entry in the header MUST open the Admin panel for Admins only (the
  implicit Admin in local mode). Each area MUST open as its own dialog; the main screen gains only
  the header entry.
- **FR-104**: **Users & groups** MUST list every principal seen through sign-in (people and agent
  clients) with display name, verified e-mail address or client id, last sign-in, provider groups
  with their resolved names, effective roles per domain and project, and the source of each role
  (the group grant with the group's name, the e-mail grant, or bootstrap Admin); people who signed
  in without any grant are listed as "no access" so an Admin can grant them a role from the row;
  it MUST support search and local deactivation and reactivation, which end the person's sessions
  and never call the provider.
- **FR-105**: **Roles & access** MUST have a **Grants** tab listing every access grant (member,
  resolved group name, role, scope, who added it and when) with add, change and remove, and a
  **Roles** tab showing the built-in roles with their permissions (Appendix B, read-only) and the
  custom roles with create, edit and delete (FR-026); editing a role shows its grants as members
  and adds members by Entra group object ID or e-mail address with an optional scope, through the
  same form as the **Grants** tab.
- **FR-106**: **Policies** MUST list the shipped baseline rules (read-only) and the Admin rules
  (create, edit, enable, disable, delete). Common rules MUST be editable through a structured form
  with these templates: classification level for editing, metric ownership and steward, Git
  action limits by role or branch, branch protection, agent client scope, time or network
  conditions (who holds which role is managed in **Roles & access**, not by policy text). An
  advanced editor MUST accept raw policy text with inline validation against the policy schema.
- **FR-107**: Admin rules MUST NOT weaken the baseline: baseline prohibitions (no self-approval,
  default deny for projects without a domain, bearer tokens only on agent routes, no access for
  deactivated people) always prevail over Admin rules.
- **FR-108**: Before activation every change to policies, custom roles, access grants, project
  access and agent client grants MUST pass schema validation (for roles, also compilation of the
  whole policy set) and a dry run over the authorization test matrix and the most recent 1,000
  audited decisions; the dry run MUST list the decisions that would change and, for roles,
  grants, project access and agent grants, what changes for whom (each known person and agent
  client with the actions gained or lost per project, and whether they gain or lose access);
  the Admin confirms or cancels. A change that fails validation MUST NOT be activated.
- **FR-109**: Every change to policies, custom roles, access grants, project access, deactivations
  and settings MUST be versioned with author, time and message; Admins MUST be able to view any
  version, diff two versions and roll back, which creates a new version equal to the chosen one.
  Activated changes MUST take effect on the next request and close affected live-update streams.
- **FR-110**: The workbench MUST refuse any change that would leave no active principal with the
  Admin role, counting only people who signed in within the session lifetime and still match an
  Admin grant (by group or verified e-mail) plus the bootstrap Admins. Bootstrap Admins, listed by
  verified e-mail address (FR-024) or stable id in the environment, MUST always hold Admin
  regardless of grants, policies or local changes; their use MUST be audited, and the README MUST
  document this break-glass recovery.
- **FR-111**: **Access check** MUST answer, for any principal (including one not yet signed in,
  described by groups and an e-mail address), action and resource, the decision, the matching
  grants and the roles they give (built-in or custom), the deciding rules and the attributes
  used; and, for a project or file, list the groups, e-mail addresses, people and agent clients
  that can read, edit, approve and publish it.
- **FR-112**: **Projects** MUST let Admins manage the list of domains, set each project's domain,
  everyone-with-access-can-read flag, listed Stewards (informational contacts shown to readers,
  like a metric's `steward` value; they grant nothing, roles come only from grants), restricted
  path patterns with their groups or people, protected branches and the protected
  classification level; and grant agent clients projects or domains.
- **FR-113**: **Settings** MUST show the provider connection (issuer, client id, discovery status,
  group claim mode, overage handling and directory lookups for group names, last key refresh),
  session settings (inactivity and
  absolute lifetime, editable), the remote-credential policy (allowed hosts, Azure DevOps
  on-behalf-of on/off, GitHub app configured) and the active sessions with **End session**.
  Secrets MUST never be shown.

#### Storage of access configuration

- **FR-114**: Policies, custom roles, access grants, domains, project access, deactivations and
  editable settings MUST be stored as text files in an administration Git repository under the data
  root, outside `data/projects/`, never listed as a project and never pushed anywhere. Each Admin
  change MUST be one commit authored by the Admin, written through the same atomic, hash-checked
  save as project files (OP-5); the server MUST load the active configuration from that repository's
  latest commit at start-up and after each change.

#### Container and deployment

- **FR-120**: The release MUST ship a multi-stage container image definition whose runtime stage
  holds only Bun, Git 2.40 or later, the built frontend and the server; runs as a non-root user;
  declares the data root as a volume; carries its version and commit; checks health through the
  liveness endpoint; and takes configuration only through environment variables and secret
  references. The same image MUST run in local mode and in server mode.
- **FR-121**: The README MUST document running the image with Docker Compose (local profile, and
  the `keycloak` compatibility profile with a development Keycloak; the Docker Desktop host
  networking setting), Azure
  Container Apps (primary) and App Service (alternative) deployment, the local build scripts, the
  Azure DevOps pipeline and what the target sets up for it,
  Entra and Keycloak setup, both modes, the role matrix, what each role can see, the outbound
  network calls of server mode, and the single-replica constraint with the path to scale.
- **FR-122**: The server MUST refuse to serve when it detects another live instance of the same
  revision on the same data root.
- **FR-123**: When the live instance on the data root belongs to a different revision (a revision
  update), the starting instance MUST serve only the health endpoints and answer 503 with
  `Retry-After` elsewhere until the other instance releases the data root or its heartbeat is
  older than 30 seconds, then take over; it MUST report itself ready to the platform meanwhile
  (state `handover`) so the update can proceed. Before it holds the lock it MUST NOT run journal
  recovery, migration or scanning and MUST NOT write under the data root except the start-up
  probe; after taking the lock it runs recovery and the first scan, then reports state
  `serving`.
- **FR-124**: In both modes the server MUST be able to serve the built frontend itself (always in
  the container), and `/healthz` MUST return the version and commit and nothing about the
  workspace; `/readyz` MUST report ready with state `serving` only after the instance lock,
  recovery and the first scan, or ready with state `handover` while waiting under FR-123, and
  not ready otherwise.
- **FR-125**: The container in local mode MUST keep every local-mode rule of FR-002 and FR-003; it
  is reached through host networking (OP-8). Start-up MUST stop with a clear message when the data
  root is not writable by the container user.
- **FR-126**: A Docker Compose file MUST provide a local profile (local mode, data folder of the
  developer's choice) and a `keycloak` compatibility profile (server mode against a development
  Keycloak loaded with the test realm, loopback public URL, development-only secrets). The
  container check MUST also run the image in server mode against the mock OpenID provider
  (FR-141), with no Keycloak, so the container suites can run in the target pipeline.

#### Local build and the target's delivery pipeline

- **FR-130**: The repository MUST run nothing automatically on its hosting service: it MUST contain
  no GitHub Actions workflow, no Dependabot or other bot configuration and no deployment from the
  repository. A repository test MUST fail when such a file is added. The target runs the pipeline
  from its own Azure Repos mirror; the guide never connects a pipeline to this GitHub repository.
- **FR-131**: The repository MUST provide package scripts that run every verification and build
  step on the owner's machine with Docker or Podman: `ci:validate` (type check, unit and API tests,
  production build, mutation suite, every browser suite of the quality gate including the sign-in
  suites against the mock OpenID provider, the image build, scan and bill of materials, the
  suites against the image, and the pipeline check; selectable per step; any failure gives a
  non-zero exit naming the step), `image:build`, `image:scan`, `image:sbom`, `image:push`,
  `test:container`, `pipeline:lint`, `pipeline:dry-run`, `deploy:check-version`, `deploy:azure`,
  `deploy:smoke` and `deploy:rollback`; and, outside `ci:validate` and the pipeline, the
  Keycloak compatibility suite `test:auth:keycloak`. Steps that need a container runtime MUST
  fail, not skip, under `ci:validate` (and `test:auth:keycloak` MUST fail, not skip) when none is
  present.
- **FR-132**: The image scan MUST fail on critical or high vulnerabilities that have a fix, unless
  each is listed in an ignore file with a reason and an unexpired date. Every built image MUST get
  a software bill of materials in SPDX JSON.
- **FR-133**: The repository MUST ship a multi-stage Azure DevOps Pipelines definition
  (`azure-pipelines.yml`) for the target organisation to import, with the stages **Validate**,
  **Image** and **Deploy** (deployment, smoke test and automatic rollback). Every step MUST either
  call a package script of FR-131 or be a built-in Azure DevOps task used only to sign in to Azure,
  publish test results or publish artifacts; the only other steps allowed are the shared setup
  (checkout, pinned Bun install, frozen dependency install, Playwright browser install). No
  verification, build or deployment logic may exist only in the pipeline.
- **FR-134**: Validate MUST run on every run (pull-request validation through the target's branch
  policy, pushes to `main`, version tags) with the steps of `ci:validate` other than `image` and
  `container`, which Image runs, so the two stages together run every `ci:validate` step. No
  stage may start or depend on Keycloak or any identity provider outside the agent: the sign-in
  suites of Validate and the server-mode container suites of Image run against the mock OpenID
  provider (FR-141) on the agent's loopback. Image MUST build, scan and
  inventory the image, run the suites against it, keep the bill of materials and scan report as
  pipeline artifacts, and push the image to the target's Azure Container Registry tagged with the
  commit only for runs of `main` and of version tags.
- **FR-135**: Deploy MUST run only for version tags `v*`, refuse before any approval a tag whose
  version without a pre-release suffix differs from the `package.json` version of its commit or is
  older than the highest version ever promoted (the highest version tag in the registry; only
  deployments add version tags, rollbacks add none), run as a deployment to an Azure DevOps environment (name
  set by a parameter, `production` by default) whose approvals and checks the target configures,
  one deployment at a time, rescan the image, tag the same digest with the version (no rebuild)
  and deploy it by digest.
- **FR-136**: The pipeline MUST access Azure only through Azure Resource Manager service
  connections that use workload identity federation; no Azure, registry or provider credential
  may be stored in the repository, the pipeline definition or the variable group. The service
  connection used to push needs only push rights on the registry; the one used to deploy needs
  only push rights on the registry and update rights on the container app.
- **FR-137**: After each deployment the pipeline MUST run a smoke test against the public URL:
  readiness reaches state `serving` (a hand-over is waited out), liveness reports the deployed
  commit and the version baked into the image (the `package.json` version), an unauthenticated
  API call gets 401 with no workspace data, an unauthenticated page request redirects straight
  to the provider's authorization endpoint (from its discovery document) with PKCE, and the
  security headers are present.
- **FR-138**: When the smoke test fails, the pipeline MUST restore the revision that ran before the
  deployment as a new revision, smoke-test it and fail the run. A manually started rollback
  pipeline MUST deploy a chosen earlier version, or the previous revision, through the same
  environment approvals and smoke test; it runs on the tag ref of the version to restore, so the
  environment's branch rule admits it.
- **FR-139**: Everything target-specific (subscription, tenant, resource group, registry,
  Container Apps environment and app, Key Vault, Entra application and tenant, public URL, agent
  pool, service connections, environment) MUST be a pipeline parameter or a variable of one
  variable group; infrastructure as code is out of scope. The target setup guide MUST list every
  Azure resource and role assignment and every Azure DevOps item (service connections, environment
  with approvals and checks, variable group, agent pool, pipeline import, branch policy) with the
  manual steps, and the deploy step MUST check before deploying that the container app has single
  revision mode, exactly one replica, the data volume and the managed identity.
- **FR-140**: The pipeline definition MUST be checked locally: validated against a pinned copy of
  the Azure Pipelines YAML schema and the rules of FR-133 to FR-136 (`pipeline:lint`), and
  simulated stage by stage with the Azure steps against a fake Azure client (`pipeline:dry-run`);
  both are part of `ci:validate`. Together with the container suites they are the implementation's
  done criteria for delivery; the real trial is owner acceptance (FR-143).
- **FR-141**: The repository MUST ship a self-contained mock OpenID provider used by the unit
  tests (in process) and by the browser, container and smoke checks (a loopback-only `http://`
  server started and stopped by the test scripts, never part of the image). It MUST implement
  discovery, signing keys (with key rotation), the authorization code flow with PKCE S256 (a
  test-user chooser page that browser checks drive, standing in for the provider's own sign-in),
  `state` and `nonce`, refresh tokens (which carry changed groups or addresses), client
  credentials, end-session with `post_logout_redirect_uri`, and a stand-in for Microsoft Graph
  `checkMemberGroups` (overage resolution) and `GET /groups/{id}` (group display names). Its
  default claim shape MUST be Entra's (`iss` with the tenant id, `oid`, `tid`, `sub`, `name`,
  `preferred_username`, `upn` (guest UPNs with `#EXT#`), `email`, `xms_edov`, `groups`, `roles`
  only on test users that prove app roles are ignored, `ver` 2.0, `idtyp=app` for applications,
  and group overage through `hasgroups` or `_claim_names`/`_claim_sources`), and it MUST offer
  Entra's endpoint layout (`/<tenant>/oauth2/v2.0/authorize`, `/token`, `/logout`, keys under
  `/<tenant>/discovery/v2.0/keys`, `client_info` in token responses, certificate and federated
  client assertions) so the MSAL path runs against it; Keycloak-shaped (`email`,
  `email_verified`, group names) and generic claim shapes MUST be selectable. Server mode MUST
  refuse an `http://` issuer unless the public URL is a loopback address, and MUST accept as the
  directory endpoint only Microsoft Graph or, under the same loopback condition, the mock's
  stand-in, so an app-only token is never sent elsewhere.
- **FR-142**: The deployment guide MUST document the release hand-over to the target's Azure Repos
  mirror: (a) someone with mirror access pushes the release commit as a branch
  `release/vX.Y.Z`, brings it into the mirror's `main` through a pull request (so the branch
  policy runs Validate and Image), then pushes the version tag, which points to the release
  commit; or (b) the owner produces a Git bundle of the release branch and the tag with its
  SHA-256 checksum, which someone with mirror access verifies and pushes the same way; a plain
  source archive is a documented fallback that changes the commit. The guide MUST state that the mirror never fetches
  from this repository automatically and that the commit pushed to the mirror is what the
  pipeline builds and reports.
- **FR-143**: The deployment guide MUST include an owner trial runbook: numbered steps from
  hand-over to rollback drill, each with the command or portal action, the expected output and a
  pass or fail box, and a report block (with subscription, tenant and resource identifiers
  replaced by placeholders) that the owner fills and returns to be recorded in
  `specs/003-authn-authz/verification.md`. Running it is owner acceptance, not an implementation
  task; each failed step becomes a follow-up task.

### Key Entities

- **Principal**: who acts. Person (stable id, display name, username, verified e-mail address,
  groups) or client application (client id). Local mode has one synthetic principal.
- **Session**: server-held sign-in state for a person (opaque id, principal, encrypted tokens,
  created, last seen, expiry, connected remote accounts).
- **Domain**: a named area of responsibility (for example Sales) that groups projects; grants can
  be scoped to domains.
- **Access configuration**: project-to-domain assignments, restricted path patterns with their
  groups or e-mail addresses, protected branches, protected classification level, agent client
  grants, allowed remote hosts.
- **Working copy**: a person's Git worktree of a repository, with its personal branch.
- **Published state**: the base checkout of a repository at the tip of its default branch.
- **Audit entry**: one security-relevant decision or action.
- **Policy set**: the shipped baseline rules (read-only) plus the Admin rules, with the schema
  they are validated against, evaluated by the decision boundary.
- **Role**: a named set of permissions (actions with optional conditions). Four built-in roles
  (Viewer, Editor, Steward, Admin; fixed) and any number of custom roles created by Admins.
- **Access grant**: one role given to one member, an Entra group (object ID and resolved display
  name) or a person (e-mail address), in a scope (workspace, domains or projects); the only
  source of roles besides the bootstrap Admins. A role's members are its grants.
- **Deactivation**: a local refusal of a principal, independent of the provider.
- **Administration repository**: the Git repository under the data root holding every Admin-edited
  configuration file; each commit is one configuration version.
- **Bootstrap Admin**: a person named in the environment who always holds Admin (break-glass).
- **Instance lock**: the record on the data root of the instance (host, process, revision,
  heartbeat) that may serve it.
- **Image**: the container image built from one commit (on the owner's machine or by the target's
  pipeline), identified by digest, with its version, commit, scan result and bill of materials.
- **Pipeline definition**: the Azure DevOps multi-stage definition and its rollback pipeline,
  shipped in the repository and run only by the target, with its parameters and variable group.
- **Release**: a version tag, the image digest it promotes and the pipeline run that deploys it;
  handed over to the target's Azure Repos mirror by push or Git bundle.
- **Mock OpenID provider**: the test identity provider of the gate and the pipeline, with
  Entra-shaped claims by default; never deployed.
- **Owner trial report**: the filled report block of the trial runbook, recorded in
  verification.md.
- **Deployment**: a revision of the container app running one image digest, with its smoke-test
  result and the previous revision kept for rollback.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The authorization test matrix covers 100% of routes (every implemented and planned
  route listed in Appendix A, as present after the rebase on 002) × the test users of the
  fixture × the readable/unreadable/guarded cases, and every answer matches the expected
  decision.
- **SC-002**: Across the whole matrix, zero bytes of an unreadable file, zero unreadable paths and
  zero names of unreadable projects appear in any response body, live-update frame or export.
- **SC-003**: Every new decision rule has at least one targeted mutant and the mutation suite
  detects 100% of them.
- **SC-004**: In local mode every v0.3.0 suite passes without modification.
- **SC-005**: Sign-in against the mock OpenID provider, from first request to workspace shown,
  completes in under 5 seconds in the automated browser check, and in under 5 seconds against the
  Keycloak test container in the compatibility suite.
- **SC-006**: With 5,000 files in 20 projects, filtering adds at most 150 ms to the project
  listing and at most 10% to the full workspace load compared with local mode.
- **SC-007**: Two Editors working concurrently on one repository for the whole two-person browser
  check never see the other's uncommitted change, branch or draft.
- **SC-008**: 100% of the security-relevant actions performed in the matrix produce exactly one
  audit entry with all required fields; no audit entry contains a token or document content.
- **SC-009**: The container image starts, passes health checks and accepts a sign-in within 30
  seconds on a workspace of the shipped examples, and keeps sessions and data across a restart;
  in local mode the local browser suites pass against the image as against the dev server.
- **SC-010**: The README's Entra and Keycloak guides let a person who has not seen the project
  reach a signed-in workspace (recorded once for Entra by the owner on the real tenant with the
  manual checklist, automated for Keycloak in the compatibility suite).
- **SC-011**: An Admin can assign a project to a domain, grant a role to an Entra group and to an
  e-mail address and confirm the result in the access check within 3 minutes, using only the
  Admin panel.
- **SC-012**: 100% of attempts in the test suite to remove the last Admin, activate an invalid
  policy or role, change or delete a built-in role, give a custom role the `admin` action,
  delete a custom role in use without confirmation or weaken a baseline prohibition are refused, and
  a rollback restores the previous decisions for 100% of the matrix cases.
- **SC-013**: `bun run ci:validate` runs 100% of the quality-gate checks of FR-131 (every check
  except the Keycloak compatibility suite, which is outside the gate), the pipeline's
  Validate and Image stages call the same steps (100% of them, checked by the pipeline check), and
  a full local run finishes within 45 minutes on the owner's workstation.
- **SC-014**: Every built image has a bill of materials, and no image pushed or deployed by the
  pipeline has an unignored critical or high vulnerability with a fix at that time.
- **SC-015**: From approval to a smoke-tested revision takes at most 15 minutes; when the smoke
  test fails, the previous revision serves again within 10 minutes (measured by the owner in the
  trial run; owner acceptance).
- **SC-016**: Zero Azure, registry or provider credentials are stored in the repository, the
  pipeline definition or the variable group (checked by `pipeline:lint`); every Azure sign-in of
  the pipeline uses a federated token (confirmed by the owner in the trial run).
- **SC-017**: A revision update interrupts service for at most the old instance's shutdown time
  plus 30 seconds, and never lets two instances serve one data root (measured locally by the
  container check with two image revisions on one volume; confirmed by the owner in the trial
  run).
- **SC-018**: The GitHub repository has zero workflow and bot configuration files, and from Phase 4
  on every phase ends with `ci:validate` green on the owner's machine, including `pipeline:lint`
  and `pipeline:dry-run`.
- **SC-019**: The pipeline definition references Keycloak or an external identity provider zero
  times (checked by the pipeline check), and the sign-in suites it runs cover 100% of the
  sign-in scenarios of US1 (direct redirect to the provider, sign-in, refresh, sign-out with the
  signed-out page, expiry, **No access** without a grant) and of the Entra claim and grant cases
  of FR-020 to FR-025 (`tid` check, `tid:oid` id, app roles ignored, group grant, e-mail grant,
  e-mail matched case-insensitively, unverified e-mail and guest UPN rejected, overage resolved
  and overage failure) against the mock OpenID provider.

## Assumptions

- Default session lifetimes: 8 hours of inactivity, 24 hours absolute; access tokens refreshed
  from the provider when they expire, which also refreshes roles and groups.
- Default protected branches: the repository's default branch (`main` when unset); Admins can add
  patterns.
- Classification levels are ordered `public < internal < confidential < restricted`; other
  free-text values map to `internal` unless an Admin maps them; the protected level defaults to
  `confidential`.
- Audit files are kept 400 days by default (configurable) and rotated monthly; long-term
  retention on Azure relies on the platform's log collection.
- A single running instance serves the team in v0.4.0 (in-process locks, live-update buffer and
  cache). The path to several instances: shared lock service, shared event bus, per-instance
  caches and session store outside the process; documented, not built.
- The Microsoft directory (Graph) is used only for group overage resolution (only for the groups
  named in grants and restricted paths) and for looking up the display names of granted groups,
  with one application permission (`GroupMember.Read.All`).
- No hosted LLM is introduced; no query is executed; source bytes are never rewritten by any
  access rule (redaction is never applied to documents).
- The target uses Microsoft Entra ID only (OP-9). Automated tests, in the gate and in the
  pipeline, use the mock OpenID provider with Entra-shaped claims; the Keycloak compatibility
  suite uses a Keycloak container with a realm file in the repository and runs on the owner's
  machine; Entra on a real tenant is verified manually by the owner with the documented
  checklist. Entra behaviour not reproduced by the mock (conditional access, consent prompts,
  token lifetimes set by the tenant) is covered only by that checklist.
- The implementer has no access to the trial Azure DevOps organisation and subscription (OP-10);
  the owner runs the trial from the runbook and returns the report.
- People's display names and emails from the provider may be shown to other people who share a
  project (commit authors, "in use by"), as in any Git hosting service.
- One Azure environment (production by default) is deployed by the target's pipeline;
  pre-release tags use it with the test fixture workspace until the P1 access stories are complete
  (see Edge Cases).
- The owner's machine has Bun, Playwright browsers and Docker Engine, Docker Desktop with host
  networking enabled, or Podman; images are built and tested there and never published from the
  repository.
- The target provides Linux agents with Docker (Microsoft-hosted `ubuntu-latest` by default, or a
  self-hosted pool named by a parameter) for the image build and the container checks; the
  agents need no network access to any identity provider during validation.
- The target's Azure Repos mirror is updated only by the release hand-over (OP-11); nothing
  connects it to this GitHub repository.
- Released images are kept in the target's registry so that rollback can reach any earlier
  version; retention of commit-tagged images is the target's choice, documented in the guide.

## Dependencies

- Feature 002 merged to `main`, then this branch rebased; the route list of Appendix A updated if
  002 changes.
- Constitution 3.0.0 (approved): two modes in Principle I, per-person state in IV, authorization
  mutants and test matrix in VI, README for both modes in VII.
- An OpenID Connect provider (Entra ID tenant with permission to create an app registration and
  grant admin consent to `GroupMember.Read.All`; no app roles are needed; or Keycloak 26 or
  later).
- For remote credentials: an Azure DevOps organisation connected to the same Entra tenant, or a
  GitHub OAuth app / GitHub App registered by the Admin.
- Container runtime for the image, the container checks and the Keycloak compatibility suite:
  Docker Engine, Docker Desktop with host networking, or Podman on the owner's machine; Docker on
  the target's agents (no Keycloak there).
- For delivery (target): an Azure DevOps organisation and project with an agent pool, Azure
  Resource Manager service connections using workload identity federation, an environment with
  approvals and checks and one variable group; and an Azure subscription with the resources of the
  target setup guide (resource group, Container Apps environment and app, storage account with an
  Azure Files share, Key Vault, Azure Container Registry, Log Analytics workspace, the app's
  user-assigned identity). The trial organisation and subscription exist and are used by the
  owner only (owner acceptance); the target's Azure Repos mirror receives each release by the
  hand-over of FR-142.

## Appendix A - What exists today (from the authorization inventory)

- No subject exists: every route trusts loopback and origin (`server/handler.ts`, `server/index.ts`).
- The browser loads every visible file of every project (`src/projects/api.ts`) and builds search,
  graph, lineage, metrics and exports in the browser, so read control must happen on the server
  by not sending files.
- Cross-project leaks by design: agent context resolution falls back to other projects
  (`server/agent/runtime.ts`), the agent catalog and `GET /api/documents` span the workspace
  (`server/handler.ts`), suggestions and delete impact name files of other projects
  (`server/projects/suggestions.ts`, `server/projects/workspace.ts`), trash, drafts and live
  updates are global (`server/routes/trash.ts`, `server/routes/drafts.ts`,
  `server/projects/events.ts`), `git/show` and `git/diff` read any commit (`server/routes/git.ts`).
- One working tree, index and branch per repository: a branch switch, stage or pull changes
  everyone's files.
- Drafts and view settings are keyed by project and path only (`server/projects/state.ts`).
- Commits use the repository or global Git identity, not a signed-in person
  (`server/projects/git.ts`).
- Metric status rules exist only in the wizard (`src/metrics/`), not on the server.

## Appendix B - Role matrix

Permissions of the built-in roles (fixed). V = Viewer, E = Editor, S = Steward, A = Admin. ✓
allowed in every project; (d) allowed in the projects the role's grant covers (and readable files
only); — refused. Custom roles choose any of these actions except managing access (`admin`), each
optionally with conditions, and apply in their grants' scope (FR-026, FR-027).

| Action | V | E | S | A |
| --- | --- | --- | --- | --- |
| List and read projects, files, graph, lineage, overview, search, findings | (d) | (d) | (d) | ✓ |
| Export a document, export agent context | (d) | (d) | (d) | ✓ |
| Metrics list, explanation, SQL preview, agent catalog/context/plan | (d) | (d) | (d) | ✓ |
| Git status, diff, branches, log, versions, show | (d) | (d) | (d) | ✓ |
| Own view settings and grouping corrections | (d) | (d) | (d) | ✓ |
| Edit files, add/edit/delete items, save-batch, own drafts | — | (d) | (d) | ✓ |
| Create or edit metrics as draft/proposed | — | (d) | (d) | ✓ |
| Approve or deprecate a metric (not one you own) | — | — | (d) | ✓ |
| Change classification, critical data element, ODCS team/roles; edit protected-level properties | — | — | (d) | ✓ |
| Import into a project, move within a project, edit .gitignore | — | (d) | (d) | ✓ |
| Move across projects, accept a suggestion (rights on both sides) | — | (d) | (d) | ✓ |
| Delete a file to trash, revert a file | — | (d) | (d) | ✓ |
| Undo or restore your own trash entry | — | (d) | (d) | ✓ |
| Restore another person's trash entry | — | — | (d) | ✓ |
| Purge an entry, empty trash | — | — | — | ✓ |
| Stage, commit, create or switch branch in your working copy | — | (d) | (d) | ✓ |
| Fetch, pull; push a non-protected branch | — | (d) | (d) | ✓ |
| Publish to the default or a protected branch | — | — | (d) | ✓ |
| Cancel your own running remote operation | — | (d) | (d) | ✓ |
| Create a project, rename a project, load an example | — | — | (d) | ✓ |
| Add or change a remote address, clone, register subfolder projects | — | — | — | ✓ |
| Set Git identity (local mode only) | — | — | — | ✓ |
| Delete a project, remove it from the workspace, clear the workspace | — | — | — | ✓ |
| Read `/api/status` details (paths, recovery, migration) | — | — | — | ✓ |
| Read the audit log | — | — | (d) | ✓ |
| Manage access, agent grants, allowed hosts, sessions | — | — | — | ✓ |
