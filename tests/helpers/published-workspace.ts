// Commits fixture definitions explicitly before reopening them as production snapshots.
import { join } from 'node:path';
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
      const result = Bun.spawnSync(['git', ...args], { cwd: directory });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    run(['add', '-A']);
    run(['commit', '--allow-empty', '-qm', 'Publish fixture definitions']);
    published.repositories[repository] = { branch: run(['branch', '--show-current']), commit: run(['rev-parse', 'HEAD']) };
  }
  fixture.ws.state.writePublished(published);
  fixture.ws.close();
  const previousDispose = fixture.dispose;
  const workspace = await openWorkspace({ root: fixture.root });
  fixture.ws = workspace;
  fixture.handler = createHandler(workspace);
  fixture.dispose = () => {
    workspace.close();
    previousDispose();
  };
  fixture[Symbol.dispose] = fixture.dispose;
}
