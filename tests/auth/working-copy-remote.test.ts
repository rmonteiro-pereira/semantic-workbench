// A person's copy meets the remote. Pull on their own work branch takes the remote's default
// branch and says so. Push <default> sends the published default branch. A fetch moves the
// published default branch forward when the remote is ahead of it. It does so only for someone
// who may publish, and only when the content guards accept what the remote brings.
import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { copyFolder, gitOutput, openCopy, signedIn } from './working-copy-fixture';

const REPO = 'sales-contracts';
const API = `/api/projects/${REPO}/git/`;
const IDENTITY = ['-c', 'user.name=Remote', '-c', 'user.email=remote@example.org'];

// A bare remote cloned from the fixture repository, set as its `origin`, and a clone of it in
// which a test makes commits that arrive from elsewhere.
function withRemote(base: string) {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-copy-remote-'));
  const bare = join(folder, 'remote.git');
  gitOutput(folder, ['clone', '-q', '--bare', base, bare]);
  gitOutput(base, ['remote', 'add', 'origin', bare]);
  const other = join(folder, 'other');
  gitOutput(folder, ['clone', '-q', bare, other]);
  const pushEdit = (name: string, edit: (text: string) => string) => {
    const file = join(other, name);
    writeFileSync(file, edit(existsSync(file) ? readFileSync(file, 'utf8') : ''));
    gitOutput(other, ['add', name]);
    gitOutput(other, [...IDENTITY, 'commit', '-q', '-m', 'Change ' + name]);
    gitOutput(other, ['push', '-q', 'origin', 'HEAD:main']);
    return gitOutput(other, ['rev-parse', 'HEAD']).text;
  };
  const pushFile = (name: string) => pushEdit(name, () => name + '\n');
  return { bare, pushFile, pushEdit, [Symbol.dispose]: () => rmSync(folder, { recursive: true }) };
}

test('Pull on a person’s own work branch takes origin/main and names it; other branches do not', async () => {
  using fixture = await authWorkspace();
  const base = join(fixture.ws.layout.projects, REPO);
  using remote = withRemote(base);
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, REPO)).status).toBe(200);
  const status = await alice.call(API + 'status');
  expect(status.body.pullSource).toBe('origin/main');
  remote.pushFile('arrived.md');
  const pulled = await alice.call(API + 'pull', 'POST', {});
  expect(pulled.body.ok).toBe(true);
  const copy = copyFolder(fixture.ws, alice.principal.key, REPO);
  expect(gitOutput(copy, ['ls-files', 'arrived.md']).text).toBe('arrived.md');
  // Any other branch without an upstream pulls its own name, which the remote does not have.
  const switched = await alice.call(API + 'switch', 'POST', { branch: 'feature', create: true });
  expect(switched.status).toBe(200);
  expect((await alice.call(API + 'status')).body.pullSource).toBeUndefined();
  const elsewhere = await alice.call(API + 'pull', 'POST', {});
  expect(elsewhere.body.ok).toBe(false);
});

test('Push main sends the published default branch, for Stewards and Admins only', async () => {
  using fixture = await authWorkspace();
  const base = join(fixture.ws.layout.projects, REPO);
  using remote = withRemote(base);
  const as = signedIn(fixture.ws);
  const frank = as(person('frank'));
  expect((await frank.call(API + 'push-default', 'POST', {})).status).toBe(403);
  const bob = as(person('bob'));
  expect((await openCopy(bob.call, REPO)).status).toBe(200);
  const copy = copyFolder(fixture.ws, bob.principal.key, REPO);
  writeFileSync(join(copy, 'steward.md'), 'Published by Bob.\n');
  expect((await bob.call(API + 'stage', 'POST', { paths: ['steward.md'] })).status).toBe(200);
  expect((await bob.call(API + 'commit', 'POST', { message: 'Add a note' })).status).toBe(200);
  expect((await bob.call(API + 'publish', 'POST', {})).status).toBe(200);
  const pushed = await bob.call(API + 'push-default', 'POST', {});
  expect(pushed.body.ok).toBe(true);
  const published = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
  expect(gitOutput(remote.bare, ['rev-parse', 'refs/heads/main']).text).toBe(published);
});

test('a Steward’s fetch moves the published default branch forward when the remote is ahead', async () => {
  using fixture = await authWorkspace();
  const base = join(fixture.ws.layout.projects, REPO);
  using remote = withRemote(base);
  const bob = signedIn(fixture.ws)(person('bob'));
  expect((await openCopy(bob.call, REPO)).status).toBe(200);
  const ahead = remote.pushFile('from-remote.md');
  const fetched = await bob.call(API + 'fetch', 'POST', {});
  expect(fetched.body.ok).toBe(true);
  expect(fetched.body.follow).toEqual({ branch: 'main', remote: 'origin', followed: true });
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(ahead);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).toBe(ahead);
  expect(fixture.ws.readFile(REPO, 'from-remote.md').source).toBe('from-remote.md\n');
});

test('a fetch leaves the published default branch alone when the remote has diverged', async () => {
  using fixture = await authWorkspace();
  const base = join(fixture.ws.layout.projects, REPO);
  using remote = withRemote(base);
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, REPO)).status).toBe(200);
  // A local commit on main that the remote never got, then a different one on the remote.
  const copy = copyFolder(fixture.ws, alice.principal.key, REPO);
  writeFileSync(join(copy, 'local.md'), 'Only here.\n');
  gitOutput(copy, ['add', 'local.md']);
  gitOutput(copy, [...IDENTITY, 'commit', '-q', '-m', 'Local']);
  const local = gitOutput(copy, ['rev-parse', 'HEAD']).text;
  gitOutput(base, ['update-ref', 'refs/heads/main', local]);
  gitOutput(base, ['checkout', '-q', '--force', '--detach', 'refs/heads/main']);
  remote.pushFile('diverged.md');
  expect((await alice.call(API + 'fetch', 'POST', {})).body.ok).toBe(true);
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(local);
});

test('an Editor’s fetch leaves the published default branch behind the remote', async () => {
  using fixture = await authWorkspace();
  const base = join(fixture.ws.layout.projects, REPO);
  using remote = withRemote(base);
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, REPO)).status).toBe(200);
  const before = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
  remote.pushFile('from-remote.md');
  const fetched = await alice.call(API + 'fetch', 'POST', {});
  expect(fetched.body.ok).toBe(true);
  expect(fetched.body.follow).toEqual({
    branch: 'main',
    remote: 'origin',
    followed: false,
    reason: 'publish',
  });
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(before);
});

test('a Steward’s fetch does not bring in a remote commit the guards refuse', async () => {
  using fixture = await authWorkspace();
  const metrics = 'sales-metrics';
  const base = join(fixture.ws.layout.projects, metrics);
  using remote = withRemote(base);
  const bob = signedIn(fixture.ws)(person('bob'));
  expect((await openCopy(bob.call, metrics)).status).toBe(200);
  const before = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
  // Someone made Bob the owner of a metric and approved it; Bob may not approve his own.
  remote.pushEdit('sales.semantic.yaml', text =>
    text.replace(
      '"owner": "alice@example.org", "status": "proposed"',
      '"owner": "bob@example.org", "status": "approved"',
    ),
  );
  const fetched = await bob.call(`/api/projects/${metrics}/git/fetch`, 'POST', {});
  expect(fetched.body.ok).toBe(true);
  expect(fetched.body.follow.followed).toBe(false);
  expect(fetched.body.follow.reason).toBe('guard');
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(before);
});
