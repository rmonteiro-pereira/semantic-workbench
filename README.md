# Semantic Workbench

Standalone React + TypeScript + Vite+ application with a local Bun API that stores each project as a Git-backed folder. Explore and edit data contracts, semantic models, ontology definitions and RDF graphs.

## Run

Requires Bun 1.4+ and, for version control of projects, Git 2.40+. A Git identity (`user.name`, `user.email`) can come from your global Git configuration or be set from the app with **Set Git identity…**:

```sh
bun install
bun run dev
```

Open http://127.0.0.1:5173. API: http://127.0.0.1:4310. Both bind to loopback. The API answers only requests addressed to a loopback name (so a web page cannot reach it through DNS rebinding), refuses writes from other origins, and never follows a symbolic link inside a project folder. Without Git, or without a Git identity, the workspace still opens and edits files; a banner explains what is missing. A missing identity is checked per repository and live: the banner and the Commit dialog offer **Set Git identity…**, which writes `user.name` and `user.email` into that repository's own configuration (and, if you choose, into every repository that has none yet), never your global one, and commits work at once. Without Git, projects are not committed until it is installed and the API is restarted.

## Run it as a container

Build with `podman build --format docker -t semantic-workbench:dev .` (or use `docker` in place of `podman`).
The image runs Bun as uid 1000 and includes Git, the API and the built frontend.
Server mode requires the identity and session configuration described below.

For Compose, set `SW_VERSION` and `SW_COMMIT` in the environment before building. Use the
package version when present (`bun -p 'require("./package.json").version ?? "dev"'`) and
`git rev-parse HEAD` for the commit. This checkout currently has no package version, so `dev`
is the fallback. The `image:build` command supplies these values automatically.

```sh
mkdir -p .data
# The bind-mounted folder must be writable by the image's uid 1000.
podman compose --profile local up --build
```

Docker users can run `docker compose --profile local up --build`. With rootless Podman,
run directly with the user mapping below, or prepare the Compose folder ownership with
`podman unshare chown -R 1000:1000 .data` before starting Compose. Do not share that folder
between different user mappings. On SELinux hosts, label the bind mount for containers
(for example, append `:z` to the volume).

```sh
podman run --rm --network host --userns keep-id:uid=1000,gid=1000 \
  -v "$PWD/.data:/data" semantic-workbench:dev
```

For Docker, omit `--userns keep-id:uid=1000,gid=1000` and ensure `.data` is owned by uid 1000.
Local mode requires **host networking** because it binds loopback. On Docker Desktop enable
**Settings → Resources → Network → Enable host networking**, then apply and restart.
Open http://127.0.0.1:4310. `/healthz` reports liveness, version and commit; `/readyz` reports
readiness after recovery and the first scan. Startup probes the data root and reports its path
and uid if it is not writable.

Only one instance may serve a data folder. A second instance of the same revision returns 503
and remains not ready. A different revision reports ready with `state: handover`, returning
503 with `Retry-After: 10` for application requests without opening the workspace. It acquires
the lock after the previous instance exits or its heartbeat is older than 30 seconds, then
recovers and scans before serving. SIGTERM and SIGINT close the workspace and release its lock.
Run exactly one replica: dry-run receipts and the administration save lock live in the server
process, so a second replica would refuse or race Admin changes. Do not use multiple replicas
for throughput.

Container settings are read once at startup:

- `SW_HOST` and `SW_PORT`: loopback address and port (defaults `127.0.0.1:4310`).
- `DATA_DIR`: persistent root (`/data` in the image).
- `SW_CACHE_DIR`: rebuildable SQLite cache folder (`/tmp/sw-cache` in the image).
- `SW_SERVE_STATIC=1`: serve `dist/` from the API; enabled in the image.
- `SW_IN_CONTAINER=1`: print the host networking instructions; set by the image.
- `SW_VERSION` and `SW_COMMIT`: build arguments and health metadata.
- `CONTAINER_APP_REVISION`: lock revision; otherwise `SW_VERSION+SW_COMMIT`, or `dev`.

Run `bun run test:container --image semantic-workbench:dev` to check an existing image, or
`bun run test:container --build` to build first (the default). The script selects Docker when
installed, otherwise Podman. It uses a temporary bind mount and rootless Podman's
`keep-id:uid=1000,gid=1000` mapping so the caller owns the files while the image user stays 1000.
Docker checks require a uid 1000 caller. Runtime verification of this mapping happens in the
container check; it cannot be exercised in the restricted development sandbox.
Use `--port 4320` if 4310 is occupied (the next port must also be free), or
`--suite test:projects` to select one browser suite; the default runs both local and server
groups. Use `--suite local` or `--suite server` to select one group.
The script checks metadata, health, persistence across restart and same-revision refusal,
and always attempts to remove its containers and temporary folder.

## Server mode

Build the frontend with `bun run build`, then start `bun server/index.ts` with the following
environment. Register `<SW_PUBLIC_URL>/auth/callback` as a redirect URI and
`<SW_PUBLIC_URL>/auth/signed-out` as a post-logout redirect URI at the provider.

```sh
export SW_MODE=server
export SW_HOST=0.0.0.0
export SW_PUBLIC_URL=https://workbench.example.org
export SW_OIDC_ISSUER=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0
export SW_OIDC_PROVIDER=entra
export SW_ENTRA_TENANT_ID=YOUR-TENANT-ID
export SW_OIDC_CLIENT_ID=YOUR-CLIENT-ID
export SW_OIDC_CLIENT_SECRET=YOUR-SECRET
export SW_SESSION_KEY="$(openssl rand -base64 32)"
export SW_BOOTSTRAP_ADMINS=admin@example.org
export DATA_DIR=/path/to/workbench
bun server/index.ts
```

Keep the same session key across restarts; supply production secrets through the deployment's
secret store. Startup requires successful issuer discovery and valid access policies. After
acquiring the single-instance lease, it initializes the administration repository if needed.
Server mode always serves `dist/` and applies CSP and security headers, including HSTS for HTTPS.

There is no workbench sign-in screen. Page requests redirect straight to the provider and return
to the requested path after sign-in. Anonymous API calls return 401. People without a grant,
including deactivated people, see **No access** and receive 403 from every workspace API,
including `GET /api/me`. That page shows their name and verified address or username, explains
that an Admin must grant access, and provides a sign-out form that needs no JavaScript.
**Signed out** stays signed out until **Sign in again** is selected. A sign-in error names a safe
failure reason and offers **Try again**. Frontend assets require the same access as the workspace;
health probes and the minimal authentication pages remain public.

Sessions use opaque 256-bit cookies with `Secure; HttpOnly; SameSite=Lax; Path=/`, named
`__Host-sw-session`. Tokens remain on the server, encrypted with AES-256-GCM in
`state/sessions/<sha256(id)>.json`. Sessions survive restarts and expire after eight hours idle
or 24 hours absolute by default; `admin/settings.json` configures `session.idleHours` and
`session.absoluteHours`. The persisted `lastSeenAt` is written at most once a minute, so a restart
can shorten the remaining idle time by up to 60 seconds. Missing lifetime fields use those defaults; invalid values refuse startup.
HKDF-SHA256 derives separate session-encryption (`sw-session`) and attempt-signing (`sw-attempt`)
keys from `SW_SESSION_KEY`. Changing `SW_SESSION_KEY` ends all sessions and in-flight sign-ins.
Refresh re-reads identity and groups and re-matches grants; failed
refresh ends the session. Sign-out, expiry and administrative session termination close live
updates with an `access` event. Sign-in attempts use a signed ten-minute `__Host-sw-auth` cookie;
a persistent replay ledger prevents reusing a consumed attempt after a restart.

Server-mode hashed assets use `private, max-age=31536000, immutable`; HTML and API responses
use `no-store`, so shared caches never retain auth-gated files. Local-mode caching is unchanged.

For development only, a loopback HTTP public URL uses `sw-session` and `sw-auth` without Secure.
An HTTP issuer is allowed only when both issuer and public URL are loopback. A non-loopback
HTTP public URL is always refused. State-changing requests require `X-SW-Request: 1` and an
Origin equal to the public origin; the No access sign-out form uses a per-session CSRF token
instead of the header.

Identity settings used by server sign-in:

| Variable | Meaning |
| --- | --- |
| `SW_MODE` | `local` (default) or `server`. |
| `SW_PUBLIC_URL` | Required external origin. |
| `SW_OIDC_ISSUER`, `SW_OIDC_CLIENT_ID` | Required issuer and confidential client registration. |
| `SW_OIDC_CLIENT_SECRET` | Client secret; use this or an assertion, never both. |
| `SW_OIDC_CLIENT_ASSERTION` | PKCS#8 RSA private-key file, or `managed-identity`. The latter uses platform `IDENTITY_ENDPOINT` and `IDENTITY_HEADER` for an `api://AzureADTokenExchange` assertion. |
| `SW_OIDC_PROVIDER` | `entra`, `keycloak`, or `generic` (default), selecting the claim mapping. |
| `SW_ENTRA_TENANT_ID` | Required for Entra; only this tenant is accepted. |
| `SW_OIDC_SCOPES` | Defaults to `openid profile email offline_access`, plus `api://<client-id>/access_as_user` for Entra. |
| `SW_GROUP_CLAIM` | Group claim name, default `groups`. |
| `SW_GROUP_OVERAGE` | `directory` (default) or `off`. |
| `SW_GRAPH_URL` | Defaults to `https://graph.microsoft.com`; also accepts Microsoft national-cloud Graph endpoints, or loopback HTTP with a loopback public URL. |
| `SW_SESSION_KEY` | Required 32 random bytes encoded as base64. |
| `SW_BOOTSTRAP_ADMINS` | Required comma-separated verified e-mail addresses or stable IDs (`tid:oid` for Entra); grants emergency Admin access. |

