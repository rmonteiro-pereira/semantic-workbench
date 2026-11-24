import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createSessionStore } from '../../src/server/auth/sessions';
import { localPrincipal } from '../../src/server/auth/principal';
import { createRemoteCredentials } from '../../src/server/auth/remote-credentials';
import { requestSession, type AccessRequest } from '../../src/server/auth/request-scope';
import { sessionReferenceOf } from '../../src/server/connections/connection-service';
import { testWorkspace } from '../helpers/temp-data-dir';
import { oidcTransport } from '../helpers/oidc-transport';

test('delegated Git credentials persist through a reference-only session without a cookie or idle extension', async () => {
  using fixture = await testWorkspace();
  const transport = await oidcTransport('keycloak');
  let now = 1000;
  const settings = { remote: { allowedHosts: ['dev.azure.com'], azureDevOpsObo: true } };
  const dir = join(fixture.root, 'sessions');
  const options = { dir, key: new Uint8Array(32).fill(7), now: () => now };
  const sessions = createSessionStore(options);
  const session = await sessions.create({ principal: localPrincipal(), tokens: { accessToken: 'provider-access', expiresAt: 9e15 } });
  now += 1000;
  const restarted = createSessionStore(options);
  const delegated = await restarted.getByReference(sessionReferenceOf(session.id));
  expect(delegated?.id).toBe('');
  let exchanges = 0;
  const credentials = createRemoteCredentials({
    config: { ...transport.config, adoOnBehalfOf: true },
    client: {
      onBehalfOf: async () => {
        exchanges++;
        return { token: 'delegated-git', expiresAt: now + 3600000 };
      },
    },
    session: async () => {
      throw new Error('Cookie lookup must not run');
    },
    sessions: restarted,
    settings: () => settings as never,
    now: () => now,
    log: () => {},
  });
  const request = new Request('http://operation.internal/api/projects/sales/git/fetch') as AccessRequest;
  request[requestSession] = delegated;
  expect(await credentials.credentialFor(request, 'dev.azure.com')).toMatchObject({ token: 'delegated-git' });
  const reloaded = await createSessionStore(options).getByReference(sessionReferenceOf(session.id));
  expect(reloaded?.remote?.azureDevOps?.token).toBe('delegated-git');
  expect(reloaded?.lastSeenAt).toBe(session.lastSeenAt);
  expect(exchanges).toBe(1);
  await restarted.end(session.id);
  expect(await restarted.updateRemoteByReference(sessionReferenceOf(session.id), remote => remote)).toBeNull();
});
