# Quickstart: checking the published snapshot by hand

These steps use a scratch data root and a spare port, never a real workspace.

## Local mode

1. Start a scratch workspace: `DATA_DIR=$(mktemp -d) bun scripts/dev.ts` and import
   `examples/billing` as a project.
2. Open Source Control. It shows `Published: main @ <short commit>` with the notice that explains the
   change on first start.
3. Edit a metric in the editor and save, without committing.
4. Call `GET /api/agent/catalog?project=billing` and `POST /api/agent/plan` with `curl` (no `Origin`
   header). The edit is absent. Call `GET /api/preview/context` with
   `-H 'Sec-Fetch-Site: same-origin'`: the edit is present.
5. Commit in the UI. Source Control reports the branch as `work/local` and the default branch has not
   moved. The agent calls still do not show the edit.
6. Press Publish. The header `X-Workbench-Snapshot` of the next agent call equals the new commit and
   the edit is present.
7. In a terminal run `git commit --allow-empty -m outside` on `main`. Source Control shows a pending
   move; agent calls keep the previous commit; press Adopt and the header changes.

## Server mode

1. Use the loopback Keycloak profile (`docs/server-mode.md`) with a Steward, a Viewer and an
   application.
2. As the Steward, edit a mapping, do not publish. Call the agent routes as the Steward's session
   and as the application: bodies are identical.
3. Publish. Both now show the edit and the same header.
4. As a Viewer without access to a project, call its agent catalog: the answer equals the answer for a
   project that does not exist.
5. In the scratch repository, delete the loose object file of one definition's blob, then call the
   catalog as a reader: `409 no-published-snapshot` with reason `unavailable`.

## Automated

```bash
bun test tests/server/published-pointer.test.ts tests/server/snapshot-index.test.ts \
  tests/server/published-snapshot.test.ts tests/server/publication-checks.test.ts \
  tests/server/local-publication.test.ts tests/server/request-surface.test.ts \
  tests/server/agent-sources.test.ts tests/server/snapshot-history.test.ts
bun run test:mutation
bun scripts/published-snapshot-browser-check.ts
```
