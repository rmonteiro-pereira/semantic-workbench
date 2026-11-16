# Contract: HTTP changes

All routes keep their authentication, CSRF, authorization and audit behaviour. This file lists only
what changes.

## Agent routes (read source: `published`)

| Route | Change |
|---|---|
| `GET /api/agent/projects` | Unchanged. Lists the readable projects. |
| `GET /api/agent/catalog?project=` | Mappings of the snapshot. Header added. |
| `GET /api/agent/context?project=&mappingId=&concept=` | Context of the snapshot. A mapping that exists only in unpublished work answers as an unknown mapping. Header added. |
| `POST /api/agent/plan` | Plan over the snapshot. Header added. |

Added response header on the three routes above and nowhere else:

```text
X-Workbench-Snapshot: <full commit id>
```

New answer when the project is readable and has no snapshot:

```text
409 Conflict
{ "error": "no published snapshot", "code": "no-published-snapshot", "reason": "no-git" | "no-commit" | "unavailable" }
```

An unreadable or unknown project keeps the answer it has today (`400`, `Project not found.`), whether or
not it has a snapshot.

## Preview routes (read source: `editing`, surface: `browser` only)

| Route | Same as |
|---|---|
| `GET /api/preview/catalog?project=` | `GET /api/agent/catalog` |
| `GET /api/preview/context?project=&mappingId=&concept=` | `GET /api/agent/context` |
| `POST /api/preview/plan` | `POST /api/agent/plan` |

Parameters, bodies, limits and error messages are those of the agent twins. They read the caller's
editing view (own working copy, or the working files in local mode). A request whose surface is
`agent` is refused with the answer an unknown route gets for that credential. They carry no snapshot
header. They are audited like the agent routes, under the person's own identity and action `read`.

## Routes declared `by-surface`

| Route | Browser | Any other credential |
|---|---|---|
| `GET /api/projects/:slug/metrics` | editing view | snapshot |
| `GET /api/projects/:slug/files/*/explain/:metric` | editing view | snapshot |

## Source Control

`GET /api/projects/:slug/git/status` gains an additive block:

```json
"published": {
  "state": "in-sync",
  "branch": "main",
  "commit": "<full id>",
  "pending": { "next": "<full id>", "commits": 2, "move": "fast-forward" }
}
```

`pending` is present only when `state` is `pending`. `state: "none"` carries `reason`.

| Route | Change |
|---|---|
| `POST /api/projects/:slug/git/publish` | In local mode: fast-forwards the default branch to the authoring head. Refusals name the fix. Server mode unchanged. |
| `POST /api/projects/:slug/git/adopt` | New. Adopts a pending fast-forward move after the publication checks. Action `publish`, resource every project of the repository, the same authorization as publish. Local mode: explicit action of the local person. Refuses a diverged move. |
| `POST /api/projects/:slug/git/commit` | In local mode, when the default branch is checked out, the response includes `{ branch: "work/local", movedFrom: "<default>" }` so the client can tell the person. |

## Export

`GET /api/projects/:slug/export?source=published` returns the snapshot's bytes for the files the
caller may read. `source=editing` is the default and the current behaviour. `history=1` with
`source=published` answers `400` "history is not available for the published source".

## Route inventory rows

Every row that can return a context, plan, explanation or document content carries
`readSource: 'published' | 'editing' | 'by-surface'`. The inventory test fails when such a row has
none. New rows: the three preview routes (`editing`), `git/adopt` (no source), and the export row
(`editing`, with the `source` parameter documented in its description).

## Errors

| Condition | Status | Body |
|---|---|---|
| Project has no snapshot (readable) | 409 | `no-published-snapshot` as above |
| Adopt a diverged move | 409 | `{ "error": "The default branch was moved outside the workbench and no longer contains the published commit. Make it a descendant of <commit> in Git." }` |
| Adopt with nothing pending | 409 | `{ "error": "Nothing to adopt." }` |
| Adopt without the publication right | 403 | the existing publish refusal |
| Publish when authoring is not a descendant | 409 | `{ "error": "Merge <default> into <authoring> first." }` |
| Preview route with an agent credential | as an unknown route | |
