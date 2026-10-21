# Feature Specification: Sign-In, Roles and Access Control for Local and Server Modes (v0.4.0)

**Feature Branch**: `003-authn-authz`

**Created**: 2026-10-21

**Status**: Clarified (five open points resolved with recommended defaults, OP-1 to OP-5; owner to
confirm). Constitution 3.0.0 applies.

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

Evidence for the current state: the authorization inventory of the 002 working tree (38 resource
types, 57 implemented and 9 planned routes, 45 UI action groups, 42 policy attributes) is
summarised in Appendix A.

## Clarifications

### Session 2026-10-21 (clarify pass, resolved with recommended defaults; owner to confirm)

The owner's decisions above settle modes, provider, session model, roles, rule coverage, read
granularity, policy engine, per-person worktrees, remote credentials, audit and the Admin panel.
Five points were left open; each is resolved with the recommended option and listed for the
owner (OP-1 to OP-5).

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

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in to a team workbench, and nothing changes locally (Priority: P1)

A data steward opens the team's workbench URL. The browser is sent to the organisation's sign-in
page (Entra ID or Keycloak); after signing in she lands on the workspace with her name and role
in the header. Live updates arrive as before. She signs out from the header and the next request
asks her to sign in again. On his laptop, a developer runs the workbench locally exactly as in
v0.3.0: no sign-in, every action available.

**Why this priority**: without an identity there is nothing to authorise; and local mode is the
existing product that must not regress.

**Independent Test**: start the server in server mode against the Keycloak test realm, sign in as
each test user through the browser, check header, live updates, sign-out and session expiry;
start in local mode and run every existing suite unchanged.

**Acceptance Scenarios**:

1. **Given** server mode with a configured provider, **When** an unauthenticated browser requests
   any page or API route, **Then** pages redirect to sign-in and API routes answer 401 without
   any workspace data.
2. **Given** a successful sign-in, **When** the workspace loads, **Then** the header shows the
   person's display name and effective role, and the browser holds only the session cookie (no
   access, ID or refresh token is readable by page scripts or present in any response body).
3. **Given** a signed-in session, **When** the live-update stream connects, **Then** it
   authenticates with the session cookie and delivers events.
4. **Given** a signed-in session, **When** the person chooses **Sign out**, **Then** the server
   session ends, the provider's sign-out is invoked, and the live-update stream closes.
5. **Given** local mode, **When** the workbench starts, **Then** no sign-in is offered, the person
   acts as Admin, the API binds to loopback only, and all v0.3.0 behaviour and suites pass.
6. **Given** server mode without a complete provider configuration, **When** the server starts,
   **Then** it refuses to start and says which setting is missing; local mode refuses to bind
   anything other than loopback.
7. **Given** a person whose token carries none of the four roles, **When** sign-in completes,
   **Then** they see a page saying they have no access to the workbench and whom to ask.

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
5. **Given** an Admin, **When** they open **Access**, **Then** they can assign projects to domains,
   restrict paths to groups and grant agent clients, and the change applies to the next request.

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
6. **Given** two people saving the same file in the same working copy is impossible, **When** a
   person's own two tabs save the same file, **Then** the existing hash check still refuses the
   stale save.

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

**Independent Test**: obtain client-credentials tokens from the Keycloak test realm for a granted
and an ungranted client; call the three agent routes and compare results with the grants.

**Acceptance Scenarios**:

1. **Given** a valid bearer token with the agent role from a granted client, **When** it calls
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
where each role comes from, and can deactivate a person locally; **Roles** shows the permission
matrix and maps provider groups and app roles to workbench roles, with optional per-project role
assignments; **Policies** lists the attribute rules, edits common rules through a structured form
(domain membership, classification level, metric ownership, Git limits, branch protection) or
as raw policy text with validation, with a dry run, version history, diff and rollback; **Access
check** answers "can X do Y on Z?" with the decision and the rules that produced it, and "who can
access this project or file?"; **Projects** sets each project's domain, access lists, stewards
and restricted paths; **Audit** filters and exports the audit log; **Settings** shows the
provider connection, session settings and remote-credential policy. In local mode the panel is
available to the implicit Admin (identity-related areas say they apply to server mode).

