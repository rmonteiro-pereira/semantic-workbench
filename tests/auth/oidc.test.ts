// Runs the confidential-client flow only against the in-process provider.
import { expect, test } from 'bun:test';
import { startMockOidc } from '../helpers/mock-oidc';
import { oidcConfig } from '../helpers/server-auth';
import { createOidcClient } from '../../server/auth/oidc';
import { safeReturnTo } from '../../server/auth/attempts';

test('return destinations cannot leave the origin', () => {
  for (const value of [
    '//evil.example',
    'https://evil.example',
    '/a/..//evil.example',
    '/%2e%2e//evil.example',
    '/\\evil.example',
  ]) {
    expect(safeReturnTo(value)).toBe('/');
  }
  expect(safeReturnTo('/catalog?q=one')).toBe('/catalog?q=one');
});

for (const shape of ['entra', 'keycloak'] as const) {
  test(shape + ' checks PKCE, state, nonce, rotates keys and refreshes identity', async () => {
    const provider = await startMockOidc({ shape });
    try {
      const client = await createOidcClient(oidcConfig(provider.issuer, provider.graphUrl, shape));
      const attempt = await client.login('/catalog');
      const url = new URL(attempt.url);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('nonce')).toBeTruthy();
      const callback = await provider.authorizeAs('alice', attempt.url);
      const tokens = await client.callback(new URL(callback), attempt.attempt);
      expect(tokens.principal.name).toContain('Alice');
      provider.setUserGroups('alice', []);
      provider.rotateKeys();
      const refreshed = await client.refresh(tokens.tokens);
      expect(refreshed.principal.groups).toEqual([]);
      expect(client.logout()).toContain('post_logout_redirect_uri=');
      const wrong = await client.login('/');
      const wrongCallback = await provider.authorizeAs('alice', wrong.url);
      await expect(
        client.callback(new URL(wrongCallback), {
          ...wrong.attempt,
          nonce: 'wrong',
        }),
      ).rejects.toThrow();
      const badState = await client.login('/');
      const stateCallback = new URL(await provider.authorizeAs('alice', badState.url));
      stateCallback.searchParams.set('state', 'wrong');
      await expect(client.callback(stateCallback, badState.attempt)).rejects.toThrow();
    } finally {
      await provider.stop();
    }
  });
}
