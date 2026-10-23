// A partial clone downloads file contents while it checks them out. In server mode that download
// must carry the person's credential for the remote, or a private repository fails right after
// the clone succeeded.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit, type RemoteCredential } from '../../server/projects/git';
import { checkOutFolder } from '../../server/projects/sparse-folder';
import { isolateGit } from '../helpers/temp-data-dir';
import { sh } from '../helpers/scm';
import { PROJECT_FOLDER, teamRepository, type TeamRepository } from '../helpers/sparse-fixtures';
import { startCredentialGitServer, type CredentialGitServer } from './credential-git-server';

const TOKEN = 'sparse-test-token';
let root = '';
let server: CredentialGitServer;
let team: TeamRepository;
let address = '';

beforeAll(() => {
  isolateGit();
  root = mkdtempSync(join(tmpdir(), 'workbench-sparse-credentials-'));
  server = startCredentialGitServer(join(root, 'git'), async (_user, password) =>
    password === TOKEN ? 'tester' : null,
  );
  address = server.repository('team.git');
  team = teamRepository();
  const served = server.folder('team.git');
  sh(served, ['config', 'uploadpack.allowFilter', 'true']);
  sh(served, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  sh(team.colleague, ['push', '-q', served, 'HEAD:main']);
});

afterAll(async () => {
  await server.stop();
  team.dispose();
  rmSync(root, { recursive: true, force: true });
});

const credential: () => RemoteCredential = () => ({
  kind: 'token',
  username: 'person',
  token: TOKEN,
  host: server.host,
});

async function partialClone(name: string) {
  const projects = join(root, 'projects', name);
  mkdirSync(projects, { recursive: true });
  const git = createGit({ projectsRoot: join(root, 'projects') });
  await git.clone(projects, address, 'repo', credential(), { partial: true });
  return { git, dir: join(projects, 'repo') };
}

test('the first checkout of a private partial clone uses the person credential', async () => {
  const { git, dir } = await partialClone('with-credential');
  await checkOutFolder(git, dir, PROJECT_FOLDER, { createFolder: false, credential: credential() });
  expect(existsSync(join(dir, PROJECT_FOLDER, 'shop.yaml'))).toBe(true);
  expect(sh(dir, ['status', '--porcelain'])).toBe('');
  expect(server.requests.every(request => request.identity === 'tester')).toBe(true);
});

test('without the credential the first checkout cannot download the files', async () => {
  const { git, dir } = await partialClone('without-credential');
  await expect(checkOutFolder(git, dir, PROJECT_FOLDER, { createFolder: false })).rejects.toThrow();
});