`SW_HOST`, `SW_PORT`, `DATA_DIR`, `SW_CACHE_DIR`, `SW_SERVE_STATIC`, `SW_IN_CONTAINER`,
`SW_VERSION`, `SW_COMMIT` and `CONTAINER_APP_REVISION` retain the meanings documented above.
`SW_SERVE_STATIC` is always enabled in server mode. The remaining variables in the
[configuration contract](specs/003-authn-authz/contracts/configuration.md) configure later agent
and delegated-credential features; they do not grant browser access.

Entra group overage uses application permission `GroupMember.Read.All` with administrator consent.
Only group IDs named in grants and restricted paths are checked, in batches of at most 20.
A failed directory lookup supplies no membership, an explanatory message and an audit record.
Provider app roles never grant a person access. E-mail grants trust the tenant's administration
of addresses: Entra uses domain-verified e-mail or a member UPN, never a guest `#EXT#` UPN;
Keycloak and generic providers require `email_verified=true`. E-mail matching ignores case.
For Keycloak, set its realm issuer, `SW_OIDC_PROVIDER=keycloak`, a confidential client secret,
and matching group-name grants; tenant ID is not required.

### What readers see in server mode

Project lists, search, graphs, metrics, document exports and agent context use only readable
files. A hidden project has no name or count in the workspace. A readable project with restricted
paths shows “N files you cannot open”; links already written in visible files remain unresolved
when their target is hidden. Direct requests for unreadable files and their Git history return
404. Git history counts commits that touch only hidden paths without exposing their messages;
messages on visible commits can still mention confidential names, so avoid putting secrets in
commit messages.

Drafts, grouping state and dismissed suggestions belong to the signed-in person. Trash entries
require readable original paths and permission to restore your own or another person’s entries.
Live events and reconnect replay are filtered for each reader. In server mode an administration
change reloads only the open tabs of the people it affects; in local mode an access change reloads
every open tab. Non-Admins receive only readiness, mode and Git availability from
`/api/status`. Local mode retains its existing shared workspace behavior.

### Roles in server mode

Permissions come from workspace grants, scoped to domains or named projects. Provider app roles
are not used. Custom roles use the same server-reported capabilities as built-in roles.

| Role | What it can do within its scope |
| --- | --- |
| Viewer | Read definitions, history and its own view settings; cannot save files or drafts |
| Editor | Viewer actions plus edit, import, move, delete files, save drafts and use project Git |
| Steward | Editor actions plus guarded changes, approval, publishing, project creation and renaming |
| Admin | All projects, administration, purge, clear, remotes, clone and registration |

A move requires permission at both ends. Hidden targets return 404; a readable target without
write permission returns 403. Disabled Commit and classification controls explain the required
role. The server checks crafted requests independently of the UI. Identity and credential-helper
configuration are unavailable in server mode.

New projects, imports and examples created by a Steward receive an allowed domain automatically
when there is only one. With several domains, a dialog asks which one to use. Admins may choose a
domain or leave the project unassigned. Local mode retains its existing unrestricted workflow.

## Local build scripts

Run `bun run ci:validate` for the complete quality gate. It runs these steps in order:

1. `verify`: `check`, `bun test`, production `build`.
2. `mutation`: `test:mutation`, with a temporary Vite server for its browser mutants.
3. `browser`: every suite in `scripts/gate-suites.ts`. Workspace suites use a fresh Vite server
   on a free loopback port via `SW_BASE_URL`. `test:auth` builds and serves `dist/` through its
   own server-mode API and starts its mock provider; it needs no Vite. All use temporary data.
4. `image`: `image:build`, `image:scan`, `image:sbom`.
5. `container`: `test:container` against the built image.
6. `pipeline`: `pipeline:lint` and dry runs for PR, main and `v0.4.0-alpha.1`.

Use repeatable `--step` to select steps, `--suite` to select a browser script, and `--keep-going`
to continue after a failed step. For example:

```sh
bun run ci:validate -- --step verify --step pipeline
bun run ci:validate -- --step browser --suite test:projects
```

Results are JUnit XML per executed step and `summary.json` in `out/ci/`. Failures name their steps
and return non-zero. Each suite receives its own `SW_SCREENSHOT_DIR`; only PNGs from that
folder are copied to `out/ci/screenshots/<suite>/`. The `scripts/helpers/screenshots.ts`
path helper honors this variable and retains a check's default path when it is unset.
Checks with hard-coded `/tmp` paths retain those defaults and are not collected by the gate.
Copy failures are reported separately from suite failures. Cancellation stops Vite's process group.
The full gate needs Chromium and Docker or Podman; a missing runtime fails the image/container
steps. The gate does not include the owner's separate `test:auth:keycloak` compatibility check.
The sign-in suite is included; admin and two-editor suites join when implemented.

- `bun run image:build`: chooses Docker, then Podman, or accepts `--engine docker|podman`.
  Podman builds use `--format docker` to retain HEALTHCHECK. Tags are `semantic-workbench:dev`
  and `semantic-workbench:sha-<commit>`; repeatable `--tag` adds tags. Metadata comes from Git,
  UTC creation time and the package version (`dev` until a version is declared). Dirty working
  trees receive a `-dirty` revision suffix.
- `bun run image:scan`: local Trivy, or the pinned scanner image, scans an exported image archive.
  High/critical findings with a fix fail. `.trivyignore` exceptions require a reason and an
  unexpired UTC date. Reports are `out/image/trivy.json` and `trivy.sarif`.
- `bun run image:sbom`: writes `out/image/sbom.spdx.json`.
- `bun run image:push -- --registry <name>.azurecr.io`: refuses dirty revisions, signs in with
  `az acr login`, pushes the commit tag and prints its digest. Under `TF_BUILD` it also emits the
  Azure output variable `digest`. `image:scan -- --ref <registry>/semantic-workbench@sha256:<digest>`
  signs in itself before rescanning. Registry credentials use a temporary folder removed after
  the command; Azure CLI uses the chosen Docker/Podman runtime via `DOCKER_COMMAND`. Both Azure actions require the non-secret target variables
  listed in `deploy/azure-devops/sample-variables.yml` and an authenticated Azure CLI session.

`bun run pipeline:lint` checks the vendored schema and repository delivery rules entirely offline.
`bun run pipeline:dry-run -- --run pr|main|tag:v0.4.0-alpha.1` expands the actual templates and
matrix using placeholder target values and prints each step with its condition. `--execute`
runs local gate steps and, for tag runs, fake deployment/recovery scenarios;
setup, publication and real Azure actions are printed only.
Use `--pipeline rollback --run tag:v0.4.0-alpha.1` to expand the rollback pipeline. The simulation
assumes preceding enabled jobs succeed; actual failures still stop the target pipeline.

The GitHub repository runs nothing: no workflows, bots, publishing or deployments. The pipeline
is a deliverable imported into the target's Azure DevOps from its Azure Repos mirror. This delivery
includes Validate, Image and tag-only Deploy, plus the manual `azure-pipelines-rollback.yml`.
See [target setup](deploy/README.md) and the [owner trial runbook](deploy/trial-runbook.md).
Pipeline setup downloads the pinned Bun 1.4.3 archive and verifies its SHA-256 before extraction.
The tag-only `deploy:check-version` guard reads `SOURCE_REF` from the step environment
(`refs/tags/vX.Y.Z`); local runs can override it with `--tag vX.Y.Z`. It validates the tag before
use and compares the tag core with the package
version, then queries registry tags read-only and refuses a version older than any promoted tag.
It needs the target variables of the pipeline's variable group (`ACR_NAME` and the others listed
in `specs/003-authn-authz/contracts/delivery-pipeline.md`) in its environment.
It accepts `--fake` for an empty offline registry, with the same target-variable validation.
A release must first declare its version in `package.json`; this checkout still uses the local
`dev` fallback and therefore refuses tag publication. The owner/reviewer must run the complete gate on a machine with the
required runtimes and record its duration in `specs/003-authn-authz/verification.md`.

## Deployment commands

`deploy:azure` runs the version guard, target preflight, records the active revision, updates the app by
scanned digest, smoke-tests it, then promotes the version tag. A failed update or smoke copies and tests the
recorded revision, then fails the run. `deploy:rollback -- --to previous|tag|<vX.Y.Z>` restores
without promoting, verifying the commit digest and rescanning before the recoverable update. Both accept `--fake` and `--help`; rollback requires a tag `SOURCE_REF`.
`IMAGE_DIGEST` and `BUILD_COMMIT` supply deployment inputs; `ROLLBACK_TARGET` selects rollback.
The package manifest supplies the version. Target variables are listed in the setup guide.

`deploy:smoke <public-url> <package-version> <commit> [--loopback]` uses `SW_OIDC_ISSUER` discovery,
prints one line per check and a JSON summary. Loopback relaxes only HSTS and cookie Secure. The
container gate invokes it against the server group's existing container and mock provider.
`image:scan -- --ref-env IMAGE_REF` accepts a digest reference through the environment; explicit
`--ref` remains supported. Pipeline macros are passed through step environments.

## Sign-in testing

Run `bun run test:auth`; it builds the frontend first. The check starts a mock OpenID
provider and the API on free loopback ports, seeds temporary fixture grants, and drives the
built frontend with Chromium. It checks every fixture person, role provenance, refresh, expiry,
Graph overage and failure, cookie-authenticated events and sign-out. Screenshots of the person
menu and the three authentication pages cover 390×844, 1280×720, 1440×900 and 2560×1440.
`SW_SCREENSHOT_DIR` selects the output folder; otherwise screenshots go to `/tmp`.
The gate and the pipeline include this suite without an external identity service.

`bun run test:auth:keycloak` is a separate compatibility check for the owner's machine. It
selects Docker or Podman, starts the digest-pinned Keycloak 26.4 realm on a free loopback port,
uses the same browser sign-in checks, checks agent client credentials, and removes the container
and temporary realm. Fixture passwords are `test-<username>`, for example `test-alice`.
It is excluded from the gate and pipeline.

