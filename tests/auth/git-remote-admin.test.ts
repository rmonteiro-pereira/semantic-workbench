// Setting or removing a project's Git remote is an Admin action in server mode.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { bareRepository } from '../helpers/git-fixtures';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { accessFixture, person } from './access-fixture';

const origin = 'http://127.0.0.1:4310';
const remotePath = '/api/projects/sales-contracts/git/remote';

function remoteRequest(method: 'PUT' | 'DELETE', body: unknown) {
  return new Request(origin + remotePath, {
    method,
    headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function handlerFor(name: 'alice' | 'dave') {
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const handler = createHandler(fixture.ws, {
    mode: 'server',
    remoteCredentials: allowEveryRemote(),
    publicOrigin: origin,
    access,
    principal: () => access.principalFor(person(name)),
  });
  return { fixture, handler };
}

test('a person who is not an Admin cannot set or remove a remote', async () => {
  const { fixture, handler } = await handlerFor('alice');
  using _fixture = fixture;
  const remote = bareRepository('single');
  try {
    const set = await handler(remoteRequest('PUT', { name: 'origin', url: remote.bare }));
    expect(set.status).toBe(403);
    const removed = await handler(remoteRequest('DELETE', { name: 'origin' }));
    expect(removed.status).toBe(403);
  } finally {
    remote.dispose();
  }
});

test('an Admin sets and removes a remote', async () => {
  const { fixture, handler } = await handlerFor('dave');
  using _fixture = fixture;
  const remote = bareRepository('single');
  try {
    const set = await handler(remoteRequest('PUT', { name: 'origin', url: remote.bare }));
    expect(set.status).toBe(200);
    const removed = await handler(remoteRequest('DELETE', { name: 'origin' }));
    expect(removed.status).toBe(200);
  } finally {
    remote.dispose();
  }
});
