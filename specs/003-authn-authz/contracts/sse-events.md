# Live-Update Events: changes in v0.4.0

Base: [002 SSE events](../../002-lineage-and-ux/contracts/sse-events.md). Event names and payloads
are unchanged; delivery changes in server mode.

- `GET /api/events` requires the session cookie; each connection carries its principal and
  working-copy id.
- Every emission requires explicit tags: `{ audience: 'all' }` for globally safe payloads, or
  `projects`/`paths` covering every resource named in the payload. Optional `owner` and `copy`
  tags further restrict delivery. Payload fields never grant access.
- Resource-list events are reduced to readable tagged items or dropped when none remain.
  Trash carries original paths; identity tags the projects sharing its repository. Recovery
  broadcasts omit resource names and carry an explicit all-reader audience.
- Trash events are opaque and follow the trash listing's rule: every original path must be
  readable and restorable by the person (`restoreOwn` for their own entries, `restoreOthers`
  otherwise). An entry without original paths, such as a deleted empty project, reaches whoever
  may restore that project.
- `projects {removed}` and the trash events of a project deletion are judged when published,
  before the project leaves the registry: the server records which connected principals can
  read each removed project then. Each of them receives the removal with only the slugs they
  could read; anyone else receives nothing and never learns the slug. A tab that reconnects
  refetches everything, so a removal it missed while offline is not lost.
- Each delivery obtains a fresh view from the connection's scope, including projects created
  after connection. Reconnect replay applies the same filter; `resync` contains no resource data.
- `suggestions {open}` is per person in server mode. The workspace emits a payload-free trigger
  that is never delivered; after a short debounce the server builds one shared file index and
  computes each connected principal's count from it, outside synchronous emission. A person
  receives `open` when their count changes, even if nobody else's did; a failure for one person
  is logged and skipped. Reconnects compute a fresh personal count. Clients without a personal
  scope (local mode) share one count, sent only when it changes.
- New event `access {reason: 'changed'|'session-ended'}` followed by stream close: sent when the
  person's access configuration changes or the session ends; the client reloads `/api/me` and the
  workspace, or goes to sign-in.
- New event `published {project, branch, commit}` to every reader of the project after a publish.