`bun run test:container --image semantic-workbench:dev --suite server` runs the server group
alone. The default container check runs both groups. The server group starts the mock on host
loopback, generates development secrets per run and uses host networking. It measures sign-in
within 30 seconds, verifies session and data persistence after restart, refuses a second instance
of the same revision, and verifies a different revision waits before taking over within shutdown
plus 30 seconds. All suites remove their temporary workspaces.

For a manual Keycloak workspace, copy `.env.server.example` to `.env.server`, replace its
session key with `openssl rand -base64 32`, then run:

```sh
mkdir -p .server-workspace/admin
cp tests/fixtures/auth-workspace/admin/*.json .server-workspace/admin/
cp tests/fixtures/auth-workspace/admin-keycloak/grants.json .server-workspace/admin/grants.json
docker compose --profile keycloak up --build -d
```

This profile publishes Keycloak on `127.0.0.1:8080` and the workbench on
`http://127.0.0.1:4310` with host networking. The workbench retries startup while realm import
finishes. The persistent `.server-workspace` folder must be writable by uid 1000 (use the Podman
ownership instructions above when applicable). These credentials and the HTTP cookie exception
are development-only. The grants are seeded, and projects can be imported through the UI.
Use `docker compose --profile keycloak down` to stop it. This profile runs only on the owner's
machine; automated checks never use this folder.

## Where your data lives

Everything stays under the data root, `data/` by default. Set `DATA_DIR` to use another folder (the tests and browser checks always use temporary ones):

```text
data/
├── projects/<project>/   one folder per project: your files, byte for byte, in a Git working tree
├── state/                projects.json (project registry), views/ (grouping corrections per file),
│                         drafts/, journal/ (unfinished multi-file operations), suggestions.json
│                         (dismissed grouping suggestions), legacy-ids.json, audit/ (one
│                         append-only file per month of access decisions and writes)
├── admin/                access configuration (roles, grants, project access), a Git repository;
│                         created when access is first configured
├── trash/<entry>/        deleted files and projects (with their .git), each with an entry.json
├── backup/               the v0.1.0 database copied before migration
└── cache.sqlite          index of hashes, entities and findings; safe to delete
```

The files in `data/projects/` are the only copy of your definitions. `cache.sqlite` is rebuilt from them on the next start if it is deleted or out of date; the project registry, view settings and drafts live in the JSON files under `state/`, which are always replaced atomically. Back up `data/` with the app stopped, or push projects to a Git remote. The audit log records every write and every refused request, never document text or credentials; files older than 400 days are deleted at start-up.

