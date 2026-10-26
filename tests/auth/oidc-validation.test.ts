// Validates signed provider responses using the mock's token logic without opening sockets.
import { expect, test } from 'bun:test';
import { oidcTransport } from '../helpers/oidc-transport';
import { mkdtempSync, rmSync } from 'node:fs';
import { createAttemptStore, ATTEMPT_TTL_SECONDS } from '../../src/server/auth/attempts';
import { createOidcClient } from '../../src/server/auth/oidc';

for (const [label, claims] of [
  ['issuer', { iss: 'https://wrong.example' }],
  ['audience', { aud: 'other-client' }],
  ['nonce', { nonce: 'other-attempt' }],
  ['tenant', { tid: 'other-tenant' }],
  ['expiry', { exp: Math.floor(Date.now() / 1000) - 301 }],
] as const) {
  test('rejects wrong ' + label, async () => {
    const transport = await oidcTransport();
    transport.changeClaims(claims);
    const client = await createOidcClient(transport.config, { fetch: transport.fetch });
    const login = await client.login('/');
    const completion = client.callback(transport.authorize(login.url), login.attempt);
    await expect(completion).rejects.toThrow();
    const reasons = {
      issuer: 'token-invalid',
      audience: 'token-invalid',
      nonce: 'attempt-invalid',
      tenant: 'tenant-mismatch',
      expiry: 'token-invalid',
    };
    await expect(completion).rejects.toMatchObject({ reason: reasons[label] });
  });
}

test('checks signature, state, PKCE and the ten-minute attempt lifetime', async () => {
  for (const fault of ['signature', 'state', 'verifier', 'expired'] as const) {
    const transport = await oidcTransport();
    const client = await createOidcClient(transport.config, { fetch: transport.fetch });
    const login = await client.login('/');
    const callback = transport.authorize(login.url);
    if (fault === 'signature') transport.breakSignature();
    if (fault === 'state') login.attempt.state = 'wrong';
    if (fault === 'verifier') login.attempt.verifier = 'wrong';
    if (fault === 'expired') login.attempt.issuedAt -= ATTEMPT_TTL_SECONDS * 1000;
    const directory = mkdtempSync('/tmp/oidc-attempt-');
    try {
      const attempts = createAttemptStore(new Uint8Array(32), directory);
      const complete = async () =>
        client.callback(callback, attempts.consume(attempts.encode(login.attempt)));
      const completion = complete();
      await expect(completion).rejects.toThrow();
      await expect(completion).rejects.toMatchObject({
        reason: fault === 'signature' ? 'token-invalid' : 'attempt-invalid',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test('accepts 300-second skew and refreshes groups and address with rotated keys', async () => {
  const transport = await oidcTransport();
  transport.changeClaims({ exp: Math.floor(Date.now() / 1000) - 290 });
  const client = await createOidcClient(transport.config, { fetch: transport.fetch });
  const login = await client.login('/');
  const first = await client.callback(transport.authorize(login.url), login.attempt);
  expect(first.principal.groups.length).toBeGreaterThan(0);
  transport.changeClaims({});
  transport.state.users.alice.groups = [];
  transport.state.users.alice.email = 'changed@example.org';
  transport.state.activeKey = 1;
  const refreshed = await client.refresh(first.tokens);
  expect(refreshed.principal.groups).toEqual([]);
  expect(refreshed.principal.verifiedEmail).toBe('changed@example.org');
});
