// Builds a temporary data root from the access fixture: its projects imported through the
// workspace, and its access configuration copied to the administration folder.
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testWorkspace } from './temp-data-dir';

/** Folder of the access fixture. */
export const AUTH_FIXTURE = 'tests/fixtures/auth-workspace';

/** Project slugs of the fixture, in import order. */
export const AUTH_PROJECTS = ['shared-reference', 'sales-metrics', 'sales-contracts', 'hr-people', 'lab-notes'] as const;

/** Every file of one fixture project, with its path inside the project and its text. */
export function fixtureFiles(project: string) {
  const root = join(AUTH_FIXTURE, 'projects', project);
  const files: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push({ path: relative(root, full), source: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return files;
}

/** The marker string a file of the fixture carries, which must never leak to a non-reader. */
export const leakMarker = (project: string, path: string) => `LEAK-${project}-${path}`;

/**
 * Opens a disposable workspace holding the fixture projects. With `keycloak`, the grants keyed
 * by group names replace the Entra-shaped ones.
 */
export async function authWorkspace(options: { keycloak?: boolean } = {}) {
  const workspace = await testWorkspace();
  for (const project of AUTH_PROJECTS) {
    const imported = await workspace.seed(fixtureFiles(project), project);
    if (imported.slug !== project) throw Error(`Fixture project imported as ${imported.slug}.`);
  }
  const admin = join(workspace.root, 'admin');
  mkdirSync(admin, { recursive: true });
  cpSync(join(AUTH_FIXTURE, 'admin'), admin, { recursive: true });
  if (options.keycloak) {
    cpSync(join(AUTH_FIXTURE, 'admin-keycloak', 'grants.json'), join(admin, 'grants.json'));
  }
  return workspace;
}
