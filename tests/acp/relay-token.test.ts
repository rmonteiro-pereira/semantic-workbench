// A successful HTTP status cannot turn an incomplete token reply into relay authority.
import { expect, test } from 'bun:test';
import { exchangeCredential } from '../../scripts/acp-relay-token';

const valid = { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 600, token_type: 'Bearer' };

test('a complete supported token response is accepted without exposing the setup credential', async () => {
  const requests: RequestInit[] = [];
  const request = async (_input: unknown, init: RequestInit) => {
    requests.push(init);
    return Response.json(valid);
  };
  const token = await exchangeCredential('https://workbench.test', 'setup-credential', request);
  expect(token?.current()).toBe('access-token');
  expect((requests[0].body as URLSearchParams).get('setup_credential')).toBe('setup-credential');
  expect(requests[0].signal).toBeInstanceOf(AbortSignal);
});

test('missing identifiers, unknown token types and unsupported success statuses are refused', async () => {
  for (const body of [
    { ...valid, access_token: '' },
    { ...valid, refresh_token: 42 },
    { ...valid, token_type: 'other' },
    { ...valid, expires_in: '600' },
    { ...valid, expires_in: 0 },
  ]) {
    expect(await exchangeCredential('https://workbench.test', 'setup', async () => Response.json(body))).toBeUndefined();
  }
  expect(await exchangeCredential('https://workbench.test', 'setup', async () => Response.json(valid, { status: 202 }))).toBeUndefined();
});