**Why this priority**: P1, because every other server-mode story depends on it. Projects without
a domain are readable only by Admins (FR-031), so a team deployment is unusable until an Admin can
assign domains, map groups to roles and check the result; without a panel this would mean editing
state files inside a container, which is error-prone and unaudited. Policy history, rollback and
the simulator are what make immediate-effect changes safe.

**Independent Test**: as the Admin test user, use every dialog to change assignments, roles and
policies, and verify through the simulator and through the next API responses of the affected
test users that the change applied; try to remove the last Admin and confirm the refusal; break a
policy in the raw editor and confirm it is not activated; roll back a version and confirm the
previous decisions return; find every change in the audit view.

**Acceptance Scenarios**:

1. **Given** an Admin, **When** they open **Users & groups**, **Then** every person seen through
   sign-in is listed with display name, email, last sign-in, provider groups, effective role per
   domain and the source of each role (Entra app role, group mapping, Keycloak client role, local
   assignment, bootstrap Admin), searchable by name, email or group.
2. **Given** an Admin, **When** they deactivate a person, **Then** that person's sessions end at
   once, their next sign-in is refused with a message, the provider is not changed, and the action
   is audited; reactivation restores access.
3. **Given** an Admin, **When** they map a provider group to Steward for domain D or assign a
   person Editor on one project, **Then** the simulator and the next request reflect it.
4. **Given** an Admin editing a policy, **When** they save, **Then** the policy is validated
   against the schema, a dry run shows which decisions of the authorization test matrix and of
   the last 1,000 audited decisions would change, and it is activated only after confirmation;
   an invalid policy is never activated.
5. **Given** a policy history, **When** an Admin opens a version, **Then** they see who changed
   what and when, a diff against the current version, and **Roll back**, which creates a new
   version equal to the chosen one.
6. **Given** any change that would leave no active Admin (removing the last Admin mapping,
   deactivating the last Admin, a policy forbidding Admin actions), **When** it is saved, **Then**
   it is refused with the reason; the bootstrap Admin configured in the environment always keeps
   Admin and is the documented break-glass recovery.
7. **Given** the access check, **When** an Admin asks whether person X may perform action Y on
   resource Z, **Then** the answer shows allow or deny, the rules that decided it and the
   attributes used; "who can access" lists people and groups with their effective actions.
8. **Given** a Steward, **When** they open **Audit**, **Then** only entries about projects of
   their domains are listed; every other Admin area is unavailable to them.
9. **Given** any security-relevant action (FR-100), **When** it is decided, **Then** one audit
   entry records time, person or client, action, resource, decision, reason and request id, and
   the audit view filters by person, action, resource, decision and time and exports the
   filtered entries.

---

### User Story 9 - Run it as a container on Azure (Priority: P3)

An Admin deploys the workbench image to Azure Container Apps with a mounted file share for the
data root, the provider settings and secrets from Key Vault, and a single replica. The README
gives the steps for Entra (app registration, app roles, group assignment, optional groups claim)
and for Keycloak (realm, client, roles, group mapper).

**Why this priority**: the server mode is only useful once it can be deployed reproducibly; the
deployment itself is configuration and documentation on top of US1–US8.

**Independent Test**: build the image, run it locally with the Keycloak container and a mounted
data folder, pass health checks, sign in, restart the container and confirm sessions and data
survive; follow the Azure guide on a test subscription (manual, recorded).

**Acceptance Scenarios**:

1. **Given** the image and a mounted data folder, **When** the container starts in server mode,
   **Then** it serves the built frontend and the API on one HTTPS origin behind the platform
   ingress, and health endpoints answer without sign-in and without workspace data.
2. **Given** a restart, **When** a signed-in person reloads, **Then** their session is still valid
   (until its normal expiry) and all files, worktrees, drafts and audit entries are intact.
3. **Given** more than one replica configured, **When** the server starts, **Then** it detects a
   second live instance on the same data root and refuses to serve, naming the single-replica
   constraint.

---

### Edge Cases

- Entra token with group overage (`hasgroups` or `_claim_names`): the server resolves membership
  only for the groups configured in grants, through the directory, and treats a failed lookup as
  "no domain membership" with a visible message, never as full access.
