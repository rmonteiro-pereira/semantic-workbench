# Semantic Workbench

Semantic Workbench edits and explores data contracts (ODCS), semantic models and ontologies
(Ossie) and RDF (OWL, SHACL, Turtle) as plain files in Git-backed project folders. It explains how
every metric is calculated, previews the SQL and never runs a query.

It runs in two modes:

| | Local mode | Server mode |
| --- | --- | --- |
| For | One person on their own machine | A team that shares a workbench behind the organisation's sign-in |
| Start | `bun install && bun run dev` ([Run it locally](#run-it-locally)) | `bun server/index.ts` with the settings in [Server mode](#server-mode), or the container image |
| Sign-in | None; the person is the implicit Admin | OpenID Connect: Microsoft Entra ID is the target, Keycloak the compatibility check |
| Where work lives | `data/projects/<project>/` | Each person's own Git working copy; Stewards publish |
| Read | [Run it locally](#run-it-locally) and [Using the workbench](#using-the-workbench) | [Server mode](#server-mode), [deploy/README.md](deploy/README.md) and [deploy/trial-runbook.md](deploy/trial-runbook.md) |

More documents: [ARCHITECTURE.md](ARCHITECTURE.md) (map of the code),
[docs/agent-runtime.md](docs/agent-runtime.md) (the agent tools and agent clients),
[docs/audit-tamper-evidence.md](docs/audit-tamper-evidence.md) and
[docs/graph-design.md](docs/graph-design.md).

## Run it locally

Requires Bun 1.4+ and, for version control of projects, Git 2.40+.

```sh
bun install
bun run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:4310. `bun run dev` starts the
frontend only after the API reports ready on `/readyz`, so the first page load never hits a
refused connection while the API is still scanning the workspace.

On Windows, keep the data folder out of OneDrive and other synced folders. The sync client holds
files open while it uploads them, and the workbench rewrites its state files often; it retries a
blocked file replacement for up to two seconds, but a folder that sync keeps locked longer will
still fail. Point the API at a local folder with `DATA_DIR`, for example
`$env:DATA_DIR = "C:\workbench-data"; bun run dev` in PowerShell. Both bind to loopback.
The API answers only requests addressed to a loopback name (so a web page cannot reach it through
DNS rebinding), refuses writes from other origins and never follows a symbolic link inside a
project folder. `SW_HOST=0.0.0.0 bun server/index.ts` is refused in local mode.

Git needs an identity (`user.name`, `user.email`). It can come from your global Git
configuration or from **Set Git identity…** in the app. That action writes the identity into the
repository's own configuration (and, if you choose, into every repository that has none yet),
never your global one. Without Git, or without an identity, the workspace still opens and edits
files; a banner explains what is missing. Projects are not committed until Git is installed and
the API is restarted.

## Run it as a container

The image runs Bun as uid 1000 and contains Git, the API and the built frontend. Build it with
`podman build --format docker -t semantic-workbench:dev .` (or `docker build`; `bun run
image:build` does the same and supplies the version and commit), or build and run the local-mode
profile with Compose:

```sh
mkdir -p .data
# The bind-mounted folder must be writable by the image's uid 1000.
podman compose --profile local up --build
```

Use `docker compose --profile local up --build` with Docker. Open http://127.0.0.1:4310.
`/healthz` reports liveness, version and commit; `/readyz` reports readiness after recovery and
the first scan. Start-up probes the data root and reports its path and uid if it is not writable.

- **Host networking.** Local mode binds loopback, so the container needs host networking. On
  Docker Desktop (4.34 or later) enable **Settings → Resources → Network → Enable host
  networking**, then **Apply & restart**. Docker Engine on Linux or WSL2, and Podman, need no
  setting.
- **Rootless Podman.** Run directly with the user mapping below, or prepare the Compose folder
  with `podman unshare chown -R 1000:1000 .data`. Do not share that folder between different
  user mappings. On SELinux hosts, append `:z` to the volume.

  ```sh
  podman run --rm --network host --userns keep-id:uid=1000,gid=1000 \
    -v "$PWD/.data:/data" semantic-workbench:dev
  ```

  For Docker, omit `--userns keep-id:uid=1000,gid=1000` and make `.data` owned by uid 1000.
- **Version and commit.** Compose reads `SW_VERSION` and `SW_COMMIT` from the environment at
  build time (`image:build` supplies both). This checkout declares no package version, so the
  version is `dev`.
- **Hardening.** The image writes only to `/data` and `/tmp`. The `local` and `keycloak` Compose
  profiles and `bun run test:container` run it with `--read-only --tmpfs /tmp --cap-drop ALL
  --security-opt no-new-privileges`.
- **One instance per data folder.** A second instance of the same revision answers 503 and stays
  not ready. A different revision reports ready with `state: handover` and answers application
  requests with 503 and `Retry-After: 10` until the previous instance exits or its heartbeat is
  older than 30 seconds; it then recovers and scans before serving. SIGTERM and SIGINT close the
  workspace and release the lock.

The container reads its settings once at start-up. Every variable, with its default and the mode
it applies to, is in the [configuration contract](specs/003-authn-authz/contracts/configuration.md).
The image sets `DATA_DIR=/data`, `SW_CACHE_DIR=/tmp/sw-cache`, `SW_SERVE_STATIC=1` and
`SW_IN_CONTAINER=1`.

Server mode in a container: [Run the image in server mode](#run-the-image-in-server-mode).

## Using the workbench

The sections below apply to both modes unless they say otherwise. Server mode differs in who may do what and where each person's edits live ([Server mode](#server-mode)).

### Where your data lives

The sidebar file list scrolls without fading names. On short windows Examples and Import share
a row to leave more height for files.

Everything stays under the data root, `data/` by default. Set `DATA_DIR` to use another folder (the tests and browser checks always use temporary ones):

```text
data/
├── projects/<project>/   one folder per project: your files, byte for byte, in a Git working tree
├── worktrees/<key>/      server mode: each person's working copies, one per repository
├── state/                projects.json (project registry), views/ (grouping corrections per file),
│                         drafts/, journal/ (unfinished multi-file operations), suggestions.json
│                         (dismissed grouping suggestions), legacy-ids.json, audit/ (one
│                         append-only file per month of access decisions and writes),
│                         sessions/ (server mode: encrypted sessions)
├── admin/                access configuration (roles, grants, project access), a Git repository;
│                         created when access is first configured
├── trash/<entry>/        deleted files and projects (with their .git), each with an entry.json
├── backup/               the v0.1.0 database copied before migration
└── cache.sqlite          index of hashes, entities and findings; safe to delete
```

The files in `data/projects/` are the only copy of your definitions. `cache.sqlite` is rebuilt from them on the next start if it is deleted or out of date; the project registry, view settings and drafts live in the JSON files under `state/`, which are always replaced atomically. Back up `data/` with the app stopped, or push projects to a Git remote. The audit log is described under [Audit log](#audit-log).

**Saving and committing.** There is no Save button: a valid edit is written to its file automatically one second after you stop typing, sending only the changed range. The header's **Save state** indicator reads *Saved to file · N uncommitted changes*, *Saving…*, *Not saved: N errors* (nothing is written while the text has validation errors; it is kept as a draft that survives a reload) or *Not saved: file changed on disk*. Switching files or views writes a due save first. While a pull, sync or branch switch of the repository runs, saving waits and then re-checks the file's version. **Commit…** (the header's primary action) lists the project's changed files, all ticked, with the diff of the selected file and a suggested message (*Update orders in commerce.odcs.yaml*, *Update 3 files*); **Commit** commits only the ticked files (`git commit --only`, so other staged or unstaged work stays as it is) and **Commit & push** then pushes. **Revert to last commit** (with a confirmation) puts the last committed version of a file back and moves the replaced version to the trash, in one journaled operation. Item editors, add and delete dialogs and the metric wizard keep an explicit **Save to file**, which writes the file and never commits.

Every save sends the SHA-256 of the version it started from. If the file changed in the meantime (another tab, an external editor, a Git command), the save is refused and the two versions are shown in a side-by-side diff: keep editing (automatic saving of that file stays paused), load the current file, or explicitly save your version over it. Saves write a temporary file and rename it over the original, so a crash leaves either the old or the new bytes. Imports and project creation are staged and moved into place through a journal; an operation interrupted by a crash is completed or rolled back on the next start, and the outcome is shown.

The API watches every project folder. Files you change, add or delete outside the workbench (an editor, a terminal, a Git checkout) appear in every open tab within about two seconds without a reload; an open file follows the disk unless it has unsaved edits. A full rescan also runs every 60 seconds. Files that `.gitignore` excludes and file types the workbench does not read (for example `.csv` or `.md`) are not listed; files of a supported type that fail validation are listed as invalid and open in Source for repair. As in Git, a file that is already committed stays listed even if `.gitignore` matches it.

**Organizing and cleaning up.** Every project and file in the **Projects** tree has an actions menu: rename a project (its folder keeps its id), import more files into it, move a file to another project, or delete. Every file and project row also has a trash icon at its right edge (muted until the row is hovered or focused, always visible on touch screens) that starts the same confirmation. **Clear workspace** and **Trash** sit below the tree. Nothing needs a script or a reload:

- Deleting asks first. The confirmation names everything that is removed, warns about unsaved edits that would be lost, and lists Ossie `ontology_ref`/`semantic_model_ref` references that would no longer resolve to any remaining file.
- A deleted file or project moves to `data/trash/<entry>/`; a project moves with its `.git` folder, so its history is kept. Git history is never rewritten: a deleted file shows up in Git as an ordinary deletion.
- **Undo** is offered for 10 seconds after a delete or Clear and puts everything back exactly as it was, including drafts and grouping corrections.
- After that, **Trash** restores entries or deletes them permanently; emptying the trash asks for confirmation. A restore never overwrites: if a file or project now occupies the original place, the workbench offers a free name instead. A file whose project no longer exists is restored into a new project with the old name; in server mode that is a project creation, so it needs the right to create projects in the chosen domain (`domain` in the request), which is recorded for the new project. A file that was deleted outside any working copy comes back into your own copy.
- **Clear workspace** moves every project to the trash as its own entry, in one operation.
- Importing into an existing project a file whose name already exists asks whether to replace it or keep both (`name (2).ext`).
- **Export project…** in a project's menu (after **Import files into this project**) downloads a `.zip` of the project's files exactly as stored on disk, byte for byte, in their folders and with `.gitignore`. The `.git` folder and anything Git ignores are left out, and so are unsaved drafts: the dialog lists the unsaved edits it knows of and, for the open file, offers **Save and export**. The option **Include Git history**, off by default, adds `git-history.bundle`, a Git bundle that `git clone` reads. The zip is sent as it is built, never held whole, and `GET /api/projects/:slug/export` refuses a project larger than 64,000,000 bytes (the size of an import) with `413` and a message before any byte is sent, so no partial file is ever offered. Importing the files of the zip into a new project gives the same file hashes. The zip is not compressed, so the bytes in it are the bytes on disk.
  - In server mode the zip holds only the files you may read from your own view of the project. The number of files left out comes back in the `X-Export-Omitted` header and is shown after the download; their names never leave the server. Git history is exported only when no commit ever touched a file you cannot read and the project is the whole repository, and then it holds the branch you have checked out, not other people's working branches. Every export is recorded in the audit log as the action `export` on the project. Viewers and above may export; a person with no access is refused with `403`.

**Grouping suggestions.** When a file has explicit evidence that it belongs with another project, a one-line count below the tree ("1 grouping suggestion") opens the **Grouping suggestions** dialog, which proposes adding it there and lists the evidence. Three kinds count: an Ossie `ontology_ref` or `semantic_model_ref` naming an ontology or semantic model declared in that project, an IRI shared with a file there, or an ODCS physical name equal to a semantic dataset `source` there. Names that are merely similar never count. A file is offered only when nothing links it to the other files of its own project, and only from the smaller project to the larger one (a file imported on its own joins the project it references, not the reverse). **Add to project** moves it; **Dismiss** is remembered for that file's content and target in `state/suggestions.json`. Nothing is regrouped automatically.

**Upgrading from v0.1.0.** On the first start with a `data/workbench.sqlite` from v0.1.0, the API copies that database (with its `-wal` and `-shm` files) to `data/backup/`, reads the copy, and writes every stored document's exact bytes into project folders: documents of a shipped example set go to that example's project, everything else to **Ungrouped**; duplicate filenames become `name (2).ext`. Each written file is read back and its SHA-256 compared with the stored bytes; any mismatch stops the migration before anything is moved into place, and it is retried on the next start. Each project then gets `git init` and one commit, "Import from Semantic Workbench v0.1.0". Old document ids keep resolving through `state/legacy-ids.json`, and saved grouping corrections move to `state/views/`. The original database is never opened or modified. The migration needs Git and a Git identity; without them it waits, leaves everything untouched and says so.

The workbench only opens folders under `data/projects/`. Git runs locally with terminal prompts disabled; the only network use is an explicit clone, fetch, pull, push or sync (below).

**Source Control.** **Source control** in the sidebar opens a VS Code-like panel, headed *Source control*, for one project (the open file's, or any other from its project picker). The model tabs and the entity search do not show on this screen:

- **Changes**, **Staged changes** and **Merge conflicts**, with each file's state; clicking a file shows its diff side by side with changed lines marked (staged: last commit → staged; changes: staged → working tree). Files of types the workbench does not read are listed too, labelled *not shown in workspace*: they can be diffed, staged and committed, not edited. Files matched by `.gitignore` are not listed.
- **Stage** / **Unstage** per file or all, a commit message (required) and **Commit to <branch>** (the header's **Commit…** opens the dialog that commits chosen files). Files the workbench saved are committed byte for byte (managed repositories set `core.autocrlf=false`). Git hooks and filters run as configured; when one changes a file's bytes during a commit, pull or switch, the panel lists the files whose bytes on disk differ from what was saved or committed.
- **Branch** lists local and remote branches; switching or **New branch** rescans the project, so every view shows that branch's content.
- **Sync…** opens a dialog with the remote and its actions, each with a line saying what it does. **Add remote…** (or **Change remote…** once one exists; also **Remote…** in a project's ⋯ menu) opens the remote dialog, titled **Connect a remote** or **Change remote** (and **Review file move** while you read a folder change): a name (default `origin`) and a URL, SSH address or folder path; it changes or removes the remote too. Addresses that run a helper program (`transport::address`) or look like an option are refused. Then **Fetch**, **Pull**, **Push** or **Sync** (pull, then push), with commits to push and to pull shown next to the branch. Pull merges (`--no-rebase`); a conflict stops it, lists the conflicted files (also marked invalid in the tree), and the merge is committed after you repair each file in Source and stage it.
- Pull, Sync and switching branches are refused while the project has edits not saved to file (kept as drafts) or uncommitted changes, and the refusal offers **Commit…**; nothing is stashed automatically. Untracked files do not block: Git itself refuses to overwrite them.
- **Add to .gitignore** on a changed file adds the exact path, its extension (`*.csv`) or its folder; if the file is already committed, the panel says Git keeps tracking it. **Edit .gitignore** in a project's menu opens the file as plain text in Source; saving it updates the workspace and the panel at once.
- **History** in a file's menu lists its commits; pick any two versions (or the working tree) to compare.

**Clone.** **Import… → Clone a Git repository…** opens **Clone repository**: a URL or path, an optional project name (a taken name gets a free one, such as `team (2)`) and an optional **Folder in repository** (see *One folder of a repository*, below). The clone runs only from this action, shows its progress with **Cancel**, and gives up after 10 minutes. It lands in a staging folder under `data/projects/` and moves into place with the project registry in one journaled step, so a failed, cancelled or interrupted clone leaves nothing behind (an interrupted one is rolled back on the next start). Line-ending conversion is off (`core.autocrlf=false`), symbolic links arrive as plain files (`core.symlinks=false`), submodules are not fetched and `ext::` transports are refused. Files are checked as on any scan. The result lists the **Projects made** and, when a file is not a valid definition, the **Files to repair**; those files are marked in the tree and never rewritten.

**Several projects in one repository.** A team repository can hold several projects in subfolders, such as `domains/sales` and `domains/finance`. A `.semantic-workbench.json` file at the repository root declares them:

```json
{
  "schema": "semantic-workbench/repository/v1",
  "projects": [{ "path": "domains/sales", "name": "Sales" }, { "path": "domains/finance" }]
}
```

After a clone, the declared folders become projects at once. Without the file, the clone dialog offers **Choose projects…**, which proposes the folders that hold definitions (down to four levels) and can save the choice as `.semantic-workbench.json` for the team. **Projects in this repository…** in a project's ⋯ menu changes the choice later; leaving a folder out removes its project from the workspace and deletes nothing. The tree groups these projects under their repository. They share one Source Control panel, branch and history: the panel lists the whole repository's changes and names the project of each file, and a commit, pull or branch switch rescans every project of the repository. Deleting such a project offers **Remove from workspace** (the default; nothing on disk changes) or **Delete folder** (the folder moves to the trash, and the repository shows its files as deleted until you commit). When the project is the last one of its repository, only **Delete** is offered and the whole repository moves to the trash, so no repository stays on disk without a project. **Clear workspace** moves the whole repository to the trash as one entry. If the file cannot be applied (for example, it names a folder that does not exist), the clone dialog says why and the repository stays one project. Each entry requires a repository-relative `path` and accepts an optional display `name`. Unknown keys, duplicate paths and folders nested inside another declared project are refused. Paths must stay inside the repository; absolute paths, `.` or `..` segments and `.git` are refused.

**One folder of a repository.** A project can live in a subfolder of a team repository, for example `semantic/ubl`, without the rest of the repository reaching your disk. Type the folder in **Folder in repository** (Clone dialog or Remote dialog): a relative path such as `semantic/ubl`, with no `..`, no leading `/`, no backslash and no `*?[]`; a trailing slash is dropped and anything else that is not already a clean path is refused with the reason.

- **Clone.** With a folder, the clone downloads history without file contents (`--filter=blob:none --no-checkout`), limits the checkout to the folder with a cone-mode sparse checkout (`git sparse-checkout set --cone`), checks out the branch, and the folder becomes the project root. Cone mode always keeps the files at the repository root and directly inside the folder's parents on disk too, such as `README.md`; every other folder stays out. Git then fetches file contents as they are needed. If the remote branch has no such folder, the clone fails with that reason and the dialog offers **Create the folder with the first push**: the folder is made empty and the first commit and push create it on the remote.
- **A project you already have.** In the Remote dialog, a folder for a project that lives in the root of its own repository shows which files move where and waits for **Move files and save**. The files move under the folder, one commit (*Move the project into semantic/ubl*) records the move, and the checkout is limited to the folder; history is never rewritten. It waits for unsaved edits and uncommitted changes, and Git needs an identity because of the commit. If the move stops before its commit, confirming again finishes it. The first **Pull** from a team repository whose history is unrelated joins the two histories while everything the project holds is inside its folder. This works in local mode; in server mode clone the folder instead. Authorized server folder-change requests return HTTP 400 with this guidance; unreadable projects still return HTTP 404.
- **Changing the folder later.** The same dialog on a project that already lives in a folder previews the change: the new folder is checked out and the old one leaves your disk, which needs no unsaved edits, no uncommitted changes and no untracked files in the old folder. A folder the branch does not have is created by the next push.
- **Commit, push and pull.** Commits, staging and **Stage all** touch only files inside the folder; a request for a path outside it is refused. Pull and fetch work as usual and bring other folders' history without their files. Switching to a branch that lacks the folder is refused with the reason. The panel header reads, for example, `origin · main · semantic/ubl`.
- **Server mode.** The published checkout and every person's working copy are limited to the folder, each with its own sparse settings (`extensions.worktreeConfig`), so access rules and guards see project paths. The credential of a command also covers the file contents Git downloads for it, and a pull or branch switch that a guard judges downloads the contents it will read first, with the person's credential.

*Credentials and network.* The workbench never stores, asks for or sends credentials; it uses your Git configuration. Remote actions run only when you press them, never in the background. If Git needs credentials, your configured credential helper (for example Git Credential Manager) may open its own window; meanwhile the panel shows "Waiting for Git (credentials may be requested in a separate window)" with **Cancel**, and gives up after 10 minutes. Without a helper or SSH key, the action fails with Git's own message; when that message says the remote refused or asked for credentials, the panel offers the **Credential setup guide**: static instructions for a credential helper and an SSH key on Windows, macOS and Linux, with copyable commands and the name of the helper set in your Git settings (read with `git config --get credential.helper`; credentials themselves are never read).

### Supported inputs

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

### Commerce example workspace

Click **Load commerce workspace** in the sidebar. It creates the project "Commerce workspace" with eight related documents (clicking again opens the existing project):

- `commerce.odcs.yaml`: a contract for customers, orders, order lines and products, with types, primary and foreign keys, ownership and business-definition IRIs.
- `sales.ossie.yaml`: four datasets, three joins and six governed sales metrics (owner, status, breakdowns); physical sources match the contract exactly.
- `sales.mapping.yaml`: binds those metrics to the business concepts; it maps no concept to a dataset.
- `commerce-business.ossie.yaml`: eight business concepts sharing IRIs with the OWL ontology.
- `commerce.owl.ttl` and `commerce.owl`: OWL in Turtle and RDF/XML, including inverse properties and an existential restriction.
- `commerce.shacl.ttl`: required customer email, nonnegative order amount and required order lines.
- `commerce-data.ttl`: an eight-resource order-to-cash lifecycle.

The example is fictional and illustrative. **Shared references** in an entity's inspector links other documents containing its exact physical source or IRI; Ossie QName IRIs are expanded with the document `prefixes`, so `core:Party` matches `https://…/core#Party` in OWL, SHACL, RDF or ODCS business definitions. This is explicit reference matching, not inferred equivalence or a cross-document query engine.

**Load commerce scale data** adds `commerce-scale.ttl`: exactly 1,000 synthetic business resources and 5,000 explicit business links, plus type and label triples. These are customers, orders, order lines, products, shipments, invoices, payments and warehouses, not thousands of invented ontology classes. This is a navigation benchmark, not a business-rule validated dataset. Regenerate examples with `bun scripts/commerce-example.ts`.

Example files are under `public/examples/commerce/` and downloadable at `/examples/commerce/<filename>`. Earlier benchmark files and documents are retained; they are not used by the current workspace examples.

### Graph exploration

**Neighborhood** shows one center and what it is connected to. The center sits in the middle column, marked *Center*; entities that point at it are on the left (purple links), entities it points at are on the right (green links). Up to 12 neighbors are shown, ranked by relationship kind and then name; the toolbar states how many are shown and hidden and **N more neighbors** reveals the next page. The toolbar keeps the centre picker, **Show all connected**, zoom and full screen (on a phone the pierce, zoom and options controls sit behind one **Controls** button, the links to other files behind **Other files**, and 6 neighbors show at first); **View options…** opens a dialog with the rest: **Relationship** narrows the neighbors to one relationship, **Links between neighbors** shows or hides relationships among the visible neighbors (shown by default unless there are more than ten), and the switches for labels, value types, technical resources and metrics, **Re-center**, **Model overview** and **Full graph**. No two edges share a line: each link bends at its own position, long and backward links travel on their own lane above or below, and visible labels are placed apart.

Walk the model by activating a neighbor (**Walk here**, click, or keyboard): it becomes the center and the previous center stays visible, marked *Previous center*. The **Walk** trail lists every center with the relationship it was reached through; **Back** and **Forward** move along it, and any crumb jumps back. When the center is defined in another file of the project as well (a shared IRI, physical name or business definition, or an Ossie concept mapping of the same concept), **Continue in <file>** carries the walk into that file; Back returns. Concepts with metrics carry a metric badge, and **Open N metrics for <concept>** opens the Metrics list filtered to that concept.

**Pierce through.** **+** on a node (or activating a relationship line) expands it in place: its
neighbors join the same canvas beside it, nothing already placed moves, and the trail records
"expanded X"; **−** collapses what that expansion alone added (a node another expansion also reached
stays). **Undo expansion**, **Back** and **Forward** restore the exact earlier canvas; walking to a
new center starts a fresh one. **Show all connected** (the full pierce) expands everything reachable
from the selected node or the center in the chosen direction (**Outgoing**, **Incoming**, **Both**,
under **Expand**), each entity once, following the **Value types**, **Technical resources** and
**Metrics** switches (Value types shares the Graph view's setting). It stops at 150 entities:
frontier nodes show "+N hidden", a banner reads "N entities shown in K steps · M more reachable"
with **Expand further** (up to 500) and **Stop**. The closure is computed in a worker and large
additions appear over several frames, so the page stays responsive. The lineage and mapping canvases
use the same budgets, counted in cards, and offer Expand, Collapse, Show all connected (from a
column or a card, upstream, downstream or both) and Undo expansion.

Choose a center with **Find a center**, a searchable picker that ranks exact names first (also for the 1,000-entity scale model); toolbar search lists matches and the chosen one stays the center after the search is cleared. OWL models show classes only, with or without a center; **Technical resources** adds property resources, restrictions and other RDF resources on request. **Re-center** puts dragged nodes back in their columns. **Graph** opens the complete interactive model; **Overview** retains the business-area map and relationship matrix. **Full screen** (the toolbar button or the **F** key) lets Graph or Neighborhood fill the screen; the details panel then opens over the graph. **Escape** or **Exit full screen** brings back the earlier layout, zoom and selection. If the browser refuses full screen, the view fills the browser window instead. The catalog exposes all definitions. RDF literals remain in entity definitions rather than becoming nodes. Blank nodes retain their identity within each parsed document.

Graph cards hide detail lines below 1× zoom so those labels stay at least 12 px when shown.
Area titles wrap, the legend explains area colors and relationship lines, and names retain
full-name tooltips. Edge labels without room inside the layout remain available on hover.

Click nodes or relationships to inspect their source definitions. Relationship inspection includes endpoints, roles, multiplicity, verbalizations, join keys or RDF predicates. Ontology n-ary relationships expand into navigation edges referring to the same original definition. Metric edges show explicit dataset references in expressions, not observed execution lineage.

### Established complex business model: OASIS UBL 2.3

**Load UBL business model** opens a schema-derived procurement-to-payment workspace with **45 business entities and 277 named aggregate relationships**. It covers Order, Invoice, DespatchAdvice, ReceiptAdvice, CreditNote, parties, products, fulfillment, transport, taxation, banking and settlement. The example files are in `public/examples/ubl/`, including extraction provenance in `model-map.json`.

Ossie ontology and OWL share the same 45 concepts. Source role names and occurrence counts come from OASIS's published XSDs. SHACL projects those selected aggregate-role cardinalities. The ODCS and semantic artifacts model an analytical normalization with 169 datasets and 401 joins, declared in the contract as ODCS foreign keys; repeatable roles use bridge tables. These surrogate keys and relational mappings are application choices, not an official UBL relational model or official OASIS ontology. Both versioned analytical artifacts pass their official companion schemas.

Source: https://docs.oasis-open.org/ubl/UBL-2.3.html . Regenerate with `python3 scripts/extract-ubl.py` then `bun scripts/ubl-example.ts`.

Details open beside the graph or page (below it on phones), never over the graph's controls. Status messages disappear after five seconds, or as soon as you switch view, document or project. The sidebar marks **Model explorer** for every model view (it opens Graph), **Source editor** on Source and **Source control** on Source Control.

**The main screen.** The main screen holds the sidebar, the header (title and kind badge, then three clusters: file actions **New** and **Export**; the Save state indicator with **Commit…**; and the account cluster with **Admin** for people who may administer, and the person menu in server mode), the view tabs and search, the view and the details panel; everything else opens as a dialog that keeps focus inside, closes with Escape and returns focus to what opened it (a dialog opened from the phone drawer closes the drawer first, and focus then returns to the workspace button). Every header control is 36 px high (34 px on a phone). The Save state indicator shows its whole text from 1500 px; below that it shows a short form (**Saved**, or **Saved · 3 to commit**) and keeps the full text in its tooltip, so the title keeps its room. The title and the icon-only buttons carry tooltips, and on a phone **New** and **Commit…** show their names (Export keeps its icon). Below 1100 px **New**, **Export** and **Commit…** show only their icon (the names stay as accessible names and tooltips), and the person menu shows only its icon below 1200 px. On a phone (under 700 px) the header has two rows: sidebar button, title and account on top; file actions, the Save state text and **Commit…** below. **Admin** stays a header button in both modes because it opens a destination, not an account setting; the person menu holds **Connected accounts** and **Sign out**. The sidebar is 300 px wide by default and resizes from 220 to 520 px by dragging its edge or with the arrow keys, Home and End on the separator (remembered by the browser); long file and project names wrap to two lines and keep their full name as a tooltip; the project tree scrolls between the navigation and a fixed footer (**Clear workspace**, **Trash**, **Examples**, **Import…**, four buttons in one style); the tree has a thin scrollbar, a shadow at each edge with more rows and snaps to whole rows, and the open file is scrolled into view only when it is hidden; a strip that scrolls sideways (the view tabs, the graph toolbars, the Admin sections) shows a chevron beside each edge with more items, and a click moves it; from 1920 px wide, pages of text and tables (contract, mappings, catalog, metrics) share one maximum width of 1600 px and are centred; a drawer opened while the workspace loads stays open when the first file opens; **Examples** is a button above **Import…** that opens a menu upward (Enter, Space or Arrow Down opens it, the arrow keys, Home and End move, Escape closes it and returns focus, Tab leaves); the menu is as wide as the sidebar, so it stays inside the phone drawer. All menus (New, person, Examples, project and file actions) share one implementation: an opaque popup drawn above the page, never clipped by the file list, that flips up or down when there is no room. The status bar counts entities and relationships, or concept mappings for a mapping file. On desktop one header button hides and shows the sidebar; below 1100 px the sidebar is a drawer. **New** lists one **Add <kind>…** per kind (concept, dataset, dataset relationship, metric, table, concept mapping, RDF resource); kinds the open file cannot hold stay listed with the reason. The Save state indicator opens **Validation details** when the file has errors (also from the status bar), and **View definition** in the details panel shows the item's full definition as read.

Graph connections group parallel relationships; the inspector exposes each original definition. Names appear on hover or selection, with a Labels toggle for inspecting all labels. Selecting an entity lists all its relationships. Long edges route above intervening columns. The sidebar scrolls documents independently and keeps example/import controls visible. API hot reloads no longer restart the frontend; the dev launcher owns both process groups and uses a strict frontend port.

### Complete interactive graph

Collapsed area cards keep their entity count as the primary label. Smaller duplicate header
counts and relationship summaries follow the detail zoom threshold.

Small graph summaries and metric badges hide when zoom would make them smaller than
12 px. Entity names remain zoom-aware, and group headings stay opaque over relationship lines.

The **Graph** tab is a real React Flow canvas, separate from the preserved **Overview** and relationship matrix. It retains every business entity and relationship, with directed parallel-link bundles exposing original definitions. The toolbar has **Fit model**, zoom in and out, **View options…** and full screen. **View options…** offers the **Layered (ELK)** layout (the default) and **Network (fCoSE)** layout, area zoom, **Re-layout**, **Collapse areas** and **Expand all**, a **Value types** switch that hides value types and built-in concepts with their relationships (remembered per model in this browser), switches for labels, metrics and a **Map** (the mini-map, off until asked for and then remembered), and links to the Overview and Neighborhood. The canvas has compound business-area boundaries, explicit overlap cleanup, selection highlighting and manual dragging. Layered views retain ELK’s orthogonal routes between areas; moving a card switches stale routes to routing from its live handles. Fully collapsed areas use a compact packed arrangement. The initial view also uses counted areas when the actual layout is too long or tall for distinguishable names; **Expand all** still opens every entity. Phone Controls panels follow their trigger when entering or leaving full screen, and their expansion selector wraps within the panel. Neighborhood rows reserve space for full-detail cards and a visible gap.

Detailed edge routing uses React Flow Smart Edge's shared background worker. At whole-model zoom, the canvas uses inexpensive native paths; obstacle-aware routes are computed for visible or selected connections at useful detail. This avoids queueing thousands of costly routes for edges too small to inspect. The first view follows the window: when the entities would not read at 12 px on screen (about 15 entities in a 1280 px window, about 70 in a 2560 px one, always above 250), each area opens as one card with its readable entity count; click an area card, or use **Expand all** in View options, to open it. Internal links remain folded into the area card until expansion. When the canvas is zoomed out further, names and area titles grow so they stay readable and unfocused links fade.

Research and architectural choices, including React Flow, ELK, Cytoscape/fCoSE and Sigma, are recorded in [docs/graph-design.md](docs/graph-design.md).

The 1,000-entity / 5,000-relationship fixture, model preservation, cancellation back to overview, area expansion, all-node expansion, zoom, selection and worker routing are checked by `bun scripts/large-graph-browser-check.ts` (`EXPAND_ALL=1` expands every area); [browser suites](#browser-suites) lists `test:graph`.

### Input validation and repair

The browser, inspector, folder store, and HTTP save endpoint share the same validation rules. Invalid documents are rejected before any file is written. All imports in a selected batch are preflighted before saving; a batch containing errors opens **Review import**. Choose a file, inspect errors and warnings, edit the source or filename, and import when all errors are resolved. Cancel or Escape returns to the untouched open document. A batch is written all or nothing: if the API fails, nothing from the batch is imported and the repaired drafts stay in the dialog for a retry.

Invalid edits remain in **Source**, unsaved (the Save state indicator says so and opens the findings), with findings showing JSON-pointer paths and YAML/JSON line/column locations. **Validation details** exposes coverage warnings even on valid documents. **Go to line** focuses the source editor. Export continues to preserve draft bytes, including invalid drafts, so work can be recovered externally. A valid file's graph, overview, catalog, relationship inspector, and export controls retain their existing behavior.

Checks include:

- YAML/JSON syntax, duplicate mapping keys, unsupported tags, alias expansion limits, cyclic aliases, supported serializations, filenames, and a 2,000,000-byte UTF-8 input limit. N-Triples uses a strict N-Triples parser; RDF/XML is checked for XML errors before RDF parsing and rejects DTD/entity declarations.
- Official pinned ODCS 3.1.0 and Ossie semantic 0.2.0.dev0 schemas. Other versions and legacy wrappers report their structural-only coverage. Versioned Ossie ontologies and mappings use pinned official 0.2.0.dev0 schemas; unversioned ontologies retain the compatibility profile. Schema checks do not certify full semantic conformance.
- Scoped duplicate concept/dataset/field/metric/relationship names, duplicate ontology IRIs, dangling concept/parent/dataset references, inheritance cycles, declared primary keys and join fields, and composite join arity. Missing field catalogs produce a warning instead of incorrectly rejecting externally defined columns. Embedded SQL has the syntax-checking coverage described below; it is never executed.
- Inheritance uses iterative Kahn topological elimination in O(V + E), tested on 20,000-node chains and cycles. Ordinary relationship cycles, self links, multiple parents, disconnected components, and parallel links remain legal.
- Ossie ontology global identifiers: `iri` on concepts and relationships accepts a full IRI or a `prefix:local` QName whose prefix is declared in the top-level `prefixes` map; undeclared prefixes and duplicate expanded concept IRIs are rejected. `uri` is not an Ossie field: versioned ontologies report it with a rename-to-`iri` hint, and unversioned ones warn that it is ignored.
- RDF syntax; selected OWL restriction checks (property, qualifier, cardinality, hasSelf); selected SHACL definition checks (property paths including sequences/alternatives/inverses, cycles in path expressions, count/length bounds, typed flags and IRI parameters). External class/property IRIs are allowed and never fetched.

**SQL inside definitions.** SQL embedded in YAML and JSON is colored as SQL in the Source editor and checked with the shared rules, in the browser and in the API's file findings alike: Ossie field and metric `expression.dialects[].expression` (flat, legacy `semantic_model` list and models embedded in `ontology_mappings`), Ossie object, referent and link mapping expressions, ODCS quality rules with `type: sql` (`query`) and ODCS `transformLogic`. The dialect comes from the sibling `dialect` (ANSI and `OSSIE_SQL_2026` use the PostgreSQL grammar, accepting what the SQLite grammar accepts, as the planner does; Snowflake, BigQuery, Databricks via the Hive grammar) or from the contract's first `servers[].type`; `${name}` placeholders are allowed. Non-SQL dialects (DAX, MDX, MAQL, Tableau, Sigma, ThoughtSpot, Holistics AQL) stay plain with a "not checked" note. A syntax error is a **warning** at the exact file line and column, mapped through block, folded, plain and quoted scalars, indentation and escapes; warnings never block saving or autosave, and checking never changes a byte. Item editor expression fields and the metric wizard's expression are SQL fields with the same colors and warnings, and SQL previews are colored.

These are input and supported-definition validators. They do not certify full OWL profile conformance or logical satisfiability, execute SQL, fetch imports, or apply SHACL shapes to a separate data graph. SHACL advanced/SPARQL constraints are preserved but not evaluated. Full standards reasoning needs a separate engine.

`tests/validation.test.ts` holds malformed and positive cases for every supported input family and revalidates all shipped examples. `tests/route-security.test.ts` covers symbolic links, host names, branch names, Git remote helpers and credential redaction, and `tests/api-validation.test.ts` and `tests/files-api.test.ts` exercise the HTTP handler against a temporary data root.

Standards references: [ODCS schema](https://github.com/bitol-io/open-data-contract-standard/blob/main/schema/odcs-json-schema-v3.1.0.json), [Ossie semantic specification](https://github.com/apache/ossie/blob/main/core-spec/spec.md), [W3C SHACL](https://www.w3.org/TR/shacl/).

### Editing one item

Short metric wizards stay centered at their content height. Disabled buttons retain readable
labels and use a dashed border to distinguish them from enabled actions. Catalog cards explicitly
label their **View details** action. Tab strips hide clipped neighboring labels until scrolling
reveals the complete control; keyboard focus still scrolls each control into view.

New-item forms name the inputs needed before saving. Delete confirmations list only files under
the file count and describe the project history separately. Query composition explains how to
add bindings when none are available. The mapping filter includes all concepts.

ODCS section dialogs centre on the viewport, and Relationships uses the same readable width
as the other table sections. Catalog names stay on one line; hover a shortened name to read it in full. Phone item forms
stack their fields in one column. Dialog hints occupy a full footer row above the actions.
The wizard marks the current step with a filled row and keeps pending steps plain.

**ODCS contracts.** An open data contract gets a **Contract** tab: the contract's identity and status in a small grid (long purpose and limitations are clamped, with **Read more**), one button per section the contract declares (servers, team and roles, service levels, quality, support, pricing, custom properties; each shows a count and opens the section in a dialog, and sections the contract does not have are not drawn), and a searchable list of its tables: name and physical name, type badge (only for a view or other unusual type), property count, key chips and a one-line description (169 UBL objects filter as you type; descriptions wrap in full, and the contract id is a one-line monospace chip with a **Copy** button). On a phone the list becomes cards. **Open** an object for its dataset page, in the style of Marquez: a header card with type, property and rule counts, the last commit that changed the object, tags and an **Open in lineage** button, then five tabs in one scrolling row with cues for hidden tabs on a phone (it opens on **Properties**); on a phone **Open in lineage** sits on its own row under the title.

- **Lineage**: the column-level lineage canvas (below) centred on the object, and a table listing, per property, the fields and metrics that read it.
- **Relationships**: the object's foreign keys, both the ones it declares (references) and the ones that point at it (referenced by), each as one sentence such as `orders.customer_id references customers.id` (child column, then the column it references) and a link to the other table. One legend above the table explains the two direction chips. The Properties tab shows the same sentence as the tooltip of a foreign-key chip.
- **Properties**: every property (nested ones as `parent.child`) as a read-only row: name, logical type with the physical type under it, Required, Unique and Primary key badges, classification, description and tags, and foreign keys that open their target. Columns that no property fills are not drawn, and on a phone each property is a card. Filter by any attribute and **Sort by** any of them. **Edit** on a row opens a dialog titled with the table and the property (`Edit orders.status`) with logical type, the three flags, classification and description: only the changed values change in the file (YAML or JSON), the result is checked against the pinned ODCS 3.1.0 schema before it is saved, and the save carries the file's base hash. Only a Steward or Admin changes a classification (the field is disabled with the reason for anyone else), and properties at or above the protected level have no **Edit** for others.
- **History**: the file's committed versions (contract version, date, author, message, the object's property count) and, between any two of them, the properties added, removed and changed with each attribute's old and new value, types included.
- **Data Quality**: the rules on the object and its properties with dimension, severity, type, metric and threshold, as declared. The workbench does not run them. A table with no rules shows an empty state that says how to declare them in the contract.

**Column-level lineage.** For a contract, the **Graph** tab is a lineage canvas: one card per asset (tables, semantic datasets, metrics, references to other contracts) with the columns that matter and their badges (PK, FK, Required, Unique, classification), and lines from column to column, left to right: foreign keys from the referenced column to the referencing one, declared transforms, fields that read a column, metrics over those fields and metrics over metrics. Lines use the same styles and legend everywhere. Select a column to emphasise its whole upstream and downstream path (everything else dims) and see it listed in order in **Selected path** (a panel beside the canvas; below 1100 px a **Selected path** button in the walk row opens it as a dialog); **Find assets** finds any object, column, dataset, field or metric and walks there. **+** on a card shows its other neighbours, **Walk here** re-centres with a Back/Forward trail, a wide table shows its keys, the columns with a line in the view and the columns on the selected path or matching the search, then one line **+ N more columns** that opens the card in place into one scrolling list (a filter box above 30 columns, **Show fewer** to close it; a line to a row scrolled out of view ends on the list edge with a marker), and **View options…** hides metrics or references to other contracts. The first view opens the centre and the nearest cards that fit whole at a readable size; the rest wait behind **N of M cards shown · Show all** (and **Fit** shows them all); the gap between columns is wide enough for a foreign-key label, so on a narrow window fewer cards fit whole. On a phone the pierce, options and zoom controls sit behind one **Controls** button. Foreign keys carry labels that read as sentences, `orders.customer_id → customers.id` (child column, then the column it references); a bundle of many lines carries its count once, and a label without room appears when you hover its line. The **Hops** row above the canvas chooses how many foreign keys to follow from the centre (1 to 5, a hop is one foreign key in either direction), names the path of tables it reaches (`orders → customers, order_lines`) with a hop badge, and **Foreign keys (n)** lists every key of the view by hop. The legend explains the card kinds, the PK and FK badges, the line styles and, where a line stands for several, its number. Lines are matched by declared names (a dataset's `source` is an object's physical name or name; a field's expression names a column): this is the workbench's reading, not part of ODCS or Ossie, and nothing is executed. **Open in lineage** on the contract overview and asset pages opens the canvas on that object.

Select an entity, relationship or metric anywhere (graph, neighborhood, overview, catalog, Metrics) and press **Edit** in the details panel (or the **E** key; catalog cards and the metric detail have their own **Edit**). A drawer opens on the right with only that item, its **Delete…**, **Cancel** and **Save to file** buttons pinned below one scrolling form (adding a concept, item or resource opens a centred dialog with the same pinned buttons instead): **Fields** shows its attributes as a form (a concept's name, type, description, parents and IRI; a relationship's related concept, role, multiplicity and reading; a dataset, field or join; an ODCS table, property or foreign key; a metric's expression and its attributes), and **Source** shows the item's own lines in the source editor, with highlighting and inline findings. Child lists (a concept's relationships, a dataset's fields, a table's properties and foreign keys) open their own editors. The whole file is validated as you edit; **Save to file** stays off while there are errors and writes the change in place with the usual base-hash check. Only the edited values change: comments, anchors, key order, quoting, indentation and line endings elsewhere keep their bytes, and JSON files are never re-serialized. **Open in Source** jumps to the item's line.

**New** (header) inserts a new item of the chosen kind in the open file, and **Add relationship** / **Add property** (details panel) a relationship or property, through a form with the fields the format needs and a preview of the text that will be inserted, written in the file's own style (indentation, list style, flow lists where the file uses them). **Delete** lists what depends on the item (relationships and parent lists that name a concept, joins and metrics that read a dataset, foreign keys to a table, metrics that use a metric and its binding line, mappings in other files of the project) and removes them with it in one journaled save, or Cancel; references that cannot be removed safely (expressions in mappings) are listed to fix in Source. Renaming an item lists every other place in the project that still names it; each one is rewritten only if ticked. Nothing is written until **Save to file** or **Delete**; Git keeps the previous version.

**RDF, OWL and SHACL resources** (Turtle, N-Triples, N3, RDF/XML) open in the same editor from the catalog, the inspector, a relationship or **E**: the resource's statements as predicate–object rows (objects in Turtle syntax, such as `"text"@en`, `c:Order` or `[ a owl:Restriction ; … ]`), plus a Source tab with only its statements. **Add** offers an OWL class, object or datatype property, SHACL node or property shape, or any resource. Every change is parsed back before **Save to file** is offered: the file's graph must be the original minus the removed plus the added statements, otherwise it is refused with the reason (a Source edit that touches another resource, for example). What stays byte-identical, per serialization:

| Serialization | An edit rewrites | Edited in Source only |
| --- | --- | --- |
| N-Triples | the changed lines; new lines follow the resource's last line | — |
| Turtle | the changed predicate–object pairs inside the resource's statement block; new ones follow its layout | statements the editor cannot split |
| N3 | as Turtle | resources used in formulae or rules (the editor offers **Open line N in Source**) |
| RDF/XML | the changed property elements inside the node element, which stays in place | `parseType="Collection"`, reification, `rdf:li`, resources described in nested elements; the element name (type) is shown locked |

Removing a statement that has a comment next to it asks for confirmation. **Delete** removes the resource's statements and the statements in the same file that name it (listed first); other project files that still name it are listed to fix in Source.

### Metrics

Phone metric cards use inline field labels and type/status chips. The split view keeps the unit
visible so values retain their meaning. Source Control labels commits to push and pull.

The **Metrics** tab lists every metric of the open file's project: label, type, unit, status, owner and the ontology concept it measures, with search and one **Filters** button (a badge counts the settings in use; **Clear filters** keeps the grouping) that opens a dialog with grouping (owner, type, status, concept, file), type, status and owner filters; a column with no value in any metric (unit, status, owner, concept) is not drawn. **Governed only** keeps the metrics that carry workbench attributes; the detail of a metric without them (type and additivity are then read from its expression) offers **Add attributes**, which opens the metric wizard prefilled from it and saves only its attributes, leaving its name and expression as written. Selecting a metric opens its detail beside the list (in place of it on narrow screens):

- **What it is**: description, type and additivity (declared, or read from the expression and marked *inferred*), status, unit, owner, the concept it measures and the entity it is about, its target, and any findings.
- **How this metric is calculated**: the formula in words (for example *Occupied GLA ÷ Total GLA*) above the governed expression; the composition tree from the metric through numerator, denominator or inputs down to dataset fields; the rules that govern it (time dimension and grains, breakdowns, filters, additivity, division by zero, missing values), a section that opens on demand; and a SQL preview, also opened on demand, from the governed planner, labelled **Preview · not executed**. Choosing a grain, breakdowns or *Sum the metric values* updates the preview, or refuses it with a reason when additivity or the declared grains forbid it: summing a ratio, or summing a month-end stock over a quarter.
- **Where the data comes from**: each input metric, the fields it reads, the dataset and its physical source, and the ODCS table and properties that source is contracted as (matched by exact physical name), with the contract's declared quality rules and service levels. The workbench shows these declarations; it does not run them.

The workbench never executes queries: the explanation and the SQL preview are computed from the definitions. Both official Ossie layouts are read: split files, and the consolidated file whose `ontology_mappings` embed the semantic model (deprecated upstream; labelled *consolidated* in the sidebar and the metric detail). Other single-file mixes are rejected with a message naming the two layouts.

The interface uses **Metric** for both ordinary and governed metrics. Stored metric-to-concept bindings keep the historical key `kpi_bindings`; imports and exports preserve that key.

Metric attributes are stored in the Ossie files themselves, so they travel with the model and diff cleanly: each metric carries a `custom_extensions` entry with `vendor_name: SEMANTIC_WORKBENCH` whose `data` is JSON validated against [schemas/semantic-workbench-metric-v1.json](schemas/semantic-workbench-metric-v1.json); the metric-to-concept bindings (`measures`, optional `of`) are one line per metric in the root extension of the standalone mapping document (or of the embedded semantic model in a consolidated file), validated against [schemas/semantic-workbench-mapping-v1.json](schemas/semantic-workbench-mapping-v1.json). Errors in these blocks are reported at the exact line and column. Without extensions, type and additivity are inferred, and concept mappings whose expression is a metric name are shown as evidence. The graph shows metric nodes (with a *Metrics shown/hidden* toggle) and a metric badge on concepts that metrics measure or describe, also in the catalog. Every shipped example declares this for its metrics (see [Metrics in the examples](#metrics-in-the-examples)).

**New metric** (Metrics) opens a wizard in eight steps, shown below 1200 px as one line (*Step 3 of
8*) with a progress bar and a menu naming the current step and the steps already reached, and from
1200 px as a list of the steps that marks completed, current and pending ones, with **Back** and
**Next** in the footer and long names wrapping: the concept it measures and the entity it is about;
the semantic model; type and inputs (a simple aggregation of a field, a ratio of two metrics with a
`NULLIF` guard, or a derived, cumulative or filtered metric over named metrics), label, name and
additivity; time dimension, grains and breakdowns; target and thresholds; owner, steward, status,
unit and format; the explanation and SQL preview of the new metric (computed, not executed); and the
exact lines each file will gain. **Save to file** writes the metric (its formula only as the Ossie
expression) with its extension into the semantic model and one binding line, in sorted position,
into the project's mapping document, in one journaled save; a project without a mapping document
gets a minimal one (`concept_mappings: []`), and a consolidated file keeps the binding in its
embedded semantic model. **Edit metric** follows the status rules: draft → proposed → approved →
deprecated; changing the definition of an approved metric returns it to proposed; deprecation needs
`replaced_by` or `deprecation_reason`; the metrics and bindings that use the metric are listed
before saving.

API: `GET /api/projects/:slug/metrics` (every metric, each with `governed`), `POST /api/projects/:slug/metrics` (and `…/metrics/preview`; `existing: true` adds attributes to a metric already in the model; the v0.2.0 `…/kpis` paths remain as aliases), `POST /api/projects/:slug/save-batch` and `GET /api/projects/:slug/files/*path/explain/:metric?grain=&dimension=&rollup=sum` ([contract](specs/001-workbench-improvements/contracts/http-api.md)).

### Metrics in the examples

Opening any example from **Examples** in the sidebar shows its governed metrics in the **Metrics** tab. Each example has a simple metric (a `SUM` or `COUNT` over one table), a ratio or derived metric built on other metrics, and metrics that can be broken down by a field of another table, so the SQL preview lists the foreign-key joins it walks. Every metric has an owner and a status, is bound to an ontology concept, and reads columns that the example's ODCS contract declares, so the breakdown, the lineage and the SQL preview all have content. Nothing is executed.

| Example | Metrics | Defined in | Bound in | Contract |
| --- | ---: | --- | --- | --- |
| UBL business model | 9 | `ubl.semantic.yaml` | `ubl.semantic-mapping.yaml` | `ubl.odcs.yaml` |
| Commerce workspace | 6 | `sales.ossie.yaml` | `sales.mapping.yaml` | `commerce.odcs.yaml` |
| Mapped commerce | 4 | `commerce.mapped-semantic.yaml` | `commerce.mapping.yaml` | `commerce.odcs.yaml` |
| Ossie Flights | 7 | `flights.metrics.semantic.yaml` | `flights.metrics.mapping.yaml` | `flights.odcs.yaml` |
| Subscription billing | 8 | `billing.semantic.yaml` | `billing.mapping.yaml` | `billing.odcs.yaml` |
| Shopping center administration | 25 | `mall.semantic.yaml` | `mall.mapping.yaml` | `mall.odcs.yaml` |

The metrics follow the storage rules above: definitions in the semantic model with a `SEMANTIC_WORKBENCH` extension, bindings in the root extension of a mapping. The files of the official Apache Ossie Flights example stay byte-identical to the pinned upstream copies, so Flights keeps its metrics, its binding and its contract in three separate files that start with `# Workbench addition`. The same label marks every other file added only to carry bindings or a contract: `sales.mapping.yaml`, `ubl.semantic-mapping.yaml` and `billing.odcs.yaml`. `bun run test:examples` checks the counts, that every file validates with no finding beyond the documented coverage notes, that every metric explains itself and reaches a contract column, and that the upstream hashes are unchanged.

### Ontology mappings and agent tools

**Load mapped commerce** demonstrates separate ontology, semantic model, and mapping documents. The
**Mappings** tab resolves object/referent/link mappings, displays source evidence and physical
sources, exposes governed metrics and AI metadata, exports agent context, and, in the **Compose a
query…** dialog, composes a new revenue-by-region SQL preview from selected building blocks (shown,
never run); the dialog groups the mapped fields by dataset and has a **Find a field** box. The page
opens with one summary line of the four layers and a concept list in the page scroll, without a
nested scrolling region. Missing or ambiguous document/field/concept references are reported. A
mapping with no bindings summarises its unbound concepts in one row; search still finds individual
concepts. Its empty state and query composer offer **Open Source** for the selected mapping
document. Empty dataset quality checks also offer **Open Source tab**.

Each binding reads as a chain of labelled steps: concept, relationship path, field or metric, dataset and physical source, with its condition and its findings attached. Bindings are grouped by dataset (a view choice; groups collapse and show their counts). A finding offers **Edit item**, which opens the item editor on the offending mapping item, or Source at its line when the item has no form. Concepts and bindings sit side by side; below 760 px they stack. Long names wrap at `.` and `_`, each arrow stays with the step it leads to, and counts read `1 binding` or `N bindings`.

**Mapping graph.** For a mapping document, the **Graph** tab draws the mapping itself, from the same resolver: ontology concepts on the left (rows: their relationships), semantic datasets with their fields on the right, and metric cards. An object mapping is a line from the concept to the dataset, with the fields that identify it badged **Identifying**; a referent mapping runs from the concept's relationship row to the field; a link mapping runs from the relationship row to the related concept, labelled with the relationship, and selecting it lights up the join fields it passes through (for example `orders.customer_id → customers.customer_id`); metric bindings link the concept a metric *measures* (solid) and the concept it is *of* (dashed). Select a concept, row or field to emphasise its mappings and list its bindings, each with **Edit item**. Concepts and fields nothing maps carry an **Unmapped** badge, and **Unmapped only** shows just those; resolver findings appear as warning markers on the card they concern, with the message and **Edit item**. Find assets, Lineage options…, Expand, walking and full screen work as on the lineage canvas. A consolidated file (embedded `ontology_mappings`, such as Flights' `flights.yaml`) switches between **Mapping graph** and **Ontology graph**.

Overview, Catalog, Source, import repair and byte-exact source export remain available.

Standalone mapping documents and deprecated embedded `ontology_mappings` are supported using pinned Apache schemas. Agent clients can call `/api/agent/catalog`, `/api/agent/context`, and `/api/agent/plan`. The runtime supplies explicit mapping traversal and immutable metric definitions; callers supply language interpretation and any external query execution. No hosted LLM is required or called. See [agent runtime and integration protocol](docs/agent-runtime.md) for examples, supported composition, graph integrity checks, and limits.

### Reproducible example execution

The generated [subscription billing example](public/examples/billing/README.md) has 36 business entities, 46 joins, 119 mapping bindings, eight governed metrics, a data contract for the tables they read and an executable synthetic SQL fixture. It verifies revenue, recurring revenue, distinct invoice counts, dependent ratios, discounts, tax, gross billings, computed fields and missing-dimension fact preservation.

```sh
bun run examples:generate
bun run test:examples
```

All five [official Apache Ossie examples](tests/fixtures/ossie-mapping/README.md) are pinned and hash-checked without modifications. Use **Load Ossie Flights** in the workspace sidebar to open the official ontology graph and load its semantic model plus standalone and embedded mappings. Both mapping forms resolve and are tested through the UI. The example also holds three files added by the workbench: governed metrics, their concept bindings and a data contract. TPC-DS imports with a warning for an unexposed physical primary-key column; window expressions remain preserved rather than being executed by the current planner. [Verification results and SQL](docs/example-verification.json) record 24 actual synthetic-fixture SQL executions and the metrics of every example.

### Grouping and validation navigation

**Group by → IRI namespaces** places each definition in the namespace of its IRI, labelled with the declared prefix of the longest matching namespace (Ossie `prefixes`, or the RDF document's prefixes). Definitions without an IRI are listed under **No IRI**.

The graph, the overview and a contract's lineage canvas share a **Group by** selector: **Declared domains**, **IRI namespaces**, **Suggested communities**, **Definition types**, and **UBL example areas**. Suggested communities come from a deterministic, bounded modularity pass over each document's own structure: relationships between ontology concepts, foreign keys between tables, joins and metric references in semantic models, and links between mapped concepts in mapping documents. Inheritance, direction, duplicate links and primitive hubs do not influence them, and shared values stay separate. A mode that finds fewer than two real groups in the file is shown disabled with its reason (for example "No IRIs declared", or "Only the contract-level domain is declared" for an ODCS contract). **Automatic** takes the first enabled mode in the order declared domains, example areas, namespaces, communities, types, and its tooltip always names that choice. The UBL example areas are offered when at least 80% of the entities carry a curated UBL name, whatever the model is called. Lineage cards of the open contract's objects are tinted with their group colour, and Neighborhood nodes carry it as a coloured edge. The ⓘ button explains the basis and opens **Adjust grouping…**, a dialog that moves an entity to another or a new group; corrections are saved as view settings in `data/state/views/`. Original definitions and exports are unchanged.

Source and import-repair editors share one editor (CodeMirror 6). When a document opens (mount or a
different document ID), YAML files above 500,000 characters use viewport-only SQL and extension-JSON
colouring with indentation folding to keep typing fast. Typing and external replacements of the same
document keep that mode. The status bar names the first finding of the file (for example **Line 6: …**, click to go there) so the triangle in the gutter has a visible message. The status bar shows a **Large file mode** badge and offers **Full parsing**;
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
against the version it started from.

### Shopping center administration example

**Load shopping center administration** opens a reference model for retail real-estate administration: 145 entity types in eleven namespaced modules (core, asset, party, lease, legal, hr, proc, ops, fin, perf, kpi), 259 declared joins, 1,057 mapping bindings and 25 governed metrics, including occupancy rate, minimum rent per m², delinquency rate, sales per m², occupancy cost ratio, footfall, net operating income, payroll cost, headcount, purchase spend and payables outstanding. Leasing, operations, legal, HR, procurement and finance share one contract register and one party model. The same specification produces Ossie, OWL, SHACL, ODCS and RDF instance data, plus a synthetic SQLite fixture whose metric results are checked against independently computed values. See [the example README](public/examples/mall/README.md). Regenerate with `bun scripts/mall-example.ts`.

## Server mode

Server mode is for the team that deploys a shared workbench. People sign in with the
organisation's account, an Admin grants each person a role on some domains or projects, everyone
who may edit works in their own Git working copy, and a Steward publishes. The server decides
every request; the screens only explain what the server will refuse.

Setting it up on Azure is the job of [deploy/README.md](deploy/README.md); the owner's acceptance
run is [deploy/trial-runbook.md](deploy/trial-runbook.md).

### Start it

Build the frontend, then start the server with the settings below. Register
`<SW_PUBLIC_URL>/auth/callback` as a redirect URI and `<SW_PUBLIC_URL>/auth/signed-out` as a
post-logout redirect URI at the provider.

```sh
bun run build

export SW_MODE=server
export SW_HOST=0.0.0.0
export SW_PUBLIC_URL=https://workbench.example.org
export SW_OIDC_PROVIDER=entra
export SW_OIDC_ISSUER=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0
export SW_ENTRA_TENANT_ID=YOUR-TENANT-ID
export SW_OIDC_CLIENT_ID=YOUR-CLIENT-ID
export SW_OIDC_CLIENT_SECRET=YOUR-SECRET
export SW_SESSION_KEY="$(openssl rand -base64 32)"
export SW_BOOTSTRAP_ADMINS=admin@example.org
export DATA_DIR=/path/to/workbench
bun server/index.ts
```

Start-up refuses to run, naming each variable at fault, when a required one is missing or invalid.
It also needs successful issuer discovery and valid access policies. After it acquires the
single-instance lease it creates the administration repository if there is none. Server mode
always serves `dist/` and applies a content security policy and security headers, including HSTS
for HTTPS.

### Configuration

The [configuration contract](specs/003-authn-authz/contracts/configuration.md) is the one list of
variables, with defaults, the mode each applies to and what start-up checks. In short:

- **Always required in server mode:** `SW_MODE=server`, `SW_PUBLIC_URL`, `SW_OIDC_ISSUER`,
  `SW_OIDC_CLIENT_ID`, one client credential, `SW_SESSION_KEY` and `SW_BOOTSTRAP_ADMINS`.
- **Client credential, exactly one:** a certificate pair
  (`SW_OIDC_CLIENT_CERTIFICATE_KEY` with `SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT`, Entra only and
  preferred), `SW_OIDC_CLIENT_SECRET`, or `SW_OIDC_CLIENT_ASSERTION` (`managed-identity` on
  Azure, a private-key file for Keycloak and generic providers).
- **Provider:** `SW_OIDC_PROVIDER` is `entra`, `keycloak` or `generic` (the default). It picks
  the claim mapping and the sign-in library: MSAL for Entra, `openid-client` for the others.
  Entra also needs `SW_ENTRA_TENANT_ID`.
- **Optional features:** `SW_API_AUDIENCE` (agent clients), `SW_GITHUB_*` (Connect GitHub),
  `SW_ADO_OBO` (Azure DevOps), `SW_GROUP_OVERAGE` and `SW_GRAPH_URL` (large group lists),
  `SW_TRUSTED_PROXY_HOPS` (behind a reverse proxy). Session lifetimes are set in
  `admin/settings.json`.
- **Logging and telemetry:** `SW_LOG_LEVEL`, `APPLICATIONINSIGHTS_CONNECTION_STRING`,
  `SW_TRACE_SAMPLE_RATIO` and `SW_TELEMETRY_ACTOR_SALT`, described in
  [Logging and telemetry](#logging-and-telemetry).
- `.env.server.example` is the Keycloak development profile and never a production template.

Keep the same session key across restarts and supply production secrets through the
deployment's secret store. Changing `SW_SESSION_KEY` ends every session and in-flight sign-in:
the server still starts, deletes each session file it can no longer read (logging
`session-unreadable`) and people sign in again. A loopback HTTP public URL is for development
only: cookies then drop `Secure` and the `__Host-` prefix. A non-loopback HTTP public URL is
always refused, and an HTTP issuer is allowed only when both issuer and public URL are loopback.

### Sign-in, sessions and sign-out

There is no workbench sign-in screen. A page request redirects straight to the provider and
returns to the requested path. An anonymous API call answers 401.

- **No access.** A person without a grant, including a deactivated person, sees **No access**:
  their name and verified address or username, the sentence "An Admin must grant you access to
  this workbench" and a sign-out form that needs no JavaScript. Every workspace API answers 403
  to them, including `GET /api/me`.
- **Signed out** stays signed out until **Sign in again** is selected. A **sign-in error** page
  names a safe failure reason and offers **Try again**. It answers 400 for an expired, replayed or
  invalid attempt, an invalid token or a tenant mismatch, and 503 when the provider cannot be
  reached.
  These pages are a centred card with the workbench logo and load only their stylesheet.
- Frontend assets need the same access as the workspace. Health probes and the minimal
  authentication pages are public.
- **Cookies.** Sessions use opaque 256-bit identifiers in `__Host-sw-session`
  (`Secure; HttpOnly; SameSite=Lax; Path=/`). Tokens stay on the server, encrypted with AES-256-GCM
  in `state/sessions/<sha256(id)>.json`, and survive restarts. HKDF-SHA256 derives separate
  session-encryption, attempt-signing and provider-index keys from `SW_SESSION_KEY`.
- **Lifetime.** Eight hours idle or 24 hours absolute by default; `admin/settings.json` sets
  `session.idleHours` and `session.absoluteHours` and an invalid value refuses start-up. The
  stored last-seen time is written at most once a minute, so a restart can shorten the idle time
  by up to 60 seconds.
- **Refresh** re-reads the person's identity and groups and re-matches grants. A refresh the
  provider refuses ends the session; an unreachable provider answers 503 and keeps it.
- **Sign-in attempts** use a signed ten-minute `__Host-sw-auth` cookie. A persistent ledger stops a
  consumed attempt from being used again after a restart, and expired entries are deleted once a
  minute.
- **Sign-out.** Sign-out, expiry and an Admin ending a session close the person's live-update
  stream with an `access` event. Sign-out sends Entra's `login_hint` back as `logout_hint`, so
  Entra does not ask which account. When the person signs out of another application, the
  provider calls `GET /auth/front-channel-logout?sid=<provider session>[&iss=<issuer>]` without a
  cookie. The workbench ends the sessions that provider session started (audit reason
  `provider-signed-out`) unless `iss` names another issuer, and always answers an empty 200.
  Anyone who knows a `sid` can end that session; the provider keeps it private.
- **Requests that change something** need `X-SW-Request: 1` and an `Origin` equal to the public
  origin. The No access sign-out form uses a per-session CSRF token instead.

### How access is granted

Roles come only from grants in the Admin panel. Provider app roles are never read, and nothing in
a token grants access by itself. A grant gives a built-in or custom role to a group (by object ID)
or to a verified e-mail address, for the whole workspace, some domains or some projects. The
first Admin is a bootstrap Admin from `SW_BOOTSTRAP_ADMINS`; after that, Admins grant everyone
else from [the Admin panel](#the-admin-panel).

- **Groups.** The groups claim (`SW_GROUP_CLAIM`, default `groups`) carries group IDs for Entra
  and names or paths for Keycloak. When a person belongs to more groups than a token holds, Entra
  marks an overage and the server asks Microsoft Graph which of the granted groups the person is
  in (`SW_GROUP_OVERAGE=directory`, the default; `off` disables it). Only group IDs named in
  grants and restricted paths are checked, in batches of at most 20. A failed lookup supplies no
  membership, shows an explanatory message and is audited.
- **E-mail addresses.** An e-mail grant trusts the identity provider's administration of
  addresses. For Entra the address is a domain-verified e-mail claim (`xms_edov`), or the user
  principal name of a member of the home directory; a guest's `#EXT#` name and the editable user
  name of a user from another directory never count. Keycloak and generic providers need
  `email_verified=true`. Matching ignores letter case, and addresses are stored in lower case.
- **Custom roles** are built in the Admin panel from the server's list of actions and optional
  conditions, and use the same server-reported capabilities as the built-in roles.

### Roles

| Role | What it can do within its scope |
| --- | --- |
| Viewer | Read definitions, history and its own view settings and export a project as a zip; cannot save files or drafts |
| Editor | Viewer actions plus edit, import, move and delete files, save drafts and use project Git |
| Steward | Editor actions plus guarded changes, approval, publishing, project creation and renaming |
| Admin | All projects, administration, purge, clear, remotes, clone and registration |

A move needs permission at both ends. A hidden target answers 404; a readable target without
write permission answers 403. Disabled controls say which role they need. The server checks
crafted requests independently of the screens. The Git identity and credential-helper settings do
not exist in server mode.

### What readers see

Project lists, search, graphs, metrics, document exports and agent context use only files the
reader may read. A hidden project has no name or count in the workspace. A readable project with
restricted paths shows "N files you cannot open"; links in visible files whose target is hidden
stay unresolved. A direct request for an unreadable file or its Git history answers 404. Git
history counts commits that touch only hidden paths without exposing their messages. A message on
a visible commit can still mention a confidential name, so keep secrets out of commit messages.

A request that spells an existing file or folder in another letter case, or a new name that
differs from a sibling only in case, answers 404: the Azure Files SMB share ignores case and
would otherwise open `FINANCE/plan.yaml` as `finance/plan.yaml`, past a rule for `finance/**`.

Drafts, grouping state and dismissed suggestions belong to the signed-in person. A draft is kept
only for a file the person has and holds at most about 4 MB; each person keeps at most 200 drafts
per project and 1,000 in all. Trash entries need readable original paths, and restoring your own
or another person's entries needs the matching permission. Live events and their reconnect replay
are filtered for each reader. An administration change reloads the open tabs of the people it
affects; in local mode an access change reloads every open tab. Non-Admins receive only
readiness, mode and Git availability from `/api/status`.


### Your own working copy

Everyone who may edit a project works in their own Git working copy of its repository, under
`DATA_DIR/worktrees/<key>/<repo>/`. The copy is made with the person's first change there (a
save, import, move, delete or Source Control action), on a personal branch `work/<handle>` (for
example `work/alice`) taken from the default branch. Until then they read the published state.
Viewers, and anyone who cannot edit a project, always read the published state: the default
branch as `DATA_DIR/projects/<repo>/` holds it, nobody edits that folder and it stays detached at
the tip of the default branch.

Branch, staged and uncommitted changes, drafts, view settings, grouping corrections and grouping
suggestions are per person. One person's save, stage, commit, branch switch or pull never changes
another person's files. Grouping suggestions come from each Editor's own copy, so an unpublished
change suggests a grouping to its author only.

Each Source Control action has one meaning in server mode. Pull, Publish and Push of the default branch are in the **Sync…** dialog, and **Publish to <default>** asks for confirmation first:

| Action | Who | What it does |
| --- | --- | --- |
| **Commit** | Editors and above | Commits in your copy. The author is the signed-in person (name and e-mail from the provider), the committer is the workbench and a `Signed-in-user: <id>` trailer names the person |
| **Branch** | Editors and above | Lists every branch except other people's `work/<handle>` branches, which cannot be checked out even while no copy holds them. Another copy's branch shows "in use by <name>" and cannot be chosen. The default branch belongs to the published state. A protected branch can be checked out only by someone who may publish to it |
| **Pull from <default>** | Editors and above | Merges the default branch into your branch. Local, uses no credential, and is refused while you have unsaved or uncommitted changes, like any pull. The content guards judge the exact commit it merges |
| **Publish to <default>** | Stewards of the project's domain, Admins | Fast-forwards the default branch to your branch with a compare-and-swap and refreshes the published state for every reader. Someone published meanwhile: refused with "Pull from <default> first". Without a copy there is nothing to publish (409). The guards judge the published commits as the publisher's own changes, so an approval made in a copy reaches the default branch only through someone allowed to make it |
| **Fetch**, **Pull**, **Sync**, **Push** | Editors and above | Run in your own copy with your own remote credential. On your `work/<handle>` branch, which has no upstream, Pull takes the remote's default branch ("Pull origin/main into work/alice"); other branches pull their upstream. **Push** sends your branch |
| **Push <default>** | Stewards, Admins | Sends the default branch, as published here, to the remote with your credential. The API needs no copy; the panel shows the button once you have one. Publishing never pushes by itself |

A **Fetch** that finds the remote's default branch ahead of the local one moves the local default
branch and the published state forward, with the same compare-and-swap as a publish. It does that
only when the person fetching may publish and the content guards accept what the remote brings.
Otherwise the fetch still succeeds and the panel says "main is behind origin; someone with
publish must bring it in". When the two have diverged, nothing moves.

Other things to know:

- Every write into a copy is guarded like a write anywhere else. A person's first write is judged
  against the published state before their copy is made, so a refused write leaves no copy.
- Saving a repository's project folders as a manifest (Admins) writes and commits the manifest in
  the Admin's copy; it reaches the published state when they publish.
- A copy unused for 30 minutes stops being watched. Its files, index and drafts stay and the next
  use rescans it.
- A file deleted or reverted in a copy goes to the trash as that person's entry. Nobody else lists
  or restores it, and it goes back into the same copy.
- Deleting a project or clearing the workspace lists each person's unpublished work in the
  confirmation (to those who may delete the project) and keeps it in the trash entry as a binary
  patch per person (`unpublished/<key>.patch`) together with their drafts. Deleting a subproject
  does the same for its folder.
- If the server stops between moving the default branch and updating the published files, the next
  start finishes the update.
- A repository without any commit gets copies through `git worktree add --orphan`, which needs
  Git 2.42 or newer. The container image refuses to build with an older Git.
- Git commands of all copies of one repository run one at a time, because the copies share the
  repository's history and branches.

### Governed metrics and classifications

Every content write is compared with the file it replaces: a Source save, an item edit,
save-batch, the metric wizard, the legacy document save, an import (including one that replaces a
file or creates a project), revert, pull, file delete, and trash undo and restore.

- Only a Steward of the project's domain, a role with **approve metrics**, or an Admin may set a
  metric's status to `approved` or `deprecated`. Nobody approves or deprecates a metric whose
  `owner` names them (their verified address or username, in any letter case).
- When someone who may not approve changes an approved metric in anything but its `description`,
  the server stores it as `proposed` (only the status value changes). The response lists it
  under `demoted`, with the stored text in `source`.
- Changing an ODCS `classification`, `criticalDataElement`, contract `team` or `roles`, or any
  part of a property classified at or above the protected level, needs a Steward of the domain or
  an Admin. The protected level is `confidential` by default, with the order
  `public < internal < confidential < restricted`. Admin aliases apply, and other values count as
  `internal`.
- A refused change refuses the whole operation before any file changes, with
  `403 {error, guarded: [{file, pointer, kind}]}` naming the guarded parts of readable files.
  A pull or revert is judged as if the person wrote the incoming text, so when it would bring in an
  approval or a classification change, the refusal asks for a Steward of the domain (or an Admin)
  to do it. Deleting a file that holds an approved metric or a protected property needs the same
  people. Undo, restore and a project-creating import are judged as creating their files. A move
  to another project is judged as removing the file from the first and creating it in the second,
  and a branch switch is judged on what the branch changes compared with the current one.

The metric detail offers **Approve** and **Deprecate**. They are disabled, with the reason written
beside them, for people who may not approve and for the metric's owner. An owner who names nobody
who has signed in shows as "unverified owner" and counts as no owner. The metric wizard suggests
owners from `GET /api/projects/:slug/people`, which only people who may edit the project can
call: the people who may read the project and signed in with a verified e-mail, or an Entra user
name of a member (not a guest). Property editors keep protected properties read-only for Editors
and say why. Local mode is unchanged.

### Remote Git

Fetch, pull, push, sync and clone run only when someone presses them, and each uses the signed-in
person's own credential, so the remote records who pushed:

- **Azure DevOps** (`dev.azure.com`, `*.visualstudio.com`; Entra sign-in only): the server
  exchanges the person's workbench access token for an Azure DevOps token (on-behalf-of, scope
  `499b84ac-1321-427f-aa17-267ca6975798/.default`). The App Registration needs the delegated
  permission *Azure DevOps → user_impersonation* with consent, `SW_ADO_OBO` must not be `false`
  and **Azure DevOps on-behalf-of** must be on in `admin/settings.json`
  (`remote.azureDevOpsObo: true`). If the exchange fails the request answers
  `428 {connect: 'azure-devops'}` and the panel offers **Sign in again**.
- **GitHub:** the person connects once per session from **Person menu → Connected accounts →
  Connect GitHub** (`/auth/github/start` → `/auth/github/callback`), or from the prompt a push
  shows when no account is connected (`428 {connect: 'github'}`); the push then continues on
  return. Register `<SW_PUBLIC_URL>/auth/github/callback` as the app's callback URL.
- **Other hosts** on the allowed list are reached without a credential (public remotes).

A project that lives in one folder of a repository is cloned partially (see *One folder of a repository*): Git downloads file contents after the clone, while checking out and while a guarded pull or branch switch reads them. Those commands carry the same credential as any remote command, so a private repository works the same way.

Tokens live only in the encrypted session and end with it. Git receives one for a single command
through the askpass program `server/bin/sw-askpass` and the environment of that child process,
with `-c credential.helper=` so no configured helper is asked or stores anything. A pull fetches
with the token and then merges as a local command without it, so filters and merge drivers in the
repository never receive it. Nothing is written to `.git/config`, and tokens are masked in error
text, logs and audit records.

Only Admins add, change or remove a remote, clone, or register a repository's projects. Server
mode reaches remotes over HTTPS only, and only hosts listed in `admin/settings.json`
(`remote.allowedHosts`); any other address answers 400 with the `allowedHosts` list. Entries are
exact host names compared without regard to case, with a port when the remote uses one, and each
`<organisation>.visualstudio.com` host is listed separately. A separate push address
(`remote.<name>.pushurl`) must be on the same allowed host. Addresses are stored in canonical
form, and one with a backslash or with `@` after the host is refused because Git could read it as
another host. Local mode keeps using the machine's own Git credential configuration.

New projects, imports and examples created by a Steward get an allowed domain automatically when
there is only one. With several domains a dialog asks which one to use. Admins may choose a
domain or leave the project unassigned.

### Agent clients

An automation calls `/api/agent/catalog`, `/api/agent/context` and `/api/agent/plan` with its own
Entra application token as `Authorization: Bearer <token>`. It sees only the projects an Admin
granted to its client ID. Everything about setting one up, what the server accepts and how it
answers is in [docs/agent-runtime.md](docs/agent-runtime.md#agent-clients-in-server-mode). The
example client is `scripts/examples/agent-client.ts`. Bearer tokens are accepted on `/api/agent/*`
only, and Keycloak or generic providers' client tokens are refused.

### The Admin panel

Admins open the Admin page from the header's **Admin** button. In server mode only Admins see it;
in local mode the implicit Admin does. The page replaces the workspace; **Back to workspace**
returns to it with the open file and view as they were. A section navigation on the left lists the
sections (a scrolling strip above the content on a phone), and the content uses the full width.
The page scrolls vertically as one region; tables keep every row instead of clipping within nested
scrollers. Phone navigation hides incomplete neighboring labels and reveals the selected section.
Each section has its own address, `#/admin/<section>` (`grants`, `roles`, `users`, `policies`,
`projects`, `audit`, `settings`, `access-check`), so reload and the browser's Back button land on
the same section. Editors open in place of the list with a **Back to** button. Dialogs appear only
for confirmations and for the dry-run preview: a form's **Dry run** opens the preview, and
**Confirm** is in its footer. The sections:

- **Projects access:** assign projects to domains, set protected branches, restricted paths and the
  protected classification level, and grant agent clients their projects or domains.
- **Access grants:** give a built-in or custom role to a group or a verified
  address. The group's directory name is shown when the lookup succeeds; otherwise the grant keeps
  the ID and says "name not resolved".
- **Access check:** choose a signed-in person or copy their ID from Users & groups.
  Check access can target the workspace with Project blank; Who can access requires a project.
- **Roles:** the four built-in role definitions are fixed and labelled **Built-in role**:
  duplicate one to make a custom role, pick its actions and optional conditions, save it, then add
  members through the grant form. Custom roles cannot hold the `admin` action. Deleting a custom
  role lists the people who hold it and removes its grants in the same change.
- **Users & groups:** everyone who has signed in, plus configured agent clients, with their groups
  and where each role comes from. Filter on **No access** to find people waiting for a grant;
  **Grant access** opens the grant form with their verified address filled in. People can be
  deactivated, reactivated and signed out from here.
- **Policies:** the Admin rules, then the built-in rules folded under **Built-in rules (N)**, read-only. New rules start from a template
  (time window, network range, Git action limits and others) or the raw Cedar editor, and the
  server validates them and reports line and column. Time rules use UTC, and a window such as 22
  to 2 runs past midnight. Network rules use the direct socket peer, never forwarded headers:
  behind Azure Container Apps ingress the peer is the ingress address, so a network rule there only
  tells ingress traffic apart. A `forbid` rule must name its actions and cannot include `admin`;
  rules that could lock every Admin out are refused, whatever their condition.
- **Access check:** why a known person, or a hypothetical group and address, is allowed or denied
  an action on a project, path or branch, and who can act on a project or path. It evaluates the
  same Cedar policies as normal requests.
- **Audit:** filter by person, action, project, decision and time, page through the records and
  export the filtered set as JSONL or CSV. Without a **From** time the current month is shown.
  Stewards see only the records of their own projects, and not those of restricted paths they
  cannot read.
- **Settings:** provider health, session lifetimes (applied immediately), the remote-credential
  policy and active sessions that can be ended. Provider credentials and session tokens never
  appear.

Every access change goes through **Dry run** before **Confirm**. The review lists the replayed
decisions that change and, for each person or agent client, the project actions gained or lost.
Editing the proposal discards the review. The dry run replays the fixture identities and requests
in `policies/matrix-cases.json` plus the latest 1,000 audit snapshots; regenerate the fixture
with `bun scripts/generate-access-matrix.ts` after extending the route inventory.

Each confirmed change is one commit in the administration repository, authored by the signed-in
Admin, with a message that names what changed (for example
`grants: Add grant erin-viewer (viewer to erin@example.org)`). **History** in each section compares
versions with the source diff viewer. **Roll back** shows the dry run of restoring that version,
including people it reactivates, and **Confirm rollback** creates a new commit; the same checks as
any other save apply. Changes apply on the next request and close the live-update streams of the
people whose access changed, so their browsers reload. Deactivation and reactivation end that
person's sessions.

Refusals stay on the page and nothing is saved:

- **stale:** someone else changed access since the section was opened. Open the section again,
  then dry-run again.
- **last-admin:** under the proposed grants, roles and rules no Admin who signed in recently and no
  bootstrap identity would still be allowed to administer.
- **bootstrap-admin:** bootstrap Admins cannot be deactivated.

**Break-glass recovery.** Keep `SW_BOOTSTRAP_ADMINS` configured. Those verified addresses or
stable identity IDs (`tid:oid` for Entra) remain Admins whatever the grants say, and the panel
marks a bootstrap session. Never use an unverified address as a bootstrap identity.

Scripts use the same routes: `/api/admin/*` (Admins only) and `/api/audit`,
`/api/audit/export?format=jsonl|csv`. Preview a proposal with `POST /api/admin/policies/dry-run`,
then send the same document to its PUT route with the `dryRunId` and, as `baseVersion`, the
`version` returned by that document's GET. To roll back, dry-run `{"rollbackTo": "<version>"}`,
then send `{baseVersion, dryRunId}` to `POST /api/admin/versions/<version>/rollback`. The full
contract is in [http-api.md](specs/003-authn-authz/contracts/http-api.md).


### Audit log

Every write and every refused request is recorded under `state/audit/`, one append-only file per
month, as a single hash chain. The log holds no document text and no credentials, and files older
than 400 days are deleted at start-up. `bun run audit:verify [folder] [--anchors mirrored.log]`
reports the first record that was changed, removed or cut off; see
[docs/audit-tamper-evidence.md](docs/audit-tamper-evidence.md).

Refusals that name nobody (a missing session, a refused bearer token, a failed sign-in) are
recorded for the first 20 of each kind per client address and then once a minute. The next record
says how many were left out (`suppressed`), so an unauthenticated loop cannot fill the data
volume and its size is still known. Agent clients' calls are audited under `client:<clientId>`.

### Limits, errors and caching

- **Rate limits.** Each client address may send 1,000 requests in a burst and 200 a second after
  that. `/auth/login` and `/auth/callback` share a tighter allowance of 60 and 2 a second, because
  each call can reach the identity provider. Beyond it the answer is `429` with `Retry-After`,
  nothing is audited and the source is logged as `http.rate-limited` with its count at most once
  a minute. A signed-in person is limited as themselves, so an anonymous visitor behind the same
  address cannot use up their allowance.
- **Behind a reverse proxy** the socket peer is the proxy. Set `SW_TRUSTED_PROXY_HOPS` to the
  number of proxies (1 behind Azure Container Apps ingress): the client address is then the entry
  that many places from the right of `X-Forwarded-For`, and entries to its left, which the client
  writes, are ignored. An IPv6 client counts by its /64. Network policy rules keep comparing the
  socket peer.
- **Errors.** A failure the server did not expect answers `500 {"error":"Internal error."}`; the
  cause goes to the server log as `http.unexpected-error` with the request id, the error name and
  its message with credentials and file locations removed. A failed Git command
  answers `{"error":"Git failed."}` and its output goes to an `http.git-failed` line. A malformed escape
  in a URL path answers 400.
- **Caching.** Hashed assets use `private, max-age=31536000, immutable`. HTML and API responses
  use `no-store`, so shared caches never keep auth-gated files. Local mode caching is unchanged.

### Operating it

- **One instance.** Run exactly one replica of the container app. Dry-run receipts, the
  administration save lock and the short-lived cache of group names live in the server process,
  and the replicas would also share one Git workspace. A second replica would refuse Admin saves
  or race them. The deploy preflight refuses a container app whose minimum or maximum replica
  count is not 1.
- **Scale path.** Scale vertically first and keep the SQLite cache on local disk. Horizontal
  scale needs repository ownership partitioning or coordinated storage and leases, plus shared
  session handling; changing the replica count alone is unsafe
  ([deploy/README.md](deploy/README.md#alternatives-and-scaling)).
- **Moving a local data folder to server mode** and the checks the first start makes:
  [deploy/README.md](deploy/README.md#moving-a-data-folder-from-local-mode-to-server-mode).
- **Back up** `DATA_DIR` with the app stopped, or rely on Git remotes for projects. The
  administration repository in `admin/` is itself a Git history of every access change.

### Logging and telemetry

**Logging** works the same in both modes. All operational output goes through one logger
(`server/observability/log.ts`). Server mode writes one JSON object per line to stdout, which
container platforms collect; local mode writes short readable lines
(`12:30:45 INFO  http.request method=GET route=/api/me status=200 durationMs=2 actor=local`).
`SW_LOG_LEVEL` chooses `debug`, `info` (the default), `warn`, `error` or `silent`; any other value
refuses start-up.

- **Requests.** Each request gets an id, returned in the `X-Request-Id` response header, and leaves
  one `http.request` line with the method, the *route template* (`/api/projects/:slug/files/*`,
  never the raw path), the status, the duration in milliseconds and the actor. Every other line
  written while the request is handled carries the same id, however deep in the code, and the audit
  record of the request holds it too. When telemetry is on, lines also carry `traceId` and `spanId`.
- **Actor.** `local` in local mode, `anonymous` before sign-in, otherwise `user-` or `client-`
  and 16 hex characters: an HMAC-SHA-256 of the person's stable key, keyed by
  `SW_TELEMETRY_ACTOR_SALT`. It holds no name, address or provider id and cannot be computed from
  a known object id without the salt. Without the setting each start uses a new salt, so the
  pseudonym ties one person's requests together within a run and nothing more; set it to follow a
  person across restarts. To name the person behind a line, look up its request id in the audit
  log.
- **Redaction.** Fields named like secrets, cookies, sessions, authorization, document content,
  file locations, query strings or addresses are dropped. Text values lose bearer and basic
  credentials, signed tokens, the user information of addresses, the query string of addresses,
  `name=value` pairs of secret-looking names and file locations. Values are also cut in length,
  depth and array size. Operational field names must therefore avoid those words (`files`, not
  `fileCount`); `tests/observability/redaction.test.ts` lists what is covered.
- **Not here.** The audit log is a separate security record under `state/audit/`, unchanged by
  this. Log lines hold no document text, tokens, cookies, secrets or query strings. Stdout
  redaction is best effort for free text: a project name, a client address (`http.rate-limited`)
  or Git's own error text can still appear in a stdout line, which stays on the platform you run
  it on. That is why export is stricter, see below.

**Telemetry** is the export of traces, metrics and logs to Azure Monitor (Application Insights)
through OpenTelemetry. It is off by default, **never runs in local mode** (a connection string in
the environment is ignored there and no telemetry code is loaded) and runs in server mode only when
`APPLICATIONINSIGHTS_CONNECTION_STRING` is set. Start-up accepts only a string whose ingestion
endpoint is an `https://` Application Insights host and never prints it. When it is off, the
OpenTelemetry SDK and the Azure exporter are not even loaded, and `tests/observability/telemetry-off.test.ts`
proves in a separate process that no module loads and no socket is tried.

- **Spans:** each HTTP request (`GET /api/me`), each Git command (`git status`, with option names
  and an argument count, never argument values, addresses or paths), each project scan and
  reindex, each validation on save, each administration policy reload and the sign-in steps
  (start, token exchange, principal resolution, session creation, refresh, sign-out).
- **Metrics:** requests and duration by route template, method and status
  (`sw.http.server.requests`, `sw.http.server.duration`); Git duration and failures by subcommand;
  scan duration; validation duration by trigger; active event streams; authentication failures by
  reason (`token-invalid`, `bearer-scope`, `rate-limited`, `csrf-invalid`, sign-in reasons); and the
  browser metrics below.
- **Logs** pass through the OpenTelemetry log bridge after the level filter, so a trace and its
  log lines share one operation id. Only an allow-list of fields is exported (request id, trace and
  span ids, actor, route, method, status, duration, error name, kind, operation, Git subcommand,
  reason and a few counts); every other field, such as project names, client addresses and Git
  output, stays on stdout. A failed span exports the error's name, not its message.
- **Resource:** `service.name=semantic-workbench`, `service.version`, `sw.commit`, `sw.mode` and
  `service.instance.id` (the Container Apps revision). Nothing about a person except the actor
  pseudonym above.
- **Sampling:** `SW_TRACE_SAMPLE_RATIO` (0 to 1, default `0.1`) keeps that share of traces, using
  Application Insights' own sampler so counts can be scaled back up. Metrics and logs are not
  sampled, so every failure still leaves a log line.
- **Outbound call:** to the ingestion endpoint in the connection string only. The exporter's own
  usage reporting to Microsoft is switched off, and `tests/observability/azure-backends.test.ts`
  checks that building and stopping the real exporters opens no connection. A slow or unreachable
  endpoint never delays a request; shutdown waits at most five seconds for a last flush.
- `/healthz` says whether telemetry is on (`"telemetry": {"enabled": true, "sampleRatio": 0.1}`)
  or why it is off, and never where it sends.

**Browser reports.** When telemetry is on, a signed-in page sends JavaScript errors, unhandled
rejections, its page load time and operations that ran over their budget to
`POST /api/telemetry/browser`; the server records them as the `sw.browser.*` metrics and
`browser.error` and `browser.slow-operation` log lines. Budgets are the ones this project already
holds itself to: validation 500 ms, a graph layout 2 s, a save 2 s. The browser never contacts any
other host, collects no clicks, keystrokes or file content, holds reports in memory until the
server's `/api/me` says they are wanted (and drops them otherwise), sends each distinct error once
and at most 100 reports per page load. The route exists only while telemetry is on (404 otherwise),
needs a signed-in person, accepts at most 32 KiB and 20 reports per request, allows a burst of 10
and then one request every 2 seconds per person (429 with `Retry-After` beyond it), and refuses
any report with an unknown field, an over-long value or an unknown operation (400). Messages are
cut to 200 characters, quoted text in them is replaced before sending and again on the server, and
only stack frames, never the message line of a stack, are kept.

Limits to know about: quoted-text replacement cannot recognize document text that an error message
quotes without quotation marks; traces are sampled; the exporter is a Microsoft beta release and
the tests use in-memory exporters, never Azure itself; there is no automatic instrumentation of
libraries, no alerting and no usage analytics. The design and its reasons are in
[specs/005-observability](specs/005-observability/plan.md).

### What the server contacts

Server mode makes no outbound call except these:

| To | When | Settings |
| --- | --- | --- |
| The identity provider (discovery, token, signing keys, end-session) | Sign-in, refresh, sign-out, agent tokens | `SW_OIDC_ISSUER`. For Entra the issuer must be on `login.microsoftonline.com`, `.us`, `login.chinacloudapi.cn` or `login.partner.microsoftonline.cn`, without a port; MSAL contacts no other host |
| Microsoft Graph | Group overage and group names in the Admin panel | `SW_GRAPH_URL`, `SW_GROUP_OVERAGE` |
| The platform's managed-identity endpoint (`IDENTITY_ENDPOINT` with `IDENTITY_HEADER`, resource `api://AzureADTokenExchange`) | Each client assertion, when `SW_OIDC_CLIENT_ASSERTION=managed-identity` | Set by Azure Container Apps |
| Azure DevOps and the token exchange for it | A person fetches, pulls or pushes to Azure Repos | `SW_ADO_OBO`, `remote.allowedHosts` |
| GitHub | Connect GitHub and Git commands against GitHub | `SW_GITHUB_HOST`, `SW_GITHUB_CLIENT_ID`, `SW_GITHUB_CLIENT_SECRET` |
| Other Git remotes | Only when a person presses Fetch, Pull, Push, Sync or an Admin clones | Hosts listed in `remote.allowedHosts` |
| Application Insights | Traces, metrics and logs, only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set; never in local mode | The ingestion host in that connection string, which must be an Application Insights host ([Logging and telemetry](#logging-and-telemetry)) |

Nothing runs in the background against a remote, and the workbench never executes the SQL it
previews.

### Microsoft Entra ID

Entra is the target provider. The full portal steps, with the container app and pipeline setting
each value maps to, are in
[deploy/README.md](deploy/README.md#entra-app-registration). In short:

- One single-tenant App Registration with Web redirect URIs `<SW_PUBLIC_URL>/auth/callback` and
  `<SW_PUBLIC_URL>/auth/signed-out`, and the front-channel logout URL
  `<SW_PUBLIC_URL>/auth/front-channel-logout`.
- No app roles for people: roles come from the grants in the Admin panel.
- A groups claim on the ID and access tokens ("Security groups", or "Groups assigned to the
  application" to avoid overage).
- Optional ID-token claims `email`, `upn`, `xms_edov`, `sid` and `login_hint`; optional
  access-token claim `idtyp` (agent tokens without it are refused).
- Microsoft Graph application permission `GroupMember.Read.All` with admin consent, for overage
  and the group names the Admin panel shows. Remove it and group names read "name not resolved".
- An exposed API `api://<client-id>` with the scope `access_as_user`, and access token version 2.
- A credential, in this order of preference: a certificate (Key Vault), a federated credential
  for the container app's managed identity (`SW_OIDC_CLIENT_ASSERTION=managed-identity`), or a
  client secret.
- The delegated Azure DevOps permission `user_impersonation`, when people push to Azure Repos.

Sign-in runs on the server through Microsoft's MSAL library. MSAL's token cache, which holds the
refresh token, is kept per session inside the encrypted session record and never reaches the
browser, a response or a log.

### Keycloak (compatibility)

Keycloak is checked for compatibility only. Set its realm as the issuer, `SW_OIDC_PROVIDER=keycloak`,
a confidential client secret and group-name grants; no tenant ID is needed. People need
`email_verified=true` for e-mail grants. Sign-in goes through `openid-client`, and bearer tokens
of agent clients are not supported. To try it, see [Sign-in testing](#sign-in-testing).

### Run the image in server mode

Use the same image with the server settings. A container that serves the network sets
`SW_HOST=0.0.0.0` (Azure Container Apps does). The Compose `keycloak` profile starts Keycloak and
the workbench together for the owner's machine, with host networking so both reach each other on
loopback:

```sh
cp .env.server.example .env.server    # then set SW_SESSION_KEY from `openssl rand -base64 32`
mkdir -p .server-workspace/admin
cp tests/fixtures/auth-workspace/admin/*.json .server-workspace/admin/
cp tests/fixtures/auth-workspace/admin-keycloak/grants.json .server-workspace/admin/grants.json
docker compose --profile keycloak up --build -d
```

Keycloak is published on `127.0.0.1:8080` and the workbench on `http://127.0.0.1:4310`. The
workbench retries start-up while the realm import finishes. The `.server-workspace` folder must be
writable by uid 1000. Stop the profile with `docker compose --profile keycloak down`. These
credentials and the HTTP cookie exception are for development only, and automated checks never use
this folder. On Azure, [deploy/README.md](deploy/README.md) creates the container app.

## Theme

Every colour of the interface is a CSS custom property in one file, `src/theme.css`. Other
stylesheets and components refer to the names, for example `background: var(--color-surface)`.
Names say what a colour is for: `--color-surface` (a background), `--color-border`,
`--color-text`, `--color-text-muted`, `--color-accent` (primary buttons, the selected tab, the
selected graph edge), `--color-warning-soft` (a tinted background) and so on. The file groups
them with comments: surfaces, borders, text, accent, status colours, shadows, graph edges and
the code editor. [docs/theme.md](docs/theme.md) lists every group.

To change the accent, edit the light value in `src/theme.css` and the two dark values:

```css
--color-accent: #5b4fa8; /* was #247c66 */
```

The primary buttons, the selected tab, the selected edge and the focused node in the graph change
with it. To try a colour without saving it, set the property on the `<html>` element in the
browser's developer tools: `document.documentElement.style.setProperty('--color-accent', '#5b4fa8')`.

To add a token, add a line with a semantic name to the right group of the light set and the same
name to both dark blocks, then use it with `var(--color-name)`. A name ends in `-soft` for a tinted
background, `-border` for a line and `-text` for writing in that hue; a bare hue name is a solid
colour for icons and lines. A test fails when the light and dark sets differ.

### Light and dark

`src/theme.css` holds two value sets of the same tokens: the light set under `:root` and the dark
set under `:root[data-theme='dark']` and, for a system that prefers dark, under
`@media (prefers-color-scheme: dark)` for `:root:not([data-theme='light'])`. Stylesheets never
mention the theme; they use the tokens and the page changes with the values. The Theme control in
the sidebar footer (System, Light, Dark) sets the `data-theme` attribute on `<html>` and stores the
choice in the browser's local storage under `workbench.theme`; System removes the attribute so
the browser's setting decides. `public/theme-init.js` applies the stored choice before the first
paint, so a dark page never flashes light. The sign-in pages of server mode follow the system
setting.

The dark set keeps muted text at 4.5:1 or more on every surface, and strong borders and icons at
3:1 or more; `tests/theme-check.test.ts` checks the token values and `bun run test:theme` measures
the rendered screens.

### The theme check

`bun run check` ends with `bun run check:theme`, which fails with `file:line` for every colour
literal in `src/`, `server/` and `index.html` outside the two theme files. Literals are hex
values, `rgb()`, `rgba()`, `hsl()` and the named colours; `transparent`, `currentColor` and
`inherit` are fine. `src/theme.css` holds the tokens. `src/theme-palette.ts` is the only other
place for literals: it lists the group colours that data picks at run time. The server's sign-in
pages receive `src/theme.css` too, so their colours follow the tokens.

### Moving colour literals into tokens

`bun scripts/theme-codemod.ts` replaces every colour literal (hex, `rgb()`, named colours) in
`src/`, `server/` and `index.html` with the closest token of the right job: a background maps to
a surface or solid colour, a border to a border colour, text to a text colour. Colours that are
within a small perceptual distance (CIE76 delta E of 9 for backgrounds and borders, 12 for text and
solid colours) merge into one token; a colour with transparency becomes `color-mix()` of a token.
It prints each literal it could not map, with the nearest token, so you can add a token or pick one
by hand. It changes nothing once no literals are left, so run it again after merging a branch
that brings new colours:

```sh
bun scripts/theme-codemod.ts --dry-run   # show what would change and what cannot be mapped
bun scripts/theme-codemod.ts             # rewrite the files
bun scripts/theme-codemod.ts src/odcs    # limit the run to some paths
bun run fmt                              # the replacements can change line lengths
```

`--report` lists every literal with the token it became.

## White-labelling

The product name, the logo, the favicon and the accent colour come from one brand bundle, so a
deployment can show its own identity without a rebuild. The defaults are the files in
`public/brand/`:

| File | Used for | Largest size |
| --- | --- | --- |
| `logo.svg` | The logo in the workspace sidebar | 256 KiB |
| `logo-mark.svg` | The compact mark: narrow screens and the sign-in pages | 256 KiB |
| `favicon.svg` | The browser tab icon | 256 KiB |
| `brand.json` | `productName` (1 to 60 characters), `shortName` (1 to 24) and optionally `supportUrl` (an http or https address) | 64 KiB |
| `brand.css` | Overrides of the theme tokens in `src/theme.css`, nothing else | 64 KiB |

`SW_BRAND_DIR` names a folder with any subset of those files. A file that is missing keeps its
default, and the files are read when the server starts, so restart it after a change. The server
shows them at `/brand/*`, in local and in server mode. Start-up stops only when `SW_BRAND_DIR` is
set and is not a readable folder.

Every file is checked when it is loaded. A file that fails is named in a `[brand]` warning in the
log and its default stays in use; the server keeps running.

- **Names:** other files in the folder are ignored. A symlink that leaves the folder is refused.
- **Sizes:** a file over its limit above is refused.
- **`brand.json`:** the three keys above; other keys are dropped. `productName` is required and
  is what the title, the sidebar logo text and the sign-in pages show. `shortName` is required by
  the schema but reserved for narrow headers and not shown yet; `supportUrl` is optional and
  reserved for a link to your support page.
- **SVG:** rebuilt from drawing elements only. Scripts, `foreignObject`, animation, event
  handlers, every namespaced attribute except `xmlns` and `xml:space`, links that do not point
  inside the drawing, document-level nodes such as `xml-stylesheet`, and any style value with an
  escape, `url()` outside a `#fragment`, `image()`, `image-set()`, `cross-fade()`, `src()` or
  `@import` are removed. The server also sends `nosniff` with every brand file and a
  Content-Security-Policy: `default-src 'none'; style-src 'unsafe-inline'; sandbox` for SVG and
  `default-src 'none'; sandbox` for `brand.json` and `brand.css`, so an SVG opened on its own cannot
  run script. An SVG drawn as
  an image cannot read the page's fonts or theme; give it its own colours (a
  `prefers-color-scheme` rule inside the SVG works).
- **`brand.css`:** custom properties (`--color-accent: #6a2c91;`) under `:root`,
  `:root[data-theme='dark']`, `:root:not([data-theme='light'])` or inside
  `@media (prefers-color-scheme: dark|light)`. Any other rule, property, `url()` or `@import` is
  dropped and logged, as is a value with unbalanced parentheses or quotes. It loads after the theme stylesheet, so it wins.

The development server (`bun run dev`) serves `public/brand/` as it is; `SW_BRAND_DIR` is for the
Bun server and the image.

Compose, with a `brand` folder next to the compose file:

```yaml
services:
  workbench:
    environment:
      SW_MODE: local
      SW_BRAND_DIR: /brand
    volumes:
      - ./.data:/data
      - ./brand:/brand:ro
```

Azure Container Apps mounts an Azure Files share the same way. Put the files on a share that the
environment already has as storage (`az containerapp env storage set`), add a volume of type
`AzureFile` to the app, mount it read-only at `/brand` and set `SW_BRAND_DIR=/brand` next to the
other settings in [deploy/README.md](deploy/README.md):

```yaml
properties:
  template:
    containers:
      - name: workbench
        env:
          - name: SW_BRAND_DIR
            value: /brand
        volumeMounts:
          - volumeName: brand
            mountPath: /brand
    volumes:
      - name: brand
        storageType: AzureFile
        storageName: sw-brand
```

`bun run check` ends with `bun run check:brand`, which fails with `file:line` when the text
"Semantic Workbench", the split `semantic` and `WORKBENCH` wordmark or the inline layers logo
appears in `src/`, `server/`, `index.html` or `public/` outside `public/brand/`. Tests, scripts,
specs and documentation may name the product. The allow-list in `scripts/check-brand.ts` holds the
technical identities that must not follow a brand: the committer of server commits (change it with
`SW_COMMITTER_NAME`), the text of the import commit, the Git lock reason and two agent reply
sentences. `bun run test:brand` shows a test bundle in the header, the title, the favicon, the
sign-in pages and the accent, and confirms that a script in a logo does not run.

## Checking your work

```sh
bun test              # unit and handler checks
bun run check         # tsc, fmt:check, oxlint, the comment check, the theme check and the brand check
bun run build         # compiles the schemas, then the production frontend
```

`bun run ci:validate` runs everything below in one command and is what the delivery pipeline
runs. Tests always use temporary data roots and never touch `data/`.

### Browser suites

Browser suites need Playwright's Chromium (`bun node_modules/@playwright/test/cli.js install
chromium`) and a Vite dev server. Start one on a free port and point the suites at it; the API
is always an isolated one on a temporary data root, whatever the frontend address.

```sh
bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5180 &
SW_BASE_URL=http://127.0.0.1:5180 bun run test:projects
```

`SW_BASE_URL` defaults to `http://127.0.0.1:5173` (the older name `UI_URL` is still accepted).
`SW_SCREENSHOT_DIR` keeps a suite's screenshots in one folder; without it they go to `/tmp`. `bun run polish:capture <folder>` and `bun run polish:capture:server <folder>` photograph every screen and dialog at the four sizes; `SW_THEME=dark` photographs the dark theme, and `SW_ONLY=odcs-` photographs only the screens whose name contains that text.
`bun scripts/polish-capture.ts <folder>` photographs the same tour of screens at the four sizes
and prints what the checks find on each, which is the quickest way to review a visual change.
`test:auth`, `test:two-editors` and `test:admin` build the frontend and serve it themselves, so
they need no Vite.

| Script | What it checks |
| --- | --- |
| `test:ui` | Real downloads and exports of every example, reopening examples, grouped relationship selection, unobstructed controls, unsaved edits, re-import |
| `test:responsive` | Six viewports from 390×844 to 2560×1440: no horizontal scroll, no cut-off control, no overlapping floating element, drawers, full screen in Graph and Neighborhood; and a tour of every screen and dialog (including the edit drawers, metrics, the metric screens of every example, mappings, composer and catalog, the ODCS pages, and the Sync, clone, folder, rename and delete-project dialogs) at 390, 1280, 1440 and 2560 px with text of at least 12 px, no text covered by or overlapping other text, and no cut-off control; the whole-model graph and the neighborhood at those sizes (names and visible detail lines at least 12 px, no overlapping cards, a toolbar that fits, and on a phone a canvas of at least 55 percent of the screen); and the header at those sizes (grouped controls of one height on one line, no overlap, the New and Examples menus inside the window, the Examples menu by keyboard); the same tour in the dark theme, chosen through the Theme control, with text contrast of at least 4.5:1; and a project that lives in one folder of a team repository, whose copies hold only that folder; and the shell parts of the main screens (header tooltips and short save state, the tab strip with its chevron cues, the open file in the sidebar tree, one centred content width from 1920 px) |
| `test:edges` | Graph edge endpoints against rendered node borders while dragging and zooming |
| `test:grouping-validation` | Grouping suggestions and validation dialogs, repair of mixed import batches |
| `test:examples:ui` | Loading the examples, mappings and metric composition; the metric count of every example and, for a simple, a composed and a cross-table metric of each, owner, contract lineage, breakdown and the unexecuted SQL preview |
| `test:projects` | The project tree, an external edit appearing in an open tab within 2 seconds, a stale save from a second tab, a restart after deleting `cache.sqlite`, and a project export that imports back with equal file hashes |
| `test:trash` | Row trash icons (reachable, at least 28 px, no overlap at 390 and 2560 px), suggestions, delete confirmation, Undo, restore, Clear |
| `test:metrics` | Metric list, detail, explanation and graph navigation |
| `test:graph` | The UBL graph and the neighborhood on three models: exact-first center picking, a five-step walk, no shared edge lines |
| `test:editor` | Colors per serialization, inline findings within 500 ms, Go to line, byte-exact CRLF saves, typing latency in a 1.9 MB file |
| `test:item-edit`, `test:rdf-edit` | Item editors, add, delete, rename, the metric wizard and status rules; the same for Turtle, RDF/XML, N-Triples, N3 and SHACL resources, with `git diff` limited to the edited item |
| `test:scm` | Commit, branch, switch, push to a local bare remote, pull from a second clone, conflict repair, `.gitignore`, history, the credential wait, the missing-Git banner, and the panel and its Sync dialog at four sizes |
| `test:odcs`, `test:lineage` | Contract pages, section dialogs and byte-preserving property edits through the edit dialog; every drawn lineage line against the expected edge lists, path emphasis within 200 ms, cards staying measured across window resizes; the ODCS graph of three contracts at four sizes (whole cards, no overlaps, lines clear of cards, labels clear of cards and each other, a legend, column names of at least 12 px), cards that open in place with a filter and Show fewer, edge anchors on rows and list edges, and the foreign-key hop row and its list; the lineage canvas measures again any card React Flow left hidden, which the suite exercises under heavy machine load |
| `test:autosave` | Automatic saves, stale drafts and commits against a local remote |
| `test:sql` | Embedded SQL colors, warning locations and unchanged export bytes |
| `test:git-setup` | Git identity, a remote and a push, a clone, a clone of one folder (a bad folder refused, a missing folder offered), a folder for the project previewed, confirmed, recorded in a commit and pushed, the credential setup guide |
| `test:monorepo` | Several projects in one repository, grouped tree, shared Source Control, Remove versus Delete folder, and the clone, projects and delete dialogs at four sizes |
| `test:dialogs` | Dialog fit, focus trap and focus return across the six viewports |
| `test:brand` | A brand folder given to the built server changes the sidebar logo, the page title, the favicon, the sign-in page mark and name and the accent token; a script in a logo is removed; with no folder the shipped brand shows |
| `test:theme` | Swapping `--color-accent` in the browser changes the primary button, the selected tab and the graph selection; the Theme control sets, stores and clears dark; System follows the browser; the stored choice is applied by a script before the app loads; muted text keeps 4.5:1 on its surfaces; the main tour in the light theme and every tour in the dark theme at 1280×720 have readable text, enough contrast and no overlaps |
| `test:telemetry` | With a mocked API, a thrown error and an unhandled rejection reach the report route with quoted text replaced and only the documented fields; nothing is sent when the server has telemetry off; the page contacts no host but the workbench |
| `test:terminology` | The interface, this README and `docs/` call every metric a metric and use the older term nowhere except in verbatim data and the stored `kpi_bindings` key |
| `test:mappings-layout`, `test:mapping-graph` | Binding cards and selected-document Source actions at six viewports; every mapping graph line against the resolver's bindings |
| `test:auth` | The mock provider in Entra's endpoint layout: every fixture person, role provenance, refresh, expiry, Graph overage and failure, live updates, sign-out, agent clients' bearer tokens, guarded changes, the owner picker, remote credentials; screenshots of each screen at 390×844, 1280×720, 1440×900 and 2560×1440 |
| `test:two-editors` | Two Editors, a Steward and a Viewer on one repository: edits, drafts, branches, commits and pulls stay in each copy, each commit names its author, a branch held by another copy cannot be chosen, a publish reaches the Viewer |
| `test:admin` | The Admin panel against the real API: timed grant, access-check and rollback flows, custom roles, policy rollback, audit export, routing (reload and Back), every section and dialog at four sizes. |
| `test:auth:keycloak` | Owner's machine only: the same sign-in checks against a digest-pinned Keycloak 26.4 realm, plus agent client credentials |

The older `commerce-browser-check.ts`, `relationship-browser-check.ts` and `browser-check.ts` predate
the current layout, fail on stale selectors and are kept for reference only. `bun
scripts/live-inspect.ts` reads the real running workspace without writing anything (every non-GET
request is refused) and compares exported documents with their project files.

### Without a browser

The admin dialogs run against canned responses shaped like the contract
(`tests/helpers/admin-api-mock.ts`):

```sh
bun test tests/admin-client.test.ts tests/admin-presentation.test.tsx   # client and pure parts
bun test tests/admin-dialogs.test.tsx                                   # dialog behaviour
SW_SCREENSHOT_DIR=/tmp/admin-shots bun test tests/admin-geometry.test.tsx  # every dialog, 4 sizes
```

### Visual capture

`SW_BASE_URL=http://127.0.0.1:5175 bun run polish:capture /tmp/local-shots` captures
local mode. After building, `bun run polish:capture:server /tmp/server-shots` captures
server mode through the loopback mock provider. Add `SW_THEME=dark` for either dark tour.
The server tour defaults to the fixture administrator (`dave`) so every dialog is accessible;
an optional final username selects a narrower permission set. Its temporary orders contract
includes a Team section and a status field needed by the tour. Existing-project folder changes
show the server refusal rather than a local move preview. An administrator capture fails on any
skipped screen. Local captures also fail on a skipped screen. Each viewport starts on a fresh
page; tab navigation explicitly enters Model explorer and verifies the selected tab before
photographing it. The complete tour includes 52 screens: the 41 shared screens plus eight Admin
sections, a real mapping graph, and Graph and Neighborhood in full screen. At four viewports this
is 208 images per mode/theme, or 832 for the complete matrix. Local capture loads mapped commerce
explicitly so its concept-mapping graph uses a real mapping document. Both tools accept `SW_ONLY` as a
screen-name substring filter for supplementary captures. Captures stop on geometry failures,
including graph heading collisions, edge contrast and width, and undersized names. Full-screen
measurements cover the visible full-screen canvas. Neither tool uses the owner's data directory.

### Mutation checks

`bun run test:mutation` introduces deliberate faults into temporary code copies and browser
pages. Each fault must be detected by its focused check. Browser faults cover an empty
neighborhood projection, a status line over controls, persistent status messages, undersized
labels and graph text, clipped save state and missing catalog description access.
Each module's unmodified baseline
must pass first, and formatting and lint must be clean. It never changes application sources.
The faults cover validation, RDF, size limits, layout, grouping, exports, edits, metrics, the
example sets (a file that carries a metric, its binding or its contract dropped) and the
folder store; Git safety (no shell strings, no remote command outside an explicit action, no
`--global` identity); the journal, trash and clone staging; sign-in, sessions and the HTTP
boundary; the access boundary, guards and working copies; the Admin panel (an unpreviewed or
invalid change activated, a built-in role changed, a deactivated principal allowed, a stale review
confirmed); the folder path check, the sparse-checkout arguments and the partial clone; the colour
literal scanner, the theme check and the theme codemod; delivery scripts; graph detail zoom
and edge-label bounds; and logging, telemetry and browser reports (redaction of secrets,
content and locations, the rule that local mode and a missing connection string never export,
report validation and limits, the reporter's queue limits, and the exporter's usage reporting).

### The full gate and the delivery scripts

`bun run ci:validate` runs, in order:

1. `verify`: `check`, `bun test`, `build`.
2. `mutation`: `test:mutation`, with a temporary Vite server for its browser mutants.
3. `browser`: every suite in `scripts/gate-suites.ts`. Workspace suites use a fresh Vite server on
   a free loopback port; `test:auth`, `test:two-editors` and `test:admin` serve `dist/` through
   their own server-mode API and mock provider. All use temporary data.
4. `image`: `image:build`, `image:scan`, `image:sbom`.
5. `container`: `test:container` against the built image.
6. `pipeline`: `pipeline:lint` and dry runs for a pull request, `main` and `v0.4.0-alpha.1`.

Select steps with repeatable `--step`, one browser script with `--suite`, and `--keep-going` to
continue after a failure:

```sh
bun run ci:validate -- --step verify --step pipeline
bun run ci:validate -- --step browser --suite test:projects
```

Results are JUnit XML per step and `summary.json` in `out/ci/`; failures name their step and exit
non-zero. Each suite gets its own `SW_SCREENSHOT_DIR`, and only its PNGs are copied to
`out/ci/screenshots/<suite>/`. The full gate needs Chromium and Docker or Podman. It does not
include `test:auth:keycloak`.

- `bun run image:build` chooses Docker, then Podman (or `--engine docker|podman`). Podman builds
  use `--format docker` to keep the HEALTHCHECK. Tags are `semantic-workbench:dev` and
  `semantic-workbench:sha-<commit>`; repeatable `--tag` adds more. A dirty working tree gets a
  `-dirty` revision suffix.
- `bun run image:scan` scans an exported image archive with a local Trivy or the pinned scanner
  image. A high or critical finding with a fix fails. `.trivyignore` exceptions need a reason and
  an unexpired UTC date. Reports are `out/image/trivy.json` and `trivy.sarif`.
- `bun run image:sbom` writes `out/image/sbom.spdx.json`.
- `bun run image:push -- --registry <name>.azurecr.io` refuses dirty revisions, signs in with `az
  acr login`, pushes the commit tag and prints its digest. It never overwrites an existing
  `sha-<commit>` tag; a second run on the same commit keeps and prints the registered digest.
  `image:scan -- --ref <registry>/semantic-workbench@sha256:<digest>` rescans a pushed image.
- `bun run test:container --image semantic-workbench:dev` checks an existing image (`--build`
  builds first, the default). It uses Docker when installed, otherwise Podman, a temporary bind
  mount and rootless Podman's `keep-id` mapping. `--port 4320` moves it off 4310,
  `--suite local|server` picks a group and `--suite test:projects` a single browser suite. The
  local group checks metadata, health, persistence across a restart and refusal of a second
  instance of the same revision. The server group starts the mock provider on host loopback with
  generated secrets, checks sign-in within 30 seconds, session and data persistence across a
  restart, the refusal of a second instance, and that a different revision takes over within
  shutdown plus 30 seconds. Every suite removes its containers and temporary folders.
- `bun run pipeline:lint` checks the vendored schema and the repository's delivery rules offline.
  `bun run pipeline:dry-run -- --run pr|main|tag:v0.4.0-alpha.1` expands the real templates with
  placeholder target values and prints each step with its condition; `--execute` runs local gate
  steps and, for tag runs, fake deployment and recovery scenarios; `--pipeline rollback` expands
  the rollback pipeline.
- `bun run deploy:azure` runs the version guard, target preflight, records the active revision,
  updates the app by scanned digest, smoke-tests it and promotes the version tag. A failed update
  or smoke test copies and tests the recorded revision, then fails the run. `bun run
  deploy:rollback -- --to previous|tag|<vX.Y.Z>` restores without promoting. Both accept `--fake`
  and `--help`.
- `bun run deploy:smoke <public-url> <package-version> <commit> [--loopback]` uses
  `SW_OIDC_ISSUER` discovery and prints one line per check and a JSON summary; `--loopback` relaxes
  only HSTS and the Secure cookie flag.
- `bun run deploy:check-version` is the tag-only guard: it validates `SOURCE_REF`
  (`refs/tags/vX.Y.Z`, or `--tag`), compares the tag with the package version, requires the tagged
  commit to be an ancestor of `origin/main` and refuses a version older than any promoted tag. A
  release must declare its version in `package.json`; this checkout does not yet, so it refuses
  tag publication.

The GitHub repository runs nothing: no workflows, bots, publishing or deployments. The pipeline
(`azure-pipelines.yml`: Validate, Image and tag-only Deploy; `azure-pipelines-rollback.yml`:
manual rollback) is a deliverable that the target imports into its own Azure DevOps from its Azure
Repos mirror. Target setup, the release hand-over to that mirror and the owner's acceptance run are
in [deploy/README.md](deploy/README.md) and [deploy/trial-runbook.md](deploy/trial-runbook.md).

### Sign-in testing

`bun run test:auth` builds the frontend, starts a mock OpenID provider in Entra's endpoint layout
(`/<tenant>/oauth2/v2.0/authorize`, `/token`, `/logout`) and the API on free loopback ports, seeds
fixture grants and drives the built frontend with Chromium. The server signs in through MSAL as it
does against Entra. The gate and the pipeline run it without an external identity service.

What the mock covers and what it does not:

- **The mock covers** the sign-in flow and redirects, claim mapping for Entra, Keycloak and generic
  shapes, group claims and overage through a Microsoft Graph stand-in, verified-address rules,
  refresh, expiry and sign-out (including provider-initiated), guests without a verified address,
  agent client tokens, and every screen and role of the workbench.
- **Only the real-tenant checklist covers** conditional access, consent, tenant token lifetimes,
  real Graph and Azure DevOps permissions, and pushes attributed to a person. The owner runs it
  from [quickstart §5](specs/003-authn-authz/quickstart.md) and the
  [trial runbook](deploy/trial-runbook.md).

To drive the mock by hand, run `bun run mock-oidc -- --port 8081 --shape entra --layout entra`; it
prints the issuer and the Graph address. The client ID is `semantic-workbench` and the secret
`semantic-workbench-test-secret`; the mock accepts only `http://127.0.0.1:4310/auth/callback` as
redirect unless `--redirect` and `--post-logout` name other addresses. The fixture identities are
`alice` and `frank` (Sales Editors), `bob` (Sales Steward), `carol` (Sales Viewer), `dave`
(Admin), `erin` and `gina` (no access: no grant, and an unverified guest), `hank` (by e-mail) and
`olga` (a group list too large for the token, resolved through Graph).

`bun run test:auth:keycloak` is the compatibility check for the owner's machine. It selects Docker
or Podman, starts the Keycloak 26.4 realm on a free loopback port, runs the same browser checks
and the agent client-credentials check, and removes the container and temporary realm. Fixture
passwords are `test-<username>`, for example `test-alice`. It is outside the gate and the pipeline.

The step-by-step walk through all of this is
[specs/003-authn-authz/quickstart.md](specs/003-authn-authz/quickstart.md).

## Contributing

The code style is part of the project's constitution (Readable Code):

- `bun run schemas:compile` regenerates the checked-in browser validators from the pinned JSON
  Schemas with Ajv standalone code. Build and check run it, and `bun test` checks that it is
  reproducible. The browser CSP does not allow eval.
- `bun run fmt` formats `src/`, `server/`, `scripts/` and `tests/` with Oxfmt (100 columns,
  2-space indentation, semicolons, single quotes, trailing commas). `bun run check` runs
  TypeScript, `fmt:check`, Oxlint and the comment check, and fails on unformatted code.
- One statement per line and one variable per declaration; descriptive names; small functions
  (about 40 lines) and components (about 150 lines); no nested ternaries.
- Comments are plain English for a developer new to the repository: they explain why, one idea per
  sentence, and never carry spec or task IDs or process notes (traceability goes in commit
  messages). Every module has a short header comment and every export a short JSDoc.
- `bun run lint:full` also lists the readability warnings (names, function length, nesting) for the
  code you touch.
- `.git-blame-ignore-revs` lists the mechanical reformat; run
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` once to skip it in `git blame`.
- [ARCHITECTURE.md](ARCHITECTURE.md) is the map of the code; update it with any new module, route
  or setting, together with the [configuration contract](specs/003-authn-authz/contracts/configuration.md).
