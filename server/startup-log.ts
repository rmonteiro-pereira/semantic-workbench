// Reports recovery and Git setup after the workspace becomes available.
import type { Workspace } from './projects/workspace';

/** Explains recovered work and missing Git setup to the operator. */
export async function logWorkspace(ws: Workspace) {
  for (const recovery of ws.recovery) {
    console.log(`[recovery] ${recovery.kind} ${recovery.opId}: ${recovery.outcome}`);
  }
  if (ws.migration) {
    const migration = ws.migration;
    let detail = migration.reason ? `: ${migration.reason}` : '';
    if (migration.status === 'completed') {
      detail += ` (${migration.verified}/${migration.files} files verified`;
      detail += ` in ${migration.projects.length} projects; backup ${migration.backup})`;
    }
    console.log(`[migration] ${migration.status}${detail}`);
  }
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
        `[git] ${missing.length} repositories have no user.name/user.email; ` +
          'set them in the app to commit there.',
      );
  }
}