- Token roles change in the provider while a session is open: the change applies at the next token
  refresh (at most the provider's access-token lifetime, default about 60 minutes); an Admin can
  end a person's sessions immediately.
- A person holds several roles: the highest role applies within each granted domain; roles never
  extend to domains the person is not a member of, except Admin, which is workspace-wide.
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
  mode with sign-in is required.

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
- **FR-004**: In server mode every route except the sign-in callback routes and the health
  endpoints MUST require an authenticated principal; health endpoints MUST return no workspace
  data.
- **FR-005**: In server mode the server MUST serve the built frontend and the API from one origin
  so the session cookie is first-party.

#### Authentication and sessions

- **FR-010**: Server mode MUST sign people in through any OpenID Connect provider using the
  authorization code flow with PKCE, the server acting as a confidential client. Microsoft Entra
  ID and Keycloak MUST be supported and documented; Keycloak MUST be exercised by automated tests.
- **FR-011**: The browser MUST receive only an opaque session identifier in a cookie that is
  HttpOnly, Secure, SameSite=Lax and host-only. Access, ID and refresh tokens MUST stay on the
  server and MUST NOT appear in any response body, URL, log or audit entry.
- **FR-012**: Sessions MUST expire after a period of inactivity and after an absolute lifetime
  (defaults in Assumptions); sign-out MUST end the server session and call the provider's
  sign-out endpoint when it has one.
- **FR-013**: Sessions MUST survive a server restart until their normal expiry; stored session data
  (including tokens) MUST be encrypted at rest with a key supplied by configuration.
- **FR-014**: The live-update stream MUST authenticate with the session cookie and MUST close when
  the session ends, expires or the person's access changes.
- **FR-015**: Bearer tokens MUST be accepted only on `/api/agent/*`. They MUST be validated
  for signature against the provider's published keys, issuer, audience, expiry and not-before
  (5 minutes clock skew), and MUST carry the agent role.
- **FR-016**: State-changing requests in server mode MUST pass the Origin check against the public
  URL and carry a custom request header that cross-site forms cannot send.
- **FR-017**: The provider's ID token and userinfo MUST be validated (issuer, audience, nonce,
  signature, expiry); for Entra the tenant id MUST match the configured tenant.

#### Principal, roles and groups

- **FR-020**: The server MUST build one normalised principal from the provider's claims: stable id
  (Entra `tid`+`oid`; otherwise issuer+`sub`), display name, email or username, roles, groups,
  and whether it is a person or a client application. One mapping layer MUST serve Entra and
  Keycloak.
- **FR-021**: Roles MUST be Viewer, Editor, Steward and Admin, read from Entra app roles (assigned
  to groups) or Keycloak client roles; role names are configurable per provider. A principal
  without any of the four roles MUST be refused with an explanatory page.
- **FR-022**: Group membership MUST determine domain membership. For Entra group overage the server
  MUST resolve membership of the configured groups through the directory and MUST treat a
  failure as no membership, shown to the person.
- **FR-023**: Viewer ⊂ Editor ⊂ Steward in allowed actions. Admin holds every action on every
  project, subject to the rules that apply to everyone (no self-approval, guarded fields still
  audited).

#### Authorization model

- **FR-030**: Every route and every server-side derivation MUST obtain its decision from one
  authorization boundary (`authorize` for a single action, `filter` for a set of resources). No
  route may decide access by itself. The decisions MUST follow the role matrix in Appendix B
  combined with the attribute conditions of FR-031 to FR-036.
- **FR-031**: A project MUST be readable by a person only when the project is assigned to a
  domain the person is a member of, or is granted to everyone, or the person is Admin. A project
  without a domain MUST be readable only by Admins.
- **FR-032**: Within a readable project, Admins MAY restrict path patterns to groups; a file
  matching a restricted pattern MUST be readable only by members of those groups and Admins. File
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
  operations, remote and clone changes, access-grant changes, agent calls (allowed and denied),
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
  clients) with display name, email or client id, last sign-in, provider groups, effective role
  per domain and project, and the source of each role (provider app role, group mapping, provider
  client role, local assignment, bootstrap Admin); it MUST support search and local deactivation
  and reactivation, which end the person's sessions and never call the provider.
