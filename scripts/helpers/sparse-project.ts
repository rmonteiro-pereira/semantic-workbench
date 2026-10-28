// Adds a project that lives in one folder of a team repository to a server-mode data root, the
// way a clone of that folder leaves it: a partial, sparse clone registered with its folder and
// given to the Sales domain. The team repository is a local bare repository, so nothing here
// touches a network.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ontology } from '../../tests/helpers/scm';

/** The slug and folder of the sparse project the check adds. */
export const SPARSE_SLUG = 'sparse-team';
export const SPARSE_FOLDER = 'semantic/ubl';
/** A folder of the team repository that must never reach the disk. */
export const SPARSE_OTHER_FOLDER = 'semantic/crm';

function git(cwd: string, args: string[]) {
  const identity = ['-c', 'user.name=Team', '-c', 'user.email=team@example.invalid'];
  const result = Bun.spawnSync(['git', ...identity, ...args], { cwd });
  if (result.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
}

function writeTeamFiles(work: string) {
  for (const [path, text] of Object.entries({
    // The title is long enough to fill the header, which opens this file when the project is chosen.
    [`${SPARSE_FOLDER}/shop.yaml`]: ontology('Buys.').replace('name: Shop', 'name: Shop catalogue'),
    [`${SPARSE_OTHER_FOLDER}/crm.yaml`]: ontology('Sells.'),
    'README.md': 'Team repository.\n',
  })) {
    mkdirSync(join(work, path, '..'), { recursive: true });
    writeFileSync(join(work, path), text);
  }
}

/** Builds the team repository and returns the bare repository's folder. */
export function teamBareRepository() {
  const base = mkdtempSync(join(tmpdir(), 'workbench-sparse-team-'));
  const bare = join(base, 'team.git');
  const work = join(base, 'work');
  git(base, ['init', '-q', '--bare', '-b', 'main', bare]);
  git(base, ['clone', '-q', bare, work]);
  writeTeamFiles(work);
  git(work, ['add', '-A']);
  git(work, ['commit', '-qm', 'Team files']);
  git(work, ['push', '-q', 'origin', 'HEAD:main']);
  return bare;
}

/** Clones one folder of the team repository into the data root and registers it for Sales. */
export function addSparseProject(root: string) {
  const bare = teamBareRepository();
  const projects = join(root, 'projects');
  git(projects, [
    'clone',
    '-q',
    '--filter=blob:none',
    '--no-checkout',
    `file://${bare}`,
    SPARSE_SLUG,
  ]);
  const repository = join(projects, SPARSE_SLUG);
  git(repository, ['config', 'extensions.worktreeConfig', 'true']);
  git(repository, ['sparse-checkout', 'set', '--cone', '--', SPARSE_FOLDER]);
  git(repository, ['switch', '-q', 'main']);
  registerProject(root);
  grantToSales(root);
  return bare;
}

function registerProject(root: string) {
  const file = join(root, 'state', 'projects.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  registry.projects.push({
    slug: SPARSE_SLUG,
    name: 'Sparse team',
    createdAt: new Date().toISOString(),
    origin: 'clone',
    folder: `${SPARSE_SLUG}/${SPARSE_FOLDER}`,
    repo: SPARSE_SLUG,
  });
  writeFileSync(file, JSON.stringify(registry, null, 2));
}

function grantToSales(root: string) {
  const file = join(root, 'admin', 'projects.json');
  const access = JSON.parse(readFileSync(file, 'utf8'));
  access.projects[SPARSE_SLUG] = {
    domain: 'sales',
    stewards: ['bob@example.org'],
    restricted: [],
    protectedBranches: ['main'],
  };
  writeFileSync(file, JSON.stringify(access, null, 2));
}
