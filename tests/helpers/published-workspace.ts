// Commits fixture definitions explicitly before reopening them as production snapshots.
import { join } from 'node:path';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { createHandler } from '../../src/server/handler';
import { locationOf } from '../../src/server/projects/paths';
import { openWorkspace } from '../../src/server/projects/workspace';
import type { testWorkspace } from './temp-data-dir';

/** Publishes a fixture's tracked definition files without making uncommitted edits visible. */
export async function publishFixture(fixture: Awaited<ReturnType<typeof testWorkspace>>) {
  const repositories = new Set(fixture.ws.state.registry().projects.map(project => locationOf(project).repo));
  const published = fixture.ws.state.published();
  for (const repository of repositories) {
    const directory = join(fixture.root, 'projects', repository);
    const run = (args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: process.env });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    run(['add', '-A']);
    const changes = Bun.spawnSync(['git', 'diff', '--cached', '--quiet'], { cwd: directory, env: process.env });
    if (changes.exitCode === 1) run(['commit', '-qm', 'Publish fixture definitions']);
    else if (changes.exitCode !== 0) throw new Error(changes.stderr.toString());
    const configured = Bun.spawnSync(['git', 'config', '--local', '--get', 'workbench.defaultBranch'], { cwd: directory, env: process.env });
    const branch = configured.exitCode === 0 ? configured.stdout.toString().trim() : run(['branch', '--show-current']);
    const commit = run(['rev-parse', 'HEAD']);
    run(['update-ref', `refs/heads/${branch}`, commit]);
    run(['switch', branch]);
    published.repositories[repository] = { branch, commit };
  }
  fixture.ws.state.writePublished(published);
  fixture.ws.close();
  const previousDispose = fixture.dispose;
  const workspace = await openWorkspace({ root: fixture.root });
  fixture.ws = workspace;
  fixture.handler = createHandler(workspace);
  fixture.seed = (files, name) => workspace.importBatch({ files, ...(name ? { name } : {}) }, LOCAL_READER);
  fixture.dispose = () => {
    workspace.close();
    previousDispose();
  };
  fixture[Symbol.dispose] = fixture.dispose;
}