- **FR-105**: **Roles** MUST show the role matrix of Appendix B as the effective permissions of each
  role, and MUST let Admins map provider groups or app/client roles to workbench roles, globally or
  per domain, and assign a role to a person or group on one project. A local assignment can raise
  or lower a role within a project; it cannot grant access to a project outside the person's
  domains unless the assignment names that project explicitly.
- **FR-106**: **Policies** MUST list the shipped baseline rules (read-only) and the Admin rules
  (create, edit, enable, disable, delete). Common rules MUST be editable through a structured form
  with these templates: domain or project membership, classification level for editing, metric
  ownership and steward, Git action limits by role or branch, branch protection, agent client
  scope, time or network conditions. An advanced editor MUST accept raw policy text with
  inline validation against the policy schema.
- **FR-107**: Admin rules MUST NOT weaken the baseline: baseline prohibitions (no self-approval,
  default deny for projects without a domain, bearer tokens only on agent routes, no access for
  deactivated people) always prevail over Admin rules.
- **FR-108**: Before activation every policy change MUST pass schema validation and a dry run over
  the authorization test matrix and the most recent 1,000 audited decisions; the dry run MUST list
  the decisions that would change, and the Admin confirms or cancels. A change that fails
  validation MUST NOT be activated.
- **FR-109**: Every change to policies, role mappings, assignments, project access, deactivations
  and settings MUST be versioned with author, time and message; Admins MUST be able to view any
  version, diff two versions and roll back, which creates a new version equal to the chosen one.
  Activated changes MUST take effect on the next request and close affected live-update streams.
- **FR-110**: The workbench MUST refuse any change that would leave no active principal with the
  Admin role, counting only people who signed in within the session lifetime plus the bootstrap
  Admins. Bootstrap Admins, listed by email or stable id in the environment, MUST always hold Admin
  regardless of provider roles or local changes; their use MUST be audited, and the README MUST
  document this break-glass recovery.
- **FR-111**: **Access check** MUST answer, for any principal (including one not yet signed in,
  described by groups and roles), action and resource, the decision, the deciding rules and the
  attributes used; and, for a project or file, list the people, groups and agent clients that can
  read, edit, approve and publish it.
- **FR-112**: **Projects** MUST let Admins set each project's domain, access list (extra groups or
  people, everyone-readable flag), named Stewards, restricted path patterns with their groups,
  protected branches and the protected classification level; and grant agent clients projects.
- **FR-113**: **Settings** MUST show the provider connection (issuer, client id, discovery status,
  group claim mode and overage handling, last key refresh), session settings (inactivity and
  absolute lifetime, editable), the remote-credential policy (allowed hosts, Azure DevOps
  on-behalf-of on/off, GitHub app configured) and the active sessions with **End session**.
  Secrets MUST never be shown.

#### Storage of access configuration

- **FR-114**: Policies, role mappings, assignments, project access, deactivations and editable
  settings MUST be stored as text files in an administration Git repository under the data root,
  outside `data/projects/`, never listed as a project and never pushed anywhere. Each Admin change
  MUST be one commit authored by the Admin, written through the same atomic, hash-checked save as
  project files (OP-5); the server MUST load the active configuration from that repository's latest
  commit at start-up and after each change.

#### Deployment

- **FR-120**: The release MUST ship a container image definition that runs server mode, with the
  data root on a mounted volume, a health endpoint for liveness and readiness, and configuration
  only through environment variables and secret references.
- **FR-121**: The README MUST document Azure Container Apps (primary) and App Service (alternative)
  deployment, Entra and Keycloak setup, both modes, the role matrix, what each role can see, the
  outbound network calls of server mode, and the single-replica constraint with the path to scale.
- **FR-122**: The server MUST refuse to serve when it detects another live instance on the same
  data root.

### Key Entities

- **Principal**: who acts. Person (stable id, display name, email/username, roles, groups) or
  client application (client id, roles). Local mode has one synthetic principal.
