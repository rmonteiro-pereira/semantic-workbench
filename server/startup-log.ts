// Reports recovery and Git setup after the workspace becomes available.
import type { Workspace } from './projects/workspace';
import { log } from './observability/log';

/** Explains recovered work and missing Git setup to the operator. */
export async function logWorkspace(ws: Workspace) {
  for (const recovery of ws.recovery) {
    log.info('startup.recovery', {
      kind: recovery.kind,
      operation: recovery.opId,
      outcome: recovery.outcome,
    });
  }
  if (ws.migration) {
    const migration = ws.migration;
    log.info('startup.migration', {
      status: migration.status,
      reason: migration.reason,
      verified: migration.status === 'completed' ? migration.verified : undefined,
      files: migration.status === 'completed' ? migration.files : undefined,
      projects: migration.status === 'completed' ? migration.projects.length : undefined,
      backup: migration.status === 'completed' ? migration.backup : undefined,
    });
  }
  if (!ws.gitAvailable) {
    log.warn('startup.git-missing', {
      detail:
        'Git 2.40 or newer was not found; projects are not version-controlled until it is installed.',
    });
    return;
  }
  const missing = (await ws.repositoryStatus()).filter(
    repository => !repository.identityConfigured,
  );
  if (missing.length) {
    log.warn('startup.git-identity-missing', {
      repositories: missing.length,
      detail: 'Set user.name and user.email in the app to commit there.',
    });
  }
}
