# Server-Sent Events Contract (`GET /api/events`)

- Content type `text/event-stream`; heartbeat comment `: ping` every 15 s.
- Every event has a monotonically increasing `id`. On reconnect the browser sends
  `Last-Event-ID`; missed events are replayed from a bounded ring (last 1,000 events). If the id is
  older than the ring, the server sends `resync` and the client refetches everything.
- Events invalidate; they never carry file contents. Clients refetch the named resources.

| `event` | `data` (JSON) | Emitted when |
| --- | --- | --- |
| `files` | `{project, changed: [path], removed: [path]}` | watcher or save detected changed hashes |
| `projects` | `{added: [slug], removed: [slug], renamed: [{slug, name}]}` | create, delete, restore, clear, rename |
| `git` | `{project, branch, ahead, behind, changes: number, altered: [path]}` | after any Git operation or `.git/HEAD`/`index` change |
| `trash` | `{entries: [entryId], undoUntil?}` | delete, undo, restore, purge |
| `suggestions` | `{open: number}` | suggestion set changed |
| `drafts` | `{project, path, state: 'stale'}` | the file under a draft changed on disk |
| `resync` | `{}` | replay not possible |
| `recovery` | `{opId, outcome: 'completed'\|'rolled-back', paths}` | a journaled operation was recovered on start |
