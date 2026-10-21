// Starts the local API with workspace recovery, migration, and file watching.
import { openWorkspace } from './projects/workspace';
import { createHandler } from './handler';
// `bun --hot` reruns this module, so close the previous workspace before reopening it.
const hot = globalThis as { __workbench?: { close(): void } };
hot.__workbench?.close();
const ws = await openWorkspace({ watch: true });
hot.__workbench = ws;
for (const r of ws.recovery) console.log(`[recovery] ${r.kind} ${r.opId}: ${r.outcome}`);
if (ws.migration)
  console.log(
    `[migration] ${ws.migration.status}${ws.migration.reason ? `: ${ws.migration.reason}` : ''}${ws.migration.status === 'completed' ? ` (${ws.migration.verified}/${ws.migration.files} files verified in ${ws.migration.projects.length} projects; backup ${ws.migration.backup})` : ''}`,
  );
if (!ws.gitAvailable)
  console.log(
    '[git] Git 2.40 or newer was not found; projects are not version-controlled until it is installed.',
  );
else {
  const missing = (await ws.repositoryStatus()).filter(
    repository => !repository.identityConfigured,
  );
  if (missing.length)
    console.log(
      `[git] ${missing.length} repositories have no user.name/user.email; set them in the app to commit there.`,
    );
}
// SSE connections stay open; heartbeats every 15 s keep them alive, so disable the idle timeout.
Bun.serve({ hostname: '127.0.0.1', port: 4310, idleTimeout: 0, fetch: createHandler(ws) });
console.log(`Workbench API: http://127.0.0.1:4310 (data root ${ws.layout.root})`);
