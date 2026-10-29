import { expect, test } from 'bun:test';
import { authEnvironment, authProcessEnvironment } from '../../scripts/auth-environment';
import { assertNoCredentials, assertPerson, authViewports } from '../../scripts/helpers/sign-in';
import { assertAgentCredentials, keycloakArguments, keycloakImage, keycloakRealm, validDiscovery } from '../../scripts/auth-keycloak-check';
import { serverContainerArguments } from '../../scripts/auth-container-check';
import { TEST_USERS } from '../helpers/auth-identities';

const url = 'http://127.0.0.1:49152';

test('server environment and container arguments stay on host loopback with isolated storage', () => {
  const environment = authEnvironment('/tmp/auth-fixture', url, { kind: 'entra', issuer: 'http://127.0.0.1:49153', graphUrl: 'http://127.0.0.1:49153/graph' }, 'per-run-development-key');
  expect(environment.SW_PUBLIC_URL).toBe(url);
  expect(environment.SW_PORT).toBe('49152');
  expect(environment.SW_SERVE_STATIC).toBe('1');
  for (const engine of ['docker', 'podman'] as const) {
    const args = serverContainerArguments(engine, { image: 'image', name: 'name', root: '/tmp/auth' }, environment);
    expect(args.slice(args.indexOf('--network'), args.indexOf('--network') + 2)).toEqual(['--network', 'host']);
    expect(args).toContain('DATA_DIR=/data');
    expect(args).toContain('SW_SESSION_KEY=per-run-development-key');
    expect(args.includes('--userns')).toBe(engine === 'podman');
  }
});

test('Keycloak uses a pinned instance, loopback publication and read-only realm', () => {
  const args = keycloakArguments('docker', 'provider', 49153, '/tmp/realm.json');
  expect(args).toContain('127.0.0.1:49153:8080');
  expect(args).toContain('/tmp/realm.json:/opt/keycloak/data/import/workbench.json:ro');
  expect(args).toContain(keycloakImage);
  expect(args.slice(-2)).toEqual(['start-dev', '--import-realm']);
  const client = keycloakRealm(url).clients.find(entry => entry.clientId === 'semantic-workbench')!;
  expect(client.redirectUris).toEqual([url + '/auth/callback']);
  expect(client.attributes!['post.logout.redirect.uris']).toBe(url + '/auth/signed-out');
  expect(keycloakRealm('http://127.0.0.1:50000').clients).not.toEqual(keycloakRealm(url).clients);
  expect(validDiscovery({ issuer: url, authorization_endpoint: url + '/authorize' }, url)).toBe(true);
  expect(validDiscovery({ issuer: 'other', authorization_endpoint: url + '/authorize' }, url)).toBe(false);
  expect(validDiscovery({}, url)).toBe(false);
  expect(() => assertAgentCredentials({ token_type: 'Bearer', access_token: 'test-token' })).not.toThrow();
  expect(() => assertAgentCredentials({ token_type: 'Bearer' })).toThrow();
  expect(() => assertAgentCredentials({ token_type: 'other', access_token: 'test-token' })).toThrow();
});

test('parsed identity assertions reject app-role substitution and leaked credentials', () => {
  const alice = { name: TEST_USERS.alice.name, roleSources: [{ roleId: 'editor', via: 'group' }] };
  expect(() => assertPerson(alice, 'alice')).not.toThrow();
  expect(() => assertPerson({ ...alice, roleSources: [] }, 'alice')).toThrow();
  expect(() => assertPerson({ name: TEST_USERS.bob.name, roleSources: [{ roleId: 'steward', via: 'email' }] }, 'bob')).not.toThrow();
  expect(() => assertNoCredentials({ access_token: 'secret' })).toThrow();
  expect(() => assertNoCredentials({ value: 'eyJabc.eyJdef.signature' })).toThrow();
  expect(() => assertNoCredentials({ csrf: 'form-token' })).not.toThrow();
  expect(authViewports).toEqual([
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]);
});

test('disposable APIs cannot inherit a real provider or managed identity setting', () => {
  expect(
    authProcessEnvironment(
      {
        PATH: '/bin',
        SW_OIDC_CLIENT_ASSERTION: 'managed-identity',
        SW_GRAPH_URL: 'https://graph.microsoft.com',
        CONTAINER_APP_REVISION: 'production',
        DATA_DIR: '/real-workspace',
      },
      { SW_MODE: 'local', DATA_DIR: '/tmp/fixture' },
    ),
  ).toEqual({ PATH: '/bin', SW_MODE: 'local', DATA_DIR: '/tmp/fixture' });
});
