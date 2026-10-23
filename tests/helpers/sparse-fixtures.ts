// A team repository with several folders, kept as a local bare repository so sparse-checkout
// tests need no network. Another person's clone stands for a colleague who pushes changes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isolateGit, testWorkspace } from './temp-data-dir';
import { call, ok, ontology, sh } from './scm';

/** The folder the sparse tests check out, and the team's other folders. */
export const PROJECT_FOLDER = 'semantic/ubl';
export const OTHER_FOLDER = 'semantic/crm';

/** A bare team repository, its address for a partial clone, and a colleague's working clone. */
export type TeamRepository = {
  bare: string;
  /** A file:// address, which is what makes Git honour a partial clone filter. */
  address: string;
  colleague: string;
  /**
   * Commits files in the colleague's clone and pushes them to the bare repository. A branch that
   * does not exist yet starts from `main`. A file whose text is null is deleted.
   */
  push(files: Record<string, string | null>, message: string, branch?: string): void;
  dispose(): void;
};

function writeFiles(root: string, files: Record<string, string | null>) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(root, path), { force: true });
      continue;
    }
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** Builds the repository with `semantic/ubl`, `semantic/crm` and a root README on `main`. */
export function teamRepository(): TeamRepository {
  isolateGit();
  const root = mkdtempSync(join(tmpdir(), 'workbench-sparse-'));
  const bare = join(root, 'team.git');
  sh(root, ['init', '-q', '--bare', '-b', 'main', bare]);
  sh(bare, ['config', 'uploadpack.allowFilter', 'true']);
  sh(bare, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  const colleague = join(root, 'colleague');
  sh(root, ['clone', '-q', bare, colleague]);
  writeFiles(colleague, {
    [`${PROJECT_FOLDER}/shop.yaml`]: ontology('Buys.'),
    [`${OTHER_FOLDER}/crm.yaml`]: ontology('Sells.'),
    'README.md': 'Team repository.\n',
  });
  sh(colleague, ['add', '-A']);
  sh(colleague, ['commit', '-qm', 'Team files']);
  sh(colleague, ['push', '-q', 'origin', 'HEAD:main']);
  return {
    bare,
    address: `file://${bare}`,
    colleague,
    push(files, message, branch = 'main') {
      sh(colleague, ['fetch', '-q', 'origin']);
      const exists = sh(colleague, ['branch', '-r', '--list', `origin/${branch}`]).trim() !== '';
      sh(colleague, ['checkout', '-q', '-B', branch, `origin/${exists ? branch : 'main'}`]);
      writeFiles(colleague, files);
      sh(colleague, ['add', '-A']);
      sh(colleague, ['commit', '-qm', message]);
      sh(colleague, ['push', '-q', 'origin', `HEAD:${branch}`]);
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

type Workspace = Awaited<ReturnType<typeof testWorkspace>>;
type CloneOutcome = { op: string; phase: string; message?: string; missingFolder?: string };

/** Waits for the last event of a clone: done, failed or cancelled. */
export async function cloneOutcome(app: Workspace, op: string): Promise<CloneOutcome> {
  for (let tries = 0; tries < 800; tries++) {
    const events = app.ws.events.replay(0)!.filter(event => event.event === 'clone');
    const last = events
      .map(event => event.data as CloneOutcome)
      .filter(data => data.op === op)
      .pop();
    if (last && ['done', 'failed', 'cancelled'].includes(last.phase)) return last;
    await Bun.sleep(25);
  }
  throw Error('The clone did not finish.');
}

/** Clones a folder of the team repository and returns the project's slug and folders. */
export async function cloneFolder(
  app: Workspace,
  team: TeamRepository,
  folder = PROJECT_FOLDER,
  createFolder = false,
) {
  const started = await ok(
    call(app, 'POST', '/api/clone', { url: team.address, folder, createFolder }),
  );
  const done = await cloneOutcome(app, started.op);
  const repository = join(app.root, 'projects', started.slug);
  return { ...started, done, repository, project: join(repository, folder) };
}
