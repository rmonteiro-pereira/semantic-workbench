# Research: Published Snapshot

Every decision here resolves a choice the spec leaves to design. Each cites the code it was checked
against. Line numbers are those of branch `008-published-snapshot` at the start of the work.

## 1. What the code does today

| Question | Finding | Evidence |
|---|---|---|
| What do agent routes read? | The request's Reader view: `agentDocuments` calls `ws.documentsFor(requestReader(request))`. | `src/server/handler.ts:203-207` |
| Where does the Reader read from? | `documentsFor` calls `copies.readPlace(reader, slug)` for every project. | `src/server/projects/workspace.ts:224-227` |
| Which place does `readPlace` pick? | The person's copy when `copyKeyFor` returns a key and the copy exists; otherwise `deps.published`. | `src/server/projects/working-copies.ts:231-235`, `:124-126` |
| Who has a copy? | A signed-in person who holds any of edit, import, move, delete, revert, stage, commit on the project. Application clients never do. | `src/server/auth/request-scope.ts:36-63` |
| Local mode | `LOCAL_READER` has neither view nor copy, so every read uses `deps.published`, which in local mode is the project folder with its working tree, uncommitted and untracked files included. | `src/server/projects/reader.ts:22`, `workspace.ts:367-369` |
| What is "published" in server mode? | The repository's base checkout, detached at the default branch, moved only by `moveDefault` after a compare-and-swap of the ref. | `src/server/projects/worktrees.ts:230-262` |
| Who moves the default ref? | Publish from a copy, and `followRemote` after a fetch; both end in `moveDefault`, judged by `judgePublish`. | `worktrees.ts:268-310`, `publishing.ts:35-91` |
| Can a person read any commit? | `scm.show` and `scm.versions` check file access and commit syntax only, then `git cat-file blob <rev>:<path>`. | `src/server/projects/scm.ts:297-318`, `git.ts:437-440` |
| Does local mode switch branches? | Yes: `git/switch`, so the checked-out branch is whatever the person last chose. | `src/server/routes/git.ts:119-127` |
| Which routes can explain a metric? | Browser routes `GET /api/projects/:slug/metrics` and `.../files/*/explain/:metric`; both call `ws.documentsFor(requestReader(req))`. Bearer tokens are accepted on the agent API only. | `src/server/routes/metrics.ts:17,32`, constitution I |
| Does the browser use the agent routes? | Yes: the Mappings view uses `/api/agent/catalog`, `/context` and `/plan`. | `src/app/mappings/agent-paths.ts`, `src/app/projects/api.ts:294-299`, `MappingExplorer.tsx:242` |
| Is there a per-project file count limit? | No. Documents are limited to 2,000,000 bytes (`MAX_INPUT_BYTES`); export and import use a 64,000,000-byte aggregate; Git commands time out at 30 s locally. | `src/shared/validation/diagnostics.ts:33`, `routes/export.ts:12`, `git.ts:9` |
| Is there tag support? | No. `git.ts` has no tag operation; release tags arrive with the releases feature. | `grep tag src/server/projects/git.ts` |

These match the claims of both Ossie reviews (Fable B1, Astra blocker 3). One claim needs a nuance:
Fable names the metric explanation routes as agent-facing. Today they are browser-only, because
bearer tokens do not reach them. They become agent-facing when 006 dispatches a tool's twin request
with a person's connection token, which is why the read source is declared per route (decision 6)
and not inferred from the principal.

## 2. Decisions

### D1. Where the published pointer lives

**Decision**: a durable state file, `data/state/published.json`, `{ formatVersion: 1, repositories:
{ <repo>: { branch, commit, intent? } } }`, written atomically like the registry.

**Rationale**: Principle IV keeps application state that must survive in atomic state files, and
the SQLite cache must stay rebuildable. The pointer is not derivable from the ref: if it were, an
outside move would publish itself, which E4 forbids. A file in `data/state` is also where the
intent for an interrupted publication can be recorded next to what it protects.

**Alternatives**: a Git config key beside `workbench.defaultBranch` (rejected: config can be edited
by any Git command or a clone, and a copied repository would carry a pointer for another data root);
deriving it from `refs/heads/<default>` (rejected: no outside-move check); a tag per publication
(rejected: pollutes the repository and E27 forbids rewriting it).

### D2. How snapshot bytes are read

**Decision**: `git ls-tree -r -z --long <commit> -- <prefix>` for the listing and one
`git cat-file --batch` process for the blobs of a build, both through the existing serialized Git
queue, with every path under the project's folder mapped back to a project-relative path.

**Rationale**: reads objects only, so a dirty checkout, a half-finished checkout update, a sparse
checkout and local mode's moving branch cannot affect it. One batch process avoids a process per
file. `ls-tree --long` gives sizes up front, so the limits of FR-036 apply before any blob is read.

