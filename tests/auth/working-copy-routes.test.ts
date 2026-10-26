// Requests that touch a person's working copy only when they should: publishing and cancelling
// without a copy, a refused move, a branch an Admin's rule keeps from being pushed, the manifest
// an Admin saves, and how much Git a project listing runs.
import { expect, spyOn, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { MANIFEST_FILE } from '../../src/server/projects/repositories';
import { DEFAULT_BRANCH_KEY } from '../../src/server/projects/worktrees';
import { authWorkspace } from '../helpers/auth-workspace';
import { accessFixture, person } from './access-fixture';
import { moveCase } from './guard-cases';
import { copyFolder, gitOutput, openCopy, signedIn } from './working-copy-fixture';

const REPO = 'sales-contracts';
const API = `/api/projects/${REPO}/git/`;

test('publishing, cancelling or pushing main without a copy answers without creating one', async () => {
  using fixture = await authWorkspace();
  const bob = signedIn(fixture.ws)(person('bob'));
  const published = await bob.call(API + 'publish', 'POST', {});
  expect(published.status).toBe(409);
  expect(published.body.nothingToPublish).toBe(true);
  expect((await bob.call(API + 'cancel', 'POST', {})).status).toBe(200);
  // Without a remote the push fails, but it must not start a copy either way.
  await bob.call(API + 'push-default', 'POST', {});
  expect(existsSync(fixture.ws.layout.worktrees)).toBe(false);
});

test('a refused move into another repository leaves no copy of it behind', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, REPO)).status).toBe(200);
  const item = moveCase();
  const refused = await alice.call(item.path, item.method, item.body);
  expect(refused.status).toBe(403);
  const target = copyFolder(fixture.ws, alice.principal.key, 'sales-metrics');
  expect(existsSync(target)).toBe(false);
});

test('a branch an Admin rule keeps from being pushed needs the publish right to check out', async () => {
  using fixture = await authWorkspace();
  const options = accessFixture();
  options.config.adminRules = {
    'release-freeze':
      'forbid (principal, action == SW::Action::"push", resource) when { context.branch == "release" };',
  };
  const as = signedIn(fixture.ws, createAccessControl(options));
  gitOutput(join(fixture.ws.layout.projects, REPO), ['branch', 'release']);
  const frank = as(person('frank'));
  expect((await openCopy(frank.call, REPO)).status).toBe(200);
  const toRelease = { branch: 'release', create: false };
  expect((await frank.call(API + 'switch', 'POST', toRelease)).status).toBe(403);
  const other = { branch: 'frank-notes', create: true };
  expect((await frank.call(API + 'switch', 'POST', other)).status).toBe(200);
  const bob = as(person('bob'));
  expect((await openCopy(bob.call, REPO)).status).toBe(200);
  expect((await bob.call(API + 'switch', 'POST', toRelease)).status).toBe(200);
});

test('an Admin’s manifest is committed in their copy and reaches the published state on publish', async () => {
  using fixture = await authWorkspace();
  const dave = signedIn(fixture.ws)(person('dave'));
  const base = join(fixture.ws.layout.projects, REPO);
  const chosen = { projects: [{ path: 'finance' }], saveManifest: true, manifestBaseHash: null };
  const registered = await dave.call(`/api/repos/${REPO}/projects`, 'PUT', chosen);
  expect(registered.status).toBe(200);
  expect(existsSync(join(base, MANIFEST_FILE))).toBe(false);
  const copy = copyFolder(fixture.ws, dave.principal.key, REPO);
  expect(gitOutput(copy, ['ls-files', MANIFEST_FILE]).text).toBe(MANIFEST_FILE);
  expect(gitOutput(copy, ['status', '--porcelain']).text).toBe('');
  const slug = registered.body.projects[0].slug;
  expect((await dave.call(`/api/projects/${slug}/git/publish`, 'POST', {})).status).toBe(200);
  expect(existsSync(join(base, MANIFEST_FILE))).toBe(true);
});

test('a project listing asks Git for the worktree list and default branch once per repository', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, REPO)).status).toBe(200);
  expect((await alice.call('/api/projects')).status).toBe(200);
  const spawn = spyOn(Bun, 'spawn');
  try {
    expect((await alice.call('/api/projects')).status).toBe(200);
    const commands = spawn.mock.calls.map(call => (call[0] as string[]).join(' '));
    // The worktree list is kept between listings until a copy or a branch changes.
    expect(commands.filter(command => command.includes('worktree list'))).toEqual([]);
    const projects = fixture.ws.state.registry().projects;
    const repositories = new Set(projects.map(project => fixture.ws.repoOf(project.slug))).size;
    const defaults = commands.filter(command => command.includes(DEFAULT_BRANCH_KEY));
    expect(defaults.length).toBeLessThanOrEqual(repositories);
  } finally {
    spawn.mockRestore();
  }
});

test('a manifest saved while the Admin’s copy is merging is refused and the registry stays', async () => {
  using fixture = await authWorkspace();
  const dave = signedIn(fixture.ws)(person('dave'));
  expect((await openCopy(dave.call, REPO)).status).toBe(200);
  const copy = copyFolder(fixture.ws, dave.principal.key, REPO);
  // Two branches change one file differently, and merging them stops on the conflict.
  const identity = ['-c', 'user.name=Dave', '-c', 'user.email=dave@example.org'];
  const commitNote = (text: string) => {
    writeFileSync(join(copy, 'note.md'), text);
    gitOutput(copy, ['add', 'note.md']);
    gitOutput(copy, [...identity, 'commit', '-q', '-m', text]);
  };
  const branch = gitOutput(copy, ['branch', '--show-current']).text;
  gitOutput(copy, ['switch', '-q', '-c', 'other']);
  commitNote('other\n');
  gitOutput(copy, ['switch', '-q', branch]);
  commitNote('mine\n');
  gitOutput(copy, [...identity, 'merge', '-q', 'other']);
  const before = fixture.ws.state.registry().projects.map(project => project.slug);
  const chosen = { projects: [{ path: 'finance' }], saveManifest: true, manifestBaseHash: null };
  const refused = await dave.call(`/api/repos/${REPO}/projects`, 'PUT', chosen);
  expect(refused.status).toBe(409);
  expect(fixture.ws.state.registry().projects.map(project => project.slug)).toEqual(before);
  expect(existsSync(join(copy, MANIFEST_FILE))).toBe(false);
});