**Saving and committing.** There is no Save button: a valid edit is written to its file automatically one second after you stop typing, sending only the changed range. The header's **Save state** indicator reads *Saved to file · N uncommitted changes*, *Saving…*, *Not saved: N errors* (nothing is written while the text has validation errors; it is kept as a draft that survives a reload) or *Not saved: file changed on disk*. Switching files or views writes a due save first. While a pull, sync or branch switch of the repository runs, saving waits and then re-checks the file's version. **Commit…** (the header's primary action) lists the project's changed files, all ticked, with the diff of the selected file and a suggested message (*Update orders in commerce.odcs.yaml*, *Update 3 files*); **Commit** commits only the ticked files (`git commit --only`, so other staged or unstaged work stays as it is) and **Commit & push** then pushes. **Revert to last commit** (with a confirmation) puts the last committed version of a file back and moves the replaced version to the trash, in one journaled operation. Item editors, add and delete dialogs and the metric wizard keep an explicit **Save to file**, which writes the file and never commits.

Every save sends the SHA-256 of the version it started from. If the file changed in the meantime (another tab, an external editor, a Git command), the save is refused and the two versions are shown in a side-by-side diff: keep editing (automatic saving of that file stays paused), load the current file, or explicitly save your version over it. Saves write a temporary file and rename it over the original, so a crash leaves either the old or the new bytes. Imports and project creation are staged and moved into place through a journal; an operation interrupted by a crash is completed or rolled back on the next start, and the outcome is shown.

The API watches every project folder. Files you change, add or delete outside the workbench (an editor, a terminal, a Git checkout) appear in every open tab within about two seconds without a reload; an open file follows the disk unless it has unsaved edits. A full rescan also runs every 60 seconds. Files that `.gitignore` excludes and file types the workbench does not read (for example `.csv` or `.md`) are not listed; files of a supported type that fail validation are listed as invalid and open in Source for repair. As in Git, a file that is already committed stays listed even if `.gitignore` matches it.

**Organizing and cleaning up.** Every project and file in the **Projects** tree has an actions menu: rename a project (its folder keeps its id), import more files into it, move a file to another project, or delete. Every file and project row also has a trash icon at its right edge (muted until the row is hovered or focused, always visible on touch screens) that starts the same confirmation. **Clear workspace** and **Trash** sit below the tree. Nothing needs a script or a reload:

- Deleting asks first. The confirmation names everything that is removed, warns about unsaved edits that would be lost, and lists Ossie `ontology_ref`/`semantic_model_ref` references that would no longer resolve to any remaining file.
- A deleted file or project moves to `data/trash/<entry>/`; a project moves with its `.git` folder, so its history is kept. Git history is never rewritten: a deleted file shows up in Git as an ordinary deletion.
- **Undo** is offered for 10 seconds after a delete or Clear and puts everything back exactly as it was, including drafts and grouping corrections.
- After that, **Trash** restores entries or deletes them permanently; emptying the trash asks for confirmation. A restore never overwrites: if a file or project now occupies the original place, the workbench offers a free name instead. A file whose project no longer exists is restored into a new project with the old name.
- **Clear workspace** moves every project to the trash as its own entry, in one operation.
- Importing into an existing project a file whose name already exists asks whether to replace it or keep both (`name (2).ext`).

**Grouping suggestions.** When a file has explicit evidence that it belongs with another project, a one-line count below the tree ("1 grouping suggestion") opens the **Grouping suggestions** dialog, which proposes adding it there and lists the evidence. Three kinds count: an Ossie `ontology_ref` or `semantic_model_ref` naming an ontology or semantic model declared in that project, an IRI shared with a file there, or an ODCS physical name equal to a semantic dataset `source` there. Names that are merely similar never count. A file is offered only when nothing links it to the other files of its own project, and only from the smaller project to the larger one (a file imported on its own joins the project it references, not the reverse). **Add to project** moves it; **Dismiss** is remembered for that file's content and target in `state/suggestions.json`. Nothing is regrouped automatically.

**Upgrading from v0.1.0.** On the first start with a `data/workbench.sqlite` from v0.1.0, the API copies that database (with its `-wal` and `-shm` files) to `data/backup/`, reads the copy, and writes every stored document's exact bytes into project folders: documents of a shipped example set go to that example's project, everything else to **Ungrouped**; duplicate filenames become `name (2).ext`. Each written file is read back and its SHA-256 compared with the stored bytes; any mismatch stops the migration before anything is moved into place, and it is retried on the next start. Each project then gets `git init` and one commit, "Import from Semantic Workbench v0.1.0". Old document ids keep resolving through `state/legacy-ids.json`, and saved grouping corrections move to `state/views/`. The original database is never opened or modified. The migration needs Git and a Git identity; without them it waits, leaves everything untouched and says so.

The workbench only opens folders under `data/projects/`. Git runs locally with terminal prompts disabled; the only network use is an explicit clone, fetch, pull, push or sync (below).

**Source Control.** **Source control** in the sidebar opens a VS Code-like panel for one project (the open file's, or any other from its project picker):

- **Changes**, **Staged changes** and **Merge conflicts**, with each file's state; clicking a file shows its diff side by side with changed lines marked (staged: last commit → staged; changes: staged → working tree). Files of types the workbench does not read are listed too, labelled *not shown in workspace*: they can be diffed, staged and committed, not edited. Files matched by `.gitignore` are not listed.
- **Stage** / **Unstage** per file or all, a commit message (required) and **Commit**. Files the workbench saved are committed byte for byte (managed repositories set `core.autocrlf=false`). Git hooks and filters run as configured; when one changes a file's bytes during a commit, pull or switch, the panel lists the files whose bytes on disk differ from what was saved or committed.
- **Branch** lists local and remote branches; switching or **New branch** rescans the project, so every view shows that branch's content.
- **Remote…** (in the panel or a project's ⋯ menu) opens the **Remote** dialog: a name (default `origin`) and a URL, SSH address or folder path; it changes or removes the remote too. Addresses that run a helper program (`transport::address`) or look like an option are refused. Then **Fetch**, **Pull**, **Push** or **Sync** (pull, then push), with commits to push and to pull shown next to the branch. Pull merges (`--no-rebase`); a conflict stops it, lists the conflicted files (also marked invalid in the tree), and the merge is committed after you repair each file in Source and stage it.
- Pull, Sync and switching branches are refused while the project has edits not saved to file (kept as drafts) or uncommitted changes, and the refusal offers **Commit…**; nothing is stashed automatically. Untracked files do not block: Git itself refuses to overwrite them.
- **Add to .gitignore** on a changed file adds the exact path, its extension (`*.csv`) or its folder; if the file is already committed, the panel says Git keeps tracking it. **Edit .gitignore** in a project's menu opens the file as plain text in Source; saving it updates the workspace and the panel at once.
- **History** in a file's menu lists its commits; pick any two versions (or the working tree) to compare.

**Clone.** **Import… → Clone a Git repository…** opens **Clone repository**: a URL or path and an optional project name (a taken name gets a free one, such as `team (2)`). The clone runs only from this action, shows its progress with **Cancel**, and gives up after 10 minutes. It lands in a staging folder under `data/projects/` and moves into place with the project registry in one journaled step, so a failed, cancelled or interrupted clone leaves nothing behind (an interrupted one is rolled back on the next start). Line-ending conversion is off (`core.autocrlf=false`), symbolic links arrive as plain files (`core.symlinks=false`), submodules are not fetched and `ext::` transports are refused. Files are checked as on any scan: invalid ones are listed in the dialog and marked in the tree, never rewritten.

**Several projects in one repository.** A team repository can hold several projects in subfolders, such as `domains/sales` and `domains/finance`. A `.semantic-workbench.json` file at the repository root declares them:

```json
{
  "schema": "semantic-workbench/repository/v1",
  "projects": [{ "path": "domains/sales", "name": "Sales" }, { "path": "domains/finance" }]
}
```

After a clone, the declared folders become projects at once. Without the file, the clone dialog offers **Choose projects…**, which proposes the folders that hold definitions (down to four levels) and can save the choice as `.semantic-workbench.json` for the team. **Projects in this repository…** in a project's ⋯ menu changes the choice later; leaving a folder out removes its project from the workspace and deletes nothing. The tree groups these projects under their repository. They share one Source Control panel, branch and history: the panel lists the whole repository's changes and names the project of each file, and a commit, pull or branch switch rescans every project of the repository. Deleting such a project offers **Remove from workspace** (the default; nothing on disk changes) or **Delete folder** (the folder moves to the trash, and the repository shows its files as deleted until you commit). When the project is the last one of its repository, only **Delete** is offered and the whole repository moves to the trash, so no repository stays on disk without a project. **Clear workspace** moves the whole repository to the trash as one entry. If the file cannot be applied (for example, it names a folder that does not exist), the clone dialog says why and the repository stays one project. Each entry requires a repository-relative `path` and accepts an optional display `name`. Unknown keys, duplicate paths and folders nested inside another declared project are refused. Paths must stay inside the repository; absolute paths, `.` or `..` segments and `.git` are refused.

*Credentials and network.* The workbench never stores, asks for or sends credentials; it uses your Git configuration. Remote actions run only when you press them, never in the background. If Git needs credentials, your configured credential helper (for example Git Credential Manager) may open its own window; meanwhile the panel shows "Waiting for Git (credentials may be requested in a separate window)" with **Cancel**, and gives up after 10 minutes. Without a helper or SSH key, the action fails with Git's own message; when that message says the remote refused or asked for credentials, the panel offers the **Credential setup guide**: static instructions for a credential helper and an SSH key on Windows, macOS and Linux, with copyable commands and the name of the helper set in your Git settings (read with `git config --get credential.helper`; credentials themselves are never read).

## Supported inputs

| Input | Serialization | Editing and validation |
| --- | --- | --- |
| ODCS | YAML / JSON | Contract overview and dataset pages (schema, lineage, history, quality), in-place property edits, item editor for objects, properties and foreign keys, and full source; pinned official v3.1.0 schema validation; property- and schema-level foreign keys shown as relationships |
| Ossie semantic model | YAML / JSON | Current flat model and legacy model arrays; official 0.2.0.dev0 schema validation for versioned flat models |
| Ossie ontology | YAML / JSON | Concepts, roles, inheritance, built-in concepts; pinned 0.2.0.dev0 schema or unversioned compatibility checks |
| Ossie mappings | YAML / JSON | Standalone and embedded object/referent/link mappings; pinned schemas, cross-document runtime resolution and query planning |
| RDF | Turtle, N-Triples, N3, RDF/XML | Native RDF parser; per-resource item editor, add and delete, and full source editing; original serialization export |
| OWL | Turtle or RDF/XML (.owl, .rdf, .ttl, .xml) | Classes, object/datatype properties, restrictions, annotations; native definition inspector |
| SHACL | Turtle or RDF/XML (.shacl, .ttl, .rdf, .xml) | Node shapes, property constraints, targets, paths, typed literals and blank nodes |

File extensions help choose parsers; `.owl` is not treated as a serialization by itself. RDF/XML requires valid RDF/XML, not OWL/XML. JSON-LD, TriG, N-Quads, OWL Functional Syntax and Manchester syntax are not yet supported. Imported RDF is parsed locally without fetching `owl:imports` or remote documents. SHACL shapes are inspectable definitions; this application does not execute SHACL validation or OWL reasoning.

**Import…** in the sidebar opens the Import dialog: choose **A new project** or **An existing project**, then the files. One selection for a new project becomes one project, named after the ontology or semantic model it contains. Every import (a new project, files imported into an existing project, an example loaded) is committed with exactly the imported files, as *Import N files* (one file: *Import <name>*); other uncommitted changes are left alone. When Git or a Git identity is missing, or the repository is in the middle of a merge, the files are still written and the reason is shown. The sidebar's **Projects** tree lists each project's files with their document type and whether they are valid. The source editor always preserves the imported text until you edit it. RDF resources are edited with the RDF item editor (below) or in Source. YAML form changes retain comments and unknown fields; JSON form changes retain JSON syntax. Versioned contract/semantic documents receive their available official schema checks; other formats receive syntax and selected structural checks, not blanket conformance certification.

## Commerce example workspace

Click **Load commerce workspace** in the sidebar. It creates the project "Commerce workspace" with seven related documents (clicking again opens the existing project):

- `commerce.odcs.yaml`: a contract for customers, orders, order lines and products, with types, primary and foreign keys, ownership and business-definition IRIs.
- `sales.ossie.yaml`: four datasets, three joins and three sales metrics; physical sources match the contract exactly.
- `commerce-business.ossie.yaml`: eight business concepts sharing IRIs with the OWL ontology.
- `commerce.owl.ttl` and `commerce.owl`: OWL in Turtle and RDF/XML, including inverse properties and an existential restriction.
- `commerce.shacl.ttl`: required customer email, nonnegative order amount and required order lines.
- `commerce-data.ttl`: an eight-resource order-to-cash lifecycle.

The example is fictional and illustrative. **Shared references** in an entity's inspector links other documents containing its exact physical source or IRI; Ossie QName IRIs are expanded with the document `prefixes`, so `core:Party` matches `https://…/core#Party` in OWL, SHACL, RDF or ODCS business definitions. This is explicit reference matching, not inferred equivalence or a cross-document query engine.

**Load commerce scale data** adds `commerce-scale.ttl`: exactly 1,000 synthetic business resources and 5,000 explicit business links, plus type and label triples. These are customers, orders, order lines, products, shipments, invoices, payments and warehouses, not thousands of invented ontology classes. This is a navigation benchmark, not a business-rule validated dataset. Regenerate examples with `bun scripts/commerce-example.ts`.

Example files are under `public/examples/commerce/` and downloadable at `/examples/commerce/<filename>`. Earlier benchmark files and documents are retained; they are not used by the current workspace examples.

## Graph exploration

**Neighborhood** shows one center and what it is connected to. The center sits in the middle column, marked *Center*; entities that point at it are on the left (purple links), entities it points at are on the right (green links). Up to 12 neighbors are shown, ranked by relationship kind and then name; the toolbar states how many are shown and hidden, **N more neighbors** reveals the next page, and **Relationship** narrows the neighbors to one relationship. **Links between neighbors** shows or hides relationships among the visible neighbors (shown by default unless there are more than ten). No two edges share a line: each link bends at its own position, long and backward links travel on their own lane above or below, and visible labels are placed apart.

Walk the model by activating a neighbor (**Walk here**, click, or keyboard): it becomes the center and the previous center stays visible, marked *Previous center*. The **Walk** trail lists every center with the relationship it was reached through; **Back** and **Forward** move along it, and any crumb jumps back. When the center is defined in another file of the project as well (a shared IRI, physical name or business definition, or an Ossie concept mapping of the same concept), **Continue in <file>** carries the walk into that file; Back returns. Concepts with metrics carry a metric badge, and **Open N metrics for <concept>** opens the Metrics list filtered to that concept.

**Pierce through.** **+** on a node (or activating a relationship line) expands it in place: its neighbors join the same canvas beside it, nothing already placed moves, and the trail records "expanded X"; **−** collapses what that expansion alone added (a node another expansion also reached stays). **Undo expansion**, **Back** and **Forward** restore the exact earlier canvas; walking to a new center starts a fresh one. **Full pierce** expands everything reachable from the selected node or the center in the chosen direction (**Out**, **In**, **Both**), each entity once, following the **Value types**, **Technical resources** and **Metrics** switches (Value types shares the Graph view's setting). It stops at 150 entities: frontier nodes show "+N hidden", a banner reads "N entities shown in K steps · M more reachable" with **Expand further** (up to 500) and **Stop**. The closure is computed in a worker and large additions appear over several frames, so the page stays responsive. The lineage and mapping canvases use the same budgets, counted in cards, and offer Expand, Collapse, Full pierce (from a column or a card, upstream, downstream or both) and Undo expansion.

Choose a center with **Find a center**, a searchable picker that ranks exact names first (also for the 1,000-entity scale model); toolbar search lists matches and the chosen one stays the center after the search is cleared. OWL models show classes only, with or without a center; **Technical resources** adds property resources, restrictions and other RDF resources on request. **Re-center** puts dragged nodes back in their columns. **Graph** opens the complete interactive model; **Overview** retains the business-area map and relationship matrix. **Full screen** (the toolbar button or the **F** key) lets Graph or Neighborhood fill the screen; the details panel then opens over the graph. **Escape** or **Exit full screen** brings back the earlier layout, zoom and selection. If the browser refuses full screen, the view fills the browser window instead. The catalog exposes all definitions. RDF literals remain in entity definitions rather than becoming nodes. Blank nodes retain their identity within each parsed document.

Click nodes or relationships to inspect their source definitions. Relationship inspection includes endpoints, roles, multiplicity, verbalizations, join keys or RDF predicates. Ontology n-ary relationships expand into navigation edges referring to the same original definition. Metric edges show explicit dataset references in expressions, not observed execution lineage.

## Verification

```sh
bun test
bun --bun run check
bun --bun run build
```

Browser checks require a running dev server and Playwright Chromium:

```sh
bun node_modules/@playwright/test/cli.js install chromium
bun scripts/commerce-browser-check.ts
bun scripts/relationship-browser-check.ts
bun scripts/browser-check.ts
```

Checks cover all commerce input formats, exact scale counts, native RDF identity and typed constraints, RDF/XML/Turtle OWL IRI equivalence, malformed inputs, official schemas, transactional saves, graph cycles, 5,000 entities / 15,000 links, relationship selection/editing, multi-format uploads and browser errors. Browser checks run the API on a temporary data root and send the page's `/api` requests there, so they never touch your workspace. `commerce-browser-check.ts`, `relationship-browser-check.ts` and `browser-check.ts` predate the current layout and also fail on v0.1.0 (stale selectors); they are kept for reference until they are updated. Screenshots go to `/tmp/`.

Browser checks open the frontend at `SW_BASE_URL` (default `http://127.0.0.1:5173`; the older name
`UI_URL` is still accepted). To use another Vite instance, start it with
`bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5180` and run the checks with `SW_BASE_URL=http://127.0.0.1:5180`. The
API is always the isolated one, whatever the frontend address.

## Established complex business model: OASIS UBL 2.3

**Load UBL business model** opens a schema-derived procurement-to-payment workspace with **45 business entities and 277 named aggregate relationships**. It covers Order, Invoice, DespatchAdvice, ReceiptAdvice, CreditNote, parties, products, fulfillment, transport, taxation, banking and settlement. The example files are in `public/examples/ubl/`, including extraction provenance in `model-map.json`.

Ossie ontology and OWL share the same 45 concepts. Source role names and occurrence counts come from OASIS's published XSDs. SHACL projects those selected aggregate-role cardinalities. The ODCS and semantic artifacts model an analytical normalization with 169 datasets and 401 joins, declared in the contract as ODCS foreign keys; repeatable roles use bridge tables. These surrogate keys and relational mappings are application choices, not an official UBL relational model or official OASIS ontology. Both versioned analytical artifacts pass their official companion schemas.

Source: https://docs.oasis-open.org/ubl/UBL-2.3.html . Regenerate with `python3 scripts/extract-ubl.py` then `bun scripts/ubl-example.ts`. Verify browser loading with `bun scripts/ubl-browser-check.ts`.

## UI regression, export and targeted mutation checks

With the dev server running:

```sh
bun run test:ui
bun run test:responsive
bun run test:edges
bun run test:grouping-validation
bun run test:projects
bun run test:trash
bun run test:metrics
bun run test:graph
bun run test:editor
bun run test:item-edit
bun run test:rdf-edit
bun run test:scm
bun run test:odcs
bun run test:mutation
bun scripts/live-inspect.ts
```

`bun run test:trash` checks the row trash icons (muted until hover or focus, keyboard reachable, at least 28 px, no overlap with the filename at 390 px and 2560 px, visible without hover on touch), suggestions (accept and dismiss), delete confirmation with its warnings, Undo, restore and permanent delete from the trash, project delete and restore, and Clear with Undo, all without a page reload. `bun run test:projects` checks the project tree, an external edit appearing in an open tab within 2 seconds, a stale save from a second tab, and a restart after deleting `cache.sqlite` (projects, files, view settings and drafts are restored). `bun run test:scm` commits, branches, switches, pushes to a local bare remote, pulls a commit made in a second clone and repairs a conflict entirely from the Source Control panel; it also checks hidden-file labels, Add to .gitignore, `.gitignore` editing, file history, the credential wait with Cancel, a pull refused with unsaved edits and the missing-Git banner. It never uses a network remote. `bun run test:git-setup` sets the identity from the banner, commits, adds a local bare remote in the Remote dialog and pushes, clones a local bare repository (invalid files listed, not rewritten), and opens the Credential setup guide from a push that a local test server refuses for credentials. `bun run test:monorepo` clones a local repository with a `.semantic-workbench.json` file and one without, then checks the grouped tree, the project named on each Source Control change, staging and committing a sibling project's file, Remove from workspace, Projects in this repository…, Delete folder with Undo, and the dialogs at 390, 1280, 1440 and 2560 px.

The UI suite uses real browser downloads and an API on a temporary data root. It checks reopening existing examples (the previous blank-graph regression), grouped relationship selection, unobstructed controls, all UBL exports plus RDF/XML, unsaved edits, JSON export, re-import, document switching and alignment. `live-inspect.ts` uses the real running API and workspace read-only (every non-GET request is refused), captures screenshots, and compares the live exported document with its project file.

The responsive suite checks six viewports from 390×844 through 2560×1440, including 1280×720 and 1366×768 desktops. It also enters and leaves full screen in Graph and Neighborhood (zoom and selection restored), and sweeps every view (Graph, Neighborhood, Overview, Catalog, Source, Mappings, Metrics, ODCS contract and dataset page, Source Control) through nine window sizes, asserting no horizontal page scroll and no control cut off. It verifies canvas space, contained controls, project-tree rows whose names end before their delete and menu icons, workspace drawer keyboard access, selection-centered neighborhoods, relationship details, repeated view changes and resizing. Screenshots go to `/tmp/workbench-responsive-*.png`. The compact header and collapsible workspace preserve canvas space; details appear only when selected. Overlap checks place every floating element (mini-map, zoom controls, graph status line, bundle selector, status message, toolbars, details panel) in every view at the six viewports, with and without details open, and fail when one covers another or a control; they also check that the grouping popover stays below its control and inside the window, that area titles stay inside their area, that status messages disappear within six seconds and on the next action, and that the sidebar item and tab marked current match the view.

`bun run test:edges` measures Flights SVG endpoints against rendered entity borders during entity and business-area dragging, zooming, selection, and both layout modes. Worker routes render only when their endpoints match the current React Flow handles; live curves keep connections attached while dragging or waiting for a fresh route.

The mutation suite is **targeted**, not a whole-project mutation score. It checks 122 deliberate logic faults (plus three browser mutants) in validation, RDF definitions, size limits, layout, neighborhood filtering, grouping, exports, form edits, the source and item editors, metrics and the folder store (item patches that re-serialize JSON or rewrite a whole YAML item, a delete that skips dependents, an RDF edit that skips the graph check, N-Triples lines re-serialized, a pull allowed with drafts, Git run through a shell string, a remote command outside the explicit actions, a commit without a message, a contract diff that ignores type changes, a full-screen exit that forgets the view, a metric wizard or save that copies the formula into the extension, binding lines out of order, an approved metric that stays approved after a change, a dropped base-hash check, an invalid save accepted, a write in place instead of temporary file and rename, skipped migration hash verification, `..` and `.git` paths accepted, no origin check on the event stream, journal recovery that always rolls forward, undo after the 10-second window, a restore that overwrites, suggestions from similar names, deletion without the confirmation flag, a Group by Auto that picks a one-group mode, contract communities that ignore foreign keys, an identity written with `--global`, a clone without the explicit action, a clone staged outside `data/projects/`, a clone with symbolic links enabled, a manifest folder with `..` accepted, a subproject delete that moves its siblings too, a Git action that rescans only one project of a shared repository), plus three browser-injected faults: an empty neighborhood node projection, a graph status line drawn back over the mini-map and zoom controls, and status messages that never dismiss. Unmodified module baselines must pass, and every mutant must be detected. It writes temporary candidate modules under `/tmp`, never changes application sources, and removes temporary files afterward.

Details open beside the graph or page (below it on phones), never over the graph's controls. Status messages disappear after five seconds, or as soon as you switch view, document or project. The sidebar marks **Model explorer** for every model view (it opens Graph), **Source editor** on Source and **Source control** on Source Control.

**A calmer main screen (v0.3.0).** The main screen holds the sidebar, the header (title, **New**, **More actions**, the Save state indicator and **Commit…**), the view tabs and search, the view and the details panel; everything else opens as a dialog that keeps focus inside, closes with Escape and returns focus to what opened it. The sidebar is 300 px wide by default and resizes from 220 to 520 px by dragging its edge or with the arrow keys, Home and End on the separator (remembered by the browser); long file and project names wrap to two lines and keep their full name as a tooltip; **Examples** is collapsed once projects exist. On desktop one header button hides and shows the sidebar; below 1100 px the sidebar is a drawer. **New** lists one **Add <kind>…** per kind (concept, dataset, dataset relationship, metric, contract object, concept mapping, RDF resource); kinds the open file cannot hold stay listed with the reason. **More actions** holds **Export**. The Save state indicator opens **Validation details** when the file has errors (also from the status bar), and **View definition** in the details panel shows the item's full definition as read.

Graph connections group parallel relationships; the inspector exposes each original definition. Names appear on hover or selection, with a Labels toggle for inspecting all labels. Selecting an entity lists all its relationships. Long edges route above intervening columns. The sidebar scrolls documents independently and keeps example/import controls visible. API hot reloads no longer restart the frontend; the dev launcher owns both process groups and uses a strict frontend port.

## Complete interactive graph

The **Graph** tab is a real React Flow canvas, separate from the preserved **Overview** and relationship matrix. It retains every business entity and relationship, with directed parallel-link bundles exposing original definitions. It offers **Network (fCoSE)** and **Layered (ELK)** layouts, a **Value types** switch that hides value types and built-in concepts with their relationships (remembered per model in this browser), compound business-area boundaries, explicit overlap cleanup, area zoom, mini-map panning, selection highlighting, manual dragging, and **Fit model**.

Detailed edge routing uses React Flow Smart Edge's shared background worker. At whole-model zoom, the canvas uses inexpensive native paths; obstacle-aware routes are computed for visible or selected connections at useful detail. This avoids queueing thousands of costly routes for edges too small to inspect. Models above 250 visible business entities open with collapsed areas; click an area count, or use **Expand all**. Internal links remain folded into their area's count until expansion. The 45-entity UBL model opens fully expanded.

Research and architectural choices, including React Flow, ELK, Cytoscape/fCoSE and Sigma, are recorded in [docs/graph-design.md](docs/graph-design.md).

```sh
bun run test:graph
bun scripts/large-graph-browser-check.ts
EXPAND_ALL=1 bun scripts/large-graph-browser-check.ts
```

The large browser check covers the 1,000-entity / 5,000-relationship fixture, model preservation, cancellation back to overview, area expansion, all-node expansion, zoom, selection and worker routing. `bun run test:graph` (`scripts/graph-browser-check.ts`) checks the full UBL graph and the neighborhood in a real browser on the UBL, shopping center and 1,000-entity models: exact-first center picking, a five-step walk with Back and Forward, the counts at every step against the projection, centering, no shared edge lines or overlapping labels, the OWL projection, metric badges, a walk into another file, and that the empty state never flashes. Both use an API on a temporary data root. Screenshots are written to `/tmp/real-graph-*.png` and `/tmp/workbench-neighborhood-*.png`.

## Input validation and repair

The browser, inspector, folder store, and HTTP save endpoint share the same validation rules. Invalid documents are rejected before any file is written. All imports in a selected batch are preflighted before saving; a batch containing errors opens **Review import**. Choose a file, inspect errors and warnings, edit the source or filename, and import when all errors are resolved. Cancel or Escape returns to the untouched open document. A batch is written all or nothing: if the API fails, nothing from the batch is imported and the repaired drafts stay in the dialog for a retry.

Invalid edits remain in **Source**, unsaved (the Save state indicator says so and opens the findings), with findings showing JSON-pointer paths and YAML/JSON line/column locations. **Validation details** exposes coverage warnings even on valid documents. **Go to line** focuses the source editor. Export continues to preserve draft bytes, including invalid drafts, so work can be recovered externally. A valid file's graph, overview, catalog, relationship inspector, and export controls retain their existing behavior.

Checks include:

- YAML/JSON syntax, duplicate mapping keys, unsupported tags, alias expansion limits, cyclic aliases, supported serializations, filenames, and a 2,000,000-byte UTF-8 input limit. N-Triples uses a strict N-Triples parser; RDF/XML is checked for XML errors before RDF parsing and rejects DTD/entity declarations.
- Official pinned ODCS 3.1.0 and Ossie semantic 0.2.0.dev0 schemas. Other versions and legacy wrappers report their structural-only coverage. Versioned Ossie ontologies and mappings use pinned official 0.2.0.dev0 schemas; unversioned ontologies retain the compatibility profile. Schema checks do not certify full semantic conformance.
- Scoped duplicate concept/dataset/field/metric/relationship names, duplicate ontology IRIs, dangling concept/parent/dataset references, inheritance cycles, declared primary keys and join fields, and composite join arity. Missing field catalogs produce a warning instead of incorrectly rejecting externally defined columns. Embedded SQL has the syntax-checking coverage described below; it is never executed.
- Inheritance uses iterative Kahn topological elimination in O(V + E), tested on 20,000-node chains and cycles. Ordinary relationship cycles, self links, multiple parents, disconnected components, and parallel links remain legal.
- Ossie ontology global identifiers: `iri` on concepts and relationships accepts a full IRI or a `prefix:local` QName whose prefix is declared in the top-level `prefixes` map; undeclared prefixes and duplicate expanded concept IRIs are rejected. `uri` is not an Ossie field: versioned ontologies report it with a rename-to-`iri` hint, and unversioned ones warn that it is ignored.
- RDF syntax; selected OWL restriction checks (property, qualifier, cardinality, hasSelf); selected SHACL definition checks (property paths including sequences/alternatives/inverses, cycles in path expressions, count/length bounds, typed flags and IRI parameters). External class/property IRIs are allowed and never fetched.

**SQL inside definitions.** SQL embedded in YAML and JSON is colored as SQL in the Source editor and checked with the shared rules, in the browser and in the API's file findings alike: Ossie field and metric `expression.dialects[].expression` (flat, legacy `semantic_model` list and models embedded in `ontology_mappings`), Ossie object, referent and link mapping expressions, ODCS quality rules with `type: sql` (`query`) and ODCS `transformLogic`. The dialect comes from the sibling `dialect` (ANSI and `OSSIE_SQL_2026` use the PostgreSQL grammar, accepting what the SQLite grammar accepts, as the planner does; Snowflake, BigQuery, Databricks via the Hive grammar) or from the contract's first `servers[].type`; `${name}` placeholders are allowed. Non-SQL dialects (DAX, MDX, MAQL, Tableau, Sigma, ThoughtSpot, Holistics AQL) stay plain with a "not checked" note. A syntax error is a **warning** at the exact file line and column, mapped through block, folded, plain and quoted scalars, indentation and escapes; warnings never block saving or autosave, and checking never changes a byte. Item editor expression fields and the metric wizard's expression are SQL fields with the same colors and warnings, and SQL previews are colored. `bun run test:sql` checks this in a browser.

These are input and supported-definition validators. They do not certify full OWL profile conformance or logical satisfiability, execute SQL, fetch imports, or apply SHACL shapes to a separate data graph. SHACL advanced/SPARQL constraints are preserved but not evaluated. Full standards reasoning needs a separate engine.

`tests/validation.test.ts` includes malformed and positive cases for every supported input family and revalidates all shipped examples. `tests/route-security.test.ts` covers symbolic links, host names, branch names, Git remote helpers and credential redaction. `tests/api-validation.test.ts` and `tests/files-api.test.ts` exercise the actual HTTP handler against a temporary data root. `bun run test:ui` covers repair, mixed batches, cancellation, invalid source/save recovery, original graph navigation, and byte-exact exports; screenshots are written to `/tmp/workbench-validation-*.png`. `bun run test:mutation` includes deliberate removal of duplicate, reference, cycle, join, schema, size, SHACL, and OWL checks.

Standards references: [ODCS schema](https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json), [Ossie semantic specification](https://github.com/apache/ossie/blob/main/core-spec/spec.md), [W3C SHACL](https://www.w3.org/TR/shacl/).

## Editing one item

**ODCS contracts.** An open data contract gets a **Contract** tab: the contract's identity and status, then whichever of servers, team and roles, service levels, quality, support, pricing and custom properties it declares, and a searchable table of its schema objects with property, key and quality-rule counts (169 UBL objects filter as you type). **Open** an object for its dataset page, in the style of Marquez: a header with type, property and rule counts, the last commit that changed the object, and tags, then five tabs (it opens on **Properties**).

- **Lineage**: the column-level lineage canvas (below) centred on the object, and a table listing, per property, the fields and metrics that read it.
- **Relationships**: the object's foreign keys, both the ones it declares (references) and the ones that point at it (referenced by), each opening its target.
- **Properties**: every property (nested ones as `parent.child`) with logical and physical type, required, unique, primary key, classification, description, tags and foreign keys that open their target; sort by any column and filter. Logical type, the three flags, classification and description are edited in place: only that value changes in the file (YAML or JSON), the result is checked against the pinned ODCS 3.1.0 schema before it is saved, and the save carries the file's base hash. Escape cancels a text edit.
- **History**: the file's committed versions (contract version, date, author, message, the object's property count) and, between any two of them, the properties added, removed and changed with each attribute's old and new value, types included.
- **Data Quality**: the rules on the object and its properties with dimension, severity, type, metric and threshold, as declared. The workbench does not run them.

**Column-level lineage.** For a contract, the **Graph** tab is a lineage canvas: one card per asset (contract objects, semantic datasets, metrics, references to other contracts) with a row per column and its badges (PK, FK, Required, Unique, classification), and lines from column to column, left to right: foreign keys from the referenced column to the referencing one, declared transforms, fields that read a column, metrics over those fields and metrics over metrics. Lines use the same styles and legend everywhere. Select a column to emphasise its whole upstream and downstream path (everything else dims) and see it listed in order in **Selected path**; **Find assets** finds any object, column, dataset, field or metric and walks there. **Steps** sets how many foreign-key steps around the centre are shown, **+** on a card shows its other neighbours, **Walk here** re-centres with a Back/Forward trail, cards with more than 10 columns page, and **Lineage options…** hides metrics or references to other contracts. Lines are matched by declared names (a dataset's `source` is an object's physical name or name; a field's expression names a column): this is the workbench's reading, not part of ODCS or Ossie, and nothing is executed. **Open in lineage** on the contract overview and asset pages opens the canvas on that object.

`bun run test:lineage` checks every drawn line against the expected edge lists (`tests/fixtures/lineage/`) on the commerce, mall and UBL contracts, path emphasis within 200 ms, UBL's first view within 2 s, paging, walking, the legend and full screen.

`bun run test:odcs` checks these pages on the commerce, mall and UBL contracts, the edits (`git diff` limited to the edited line) and a 390 px screen.

Select an entity, relationship or metric anywhere (graph, neighborhood, overview, catalog, Metrics) and press **Edit** in the details panel (or the **E** key; catalog cards and the metric detail have their own **Edit**). A drawer opens on the right with only that item: **Fields** shows its attributes as a form (a concept's name, type, description, parents and IRI; a relationship's related concept, role, multiplicity and reading; a dataset, field or join; an ODCS object, property or foreign key; a metric's expression and its attributes), and **Source** shows the item's own lines in the source editor, with highlighting and inline findings. Child lists (a concept's relationships, a dataset's fields, a contract object's properties and foreign keys) open their own editors. The whole file is validated as you edit; **Save to file** stays off while there are errors and writes the change in place with the usual base-hash check. Only the edited values change: comments, anchors, key order, quoting, indentation and line endings elsewhere keep their bytes, and JSON files are never re-serialized. **Open in Source** jumps to the item's line.

**New** (header) inserts a new item of the chosen kind in the open file, and **Add relationship** / **Add property** (details panel) a relationship or property, through a form with the fields the format needs and a preview of the text that will be inserted, written in the file's own style (indentation, list style, flow lists where the file uses them). **Delete** lists what depends on the item (relationships and parent lists that name a concept, joins and metrics that read a dataset, foreign keys to a contract object, metrics that use a metric and its binding line, mappings in other files of the project) and removes them with it in one journaled save, or Cancel; references that cannot be removed safely (expressions in mappings) are listed to fix in Source. Renaming an item lists every other place in the project that still names it; each one is rewritten only if ticked. Nothing is written until **Save to file** or **Delete**; Git keeps the previous version.

**RDF, OWL and SHACL resources** (Turtle, N-Triples, N3, RDF/XML) open in the same editor from the catalog, the inspector, a relationship or **E**: the resource's statements as predicate–object rows (objects in Turtle syntax, such as `"text"@en`, `c:Order` or `[ a owl:Restriction ; … ]`), plus a Source tab with only its statements. **Add** offers an OWL class, object or datatype property, SHACL node or property shape, or any resource. Every change is parsed back before **Save to file** is offered: the file's graph must be the original minus the removed plus the added statements, otherwise it is refused with the reason (a Source edit that touches another resource, for example). What stays byte-identical, per serialization:

| Serialization | An edit rewrites | Edited in Source only |
| --- | --- | --- |
| N-Triples | the changed lines; new lines follow the resource's last line | — |
| Turtle | the changed predicate–object pairs inside the resource's statement block; new ones follow its layout | statements the editor cannot split |
| N3 | as Turtle | resources used in formulae or rules (the editor offers **Open line N in Source**) |
| RDF/XML | the changed property elements inside the node element, which stays in place | `parseType="Collection"`, reification, `rdf:li`, resources described in nested elements; the element name (type) is shown locked |

Removing a statement that has a comment next to it asks for confirmation. **Delete** removes the resource's statements and the statements in the same file that name it (listed first); other project files that still name it are listed to fix in Source.

## Metrics

The **Metrics** tab lists every metric of the open file's project: label, type, unit, status, owner and the ontology concept it measures, with search, grouping (owner, type, status, concept, file) and filters. **Governed only** keeps the metrics that carry workbench attributes; a metric without them (type and additivity are then read from its expression) offers **Add attributes**, which opens the metric wizard prefilled from it and saves only its attributes, leaving its name and expression as written. Selecting a metric opens its detail beside the list (in place of it on narrow screens):

- **What it is**: description, type and additivity (declared, or read from the expression and marked *inferred*), status, unit, owner, the concept it measures and the entity it is about, its target, and any findings.
- **How this metric is calculated**: the formula in words (for example *Occupied GLA ÷ Total GLA*) above the governed expression; the composition tree from the metric through numerator, denominator or inputs down to dataset fields; the rules that govern it (time dimension and grains, breakdowns, filters, additivity, division by zero, missing values); and a SQL preview from the governed planner, labelled **Preview · not executed**. Choosing a grain, breakdowns or *Sum the metric values* updates the preview, or refuses it with a reason when additivity or the declared grains forbid it: summing a ratio, or summing a month-end stock over a quarter.
- **Where the data comes from**: each input metric, the fields it reads, the dataset and its physical source, and the ODCS object and properties that source is contracted as (matched by exact physical name), with the contract's declared quality rules and service levels. The workbench shows these declarations; it does not run them.

The workbench never executes queries: the explanation and the SQL preview are computed from the definitions. Both official Ossie layouts are read: split files, and the consolidated file whose `ontology_mappings` embed the semantic model (deprecated upstream; labelled *consolidated* in the sidebar and the metric detail). Other single-file mixes are rejected with a message naming the two layouts.

The interface uses **Metric** for both ordinary and governed metrics. Stored metric-to-concept bindings keep the historical key `kpi_bindings`; imports and exports preserve that key.

Metric attributes are stored in the Ossie files themselves, so they travel with the model and diff cleanly: each metric carries a `custom_extensions` entry with `vendor_name: SEMANTIC_WORKBENCH` whose `data` is JSON validated against [schemas/semantic-workbench-metric-v1.json](schemas/semantic-workbench-metric-v1.json); the metric-to-concept bindings (`measures`, optional `of`) are one line per metric in the root extension of the standalone mapping document (or of the embedded semantic model in a consolidated file), validated against [schemas/semantic-workbench-mapping-v1.json](schemas/semantic-workbench-mapping-v1.json). Errors in these blocks are reported at the exact line and column. Without extensions, type and additivity are inferred, and concept mappings whose expression is a metric name are shown as evidence. The graph shows metric nodes (with a *Metrics shown/hidden* toggle) and a metric badge on concepts that metrics measure or describe, also in the catalog. The shopping center example declares all of this for its 25 metrics.

**New metric** (Metrics) opens a wizard in eight numbered steps: the concept it measures and the entity it is about; the semantic model; type and inputs (a simple aggregation of a field, a ratio of two metrics with a `NULLIF` guard, or a derived, cumulative or filtered metric over named metrics), label, name and additivity; time dimension, grains and breakdowns; target and thresholds; owner, steward, status, unit and format; the explanation and SQL preview of the new metric (computed, not executed); and the exact lines each file will gain. **Save to file** writes the metric (its formula only as the Ossie expression) with its extension into the semantic model and one binding line, in sorted position, into the project's mapping document, in one journaled save; a project without a mapping document gets a minimal one (`concept_mappings: []`), and a consolidated file keeps the binding in its embedded semantic model. **Edit metric** follows the status rules: draft → proposed → approved → deprecated; changing the definition of an approved metric returns it to proposed; deprecation needs `replaced_by` or `deprecation_reason`; the metrics and bindings that use the metric are listed before saving.

API: `GET /api/projects/:slug/metrics` (every metric, each with `governed`), `POST /api/projects/:slug/metrics` (and `…/metrics/preview`; `existing: true` adds attributes to a metric already in the model; the v0.2.0 `…/kpis` paths remain as aliases), `POST /api/projects/:slug/save-batch` and `GET /api/projects/:slug/files/*path/explain/:metric?grain=&dimension=&rollup=sum` ([contract](specs/001-workbench-improvements/contracts/http-api.md)). `bun run test:metrics` checks the view and `bun run test:item-edit` the item editor, add, delete, rename, the wizard and the status rules in a browser on an isolated data root, with `git diff` limited to the edited item; `bun run test:rdf-edit` does the same for Turtle, RDF/XML, N-Triples, N3 and SHACL resources.

## Ontology mappings and agent tools

**Load mapped commerce** demonstrates separate ontology, semantic model, and mapping documents. The **Mappings** tab resolves object/referent/link mappings, displays source evidence and physical sources, exposes governed metrics and AI metadata, exports agent context, and, in the **Compose a query…** dialog, composes a new revenue-by-region SQL preview from selected building blocks (shown, never run). Missing or ambiguous document/field/concept references are reported.

Each binding reads as a chain of labelled steps: concept, relationship path, field or metric, dataset and physical source, with its condition and its findings attached. Bindings are grouped by dataset (a view choice; groups collapse and show their counts). A finding offers **Edit item**, which opens the item editor on the offending mapping item, or Source at its line when the item has no form. Concepts and bindings sit side by side; below 760 px they stack. Long names wrap at `.` and `_`, each arrow stays with the step it leads to, and counts read `1 binding` or `N bindings`; `bun run test:mappings-layout` measures every binding card of the shipped mapping documents and of one with 80-character names at six viewports.

**Mapping graph.** For a mapping document, the **Graph** tab draws the mapping itself, from the same resolver: ontology concepts on the left (rows: their relationships), semantic datasets with their fields on the right, and metric cards. An object mapping is a line from the concept to the dataset, with the fields that identify it badged **Identifying**; a referent mapping runs from the concept's relationship row to the field; a link mapping runs from the relationship row to the related concept, labelled with the relationship, and selecting it lights up the join fields it passes through (for example `orders.customer_id → customers.customer_id`); metric bindings link the concept a metric *measures* (solid) and the concept it is *of* (dashed). Select a concept, row or field to emphasise its mappings and list its bindings, each with **Edit item**. Concepts and fields nothing maps carry an **Unmapped** badge, and **Unmapped only** shows just those; resolver findings appear as warning markers on the card they concern, with the message and **Edit item**. Find assets, Steps, Expand, walking and full screen work as on the lineage canvas. A consolidated file (embedded `ontology_mappings`, such as Flights' `flights.yaml`) switches between **Mapping graph** and **Ontology graph**. `bun run test:mapping-graph` compares every drawn line with the resolver's bindings on Flights (both forms), mapped commerce, billing and the shopping center.

Overview, Catalog, Source, import repair and byte-exact source export remain available.

Standalone mapping documents and deprecated embedded `ontology_mappings` are supported using pinned Apache schemas. Agent clients can call `/api/agent/catalog`, `/api/agent/context`, and `/api/agent/plan`. The runtime supplies explicit mapping traversal and immutable metric definitions; callers supply language interpretation and any external query execution. No hosted LLM is required or called. See [agent runtime and integration protocol](docs/agent-runtime.md) for examples, supported composition, graph integrity checks, and limits.

## Reproducible example execution

The generated [subscription billing example](public/examples/billing/README.md) has 36 business entities, 46 joins, 119 mapping bindings, four governed metrics and an executable synthetic SQL fixture. It verifies revenue, recurring revenue, distinct invoice counts, dependent ratios, computed fields and missing-dimension fact preservation.

```sh
bun run examples:generate
bun run test:examples
# With the dev server running:
bun run test:examples:ui
```

All five [official Apache Ossie examples](tests/fixtures/ossie-mapping/README.md) are pinned and hash-checked without modifications. Use **Load Ossie Flights** in the workspace sidebar to open the official ontology graph and load its semantic model plus standalone and embedded mappings. Both mapping forms resolve and are tested through the UI. TPC-DS imports with a warning for an unexposed physical primary-key column; window expressions remain preserved rather than being executed by the current planner. [Verification results and SQL](docs/example-verification.json) record 20 actual synthetic-fixture SQL executions. Browser screenshots are saved under `/tmp/`.

## Grouping and validation navigation

**Group by → IRI namespaces** places each definition in the namespace of its IRI, labelled with the declared prefix of the longest matching namespace (Ossie `prefixes`, or the RDF document's prefixes). Definitions without an IRI are listed under **No IRI**.

The graph, the overview and a contract's lineage canvas share a **Group by** selector: **Declared domains**, **IRI namespaces**, **Suggested communities**, **Definition types**, and **UBL example areas**. Suggested communities come from a deterministic, bounded modularity pass over each document's own structure: relationships between ontology concepts, foreign keys between contract objects, joins and metric references in semantic models, and links between mapped concepts in mapping documents. Inheritance, direction, duplicate links and primitive hubs do not influence them, and shared values stay separate. A mode that finds fewer than two real groups in the file is shown disabled with its reason (for example "No IRIs declared", or "Only the contract-level domain is declared" for an ODCS contract). **Auto** takes the first enabled mode in the order declared domains, example areas, namespaces, communities, types, and its label always names that choice. The UBL example areas are offered when at least 80% of the entities carry a curated UBL name, whatever the model is called. Lineage cards of the open contract's objects are tinted with their group colour, and Neighborhood nodes carry it as a coloured edge. The ⓘ button explains the basis and opens **Adjust grouping…**, a dialog that moves an entity to another or a new group; corrections are saved as view settings in `data/state/views/`. Original definitions and exports are unchanged.

Source and import-repair editors share one editor (CodeMirror 6). When a document opens (mount or a
different document ID), YAML files above 500,000 characters use viewport-only SQL and extension-JSON
colouring with indentation folding to keep typing fast. Typing and external replacements of the same
document keep that mode. The status bar shows **Large file mode** and offers **Full parsing**;
switch back with **Large file mode**. This switch overrides the mode until another document opens.
Colors follow VS Code's Light+ theme for the detected serialization: YAML, JSON, Turtle, N3,
N-Triples and RDF/XML (`.gitignore` and unknown text stay plain); the JSON inside a
`SEMANTIC_WORKBENCH` extension block is colored as JSON. After a 300 ms pause, findings appear
inline from the shared validation rules, run in a background worker: a wavy underline on the
offending token, a gutter marker and the message on hover (Ctrl+Shift+M lists them). Findings
without a reliable location are listed above the editor as document-level. The bar shows the
serialization, the file's line endings, the cursor position, **Find** (Ctrl+F, with replace) and
**Go to line** (Ctrl+G); undo/redo, folding and keyboard operation work as usual, and the editor is
named "Definition source" (or "Repair definition") for screen readers. **Go to line** in a finding
selects the affected line. Edits never rewrite untouched bytes: each change is mapped onto the file
as it is on disk, so CRLF, mixed line endings, tabs and the trailing newline stay as they were, new
line breaks take the file's main style, and autosave sends only the changed range (`patches`)
against the version it started from. `bun run test:editor` checks colors per serialization, inline
findings within 500 ms of a pause, Go to line, the repair dialog, a byte-exact CRLF save and typing
latency in a 1.9 MB file.

## Shopping center administration example

**Load shopping center administration** opens a reference model for retail real-estate administration: 145 entity types in eleven namespaced modules (core, asset, party, lease, legal, hr, proc, ops, fin, perf, kpi), 259 declared joins, 1,057 mapping bindings and 25 governed metrics, including occupancy rate, minimum rent per m², delinquency rate, sales per m², occupancy cost ratio, footfall, net operating income, payroll cost, headcount, purchase spend and payables outstanding. Leasing, operations, legal, HR, procurement and finance share one contract register and one party model. The same specification produces Ossie, OWL, SHACL, ODCS and RDF instance data, plus a synthetic SQLite fixture whose metric results are checked against independently computed values. See [the example README](public/examples/mall/README.md). Regenerate with `bun scripts/mall-example.ts`.

## Contributing

The code style is part of the project's constitution (principle VIII, Readable Code):

- `bun run schemas:compile` regenerates the checked-in browser validators from pinned JSON
  Schemas using Ajv standalone code. Build and check run it automatically; `bun test` checks
  reproducibility. The browser CSP does not allow eval.
- `bun run fmt` formats `src/`, `server/`, `scripts/` and `tests/` with Oxfmt (100 columns,
  2-space indentation, semicolons, single quotes, trailing commas). `bun run check` runs
  TypeScript, `fmt:check`, Oxlint and the comment check, and fails on unformatted code.
- One statement per line and one variable per declaration; descriptive names; small functions
  (about 40 lines) and components (about 150 lines); no nested ternaries.
- Comments are plain English for a developer new to the repository: they explain why, one idea
  per sentence, and never carry spec or task IDs or process notes (traceability goes in commit
  messages). Every module has a short header comment and every export a short JSDoc.
- `bun run lint:full` also lists the readability warnings (names, function length, nesting) for
  the code you touch.
- `.git-blame-ignore-revs` lists the mechanical reformat; run
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` once to skip it in `git blame`.

## Administering access

Admins open the panel from the header's **Admin** button. In server mode only Admins see it; in
local mode the implicit Admin does. It has seven areas:

- **Projects**: assign projects to domains, set protected branches, restricted paths and the
  protected classification level, and grant agent clients their projects or domains.
- **Roles & access**: on **Grants**, give a built-in or custom role to a group (by object ID) or
  a verified e-mail address, for the whole workspace, some domains or some projects. Addresses
  are stored in lower case. The group's directory name is shown when the lookup succeeds; when it
  fails the grant keeps the ID and says "name not resolved". On **Roles**, the four built-in
  roles are read-only; duplicate one to make a custom role, pick its actions and optional
  conditions, save it, then add members through the same grant form. Custom roles cannot hold
  the `admin` action. Deleting a custom role lists the people who hold it and removes its grants
  in the same change.
- **Users & groups**: everyone who has signed in, plus configured agent clients, with their
  groups and where each role comes from. Filter on **No access** to find people waiting for a
  grant; **Grant access** opens the grant form with their verified address filled in. People can
  be deactivated, reactivated and signed out from here.
- **Policies**: the read-only baseline rules and the Admin rules. New rules start from a template
  (time window, network range, Git action limits and others) or the raw Cedar editor, and are
  validated by the server, which reports line and column. The server generates template text.
  Time rules use UTC; a window such as 22 to 2 runs past midnight. Network rules use the direct
  socket peer, never forwarded headers: behind Azure Container Apps ingress the peer is the
  ingress address, not the person's, so a network rule there only tells ingress traffic apart.
  A `forbid` rule must name its actions and cannot include `admin`: rules that could lock every
  Admin out are refused, whatever their condition.
- **Access check**: why a known person or a hypothetical group and address is allowed or denied
  an action on a project, path or branch, and who can act on a project or path. It evaluates the
  same Cedar policies as normal requests.
- **Audit**: filter by person, action, project, decision and time, page through the records and
  export the filtered set as JSONL or CSV. Without a **From** time the current month is shown.
  Stewards see only the records of their own projects, and not the records of restricted paths
  they cannot read.
- **Settings**: provider health, session lifetimes (applied immediately), the remote-credential
  policy, and active sessions that can be ended. Provider credentials and session tokens never
  appear.

Every access change goes through **Dry run** before **Confirm**. The review lists the replayed
decisions that change and, for each person or agent client, the project actions gained or lost.
Editing the proposal discards the review. The dry run replays the fixture identities and
requests in `policies/matrix-cases.json` plus the latest 1,000 audit snapshots; regenerate the
fixture with `bun scripts/generate-access-matrix.ts` after extending the route inventory.

Each confirmed change is one commit in the administration repository, authored by the signed-in
Admin, with a message that names what changed (for example
`grants: Add grant erin-viewer (viewer to erin@example.org)`). **History** in each area compares
versions with the source diff viewer. **Roll back** shows the dry run of restoring that version,
including people it reactivates, and **Confirm rollback** creates a new commit; the same checks
as any other save apply.
Changes apply on the next request and close the live-update streams of the people whose access
changed, so their browsers reload. Deactivation and reactivation end that person's sessions.

Refusals stay in the dialog and nothing is saved:

- **stale**: someone else changed access since the area was opened. Close and reopen the area,
  then dry-run again.
- **last-admin**: under the proposed grants, roles and rules no Admin who signed in recently and
  no bootstrap identity would still be allowed to administer.
- **bootstrap-admin**: bootstrap Admins cannot be deactivated.

Keep `SW_BOOTSTRAP_ADMINS` configured as the break-glass recovery path. Those verified addresses
or stable identity IDs remain Admins whatever the grants say, and the panel marks a bootstrap
session. Never use an unverified address as a bootstrap identity.

Scripts and other clients use the same routes: `/api/admin/*` (Admins only) and `/api/audit`,
`/api/audit/export?format=jsonl|csv`. Preview a proposal with
`POST /api/admin/policies/dry-run`, then send the same document to its PUT route with the
`dryRunId` and, as `baseVersion`, the `version` returned by that document's GET. To roll back,
dry-run `{"rollbackTo": "<version>"}`, then send `{baseVersion, dryRunId}` to
`POST /api/admin/versions/<version>/rollback`. The full
contract is in `specs/003-authn-authz/contracts/http-api.md`.

### Checking the Admin panel

`bun run test:admin` builds the app and drives the panel against the real API, a disposable
fixture workspace and the local mock identity provider; it never contacts a real provider and
needs sockets and Chromium. It times domain assignment, a group grant, an e-mail grant and an
access check against the three-minute target, checks that Erin's next request has her new role,
creates, edits and deletes a custom role, disables a policy and rolls it back after reviewing the
rollback's dry run, exports the audit,
and measures every dialog at 390×844, 1280×720, 1440×900 and 2560×1440. Set `SW_SCREENSHOT_DIR`
to keep the screenshots.

Without a server, the client and dialogs run against canned responses shaped like the contract
(`tests/helpers/admin-api-mock.ts`):

```bash
bun test tests/admin-client.test.ts tests/admin-presentation.test.tsx   # client and pure parts
bun test tests/admin-dialogs.test.tsx                                   # dialog behaviour
SW_SCREENSHOT_DIR=/tmp/admin-shots bun test tests/admin-geometry.test.tsx  # every dialog, 4 sizes
```

The administration mutants (invalid policy or unpreviewed change activated, built-in role
changed, role in use deleted without confirmation or leaving its grants, Admin rule overriding a
baseline forbid, deactivated principal allowed, Steward reading other domains' audit, and a
panel that confirms a stale review or saves without one) are part of `bun run test:mutation`.