**Alternatives**: a second worktree checked out at the snapshot (rejected: disk, sparse-checkout
configuration, and a mutable directory that someone can edit); `git archive` (rejected: no size
check before data flows, and tar parsing for no benefit); reading the base checkout (rejected: it
is what E4 says not to trust, and local mode has no such checkout).

### D3. Index shape and cache

**Decision**: an in-memory, immutable `SnapshotIndex` per (repository, commit, project folders). It
holds, per project, the file list with `CachedFile`-shaped metadata and the decoded source. Parsing
reuses `indexBytes`, which already caches entities by content hash across copies. Retention is the
current snapshot, the previous one and anything an in-flight pin holds.

**Rationale**: a snapshot never changes, so the only cache question is eviction. Holding sources
in memory removes today's per-request `readFileSync` of every definition file, which pays for the
extra read path (SC-008). The 64,000,000-byte aggregate bounds one snapshot. Access filtering is not
part of the key, so one index serves every person (E10: cache bytes and parse by content, filter by
the caller).

**Alternatives**: SQLite rows per commit (rejected: unbounded growth with every publication, ties the
cache version to history, and the existing cache is per copy); one index per person (rejected:
duplicates memory and risks leaking filtering into a cache); recomputing per request (rejected:
re-reads every blob).

### D4. Pins

**Decision**: `pin()` copies the in-memory pointer map synchronously and returns a frozen
`PublishedPin`. `withPin(run)` registers it for retention and releases it in `finally`. A consumer
that outlives a request (a cursor, a job) stores only the commit id and asks the resolver for it
again (FR-020); the resolver rebuilds it if the commit is still in published history.

**Rationale**: a synchronous copy makes "consistent as of one instant" true without a lock. Storing
ids, not references, keeps memory bounded and survives restarts. This is also the contract 006 needs
for cursors bound to an index generation (M16).

**Alternatives**: a lock around publication (rejected: stalls publication behind a slow reader); a
long-lived retained snapshot per cursor (rejected: unbounded memory and lifetime).

### D5. Detecting outside moves

**Decision**: the resolver never consults the ref when serving. A check compares the default ref with
the pointer when the Git change event fires (the watcher already announces `.git` changes) and when
Source Control status is requested, and it caches the answer until the next event. The result feeds
the pending-move status and nothing else.

**Rationale**: because serving follows the pointer alone, an outside move cannot be served whether or
not it is detected quickly. Detection only affects how soon the person is told, so it needs no
per-request process.

**Alternatives**: compare on every pin (rejected: a Git process per request); poll on a timer
(rejected: a timer for something the watcher already reports).

### D6. Declaring the read source per route

**Decision**: the route inventory in `src/server/auth/route-actions.ts` gains a `readSource` field,
one of `published`, `editing`, `by-surface`, required on every row that can return a context, plan,
explanation or a document's content. `by-surface` is decided by `requestSurface(request)`.

**Rationale**: the inventory already drives the authorization matrix and the guard exemptions, so a
declared source is tested in the same place and a new route cannot ship without one. The surface
decides only for routes where both a browser and an agent can arrive, which is the case 006 creates.

**Alternatives**: infer from the principal (rejected: a person is both a browser and, through 006, an
agent); a query parameter (rejected: an agent could ask for the editing view); a second server port
(rejected: constitution I requires one origin).

### D7. Surface

**Decision**: `requestSurface` returns `browser` for a signed-in session cookie in server mode, and in
local mode for a request whose `Sec-Fetch-Site` is `same-origin` or `same-site` and whose `Origin`,
when present, is one the API already allows. Every other request is `agent`. 006 adds connection
tokens, which are `agent` by construction.

**Rationale**: fail closed, and use only signals the existing middleware already trusts. In local mode
there is no credential, so any marker is a guardrail; FR-030 says so in the docs rather than
overclaiming (Principle VII).

**Alternatives**: a custom header (rejected: trivially forged and invisible in the browser's own
protections); requiring a token in local mode (rejected: constitution I defines local mode as no
sign-in).

### D8. Browser previews get their own routes

**Decision**: `GET /api/preview/catalog`, `GET /api/preview/context` and `POST /api/preview/plan` take
the parameters of their agent twins and read the editing view. They accept the browser surface only.
The frontend's `agent-paths.ts` and `api.ts` switch to them. The agent routes always read the
snapshot.