- **Session**: server-held sign-in state for a person (opaque id, principal, encrypted tokens,
  created, last seen, expiry, connected remote accounts).
- **Domain**: a named area of responsibility (for example Sales) mapped to one or more provider
  groups.
- **Access configuration**: project-to-domain assignments, restricted path patterns with their
  groups, protected branches, protected classification level, agent client grants, allowed
  remote hosts.
- **Working copy**: a person's Git worktree of a repository, with its personal branch.
- **Published state**: the base checkout of a repository at the tip of its default branch.
- **Audit entry**: one security-relevant decision or action.
- **Policy set**: the shipped baseline rules (read-only) plus the Admin rules, with the schema
  they are validated against, evaluated by the decision boundary.
- **Role mapping**: a provider group, app role or client role mapped to a workbench role, globally
  or for a domain.
- **Local assignment**: a role given to a person or group on one project by an Admin.
- **Deactivation**: a local refusal of a principal, independent of the provider.
- **Administration repository**: the Git repository under the data root holding every Admin-edited
  configuration file; each commit is one configuration version.
- **Bootstrap Admin**: a person named in the environment who always holds Admin (break-glass).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The authorization test matrix covers 100% of routes (every implemented and planned
  route listed in Appendix A, as present after the rebase on 002) × the five test users × the
  readable/unreadable/guarded cases, and every answer matches the expected decision.
- **SC-002**: Across the whole matrix, zero bytes of an unreadable file, zero unreadable paths and
  zero names of unreadable projects appear in any response body, live-update frame or export.
- **SC-003**: Every new decision rule has at least one targeted mutant and the mutation suite
  detects 100% of them.
- **SC-004**: In local mode every v0.3.0 suite passes without modification.
- **SC-005**: Sign-in against the Keycloak test container, from first request to workspace shown,
  completes in under 5 seconds in the automated browser check.
- **SC-006**: With 5,000 files in 20 projects, filtering adds at most 150 ms to the project
  listing and at most 10% to the full workspace load compared with local mode.
- **SC-007**: Two Editors working concurrently on one repository for the whole two-person browser
  check never see the other's uncommitted change, branch or draft.
- **SC-008**: 100% of the security-relevant actions performed in the matrix produce exactly one
  audit entry with all required fields; no audit entry contains a token or document content.
- **SC-009**: The container image starts, passes health checks and accepts a sign-in within 30
  seconds on a workspace of the shipped examples, and keeps sessions and data across a restart.
- **SC-010**: The README's Entra and Keycloak guides let a person who has not seen the project
  reach a signed-in workspace (recorded once for Entra manually, automated for Keycloak).
- **SC-011**: An Admin can assign a project to a domain, map a group to a role and confirm the
  result in the access check within 3 minutes, using only the Admin panel.
- **SC-012**: 100% of attempts in the test suite to remove the last Admin, activate an invalid
  policy or weaken a baseline prohibition are refused, and a rollback restores the previous
  decisions for 100% of the matrix cases.

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
- The Microsoft directory (Graph) is used only for group overage resolution and only for the
  configured groups.
- No hosted LLM is introduced; no query is executed; source bytes are never rewritten by any
  access rule (redaction is never applied to documents).
- Tests use a Keycloak container with a realm file in the repository; Entra is verified manually
  with the documented steps.
- People's display names and emails from the provider may be shown to other people who share a
  project (commit authors, "in use by"), as in any Git hosting service.

## Dependencies

- Feature 002 merged to `main`, then this branch rebased; the route list of Appendix A updated if
  002 changes.
- Constitution 3.0.0 (approved): two modes in Principle I, per-person state in IV, authorization
  mutants and test matrix in VI, README for both modes in VII.
- An OpenID Connect provider (Entra ID tenant with permission to create an app registration and
  app roles, or Keycloak 26 or later).
- For remote credentials: an Azure DevOps organisation connected to the same Entra tenant, or a
  GitHub OAuth app / GitHub App registered by the Admin.
- Container runtime for the Keycloak tests (Docker or Podman) on the CI runner.

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

V = Viewer, E = Editor, S = Steward, A = Admin. ✓ allowed in every project; (d) allowed in
projects of the person's domains (and readable files only); — refused.

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
