// Checks platform assertion exchange and confidential-client choices without network calls.
import { expect, test } from 'bun:test';
import { managedIdentityAssertion } from '../../src/server/auth/managed-identity';

test('managed identity asks the platform only for the Azure token-exchange audience', async () => {
  let requested = '';
  let header = '';
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    requested = String(input);
    header = new Headers(init?.headers).get('X-IDENTITY-HEADER') ?? '';
    expect(init?.redirect).toBe('error');
    return Response.json({ access_token: 'assertion' });
  }) as typeof fetch;
  expect(
    await managedIdentityAssertion(
      {
        IDENTITY_ENDPOINT: 'http://127.0.0.1/identity',
        IDENTITY_HEADER: 'platform-secret',
      },
      request,
    ),
  ).toBe('assertion');
  expect(new URL(requested).searchParams.get('resource')).toBe('api://AzureADTokenExchange');
  expect(header).toBe('platform-secret');
  await expect(managedIdentityAssertion({}, request)).rejects.toThrow();
});

test('private-key and managed-identity assertions authenticate the token exchange', async () => {
  const { generateKeyPair, exportPKCS8, jwtVerify } = await import('jose');
  const { createOidcClient } = await import('../../src/server/auth/oidc');
  const { oidcTransport } = await import('../helpers/oidc-transport');
  const { tempDataDir } = await import('../helpers/temp-data-dir');
  const { TEST_WORKBENCH_CLIENT } = await import('../helpers/auth-identities');
  const fixture = tempDataDir('client-assertion-');
  try {
    const keys = await generateKeyPair('RS256', { extractable: true });
    const keyPath = fixture.root + '/client.pem';
    await Bun.write(keyPath, await exportPKCS8(keys.privateKey));
    for (const kind of ['private-key', 'managed-identity'] as const) {
      const transport = await oidcTransport();
      transport.config.oidc.clientAuth = kind === 'private-key' ? { kind, keyPath } : { kind };
      let exchanged = false;
      const client = await createOidcClient(transport.config, {
        assertion: async () => 'platform-assertion',
        fetch: async (url, init) => {
          if (!url.toString().endsWith('/token')) return transport.fetch(url, init);
          const parameters = new URLSearchParams(String(init.body));
          expect(parameters.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
          const assertion = parameters.get('client_assertion')!;
          if (kind === 'private-key') {
            const verified = await jwtVerify(assertion, keys.publicKey);
            expect(verified.payload.iss).toBe(transport.config.oidc.clientId);
            expect(verified.payload.sub).toBe(transport.config.oidc.clientId);
          } else expect(assertion).toBe('platform-assertion');
          exchanged = true;
          parameters.set('client_secret', TEST_WORKBENCH_CLIENT.secret);
          return transport.fetch(url, { ...init, body: parameters });
        },
      });
      const started = await client.login('/');
      const identity = await client.callback(transport.authorize(started.url), started.attempt);
      expect(identity.principal.name).toContain('Alice');
      expect(exchanged).toBe(true);
    }
  } finally {
    fixture.cleanup();
  }
});
