// Server-mode commits are written for the signed-in person and committed by the service.
import { expect, test } from 'bun:test';
import { authorship, SERVICE_COMMITTER } from '../../server/projects/git';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { copyFolder, gitOutput, openCopy, saveText, signedIn } from './working-copy-fixture';

const ORDERS = 'orders.odcs.yaml';
const LAST_COMMIT = '--format=%an%n%ae%n%cn%n%ce%n%(trailers:key=Signed-in-user,valueonly)';

function lastCommit(folder: string) {
  const [author, authorEmail, committer, committerEmail, trailer] = gitOutput(folder, [
    'log',
    '-1',
    LAST_COMMIT,
  ]).text.split('\n');
  return { author, authorEmail, committer, committerEmail, trailer };
}

test('a commit has the person as author, the service as committer and their id as trailer', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  await saveText(alice.call, 'sales-contracts', ORDERS, text => text + '# chosen file\n');
  const chosen = await alice.call('/api/projects/sales-contracts/git/commit', 'POST', {
    message: 'Commit one chosen file',
    paths: [ORDERS],
  });
  expect(chosen.status).toBe(200);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  const expected = {
    author: 'Alice Andrade',
    authorEmail: 'alice@example.org',
    committer: SERVICE_COMMITTER.name,
    committerEmail: SERVICE_COMMITTER.email,
    trailer: alice.principal.id,
  };
  expect(lastCommit(copy)).toEqual(expected);
  // Committing the staged index takes the same identity.
  await saveText(alice.call, 'sales-contracts', ORDERS, text => text + '# staged file\n');
  await alice.call('/api/projects/sales-contracts/git/stage', 'POST', { paths: [ORDERS] });
  const staged = await alice.call('/api/projects/sales-contracts/git/commit', 'POST', {
    message: 'Commit the index',
  });
  expect(staged.status).toBe(200);
  expect(lastCommit(copy)).toEqual(expected);
});

test('a merge from the default branch is authored by the person who pulls', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const bob = as(person('bob'));
  const frank = as(person('frank'));
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  await saveText(bob.call, 'sales-contracts', ORDERS, text => text + '# published\n');
  await bob.call('/api/projects/sales-contracts/git/commit', 'POST', {
    message: 'Publish orders',
    paths: [ORDERS],
  });
  expect((await bob.call('/api/projects/sales-contracts/git/publish', 'POST', {})).status).toBe(
    200,
  );
  const pulled = await frank.call('/api/projects/sales-contracts/git/pull-default', 'POST', {});
  expect(pulled.body.ok).toBe(true);
  const copy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(lastCommit(copy)).toMatchObject({
    author: 'Frank Freitas',
    committer: SERVICE_COMMITTER.name,
    trailer: frank.principal.id,
  });
});

test('identity settings and the credential helper are not offered in server mode', async () => {
  using fixture = await authWorkspace();
  const dave = signedIn(fixture.ws)(person('dave'));
  const routes = [
    ['/api/projects/sales-contracts/git/identity', 'GET'],
    ['/api/projects/sales-contracts/git/identity', 'PUT'],
    ['/api/git/credential-helper', 'GET'],
  ] as const;
  for (const [path, method] of routes) {
    const body = method === 'PUT' ? { name: 'Someone', email: 'someone@example.org' } : undefined;
    expect((await dave.call(path, method, body)).status, `${method} ${path}`).toBe(404);
  }
});

test('provider names cannot add lines to the commit headers', () => {
  const signed = authorship({
    name: 'Alice\nCommitter: forged',
    email: 'alice@example.org\r',
    id: 'tenant:object\nSigned-in-user: someone-else',
  });
  expect(signed.env).toEqual({
    GIT_AUTHOR_NAME: 'AliceCommitter: forged',
    GIT_AUTHOR_EMAIL: 'alice@example.org',
  });
  expect(signed.trailer).toEqual([
    '--trailer',
    'Signed-in-user: tenant:objectSigned-in-user: someone-else',
  ]);
  expect(signed.config).toEqual([
    '-c',
    `user.name=${SERVICE_COMMITTER.name}`,
    '-c',
    `user.email=${SERVICE_COMMITTER.email}`,
  ]);
  expect(authorship()).toEqual({ config: [], env: {}, trailer: [] });
});