**Rationale**: a preview is a different product from a production plan (E5: "must not ... disguise
one as a preview"). Separate routes make the difference visible in the inventory, the audit trail and
the documentation. The handlers are shared; only the document source differs, so the planner and the
context builder remain one implementation (Principle III).

**Alternatives**: keep one path and branch on surface (rejected: the local-mode guardrail would then
decide whether an agent request is production, a silent failure mode); a `?source=editing` parameter
(rejected, as in D6).

### D9. Local mode: authoring branch and Publish

**Decision**: while the default branch is checked out, the first commit switches to `work/local`
(created at HEAD, carrying staged and unstaged changes) and commits there. Publish fast-forwards the
default ref to the authoring head with `git update-ref <ref> <new> <old>` while the working tree is
untouched. An unborn default branch is created the same way, with an empty old value.

**Rationale**: it needs no second checkout and no change to how local files are edited. The `work/`
prefix already marks a personal branch (`isPersonalBranch`), so existing branch lists, holders and
labels treat it correctly. Compare-and-swap is the same primitive `moveDefault` uses.

**Alternatives**: refuse commits on the default branch (rejected: breaks the owner's core path of
"change the yamls, commit"); keep committing on the default branch and call a commit a publication
(rejected: it contradicts E4 and cannot separate a draft commit from a release); a separate local
base checkout like server mode (rejected: a second copy of every file on a laptop to solve a problem
object reads already solve).

### D10. Interrupted publication

**Decision**: before the ref moves, the pointer file records `intent: <next>`. After the ref moves,
the pointer becomes `commit: <next>` and the intent clears. At start: if `intent` equals the ref, the
publication is completed; if the ref still equals `commit`, the intent is dropped; any other ref value
is an outside move.

**Rationale**: the same pattern the journal gives multi-file operations (Principle IV), with the state
small enough that a dedicated journal entry would add nothing. It never serves a commit nobody
published and never loses a publication whose ref moved.

**Alternatives**: write the pointer after the ref only (rejected: a stop between them is
indistinguishable from an outside move, and a real publication would need re-adoption).

### D11. Historical provenance

**Decision**: a revision is acceptable when it matches `^[0-9a-f]{40}$` (or 64 for SHA-256
repositories) and `git merge-base --is-ancestor <rev> <pointer-commit>` succeeds, or when it is a
tag under `refs/tags/` whose `<tag>^{commit}` passes the same test. Anything else, including a branch
name, an abbreviated id, a blob or a tree id, answers as "not found". People's history reads accept
the same set plus commits reachable from the head of the place the person reads.

**Rationale**: it is the E11 rule ("provider-published history or release tags resolving to it, never
arbitrary commits from the object store") expressed as one Git query. An ancestor query is cheap and
exact; reachability from the person's head keeps the history view working for their own commits.

**Alternatives**: restrict to a list of published commits kept in the pointer file (rejected: grows
without bound and must be backfilled for existing history); allow any reachable-from-any-ref commit
(rejected: includes personal and proposal branches).

### D12. Publication checks

**Decision**: an ordered list of functions `(candidate) => Promise<void>` that throw a typed refusal:
fast-forward, tree readable and bounded, then the existing content guard judgement. `moveDefault` and
adoption both run the list. Later features append members.

**Rationale**: three checks that must run in a fixed order for more than one entry point is the
problem a small chain solves; naming it keeps E10 and E11 additions from touching the entry points.
It is a plain array, not a framework.

### D13. Where the snapshot answer meets the HTTP layer

**Decision**: agent routes call `published.documents(pin, view)`, which returns the same document
shape as `documentsFor`. The header `X-Workbench-Snapshot` carries the commit of the pin. A project
without a snapshot raises `SnapshotUnavailableError`, mapped to HTTP 409 with
`{ error: "no published snapshot", code: "no-published-snapshot" }`, raised only after the readable
check so a hidden project still answers as unknown.

**Rationale**: it keeps the planner, the context builder and the explainers untouched and puts the one
new branch at the edge. 409 is already used for state conflicts (`OccupiedError`), so clients have a
precedent for "valid request, wrong state".

### D14. Export

**Decision**: `exportProject` takes `source: 'editing' | 'published'`. For `published` it feeds the zip
planner the snapshot's entries instead of a folder walk; history is refused with it.

**Rationale**: the planner already works from a list of paths and bytes. Keeping the default unchanged
keeps Principle II (drafts exportable).

## 3. Performance expectations

Today each agent request calls `readFileSync` for every readable definition file. The snapshot index
holds decoded sources, so a warm request does no file I/O and should be faster. The cold path costs one
`ls-tree`, one `cat-file --batch` and parsing of files whose content hash is new. SC-008 asks the task
to measure both on the three example workspaces (`examples/`), and the docs record the fixture and the
command (Principle VII). No number is quoted here.

## 4. What this feature does not decide

- The shape of the dependency manifest and floating-import resolution (E11): this feature gives
  the pin and the provenance check they need and adds no manifest.
- Set-level validity (E10): the check list has room for it.
- Release tag creation and listing (A9): only the membership test exists here.
- A pointer reset after a non-fast-forward outside move: reported, not repaired.
- MCP connection credentials and operation boundary: the surface is `agent` for anything that is not a
  browser, so they inherit the rule.
