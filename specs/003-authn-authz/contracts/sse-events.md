# Live-Update Events: changes in v0.4.0

Base: [002 SSE events](../../002-lineage-and-ux/contracts/sse-events.md). Event names and payloads
are unchanged; delivery changes in server mode.

- `GET /api/events` requires the session cookie; each connection carries its principal and
  working-copy id.
- Each emitted event is tagged at emit time with `projects`, `paths`, `owner` (drafts, trash,
  clone) and `copy` (the working copy it happened in). A connection receives an event only if
  the principal can read every project and path it names, it is the owner of owned events, and
  copy-scoped events (file changes, Git state) match its own copy or the published state it reads.
  Events naming several items are reduced to the readable ones, or dropped if none remain.
- Replay after reconnect applies the same filter; `resync` stays unfiltered (no data).
- `suggestions {open}` becomes the count of the receiving person's suggestions.
- New event `access {reason: 'changed'|'session-ended'}` followed by stream close: sent when the
  person's access configuration changes or the session ends; the client reloads `/api/me` and the
  workspace, or goes to sign-in.
- New event `published {project, branch, commit}` to every reader of the project after a publish.
